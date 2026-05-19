/**
 * E-commerce API Controller
 * Refactored to use modern error handling and validators
 *
 * Provides product catalog integration for e-commerce platforms
 * Requires E-commerce API key authentication
 * Supports read/write operations for product synchronization
 */

const db = require('../config/database');
const attributeValidator = require('../services/attributeValidator.service');
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
 * GET /api/ecommerce/v1/products
 * Get product catalog with dynamic attributes
 * Similar to Mobile API v2 but with additional fields for e-commerce
 */
exports.getProducts = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const {
    page = 1,
    limit = 50,
    template_id,
    search,
    is_active,
    updated_since // ISO date string for incremental sync
  } = req.query;

  const pageSize = Math.min(parseInt(limit), 200); // Higher limit for e-commerce
  const offset = (parseInt(page) - 1) * pageSize;

  let query = `
    SELECT
      p.id,
      p.product_name,
      p.product_sku,
      p.description,
      p.price,
      p.currency,
      p.image_url,
      p.is_active,
      p.created_at,
      p.updated_at,
      pt.id as template_id,
      pt.template_name,
      COALESCE(
        json_object_agg(pav.attribute_key, pav.attribute_value)
        FILTER (WHERE pav.attribute_key IS NOT NULL),
        '{}'::json
      ) as attributes
    FROM products p
    LEFT JOIN product_templates pt ON p.template_id = pt.id
    LEFT JOIN product_attribute_values pav ON p.id = pav.product_id
    WHERE p.tenant_id = $1
      AND p.verification_app_id = $2
  `;

  const params = [tenantId, verificationAppId];
  let paramIndex = 3;

  if (is_active !== undefined) {
    query += ` AND p.is_active = $${paramIndex}`;
    params.push(is_active === 'true');
    paramIndex++;
  }

  if (template_id) {
    query += ` AND p.template_id = $${paramIndex}`;
    params.push(template_id);
    paramIndex++;
  }

  if (search) {
    query += ` AND (p.product_name ILIKE $${paramIndex} OR p.product_sku ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Incremental sync support
  if (updated_since) {
    query += ` AND p.updated_at >= $${paramIndex}`;
    params.push(new Date(updated_since));
    paramIndex++;
  }

  query += `
    GROUP BY p.id, pt.id, pt.template_name
    ORDER BY p.updated_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const result = await db.query(query, params);

  // Get total count
  let countQuery = `SELECT COUNT(*) FROM products p WHERE p.tenant_id = $1 AND p.verification_app_id = $2`;
  const countParams = [tenantId, verificationAppId];
  let countIndex = 3;

  if (is_active !== undefined) {
    countQuery += ` AND p.is_active = $${countIndex}`;
    countParams.push(is_active === 'true');
    countIndex++;
  }
  if (template_id) {
    countQuery += ` AND p.template_id = $${countIndex}`;
    countParams.push(template_id);
    countIndex++;
  }
  if (search) {
    countQuery += ` AND (p.product_name ILIKE $${countIndex} OR p.product_sku ILIKE $${countIndex})`;
    countParams.push(`%${search}%`);
    countIndex++;
  }
  if (updated_since) {
    countQuery += ` AND p.updated_at >= $${countIndex}`;
    countParams.push(new Date(updated_since));
    countIndex++;
  }

  const countResult = await db.query(countQuery, countParams);
  const totalCount = parseInt(countResult.rows[0].count);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, {
    data: {
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      },
      sync_timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/ecommerce/v1/products/:id
 * Get single product with full details
 */
exports.getProduct = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { id } = req.params;

  const result = await db.query(`
    SELECT
      p.id,
      p.product_name,
      p.product_sku,
      p.description,
      p.price,
      p.currency,
      p.image_url,
      p.is_active,
      p.created_at,
      p.updated_at,
      pt.id as template_id,
      pt.template_name,
      COALESCE(
        json_object_agg(pav.attribute_key, pav.attribute_value)
        FILTER (WHERE pav.attribute_key IS NOT NULL),
        '{}'::json
      ) as attributes
    FROM products p
    LEFT JOIN product_templates pt ON p.template_id = pt.id
    LEFT JOIN product_attribute_values pav ON p.id = pav.product_id
    WHERE p.id = $1 AND p.tenant_id = $2 AND p.verification_app_id = $3
    GROUP BY p.id, pt.id, pt.template_name
  `, [id, tenantId, verificationAppId]);

  if (result.rows.length === 0) {
    await logApiUsage(verificationAppId, 'ecommerce', req, 404);
    throw new NotFoundError('Product');
  }

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, {
    data: {
      product: result.rows[0]
    }
  });
});

