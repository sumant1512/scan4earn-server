/**
 * Credit Management Controller (Super Admin)
 * Handles credit approvals and balance tracking
 */

const db = require('../../../config/database');
const emailService = require('../../../services/email.service');
const creditService = require('../../../services/credit.service');

const { ValidationError, NotFoundError, ConflictError } = require('../../common/errors/AppError');
const { asyncHandler } = require('../../common/middleware/errorHandler.middleware');
const { executeTransaction, executeQuery } = require('../../common/utils/database.util');
const { validateRequiredFields, validateNumberRange } = require('../../common/validators/common.validator');
const { sendSuccess, sendCreated, sendNotFound, sendConflict } = require('../../common/utils/response.util');

class CreditController {
  /**
   * Get all credit requests (Super Admin view)
   * GET /api/super-admin/credits/requests
   */
  getAllCreditRequests = asyncHandler(async (req, res) => {
    const { status = 'pending', page = 1, limit = 20, tenant_id } = req.query;
    const { isSuperAdmin } = req.tenantContext;

    if (!isSuperAdmin) {
      throw new ValidationError('This endpoint is for super admins only');
    }

    const result = await creditService.getRequests({
      tenantId: tenant_id || null,
      status,
      page: parseInt(page),
      limit: parseInt(limit),
      isSuperAdmin: true
    });

    return sendSuccess(res, result);
  });

  /**
   * Approve credit request
   * POST /api/super-admin/credits/approve/:id
   */
  approveCreditRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.tenantContext;
    const approvedBy = userId;

    const result = await executeTransaction(db, async (client) => {
      // Get credit request
      const requestResult = await client.query(
        'SELECT * FROM credit_requests WHERE id = $1 AND status = $2',
        [id, 'pending']
      );

      if (requestResult.rows.length === 0) {
        throw new NotFoundError('Credit request or it has already been processed');
      }

      const request = requestResult.rows[0];

      // Get tenant information
      const tenantResult = await client.query(
        'SELECT tenant_name, email FROM tenants WHERE id = $1',
        [request.tenant_id]
      );

      if (tenantResult.rows.length === 0) {
        throw new NotFoundError('Tenant');
      }

      const tenant = tenantResult.rows[0];

      // Get current balance
      const balanceResult = await client.query(
        'SELECT * FROM tenant_credit_balance WHERE tenant_id = $1',
        [request.tenant_id]
      );

      const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;
      const newBalance = currentBalance + request.requested_amount;

      // Update or insert credit balance
      await client.query(
        `INSERT INTO tenant_credit_balance (tenant_id, balance, total_received, total_spent)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (tenant_id)
         DO UPDATE SET
           balance = tenant_credit_balance.balance + $3,
           total_received = tenant_credit_balance.total_received + $3,
           updated_at = CURRENT_TIMESTAMP`,
        [request.tenant_id, newBalance, request.requested_amount]
      );

      // Create transaction record
      await client.query(
        `INSERT INTO credit_transactions
         (tenant_id, transaction_type, amount, balance_before, balance_after,
          reference_id, reference_type, description, created_by)
         VALUES ($1, 'CREDIT', $2, $3, $4, $5, 'CREDIT_APPROVAL', $6, $7)`,
        [
          request.tenant_id,
          request.requested_amount,
          currentBalance,
          newBalance,
          id,
          `Credit approval for request #${id}`,
          request.requested_by
        ]
      );

      // Update request status
      await client.query(
        `UPDATE credit_requests
         SET status = 'approved',
             processed_at = CURRENT_TIMESTAMP,
             processed_by = $1
         WHERE id = $2`,
        [approvedBy, id]
      );

      // Send approval notification email asynchronously
      emailService.sendCreditApprovalEmail(tenant.email, tenant.tenant_name, request.requested_amount)
        .catch(err => console.error('Email notification failed:', err));

      return {
        credits_added: request.requested_amount,
        new_balance: newBalance,
        tenant
      };
    });

