/**
 * Public Cashback Controller
 * Multi-step session-based cashback flow for users without the mobile app
 */

const db = require('../config/database');
const cashbackService = require('../services/cashback.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  AuthenticationError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const { validateRequiredFields, validatePhone } = require('../modules/common/validators/common.validator');
const { sendSuccess } = require('../modules/common/utils/response.util');

const SESSION_EXPIRY_MINUTES = 10;

function generateOtp() {
  if (process.env.OTP_DEV_MODE === 'true') return '000000';
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Validate and get active session
 */
async function getActiveSession(sessionId) {
  const result = await db.query(
    `SELECT * FROM scan_sessions WHERE id = $1`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Session not found');
  }

  const session = result.rows[0];

  // Check expiry
  const expiryTime = new Date(session.created_at);
  expiryTime.setMinutes(expiryTime.getMinutes() + SESSION_EXPIRY_MINUTES);
  if (new Date() > expiryTime) {
    await db.query(
      "UPDATE scan_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [sessionId]
    );
    throw new ValidationError('Session expired');
  }

  if (session.status === 'expired' || session.status === 'completed') {
    throw new ValidationError(`Session is ${session.status}`);
  }

  return session;
}

/**
 * Step 1: Start a public cashback session
 */
exports.startSession = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) {
    throw new ValidationError('Tenant required');
  }

  validateRequiredFields(req.body, ['coupon_code']);
  const { coupon_code } = req.body;

  // Validate coupon
  const couponRes = await db.query(
    `SELECT id, coupon_code, status, coupon_points, cashback_amount
     FROM coupons
     WHERE coupon_code = $1 AND tenant_id = $2`,
    [coupon_code, tenant.id]
  );

  if (couponRes.rows.length === 0) {
    throw new NotFoundError('Coupon not found');
  }

  const coupon = couponRes.rows[0];
  if (coupon.status !== 'active') {
    throw new ValidationError('Coupon is not active');
  }

  // Check feature flag
  const featureCheck = await db.query(
    `SELECT is_feature_enabled_for_tenant('coupon_cashback.open_scanning', $1) as enabled`,
    [tenant.id]
  );
  if (!featureCheck.rows[0]?.enabled) {
    throw new ValidationError('Open scanning is not enabled for this tenant');
  }

  const cashbackAmount = coupon.cashback_amount || coupon.coupon_points || 0;

  // Create session
  const sessionRes = await db.query(
    `INSERT INTO scan_sessions (tenant_id, coupon_id, scan_type, status, metadata)
     VALUES ($1, $2, 'public_cashback', 'pending-verification', $3)
     RETURNING id, status, created_at`,
    [tenant.id, coupon.id, JSON.stringify({ coupon_code, cashback_amount: cashbackAmount })]
  );

  return sendSuccess(res, {
    session_id: sessionRes.rows[0].id,
    coupon_code,
    cashback_amount: cashbackAmount,
    status: 'pending-verification'
  });
});

/**
 * Step 2: Submit mobile number and receive OTP
 */
