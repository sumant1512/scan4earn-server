/**
 * Rewards System Controller
 * Refactored to use modern error handling and validators
 *
 * Handles verification apps, coupons, and scans
 */

const db = require('../config/database');
const crypto = require('crypto');
const creditCalculator = require('../services/credit-calculator.service');
const couponGenerator = require('../services/coupon-generator.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  AppError,
  ValidationError,
  NotFoundError,
  PaymentRequiredError
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
 * Create verification app (Tenant)
 * POST /api/verification-apps
 */
exports.createVerificationApp = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const {
    app_name,
    description,
    logo_url,
    primary_color,
    secondary_color,
    welcome_message,
    scan_success_message,
    scan_failure_message,
    post_scan_redirect_url,
    template_id,
    currency
  } = req.body;

  validateRequiredFields(req.body, ['app_name', 'template_id']);

  // Enforce per-tenant verification app limit
  const tenantResult = await db.query(
    'SELECT settings FROM tenants WHERE id = $1',
    [tenantId]
  );
  const settings = tenantResult.rows[0]?.settings || {};
  const appLimit = settings.max_verification_apps ?? (parseInt(process.env.DEFAULT_MAX_VERIFICATION_APPS, 10) || 1);

  const countResult = await db.query(
    'SELECT COUNT(*) FROM verification_apps WHERE tenant_id = $1',
    [tenantId]
  );
  const currentCount = parseInt(countResult.rows[0].count, 10);

  if (currentCount >= appLimit) {
    throw new AppError(
      'Verification app limit reached. Contact your administrator to increase the limit.',
      422,
      'APP_LIMIT_REACHED'
    );
  }

  // Validate template exists and belongs to tenant
  const templateCheck = await db.query(
    'SELECT id FROM product_templates WHERE id = $1 AND tenant_id = $2',
    [template_id, tenantId]
  );

  if (templateCheck.rows.length === 0) {
    throw new ValidationError('Invalid template ID or template does not belong to your tenant');
  }

  // Generate URL-friendly code from app name
  let code = app_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Check if code already exists for this tenant, if so, append number
  const existingCode = await db.query(
    `SELECT code FROM verification_apps WHERE tenant_id = $1 AND code LIKE $2`,
    [tenantId, `${code}%`]
  );

  if (existingCode.rows.length > 0) {
    code = `${code}-${existingCode.rows.length + 1}`;
  }

  // Generate API key
  const apiKey = crypto.randomBytes(32).toString('hex');

  const result = await db.query(
    `INSERT INTO verification_apps
     (tenant_id, app_name, code, api_key, description, logo_url, primary_color, secondary_color,
      welcome_message, scan_success_message, scan_failure_message, post_scan_redirect_url, template_id, currency, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
     RETURNING *`,
    [tenantId, app_name, code, apiKey, description, logo_url, primary_color, secondary_color,
     welcome_message || 'Welcome! Scan your QR code to redeem your reward.',
     scan_success_message || 'Success! Your coupon has been verified.',
     scan_failure_message || 'Sorry, this coupon is not valid.',
     post_scan_redirect_url, template_id, currency || 'INR']
  );

  return sendCreated(res, {
    app: result.rows[0],
    important: 'Please save the API key. It will not be shown again in full.'
  }, 'Verification app created successfully');
});

/**
 * Get verification apps (Tenant)
 * GET /api/verification-apps
 */
exports.getVerificationApps = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;

  const [appsResult, tenantResult] = await Promise.all([
    db.query(
      `SELECT va.id AS verification_app_id,
              va.app_name,
              va.code,
              va.description,
              va.logo_url,
              va.primary_color,
              va.secondary_color,
              va.welcome_message,
              va.scan_success_message,
              va.scan_failure_message,
              va.post_scan_redirect_url,
              va.is_active,
              va.tenant_id,
              va.template_id,
              va.currency,
              pt.template_name,
              va.created_at,
              va.updated_at,
              COUNT(DISTINCT c.id) as total_coupons,
              COUNT(DISTINCT s.id) as total_scans
       FROM verification_apps va
       LEFT JOIN coupons c ON va.id = c.verification_app_id
       LEFT JOIN scans s ON c.id = s.coupon_id
       LEFT JOIN product_templates pt ON va.template_id = pt.id
       WHERE va.tenant_id = $1
       GROUP BY va.id, pt.id, pt.template_name
       ORDER BY va.created_at DESC`,
      [tenantId]
    ),
    db.query('SELECT settings FROM tenants WHERE id = $1', [tenantId])
  ]);

  const settings = tenantResult.rows[0]?.settings || {};
  const appsLimit = settings.max_verification_apps ?? (parseInt(process.env.DEFAULT_MAX_VERIFICATION_APPS, 10) || 1);
  const appsUsed = appsResult.rows.length;

  return sendSuccess(res, { apps: appsResult.rows, apps_used: appsUsed, apps_limit: appsLimit });
});

/**
 * Get single verification app (Tenant)
 * GET /api/verification-apps/:id
 */
