/**
 * Authentication Controller
 * Refactored to use modern error handling and validators
 */
const db = require('../config/database');
const otpService = require('../services/otp.service');
const tokenService = require('../services/token.service');
const emailService = require('../services/email.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ForbiddenError,
  RateLimitError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields,
  validateEmail
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendError
} = require('../modules/common/utils/response.util');

/**
 * Request OTP - Step 1 of login
 */
const requestOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Validation
  validateRequiredFields(req.body, ['email']);
  validateEmail(email);

  const emailLower = email.toLowerCase();

  // Check if user exists (tenant-scoped)
  let userResult;
  if (req.tenant) {
    // Tenant subdomain - scope to tenant only
    userResult = await db.query(
      'SELECT id, is_active, tenant_id FROM users WHERE email = $1 AND tenant_id = $2',
      [emailLower, req.tenant.id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found. Please check your email or contact your administrator.');
    }
  } else {
    // Root domain - allow super admin only
    userResult = await db.query(
      'SELECT id, is_active, tenant_id, role FROM users WHERE email = $1 AND role = \'SUPER_ADMIN\'',
      [emailLower]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found. Please check your email or contact your administrator.');
    }
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    throw new ForbiddenError('Account is deactivated. Please contact administrator');
  }

  // Check rate limit
  const rateLimit = otpService.checkRateLimit(email);
  if (!rateLimit.allowed) {
    throw new RateLimitError(`Too many OTP requests. Please try again in ${rateLimit.waitMinutes} minutes`);
  }

  // Generate and store OTP
  const otp = await otpService.createOTP(email);

  // 🔐 DEBUG: Log OTP to console to support local development / debugging
  console.log(`Generated OTP for ${email}: ${otp}`);

  // Send OTP via email (may be skipped in local/dev if email not configured)
  const emailResult = await emailService.sendOTPEmail(email, "Your Login OTP", otp);
  if (emailResult?.skipped) {
    console.warn('OTP email skipped:', emailResult.reason);
    return sendSuccess(
      res,
      {
        expiresIn: parseInt(process.env.OTP_EXPIRY_MINUTES) || 5
      },
      'OTP generated. Email not sent (check server logs for code).'
    );
  }

  return sendSuccess(res, {
    expiresIn: parseInt(process.env.OTP_EXPIRY_MINUTES) || 5
  }, 'OTP sent to your email address');
});

/**
 * Verify OTP - Step 2 of login
 */
const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  // Validation
  validateRequiredFields(req.body, ['email', 'otp']);

  const emailLower = email.toLowerCase();

  // Verify OTP
  const verification = await otpService.verifyOTP(emailLower, otp);

  if (!verification.valid) {
    throw new AuthenticationError(verification.message);
  }

  // Get user details (tenant-scoped)
  let userResult;
  if (req.tenant) {
    // Tenant subdomain - scope to tenant only
    userResult = await db.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.tenant_id, u.phone,
              t.tenant_name, t.subdomain_slug
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1 AND u.is_active = true AND u.tenant_id = $2`,
      [emailLower, req.tenant.id]
    );

    if (userResult.rows.length === 0) {
      throw new ForbiddenError('User does not belong to this tenant. Please login from your tenant\'s subdomain.');
    }
  } else {
    // Root domain - allow super admin only
    userResult = await db.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.tenant_id, u.phone,
              t.tenant_name, t.subdomain_slug
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1 AND u.is_active = true AND u.role = 'SUPER_ADMIN'`,
      [emailLower]
    );

    if (userResult.rows.length === 0) {
      throw new ForbiddenError('Access denied. Only super admin can login from main domain.');
    }
  }

  const user = userResult.rows[0];

  // Get permissions for user role
  const permissions = getPermissionsByRole(user.role);

  // Generate tokens with subdomain and permissions
  const { accessToken, refreshToken } = tokenService.generateTokens(
    user.id,
    user.role,
    user.tenant_id,
    user.subdomain_slug,
    permissions
  );

  // Log audit
  await db.query(
    `INSERT INTO audit_logs (user_id, action, ip_address, user_agent)
     VALUES ($1, 'LOGIN', $2, $3)`,
    [user.id, req.ip, req.get('user-agent') || 'unknown']
  );

  return sendSuccess(res, {
    accessToken,
    refreshToken,
    userType: user.role,
    subdomain: user.subdomain_slug || null
  }, 'Login successful');
});

/**
 * Get user context (after login)
 */
const getUserContext = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.phone, u.tenant_id,
            t.tenant_name, t.email as tenant_email, t.subdomain_slug
     FROM users u
     LEFT JOIN tenants t ON u.tenant_id = t.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('User');
  }

  const user = result.rows[0];

  // Validate subdomain matches user's tenant (if not super admin)
  if (user.role !== 'SUPER_ADMIN' && user.subdomain_slug && req.subdomain) {
    if (req.subdomain !== user.subdomain_slug) {
      throw new ForbiddenError('Access denied: Subdomain mismatch', null, {
        expectedSubdomain: user.subdomain_slug,
        currentSubdomain: req.subdomain
      });
    }
  }

  const context = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
  };

  // Add tenant info for non-super-admin users
  if (user.tenant_id) {
    context.tenant = {
      id: user.tenant_id,
      tenant_name: user.tenant_name,
      email: user.tenant_email,
      subdomain: user.subdomain_slug
    };
  }

  // Add permissions based on role
  context.permissions = getPermissionsByRole(user.role);

  return sendSuccess(res, context);
});

