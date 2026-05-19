const db = require('../config/database');

/**
 * Middleware to authenticate external app API requests using API key
 * Validates API key from Authorization header and sets app context
 */
const authenticateAppApiKey = async (req, res, next) => {
  try {
    // Extract API key from Authorization header (format: "Bearer <api_key>")
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        message: 'Missing or invalid Authorization header. Format: Bearer <api_key>'
      });
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer " prefix

    if (!apiKey) {
      return res.status(401).json({
        status: false,
        message: 'API key is required'
      });
    }

    // Look up verification app by API key
    const result = await db.query(
      `SELECT
        va.id,
        va.app_name,
        va.code,
        va.is_active,
        va.tenant_id,
        t.tenant_name,
        t.subdomain_slug
      FROM verification_apps va
      INNER JOIN tenants t ON va.tenant_id = t.id
      WHERE va.api_key = $1`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: false,
        message: 'Invalid API key'
      });
    }

    const app = result.rows[0];

    // Check if app is active
    if (!app.is_active) {
      return res.status(403).json({
        status: false,
        message: 'This application has been deactivated. Please contact the tenant administrator.'
      });
    }

    // Attach app context to request for use in controllers
    req.appContext = {
      verificationAppId: app.id,
      appName: app.app_name,
      appCode: app.code,
      tenantId: app.tenant_id,
      tenantName: app.tenant_name,
      subdomain: app.subdomain_slug
    };

    next();
  } catch (error) {
    console.error('App API key authentication error:', error);
    res.status(500).json({
      status: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

module.exports = { authenticateAppApiKey };