exports.getVerificationAppById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `SELECT va.id AS verification_app_id,
            va.app_name,
            va.code,
            va.description,
            va.logo_url,
            va.primary_color,
            va.secondary_color,
            va.welcome_message,
            va.scan_success_message,
            va.scan_failure_message,
            va.post_scan_redirect_url,
            va.is_active,
            va.tenant_id,
            va.template_id,
            va.currency,
            pt.template_name,
            va.created_at,
            va.updated_at,
            COUNT(DISTINCT c.id) as total_coupons,
            COUNT(DISTINCT s.id) as total_scans
     FROM verification_apps va
     LEFT JOIN coupons c ON va.id = c.verification_app_id
     LEFT JOIN scans s ON c.id = s.coupon_id
     LEFT JOIN product_templates pt ON va.template_id = pt.id
     WHERE va.id = $1 AND va.tenant_id = $2
     GROUP BY va.id, va.app_name, va.code, va.description, va.logo_url, va.primary_color, va.secondary_color, va.welcome_message, va.scan_success_message, va.scan_failure_message, va.post_scan_redirect_url, va.is_active, va.tenant_id, va.template_id, va.currency, pt.template_name, va.created_at, va.updated_at`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  return sendSuccess(res, { app: result.rows[0] });
});

/**
 * Update verification app (Tenant)
 * PUT /api/verification-apps/:id
 */
exports.updateVerificationApp = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  const updates = req.body;

  const result = await db.query(
    `UPDATE verification_apps
     SET app_name = COALESCE($1, app_name),
         description = COALESCE($2, description),
         logo_url = COALESCE($3, logo_url),
         primary_color = COALESCE($4, primary_color),
         secondary_color = COALESCE($5, secondary_color),
         welcome_message = COALESCE($6, welcome_message),
         scan_success_message = COALESCE($7, scan_success_message),
         scan_failure_message = COALESCE($8, scan_failure_message),
         post_scan_redirect_url = COALESCE($9, post_scan_redirect_url),
         template_id = COALESCE($10, template_id),
         currency = COALESCE($11, currency),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $12 AND tenant_id = $13
     RETURNING *`,
    [updates.app_name, updates.description, updates.logo_url, updates.primary_color,
     updates.secondary_color, updates.welcome_message, updates.scan_success_message,
     updates.scan_failure_message, updates.post_scan_redirect_url,
     updates.template_id, updates.currency, id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  return sendSuccess(res, 'Verification app updated successfully');
});

/**
 * Create coupon (Tenant)
 * POST /api/coupons
 * Supports both single coupon and batch generation
 */
exports.createCoupon = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const {
    verification_app_id,
    discount_type,
    discount_value,
    discount_currency,
    buy_quantity,
    get_quantity,
    min_purchase_amount,
    expiry_date,
    total_usage_limit,
    per_user_usage_limit,
    description,
    terms,
    product_id,
    coupon_generation_type,
    batch_quantity,
    quantity
  } = req.body;

  validateRequiredFields(req.body, ['discount_value', 'expiry_date']);

  // Support 'quantity' as an alias for 'batch_quantity'
  let actualBatchQuantity = batch_quantity || quantity || 1;
  let actualGenerationType = coupon_generation_type;

  // Auto-detect batch mode
  if (!actualGenerationType && actualBatchQuantity > 1) {
    actualGenerationType = 'BATCH';
  } else if (!actualGenerationType) {
    actualGenerationType = 'SINGLE';
  }

  // Enforce FIXED_AMOUNT only
  if (discount_type && discount_type !== 'FIXED_AMOUNT') {
    throw new ValidationError('Only FIXED_AMOUNT discount type is supported');
  }

  // Validate batch quantity
  const isBatch = actualGenerationType === 'BATCH';

  if (isBatch && (!actualBatchQuantity || actualBatchQuantity < 1)) {
    throw new ValidationError('Batch quantity must be at least 1');
  }

  if (isBatch && actualBatchQuantity > 500) {
    throw new ValidationError('Batch quantity cannot exceed 500 coupons per request');
  }

  const result = await executeTransaction(db, async (client) => {
    // Calculate credit cost
    const costCalculation = creditCalculator.calculateCouponCreditCost({
      discount_value,
      total_usage_limit,
      expiry_date,
      is_batch: isBatch,
      batch_quantity: actualBatchQuantity
    });

    // Check credit balance
    const balanceResult = await client.query(
      'SELECT balance FROM tenant_credit_balance WHERE tenant_id = $1',
      [tenantId]
    );

    const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;

    if (currentBalance < costCalculation.total) {
      throw new PaymentRequiredError('Insufficient credits', {
        required: costCalculation.total,
        available: currentBalance,
        breakdown: costCalculation.breakdown
      });
    }

    // Create batch record for batch coupons
    let batchId = null;
    if (isBatch) {
      const batchResult = await client.query(
        `INSERT INTO coupon_batches
         (tenant_id, verification_app_id, batch_name, total_coupons, batch_status)
         VALUES ($1, $2, $3, $4, 'draft')
         RETURNING id`,
        [tenantId, verification_app_id, description || 'Batch', actualBatchQuantity]
      );
      batchId = batchResult.rows[0].id;
    }

    const maxScansPerCode = 1;
    const createdCoupons = [];
    const finalTotalUsageLimit = total_usage_limit !== undefined ? total_usage_limit : 1;
    const finalPerUserUsageLimit = per_user_usage_limit !== undefined ? per_user_usage_limit : 1;

    // Generate coupons
    for (let i = 0; i < actualBatchQuantity; i++) {
      let couponCode;
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 10) {
        couponCode = couponGenerator.generateCouponCode();
        const check = await client.query(
          'SELECT id FROM coupons WHERE coupon_code = $1',
          [couponCode]
        );
        isUnique = check.rows.length === 0;
        attempts++;
      }

      if (!isUnique) {
        throw new ValidationError('Failed to generate unique coupon code');
      }

      const referenceResult = await client.query(
        'SELECT get_next_coupon_reference($1) as ref',
        [tenantId]
      );
      const couponReference = referenceResult.rows[0].ref;

      const couponPoints = req.body.coupon_points || discount_value;

      const couponResult = await client.query(
        `INSERT INTO coupons
         (tenant_id, verification_app_id, coupon_code, coupon_reference, discount_type, discount_value,
          discount_currency, buy_quantity, get_quantity, min_purchase_amount,
          expiry_date, total_usage_limit, per_user_usage_limit,
          description, terms, credit_cost, status, max_scans_per_code, batch_id, batch_quantity,
          product_id, coupon_points)
         VALUES ($1, $2, $3, $4, 'FIXED_AMOUNT', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'draft', $16, $17, $18, $19, $20)
         RETURNING *`,
        [tenantId, verification_app_id, couponCode, couponReference, discount_value,
         discount_currency || 'USD', buy_quantity, get_quantity, min_purchase_amount,
         expiry_date, finalTotalUsageLimit, finalPerUserUsageLimit,
         description, terms, discount_value,
         maxScansPerCode, batchId, i === 0 ? actualBatchQuantity : null,
         product_id || null, couponPoints]
      );

      createdCoupons.push(couponResult.rows[0]);
    }

    // Deduct credits
    const newBalance = currentBalance - costCalculation.total;
    await client.query(
      `UPDATE tenant_credit_balance
       SET balance = $1,
           total_spent = total_spent + $2
       WHERE tenant_id = $3`,
      [newBalance, costCalculation.total, tenantId]
    );

    // Create transaction record
    const transactionDesc = isBatch
      ? `Batch coupon creation: ${actualBatchQuantity} coupons`
      : `Coupon creation: ${createdCoupons[0].coupon_code}`;

    await client.query(
      `INSERT INTO credit_transactions
       (tenant_id, transaction_type, amount, balance_before, balance_after,
        reference_id, reference_type, description, created_by)
       VALUES ($1, 'DEBIT', $2, $3, $4, $5, 'COUPON_CREATION', $6, $7)`,
      [tenantId, costCalculation.total, currentBalance, newBalance,
       createdCoupons[0].id, transactionDesc, req.user.id]
    );

    return {
      coupons: createdCoupons.map(c => ({ ...c, batch_id: batchId })),
      batch_id: batchId,
      credit_cost: costCalculation.total,
      new_balance: newBalance,
      is_batch: isBatch
    };
  });

  if (result.is_batch) {
    return sendCreated(res, {
      coupons: result.coupons,
      batch_id: result.batch_id,
      credit_cost: result.credit_cost,
      new_balance: result.new_balance
    }, `${result.coupons.length} coupons created successfully`);
  } else {
    return sendCreated(res, {
      coupon: result.coupons[0],
      credit_cost: result.credit_cost,
      new_balance: result.new_balance
    }, 'Coupon created successfully');
  }
});