    return sendSuccess(res, result, 'Credit request approved successfully');
  });

  /**
   * Reject credit request
   * POST /api/super-admin/credits/reject/:id
   */
  rejectCreditRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const { userId } = req.tenantContext;
    const rejectedBy = userId;

    validateRequiredFields(req.body, ['rejection_reason']);

    const result = await executeTransaction(db, async (client) => {
      // Update request status
      const updateResult = await client.query(
        `UPDATE credit_requests
         SET status = 'rejected',
             processed_at = CURRENT_TIMESTAMP,
             processed_by = $1,
             rejection_reason = $2
         WHERE id = $3 AND status = 'pending'
         RETURNING *`,
        [rejectedBy, rejection_reason, id]
      );

      if (updateResult.rows.length === 0) {
        throw new NotFoundError('Credit request or it has already been processed');
      }

      const request = updateResult.rows[0];

      // Get tenant information
      const tenantResult = await client.query(
        'SELECT tenant_name, email FROM tenants WHERE id = $1',
        [request.tenant_id]
      );

      const tenant = tenantResult.rows.length > 0 ? tenantResult.rows[0] : null;

      // Send rejection notification email asynchronously
      if (tenant) {
        emailService.sendCreditRejectionEmail(tenant.email, tenant.tenant_name, request.requested_amount, rejection_reason)
          .catch(err => console.error('Email notification failed:', err));
      }

      return { request };
    });

    return sendSuccess(res, result, 'Credit request rejected');
  });

  /**
   * Get credit balance for all tenants
   * GET /api/super-admin/credits/balances
   */
  getAllTenantBalances = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT
        t.id as tenant_id,
        t.tenant_name,
        t.email,
        COALESCE(tcb.balance, 0) as balance,
        COALESCE(tcb.total_received, 0) as total_received,
        COALESCE(tcb.total_spent, 0) as total_spent,
        tcb.updated_at as balance_updated_at
      FROM tenants t
      LEFT JOIN tenant_credit_balance tcb ON t.id = tcb.tenant_id
      WHERE t.is_active = true
      ORDER BY t.tenant_name
      LIMIT $1 OFFSET $2
    `;

    const result = await executeQuery(db, query, [limit, offset]);

    const countQuery = 'SELECT COUNT(*) FROM tenants WHERE is_active = true';
    const countResult = await executeQuery(db, countQuery);
    const total = parseInt(countResult.rows[0].count);

    return sendSuccess(res, {
      balances: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get all credit transactions across all tenants (Super Admin)
   * GET /api/credits/transactions
   */
  getAllTransactions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, tenant_id } = req.query;
    const offset = (page - 1) * limit;
    const { isSuperAdmin } = req.tenantContext;

    if (!isSuperAdmin) {
      throw new ValidationError('This endpoint is for super admins only');
    }

    // Build query based on whether tenant_id is provided
    let query, countQuery, params;

    if (tenant_id) {
      // Filter by specific tenant
      query = `
        SELECT
          ct.*,
          t.tenant_name,
          u.full_name as created_by_name,
          u.email as created_by_email
        FROM credit_transactions ct
        LEFT JOIN tenants t ON ct.tenant_id = t.id
        LEFT JOIN users u ON ct.created_by = u.id
        WHERE ct.tenant_id = $1
        ORDER BY ct.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [tenant_id, limit, offset];
      countQuery = 'SELECT COUNT(*) FROM credit_transactions WHERE tenant_id = $1';
    } else {
      // Get all transactions across all tenants
      query = `
        SELECT
          ct.*,
          t.tenant_name,
          u.full_name as created_by_name,
          u.email as created_by_email
        FROM credit_transactions ct
        LEFT JOIN tenants t ON ct.tenant_id = t.id
        LEFT JOIN users u ON ct.created_by = u.id
        ORDER BY ct.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
      countQuery = 'SELECT COUNT(*) FROM credit_transactions';
    }

    const result = await executeQuery(db, query, params);
    const countResult = await executeQuery(db, countQuery, tenant_id ? [tenant_id] : []);
    const total = parseInt(countResult.rows[0].count);

    return sendSuccess(res, {
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  });

  /**
   * Get credit transaction history for a tenant
   * GET /api/credits/transactions/:tenantId
   */
  getTenantTransactionHistory = asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT
        ct.*,
        u.full_name as created_by_name,
        u.email as created_by_email
      FROM credit_transactions ct
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.tenant_id = $1
      ORDER BY ct.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await executeQuery(db, query, [tenantId, limit, offset]);

    const countQuery = 'SELECT COUNT(*) FROM credit_transactions WHERE tenant_id = $1';
    const countResult = await executeQuery(db, countQuery, [tenantId]);
    const total = parseInt(countResult.rows[0].count);

    return sendSuccess(res, {
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  });
}

module.exports = new CreditController();
