/**
 * Cashback Service
 * Handles customer cashback operations (scan, UPI, retry, history, balance)
 */

const db = require('../config/database');
const { executeTransaction } = require('../modules/common/utils/database.util');
const { ValidationError, NotFoundError, ConflictError, UnprocessableError } = require('../modules/common/errors/AppError');
const { initiateUpiPayout } = require('./paymentGateway.service');

/**
 * Validate UPI ID format
 */
const validateUpiId = (upiId) => {
  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/;
  if (!upiRegex.test(upiId)) {
    throw new ValidationError('Invalid UPI ID format. Expected format: username@bankname');
  }
};

/**
 * Scan a coupon for cashback — instant UPI payout.
 *
 * Flow:
 *  1. Fetch primary UPI — abort with 422 BEFORE touching the coupon if none
 *  2. DB transaction: validate coupon, mark USED, create PROCESSING transaction → COMMIT
 *  3. Call payment gateway AFTER commit (coupon already consumed; crash = PROCESSING stuck)
 *  4. Update transaction to COMPLETED or FAILED based on gateway response
 *
 * Never throws on gateway failure — always returns { success, status, transaction_id }
 */
const scanCoupon = async (customerId, tenantId, couponCode) => {
  // Step 1: require primary UPI before touching the coupon
  const upiRes = await db.query(
    `SELECT upi_id FROM customer_upi_details
     WHERE customer_id = $1 AND tenant_id = $2 AND is_primary = true
     LIMIT 1`,
    [customerId, tenantId]
  );

  if (upiRes.rows.length === 0) {
    throw new UnprocessableError('No UPI ID registered. Please add a UPI ID before scanning.', 'ADD_UPI');
  }

  const upiId = upiRes.rows[0].upi_id;

  // Step 2: atomic DB transaction — mark coupon USED + create PROCESSING transaction
  let transactionId;
  let cashbackAmount;

  await executeTransaction(db, async (client) => {
    const couponRes = await client.query(
      `SELECT id, coupon_code, status, coupon_points, cashback_amount
       FROM coupons
       WHERE coupon_code = $1 AND tenant_id = $2
       FOR UPDATE`,
      [couponCode, tenantId]
    );

    if (couponRes.rows.length === 0) {
      throw new NotFoundError('Coupon not found');
    }

    const coupon = couponRes.rows[0];

    if (coupon.status !== 'active') {
      throw new ConflictError('Coupon has already been used or is inactive');
    }

    cashbackAmount = parseFloat(coupon.cashback_amount || coupon.coupon_points || 0);
    if (cashbackAmount <= 0) {
      throw new ValidationError('Coupon has no cashback value configured');
    }

    if (cashbackAmount > 1000) {
      console.warn(`[Cashback] Unusually high cashback: ${cashbackAmount} for coupon ${couponCode}`);
    }

    await client.query(
      `UPDATE coupons
       SET status = 'used', scanned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [coupon.id]
    );

    const txRes = await client.query(
      `INSERT INTO cashback_transactions
         (customer_id, tenant_id, coupon_code, amount, upi_id, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'PROCESSING', $6)
       RETURNING id`,
      [customerId, tenantId, couponCode, cashbackAmount, upiId,
       JSON.stringify({ coupon_id: coupon.id })]
    );

    transactionId = txRes.rows[0].id;
  });

  // Step 3: call gateway after DB commit
  try {
    const gatewayResult = await initiateUpiPayout({
      amount: cashbackAmount,
      upiId,
      referenceId: transactionId,
      remarks: `Cashback for coupon ${couponCode}`
    });

    await db.query(
      `UPDATE cashback_transactions
       SET status = 'COMPLETED',
           gateway_transaction_id = $1,
           payout_reference = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [gatewayResult.transactionId, gatewayResult.payoutReference, transactionId]
    );

    return {
      success: true,
      cashback_amount: cashbackAmount,
      upi_id: upiId,
      status: 'COMPLETED',
      transaction_id: transactionId
    };
  } catch (gatewayErr) {
    const failureReason = gatewayErr.message || 'Payment gateway error';
    const gatewayCode = gatewayErr.gatewayCode || null;

    await db.query(
      `UPDATE cashback_transactions
       SET status = 'FAILED',
           failure_reason = $1,
           metadata = metadata || $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [failureReason, JSON.stringify({ gateway_error_code: gatewayCode }), transactionId]
    );

    return {
      success: false,
      cashback_amount: cashbackAmount,
      upi_id: upiId,
      status: 'FAILED',
      transaction_id: transactionId,
      error: 'Payout failed. You can retry using your transaction ID.'
    };
  }
};

/**
 * Retry a FAILED cashback payout.
 * The coupon is already USED — only the payout is retried.
 * Optionally accepts a new UPI ID to use for the retry.
 */
const retryCashback = async (transactionId, customerId, tenantId, newUpiId = null) => {
  const txRes = await db.query(
    `SELECT id, amount, upi_id, coupon_code, status
     FROM cashback_transactions
     WHERE id = $1 AND customer_id = $2 AND tenant_id = $3`,
    [transactionId, customerId, tenantId]
  );

  if (txRes.rows.length === 0) {
    throw new NotFoundError('Transaction not found');
  }

  const tx = txRes.rows[0];

  if (tx.status !== 'FAILED') {
    throw new ValidationError('Only FAILED transactions can be retried');
  }

  const upiId = newUpiId || tx.upi_id;
  if (newUpiId) {
    validateUpiId(newUpiId);
  }

  await db.query(
    `UPDATE cashback_transactions
     SET status = 'PROCESSING', upi_id = $1, failure_reason = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [upiId, transactionId]
  );

  const cashbackAmount = parseFloat(tx.amount);

  try {
    const gatewayResult = await initiateUpiPayout({
      amount: cashbackAmount,
      upiId,
      referenceId: transactionId,
      remarks: `Cashback retry for coupon ${tx.coupon_code}`
    });

    await db.query(
      `UPDATE cashback_transactions
       SET status = 'COMPLETED',
           gateway_transaction_id = $1,
           payout_reference = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [gatewayResult.transactionId, gatewayResult.payoutReference, transactionId]
    );

    return {
      success: true,
      cashback_amount: cashbackAmount,
      upi_id: upiId,
      status: 'COMPLETED',
      transaction_id: transactionId
    };
  } catch (gatewayErr) {
    const failureReason = gatewayErr.message || 'Payment gateway error';
    const gatewayCode = gatewayErr.gatewayCode || null;

    await db.query(
      `UPDATE cashback_transactions
       SET status = 'FAILED',
           failure_reason = $1,
           metadata = metadata || $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [failureReason, JSON.stringify({ gateway_error_code: gatewayCode }), transactionId]
    );

    return {
      success: false,
      cashback_amount: cashbackAmount,
      upi_id: upiId,
      status: 'FAILED',
      transaction_id: transactionId,
      error: 'Payout failed. You can retry using your transaction ID.'
    };
  }
};

/**
 * Confirm public cashback session — instant payout.
 * Called from the public (no-app) confirm step after UPI has been collected.
 * Assumes coupon was validated and session verified in prior steps.
 */
const confirmPublicCashback = async ({ customerId, tenantId, couponId, couponCode, upiId, cashbackAmount, sessionId }) => {
  // Atomic DB tx: mark coupon USED + create PROCESSING transaction
  let transactionId;

  await executeTransaction(db, async (client) => {
    // Lock coupon to prevent double-confirm races
    const couponRes = await client.query(
      `SELECT id, status FROM coupons WHERE id = $1 FOR UPDATE`,
      [couponId]
    );

    if (couponRes.rows.length === 0 || couponRes.rows[0].status !== 'active') {
      throw new ConflictError('Coupon is no longer active');
    }

    await client.query(
      `UPDATE coupons
       SET status = 'used', scanned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [couponId]
    );

    const txRes = await client.query(
      `INSERT INTO cashback_transactions
         (customer_id, tenant_id, scan_session_id, coupon_code, amount, upi_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING')
       RETURNING id`,
      [customerId, tenantId, sessionId, couponCode, cashbackAmount, upiId]
    );

    transactionId = txRes.rows[0].id;

    await client.query(
      `UPDATE scan_sessions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [sessionId]
    );
  });

  // Call gateway after commit
  try {
    const gatewayResult = await initiateUpiPayout({
      amount: cashbackAmount,
      upiId,
      referenceId: transactionId,
      remarks: `Cashback for coupon ${couponCode}`
    });

    await db.query(
      `UPDATE cashback_transactions
       SET status = 'COMPLETED',
           gateway_transaction_id = $1,
           payout_reference = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [gatewayResult.transactionId, gatewayResult.payoutReference, transactionId]
    );

    return {
      success: true,
      cashback_amount: parseFloat(cashbackAmount),
      upi_id: upiId,
      status: 'COMPLETED',
      transaction_id: transactionId
    };
  } catch (gatewayErr) {
    const failureReason = gatewayErr.message || 'Payment gateway error';
    const gatewayCode = gatewayErr.gatewayCode || null;

    await db.query(
      `UPDATE cashback_transactions
       SET status = 'FAILED',
           failure_reason = $1,
           metadata = COALESCE(metadata, '{}') || $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [failureReason, JSON.stringify({ gateway_error_code: gatewayCode }), transactionId]
    );

    return {
      success: false,
      cashback_amount: parseFloat(cashbackAmount),
      upi_id: upiId,
      status: 'FAILED',
      transaction_id: transactionId,
      error: 'Payout failed. Use your transaction ID to retry.'
    };
  }
};

/**
 * Save UPI ID for a customer
 */
const saveUpiId = async (customerId, tenantId, upiId) => {
  validateUpiId(upiId);

  return executeTransaction(db, async (client) => {
    await client.query(
      'UPDATE customer_upi_details SET is_primary = false WHERE customer_id = $1 AND tenant_id = $2',
      [customerId, tenantId]
    );

    const result = await client.query(
      `INSERT INTO customer_upi_details (customer_id, tenant_id, upi_id, is_primary)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (customer_id, tenant_id, upi_id)
       DO UPDATE SET is_primary = true, updated_at = CURRENT_TIMESTAMP
       RETURNING id, upi_id, is_primary`,
      [customerId, tenantId, upiId]
    );

    return result.rows[0];
  });
};

/**
 * Get saved UPI details for a customer
 */
const getUpiDetails = async (customerId, tenantId) => {
  const result = await db.query(
    `SELECT id, upi_id, is_verified, is_primary, created_at
     FROM customer_upi_details
     WHERE customer_id = $1 AND tenant_id = $2
     ORDER BY is_primary DESC, created_at DESC`,
    [customerId, tenantId]
  );
  return result.rows;
};

/**
 * Get cashback transaction history
 */
const getCashbackHistory = async (customerId, tenantId, { page = 1, limit = 10, status = null, from = null, to = null }) => {
  const offset = (page - 1) * limit;
  const params = [customerId, tenantId];
  let whereClause = 'customer_id = $1 AND tenant_id = $2';

  if (status) {
    params.push(status.toUpperCase());
    whereClause += ` AND status = $${params.length}`;
  }
  if (from) {
    params.push(from);
    whereClause += ` AND created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    whereClause += ` AND created_at <= $${params.length}`;
  }

  const countRes = await db.query(
    `SELECT COUNT(*) as total FROM cashback_transactions WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].total);

  params.push(limit, offset);
  const dataRes = await db.query(
    `SELECT id, coupon_code, amount, upi_id, status, gateway_transaction_id, created_at
     FROM cashback_transactions
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { transactions: dataRes.rows, total };
};

/**
 * Get cashback balance summary
 */
const getCashbackBalance = async (customerId, tenantId) => {
  const result = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0) AS total_earned,
       COALESCE(SUM(CASE WHEN status = 'PROCESSING' THEN amount ELSE 0 END), 0) AS processing,
       COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed
     FROM cashback_transactions
     WHERE customer_id = $1 AND tenant_id = $2`,
    [customerId, tenantId]
  );

  const row = result.rows[0];
  return {
    total_earned: parseFloat(row.total_earned),
    processing: parseFloat(row.processing),
    failed: parseInt(row.failed)
  };
};

module.exports = {
  validateUpiId,
  scanCoupon,
  retryCashback,
  confirmPublicCashback,
  saveUpiId,
  getUpiDetails,
  getCashbackHistory,
  getCashbackBalance
};
