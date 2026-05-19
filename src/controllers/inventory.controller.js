/**
 * Inventory Controller
 * Refactored to use modern error handling and validators
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  sendSuccess
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

/**
 * Update product stock quantity
 * POST /api/products/:id/stock
 */
exports.updateStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, movement_type, notes } = req.body;
  const { userId, tenantId } = req.user;

  if (typeof quantity !== 'number') {
    throw new ValidationError('Quantity must be a number');
  }

  const result = await executeTransaction(db, async (client) => {
    // Get current product
    const productResult = await client.query(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundError('Product');
    }

    const product = productResult.rows[0];

    if (!product.track_inventory) {
      throw new ValidationError('Inventory tracking is not enabled for this product');
    }

    const previousQuantity = product.stock_quantity || 0;
    const newQuantity = previousQuantity + quantity;

    if (newQuantity < 0) {
      throw new ValidationError('Insufficient stock quantity');
    }

    // Update stock quantity (triggers will handle stock_status and logging)
    await client.query(
      'UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newQuantity, id]
    );

    // If movement type is manual, add additional logging with notes
    if (movement_type === 'manual' && notes) {
      await client.query(
        `INSERT INTO stock_movements (
          product_id, tenant_id, movement_type, quantity,
          previous_quantity, new_quantity, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, tenantId, movement_type, Math.abs(quantity), previousQuantity, newQuantity, notes, userId]
      );
    }

    // Check if low stock and trigger webhook
    if (newQuantity <= product.low_stock_threshold && previousQuantity > product.low_stock_threshold) {
      // Trigger low stock webhook (async, don't wait)
      triggerWebhook(tenantId, product.verification_app_id, 'low_stock', {
        product_id: id,
        product_name: product.product_name,
        stock_quantity: newQuantity,
        low_stock_threshold: product.low_stock_threshold
      }).catch(() => {}); // Silently fail webhook triggers
    }

    return {
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
      movement: quantity
    };
  });

  return sendSuccess(res, result, 'Stock updated successfully');
});

/**
 * Get stock movements for a product
 * GET /api/products/:id/stock/movements
 */
exports.getStockMovements = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const result = await db.query(
    `SELECT * FROM stock_movements
     WHERE product_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [id, tenantId, limit, offset]
  );

  const countResult = await db.query(
    'SELECT COUNT(*) FROM stock_movements WHERE product_id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  return sendSuccess(res, {
    movements: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    }
  });
});

/**
 * Get low stock products
 * GET /api/inventory/low-stock
 */
exports.getLowStockProducts = asyncHandler(async (req, res) => {
  const { tenantId } = req.user;
  const { verification_app_id } = req.query;

  let query = `
    SELECT p.*
    FROM products p
    WHERE p.tenant_id = $1
      AND p.track_inventory = true
      AND p.stock_status = 'low_stock'
  `;
  const params = [tenantId];

  if (verification_app_id) {
    query += ' AND p.verification_app_id = $2';
    params.push(verification_app_id);
  }

  query += ' ORDER BY p.stock_quantity ASC';

  const result = await db.query(query, params);

  return sendSuccess(res, {
    products: result.rows,
    count: result.rows.length
  });
});

/**
 * Get out of stock products
 * GET /api/inventory/out-of-stock
 */
exports.getOutOfStockProducts = asyncHandler(async (req, res) => {
  const { tenantId } = req.user;
  const { verification_app_id } = req.query;

  let query = `
    SELECT p.*
    FROM products p
    WHERE p.tenant_id = $1
      AND p.track_inventory = true
      AND p.stock_status = 'out_of_stock'
  `;
  const params = [tenantId];

  if (verification_app_id) {
    query += ' AND p.verification_app_id = $2';
    params.push(verification_app_id);
  }

  query += ' ORDER BY p.updated_at DESC';

  const result = await db.query(query, params);

  return sendSuccess(res, {
    products: result.rows,
    count: result.rows.length
  });
});

/**
 * Helper function to trigger webhooks
 */
async function triggerWebhook(tenantId, verificationAppId, eventType, payload) {
  try {
    // Get active webhooks for this event
    const webhooks = await db.query(
      `SELECT * FROM webhooks
       WHERE tenant_id = $1
         AND verification_app_id = $2
         AND event_type = $3
         AND is_active = true`,
      [tenantId, verificationAppId, eventType]
    );

    if (webhooks.rows.length === 0) {
      return;
    }

    // Trigger webhooks (async)
    for (const webhook of webhooks.rows) {
      const webhookPayload = {
        event_type: eventType,
        timestamp: new Date().toISOString(),
        data: payload
      };

      // Log webhook attempt
      const logResult = await db.query(
        `INSERT INTO webhook_logs (webhook_id, event_type, payload, delivery_status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [webhook.id, eventType, JSON.stringify(webhookPayload)]
      );

      const logId = logResult.rows[0].id;

      // Make HTTP request (in background, don't block)
      fetch(webhook.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': generateSignature(webhookPayload, webhook.secret_key)
        },
        body: JSON.stringify(webhookPayload),
        timeout: webhook.timeout_seconds * 1000
      })
        .then(async response => {
          const responseBody = await response.text();
          await db.query(
            `UPDATE webhook_logs
             SET delivery_status = $1, response_status = $2,
                 response_body = $3, last_attempt_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [response.ok ? 'success' : 'failed', response.status, responseBody, logId]
          );
        })
        .catch(async error => {
          await db.query(
            `UPDATE webhook_logs
             SET delivery_status = 'failed', response_body = $1,
                 last_attempt_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [error.message, logId]
          );
        });
    }
  } catch (error) {
    // Silently fail webhook triggers
  }
}

/**
 * Generate webhook signature for validation
 */
function generateSignature(payload, secretKey) {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secretKey || 'default_secret');
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

module.exports = exports;