/**
 * Create multiple batches of coupons in a single operation
 * POST /api/rewards/coupons/multi-batch
 */
exports.createMultiBatchCoupons = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { verificationAppId, batches } = req.body;

  validateRequiredFields(req.body, ['verificationAppId', 'batches']);

  if (!Array.isArray(batches) || batches.length === 0) {
    throw new ValidationError('batches must be a non-empty array');
  }

  // Validate each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (!batch.description || !batch.quantity || !batch.discountAmount || !batch.expiryDate) {
      throw new ValidationError(`Batch ${i + 1}: description, quantity, discountAmount, and expiryDate are required`);
    }
    if (batch.quantity < 1 || batch.quantity > 500) {
      throw new ValidationError(`Batch ${i + 1}: quantity must be between 1 and 500`);
    }
    if (batch.discountAmount < 0.01) {
      throw new ValidationError(`Batch ${i + 1}: discountAmount must be at least 0.01`);
    }
    const expiryDate = new Date(batch.expiryDate);
    if (expiryDate <= new Date()) {
      throw new ValidationError(`Batch ${i + 1}: expiry date must be in the future`);
    }
  }

  const result = await executeTransaction(db, async (client) => {
    // Calculate total cost
    let totalCost = 0;
    for (const batch of batches) {
      totalCost += batch.quantity * batch.discountAmount;
    }

    // Check credit balance
    const balanceResult = await client.query(
      'SELECT balance FROM tenant_credit_balance WHERE tenant_id = $1',
      [tenantId]
    );

    const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;

    if (currentBalance < totalCost) {
      throw new PaymentRequiredError('Insufficient credits', {
        required: totalCost,
        available: currentBalance
      });
    }

    const allCreatedCoupons = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      const batchResult = await client.query(
        `INSERT INTO coupon_batches
         (tenant_id, verification_app_id, batch_name, total_coupons, batch_status)
         VALUES ($1, $2, $3, $4, 'draft')
         RETURNING id`,
        [tenantId, verificationAppId, batch.description, batch.quantity]
      );
      const batchId = batchResult.rows[0].id;

      for (let i = 0; i < batch.quantity; i++) {
        let couponCode;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
          couponCode = couponGenerator.generateCouponCode();
          const check = await client.query(
            'SELECT id FROM coupons WHERE coupon_code = $1',
            [couponCode]
          );
          isUnique = check.rows.length === 0;
          attempts++;
        }

        if (!isUnique) {
          throw new ValidationError('Failed to generate unique coupon code');
        }

        const referenceResult = await client.query(
          'SELECT get_next_coupon_reference($1) as ref',
          [tenantId]
        );
        const couponReference = referenceResult.rows[0].ref;

        const couponPoints = batch.couponPoints || batch.discountAmount;

        const couponResult = await client.query(
          `INSERT INTO coupons
           (tenant_id, verification_app_id, coupon_code, coupon_reference, discount_type, discount_value,
            discount_currency, expiry_date, total_usage_limit, per_user_usage_limit,
            description, credit_cost, status, max_scans_per_code, batch_id, batch_quantity,
            product_id, coupon_points)
           VALUES ($1, $2, $3, $4, 'FIXED_AMOUNT', $5, $6, $7, $8, $9, $10, $11, 'draft', $12, $13, $14, $15, $16)
           RETURNING *`,
          [tenantId, verificationAppId, couponCode, couponReference, batch.discountAmount,
           'USD', batch.expiryDate, 1, 1,
           batch.description, batch.discountAmount,
           1, batchId,
           i === 0 ? batch.quantity : null,
           batch.productId || null, couponPoints]
        );

        allCreatedCoupons.push(couponResult.rows[0]);
      }
    }

    // Deduct credits
    const newBalance = currentBalance - totalCost;
    await client.query(
      `UPDATE tenant_credit_balance
       SET balance = $1,
           total_spent = total_spent + $2
       WHERE tenant_id = $3`,
      [newBalance, totalCost, tenantId]
    );

    // Create transaction record
    const transactionDesc = `Multi-batch coupon creation: ${allCreatedCoupons.length} coupons across ${batches.length} batches`;

    await client.query(
      `INSERT INTO credit_transactions
       (tenant_id, transaction_type, amount, balance_before, balance_after,
        reference_id, reference_type, description, created_by)
       VALUES ($1, 'DEBIT', $2, $3, $4, $5, 'COUPON_CREATION', $6, $7)`,
      [tenantId, totalCost, currentBalance, newBalance,
       allCreatedCoupons[0].id, transactionDesc, req.user.id]
    );

    return { allCreatedCoupons, totalCost, newBalance };
  });

  return sendCreated(res, {
    coupons: result.allCreatedCoupons,
    credit_cost: result.totalCost,
    new_balance: result.newBalance
  }, `${result.allCreatedCoupons.length} coupons created successfully across ${batches.length} batches`);
});

