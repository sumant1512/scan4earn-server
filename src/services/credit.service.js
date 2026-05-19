/**
 * Credit Service
 * Handles all credit-related business logic with tenant isolation
 */

const db = require("../config/database");

class CreditService {
  /**
   * Get credit requests with filtering
   * @param {Object} options - Filter options
   * @param {string} options.tenantId - Tenant ID (null for super admin to get all)
   * @param {string} options.status - Request status (pending/approved/rejected/history/all)
   * @param {number} options.page - Page number
   * @param {number} options.limit - Items per page
   * @param {boolean} options.isSuperAdmin - Is requester super admin
   */
  async getRequests({
    tenantId,
    status = "pending",
    page = 1,
    limit = 20,
    isSuperAdmin,
  }) {
    // Security: Non-admin must have tenant context
    if (!isSuperAdmin && !tenantId) {
      throw new Error("Tenant context required for non-admin users");
    }

    let query = `
      SELECT
        cr.id,
        cr.tenant_id,
        cr.requested_by,
        cr.requested_amount,
        cr.justification,
        cr.status,
        cr.processed_by,
        cr.processed_at,
        cr.rejection_reason,
        cr.requested_at,
        cr.created_at,
        cr.updated_at,
        t.tenant_name,
        t.email as contact_email,
        u_req.full_name as requested_by_name,
        u_req.email as requested_by_email,
        u_proc.full_name as processed_by_name
      FROM credit_requests cr
      JOIN tenants t ON cr.tenant_id = t.id
      LEFT JOIN users u_req ON cr.requested_by = u_req.id
      LEFT JOIN users u_proc ON cr.processed_by = u_proc.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Tenant isolation
    if (tenantId) {
      query += ` AND cr.tenant_id = $${paramIndex}`;
      params.push(tenantId);
      paramIndex++;
    }

    // Status filtering
    if (status === "history") {
      // History = approved + rejected (no pending)
      query += ` AND cr.status IN ('approved', 'rejected')`;
    } else if (status !== "all") {
      // Specific status
      query += ` AND cr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    // If status='all', no additional filter (shows pending + approved + rejected)

    // Ordering
    query += ` ORDER BY cr.requested_at DESC`;

    // Pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*)
      FROM credit_requests cr
      WHERE 1=1
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (tenantId) {
      countQuery += ` AND cr.tenant_id = $${countParamIndex}`;
      countParams.push(tenantId);
      countParamIndex++;
    }

    if (status === "history") {
      countQuery += ` AND cr.status IN ('approved', 'rejected')`;
    } else if (status !== "all") {
      countQuery += ` AND cr.status = $${countParamIndex}`;
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);

    return {
      requests: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(
          parseInt(countResult.rows[0].count) / parseInt(limit),
        ),
      },
    };
  }

  /**
   * Get credit transactions with filtering
   * Includes both actual transactions and rejected credit requests
   * @param {Object} options - Filter options
   * @param {string} options.tenantId - Tenant ID (null for super admin to get all)
   * @param {string} options.type - Transaction type (CREDIT/DEBIT/REFUND/all)
   * @param {string} options.appId - Optional app filter
   * @param {number} options.page - Page number
   * @param {number} options.limit - Items per page
   * @param {boolean} options.isSuperAdmin - Is requester super admin
   */
  async getTransactions({
    tenantId,
    type = "all",
    appId,
    page = 1,
    limit = 20,
    isSuperAdmin,
  }) {
    // Security: Non-admin must have tenant context
    if (!isSuperAdmin && !tenantId) {
      throw new Error("Tenant context required for non-admin users");
    }

    // Build transactions query
    let transactionsQuery = `
      SELECT DISTINCT
        ct.id,
        ct.tenant_id,
        ct.transaction_type,
        ct.amount,
        ct.balance_before,
        ct.balance_after,
        ct.description,
        ct.reference_type,
        ct.reference_id,
        ct.created_at,
        ct.created_by,
        t.tenant_name,
        u.full_name as created_by_name,
        u.email as created_by_email,
        u_proc.full_name as processed_by_name,
        NULL as justification,
        NULL as rejection_reason
      FROM credit_transactions ct
      JOIN tenants t ON ct.tenant_id = t.id
      LEFT JOIN users u ON ct.created_by = u.id
      LEFT JOIN credit_requests cr_ref ON ct.reference_id = cr_ref.id AND ct.reference_type = 'CREDIT_APPROVAL'
      LEFT JOIN users u_proc ON cr_ref.processed_by = u_proc.id
      LEFT JOIN coupon_batches b ON ct.reference_id = b.id AND ct.reference_type = 'COUPON_CREATION'
      LEFT JOIN coupons c ON ct.reference_id = c.id AND ct.reference_type IN ('COUPON_CREATION', 'COUPON_EDIT')
      WHERE 1=1
    `;

    // Build rejected requests query
    let rejectedQuery = `
      SELECT
        cr.id,
        cr.tenant_id,
        'REJECTED' as transaction_type,
        cr.requested_amount as amount,
        NULL as balance_before,
        NULL as balance_after,
        'Credit Request Rejected' as description,
        'CREDIT_REQUEST' as reference_type,
        cr.id as reference_id,
        cr.processed_at as created_at,
        cr.requested_by as created_by,
        t.tenant_name,
        u_req.full_name as created_by_name,
        u_req.email as created_by_email,
        u_proc.full_name as processed_by_name,
        cr.justification,
        cr.rejection_reason
      FROM credit_requests cr
      JOIN tenants t ON cr.tenant_id = t.id
      LEFT JOIN users u_req ON cr.requested_by = u_req.id
      LEFT JOIN users u_proc ON cr.processed_by = u_proc.id
      WHERE cr.status = 'rejected'
    `;

    const params = [];
    let paramIndex = 1;

    // Apply tenant isolation to both queries
    if (tenantId) {
      transactionsQuery += ` AND ct.tenant_id = $${paramIndex}`;
      rejectedQuery += ` AND cr.tenant_id = $${paramIndex}`;
      params.push(tenantId);
      paramIndex++;
    }

    // Apply type filtering to transactions query
    if (type !== "all") {
      transactionsQuery += ` AND ct.transaction_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    // Apply app filtering to transactions query
    if (appId) {
      transactionsQuery += ` AND (b.verification_app_id = $${paramIndex} OR c.verification_app_id = $${paramIndex} OR ct.reference_type = 'CREDIT_APPROVAL')`;
      params.push(appId);
      paramIndex++;
    }

    // Combine transactions and rejected requests using UNION ALL
    const offset = (page - 1) * limit;
    const combinedQuery = `
      WITH combined_data AS (
        ${transactionsQuery}
        UNION ALL
        ${rejectedQuery}
      )
      SELECT * FROM combined_data
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Add pagination params
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(combinedQuery, params);

    // Get total count
    const countParams = [];
    let countParamIndex = 1;

    // Build count query with same filters
    let transactionsCountQuery = `
      SELECT COUNT(DISTINCT ct.id)
      FROM credit_transactions ct
      LEFT JOIN coupon_batches b ON ct.reference_id = b.id AND ct.reference_type = 'COUPON_CREATION'
      LEFT JOIN coupons c ON ct.reference_id = c.id AND ct.reference_type IN ('COUPON_CREATION', 'COUPON_EDIT')
      WHERE 1=1
    `;

    let rejectedCountQuery = `
      SELECT COUNT(*)
      FROM credit_requests cr
      WHERE cr.status = 'rejected'
    `;

    if (tenantId) {
      transactionsCountQuery += ` AND ct.tenant_id = $${countParamIndex}`;
      rejectedCountQuery += ` AND cr.tenant_id = $${countParamIndex}`;
      countParams.push(tenantId);
      countParamIndex++;
    }

    if (type !== "all") {
      transactionsCountQuery += ` AND ct.transaction_type = $${countParamIndex}`;
      countParams.push(type);
      countParamIndex++;
    }

    if (appId) {
      transactionsCountQuery += ` AND (b.verification_app_id = $${countParamIndex} OR c.verification_app_id = $${countParamIndex} OR ct.reference_type = 'CREDIT_APPROVAL')`;
      countParams.push(appId);
    }

    const countQuery = `
      SELECT (
        (${transactionsCountQuery}) + (${rejectedCountQuery})
      ) as total
    `;

    const countResult = await db.query(countQuery, countParams);

    return {
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(
          parseInt(countResult.rows[0].total) / parseInt(limit),
        ),
      },
    };
  }

  /**
   * Get credit balance for a tenant
   * @param {string} tenantId - Tenant ID
   */
  async getBalance(tenantId) {
    if (!tenantId) {
      throw new Error("Tenant ID required");
    }

    const balanceResult = await db.query(
      "SELECT * FROM tenant_credit_balance WHERE tenant_id = $1",
      [tenantId],
    );

    const couponsResult = await db.query(
      "SELECT COUNT(*) as total_coupons_created FROM coupons WHERE tenant_id = $1",
      [tenantId],
    );

    if (balanceResult.rows.length === 0) {
      return {
        balance: 0,
        total_received: 0,
        total_spent: 0,
        total_coupons_created:
          parseInt(couponsResult.rows[0].total_coupons_created) || 0,
      };
    }

    return {
      ...balanceResult.rows[0],
      total_coupons_created:
        parseInt(couponsResult.rows[0].total_coupons_created) || 0,
    };
  }
}

module.exports = new CreditService();
