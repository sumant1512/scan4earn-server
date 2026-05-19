/**
 * E-commerce API Key Authentication Middleware
 *
 * Validates E-commerce API keys for external platform access
 * Checks rate limits and ensures API is enabled
 */

const db = require('../config/database');

/**
 * Authenticate E-commerce API key from Authorization header
 * Expected format: Authorization: Bearer ecommerce_xxxxx
 */
const authenticateEcommerceApiKey = async (req, res, next) => {
  try {
    // Extract API key from Authorization header
    const authHeader = req.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer ecommerce_xxxxx'
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer '

    if (!apiKey || !apiKey.startsWith('ecommerce_')) {
      return res.status(401).json({
        status: false,
        error: 'unauthorized',
        message: 'Invalid E-commerce API key format'
      });
    }

    // Lookup API key in database
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
    `, [apiKey]);

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
      apiType: 'ecommerce'
    };

    // Track request start time for logging
    req.apiStartTime = Date.now();

    next();

  } catch (error) {
    console.error('E-commerce API key authentication error:', error);
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

module.exports = {
  authenticateEcommerceApiKey
};
