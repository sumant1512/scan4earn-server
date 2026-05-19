/**
 * API Configuration Controller
 * Refactored to use modern error handling and validators
 *
 * Handles API key management and configuration for verification apps
 * Supports Mobile App API v2 and E-commerce API
 */

const db = require('../config/database');
const crypto = require('crypto');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError,
  ConflictError
} = require('../modules/common/errors/AppError');
const {
  sendSuccess
} = require('../modules/common/utils/response.util');

/**
 * Generate a secure API key
 */
function generateApiKey(prefix = 'sk') {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${randomBytes}`;
}

/**
 * Hash API key for storage (SHA-256)
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * GET /api/verification-apps/:id/api-config
 * Get API configuration for a verification app
 */
exports.getApiConfig = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;

  const result = await db.query(`
    SELECT
      id,
      app_name,
      code as app_code,
      template_id,
      mobile_api_enabled,
      ecommerce_api_enabled,
      mobile_api_key,
      ecommerce_api_key,
      api_rate_limits,
      api_field_mappings
    FROM verification_apps
    WHERE id = $1 AND tenant_id = $2
  `, [id, tenantId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  const config = result.rows[0];

  // Don't send full API keys in response (security)
  if (config.mobile_api_key) {
    config.mobile_api_key_preview = `${config.mobile_api_key.substring(0, 12)}...`;
    delete config.mobile_api_key;
  }

  if (config.ecommerce_api_key) {
    config.ecommerce_api_key_preview = `${config.ecommerce_api_key.substring(0, 12)}...`;
    delete config.ecommerce_api_key;
  }

  return sendSuccess(res, { config });
});

/**
 * PUT /api/verification-apps/:id/api-config
 * Update API configuration (enable/disable APIs, rate limits, field mappings)
 */
exports.updateApiConfig = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;
  const {
    mobile_api_enabled,
    ecommerce_api_enabled,
    template_id,
    api_rate_limits,
    api_field_mappings
  } = req.body;

  // Check if app exists
  const appCheck = await db.query(
    'SELECT id FROM verification_apps WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  // Build update query dynamically
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (mobile_api_enabled !== undefined) {
    updates.push(`mobile_api_enabled = $${paramIndex}`);
    params.push(mobile_api_enabled);
    paramIndex++;
  }

  if (ecommerce_api_enabled !== undefined) {
    updates.push(`ecommerce_api_enabled = $${paramIndex}`);
    params.push(ecommerce_api_enabled);
    paramIndex++;
  }

  if (template_id !== undefined) {
    updates.push(`template_id = $${paramIndex}`);
    params.push(template_id || null);
    paramIndex++;
  }

  if (api_rate_limits) {
    updates.push(`api_rate_limits = $${paramIndex}`);
    params.push(JSON.stringify(api_rate_limits));
    paramIndex++;
  }

  if (api_field_mappings) {
    updates.push(`api_field_mappings = $${paramIndex}`);
    params.push(JSON.stringify(api_field_mappings));
    paramIndex++;
  }

  if (updates.length === 0) {
    throw new ValidationError('No update fields provided', 'no_updates');
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id, tenantId);

  const query = `
    UPDATE verification_apps
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
    RETURNING *
  `;

  const result = await db.query(query, params);

  return sendSuccess(res, { config: result.rows[0] }, 'API configuration updated successfully');
});

/**
 * POST /api/verification-apps/:id/regenerate-mobile-key
 * Regenerate Mobile API key
 */
exports.regenerateMobileKey = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;

  // Check if app exists
  const appCheck = await db.query(
    'SELECT id, app_name FROM verification_apps WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  // Generate new API key
  const newApiKey = generateApiKey('mobile');

  // Update database
  const result = await db.query(`
    UPDATE verification_apps
    SET mobile_api_key = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3
    RETURNING id, app_name, mobile_api_enabled
  `, [newApiKey, id, tenantId]);

  return sendSuccess(res, {
    api_key: newApiKey,
    warning: 'This is the only time you will see the full API key. Please save it securely.',
    app: result.rows[0]
  }, 'Mobile API key regenerated successfully');
});

/**
 * POST /api/verification-apps/:id/regenerate-ecommerce-key
 * Regenerate E-commerce API key
 */
exports.regenerateEcommerceKey = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;

  // Check if app exists
  const appCheck = await db.query(
    'SELECT id, app_name FROM verification_apps WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  // Generate new API key
  const newApiKey = generateApiKey('ecommerce');

  // Update database
  const result = await db.query(`
    UPDATE verification_apps
    SET ecommerce_api_key = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3
    RETURNING id, app_name, ecommerce_api_enabled
  `, [newApiKey, id, tenantId]);

  return sendSuccess(res, {
    api_key: newApiKey,
    warning: 'This is the only time you will see the full API key. Please save it securely.',
    app: result.rows[0]
  }, 'E-commerce API key regenerated successfully');
});

/**
 * POST /api/verification-apps/:id/enable-mobile-api
 * Enable Mobile API and generate initial key
 */
exports.enableMobileApi = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;

  // Check if app exists
  const appCheck = await db.query(
    'SELECT id, app_name, mobile_api_enabled, mobile_api_key FROM verification_apps WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  if (appCheck.rows[0].mobile_api_enabled && appCheck.rows[0].mobile_api_key) {
    throw new ConflictError('Mobile API is already enabled for this app', 'already_enabled');
  }

  // Generate new API key
  const newApiKey = generateApiKey('mobile');

  // Enable and set key
  const result = await db.query(`
    UPDATE verification_apps
    SET mobile_api_enabled = true,
        mobile_api_key = $1,
        api_rate_limits = COALESCE(api_rate_limits, '{"mobile_rpm": 60, "ecommerce_rpm": 120}'::jsonb),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3
    RETURNING id, app_name, mobile_api_enabled
  `, [newApiKey, id, tenantId]);

  return sendSuccess(res, {
    api_key: newApiKey,
    warning: 'This is the only time you will see the full API key. Please save it securely.',
    app: result.rows[0]
  }, 'Mobile API enabled successfully');
});

/**
 * POST /api/verification-apps/:id/enable-ecommerce-api
 * Enable E-commerce API and generate initial key
 */
exports.enableEcommerceApi = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;

  // Check if app exists
  const appCheck = await db.query(
    'SELECT id, app_name, ecommerce_api_enabled, ecommerce_api_key FROM verification_apps WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  if (appCheck.rows[0].ecommerce_api_enabled && appCheck.rows[0].ecommerce_api_key) {
    throw new ConflictError('E-commerce API is already enabled for this app', 'already_enabled');
  }

  // Generate new API key
  const newApiKey = generateApiKey('ecommerce');

  // Enable and set key
  const result = await db.query(`
    UPDATE verification_apps
    SET ecommerce_api_enabled = true,
        ecommerce_api_key = $1,
        api_rate_limits = COALESCE(api_rate_limits, '{"mobile_rpm": 60, "ecommerce_rpm": 120}'::jsonb),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3
    RETURNING id, app_name, ecommerce_api_enabled
  `, [newApiKey, id, tenantId]);

  return sendSuccess(res, {
    api_key: newApiKey,
    warning: 'This is the only time you will see the full API key. Please save it securely.',
    app: result.rows[0]
  }, 'E-commerce API enabled successfully');
});

/**
 * GET /api/verification-apps/:id/api-usage
 * Get API usage statistics
 */
exports.getApiUsage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;
  const { days = 7, api_type } = req.query;

  // Check if app exists
  const appCheck = await db.query(
    'SELECT id FROM verification_apps WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (appCheck.rows.length === 0) {
    throw new NotFoundError('Verification app');
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

  let query = `
    SELECT
      api_type,
      COUNT(*) as total_requests,
      AVG(response_time_ms)::INTEGER as avg_response_time_ms,
      COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
      COUNT(CASE WHEN status_code >= 400 THEN 1 END) as failed_requests,
      DATE(request_timestamp) as date
    FROM api_usage_logs
    WHERE verification_app_id = $1
      AND request_timestamp >= $2
  `;

  const params = [id, cutoffDate];

  if (api_type) {
    query += ` AND api_type = $3`;
    params.push(api_type);
  }

  query += `
    GROUP BY api_type, DATE(request_timestamp)
    ORDER BY date DESC, api_type
  `;

  const result = await db.query(query, params);

  // Get totals
  let totalsQuery = `
    SELECT
      api_type,
      COUNT(*) as total_requests
    FROM api_usage_logs
    WHERE verification_app_id = $1
      AND request_timestamp >= $2
  `;

  const totalsParams = [id, cutoffDate];

  if (api_type) {
    totalsQuery += ` AND api_type = $3`;
    totalsParams.push(api_type);
  }

  totalsQuery += ` GROUP BY api_type`;

  const totalsResult = await db.query(totalsQuery, totalsParams);

  return sendSuccess(res, {
    usage: {
      daily: result.rows,
      totals: totalsResult.rows,
      period_days: parseInt(days)
    }
  });
});
