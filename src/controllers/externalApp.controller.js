/**
 * External App API Controller
 * Refactored to use modern error handling and validators
 *
 * Provides API endpoints for external mobile/web apps using API key authentication
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

/**
 * Get products for the authenticated app
 * GET /api/app/:appCode/products
 */
exports.getProducts = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.appContext;

  const result = await db.query(`
    SELECT
      p.product_id,
      p.product_name,
      p.points,
      p.stock_quantity,
      p.created_at,
      p.updated_at
    FROM products p
    WHERE p.tenant_id = $1 AND p.verification_app_id = $2
    ORDER BY p.product_name ASC
  `, [tenantId, verificationAppId]);

  return sendSuccess(res, {
    data: result.rows,
    count: result.rows.length
  });
});

/**
 * Get user's credit balance
 * GET /api/app/:appCode/users/:userId/credits
 */
exports.getUserCredits = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { tenantId } = req.appContext;

  // Get or create user credit account
  let result = await db.query(
    `SELECT balance, created_at, updated_at
     FROM user_credits
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  if (result.rows.length === 0) {
    // Create initial credit account
    result = await db.query(
      `INSERT INTO user_credits (user_id, tenant_id, balance)
       VALUES ($1, $2, 0)
       RETURNING balance, created_at, updated_at`,
      [userId, tenantId]
    );
  }

  return sendSuccess(res, {
    data: {
      user_id: parseInt(userId),
      balance: result.rows[0].balance,
      created_at: result.rows[0].created_at,
      updated_at: result.rows[0].updated_at
    }
  });
});

/**
 * Get user's credit transaction history
 * GET /api/app/:appCode/users/:userId/credit-transactions?limit=50&offset=0
 */
exports.getUserCreditTransactions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { tenantId, verificationAppId } = req.appContext;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  // Only show transactions for this app
  const result = await db.query(
    `SELECT
      transaction_id,
      transaction_type,
      amount,
      balance_after,
      description,
      verification_app_id,
      created_at
    FROM user_credit_transactions
    WHERE user_id = $1 AND tenant_id = $2 AND verification_app_id = $3
    ORDER BY created_at DESC
    LIMIT $4 OFFSET $5`,
    [userId, tenantId, verificationAppId, limit, offset]
  );

  // Get total count for pagination
  const countResult = await db.query(
    `SELECT COUNT(*) as total
     FROM user_credit_transactions
     WHERE user_id = $1 AND tenant_id = $2 AND verification_app_id = $3`,
    [userId, tenantId, verificationAppId]
  );

  return sendSuccess(res, {
    data: result.rows,
    pagination: {
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
      hasMore: offset + limit < parseInt(countResult.rows[0].total)
    }
  });
});

/**
 * Record a coupon scan and add credits to user
 * POST /api/app/:appCode/scans
 * Body: { user_id, coupon_code, points }
 */
exports.recordScan = asyncHandler(async (req, res) => {
  const { user_id, coupon_code, points } = req.body;
  const { verificationAppId, tenantId } = req.appContext;

  validateRequiredFields(req.body, ['user_id', 'coupon_code', 'points']);

  if (points <= 0) {
    throw new ValidationError('Points must be greater than 0');
  }

  const result = await executeTransaction(db, async (client) => {
    // Verify coupon exists and belongs to this app
    const couponResult = await client.query(
      `SELECT coupon_id, is_scanned, verification_app_id
       FROM coupons
       WHERE coupon_code = $1 AND tenant_id = $2`,
      [coupon_code, tenantId]
    );

    if (couponResult.rows.length === 0) {
      throw new NotFoundError('Coupon');
    }

    const coupon = couponResult.rows[0];

    // Verify coupon belongs to this app
    if (coupon.verification_app_id !== verificationAppId) {
      throw new ForbiddenError('This coupon belongs to a different application');
    }

    // Check if already scanned
    if (coupon.is_scanned) {
      throw new ValidationError('This coupon has already been scanned', 'already_scanned');
    }

    // Mark coupon as scanned
    await client.query(
      `UPDATE coupons
       SET is_scanned = true,
           scanned_at = NOW(),
           scanned_by = $1
       WHERE coupon_id = $2`,
      [user_id, coupon.coupon_id]
    );

    // Get or create user credit account
    let creditResult = await client.query(
      `SELECT balance FROM user_credits
       WHERE user_id = $1 AND tenant_id = $2`,
      [user_id, tenantId]
    );

    let currentBalance;
    if (creditResult.rows.length === 0) {
      // Create new account
      creditResult = await client.query(
        `INSERT INTO user_credits (user_id, tenant_id, balance)
         VALUES ($1, $2, 0)
         RETURNING balance`,
        [user_id, tenantId]
      );
      currentBalance = 0;
    } else {
      currentBalance = creditResult.rows[0].balance;
    }

    // Add credits
    const newBalance = currentBalance + points;
    await client.query(
      `UPDATE user_credits
       SET balance = $1, updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [newBalance, user_id, tenantId]
    );

    // Record transaction
    const transactionResult = await client.query(
      `INSERT INTO user_credit_transactions
        (user_id, tenant_id, verification_app_id, transaction_type, amount, balance_after, description)
       VALUES ($1, $2, $3, 'earn', $4, $5, $6)
       RETURNING transaction_id, created_at`,
      [
        user_id,
        tenantId,
        verificationAppId,
        points,
        newBalance,
        `Earned ${points} points from scanning coupon ${coupon_code}`
      ]
    );

    return {
      transaction_id: transactionResult.rows[0].transaction_id,
      user_id: parseInt(user_id),
      points_earned: points,
      new_balance: newBalance,
      coupon_code,
      scanned_at: transactionResult.rows[0].created_at
    };
  });

  return sendSuccess(res, { data: result }, 'Scan recorded successfully');
});