/**
 * POST /api/ecommerce/v1/products/sync
 * Bulk sync products from e-commerce platform
 * Creates new products or updates existing ones based on SKU
 */
exports.syncProducts = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { products } = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    throw new ValidationError('Products array is required and must not be empty', 'invalid_products');
  }

  if (products.length > 100) {
    throw new ValidationError('Maximum 100 products per sync request', 'too_many_products');
  }

  const result = await executeTransaction(db, async (client) => {
    const results = {
      created: [],
      updated: [],
      failed: []
    };

    for (const productData of products) {
      try {
        const {
          product_sku,
          product_name,
          description,
          price,
          currency = 'USD',
          image_url,
          is_active = true,
          template_id,
          attributes = {}
        } = productData;

        // Validate required fields
        if (!product_sku || !product_name) {
          results.failed.push({
            product_sku,
            error: 'product_sku and product_name are required'
          });
          continue;
        }

        // Validate attributes if template_id provided
        if (template_id) {
          const validation = await attributeValidator.validateAttributes(template_id, attributes);
          if (!validation.valid) {
            results.failed.push({
              product_sku,
              error: 'Attribute validation failed',
              validation_errors: validation.errors
            });
            continue;
          }
        }

        // Check if product exists
        const existing = await client.query(
          'SELECT id FROM products WHERE tenant_id = $1 AND product_sku = $2 AND verification_app_id = $3',
          [tenantId, product_sku, verificationAppId]
        );

        if (existing.rows.length > 0) {
          // Update existing product
          const productId = existing.rows[0].id;

          await client.query(`
            UPDATE products
            SET product_name = $1,
                description = $2,
                price = $3,
                currency = $4,
                image_url = $5,
                is_active = $6,
                template_id = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
          `, [
            product_name,
            description || null,
            price || null,
            currency,
            image_url || null,
            is_active,
            template_id || null,
            productId
          ]);

          // Update attributes
          if (template_id && Object.keys(attributes).length > 0) {
            await client.query('DELETE FROM product_attribute_values WHERE product_id = $1', [productId]);

            for (const [key, value] of Object.entries(attributes)) {
              if (value !== null && value !== undefined) {
                await client.query(
                  `INSERT INTO product_attribute_values (product_id, attribute_key, attribute_value)
                   VALUES ($1, $2, $3)`,
                  [productId, key, JSON.stringify(value)]
                );
              }
            }
          }

          results.updated.push({ product_sku, product_id: productId });

        } else {
          // Create new product
          const productResult = await client.query(`
            INSERT INTO products (
              tenant_id, product_name, product_sku, description,
              price, currency, image_url, is_active,
              verification_app_id, template_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `, [
            tenantId,
            product_name,
            product_sku,
            description || null,
            price || null,
            currency,
            image_url || null,
            is_active,
            verificationAppId,
            template_id || null
          ]);

          const productId = productResult.rows[0].id;

          // Insert attributes
          if (template_id && Object.keys(attributes).length > 0) {
            for (const [key, value] of Object.entries(attributes)) {
              if (value !== null && value !== undefined) {
                await client.query(
                  `INSERT INTO product_attribute_values (product_id, attribute_key, attribute_value)
                   VALUES ($1, $2, $3)`,
                  [productId, key, JSON.stringify(value)]
                );
              }
            }
          }

          results.created.push({ product_sku, product_id: productId });
        }

      } catch (error) {
        results.failed.push({
          product_sku: productData.product_sku,
          error: error.message
        });
      }
    }

    return results;
  });

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, {
    data: {
      summary: {
        total: products.length,
        created: result.created.length,
        updated: result.updated.length,
        failed: result.failed.length
      },
      details: result
    }
  }, 'Product sync completed');
});

