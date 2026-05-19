/**
 * Credit Management Controller (Tenant Admin)
 * Handles credit balance viewing, requests, and transaction history
 */

const db = require('../../../config/database');
const creditService = require('../../../services/credit.service');
const { ValidationError, NotFoundError } = require('../../common/errors/AppError');
const { asyncHandler } = require('../../common/middleware/errorHandler.middleware');
const { validateRequiredFields, validateNumberRange } = require('../../common/validators/common.validator');
const { sendSuccess, sendCreated } = require('../../common/utils/response.util');

class CreditController {
  /**
   * Get credit balance for tenant
   * GET /api/credits/balance
   */
  getBalance = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenant_id;

    if (!tenantId) {
      throw new ValidationError('Tenant context required');
    }

    // Get balance
    const balanceResult = await db.query(
      `SELECT
        tenant_id,
        balance,
        total_received,
        total_spent,
        updated_at
       FROM tenant_credit_balance
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const balance = balanceResult.rows.length > 0
      ? balanceResult.rows[0]
      : {
          tenant_id: tenantId,
          balance: 0,
          total_received: 0,
          total_spent: 0,
          updated_at: new Date()
        };

    return sendSuccess(res, balance);
  });

  /**
   * Create credit request
   * POST /api/credits/request
   */
  createRequest = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const userId = req.user.id;
    const { requested_amount, justification } = req.body;

    // Validation
    validateRequiredFields(req.body, ['requested_amount']);
    validateNumberRange(requested_amount, 1, 500, 'requested_amount');

    if (!tenantId) {
      throw new ValidationError('Tenant context required');
    }

    // Create credit request
    const result = await db.query(
      `INSERT INTO credit_requests
       (tenant_id, requested_by, requested_amount, justification, status, requested_at)
       VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
       RETURNING *`,
      [tenantId, userId, requested_amount, justification || null]
    );

    const request = result.rows[0];

    return sendCreated(res, { request }, 'Credit request submitted successfully');
  });

  /**
   * Get credit requests for tenant
   * GET /api/credits/requests
   */
  getRequests = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const { status, page = 1, limit = 20 } = req.query;

    if (!tenantId) {
      throw new ValidationError('Tenant context required');
    }

    const result = await creditService.getRequests({
      tenantId,
      status,
      page: parseInt(page),
      limit: parseInt(limit),
      isSuperAdmin: false
    });

    return sendSuccess(res, result);
  });

  /**
   * Get credit transactions for tenant
   * GET /api/credits/transactions
   */
  getTransactions = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const {
      page = 1,
      limit = 20,
      transaction_type,
      start_date,
      end_date
    } = req.query;

    if (!tenantId) {
      throw new ValidationError('Tenant context required');
    }

    let query = `
      SELECT
        ct.id,
        ct.tenant_id,
        ct.transaction_type,
        ct.amount,
        ct.balance_before,
        ct.balance_after,
        ct.reference_id,
        ct.reference_type,
        ct.description,
        ct.created_by,
        ct.created_at,
        u.full_name as created_by_name
      FROM credit_transactions ct
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ct.tenant_id = $1
    `;

    const params = [tenantId];
    let paramIndex = 2;

    // Filter by transaction type
    if (transaction_type) {
      query += ` AND ct.transaction_type = $${paramIndex}`;
      params.push(transaction_type);
      paramIndex++;
    }

    // Filter by date range
    if (start_date) {
      query += ` AND ct.created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND ct.created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY ct.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    return sendSuccess(res, {
      transactions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  });
}

// Export controller instance with bound methods
const controller = new CreditController();

module.exports = {
  getBalance: controller.getBalance,
  createRequest: controller.createRequest,
  getRequests: controller.getRequests,
  getTransactions: controller.getTransactions
};