/**
 * Refresh access token
 * Note: Uses custom error handling for security
 */
const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, 'Refresh token is required', 400);
    }

    // Verify refresh token
    const decoded = await tokenService.verifyRefreshToken(refreshToken);

    // Get permissions for user role
    const permissions = getPermissionsByRole(decoded.role);

    // Generate new tokens with subdomain and refreshed permissions
    const tokens = tokenService.generateTokens(
      decoded.userId,
      decoded.role,
      decoded.tenantId,
      decoded.subdomainSlug,
      permissions
    );

    // Blacklist old tokens
    await tokenService.blacklistTokens(
      decoded.jti,
      decoded.jti,
      decoded.userId
    );

    return sendSuccess(res, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }, 'Token refreshed successfully');

  } catch (error) {
    return sendError(res, error.message || 'Invalid refresh token', 401);
  }
};

/**
 * Logout
 * Note: Always returns success even on error (security best practice)
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const accessJti = req.user?.jti;

    if (!refreshToken) {
      return sendError(res, 'Refresh token is required', 400);
    }

    // Decode refresh token to get jti
    const decoded = tokenService.verifyRefreshToken(refreshToken);

    // Blacklist both tokens
    await tokenService.blacklistTokens(
      accessJti || decoded.jti,
      decoded.jti,
      decoded.userId
    );

    // Log audit
    await db.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent)
       VALUES ($1, 'LOGOUT', $2, $3)`,
      [decoded.userId, req.ip, req.get('user-agent') || 'unknown']
    );

    return sendSuccess(res, null, 'Logged out successfully');

  } catch (error) {
    // Even if there's an error, return success for logout (security best practice)
    return sendSuccess(res, null, 'Logged out successfully');
  }
};

/**
 * Get permissions by role
 * Updated to include granular resource-based permissions
 */
const getPermissionsByRole = (role) => {
  const permissions = {
    SUPER_ADMIN: [
      // System-level permissions
      'manage_tenants',
      'approve_credits',
      'view_all_data',
      'manage_system_settings',
      // All TENANT_ADMIN permissions when acting in tenant context
      'create_app', 'edit_app', 'delete_app', 'view_apps',
      'create_coupon', 'edit_coupon', 'delete_coupon', 'view_coupons',
      'create_batch', 'edit_batch', 'delete_batch', 'view_batches',
      'create_product', 'edit_product', 'delete_product', 'view_products',
      'create_template', 'edit_template', 'delete_template', 'view_templates',
      'request_credits', 'view_credit_balance', 'view_credit_transactions',
      'view_analytics', 'view_scans',
      // User and Permission management
      'manage_tenant_users', 'view_tenant_users',
      'assign_permissions', 'view_permissions',
      'create_tenant_user', 'edit_tenant_user', 'delete_tenant_user',
      // Dealer management
      'manage_dealers', 'view_dealers'
    ],
    TENANT_ADMIN: [
      // App management
      'create_app', 'edit_app', 'delete_app', 'view_apps',
      // Coupon management
      'create_coupon', 'edit_coupon', 'delete_coupon', 'view_coupons',
      // Batch management
      'create_batch', 'edit_batch', 'delete_batch', 'view_batches',
      // Product management
      'create_product', 'edit_product', 'delete_product', 'view_products',
      // Template management
      'create_template', 'edit_template', 'delete_template', 'view_templates',
      // Credit management
      'request_credits', 'view_credit_balance', 'view_credit_transactions',
      // Analytics and reporting
      'view_analytics', 'view_scans',
      // User and Permission management
      'manage_tenant_users', 'view_tenant_users',
      'assign_permissions', 'view_permissions',
      'create_tenant_user', 'edit_tenant_user', 'delete_tenant_user',
      // Dealer management
      'manage_dealers', 'view_dealers'
    ],
    TENANT_USER: [
      // Read-only permissions
      'view_apps',
      'view_coupons',
      'view_batches',
      'view_products',
      'view_templates',
      'view_scans',
      'view_analytics',
      'view_credit_balance',
      'view_credit_transactions',
      'view_tenant_users',
      'view_permissions'
    ],
    DEALER: [
      'dealer_scan',
      'dealer_view_points',
      'dealer_view_profile'
    ],
    CUSTOMER: [
      'customer_browse_products',
      'customer_view_profile',
      'customer_update_profile',
      'customer_cashback'
    ]
  };

  return permissions[role] || [];
};

module.exports = {
  requestOTP,
  verifyOTP,
  getUserContext,
  refreshAccessToken,
  logout
};
