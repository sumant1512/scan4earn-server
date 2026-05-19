/**
 * Dealer Mobile Controller
 * Mobile app endpoints for dealers.
 *
 * All endpoints require the X-App-Id header identifying which verification app
 * the dealer is operating under. This enables per-app data isolation.
 */

const dealerScanService = require('../services/dealerScan.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const { validateRequiredFields, validatePagination } = require('../modules/common/validators/common.validator');
const { sendSuccess, sendPaginated } = require('../modules/common/utils/response.util');

/**
 * Extract and validate the X-App-Id header.
 * Returns the verificationAppId string or sends a 400 response.
 */
function getVerificationAppId(req, res) {
  const appId = req.headers['x-app-id'] || req.headers['x-verification-app-id'];
  if (!appId) {
    res.status(400).json({
      status: false,
      message: 'X-App-Id header is required'
    });
    return null;
  }
  return appId;
}

/**
 * Scan a coupon QR code
 */
exports.scan = asyncHandler(async (req, res) => {
  const verificationAppId = getVerificationAppId(req, res);
  if (!verificationAppId) return;

  const { id: userId, tenant_id: tenantId } = req.user;
  validateRequiredFields(req.body, ['coupon_code']);

  const result = await dealerScanService.processDealerScan(userId, tenantId, verificationAppId, req.body.coupon_code);
  return sendSuccess(res, result, 'Scan successful');
});

/**
 * Get points balance for the current app
 */
exports.getPoints = asyncHandler(async (req, res) => {
  const verificationAppId = getVerificationAppId(req, res);
  if (!verificationAppId) return;

  const { id: userId, tenant_id: tenantId } = req.user;
  const points = await dealerScanService.getPoints(userId, tenantId, verificationAppId);
  return sendSuccess(res, points);
});

/**
 * Get point transaction history for the current app
 */
exports.getPointHistory = asyncHandler(async (req, res) => {
  const verificationAppId = getVerificationAppId(req, res);
  if (!verificationAppId) return;

  const { id: userId, tenant_id: tenantId } = req.user;
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const { from, to } = req.query;

  const { transactions, total } = await dealerScanService.getPointHistory(userId, tenantId, verificationAppId, { page, limit, from, to });
  return sendPaginated(res, transactions, page, limit, total, 'transactions');
});

/**
 * Get dealer profile for the current app
 */
exports.getProfile = asyncHandler(async (req, res) => {
  const verificationAppId = getVerificationAppId(req, res);
  if (!verificationAppId) return;

  const { id: userId, tenant_id: tenantId } = req.user;
  const profile = await dealerScanService.getProfile(userId, tenantId, verificationAppId);
  return sendSuccess(res, profile);
});