/**
 * Get coupons (Tenant)
 * GET /api/coupons
 */
exports.getCoupons = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { status, verification_app_id, page = 1, limit = 20, search, print_status } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT c.*, va.app_name,
           COUNT(DISTINCT s.id) as total_scans
    FROM coupons c
    LEFT JOIN verification_apps va ON c.verification_app_id = va.id
    LEFT JOIN scans s ON c.id = s.coupon_id
    WHERE c.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND c.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (verification_app_id) {
    query += ` AND c.verification_app_id = $${paramIndex}`;
    params.push(verification_app_id);
    paramIndex++;
  }

  if (search) {
    query += ` AND (c.coupon_code ILIKE $${paramIndex} OR c.coupon_reference ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // print_status: 'unprinted' = never printed, 'printed' = printed at least once
  if (print_status === 'unprinted') {
    query += ` AND COALESCE(c.printed_count, 0) = 0`;
  } else if (print_status === 'printed') {
    query += ` AND COALESCE(c.printed_count, 0) > 0`;
  }

  query += ` GROUP BY c.id, va.app_name ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await db.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(DISTINCT c.id) as total
    FROM coupons c
    WHERE c.tenant_id = $1
  `;
  const countParams = [tenantId];
  let countParamIndex = 2;

  if (status) {
    countQuery += ` AND c.status = $${countParamIndex}`;
    countParams.push(status);
    countParamIndex++;
  }

  if (verification_app_id) {
    countQuery += ` AND c.verification_app_id = $${countParamIndex}`;
    countParams.push(verification_app_id);
    countParamIndex++;
  }

  if (search) {
    countQuery += ` AND (c.coupon_code ILIKE $${countParamIndex} OR c.coupon_reference ILIKE $${countParamIndex} OR c.description ILIKE $${countParamIndex})`;
    countParams.push(`%${search}%`);
    countParamIndex++;
  }

  if (print_status === 'unprinted') {
    countQuery += ` AND COALESCE(c.printed_count, 0) = 0`;
  } else if (print_status === 'printed') {
    countQuery += ` AND COALESCE(c.printed_count, 0) > 0`;
  }

  const countResult = await db.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total);

  return sendSuccess(res, {
    coupons: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      hasMore: offset + result.rows.length < total
    }
  });
});

/**
 * Get coupon by ID (Tenant)
 * GET /api/coupons/:id
 */
exports.getCouponById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `SELECT c.*, va.app_name,
            COUNT(DISTINCT s.id) as total_scans,
            COUNT(DISTINCT CASE WHEN s.scan_status = 'SUCCESS' THEN s.id END) as successful_scans
     FROM coupons c
     LEFT JOIN verification_apps va ON c.verification_app_id = va.id
     LEFT JOIN scans s ON c.id = s.coupon_id
     WHERE c.id = $1 AND c.tenant_id = $2
     GROUP BY c.id, va.app_name`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Coupon');
  }

  return sendSuccess(res, { coupon: result.rows[0] });
});

/**
 * Update coupon status (Tenant)
 * PATCH /api/coupons/:id/status
 */
exports.updateCouponStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const tenantId = req.user.tenant_id;

  if (!['active', 'inactive'].includes(status)) {
    throw new ValidationError('Status must be active or inactive');
  }

  const result = await executeTransaction(db, async (client) => {
    // Get current coupon details
    const currentCoupon = await client.query(
      'SELECT * FROM coupons WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (currentCoupon.rows.length === 0) {
      throw new NotFoundError('Coupon');
    }

    const coupon = currentCoupon.rows[0];

    // Update coupon status
    const updateResult = await client.query(
      `UPDATE coupons
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [status, id, tenantId]
    );

    let refundedCredits = 0;

    // If deactivating an active coupon, refund the credits
    if (coupon.status === 'active' && status === 'inactive' && coupon.credit_cost > 0) {
      const balanceResult = await client.query(
        'SELECT balance FROM tenant_credit_balance WHERE tenant_id = $1',
        [tenantId]
      );

      const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;
      const newBalance = currentBalance + coupon.credit_cost;

      await client.query(
        `UPDATE tenant_credit_balance
         SET balance = $1,
             total_spent = total_spent - $2
         WHERE tenant_id = $3`,
        [newBalance, coupon.credit_cost, tenantId]
      );

      await client.query(
        `INSERT INTO credit_transactions
         (tenant_id, transaction_type, amount, balance_before, balance_after, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          'CREDIT',
          coupon.credit_cost,
          currentBalance,
          newBalance,
          `Refund for deactivated coupon: ${coupon.coupon_code}`
        ]
      );

      refundedCredits = coupon.credit_cost;
    }

    return { coupon: updateResult.rows[0], refundedCredits };
  });

  const message = result.refundedCredits > 0
    ? `Coupon deactivated and ${result.refundedCredits} credits refunded`
    : 'Coupon status updated successfully';

  return sendSuccess(res, {
    coupon: result.coupon,
    refunded_credits: result.refundedCredits
  }, message);
});

/**
 * Verify coupon scan (Public)
 * POST /api/scans/verify
 */
exports.verifyScan = asyncHandler(async (req, res) => {
  let { coupon_code, location_lat, location_lng } = req.body;

  // Accept full scan URLs (e.g. http://demo-brand-one.localhost:8080/scan/DEMO-ACTV-0001)
  if (coupon_code && (coupon_code.startsWith('http://') || coupon_code.startsWith('https://'))) {
    try {
      const segments = new URL(coupon_code).pathname.split('/').filter(Boolean);
      coupon_code = segments[segments.length - 1] || coupon_code;
    } catch (_) { /* leave coupon_code unchanged if URL is malformed */ }
  }

  const device_info = req.get('user-agent');
  const ip_address = req.ip;

  // Get coupon
  const couponResult = await db.query(
    'SELECT * FROM coupons WHERE coupon_code = $1',
    [coupon_code]
  );

  if (couponResult.rows.length === 0) {
    // Log failed scan
    await db.query(
      `INSERT INTO scans (coupon_id, tenant_id, scan_status, device_info, user_agent, ip_address)
       VALUES (NULL, NULL, 'INVALID', $1, $2, $3)`,
      [device_info, device_info, ip_address]
    );

    throw new NotFoundError('Coupon', 'This coupon code is not valid.');
  }

  const coupon = couponResult.rows[0];
  let scan_status = 'SUCCESS';
  let errorMessage = null;

  // Check lifecycle status
  if (coupon.status === 'draft') {
    scan_status = 'NOT_ACTIVE';
    errorMessage = 'Coupon has not been activated';
  } else if (coupon.status === 'printed') {
    scan_status = 'NOT_PRINTED';
    errorMessage = 'Coupon has not been activated';
  } else if (coupon.status === 'used') {
    scan_status = 'USED';
    errorMessage = 'Coupon has already been used';
  } else if (coupon.status === 'inactive') {
    scan_status = 'INACTIVE';
    errorMessage = 'Coupon has been deactivated';
  } else if (coupon.status === 'expired') {
    scan_status = 'EXPIRED';
    errorMessage = 'Coupon has expired';
  } else if (coupon.status === 'exhausted') {
    scan_status = 'EXHAUSTED';
    errorMessage = 'Coupon limit reached';
  } else if (coupon.status === 'active') {
    // Check max_scans_per_code
    if (coupon.max_scans_per_code) {
      const scanCountResult = await db.query(
        'SELECT COUNT(*) as scan_count FROM scans WHERE coupon_id = $1 AND scan_status = $2',
        [coupon.id, 'SUCCESS']
      );

      const scanCount = parseInt(scanCountResult.rows[0].scan_count);

      if (scanCount >= coupon.max_scans_per_code) {
        scan_status = 'USED';
        errorMessage = `This coupon has reached its scan limit (${coupon.max_scans_per_code} scan${coupon.max_scans_per_code > 1 ? 's' : ''})`;
      }
    }

    // Check expiry date
    if (scan_status === 'SUCCESS' && new Date(coupon.expiry_date) < new Date()) {
      scan_status = 'EXPIRED';
      errorMessage = 'Coupon Expired';
    } else if (scan_status === 'SUCCESS' && coupon.total_usage_limit && coupon.current_usage_count >= coupon.total_usage_limit) {
      scan_status = 'EXHAUSTED';
      errorMessage = 'Coupon Limit Reached';
    }
  }

  // Log scan
  await db.query(
    `INSERT INTO scans
     (coupon_id, tenant_id, scan_status, location_lat, location_lng, device_info, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [coupon.id, coupon.tenant_id, scan_status, location_lat, location_lng,
     device_info, device_info, ip_address]
  );

  // If successful, increment usage count and mark as used
  if (scan_status === 'SUCCESS') {
    const scanCountResult = await db.query(
      'SELECT COUNT(*) as scan_count FROM scans WHERE coupon_id = $1 AND scan_status = $2',
      [coupon.id, 'SUCCESS']
    );
    const currentScanCount = parseInt(scanCountResult.rows[0].scan_count);

    await db.query(
      `UPDATE coupons
       SET current_usage_count = current_usage_count + 1,
           status = CASE
             WHEN (total_usage_limit IS NOT NULL AND current_usage_count + 1 >= total_usage_limit)
               THEN 'exhausted'::VARCHAR
             WHEN (max_scans_per_code IS NOT NULL AND $2 + 1 >= max_scans_per_code)
               THEN 'used'::VARCHAR
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [coupon.id, currentScanCount]
    );

    // Get verification app for custom messages
    const appResult = await db.query(
      'SELECT scan_success_message FROM verification_apps WHERE id = $1',
      [coupon.verification_app_id]
    );

    const successMessage = appResult.rows.length > 0
      ? appResult.rows[0].scan_success_message
      : 'Success! Your coupon has been verified.';

    return res.json({
      success: true,
      message: successMessage,
      coupon: {
        code: coupon.coupon_code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        terms: coupon.terms
      }
    });
  } else {
    return res.status(400).json({
      success: false,
      error: errorMessage,
      message: `Sorry, this coupon is ${scan_status.toLowerCase()}.`
    });
  }
});

/**
 * Get scan history (Tenant)
 * GET /api/scans/history
 */
exports.getScanHistory = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { page = 1, limit = 20, status, coupon_id } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT s.*, c.coupon_code
    FROM scans s
    LEFT JOIN coupons c ON s.coupon_id = c.id
    WHERE s.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND s.scan_status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (coupon_id) {
    query += ` AND s.coupon_id = $${paramIndex}`;
    params.push(coupon_id);
    paramIndex++;
  }

  query += ` ORDER BY s.scanned_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await db.query(query, params);

  return sendSuccess(res, { scans: result.rows });
});

/**
 * Get scan analytics (Tenant)
 * GET /api/scans/analytics
 */
exports.getScanAnalytics = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `SELECT
      COUNT(*) as total_scans,
      COUNT(CASE WHEN scan_status = 'SUCCESS' THEN 1 END) as successful_scans,
      COUNT(CASE WHEN scan_status = 'EXPIRED' THEN 1 END) as expired_scans,
      COUNT(CASE WHEN scan_status = 'EXHAUSTED' THEN 1 END) as exhausted_scans,
      COUNT(CASE WHEN scan_status = 'INVALID' THEN 1 END) as invalid_scans
     FROM scans
     WHERE tenant_id = $1`,
    [tenantId]
  );

  return sendSuccess(res, { analytics: result.rows[0] });
});

