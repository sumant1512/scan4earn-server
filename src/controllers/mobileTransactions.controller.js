/**
 * Mobile Transactions Controller
 * Unified transaction history for CUSTOMER and DEALER roles.
 *
 * GET /api/mobile/v1/transactions
 *   - CUSTOMER: returns scan (EARN) events and redemption (REDEEM) events
 *   - DEALER:   returns all point credit (scan) and debit events
 *
 * Query params:
 *   page   (default 1)
 *   limit  (default 20, max 100)
 *   type   "scan" | "redeem"  — filter by event category
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  AuthenticationError,
  ForbiddenError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const { sendSuccess } = require('../modules/common/utils/response.util');

// ─── helpers ─────────────────────────────────────────────────────────────────

function parsePagination(query) {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  return { page, limit, offset: (page - 1) * limit };
}

async function resolveCustomerId(userId, tenantId) {
  const res = await db.query(
    `SELECT c.id FROM customers c
     JOIN users u ON u.phone_e164 = c.phone_e164
     WHERE u.id = $1 AND c.tenant_id = $2 LIMIT 1`,
    [userId, tenantId]
  );
  if (res.rows.length === 0) throw new NotFoundError('Customer profile');
  return res.rows[0].id;
}

async function resolveDealerId(userId, tenantId, verificationAppId) {
  const res = await db.query(
    `SELECT id FROM dealers
     WHERE user_id = $1 AND tenant_id = $2 AND verification_app_id = $3 AND is_active = true
     LIMIT 1`,
    [userId, tenantId, verificationAppId]
  );
  if (res.rows.length === 0) throw new NotFoundError('Dealer profile for this app');
  return res.rows[0].id;
}

// ─── CUSTOMER transactions ────────────────────────────────────────────────────

/**
 * Build and execute the customer transactions query.
 *
 * Combines three sources into a single timeline ordered by created_at DESC:
 *   1. EARN rows in points_transactions  → event_type "SCAN"
 *   2. REDEEM rows in points_transactions → event_type "REDEEM" (approved payouts)
 *   3. Pending redemption_requests        → event_type "REDEEM" (status "pending")
 *
 * Optionally filter by `type`: "scan" selects source 1 only; "redeem" selects 2+3.
 */
