/**
 * Cashback Mobile Controller
 * Customer mobile app endpoints for cashback
 */

const cashbackService = require('../services/cashback.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const { validateRequiredFields, validatePagination } = require('../modules/common/validators/common.validator');
const { sendSuccess, sendPaginated } = require('../modules/common/utils/response.util');
const db = require('../config/database');

/**
 * Get customer ID from user context
 */
async function getCustomerId(userId, tenantId) {
  const result = await db.query(
    `SELECT c.id FROM customers c
     JOIN users u ON u.phone_e164 = c.phone_e164 AND u.tenant_id = c.tenant_id
     WHERE u.id = $1 AND c.tenant_id = $2`,
    [userId, tenantId]
  );
  if (result.rows.length === 0) {
    throw new Error('Customer record not found');
  }
  return result.rows[0].id;
}

/**
 * Scan a coupon for cashback — instant UPI payout.
 * Returns COMPLETED or FAILED — never throws on gateway failure.
 */
exports.scan = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;
  validateRequiredFields(req.body, ['coupon_code']);

  const customerId = await getCustomerId(id, tenant_id);
  const result = await cashbackService.scanCoupon(customerId, tenant_id, req.body.coupon_code);

  // Surface the action hint when UPI is missing (ValidationError with action='ADD_UPI'
  // is already handled by the error middleware, but guard here for clarity)
  return sendSuccess(res, result, result.success ? 'Scan successful' : 'Scan recorded, payout failed');
});

/**
 * Retry a FAILED cashback payout.
 * Coupon is already USED — only the payout is retried.
 * Optionally accepts a new upi_id in the request body.
 */
exports.retry = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;
  const { transactionId } = req.params;

  const customerId = await getCustomerId(id, tenant_id);
  const result = await cashbackService.retryCashback(
    transactionId,
    customerId,
    tenant_id,
    req.body.upi_id || null
  );

  return sendSuccess(res, result, result.success ? 'Payout successful' : 'Payout failed');
});

/**
 * Save UPI ID
 */
exports.saveUpi = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;
  validateRequiredFields(req.body, ['upi_id']);

  const customerId = await getCustomerId(id, tenant_id);
  const result = await cashbackService.saveUpiId(customerId, tenant_id, req.body.upi_id);
  return sendSuccess(res, result, 'UPI ID saved successfully');
});

/**
 * Get UPI details
 */
exports.getUpi = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;

  const customerId = await getCustomerId(id, tenant_id);
  const upiDetails = await cashbackService.getUpiDetails(customerId, tenant_id);
  return sendSuccess(res, { upi_details: upiDetails });
});

/**
 * Get cashback history
 */
exports.getHistory = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const { status, from, to } = req.query;

  const customerId = await getCustomerId(id, tenant_id);
  const { transactions, total } = await cashbackService.getCashbackHistory(customerId, tenant_id, { page, limit, status, from, to });
  return sendPaginated(res, transactions, page, limit, total, 'transactions');
});

/**
 * Get cashback balance
 */
exports.getBalance = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;

  const customerId = await getCustomerId(id, tenant_id);
  const balance = await cashbackService.getCashbackBalance(customerId, tenant_id);
  return sendSuccess(res, balance);
});