/**
 * Activate coupons by range
 * POST /api/rewards/coupons/activate-range
 */
exports.activateCouponRange = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { from_reference, to_reference, activation_note } = req.body;

  validateRequiredFields(req.body, ['from_reference', 'to_reference']);

  if (from_reference > to_reference) {
    throw new ValidationError(
      `Invalid range: '${from_reference}' is greater than '${to_reference}' alphabetically. Use sequential references like CP-001 to CP-050.`,
      'invalid_range',
      { hint: 'Use POST /api/rewards/coupons/bulk-activate with coupon_ids array for specific coupons' }
    );
  }

  const result = await executeTransaction(db, async (client) => {
    const findResult = await client.query(
      `SELECT id, coupon_code, coupon_reference, status
       FROM coupons
       WHERE tenant_id = $1
         AND coupon_reference >= $2
         AND coupon_reference <= $3
         AND status IN ('draft', 'printed')
       ORDER BY coupon_reference
       LIMIT 1000`,
      [tenantId, from_reference, to_reference]
    );

    const coupons = findResult.rows;

    if (coupons.length === 0) {
      throw new NotFoundError(
        `No activatable coupons found between references ${from_reference} and ${to_reference}`,
        null,
        { found: 0 }
      );
    }

    const couponIds = coupons.map(c => c.id);
    const updateResult = await client.query(
      `UPDATE coupons
       SET status = 'active',
           activated_at = CURRENT_TIMESTAMP,
           activation_note = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2)
         AND tenant_id = $3
       RETURNING id, coupon_code, coupon_reference`,
      [activation_note, couponIds, tenantId]
    );

    return {
      activated_count: updateResult.rowCount,
      skipped_count: coupons.length - updateResult.rowCount,
      activated_references: updateResult.rows.map(r => r.coupon_reference),
      activated_codes: updateResult.rows.map(r => r.coupon_code)
    };
  });

  return sendSuccess(res, {
    ...result,
    success: true
  }, `${result.activated_count} coupons activated successfully`);
});

