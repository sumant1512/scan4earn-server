/**
 * Mobile Authentication Controller
 * Handles CUSTOMER and DEALER OTP-based authentication
 */

const db = require('../config/database');
const tokenService = require('../services/token.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ForbiddenError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields,
  validatePhone
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendError
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

function generateOtp() {
  if (process.env.OTP_DEV_MODE === 'true') return '000000';
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// Internal OTP helpers
// ============================================

async function _verifyOtpRecord(client, tenantId, phone_e164, otp) {
  const otpRes = await client.query(
    `SELECT id, otp_code, expires_at, attempts, is_used
     FROM mobile_otps
     WHERE tenant_id = $1 AND phone_e164 = $2 AND is_used = false
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, phone_e164]
  );

  if (otpRes.rows.length === 0) {
    throw new AuthenticationError('Invalid OTP', 'otp_invalid');
  }

  const row = otpRes.rows[0];

  if (new Date() > new Date(row.expires_at)) {
    await client.query('UPDATE mobile_otps SET is_used = true WHERE id = $1', [row.id]);
    throw new AuthenticationError('OTP expired', 'otp_expired');
  }

  if (row.attempts >= (parseInt(process.env.OTP_MAX_ATTEMPTS) || 3)) {
    await client.query('UPDATE mobile_otps SET is_used = true WHERE id = $1', [row.id]);
    throw new AuthenticationError('Too many attempts', 'otp_attempts_exceeded');
  }

  if (row.otp_code !== otp) {
    await client.query('UPDATE mobile_otps SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw new AuthenticationError('Invalid OTP', 'otp_invalid');
  }

  await client.query('UPDATE mobile_otps SET is_used = true WHERE id = $1', [row.id]);
}

// ============================================
// Customer Auth
// ============================================

/**
 * Request OTP — unified for dealers, customers, and new users.
 * Always sends OTP regardless of whether the phone is already registered.
 * New phones are auto-registered as CUSTOMER on verify.
 */
exports.requestOtp = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  const { phone_e164 } = req.body;

  if (!tenant) {
    throw new ValidationError('Tenant required', 'tenant_required');
  }

  validateRequiredFields(req.body, ['phone_e164']);
  validatePhone(phone_e164);

  const otp = generateOtp();
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Invalidate previous unused OTPs
  await db.query(
    'UPDATE mobile_otps SET is_used = true WHERE tenant_id = $1 AND phone_e164 = $2 AND is_used = false',
    [tenant.id, phone_e164]
  );

  await db.query(
    `INSERT INTO mobile_otps (tenant_id, phone_e164, otp_code, expires_at, attempts, is_used)
     VALUES ($1, $2, $3, $4, 0, false)`,
    [tenant.id, phone_e164, otp, expiresAt]
  );

  console.log(`[Mobile OTP] Tenant ${tenant.id} ${phone_e164} → OTP ${otp}`);

  return sendSuccess(res, { expiresIn: expiryMinutes }, 'OTP sent');
});

/**
 * Verify OTP — unified for dealers, customers, and new users.
 *
 * Resolution order:
 *   1. Phone exists as DEALER  → authenticate as DEALER (no registration)
 *   2. Phone exists as CUSTOMER → authenticate as CUSTOMER
 *   3. Phone is new             → auto-register as CUSTOMER, then authenticate
 *
 * TENANT_ADMIN / SUPER_ADMIN phones are blocked from mobile login.
 */
exports.verifyOtp = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  const { phone_e164, otp } = req.body;

  if (!tenant) {
    throw new ValidationError('Tenant required', 'tenant_required');
  }

  validateRequiredFields(req.body, ['phone_e164', 'otp']);
  validatePhone(phone_e164);

  const result = await executeTransaction(db, async (client) => {
    await _verifyOtpRecord(client, tenant.id, phone_e164, otp);

    // Look up any existing user for this phone in this tenant (any role)
    const existingUser = await client.query(
      `SELECT id, role, is_active FROM users
       WHERE tenant_id = $1 AND phone_e164 = $2
       LIMIT 1`,
      [tenant.id, phone_e164]
    );

    // ── Case 1: Existing user ────────────────────────────────────────────
    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      if (!user.is_active) {
        throw new ForbiddenError('Account is deactivated. Please contact your administrator.');
      }

      // Admin accounts must not log in via the mobile OTP flow
      if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') {
        throw new ForbiddenError('Admin accounts cannot log in via the mobile app.');
      }

      // ── Dealer login ─────────────────────────────────────────────────
      if (user.role === 'DEALER') {
        const activeProfile = await client.query(
          `SELECT 1 FROM dealers
           WHERE user_id = $1 AND tenant_id = $2 AND is_active = true
           LIMIT 1`,
          [user.id, tenant.id]
        );
        if (activeProfile.rows.length === 0) {
          throw new ForbiddenError('Your dealer account has been deactivated. Please contact the administrator.');
        }

        const { accessToken, refreshToken } = tokenService.generateTokens(
          user.id, 'DEALER', tenant.id, tenant.subdomain_slug || null
        );
        return { accessToken, refreshToken, role: 'DEALER', isNewUser: false };
      }

      // ── Customer login ───────────────────────────────────────────────
      if (user.role === 'CUSTOMER') {
        // Ensure the customers profile record exists and mark phone verified
        const custRes = await client.query(
          `SELECT id FROM customers WHERE tenant_id = $1 AND phone_e164 = $2`,
          [tenant.id, phone_e164]
        );
        if (custRes.rows.length === 0) {
          await client.query(
            `INSERT INTO customers (tenant_id, phone_e164, phone_verified) VALUES ($1, $2, true)`,
            [tenant.id, phone_e164]
          );
        } else {
          await client.query(
            `UPDATE customers SET phone_verified = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [custRes.rows[0].id]
          );
        }

        const { accessToken, refreshToken } = tokenService.generateTokens(
          user.id, 'CUSTOMER', tenant.id, tenant.subdomain_slug || null
        );
        return { accessToken, refreshToken, role: 'CUSTOMER', isNewUser: false };
      }
    }

    // ── Case 2: New phone — auto-register as CUSTOMER ────────────────────
    const userRes = await client.query(
      `INSERT INTO users (tenant_id, phone_e164, role, is_active)
       VALUES ($1, $2, 'CUSTOMER', true)
       RETURNING id`,
      [tenant.id, phone_e164]
    );
    const newUserId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO customers (tenant_id, phone_e164, phone_verified) VALUES ($1, $2, true)`,
      [tenant.id, phone_e164]
    );

    const { accessToken, refreshToken } = tokenService.generateTokens(
      newUserId, 'CUSTOMER', tenant.id, tenant.subdomain_slug || null
    );
    return { accessToken, refreshToken, role: 'CUSTOMER', isNewUser: true };
  });

  return sendSuccess(res, {
    accessToken:  result.accessToken,
    refreshToken: result.refreshToken,
    role:         result.role,
    is_new_user:  result.isNewUser
  }, 'Login successful');
});

// ============================================
// Dealer Auth
// ============================================

/**
 * Request OTP for dealer login (dealer must be pre-registered)
 */
exports.dealerRequestOtp = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  const { phone_e164 } = req.body;

  if (!tenant) {
    throw new ValidationError('Tenant required', 'tenant_required');
  }

  validateRequiredFields(req.body, ['phone_e164']);
  validatePhone(phone_e164);

  // Verify dealer exists and is active in this tenant.
  // A dealer user may have multiple rows in `dealers` (one per app).
  // Login is allowed as long as the user account is active AND
  // at least one app profile is active.
  const dealerCheck = await db.query(
    `SELECT u.id, u.is_active
     FROM users u
     WHERE u.tenant_id = $1 AND u.phone_e164 = $2 AND u.role = 'DEALER'
     LIMIT 1`,
    [tenant.id, phone_e164]
  );

  if (dealerCheck.rows.length === 0) {
    throw new NotFoundError('Dealer not found');
  }

  if (!dealerCheck.rows[0].is_active) {
    throw new ForbiddenError('Dealer account is deactivated');
  }

  // Confirm at least one active dealer profile exists across any app
  const activeProfile = await db.query(
    `SELECT 1 FROM dealers WHERE user_id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1`,
    [dealerCheck.rows[0].id, tenant.id]
  );
  if (activeProfile.rows.length === 0) {
    throw new ForbiddenError('Dealer has no active profile in any app');
  }

  const otp = generateOtp();
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Invalidate previous unused OTPs
  await db.query(
    'UPDATE mobile_otps SET is_used = true WHERE tenant_id = $1 AND phone_e164 = $2 AND is_used = false',
    [tenant.id, phone_e164]
  );

  await db.query(
    `INSERT INTO mobile_otps (tenant_id, phone_e164, otp_code, expires_at, attempts, is_used)
     VALUES ($1, $2, $3, $4, 0, false)`,
    [tenant.id, phone_e164, otp, expiresAt]
  );

  console.log(`[Dealer OTP] Tenant ${tenant.id} ${phone_e164} → OTP ${otp}`);

  return sendSuccess(res, { expiresIn: expiryMinutes }, 'OTP sent');
});

/**
 * Verify OTP for dealer login
 */
exports.dealerVerifyOtp = asyncHandler(async (req, res) => {
  const tenant = req.tenant;
  const { phone_e164, otp } = req.body;

  if (!tenant) {
    throw new ValidationError('Tenant required', 'tenant_required');
  }

  validateRequiredFields(req.body, ['phone_e164', 'otp']);
  validatePhone(phone_e164);

  const result = await executeTransaction(db, async (client) => {
    await _verifyOtpRecord(client, tenant.id, phone_e164, otp);

    const userRes = await client.query(
      `SELECT id FROM users
       WHERE tenant_id = $1 AND phone_e164 = $2 AND role = 'DEALER' AND is_active = true`,
      [tenant.id, phone_e164]
    );

    if (userRes.rows.length === 0) {
      throw new NotFoundError('Dealer not found or inactive');
    }

    const user = userRes.rows[0];

    const { accessToken, refreshToken } = tokenService.generateTokens(
      user.id, 'DEALER', tenant.id, tenant.subdomain_slug || null
    );

    return { accessToken, refreshToken };
  });

  return sendSuccess(res, {
    accessToken:  result.accessToken,
    refreshToken: result.refreshToken,
    role:         'DEALER'
  }, 'Login successful');
});

// ============================================
// Profile
// ============================================

/**
 * Get current user profile (CUSTOMER or DEALER)
 */
exports.getMe = asyncHandler(async (req, res) => {
  const { id, role, tenant_id } = req.user;

  if (role === 'CUSTOMER') {
    const result = await db.query(
      `SELECT c.id, c.full_name, c.email, c.phone_e164, c.phone_verified, c.email_verified,
              c.tenant_id, t.tenant_name, t.subdomain_slug
       FROM customers c
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.phone_e164 = (SELECT phone_e164 FROM users WHERE id = $1) AND c.tenant_id = $2`,
      [id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Customer');
    }

    const c = result.rows[0];
    const customerId = c.id;

    // Fetch all points data in parallel
    const [pointsRes, lockedRes, redeemedRes] = await Promise.all([
      // available + lifetime credited
      db.query(
        `SELECT COALESCE(total_points, 0) AS available,
                COALESCE(lifetime_points, 0) AS credited
         FROM user_points
         WHERE customer_id = $1 AND tenant_id = $2`,
        [customerId, tenant_id]
      ),
      // locked = sum of pending redemption requests
      db.query(
        `SELECT COALESCE(SUM(points_requested), 0) AS locked
         FROM redemption_requests
         WHERE customer_id = $1 AND tenant_id = $2 AND status = 'pending'`,
        [customerId, tenant_id]
      ),
      // redeemed = sum of approved REDEEM transactions
      db.query(
        `SELECT COALESCE(SUM(points), 0) AS redeemed
         FROM points_transactions
         WHERE customer_id = $1 AND tenant_id = $2 AND transaction_type = 'REDEEM'`,
        [customerId, tenant_id]
      )
    ]);

    const profileComplete = !!(c.full_name && c.email);
    const pointsRow = pointsRes.rows[0] || { available: 0, credited: 0 };

    return sendSuccess(res, {
      id: customerId,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone_e164,
      role: 'CUSTOMER',
      phoneVerified: c.phone_verified,
      emailVerified: c.email_verified,
      profile_complete: profileComplete,
      points: {
        credited:  parseInt(pointsRow.credited),   // lifetime points earned from scans
        locked:    parseInt(lockedRes.rows[0].locked),    // pending redemption (not yet approved)
        redeemed:  parseInt(redeemedRes.rows[0].redeemed), // approved and paid out
        available: parseInt(pointsRow.available)   // current spendable balance
      },
      tenant: { id: c.tenant_id, name: c.tenant_name, subdomain: c.subdomain_slug }
    });
  }

  if (role === 'DEALER') {
    const verificationAppId = req.headers['x-app-id'] || req.headers['x-verification-app-id'];

    if (verificationAppId) {
      // Full dealer profile scoped to the requested verification app
      const result = await db.query(
        `SELECT u.id, u.full_name, u.email, u.phone_e164,
                t.id AS tenant_id, t.tenant_name, t.subdomain_slug,
                d.id AS dealer_id, d.dealer_code, d.shop_name,
                d.address, d.pincode, d.city, d.state, d.is_active AS dealer_active,
                va.id AS verification_app_id, va.app_name, va.currency,
                COALESCE(dp.balance, 0) AS points_balance
         FROM users u
         JOIN tenants t ON u.tenant_id = t.id
         JOIN dealers d
           ON d.user_id = u.id
           AND d.tenant_id = u.tenant_id
           AND d.verification_app_id = $3
         JOIN verification_apps va ON va.id = d.verification_app_id
         LEFT JOIN dealer_points dp
           ON dp.dealer_id = d.id AND dp.tenant_id = u.tenant_id
         WHERE u.id = $1 AND u.tenant_id = $2`,
        [id, tenant_id, verificationAppId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Dealer profile not found for this app');
      }

      const d = result.rows[0];

      return sendSuccess(res, {
        id:        d.id,
        full_name: d.full_name,
        email:     d.email,
        phone:     d.phone_e164,
        role:      'DEALER',
        dealer: {
          id:                  d.dealer_id,
          dealer_code:         d.dealer_code,
          shop_name:           d.shop_name,
          address:             d.address,
          pincode:             d.pincode,
          city:                d.city,
          state:               d.state,
          is_active:           d.dealer_active,
          verification_app_id: d.verification_app_id,
          app_name:            d.app_name,
          currency:            d.currency,
          points_balance:      Number(d.points_balance)
        },
        tenant: { id: d.tenant_id, name: d.tenant_name, subdomain: d.subdomain_slug }
      });
    }

    // No X-App-Id — return user-level info only
    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone_e164, t.tenant_name, t.subdomain_slug
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Dealer');
    }

    const d = result.rows[0];

    return sendSuccess(res, {
      id:        d.id,
      full_name: d.full_name,
      email:     d.email,
      phone:     d.phone_e164,
      role:      'DEALER',
      tenant:    { id: tenant_id, name: d.tenant_name, subdomain: d.subdomain_slug }
    });
  }

  throw new ForbiddenError('Access denied');
});

// ============================================
// Token Management
// ============================================

/**
 * Refresh access token
 */
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, 'Refresh token is required', 400);
    }

    const decoded = await tokenService.verifyRefreshToken(refreshToken);
    const tokens = tokenService.generateTokens(decoded.userId, decoded.role, decoded.tenantId, decoded.subdomainSlug);

    return sendSuccess(res, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });

  } catch (err) {
    return sendError(res, 'Invalid refresh token', 401);
  }
};

/**
 * Logout — blacklist current tokens
 */
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const decoded = tokenService.verifyRefreshToken(refreshToken);
      await tokenService.blacklistTokens(
        decoded.jti,
        decoded.jti,
        decoded.userId
      );
    }

    return sendSuccess(res, null, 'Logged out');
  } catch (err) {
    // Even if blacklisting fails, still return success
    return sendSuccess(res, null, 'Logged out');
  }
};