/**
 * PUT /api/ecommerce/v1/products/:id
 * Update a single product
 */
exports.updateProduct = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { id } = req.params;
  const {
    product_name,
    description,
    price,
    currency,
    image_url,
    is_active,
    template_id,
    attributes
  } = req.body;

  const result = await executeTransaction(db, async (client) => {
    // Check if product exists and belongs to this app
    const existing = await client.query(
      'SELECT id, template_id FROM products WHERE id = $1 AND tenant_id = $2 AND verification_app_id = $3',
      [id, tenantId, verificationAppId]
    );

    if (existing.rows.length === 0) {
      await logApiUsage(verificationAppId, 'ecommerce', req, 404);
      throw new NotFoundError('Product');
    }

    // Validate attributes if provided
    const effectiveTemplateId = template_id || existing.rows[0].template_id;
    if (attributes && effectiveTemplateId) {
      const validation = await attributeValidator.validateAttributes(effectiveTemplateId, attributes);
      if (!validation.valid) {
        await logApiUsage(verificationAppId, 'ecommerce', req, 400);
        throw new ValidationError('Attribute validation failed', 'validation_failed', { validation_errors: validation.errors });
      }
    }

    // Update product
    await client.query(`
      UPDATE products
      SET product_name = COALESCE($1, product_name),
          description = COALESCE($2, description),
          price = COALESCE($3, price),
          currency = COALESCE($4, currency),
          image_url = COALESCE($5, image_url),
          is_active = COALESCE($6, is_active),
          template_id = COALESCE($7, template_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [
      product_name,
      description,
      price,
      currency,
      image_url,
      is_active,
      template_id,
      id
    ]);

    // Update attributes if provided
    if (attributes && effectiveTemplateId) {
      await client.query('DELETE FROM product_attribute_values WHERE product_id = $1', [id]);

      for (const [key, value] of Object.entries(attributes)) {
        if (value !== null && value !== undefined) {
          await client.query(
            `INSERT INTO product_attribute_values (product_id, attribute_key, attribute_value)
             VALUES ($1, $2, $3)`,
            [id, key, JSON.stringify(value)]
          );
        }
      }
    }

    // Fetch updated product
    const productResult = await client.query(`
      SELECT
        p.*,
        COALESCE(
          json_object_agg(pav.attribute_key, pav.attribute_value)
          FILTER (WHERE pav.attribute_key IS NOT NULL),
          '{}'::json
        ) as attributes
      FROM products p
      LEFT JOIN product_attribute_values pav ON p.id = pav.product_id
      WHERE p.id = $1
      GROUP BY p.id
    `, [id]);

    return productResult.rows[0];
  });

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, {
    data: {
      product: result
    }
  }, 'Product updated successfully');
});

/**
 * GET /api/ecommerce/v1/templates
 * Get product templates
 */
exports.getTemplates = asyncHandler(async (req, res) => {
  const { tenantId, verificationAppId } = req.apiAuth;

  const result = await db.query(`
    SELECT
      pt.id,
      pt.template_name,
      pt.description,
      pt.icon
    FROM product_templates pt
    WHERE pt.tenant_id = $1 AND pt.is_active = true
    ORDER BY pt.template_name
  `, [tenantId]);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, {
    data: {
      templates: result.rows
    }
  });
});

/**
 * Helper function to log API usage
 */
async function logApiUsage(verificationAppId, apiType, req, statusCode) {
  try {
    const startTime = req.apiStartTime || Date.now();
    const responseTime = Date.now() - startTime;

    await db.query(`
      INSERT INTO api_usage_logs (
        verification_app_id,
        api_type,
        endpoint,
        method,
        status_code,
        response_time_ms,
        request_timestamp,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      verificationAppId,
      apiType,
      req.path,
      req.method,
      statusCode,
      responseTime,
      new Date(),
      req.ip,
      req.get('user-agent') || 'unknown'
    ]);
  } catch (error) {
    // Silently fail - logging should not break API functionality
  }
}