/**
 * Activate all coupons in a batch
 * POST /api/rewards/coupons/activate-batch
 */
exports.activateCouponBatch = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { batch_id, activation_note } = req.body;

  validateRequiredFields(req.body, ['batch_id']);

  const result = await executeTransaction(db, async (client) => {
    const findResult = await client.query(
      `SELECT id, coupon_code, status
       FROM coupons
       WHERE tenant_id = $1
         AND batch_id = $2
         AND status IN ('draft', 'printed')`,
      [tenantId, batch_id]
    );

    if (findResult.rowCount === 0) {
      throw new NotFoundError('No activatable coupons found in this batch');
    }

    const couponIds = findResult.rows.map(c => c.id);
    const updateResult = await client.query(
      `UPDATE coupons
       SET status = 'active',
           activated_at = CURRENT_TIMESTAMP,
           activation_note = COALESCE($1, 'Batch activation - ' || $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($3)
         AND tenant_id = $4
       RETURNING id, coupon_code`,
      [activation_note, batch_id, couponIds, tenantId]
    );

    return {
      activated_count: updateResult.rowCount,
      activated_codes: updateResult.rows.map(r => r.coupon_code)
    };
  });

  return sendSuccess(res, {
    ...result,
    success: true,
    batch_id
  }, `${result.activated_count} coupons activated in batch`);
});

