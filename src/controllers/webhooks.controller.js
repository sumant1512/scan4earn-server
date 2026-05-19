/**
 * Webhooks Controller
 * Refactored to use modern error handling and validators
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError,
  ConflictError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendCreated
} = require('../modules/common/utils/response.util');

const VALID_EVENT_TYPES = [
  'low_stock',
  'out_of_stock',
  'product_updated',
  'product_created',
  'product_deleted',
  'order_created',
  'coupon_scanned'
];

/**
 * Register a new webhook
 * POST /api/verification-apps/:id/webhooks
 */
exports.registerWebhook = asyncHandler(async (req, res) => {
  const { id: verificationAppId } = req.params;
  const { event_type, webhook_url, secret_key, retry_count, timeout_seconds } = req.body;
  const { tenantId } = req.user;

  validateRequiredFields(req.body, ['event_type', 'webhook_url']);

  // Validate URL format
  try {
    new URL(webhook_url);
  } catch (err) {
    throw new ValidationError('Invalid webhook URL format', 'invalid_url');
  }

  // Validate event type
  if (!VALID_EVENT_TYPES.includes(event_type)) {
    throw new ValidationError(`Invalid event type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`, 'invalid_event_type');
  }

  // Check if webhook already exists for this app and event
  const existing = await db.query(
    `SELECT id FROM webhooks
     WHERE verification_app_id = $1 AND event_type = $2 AND is_active = true`,
    [verificationAppId, event_type]
  );

  if (existing.rows.length > 0) {
    throw new ConflictError('A webhook already exists for this event type', 'webhook_exists');
  }

  // Create webhook
  const result = await db.query(
    `INSERT INTO webhooks (
      verification_app_id, tenant_id, event_type, webhook_url,
      secret_key, retry_count, timeout_seconds
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      verificationAppId,
      tenantId,
      event_type,
      webhook_url,
      secret_key || null,
      retry_count || 3,
      timeout_seconds || 30
    ]
  );

  return sendCreated(res, { webhook: result.rows[0] }, 'Webhook registered successfully');
});

/**
 * List webhooks for a verification app
 * GET /api/verification-apps/:id/webhooks
 */
exports.listWebhooks = asyncHandler(async (req, res) => {
  const { id: verificationAppId } = req.params;
  const { tenantId } = req.user;

  const result = await db.query(
    `SELECT * FROM webhooks
     WHERE verification_app_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [verificationAppId, tenantId]
  );

  return sendSuccess(res, { webhooks: result.rows });
});

/**
 * Update webhook
 * PUT /api/webhooks/:id
 */
exports.updateWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { webhook_url, secret_key, is_active, retry_count, timeout_seconds } = req.body;
  const { tenantId } = req.user;

  // Verify webhook belongs to tenant
  const existing = await db.query(
    'SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  // Build update query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (webhook_url !== undefined) {
    try {
      new URL(webhook_url);
    } catch (err) {
      throw new ValidationError('Invalid webhook URL format', 'invalid_url');
    }
    updates.push(`webhook_url = $${paramCount++}`);
    values.push(webhook_url);
  }

  if (secret_key !== undefined) {
    updates.push(`secret_key = $${paramCount++}`);
    values.push(secret_key);
  }

  if (is_active !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(is_active);
  }

  if (retry_count !== undefined) {
    updates.push(`retry_count = $${paramCount++}`);
    values.push(retry_count);
  }

  if (timeout_seconds !== undefined) {
    updates.push(`timeout_seconds = $${paramCount++}`);
    values.push(timeout_seconds);
  }

  if (updates.length === 0) {
    throw new ValidationError('No fields to update', 'no_updates');
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await db.query(
    `UPDATE webhooks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  return sendSuccess(res, { webhook: result.rows[0] }, 'Webhook updated successfully');
});

/**
 * Delete webhook
 * DELETE /api/webhooks/:id
 */
exports.deleteWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user;

  const result = await db.query(
    'DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  return sendSuccess(res, null, 'Webhook deleted successfully');
});

/**
 * Get webhook delivery logs
 * GET /api/webhooks/:id/logs
 */
exports.getWebhookLogs = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user;
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;

  // Verify webhook belongs to tenant
  const webhook = await db.query(
    'SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (webhook.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  let query = 'SELECT * FROM webhook_logs WHERE webhook_id = $1';
  const params = [id];

  if (status) {
    query += ' AND delivery_status = $2';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
  params.push(limit, offset);

  const result = await db.query(query, params);

  const countQuery = 'SELECT COUNT(*) FROM webhook_logs WHERE webhook_id = $1' + (status ? ' AND delivery_status = $2' : '');
  const countParams = status ? [id, status] : [id];
  const countResult = await db.query(countQuery, countParams);

  return sendSuccess(res, {
    logs: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    }
  });
});

/**
 * Test webhook (send test event)
 * POST /api/webhooks/:id/test
 */
exports.testWebhook = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user;

  // Get webhook
  const webhook = await db.query(
    'SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (webhook.rows.length === 0) {
    throw new NotFoundError('Webhook');
  }

  const webhookData = webhook.rows[0];

  // Create test payload
  const testPayload = {
    event_type: 'test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook event',
      webhook_id: id
    }
  };

  // Generate signature
  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', webhookData.secret_key || 'default_secret')
    .update(JSON.stringify(testPayload))
    .digest('hex');

  // Send webhook
  const response = await fetch(webhookData.webhook_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature
    },
    body: JSON.stringify(testPayload),
    timeout: webhookData.timeout_seconds * 1000
  });

  const responseBody = await response.text();

  // Log the test
  await db.query(
    `INSERT INTO webhook_logs (webhook_id, event_type, payload, response_status, response_body, delivery_status, last_attempt_at)
     VALUES ($1, 'test', $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [id, JSON.stringify(testPayload), response.status, responseBody, response.ok ? 'success' : 'failed']
  );

  return sendSuccess(res, {
    status: response.status,
    response: responseBody
  }, response.ok ? 'Webhook test successful' : 'Webhook test failed');
});

module.exports = exports;
