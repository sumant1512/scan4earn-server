/**
 * Mobile Points Controller
 * Handles customer loyalty point transactions and redemption requests.
 *
 * Routes (base: /api/mobile/v1/points):
 *   GET  /transactions          — paginated points transaction history
 *   POST /redeem                — submit a redemption request (locks points)
 *   GET  /redemptions           — customer's own redemption request history
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  AuthenticationError,
  ValidationError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const { sendSuccess } = require('../modules/common/utils/response.util');
const { executeTransaction } = require('../modules/common/utils/database.util');

/**
 * Resolve customer record from the authenticated user.
 * Returns customerId or throws.
 */
async function resolveCustomer(userId, tenantId) {
  const res = await db.query(
    `SELECT c.id
     FROM customers c
     JOIN users u ON u.phone_e164 = c.phone_e164
     WHERE u.id = $1 AND c.tenant_id = $2
     LIMIT 1`,
    [userId, tenantId]
  );
  if (res.rows.length === 0) throw new NotFoundError('Customer profile');
  return res.rows[0].id;
}

/**
 * Validate that the given verification_app_id belongs to this tenant and is active.
 * Returns the app row or throws a ValidationError.
 */
async function resolveApp(verificationAppId, tenantId) {
  const res = await db.query(
    `SELECT id, app_name FROM verification_apps
     WHERE id = $1 AND tenant_id = $2 AND is_active = true
     LIMIT 1`,
    [verificationAppId, tenantId]
  );
  if (res.rows.length === 0) {
    throw new ValidationError('Invalid or inactive X-App-Id for this tenant');
  }
  return res.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/mobile/v1/points/transactions
 *
 * Returns paginated list of points_transactions for the authenticated customer.
 * Query params: page, limit, type (EARN | REDEEM | EXPIRE | ADJUST)
 */
exports.getTransactions = asyncHandler(async (req, res) => {
  const { id: userId, role, tenant_id: tenantId } = req.user;

  if (role !== 'CUSTOMER') {
    throw new AuthenticationError('Only customers can access points transactions');
  }
  if (!tenantId) throw new AuthenticationError('Invalid or expired token');

  const customerId = await resolveCustomer(userId, tenantId);

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const type  = req.query.type ? req.query.type.toUpperCase() : null;

  const validTypes = ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST'];
  if (type && !validTypes.includes(type)) {
    throw new ValidationError(`type must be one of: ${validTypes.join(', ')}`);
  }

  const offset = (page - 1) * limit;
  const conditions = ['pt.customer_id = $1', 'pt.tenant_id = $2'];
  const params     = [customerId, tenantId];
  let   paramIdx   = 3;

  if (type) {
    conditions.push(`pt.transaction_type = $${paramIdx}`);
    params.push(type);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM points_transactions pt WHERE ${where}`,
      params
    ),
    db.query(
      `SELECT
         pt.id,
         pt.transaction_type,
         pt.points,
         pt.balance_before,
         pt.balance_after,
         pt.description,
         pt.reference_type,
         pt.created_at
       FROM points_transactions pt
       WHERE ${where}
       ORDER BY pt.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    )
  ]);

  const total      = parseInt(countRes.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  return sendSuccess(res, {
    transactions: dataRes.rows.map(r => ({
      id:             r.id,
      type:           r.transaction_type,
      points:         r.points,
      balance_before: r.balance_before,
      balance_after:  r.balance_after,
      description:    r.description,
      reference_type: r.reference_type,
      created_at:     r.created_at
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1
    }
  });
});

/**
 * POST /api/mobile/v1/points/redeem
 *
 * Customer submits a redemption request.
 * Points are deducted from total_points immediately (locked).
 * A redemption_requests row is created with status='pending'.
 * A tenant admin can approve or reject from the admin panel.
 *
 * Header: X-App-Id (required — identifies which app the request belongs to)
 * Body:   { points, notes? }
 */
exports.requestRedemption = asyncHandler(async (req, res) => {
  const { id: userId, role, tenant_id: tenantId } = req.user;

  if (role !== 'CUSTOMER') {
    throw new AuthenticationError('Only customers can request redemptions');
  }
  if (!tenantId) throw new AuthenticationError('Invalid or expired token');

  const verificationAppId = req.headers['x-app-id'] || req.headers['x-verification-app-id'];
  if (!verificationAppId) {
    return res.status(400).json({
      status: false,
      message: 'X-App-Id header is required to submit a redemption request'
    });
  }

  // Validate the app belongs to this tenant
  await resolveApp(verificationAppId, tenantId);

  const { points, notes } = req.body;

  if (!points || !Number.isInteger(points) || points <= 0) {
    throw new ValidationError('points must be a positive integer');
  }

  const result = await executeTransaction(db, async (client) => {
    // Resolve customer
    const custRes = await client.query(
      `SELECT c.id
       FROM customers c
       JOIN users u ON u.phone_e164 = c.phone_e164
       WHERE u.id = $1 AND c.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId]
    );
    if (custRes.rows.length === 0) throw new NotFoundError('Customer profile');
    const customerId = custRes.rows[0].id;

    // Lock rows for update to prevent race conditions
    const pointsRes = await client.query(
      `SELECT total_points FROM user_points
       WHERE customer_id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [customerId, tenantId]
    );

    const currentPoints = pointsRes.rows.length > 0
      ? parseInt(pointsRes.rows[0].total_points)
      : 0;

    if (currentPoints < points) {
      throw new ValidationError(
        `Insufficient points. Available: ${currentPoints}, Requested: ${points}`
      );
    }

    // Deduct from total_points immediately — they are now "locked"
    await client.query(
      `UPDATE user_points
       SET total_points = total_points - $1, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $2 AND tenant_id = $3`,
      [points, customerId, tenantId]
    );

    // Create the redemption request (app-scoped)
    const reqRes = await client.query(
      `INSERT INTO redemption_requests
         (customer_id, tenant_id, verification_app_id, points_requested, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, points_requested, status, created_at`,
      [customerId, tenantId, verificationAppId, points, notes || null]
    );

    return {
      customerId,
      request:   reqRes.rows[0],
      remaining: currentPoints - points
    };
  });

  return sendSuccess(res, {
    redemption_request: {
      id:               result.request.id,
      points_requested: result.request.points_requested,
      status:           result.request.status,
      created_at:       result.request.created_at
    },
    points_remaining: result.remaining
  }, 'Redemption request submitted. Your points are locked pending approval.');
});

/**
 * GET /api/mobile/v1/points/redemptions
 *
 * Returns the authenticated customer's own redemption request history.
 * Query params: page, limit, status (pending | approved | rejected)
 */
exports.getRedemptionHistory = asyncHandler(async (req, res) => {
  const { id: userId, role, tenant_id: tenantId } = req.user;

  if (role !== 'CUSTOMER') {
    throw new AuthenticationError('Only customers can access redemption history');
  }
  if (!tenantId) throw new AuthenticationError('Invalid or expired token');

  const customerId = await resolveCustomer(userId, tenantId);

  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
  const status = req.query.status ? req.query.status.toLowerCase() : null;
  const offset = (page - 1) * limit;

  const validStatuses = ['pending', 'approved', 'rejected'];
  if (status && !validStatuses.includes(status)) {
    throw new ValidationError(`status must be one of: ${validStatuses.join(', ')}`);
  }

  const conditions = ['rr.customer_id = $1', 'rr.tenant_id = $2'];
  const params     = [customerId, tenantId];
  let   paramIdx   = 3;

  if (status) {
    conditions.push(`rr.status = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM redemption_requests rr WHERE ${where}`,
      params
    ),
    db.query(
      `SELECT
         rr.id,
         rr.points_requested,
         rr.status,
         rr.notes,
         rr.rejection_reason,
         rr.processed_at,
         rr.created_at,
         va.app_name
       FROM redemption_requests rr
       LEFT JOIN verification_apps va ON va.id = rr.verification_app_id
       WHERE ${where}
       ORDER BY rr.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    )
  ]);

  const total      = parseInt(countRes.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  return sendSuccess(res, {
    redemptions: dataRes.rows.map(r => ({
      id:               r.id,
      points_requested: r.points_requested,
      status:           r.status,
      notes:            r.notes,
      rejection_reason: r.rejection_reason || null,
      processed_at:     r.processed_at || null,
      app_name:         r.app_name || null,
      created_at:       r.created_at
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1
    }
  });
});