exports.submitMobile = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) throw new ValidationError('Tenant required');

  const { sessionId } = req.params;
  validateRequiredFields(req.body, ['phone_e164']);
  validatePhone(req.body.phone_e164);

  const session = await getActiveSession(sessionId);
  if (session.status !== 'pending-verification') {
    throw new ValidationError('Session is not in the correct state');
  }

  const { phone_e164 } = req.body;
  const otp = generateOtp();
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Store OTP
  await db.query(
    `INSERT INTO mobile_otps (tenant_id, phone_e164, otp_code, expires_at, attempts, is_used)
     VALUES ($1, $2, $3, $4, 0, false)`,
    [tenant.id, phone_e164, otp, expiresAt]
  );

  // Update session with phone
  const existingMeta = session.metadata || {};
  await db.query(
    `UPDATE scan_sessions SET metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [JSON.stringify({ ...existingMeta, phone_e164 }), sessionId]
  );

  console.log(`[Public Cashback OTP] ${phone_e164} → OTP ${otp}`);

  // Mask phone
  const masked = phone_e164.replace(/(\+\d{2})\d+(\d{4})/, '$1****$2');

  return sendSuccess(res, {
    session_id: sessionId,
    mobile_masked: masked
  });
});

/**
 * Step 3: Verify OTP and auto-register
 */
exports.verifyOtp = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) throw new ValidationError('Tenant required');

  const { sessionId } = req.params;
  validateRequiredFields(req.body, ['otp']);

  const session = await getActiveSession(sessionId);
  const phone_e164 = session.metadata?.phone_e164;
  if (!phone_e164) {
    throw new ValidationError('Mobile number not submitted for this session');
  }

  const { otp } = req.body;

  const result = await executeTransaction(db, async (client) => {
    // Verify OTP
    const otpRes = await client.query(
      `SELECT id, otp_code, expires_at, attempts
       FROM mobile_otps
       WHERE tenant_id = $1 AND phone_e164 = $2 AND is_used = false
       ORDER BY created_at DESC LIMIT 1`,
      [tenant.id, phone_e164]
    );

    if (otpRes.rows.length === 0) throw new AuthenticationError('Invalid OTP');

    const otpRow = otpRes.rows[0];
    if (new Date() > new Date(otpRow.expires_at)) {
      await client.query('UPDATE mobile_otps SET is_used = true WHERE id = $1', [otpRow.id]);
      throw new AuthenticationError('OTP expired');
    }
    if (otpRow.attempts >= 3) {
      await client.query('UPDATE mobile_otps SET is_used = true WHERE id = $1', [otpRow.id]);
      throw new AuthenticationError('Too many attempts');
    }
    if (otpRow.otp_code !== otp) {
      await client.query('UPDATE mobile_otps SET attempts = attempts + 1 WHERE id = $1', [otpRow.id]);
      throw new AuthenticationError('Invalid OTP');
    }

    await client.query('UPDATE mobile_otps SET is_used = true WHERE id = $1', [otpRow.id]);

    // Auto-register customer if new
    let isNewUser = false;
    const existingUser = await client.query(
      `SELECT u.id FROM users u WHERE u.tenant_id = $1 AND u.phone_e164 = $2 AND u.role = 'CUSTOMER'`,
      [tenant.id, phone_e164]
    );

    if (existingUser.rows.length === 0) {
      isNewUser = true;
      await client.query(
        `INSERT INTO users (tenant_id, phone_e164, role, is_active) VALUES ($1, $2, 'CUSTOMER', true)`,
        [tenant.id, phone_e164]
      );
    }

    // Upsert customer record
    const custRes = await client.query(
      `INSERT INTO customers (tenant_id, phone_e164, phone_verified)
       VALUES ($1, $2, true)
       ON CONFLICT (tenant_id, phone_e164)
       DO UPDATE SET phone_verified = true, updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [tenant.id, phone_e164]
    );

    // Update session status
    const meta = { ...session.metadata, customer_id: custRes.rows[0].id };
    await client.query(
      `UPDATE scan_sessions SET status = 'verified', metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(meta), sessionId]
    );

    return { verified: true, is_new_user: isNewUser };
  });

  return sendSuccess(res, result);
});

/**
 * Step 4a: Submit UPI ID
 */
exports.submitUpi = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) throw new ValidationError('Tenant required');

  const { sessionId } = req.params;
  validateRequiredFields(req.body, ['upi_id']);

  const session = await getActiveSession(sessionId);
  if (session.status !== 'verified') {
    throw new ValidationError('Session must be verified first');
  }

  const { upi_id } = req.body;
  cashbackService.validateUpiId(upi_id);

  const customerId = session.metadata?.customer_id;
  if (!customerId) throw new ValidationError('Customer not found in session');

  await cashbackService.saveUpiId(customerId, tenant.id, upi_id);

  // Update session
  const meta = { ...session.metadata, upi_id };
  await db.query(
    `UPDATE scan_sessions SET metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [JSON.stringify(meta), sessionId]
  );

  return sendSuccess(res, { upi_id, saved: true });
});

/**
 * Step 5: Confirm cashback — instant UPI payout.
 * Marks coupon USED and creates PROCESSING transaction atomically,
 * then calls the payment gateway. Returns COMPLETED or FAILED.
 */
exports.confirmCashback = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  if (!tenant) throw new ValidationError('Tenant required');

  const { sessionId } = req.params;

  const session = await getActiveSession(sessionId);
  if (session.status !== 'verified') {
    throw new ValidationError('Session must be verified first');
  }

  const customerId = session.metadata?.customer_id;
  const upiId = session.metadata?.upi_id;
  const couponCode = session.metadata?.coupon_code;
  const cashbackAmount = session.metadata?.cashback_amount;

  if (!customerId || !upiId || !couponCode) {
    throw new ValidationError('Session is incomplete. UPI and verification required.');
  }

  const result = await cashbackService.confirmPublicCashback({
    customerId,
    tenantId: tenant.id,
    couponId: session.coupon_id,
    couponCode,
    upiId,
    cashbackAmount,
    sessionId
  });

  return sendSuccess(res, result, result.success ? 'Cashback paid' : 'Cashback recorded, payout failed');
});