/**
 * Mark coupon(s) as printed
 * PATCH /api/rewards/coupons/:id/print
 */
exports.markCouponAsPrinted = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `UPDATE coupons
     SET printed_at = CURRENT_TIMESTAMP,
         printed_count = COALESCE(printed_count, 0) + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, coupon_code, status, printed_at, printed_count`,
    [id, tenantId]
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Coupon');
  }

  return sendSuccess(res, {
    success: true,
    coupon: result.rows[0]
  }, 'Coupon marked as printed');
});

/**
 * Bulk mark coupons as printed
 * POST /api/rewards/coupons/bulk-print
 */
exports.bulkMarkAsPrinted = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { coupon_ids } = req.body;

  if (!coupon_ids || !Array.isArray(coupon_ids) || coupon_ids.length === 0) {
    throw new ValidationError('coupon_ids array is required');
  }

  const result = await executeTransaction(db, async (client) => {
    const updateResult = await client.query(
      `UPDATE coupons
       SET printed_at = CURRENT_TIMESTAMP,
           printed_count = COALESCE(printed_count, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1) AND tenant_id = $2
       RETURNING id, coupon_code, status, printed_count`,
      [coupon_ids, tenantId]
    );

    return {
      printed_count: updateResult.rowCount,
      coupons: updateResult.rows
    };
  });

  return sendSuccess(res, {
    success: true,
    ...result
  }, `${result.printed_count} coupons marked as printed`);
});

/**
 * Bulk activate selected coupons
 * POST /api/rewards/coupons/bulk-activate
 */
exports.bulkActivateCoupons = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { coupon_ids, activation_note } = req.body;

  if (!coupon_ids || !Array.isArray(coupon_ids) || coupon_ids.length === 0) {
    throw new ValidationError('coupon_ids array is required');
  }

  const result = await executeTransaction(db, async (client) => {
    const findResult = await client.query(
      `SELECT id, coupon_code, status
       FROM coupons
       WHERE id = ANY($1)
         AND tenant_id = $2
         AND status IN ('draft', 'printed')`,
      [coupon_ids, tenantId]
    );

    if (findResult.rowCount === 0) {
      throw new ValidationError('No coupons found with draft or printed status', 'no_coupons', { found: 0 });
    }

    const activateIds = findResult.rows.map(c => c.id);
    const updateResult = await client.query(
      `UPDATE coupons
       SET status = 'active',
           activated_at = CURRENT_TIMESTAMP,
           activation_note = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2) AND tenant_id = $3
       RETURNING id, coupon_code, status`,
      [activation_note || 'Bulk activation from selection', activateIds, tenantId]
    );

    return {
      activated_count: updateResult.rowCount,
      requested_count: coupon_ids.length,
      coupons: updateResult.rows
    };
  });

  return sendSuccess(res, {
    success: true,
    ...result
  }, `${result.activated_count} coupons activated`);
});

/**
 * Deactivate coupons by range
 * POST /api/rewards/coupons/deactivate-range
 */
exports.deactivateCouponRange = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { from_reference, to_reference, deactivation_reason } = req.body;

  validateRequiredFields(req.body, ['from_reference', 'to_reference', 'deactivation_reason']);

  if (from_reference > to_reference) {
    throw new ValidationError(
      `Invalid range: '${from_reference}' is greater than '${to_reference}' alphabetically. Use sequential references like CP-001 to CP-050.`,
      'invalid_range',
      { hint: 'For specific coupons, select and deactivate them individually' }
    );
  }

  const result = await executeTransaction(db, async (client) => {
    const updateResult = await client.query(
      `UPDATE coupons
       SET status = 'inactive',
           deactivation_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2
         AND coupon_reference >= $3
         AND coupon_reference <= $4
         AND status NOT IN ('used', 'expired', 'exhausted')
       RETURNING id, coupon_code, coupon_reference`,
      [deactivation_reason, tenantId, from_reference, to_reference]
    );

    return {
      deactivated_count: updateResult.rowCount,
      deactivated_references: updateResult.rows.map(r => r.coupon_reference),
      deactivated_codes: updateResult.rows.map(r => r.coupon_code)
    };
  });

  return sendSuccess(res, {
    success: true,
    ...result
  }, `${result.deactivated_count} coupons deactivated`);
});

/**
 * Regenerate API key for verification app (Tenant)
 * POST /api/verification-apps/:id/regenerate-key
 */
exports.regenerateApiKey = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const newApiKey = crypto.randomBytes(32).toString('hex');

  const result = await db.query(
    `UPDATE verification_apps
     SET api_key = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, app_name, code, api_key, created_at`,
    [newApiKey, id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  return sendSuccess(res, {
    app: result.rows[0],
    warning: 'The old API key is now invalid. Update your external applications with the new key.'
  }, 'API key regenerated successfully');
});

/**
 * Delete verification app (Tenant)
 * DELETE /api/verification-apps/:id
 */