async function fetchCustomerTransactions(customerId, tenantId, { page, limit, offset, typeFilter }) {
  const parts   = [];
  const cparams = [customerId, tenantId]; // shared binding params

  const scanPart = `
    SELECT
      pt.id::text                                           AS id,
      'SCAN'                                                AS event_type,
      pt.points,
      pt.balance_before,
      pt.balance_after,
      c.coupon_code,
      pt.description,
      'completed'                                           AS status,
      pt.created_at
    FROM points_transactions pt
    LEFT JOIN scans   s ON s.id = pt.reference_id AND pt.reference_type = 'scan'
    LEFT JOIN coupons c ON c.id = s.coupon_id
    WHERE pt.customer_id = $1
      AND pt.tenant_id   = $2
      AND pt.transaction_type = 'EARN'
  `;

  const approvedRedeemPart = `
    SELECT
      pt.id::text                                           AS id,
      'REDEEM'                                              AS event_type,
      pt.points,
      pt.balance_before,
      pt.balance_after,
      NULL::text                                            AS coupon_code,
      pt.description,
      'completed'                                           AS status,
      pt.created_at
    FROM points_transactions pt
    WHERE pt.customer_id = $1
      AND pt.tenant_id   = $2
      AND pt.transaction_type = 'REDEEM'
  `;

  const pendingRedeemPart = `
    SELECT
      rr.id::text                                           AS id,
      'REDEEM'                                              AS event_type,
      rr.points_requested                                   AS points,
      NULL::integer                                         AS balance_before,
      NULL::integer                                         AS balance_after,
      NULL::text                                            AS coupon_code,
      rr.notes                                              AS description,
      rr.status,
      rr.created_at
    FROM redemption_requests rr
    WHERE rr.customer_id = $1
      AND rr.tenant_id   = $2
      AND rr.status = 'pending'
  `;

  if (!typeFilter || typeFilter === 'scan') {
    parts.push(scanPart);
  }
  if (!typeFilter || typeFilter === 'redeem') {
    parts.push(approvedRedeemPart, pendingRedeemPart);
  }

  const union  = parts.join('\nUNION ALL\n');
  const cte    = `WITH txns AS (${union})`;

  const [countRes, dataRes] = await Promise.all([
    db.query(`${cte} SELECT COUNT(*) AS total FROM txns`, cparams),
    db.query(
      `${cte}
       SELECT * FROM txns
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [...cparams, limit, offset]
    )
  ]);

  return {
    total:        parseInt(countRes.rows[0].total),
    transactions: dataRes.rows.map(r => ({
      id:            r.id,
      event_type:    r.event_type,   // "SCAN" | "REDEEM"
      points:        r.points,
      balance_before: r.balance_before,
      balance_after:  r.balance_after,
      coupon_code:   r.coupon_code || null,
      description:   r.description  || null,
      status:        r.status,       // "completed" | "pending"
      created_at:    r.created_at
    }))
  };
}

// ─── DEALER transactions ──────────────────────────────────────────────────────

/**
 * Fetch dealer point transactions for a specific app.
 * CREDIT → event_type "SCAN"; DEBIT → event_type "DEBIT"
 */
async function fetchDealerTransactions(dealerId, tenantId, { page, limit, offset, typeFilter }) {
  const params = [dealerId, tenantId];

  let typeCondition = '';
  if (typeFilter === 'scan') {
    typeCondition = "AND type = 'CREDIT'";
  } else if (typeFilter === 'redeem') {
    typeCondition = "AND type = 'DEBIT'";
  }

  const where = `dealer_id = $1 AND tenant_id = $2 ${typeCondition}`;

  const [countRes, dataRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total FROM dealer_point_transactions WHERE ${where}`,
      params
    ),
    db.query(
      `SELECT
         id::text,
         CASE WHEN type = 'CREDIT' THEN 'SCAN' ELSE 'DEBIT' END AS event_type,
         amount                              AS points,
         NULL::integer                       AS balance_before,
         NULL::integer                       AS balance_after,
         metadata->>'coupon_code'            AS coupon_code,
         reason                              AS description,
         'completed'                         AS status,
         created_at
       FROM dealer_point_transactions
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [...params, limit, offset]
    )
  ]);

  return {
    total:        parseInt(countRes.rows[0].total),
    transactions: dataRes.rows.map(r => ({
      id:            r.id,
      event_type:    r.event_type,   // "SCAN" | "DEBIT"
      points:        r.points,
      balance_before: r.balance_before,
      balance_after:  r.balance_after,
      coupon_code:   r.coupon_code || null,
      description:   r.description  || null,
      status:        r.status,
      created_at:    r.created_at
    }))
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/mobile/v1/transactions
 *
 * Role-aware unified transaction history.
 *
 * Query params:
 *   page   — page number (default 1)
 *   limit  — page size (default 20, max 100)
 *   type   — "scan" | "redeem"  (optional filter)
 */
exports.getTransactions = asyncHandler(async (req, res) => {
  const { id: userId, role, tenant_id: tenantId } = req.user;

  if (!tenantId) throw new AuthenticationError('Invalid or expired token');

  const { page, limit, offset } = parsePagination(req.query);
  const rawType = req.query.type ? req.query.type.toLowerCase() : null;

  if (rawType && !['scan', 'redeem'].includes(rawType)) {
    return res.status(400).json({
      status: false,
      message: 'type must be "scan" or "redeem"'
    });
  }

  // ── CUSTOMER ──────────────────────────────────────────────────────────────
  if (role === 'CUSTOMER') {
    const customerId = await resolveCustomerId(userId, tenantId);
    const { total, transactions } = await fetchCustomerTransactions(
      customerId, tenantId,
      { page, limit, offset, typeFilter: rawType }
    );

    const totalPages = Math.ceil(total / limit);
    return sendSuccess(res, {
      role: 'CUSTOMER',
      transactions,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  }

  // ── DEALER ────────────────────────────────────────────────────────────────
  if (role === 'DEALER') {
    const verificationAppId = req.headers['x-app-id'] || req.headers['x-verification-app-id'];
    if (!verificationAppId) {
      return res.status(400).json({
        status: false,
        message: 'X-App-Id header is required for dealer transactions'
      });
    }

    const dealerId = await resolveDealerId(userId, tenantId, verificationAppId);
    const { total, transactions } = await fetchDealerTransactions(
      dealerId, tenantId,
      { page, limit, offset, typeFilter: rawType }
    );

    const totalPages = Math.ceil(total / limit);
    return sendSuccess(res, {
      role: 'DEALER',
      transactions,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  }

  throw new ForbiddenError('Only CUSTOMER and DEALER roles can access transactions');
});
