/**
 * Mobile App API v2 Controller
 * Refactored to use modern error handling and validators
 *
 * Provides product catalog access for external mobile applications
 * Requires Mobile API key authentication
 * Supports dynamic product attributes based on templates
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  sendSuccess
} = require('../modules/common/utils/response.util');

/**
 * GET /api/mobile/v2/products
 * Get product catalog with dynamic attributes
 *
 * Query params:
 * - page: Page number (default 1)
 * - limit: Items per page (default 20, max 100)
 * - template_id: Filter by template
 * - search: Search in product name/SKU
 * - is_active: Filter by active status (default true)
 */
exports.getProducts = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const {
    page = 1,
    limit = 20,
    template_id,
    search,
    is_active = 'true'
  } = req.query;

  // Validate and limit page size
  const pageSize = Math.min(parseInt(limit), 100);
  const offset = (parseInt(page) - 1) * pageSize;

  // Build query
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

  // Filter by active status
  if (is_active === 'true') {
    query += ` AND p.is_active = true`;
  } else if (is_active === 'false') {
    query += ` AND p.is_active = false`;
  }

  // Filter by template
  if (template_id) {
    query += ` AND p.template_id = $${paramIndex}`;
    params.push(template_id);
    paramIndex++;
  }

  // Search filter
  if (search) {
    query += ` AND (p.product_name ILIKE $${paramIndex} OR p.product_sku ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  query += `
    GROUP BY p.id, pt.id, pt.template_name
    ORDER BY p.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const result = await db.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(*) FROM products p
    WHERE p.tenant_id = $1 AND p.verification_app_id = $2
  `;
  const countParams = [tenantId, verificationAppId];
  let countIndex = 3;

  if (is_active === 'true') {
    countQuery += ` AND p.is_active = true`;
  } else if (is_active === 'false') {
    countQuery += ` AND p.is_active = false`;
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

  const countResult = await db.query(countQuery, countParams);
  const totalCount = parseInt(countResult.rows[0].count);

  // Log API usage
  await logApiUsage(verificationAppId, 'mobile', req, 200);

  return sendSuccess(res, {
    products: result.rows,
    pagination: {
      page: parseInt(page),
      limit: pageSize,
      total: totalCount,
      totalPages: Math.ceil(totalCount / pageSize)
    }
  });
});

/**
 * GET /api/mobile/v2/products/:id
 * Get single product with full details and attributes
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
    WHERE p.id = $1
      AND p.tenant_id = $2
      AND p.verification_app_id = $3
    GROUP BY p.id, pt.id, pt.template_name
  `, [id, tenantId, verificationAppId]);

  if (result.rows.length === 0) {
    await logApiUsage(verificationAppId, 'mobile', req, 404);
    throw new NotFoundError('Product');
  }

  await logApiUsage(verificationAppId, 'mobile', req, 200);

  return sendSuccess(res, { product: result.rows[0] });
});

/**
 * GET /api/mobile/v2/templates
 * Get product templates available for this app
 */
exports.getTemplates = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;

  const result = await db.query(`
    SELECT
      pt.id,
      pt.template_name,
      pt.description,
      pt.icon,
      COUNT(p.id) as product_count
    FROM product_templates pt
    LEFT JOIN products p ON pt.id = p.template_id
      AND p.verification_app_id = $1
      AND p.is_active = true
    WHERE pt.tenant_id = $2 AND pt.is_active = true
    GROUP BY pt.id
    ORDER BY pt.template_name
  `, [verificationAppId, tenantId]);

  await logApiUsage(verificationAppId, 'mobile', req, 200);

  return sendSuccess(res, { templates: result.rows });
});

/**
 * GET /api/mobile/v2/templates/:id/attributes
 * Get attribute definitions for a template
 */
exports.getTemplateAttributes = asyncHandler(async (req, res) => {
  const { tenantId } = req.apiAuth;
  const { id } = req.params;

  const result = await db.query(`
    SELECT
      ta.id,
      ta.attribute_name,
      ta.attribute_key,
      ta.data_type,
      ta.is_required,
      ta.validation_rules,
      ta.default_value,
      ta.display_order,
      ta.field_group,
      ta.help_text,
      ta.placeholder
    FROM template_attributes ta
    JOIN product_templates pt ON ta.template_id = pt.id
    WHERE pt.id = $1 AND pt.tenant_id = $2 AND pt.is_active = true
    ORDER BY ta.display_order, ta.attribute_name
  `, [id, tenantId]);

  if (result.rows.length === 0) {
    await logApiUsage(req.apiAuth.verificationAppId, 'mobile', req, 404);
    throw new NotFoundError('Template not found or has no attributes');
  }

  await logApiUsage(req.apiAuth.verificationAppId, 'mobile', req, 200);

  return sendSuccess(res, { attributes: result.rows });
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
    // Don't fail the request if logging fails
  }
}