exports.deleteVerificationApp = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  // Get app stats before deletion
  const appCheck = await db.query(
    `SELECT va.app_name,
            COUNT(DISTINCT c.id) as total_coupons,
            COUNT(DISTINCT p.id) as total_products
     FROM verification_apps va
     LEFT JOIN coupons c ON va.id = c.verification_app_id
     LEFT JOIN products p ON va.id = p.verification_app_id
     WHERE va.id = $1 AND va.tenant_id = $2
     GROUP BY va.id, va.app_name`,
    [id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  const app = appCheck.rows[0];

  // Delete the app (cascade will handle related data)
  await db.query(
    `DELETE FROM verification_apps WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  return sendSuccess(res, {
    deleted_data: {
      app_name: app.app_name,
      coupons_deleted: parseInt(app.total_coupons),
      products_deleted: parseInt(app.total_products)
    }
  }, 'Verification app deleted successfully');
});

/**
 * Toggle verification app status (Tenant)
 * PATCH /api/verification-apps/:id/toggle-status
 */
exports.toggleAppStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `UPDATE verification_apps
     SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, app_name, is_active`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  const app = result.rows[0];
  return sendSuccess(res, { app }, `Verification app ${app.is_active ? 'activated' : 'deactivated'} successfully`);
});

/**
 * Mark batch as printed
 * POST /api/rewards/coupons/batch/:batch_id/print
 */
exports.batchPrint = asyncHandler(async (req, res) => {
  const { batch_id } = req.params;
  const { print_note } = req.body;
  const tenantId = req.user.tenant_id;

  // Verify batch belongs to tenant
  const batchCheck = await db.query(
    `SELECT COUNT(*) as count FROM coupons
     WHERE batch_id = $1 AND tenant_id = $2`,
    [batch_id, tenantId]
  );

  if (parseInt(batchCheck.rows[0].count) === 0) {
    throw new NotFoundError('Batch');
  }

  const result = await db.query(
    `UPDATE coupons
     SET printed_at = CURRENT_TIMESTAMP,
         printed_count = COALESCE(printed_count, 0) + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE batch_id = $1 AND tenant_id = $2
     RETURNING coupon_code`,
    [batch_id, tenantId]
  );

  return sendSuccess(res, {
    success: true,
    batch_id,
    printed_count: result.rows.length,
    print_note: print_note || null
  }, `${result.rows.length} coupons marked as printed`);
});

/**
 * Activate entire batch
 * POST /api/rewards/coupons/batch/:batch_id/activate
 */
exports.batchActivate = asyncHandler(async (req, res) => {
  const { batch_id } = req.params;
  const { activation_note } = req.body;
  const tenantId = req.user.tenant_id;

  // Verify batch belongs to tenant
  const batchCheck = await db.query(
    `SELECT COUNT(*) as count FROM coupons
     WHERE batch_id = $1 AND tenant_id = $2`,
    [batch_id, tenantId]
  );

  if (parseInt(batchCheck.rows[0].count) === 0) {
    throw new NotFoundError('Batch');
  }

  const result = await db.query(
    `UPDATE coupons
     SET status = 'active',
         activated_at = CURRENT_TIMESTAMP,
         activation_note = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE batch_id = $1 AND tenant_id = $2 AND status IN ('draft', 'printed')
     RETURNING coupon_code`,
    [batch_id, tenantId, activation_note || null]
  );

  const activatedCodes = result.rows.map(r => r.coupon_code);

  return sendSuccess(res, {
    success: true,
    batch_id,
    activated_count: result.rows.length,
    activated_codes: activatedCodes,
    activation_note: activation_note || null
  }, `${result.rows.length} coupons activated successfully`);
});

/**
 * Deactivate entire batch
 * POST /api/rewards/coupons/batch/:batch_id/deactivate
 */
exports.batchDeactivate = asyncHandler(async (req, res) => {
  const { batch_id } = req.params;
  const { deactivation_reason } = req.body;
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `UPDATE coupons
     SET status = 'inactive',
         deactivation_reason = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE batch_id = $1 AND tenant_id = $2 AND status = 'active'
     RETURNING coupon_code`,
    [batch_id, tenantId, deactivation_reason || null]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('No active coupons found in batch');
  }

  return sendSuccess(res, {
    success: true,
    batch_id,
    deactivated_count: result.rows.length,
    deactivation_reason: deactivation_reason || null
  }, `${result.rows.length} coupons deactivated`);
});

/**
 * Get batch statistics
 * GET /api/rewards/coupons/batch/:batch_id/stats
 */
exports.batchStats = asyncHandler(async (req, res) => {
  const { batch_id } = req.params;
  const tenantId = req.user.tenant_id;

  const stats = await db.query(
    `SELECT
       batch_id,
       COUNT(*)::int as total_coupons,
       COUNT(*) FILTER (WHERE status = 'draft')::int as draft_count,
       COUNT(*) FILTER (WHERE status = 'printed')::int as printed_count,
       COUNT(*) FILTER (WHERE status = 'active')::int as active_count,
       COUNT(*) FILTER (WHERE status = 'used')::int as used_count,
       COUNT(*) FILTER (WHERE status = 'inactive')::int as inactive_count,
       COUNT(*) FILTER (WHERE status = 'expired')::int as expired_count,
       MIN(created_at) as created_at,
       MAX(updated_at) as last_updated
     FROM coupons
     WHERE batch_id = $1 AND tenant_id = $2
     GROUP BY batch_id`,
    [batch_id, tenantId]
  );

  if (stats.rows.length === 0) {
    throw new NotFoundError('Batch');
  }

  const row = stats.rows[0];
  return sendSuccess(res, {
    success: true,
    batch_id: row.batch_id,
    total_coupons: row.total_coupons,
    status_counts: {
      draft: row.draft_count,
      printed: row.printed_count,
      active: row.active_count,
      used: row.used_count,
      inactive: row.inactive_count,
      expired: row.expired_count
    },
    created_at: row.created_at,
    last_updated: row.last_updated
  });
});
