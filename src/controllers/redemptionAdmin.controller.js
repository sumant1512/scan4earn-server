/**
 * Redemption Admin Controller
 * Tenant admin endpoints to view, approve, and reject customer redemption requests.
 * All operations are scoped to the tenant from the admin's JWT.
 * Requests are app-scoped — each verification app has its own queue.
 *
 * Routes (base: /api/redemptions):
 *   GET  /                  — list requests (filter by app_id, status, page/limit)
 *   GET  /summary           — counts by status per app
 *   GET  /:id               — get single request detail
 *   POST /:id/approve       — approve request → create REDEEM transaction
 *   POST /:id/reject        — reject request → restore points, create ADJUST transaction
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError
} = require('../modules/common/errors/AppError');
const { sendSuccess } = require('../modules/common/utils/response.util');
const { executeTransaction } = require('../modules/common/utils/database.util');

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Ensure the caller is a TENANT_ADMIN or TENANT_USER with a tenant context.
 * SUPER_ADMIN is blocked — use tenant-scoped endpoints only.
 */
function requireTenantAdmin(req) {
  const { role, tenant_id } = req.user;
  if (role === 'SUPER_ADMIN') {
    throw new ForbiddenError('Use tenant-scoped endpoints. SUPER_ADMIN cannot manage tenant redemptions directly.');
  }
  if (role !== 'TENANT_ADMIN' && role !== 'TENANT_USER') {
    throw new ForbiddenError('Only tenant admins can manage redemption requests');
  }
  if (!tenant_id) {
    throw new ForbiddenError('Tenant context required');
  }
  return tenant_id;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * GET /api/redemptions
 *
 * List redemption requests for the tenant.
 * Tenant admins see requests across all their apps unless filtered.
 *
 * Query params:
 *   app_id   — filter by verification_app_id (UUID)
 *   status   — "pending" | "approved" | "rejected"
 *   page     — default 1
 *   limit    — default 20, max 100
 */
exports.listRequests = asyncHandler(async (req, res) => {
  const tenantId = requireTenantAdmin(req);

  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const appId  = req.query.app_id  || null;
  const status = req.query.status  || null;

  const validStatuses = ['pending', 'approved', 'rejected'];
  if (status && !validStatuses.includes(status)) {
    throw new ValidationError(`status must be one of: ${validStatuses.join(', ')}`);
  }

  const conditions = ['rr.tenant_id = $1'];
  const params     = [tenantId];
  let   paramIdx   = 2;

  if (appId) {
    conditions.push(`rr.verification_app_id = $${paramIdx}`);
    params.push(appId);
    paramIdx++;
  }
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
         rr.updated_at,
         va.id        AS app_id,
         va.app_name,
         c.phone_e164 AS customer_phone,
         c.full_name  AS customer_name,
         c.email      AS customer_email,
         up.total_points AS current_balance
       FROM redemption_requests rr
       LEFT JOIN verification_apps va ON va.id = rr.verification_app_id
       LEFT JOIN customers c   ON c.id = rr.customer_id
       LEFT JOIN user_points up
         ON up.customer_id = rr.customer_id AND up.tenant_id = rr.tenant_id
       WHERE ${where}
       ORDER BY rr.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    )
  ]);

  const total      = parseInt(countRes.rows[0].total);
  const totalPages = Math.ceil(total / limit);

  return sendSuccess(res, {
    requests: dataRes.rows.map(r => ({
      id:               r.id,
      points_requested: r.points_requested,
      status:           r.status,
      notes:            r.notes || null,
      rejection_reason: r.rejection_reason || null,
      processed_at:     r.processed_at || null,
      created_at:       r.created_at,
      updated_at:       r.updated_at,
      app: {
        id:   r.app_id || null,
        name: r.app_name || null
      },
      customer: {
        phone:   r.customer_phone,
        name:    r.customer_name  || null,
        email:   r.customer_email || null,
        current_balance: r.current_balance !== null ? parseInt(r.current_balance) : null
      }
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
 * GET /api/redemptions/summary
 *
 * Returns counts of pending/approved/rejected per app for the tenant.
 * Query params: app_id (optional — filter to one app)
 */
exports.getSummary = asyncHandler(async (req, res) => {
  const tenantId = requireTenantAdmin(req);
  const appId    = req.query.app_id || null;

  const params     = [tenantId];
  let   appFilter  = '';
  if (appId) {
    params.push(appId);
    appFilter = `AND rr.verification_app_id = $${params.length}`;
  }

  const res_ = await db.query(
    `SELECT
       va.id        AS app_id,
       va.app_name,
       rr.status,
       COUNT(*)     AS count
     FROM redemption_requests rr
     LEFT JOIN verification_apps va ON va.id = rr.verification_app_id
     WHERE rr.tenant_id = $1 ${appFilter}
     GROUP BY va.id, va.app_name, rr.status
     ORDER BY va.app_name, rr.status`,
    params
  );

  // Group by app
  const byApp = {};
  for (const row of res_.rows) {
    const key = row.app_id || '__no_app__';
    if (!byApp[key]) {
      byApp[key] = {
        app_id:   row.app_id,
        app_name: row.app_name || 'Unknown',
        pending:  0,
        approved: 0,
        rejected: 0
      };
    }
    byApp[key][row.status] = parseInt(row.count);
  }

  return sendSuccess(res, { apps: Object.values(byApp) });
});

/**
 * GET /api/redemptions/:id
 *
 * Get a single redemption request detail.
 * Tenant admin can only access requests within their tenant.
 */
exports.getRequest = asyncHandler(async (req, res) => {
  const tenantId  = requireTenantAdmin(req);
  const requestId = req.params.id;

  const result = await db.query(
    `SELECT
       rr.id,
       rr.points_requested,
       rr.status,
       rr.notes,
       rr.rejection_reason,
       rr.processed_by,
       rr.processed_at,
       rr.created_at,
       rr.updated_at,
       va.id        AS app_id,
       va.app_name,
       c.phone_e164 AS customer_phone,
       c.full_name  AS customer_name,
       c.email      AS customer_email,
       up.total_points     AS current_balance,
       up.lifetime_points  AS lifetime_balance,
       u_proc.full_name    AS processed_by_name,
       u_proc.email        AS processed_by_email
     FROM redemption_requests rr
     LEFT JOIN verification_apps va ON va.id = rr.verification_app_id
     LEFT JOIN customers c   ON c.id = rr.customer_id
     LEFT JOIN user_points up
       ON up.customer_id = rr.customer_id AND up.tenant_id = rr.tenant_id
     LEFT JOIN users u_proc ON u_proc.id = rr.processed_by
     WHERE rr.id = $1 AND rr.tenant_id = $2`,
    [requestId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Redemption request');
  }

  const r = result.rows[0];

  return sendSuccess(res, {
    id:               r.id,
    points_requested: r.points_requested,
    status:           r.status,
    notes:            r.notes || null,
    rejection_reason: r.rejection_reason || null,
    processed_at:     r.processed_at || null,
    created_at:       r.created_at,
    updated_at:       r.updated_at,
    app: {
      id:   r.app_id   || null,
      name: r.app_name || null
    },
    customer: {
      phone:            r.customer_phone,
      name:             r.customer_name     || null,
      email:            r.customer_email    || null,
      current_balance:  r.current_balance  !== null ? parseInt(r.current_balance) : null,
      lifetime_balance: r.lifetime_balance !== null ? parseInt(r.lifetime_balance) : null
    },
    processed_by: r.processed_by ? {
      id:    r.processed_by,
      name:  r.processed_by_name  || null,
      email: r.processed_by_email || null
    } : null
  });
});

/**
 * POST /api/redemptions/:id/approve
 *
 * Approve a pending redemption request.
 *
 * - Marks request as 'approved'
 * - Creates a REDEEM entry in points_transactions (audit trail)
 *
 * The points were already deducted from total_points when the request was submitted,
 * so no balance change is needed on approval.
 */
exports.approveRequest = asyncHandler(async (req, res) => {
  const tenantId  = requireTenantAdmin(req);
  const adminId   = req.user.id;
  const requestId = req.params.id;

  const result = await executeTransaction(db, async (client) => {
    // Lock the request row
    const reqRes = await client.query(
      `SELECT rr.id, rr.status, rr.points_requested, rr.customer_id,
              rr.verification_app_id
       FROM redemption_requests rr
       WHERE rr.id = $1 AND rr.tenant_id = $2
       FOR UPDATE`,
      [requestId, tenantId]
    );

    if (reqRes.rows.length === 0) throw new NotFoundError('Redemption request');

    const request = reqRes.rows[0];
    if (request.status !== 'pending') {
      throw new ValidationError(`Cannot approve a request with status '${request.status}'`);
    }

    // Get current balance (for audit record)
    const pointsRes = await client.query(
      `SELECT total_points FROM user_points
       WHERE customer_id = $1 AND tenant_id = $2`,
      [request.customer_id, tenantId]
    );
    const currentBalance = pointsRes.rows.length > 0
      ? parseInt(pointsRes.rows[0].total_points)
      : 0;

    // Create REDEEM points_transaction (audit: these points have been paid out)
    await client.query(
      `INSERT INTO points_transactions
         (customer_id, tenant_id, transaction_type, points,
          balance_before, balance_after, description, reference_id, reference_type)
       VALUES ($1, $2, 'REDEEM', $3, $4, $4, $5, $6, 'redemption_request')`,
      [
        request.customer_id,
        tenantId,
        request.points_requested,
        currentBalance,
        `Redemption approved: ${request.points_requested} points`,
        request.id
      ]
    );

    // Mark request as approved
    const updRes = await client.query(
      `UPDATE redemption_requests
       SET status = 'approved', processed_by = $1, processed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, status, processed_at`,
      [adminId, requestId]
    );

    return { request: updRes.rows[0], points: request.points_requested, currentBalance };
  });

  return sendSuccess(res, {
    id:               result.request.id,
    status:           result.request.status,
    points_approved:  result.points,
    processed_at:     result.request.processed_at
  }, 'Redemption request approved successfully.');
});

/**
 * POST /api/redemptions/:id/reject
 *
 * Reject a pending redemption request.
 *
 * - Restores the locked points back to the customer's balance
 * - Creates an ADJUST entry in points_transactions (audit trail)
 * - Marks request as 'rejected'
 *
 * Body: { reason? }
 */
exports.rejectRequest = asyncHandler(async (req, res) => {
  const tenantId  = requireTenantAdmin(req);
  const adminId   = req.user.id;
  const requestId = req.params.id;
  const reason    = req.body?.reason || null;

  const result = await executeTransaction(db, async (client) => {
    // Lock the request row
    const reqRes = await client.query(
      `SELECT rr.id, rr.status, rr.points_requested, rr.customer_id
       FROM redemption_requests rr
       WHERE rr.id = $1 AND rr.tenant_id = $2
       FOR UPDATE`,
      [requestId, tenantId]
    );

    if (reqRes.rows.length === 0) throw new NotFoundError('Redemption request');

    const request = reqRes.rows[0];
    if (request.status !== 'pending') {
      throw new ValidationError(`Cannot reject a request with status '${request.status}'`);
    }

    // Restore points to customer — lock user_points row first
    const pointsRes = await client.query(
      `SELECT total_points FROM user_points
       WHERE customer_id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [request.customer_id, tenantId]
    );
    const balanceBefore = pointsRes.rows.length > 0
      ? parseInt(pointsRes.rows[0].total_points)
      : 0;
    const balanceAfter = balanceBefore + request.points_requested;

    await client.query(
      `UPDATE user_points
       SET total_points = total_points + $1, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $2 AND tenant_id = $3`,
      [request.points_requested, request.customer_id, tenantId]
    );

    // Create ADJUST points_transaction (audit: points restored due to rejection)
    await client.query(
      `INSERT INTO points_transactions
         (customer_id, tenant_id, transaction_type, points,
          balance_before, balance_after, description, reference_id, reference_type)
       VALUES ($1, $2, 'ADJUST', $3, $4, $5, $6, $7, 'redemption_request')`,
      [
        request.customer_id,
        tenantId,
        request.points_requested,
        balanceBefore,
        balanceAfter,
        `Redemption rejected: ${request.points_requested} points restored${reason ? ' — ' + reason : ''}`,
        request.id
      ]
    );

    // Mark request as rejected
    const updRes = await client.query(
      `UPDATE redemption_requests
       SET status = 'rejected',
           rejection_reason = $1,
           processed_by = $2,
           processed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, status, rejection_reason, processed_at`,
      [reason, adminId, requestId]
    );

    return {
      request:       updRes.rows[0],
      points:        request.points_requested,
      balanceAfter
    };
  });

  return sendSuccess(res, {
    id:               result.request.id,
    status:           result.request.status,
    rejection_reason: result.request.rejection_reason,
    points_restored:  result.points,
    new_balance:      result.balanceAfter,
    processed_at:     result.request.processed_at
  }, 'Redemption request rejected. Points have been restored to the customer.');
});
