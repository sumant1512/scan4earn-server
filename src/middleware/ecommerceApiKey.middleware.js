/**
 * E-commerce API Key Authentication Middleware
 *
 * Validates E-commerce API keys for external platform access
 * Checks rate limits and ensures API is enabled
 * Also supports JWT refresh token authentication
 */

const db = require('../config/database');
const featureService = require('../services/feature.service');

/**
 * Authenticate E-commerce API key from Authorization header
 * Supports two methods:
 * 1. API Key: Authorization: Bearer ecommerce_xxxxx
 * 2. JWT Token: Authorization: Bearer <jwt_token>
 */
const authenticateEcommerce = async (req, res, next) => {
  try {
    // Extract API key from Authorization header
    const authHeader = req.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    // Method 1: Try API Key authentication first
    if (token.startsWith('ecommerce_')) {
      const result = await db.query(`
        SELECT
          va.id as verification_app_id,
          va.app_name,
          va.code as app_code,
          va.tenant_id,
          va.ecommerce_api_enabled,
          va.api_rate_limits,
          t.tenant_name,
          t.subdomain_slug
        FROM verification_apps va
        JOIN tenants t ON va.tenant_id = t.id
        WHERE va.ecommerce_api_key = $1 AND va.is_active = true
      `, [token]);

      if (result.rows.length === 0) {
        return res.status(401).json({
          status: false,
          error: 'unauthorized',
          message: 'Invalid E-commerce API key'
        });
      }

      const app = result.rows[0];

      // Check if E-commerce API is enabled
      if (!app.ecommerce_api_enabled) {
        return res.status(403).json({
          status: false,
          error: 'forbidden',
          message: 'E-commerce API is not enabled for this verification app'
        });
      }

      // Check rate limit
      const rateLimits = app.api_rate_limits || {};
      const ecommerceRpm = rateLimits.ecommerce_rpm || 120; // Default 120 requests per minute

      const rateLimitCheck = await checkRateLimit(
        app.verification_app_id,
        'ecommerce',
        ecommerceRpm
      );

      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          status: false,
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Please try again later.',
          retry_after: rateLimitCheck.retryAfter
        });
      }

      // Attach API auth info to request
      req.apiAuth = {
        verificationAppId: app.verification_app_id,
        appName: app.app_name,
        appCode: app.app_code,
        tenantId: app.tenant_id,
        tenantName: app.tenant_name,
        subdomainSlug: app.subdomain_slug,
        userId: null,
        role: 'API_KEY',
        authMethod: 'api_key'
      };

      req.apiStartTime = Date.now();
      return next();
    }

    // Method 2: Try JWT Token authentication
    try {
      const decodedToken = req.user;

      // Get verification app details from tenant
      const appResult = await db.query(`
        SELECT
          va.id as verification_app_id,
          va.app_name,
          va.code as app_code,
          va.tenant_id,
          va.ecommerce_api_enabled,
          va.api_rate_limits,
          t.tenant_name,
          t.subdomain_slug
        FROM verification_apps va
        JOIN tenants t ON va.tenant_id = t.id
        WHERE va.tenant_id = $1 AND va.is_active = true
        LIMIT 1
      `, [decodedToken.tenantId]);

      if (appResult.rows.length === 0) {
        return res.status(403).json({
          status: false,
          error: 'forbidden',
          message: 'No active verification app found for this tenant'
        });
      }

      const app = appResult.rows[0];

      // Check if E-commerce API is enabled
      if (!app.ecommerce_api_enabled) {
        return res.status(403).json({
          status: false,
          error: 'forbidden',
          message: 'E-commerce API is not enabled for this tenant'
        });
      }

      // Check rate limit
      const rateLimits = app.api_rate_limits || {};
      const ecommerceRpm = rateLimits.ecommerce_rpm || 120;

      const rateLimitCheck = await checkRateLimit(
        app.verification_app_id,
        'ecommerce',
        ecommerceRpm
      );

      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          status: false,
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Please try again later.',
          retry_after: rateLimitCheck.retryAfter
        });
      }

      // Attach JWT auth info to request (decoded token data)
      req.apiAuth = {
        verificationAppId: app.verification_app_id,
        appName: app.app_name,
        appCode: app.app_code,
        tenantId: decodedToken.tenantId,
        tenantName: app.tenant_name,
        subdomainSlug: app.subdomain_slug,
        userId: decodedToken.id,
        role: decodedToken.role,
        permissions: decodedToken.permissions || [],
        authMethod: 'jwt_token',
      };

      req.apiStartTime = Date.now();
      return next();
    } catch (jwtError) {
      return res.status(401).json({
        status: false,
        error: 'unauthorized',
        message: 'Invalid authentication token'
      });
    }

  } catch (error) {
    console.error('E-commerce API authentication error:', error);
    res.status(500).json({
      status: false,
      error: 'internal_error',
      message: 'Authentication failed'
    });
  }
};

/**
 * Check rate limit for API key
 * Simple implementation using database - can be replaced with Redis for better performance
 */
async function checkRateLimit(verificationAppId, apiType, limitPerMinute) {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60000);

    const result = await db.query(`
      SELECT COUNT(*) as request_count
      FROM api_usage_logs
      WHERE verification_app_id = $1
        AND api_type = $2
        AND request_timestamp >= $3
    `, [verificationAppId, apiType, oneMinuteAgo]);

    const currentCount = parseInt(result.rows[0].request_count);

    if (currentCount >= limitPerMinute) {
      return {
        allowed: false,
        retryAfter: 60
      };
    }

    return {
      allowed: true,
      remaining: limitPerMinute - currentCount
    };

  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow request on error to avoid blocking legitimate traffic
    return { allowed: true };
  }
}

/**
 * Gate a route behind a sub-feature flag using the ecommerce API key auth context.
 * Reads tenant ID from req.apiAuth.tenantId (NOT req.user — there is no JWT on these routes).
 */
const requireEcommerceFeature = (featureCode) => async (req, res, next) => {
  try {
    const tenantId = req.apiAuth?.tenantId;
    const verificationAppId = req.apiAuth?.verificationAppId;
    if (!tenantId) {
      return res.status(401).json({
        status: false,
        error: 'unauthorized',
        message: 'Tenant context required'
      });
    }

    const isEnabled = await featureService.isFeatureEnabledForVerificationApp(featureCode, verificationAppId);
    if (!isEnabled) {
      return res.status(403).json({
        status: false,
        error: 'forbidden',
        message: `Feature '${featureCode}' is not enabled for this tenant`
      });
    }

    next();
  } catch (error) {
    console.error('Feature flag check error:', error);
    res.status(500).json({
      status: false,
      error: 'internal_error',
      message: 'Feature check failed'
    });
  }
};

/**
 * Require X-Customer-Ref header for customer-scoped endpoints (cart, orders, wishlist).
 * Attaches the value to req.customerRef.
 */
const requireCustomerRef = (req, res, next) => {
  const customerRef = req.headers['x-customer-ref'];
  if (!customerRef || customerRef.trim() === '') {
    return res.status(400).json({
      status: false,
      error: 'bad_request',
      message: 'X-Customer-Ref header is required'
    });
  }
  req.customerRef = customerRef.trim();
  next();
};

module.exports = {
  authenticateEcommerce,
  requireEcommerceFeature,
  requireCustomerRef
};
