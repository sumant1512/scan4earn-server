/**
 * Batch Workflow Controller
 * Refactored to use modern error handling and validators
 *
 * Handles complete coupon batch creation workflow:
 * 1. Create batch (draft)
 * 2. Assign serial numbers
 * 3. Activate batch
 */

const db = require('../config/database');
const { generateCouponCode } = require('../utils/couponGenerator');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendCreated
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

/**
 * Step 1: Create Batch (Draft Status)
 * POST /api/tenant/batches
 */
const createBatch = asyncHandler(async (req, res) => {
  const { product_id, batch_name, dealer_name, zone, total_coupons } = req.body;
  const tenantId = req.user.tenant_id;

  validateRequiredFields(req.body, ['batch_name', 'dealer_name', 'zone', 'total_coupons']);

  if (total_coupons < 1 || total_coupons > 100000) {
    throw new ValidationError('total_coupons must be between 1 and 100,000');
  }

  // Verify verification app exists
  const appCheck = await db.query(
    'SELECT id FROM verification_apps WHERE id = $1 AND tenant_id = $2',
    [product_id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Product/Verification app');
  }

  // Create batch in draft status
  const result = await db.query(
    `INSERT INTO coupon_batches (
      tenant_id, verification_app_id, batch_name, dealer_name, zone,
      total_coupons, batch_status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'draft')
    RETURNING id, batch_name, dealer_name, zone, total_coupons, batch_status, created_at`,
    [tenantId, product_id, batch_name, dealer_name, zone, total_coupons]
  );

  return sendCreated(res, { batch: result.rows[0] }, 'Batch created successfully. Assign codes to continue.');
});

/**
 * Step 2: Assign Serial Numbers to Batch
 * POST /api/tenant/batches/:batch_id/assign-codes
 */
const assignSerialNumbers = asyncHandler(async (req, res) => {
  const { batch_id } = req.params;
  const { quantity } = req.body;
  const tenantId = req.user.tenant_id;

  const result = await executeTransaction(db, async (client) => {
    // Get batch details
    const batchResult = await client.query(
      `SELECT id, verification_app_id, total_coupons, batch_status
       FROM coupon_batches
       WHERE id = $1 AND tenant_id = $2`,
      [batch_id, tenantId]
    );

    if (batchResult.rows.length === 0) {
      throw new NotFoundError('Batch');
    }

    const batch = batchResult.rows[0];

    if (batch.batch_status !== 'draft') {
      throw new ValidationError('Codes already assigned to this batch');
    }

    const couponQuantity = quantity || batch.total_coupons;

    // Lock and get next serial number (prevents race condition)
    await client.query(
      'INSERT INTO serial_number_tracker (tenant_id, last_serial_number) VALUES ($1, 30000) ON CONFLICT (tenant_id) DO NOTHING',
      [tenantId]
    );

    const trackerResult = await client.query(
      'SELECT last_serial_number FROM serial_number_tracker WHERE tenant_id = $1 FOR UPDATE',
      [tenantId]
    );

    const lastSerial = trackerResult.rows[0].last_serial_number;
    const serialStart = lastSerial + 1;
    const serialEnd = lastSerial + couponQuantity;

    // Generate coupons with serial numbers
    const couponInserts = [];
    for (let i = 0; i < couponQuantity; i++) {
      const serialNumber = serialStart + i;
      const couponCode = generateCouponCode(serialNumber);

      couponInserts.push(
        client.query(
          `INSERT INTO coupons (
            tenant_id, verification_app_id, coupon_code, serial_number, batch_id,
            discount_type, discount_value, expiry_date, credit_cost, status
          ) VALUES ($1, $2, $3, $4, $5, 'fixed', 0, CURRENT_TIMESTAMP + INTERVAL '1 year', 0, 'generated')`,
          [tenantId, batch.verification_app_id, couponCode, serialNumber, batch_id]
        )
      );
    }

    await Promise.all(couponInserts);

    // Update batch with serial range
    await client.query(
      `UPDATE coupon_batches
       SET serial_number_start = $1, serial_number_end = $2, batch_status = 'code_assigned'
       WHERE id = $3`,
      [serialStart, serialEnd, batch_id]
    );

    // Update tracker
    await client.query(
      'UPDATE serial_number_tracker SET last_serial_number = $1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $2',
      [serialEnd, tenantId]
    );

    return {
      serial_number_start: serialStart,
      serial_number_end: serialEnd,
      coupons_generated: couponQuantity,
      batch_status: 'code_assigned'
    };
  });

  return sendSuccess(res, result, `Serial numbers ${result.serial_number_start} to ${result.serial_number_end} assigned successfully`);
});

/**
 * Step 3: Activate Batch (Mark as Printed)
 * POST /api/tenant/batches/:batch_id/activate
 */
const activateBatch = asyncHandler(async (req, res) => {
  const { batch_id } = req.params;
  const { note } = req.body;
  const tenantId = req.user.tenant_id;

  const result = await executeTransaction(db, async (client) => {
    // Get batch
    const batchResult = await client.query(
      'SELECT id, batch_status FROM coupon_batches WHERE id = $1 AND tenant_id = $2',
      [batch_id, tenantId]
    );

    if (batchResult.rows.length === 0) {
      throw new NotFoundError('Batch');
    }

    const batch = batchResult.rows[0];

    if (batch.batch_status !== 'code_assigned') {
      throw new ValidationError('Batch must have codes assigned before activation');
    }

    // Update all coupons to 'printed' status
    await client.query(
      `UPDATE coupons
       SET status = 'printed', printed_at = CURRENT_TIMESTAMP
       WHERE batch_id = $1 AND tenant_id = $2`,
      [batch_id, tenantId]
    );

    // Update batch status
    await client.query(
      `UPDATE coupon_batches
       SET batch_status = 'activated', activated_at = CURRENT_TIMESTAMP, activation_note = $1
       WHERE id = $2`,
      [note || null, batch_id]
    );

    return {
      batch_status: 'activated',
      activated_at: new Date().toISOString()
    };
  });

  return sendSuccess(res, result, 'Batch activated successfully. Ready for reward assignment.');
});

/**
 * Get batch details
 * GET /api/tenant/batches/:batch_id
 */
const getBatchDetails = asyncHandler(async (req, res) => {
  const { batch_id } = req.params;
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `SELECT
      b.id, b.batch_name, b.dealer_name, b.zone, b.total_coupons,
      b.serial_number_start, b.serial_number_end, b.batch_status,
      b.activated_at, b.activation_note, b.created_at,
      v.app_name as product_name,
      COUNT(CASE WHEN c.status = 'printed' THEN 1 END) as printed_count,
      COUNT(CASE WHEN c.status = 'active' THEN 1 END) as active_count,
      COUNT(CASE WHEN c.status = 'scanned' THEN 1 END) as scanned_count
     FROM coupon_batches b
     LEFT JOIN verification_apps v ON v.id = b.verification_app_id
     LEFT JOIN coupons c ON c.batch_id = b.id
     WHERE b.id = $1 AND b.tenant_id = $2
     GROUP BY b.id, v.app_name`,
    [batch_id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Batch');
  }

  return sendSuccess(res, { batch: result.rows[0] });
});

/**
 * List all batches
 * GET /api/tenant/batches
 */
const listBatches = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { status, product_id, page = 1, limit = 20 } = req.query;

  let query = `
    SELECT
      b.id, b.batch_name, b.dealer_name, b.zone, b.total_coupons,
      b.serial_number_start, b.serial_number_end, b.batch_status,
      b.activated_at, b.created_at,
      v.app_name as product_name,
      COUNT(c.id) as coupon_count
    FROM coupon_batches b
    LEFT JOIN verification_apps v ON v.id = b.verification_app_id
    LEFT JOIN coupons c ON c.batch_id = b.id
    WHERE b.tenant_id = $1
  `;

  const params = [tenantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND b.batch_status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (product_id) {
    query += ` AND b.verification_app_id = $${paramIndex}`;
    params.push(product_id);
    paramIndex++;
  }

  query += ` GROUP BY b.id, v.app_name ORDER BY b.created_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const result = await db.query(query, params);

  return sendSuccess(res, {
    batches: result.rows,
    page: parseInt(page),
    limit: parseInt(limit),
    total: result.rows.length
  });
});

module.exports = {
  createBatch,
  assignSerialNumbers,
  activateBatch,
  getBatchDetails,
  listBatches
};
