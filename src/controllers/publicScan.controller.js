/**
 * Public Scan Controller
 * Refactored to use modern error handling and validators
 */

const db = require('../config/database');
const telemetry = require('../services/telemetry.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendError
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

function maskMobile(e164) {
  if (!e164) return '';
  const last4 = e164.slice(-4);
  return `****${last4}`;
}

function generateOtp() {
  if (process.env.OTP_DEV_MODE === 'true') return '000000';
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.startSession = asyncHandler(async (req, res) => {
  const { coupon_code, device_id } = req.body;
  const tenantId = req.tenant ? req.tenant.id : null;

  validateRequiredFields(req.body, ['coupon_code']);

  const couponRes = await db.query(
    'SELECT tenant_id, coupon_code, status, COALESCE(coupon_points, 0) AS coupon_points FROM coupons WHERE coupon_code = $1 AND ($2::uuid IS NULL OR tenant_id = $2::uuid) LIMIT 1',
    [coupon_code, tenantId]
  );

  if (couponRes.rows.length === 0) {
    return res.status(400).json({ success: false, error: 'invalid_or_redeemed_coupon' });
  }

  const coupon = couponRes.rows[0];

  if (coupon.status !== 'active') {
    return res.status(400).json({ success: false, error: 'invalid_or_redeemed_coupon' });
  }

  const sessionRes = await db.query(
    `INSERT INTO scan_sessions (tenant_id, coupon_code, device_id, status)
     VALUES ($1, $2, $3, 'pending-verification')
     RETURNING id`,
    [coupon.tenant_id, coupon.coupon_code, device_id || null]
  );

  // Telemetry: scan_started
  telemetry.recordEvent('scan_started', {
    tenant_id: coupon.tenant_id,
    session_id: sessionRes.rows[0].id,
    coupon_code: coupon.coupon_code,
    device_id: device_id || null,
    metadata: {}
  });

  return res.json({ success: true, session_id: sessionRes.rows[0].id, coupon_code, status: 'pending-verification' });
});

exports.collectMobile = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { mobile_e164, consent_acceptance } = req.body;

  if (!mobile_e164 || consent_acceptance !== true) {
    return res.status(400).json({ success: false, error: 'invalid_mobile_or_consent' });
  }

  const sessionRes = await db.query('SELECT id, tenant_id, status FROM scan_sessions WHERE id = $1', [sessionId]);

  if (sessionRes.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'session_not_found' });
  }

  const session = sessionRes.rows[0];

  if (session.status !== 'pending-verification') {
    return res.status(400).json({ success: false, error: 'invalid_session_state' });
  }

  const otp = generateOtp();
  await db.query(
    `UPDATE scan_sessions SET mobile_e164 = $1, otp_code = $2, status = 'otp-sent', updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
    [mobile_e164, otp, sessionId]
  );

  // Telemetry: otp_sent
  telemetry.recordEvent('otp_sent', {
    tenant_id: session.tenant_id,
    session_id: sessionId,
    coupon_code: null,
    mobile_e164,
    device_id: null,
    metadata: { mobile_masked: maskMobile(mobile_e164) }
  });

  return res.json({ success: true, challenge_id: sessionId, mobile_masked: maskMobile(mobile_e164) });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { otp_code } = req.body;

  const result = await executeTransaction(db, async (client) => {
    const sessionRes = await client.query(
      `SELECT s.id, s.tenant_id, s.coupon_code, s.mobile_e164, s.otp_code, s.status,
        c.coupon_points, c.status AS coupon_status, c.total_usage_limit, c.current_usage_count
       FROM scan_sessions s
       JOIN coupons c ON c.coupon_code = s.coupon_code AND c.tenant_id = s.tenant_id
       WHERE s.id = $1 FOR UPDATE`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      throw new NotFoundError('Session');
    }

    const s = sessionRes.rows[0];

    if (s.status === 'completed') {
      // Idempotent return: fetch current balance
      const balRes = await client.query('SELECT balance FROM user_points WHERE tenant_id = $1 AND mobile_e164 = $2', [s.tenant_id, s.mobile_e164]);
      const balance = balRes.rows.length ? balRes.rows[0].balance : 0;
      return { success: true, awarded_points: 0, user_balance: balance, coupon_status: 'redeemed' };
    }

    if (s.status !== 'otp-sent') {
      throw new ValidationError('Invalid session state', 'invalid_session_state');
    }

    // Prevent reuse or exceeding per-coupon usage limits
    if (s.coupon_status !== 'active') {
      throw new ValidationError('Invalid or redeemed coupon', 'invalid_or_redeemed_coupon');
    }

    if (s.total_usage_limit !== null && s.current_usage_count !== null && s.current_usage_count >= s.total_usage_limit) {
      throw new ValidationError('Usage limit exceeded', 'usage_limit_exceeded');
    }

    if (!otp_code || otp_code !== s.otp_code) {
      // increment attempts and optionally fail after 3
      const attemptsRes = await client.query('UPDATE scan_sessions SET attempts = COALESCE(attempts,0)+1 WHERE id = $1 RETURNING attempts', [sessionId]);
      if (attemptsRes.rows[0].attempts >= 3) {
        await client.query("UPDATE scan_sessions SET status = 'verification-failed' WHERE id = $1", [sessionId]);
      }

      // Telemetry: otp_failed
      telemetry.recordEvent('otp_failed', {
        tenant_id: s.tenant_id,
        session_id: s.id,
        coupon_code: s.coupon_code,
        mobile_e164: s.mobile_e164,
        metadata: { attempts: attemptsRes.rows[0].attempts }
      });

      throw new ValidationError('OTP failed', 'otp_failed');
    }

    // award points from coupon
    const award = s.coupon_points || 0;

    // upsert balance
    await client.query(
      `INSERT INTO user_points (tenant_id, mobile_e164, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, mobile_e164)
       DO UPDATE SET balance = user_points.balance + EXCLUDED.balance, updated_at = CURRENT_TIMESTAMP`,
      [s.tenant_id, s.mobile_e164, award]
    );

    // insert transaction
    await client.query(
      `INSERT INTO points_transactions (tenant_id, mobile_e164, amount, reason, session_id, coupon_code)
       VALUES ($1, $2, $3, 'scan', $4, $5)`,
      [s.tenant_id, s.mobile_e164, award, s.id, s.coupon_code]
    );

    // mark coupon redeemed
    await client.query(
      `UPDATE coupons SET status = 'used', current_usage_count = COALESCE(current_usage_count,0)+1, updated_at = CURRENT_TIMESTAMP WHERE coupon_code = $1 AND tenant_id = $2`,
      [s.coupon_code, s.tenant_id]
    );

    // complete session
    await client.query("UPDATE scan_sessions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [sessionId]);

    const balRes = await client.query('SELECT balance FROM user_points WHERE tenant_id = $1 AND mobile_e164 = $2', [s.tenant_id, s.mobile_e164]);
    const balance = balRes.rows.length ? balRes.rows[0].balance : award;

    // Telemetry: otp_verified, points_awarded, coupon_redeemed
    telemetry.recordEvent('otp_verified', {
      tenant_id: s.tenant_id,
      session_id: s.id,
      coupon_code: s.coupon_code,
      mobile_e164: s.mobile_e164,
      metadata: {}
    });

    telemetry.recordEvent('points_awarded', {
      tenant_id: s.tenant_id,
      session_id: s.id,
      coupon_code: s.coupon_code,
      mobile_e164: s.mobile_e164,
      metadata: { amount: award, balance }
    });

    telemetry.recordEvent('coupon_redeemed', {
      tenant_id: s.tenant_id,
      session_id: s.id,
      coupon_code: s.coupon_code,
      mobile_e164: s.mobile_e164,
      metadata: {}
    });

    return { success: true, awarded_points: award, user_balance: balance, coupon_status: 'redeemed' };
  });

  // Handle special validation errors with custom status codes
  if (result.success === false) {
    const statusCode = result.error === 'otp_failed' ? 403 : 400;
    return res.status(statusCode).json(result);
  }

  return res.json(result);
});
