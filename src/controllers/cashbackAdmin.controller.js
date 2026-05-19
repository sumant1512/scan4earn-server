/**
 * Cashback Admin Controller
 * Tenant admin endpoints for viewing and managing cashback transactions.
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const { validatePagination } = require('../modules/common/validators/common.validator');
const { sendPaginated } = require('../modules/common/utils/response.util');

/**
 * GET /api/cashback/transactions
 * List all cashback transactions for the authenticated tenant.
 * Supports pagination, status filter, and date range.
 */
exports.getTransactions = asyncHandler(async (req, res) => {
  const { tenant_id } = req.user;
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const { status, from, to } = req.query;

  const offset = (page - 1) * limit;
  const params = [tenant_id];
  let where = 'ct.tenant_id = $1';

  if (status) {
    params.push(status.toUpperCase());
    where += ` AND ct.status = $${params.length}`;
  }
  if (from) {
    params.push(from);
    where += ` AND ct.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND ct.created_at <= $${params.length}`;
  }

  const countRes = await db.query(
    `SELECT COUNT(*) AS total FROM cashback_transactions ct WHERE ${where}`,
    params
  );
  const total = parseInt(countRes.rows[0].total);

  params.push(limit, offset);
  const dataRes = await db.query(
    `SELECT
       ct.id,
       ct.coupon_code,
       ct.amount,
       ct.upi_id,
       ct.status,
       ct.gateway_transaction_id,
       ct.payout_reference,
       ct.failure_reason,
       ct.created_at,
       ct.updated_at
     FROM cashback_transactions ct
     WHERE ${where}
     ORDER BY ct.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return sendPaginated(res, dataRes.rows, page, limit, total, 'transactions');
});
