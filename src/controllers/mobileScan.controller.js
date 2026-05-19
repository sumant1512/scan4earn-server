/**
 * Mobile Scan Controller
 * Unified scan endpoint for DEALER and CUSTOMER roles.
 */

const db = require('../config/database');
const mobileScanService = require('../services/mobileScan.service');
const dealerScanService = require('../services/dealerScan.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  AuthenticationError,
  NotFoundError,
  ForbiddenError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess
} = require('../modules/common/utils/response.util');

/**
 * POST /api/mobile/v1/scan
 * Unified coupon scan for DEALER and CUSTOMER.
 *
 * Body:   { coupon_code }
 * Header: X-App-Id  (verification app UUID)
 *
 * DEALER  → marks coupon used, awards dealer points
 * CUSTOMER → records scan, awards customer credits
 */
exports.scanCoupon = asyncHandler(async (req, res) => {
  let { coupon_code, location, device_info } = req.body;
  validateRequiredFields(req.body, ['coupon_code']);

  // Accept full scan URLs (e.g. http://demo-brand-one.localhost:8080/scan/DEMO-ACTV-0001)
  if (coupon_code && (coupon_code.startsWith('http://') || coupon_code.startsWith('https://'))) {
    try {
      const segments = new URL(coupon_code).pathname.split('/').filter(Boolean);
      coupon_code = segments[segments.length - 1] || coupon_code;
    } catch (_) { /* leave coupon_code unchanged if URL is malformed */ }
  }

  const verificationAppId = req.headers['x-app-id'] || req.headers['x-verification-app-id'];
  if (!verificationAppId) {
    return res.status(400).json({ status: false, message: 'X-App-Id header is required' });
  }

  const { id: userId, role, tenant_id: tenantId } = req.user;

  if (!tenantId) {
    throw new AuthenticationError('Invalid or expired token');
  }

  // ── DEALER path ────────────────────────────────────────────────────────────
  if (role === 'DEALER') {
    const result = await dealerScanService.processDealerScan(
      userId, tenantId, verificationAppId, coupon_code
    );
    return sendSuccess(res, {
      coupon_code:    result.coupon_code,
      points_awarded: result.points_awarded,
      balance:        result.dealer_balance,
      role:           'DEALER'
    }, 'Scan successful');
  }

  // ── CUSTOMER path ──────────────────────────────────────────────────────────
  if (role === 'CUSTOMER') {
    // Resolve the customers record for this user
    const custRes = await db.query(
      `SELECT c.id, c.phone_e164
       FROM customers c
       JOIN users u ON u.phone_e164 = c.phone_e164
       WHERE u.id = $1 AND c.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId]
    );
    if (custRes.rows.length === 0) {
      throw new NotFoundError('Customer profile');
    }
    const { id: customerId, phone_e164: customerPhone } = custRes.rows[0];

    console.log('Customer scan attempt:', verificationAppId, tenantId)

    // Resolve app_code string from the UUID
    const appRes = await db.query(
      `SELECT code FROM verification_apps
       WHERE id = $1 AND tenant_id = $2 AND is_active = true
       LIMIT 1`,
      [verificationAppId, tenantId]
    );
    if (appRes.rows.length === 0) {
      throw new NotFoundError('Verification app');
    }
    const appCode = appRes.rows[0].code;

    const result = await mobileScanService.processScan({
      customerId,
      customerPhone,
      tenantId,
      couponCode:  coupon_code,
      appCode,
      location,
      scannedAt:   new Date().toISOString(),
      deviceInfo:  device_info
    });

    if (!result.success) {
      return res.status(result.statusCode || 400).json(result);
    }

    return sendSuccess(res, {
      scan_id:        result.scan_id,
      coupon_code:    result.coupon?.code,
      points_awarded: result.reward?.credits_earned,
      balance:        result.reward?.credits_balance,
      role:           'CUSTOMER',
      coupon:         result.coupon,
      scanned_at:     result.scanned_at
    }, 'Scan successful');
  }

  throw new ForbiddenError('Only DEALER and CUSTOMER roles can scan coupons');
});

/**
 * GET /api/mobile/v1/scan/history
 * Get scan transaction history for authenticated customer
 */
exports.getScanHistory = asyncHandler(async (req, res) => {
  const customerId = req.user?.customerId;
  const tenantId = req.tenant?.id;

  if (!customerId || !tenantId) {
    throw new AuthenticationError('Invalid or expired token', 'unauthorized');
  }

  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const status = req.query.status; // 'SUCCESS', 'EXPIRED', etc.
  const app_code = req.query.app_code;
  const from_date = req.query.from_date;
  const to_date = req.query.to_date;
  const sort = req.query.sort || 'desc';

  // Get scan history
  const result = await mobileScanService.getScanHistory({
    customerId,
    tenantId,
    page,
    limit,
    status,
    appCode: app_code,
    fromDate: from_date,
    toDate: to_date,
    sort
  });

  return res.status(200).json(result);
});

/**
 * GET /api/mobile/v1/scan/:id
 * Get specific scan transaction details
 */
exports.getScanDetails = asyncHandler(async (req, res) => {
  const scanId = req.params.id;
  const customerId = req.user?.customerId;
  const tenantId = req.tenant?.id;

  if (!customerId || !tenantId) {
    throw new AuthenticationError('Invalid or expired token', 'unauthorized');
  }

  // Get scan details
  const result = await mobileScanService.getScanDetails({
    scanId,
    customerId,
    tenantId
  });

  if (!result.success) {
    return res.status(404).json(result);
  }

  return res.status(200).json(result);
});

/**
 * GET /api/mobile/v1/scan/stats/summary
 * Get scan statistics for authenticated customer
 */
exports.getScanStats = asyncHandler(async (req, res) => {
  const customerId = req.user?.customerId;
  const tenantId = req.tenant?.id;

  if (!customerId || !tenantId) {
    throw new AuthenticationError('Invalid or expired token', 'unauthorized');
  }

  // Get statistics
  const result = await mobileScanService.getScanStats({
    customerId,
    tenantId
  });

  return res.status(200).json(result);
});