/**
 * Redeem credits for a product
 * POST /api/app/:appCode/redeem
 * Body: { user_id, product_id }
 */
exports.redeemProduct = asyncHandler(async (req, res) => {
  const { user_id, product_id } = req.body;
  const { verificationAppId, tenantId } = req.appContext;

  validateRequiredFields(req.body, ['user_id', 'product_id']);

  const result = await executeTransaction(db, async (client) => {
    // Get product details and verify it belongs to this app
    const productResult = await client.query(
      `SELECT product_id, product_name, points, stock_quantity, verification_app_id
       FROM products
       WHERE product_id = $1 AND tenant_id = $2`,
      [product_id, tenantId]
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundError('Product');
    }

    const product = productResult.rows[0];

    // Verify product belongs to this app
    if (product.verification_app_id !== verificationAppId) {
      throw new ForbiddenError('This product belongs to a different application');
    }

    // Check stock
    if (product.stock_quantity <= 0) {
      throw new ValidationError('Product is out of stock', 'out_of_stock');
    }

    // Get user's credit balance
    const creditResult = await client.query(
      `SELECT balance FROM user_credits
       WHERE user_id = $1 AND tenant_id = $2`,
      [user_id, tenantId]
    );

    if (creditResult.rows.length === 0) {
      throw new ValidationError('User has no credit account', 'no_credit_account');
    }

    const currentBalance = creditResult.rows[0].balance;

    // Check if user has enough credits
    if (currentBalance < product.points) {
      throw new ValidationError('Insufficient credits', 'insufficient_credits', {
        required: product.points,
        available: currentBalance,
        shortfall: product.points - currentBalance
      });
    }

    // Deduct credits
    const newBalance = currentBalance - product.points;
    await client.query(
      `UPDATE user_credits
       SET balance = $1, updated_at = NOW()
       WHERE user_id = $2 AND tenant_id = $3`,
      [newBalance, user_id, tenantId]
    );

    // Record transaction
    const transactionResult = await client.query(
      `INSERT INTO user_credit_transactions
        (user_id, tenant_id, verification_app_id, transaction_type, amount, balance_after, description)
       VALUES ($1, $2, $3, 'spend', $4, $5, $6)
       RETURNING transaction_id, created_at`,
      [
        user_id,
        tenantId,
        verificationAppId,
        product.points,
        newBalance,
        `Redeemed ${product.product_name}`
      ]
    );

    // Decrement stock
    await client.query(
      `UPDATE products
       SET stock_quantity = stock_quantity - 1
       WHERE product_id = $1`,
      [product_id]
    );

    return {
      transaction_id: transactionResult.rows[0].transaction_id,
      user_id: parseInt(user_id),
      product_id: parseInt(product_id),
      product_name: product.product_name,
      points_spent: product.points,
      new_balance: newBalance,
      redeemed_at: transactionResult.rows[0].created_at
    };
  });

  return sendSuccess(res, { data: result }, 'Product redeemed successfully');
});
