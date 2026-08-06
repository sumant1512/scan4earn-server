/**
 * Ecommerce auth context middleware
 *
 * Resolves the verification-app context used by ecommerce routes and
 * preserves the existing feature-gating behavior without depending on
 * a dedicated ecommerce API-key authentication flow.
 */

const db = require('../config/database');
const featureService = require('../services/feature.service');

async function resolveAppContextFromHeader(req) {
  const verificationAppId = req.headers['x-verification-app-id']
  if (!verificationAppId) {
    return null;
  }

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
    WHERE va.id = $1 AND va.is_active = true
    LIMIT 1
  `, [verificationAppId]);

  return result.rows[0] || null;
}

async function resolveAppContextFromUser(req) {
  const verificationAppId = req.user?.verification_app_id;
  if (!verificationAppId) {
    return null;
  }

  const params = [verificationAppId];
  let query = `
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
    WHERE va.id = $1 AND va.is_active = true
  `;

  if (req.user?.tenantId) {
    query += ` AND va.tenant_id = $2`;
    params.push(req.user.tenantId);
  }

  const result = await db.query(query, params);
  return result.rows[0] || null;
}

function attachApiAuthContext(req, app, authMethod = 'header_only') {
  req.apiAuth = {
    verificationAppId: app.verification_app_id,
    appName: app.app_name,
    appCode: app.app_code,
    tenantId: app.tenant_id,
    tenantName: app.tenant_name,
    subdomainSlug: app.subdomain_slug,
    userId: req.user?.id || null,
    role: req.user?.role || 'API_KEY',
    permissions: req.user?.permissions || [],
    authMethod
  };

  req.apiStartTime = req.apiStartTime || Date.now();
}

const requireVerificationAppContext = async (req, res, next) => {
  try {
    if (req.apiAuth?.verificationAppId && req.apiAuth?.tenantId) {
      req.apiStartTime = req.apiStartTime || Date.now();
      return next();
    }

    const app = await resolveAppContextFromUser(req) || await resolveAppContextFromHeader(req);

    if (!app) {
      return res.status(400).json({
        status: false,
        error: 'bad_request',
        message: 'Verification app context is required'
      });
    }

    attachApiAuthContext(req, app, req.user ? 'jwt' : 'header_only');
    return next();
  } catch (error) {
    console.error('Verification app context resolution error:', error);
    return res.status(500).json({
      status: false,
      error: 'internal_error',
      message: 'Failed to resolve verification app context'
    });
  }
};

/**
 * Resolve ecommerce auth context from the current app-auth session.
 * This preserves the existing request contract for ecommerce routes without
 * relying on a dedicated ecommerce API-key flow.
 */
const authenticateEcommerce = async (req, res, next) => {
  try {
    if (req.apiAuth?.verificationAppId && req.apiAuth?.tenantId) {
      return next();
    }

    const app = await resolveAppContextFromUser(req) || await resolveAppContextFromHeader(req);

    if (!app) {
      return res.status(401).json({
        status: false,
        error: 'unauthorized',
        message: 'Verification app context is required'
      });
    }

    attachApiAuthContext(req, app, req.user ? 'jwt' : 'header_only');
    return next();
  } catch (error) {
    console.error('E-commerce auth context error:', error);
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
  requireCustomerRef,
  requireVerificationAppContext
};
