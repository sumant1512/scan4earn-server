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
      p.thumbnail_url,
      p.product_images,
      p.is_active,
      p.created_at,
      p.updated_at,
      pt.id as template_id,
      pt.template_name,
      COALESCE(
        json_object_agg(pav.attribute_key, pav.attribute_value)
        FILTER (WHERE pav.attribute_key IS NOT NULL),
        '{}'::json
      ) as attributes,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'icon', t.icon))
          FROM tags t
          JOIN product_tags pt_tags ON pt_tags.tag_id = t.id
          WHERE pt_tags.product_id = p.id
        ),
        '[]'::json
      ) as tags
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
    GROUP BY p.id, p.product_name, p.product_sku, p.description, p.price, p.currency, p.thumbnail_url, p.product_images, p.is_active, p.created_at, p.updated_at, pt.id, pt.template_name
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
      p.thumbnail_url,
      p.product_images,
      p.is_active,
      p.created_at,
      p.updated_at,
      pt.id as template_id,
      pt.template_name,
      COALESCE(
        json_object_agg(pav.attribute_key, pav.attribute_value)
        FILTER (WHERE pav.attribute_key IS NOT NULL),
        '{}'::json
      ) as attributes,
      COALESCE(
        (
          SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'icon', t.icon))
          FROM tags t
          JOIN product_tags pt_tags ON pt_tags.tag_id = t.id
          WHERE pt_tags.product_id = p.id
        ),
        '[]'::json
      ) as tags
    FROM products p
    LEFT JOIN product_templates pt ON p.template_id = pt.id
    LEFT JOIN product_attribute_values pav ON p.id = pav.product_id
    WHERE p.id = $1 AND p.tenant_id = $2 AND p.verification_app_id = $3
    GROUP BY p.id, p.product_name, p.product_sku, p.description, p.price, p.currency, p.thumbnail_url, p.product_images, p.is_active, p.created_at, p.updated_at, pt.id, pt.template_name
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
                is_active = $5,
                template_id = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
          `, [
            product_name,
            description || null,
            price || null,
            currency,
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
              price, currency, is_active,
              verification_app_id, template_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
          `, [
            tenantId,
            product_name,
            product_sku,
            description || null,
            price || null,
            currency,
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
          is_active = COALESCE($5, is_active),
          template_id = COALESCE($6, template_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [
      product_name,
      description,
      price,
      currency,
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

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/ecommerce/v1/products/:id/stock
 * Real-time stock status for a single product.
 */
exports.getProductStock = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { id } = req.params;

  const result = await db.query(`
    SELECT
      id,
      stock_quantity,
      stock_status,
      low_stock_threshold,
      track_inventory
    FROM products
    WHERE id = $1
      AND tenant_id = $2
      AND (verification_app_id = $3 OR verification_app_id IS NULL)
      AND is_active = true
  `, [id, tenantId, verificationAppId]);

  if (result.rows.length === 0) {
    await logApiUsage(verificationAppId, 'ecommerce', req, 404);
    throw new NotFoundError('Product');
  }

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { stock: result.rows[0] } });
});

// ─────────────────────────────────────────────────────────────────────────────
// CART HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getCartWithItems(tenantId, verificationAppId, customerRef) {
  const cartResult = await db.query(`
    SELECT id FROM ecommerce_carts
    WHERE tenant_id = $1 AND verification_app_id = $2 AND customer_ref = $3
  `, [tenantId, verificationAppId, customerRef]);

  if (cartResult.rows.length === 0) {
    return { items: [], subtotal: 0 };
  }

  const cartId = cartResult.rows[0].id;

  const itemsResult = await db.query(`
    SELECT
      ci.id,
      ci.product_id,
      p.product_name,
      p.product_sku,
      p.thumbnail_url,
      p.stock_status,
      ci.quantity,
      p.price,
      p.currency,
      (ci.quantity * p.price) AS line_total
    FROM ecommerce_cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = $1
    ORDER BY ci.created_at ASC
  `, [cartId]);

  const items = itemsResult.rows;
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.line_total || 0), 0);

  return { cartId, items, subtotal: parseFloat(subtotal.toFixed(2)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CART
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/ecommerce/v1/cart
 * Current cart with live prices and computed totals.
 */
exports.getCart = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;

  const cart = await getCartWithItems(tenantId, verificationAppId, customerRef);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { cart } });
});

/**
 * POST /api/ecommerce/v1/cart/items
 * Add a product to cart (increments quantity if already present).
 */
exports.addCartItem = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { product_id, quantity = 1 } = req.body;

  if (!product_id) throw new ValidationError('product_id is required', 'missing_product_id');
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError('quantity must be a positive integer', 'invalid_quantity');
  }

  // Validate product active + scoped to this tenant/app
  const productResult = await db.query(`
    SELECT id, track_inventory, stock_quantity, stock_status
    FROM products
    WHERE id = $1
      AND tenant_id = $2
      AND (verification_app_id = $3 OR verification_app_id IS NULL)
      AND is_active = true
  `, [product_id, tenantId, verificationAppId]);

  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product');
  }

  const product = productResult.rows[0];

  if (product.track_inventory && product.stock_quantity < quantity) {
    throw new ValidationError(
      `Insufficient stock. Available: ${product.stock_quantity}`,
      'insufficient_stock'
    );
  }

  await executeTransaction(db, async (client) => {
    // Upsert cart
    await client.query(`
      INSERT INTO ecommerce_carts (tenant_id, verification_app_id, customer_ref)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, verification_app_id, customer_ref) DO UPDATE
        SET updated_at = CURRENT_TIMESTAMP
    `, [tenantId, verificationAppId, customerRef]);

    const cartResult = await client.query(`
      SELECT id FROM ecommerce_carts
      WHERE tenant_id = $1 AND verification_app_id = $2 AND customer_ref = $3
    `, [tenantId, verificationAppId, customerRef]);

    const cartId = cartResult.rows[0].id;

    // Upsert cart item — increment quantity on conflict
    await client.query(`
      INSERT INTO ecommerce_cart_items (cart_id, product_id, quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (cart_id, product_id) DO UPDATE
        SET quantity = ecommerce_cart_items.quantity + EXCLUDED.quantity,
            updated_at = CURRENT_TIMESTAMP
    `, [cartId, product_id, quantity]);

    // Touch cart updated_at
    await client.query(`
      UPDATE ecommerce_carts SET updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [cartId]);
  });

  const cart = await getCartWithItems(tenantId, verificationAppId, customerRef);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { cart } }, 'Item added to cart');
});

/**
 * PUT /api/ecommerce/v1/cart/items/:productId
 * Set quantity of a specific cart item (replace, not increment).
 */
exports.updateCartItem = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { productId } = req.params;
  const { quantity } = req.body;

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError('quantity must be a positive integer', 'invalid_quantity');
  }

  const cartResult = await db.query(`
    SELECT c.id FROM ecommerce_carts c
    WHERE c.tenant_id = $1 AND c.verification_app_id = $2 AND c.customer_ref = $3
  `, [tenantId, verificationAppId, customerRef]);

  if (cartResult.rows.length === 0) {
    throw new NotFoundError('Cart item');
  }

  const cartId = cartResult.rows[0].id;

  const updateResult = await db.query(`
    UPDATE ecommerce_cart_items
    SET quantity = $1, updated_at = CURRENT_TIMESTAMP
    WHERE cart_id = $2 AND product_id = $3
    RETURNING id
  `, [quantity, cartId, productId]);

  if (updateResult.rows.length === 0) {
    throw new NotFoundError('Cart item');
  }

  await db.query(`
    UPDATE ecommerce_carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [cartId]);

  const cart = await getCartWithItems(tenantId, verificationAppId, customerRef);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { cart } });
});

/**
 * DELETE /api/ecommerce/v1/cart/items/:productId
 * Remove a single item from the cart.
 */
exports.removeCartItem = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { productId } = req.params;

  const cartResult = await db.query(`
    SELECT id FROM ecommerce_carts
    WHERE tenant_id = $1 AND verification_app_id = $2 AND customer_ref = $3
  `, [tenantId, verificationAppId, customerRef]);

  if (cartResult.rows.length === 0) {
    throw new NotFoundError('Cart item');
  }

  const cartId = cartResult.rows[0].id;

  const deleteResult = await db.query(`
    DELETE FROM ecommerce_cart_items
    WHERE cart_id = $1 AND product_id = $2
    RETURNING id
  `, [cartId, productId]);

  if (deleteResult.rows.length === 0) {
    throw new NotFoundError('Cart item');
  }

  await db.query(`
    UPDATE ecommerce_carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [cartId]);

  const cart = await getCartWithItems(tenantId, verificationAppId, customerRef);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { cart } });
});

/**
 * DELETE /api/ecommerce/v1/cart
 * Clear all items from the customer's cart (idempotent).
 */
exports.clearCart = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;

  const cartResult = await db.query(`
    SELECT id FROM ecommerce_carts
    WHERE tenant_id = $1 AND verification_app_id = $2 AND customer_ref = $3
  `, [tenantId, verificationAppId, customerRef]);

  if (cartResult.rows.length > 0) {
    const cartId = cartResult.rows[0].id;
    await db.query('DELETE FROM ecommerce_cart_items WHERE cart_id = $1', [cartId]);
    await db.query(`
      UPDATE ecommerce_carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [cartId]);
  }

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { cart: { items: [], subtotal: 0 } } });
});

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['processing'],
  processing: ['shipped'],
  shipped:    ['delivered'],
  delivered:  ['returned'],
  returned:   ['refunded'],
  cancelled:  ['refunded'],
  refunded:   []
};

const VALID_STATUSES = new Set(Object.keys(ALLOWED_TRANSITIONS));

async function generateOrderNumber(client, tenantId) {
  // Generate order number without FOR UPDATE (aggregate functions don't work with FOR UPDATE)
  // Use a simple counter approach based on existing order count
  const result = await client.query(`
    SELECT
      TO_CHAR(CURRENT_DATE, 'YYYYMMDD') AS date_part,
      COUNT(*) AS today_count
    FROM ecommerce_orders
    WHERE tenant_id = $1
      AND placed_at::date = CURRENT_DATE
  `, [tenantId]);

  const { date_part, today_count } = result.rows[0] || { date_part: null, today_count: 0 };
  const seq = parseInt(today_count) + 1;
  return `ORD-${date_part}-${String(seq).padStart(5, '0')}`;
}

/**
 * POST /api/ecommerce/v1/orders
 * Place an order from cart or explicit items list.
 */
exports.placeOrder = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const {
    from_cart,
    items: explicitItems,
    customer_name,
    customer_email,
    customer_phone,
    tax_amount = 0,
    currency,
    shipping_address,
    notes,
    metadata
  } = req.body;

  const order = await executeTransaction(db, async (client) => {
    let lineItems = [];

    if (from_cart) {
      // Resolve items from cart
      const cartResult = await client.query(`
        SELECT c.id FROM ecommerce_carts c
        WHERE c.tenant_id = $1 AND c.verification_app_id = $2 AND c.customer_ref = $3
      `, [tenantId, verificationAppId, customerRef]);

      if (cartResult.rows.length === 0) {
        throw new ValidationError('Cart is empty', 'empty_cart');
      }

      const cartId = cartResult.rows[0].id;

      const cartItems = await client.query(`
        SELECT ci.product_id, ci.quantity
        FROM ecommerce_cart_items ci
        WHERE ci.cart_id = $1
      `, [cartId]);

      if (cartItems.rows.length === 0) {
        throw new ValidationError('Cart is empty', 'empty_cart');
      }

      lineItems = cartItems.rows;
    } else {
      if (!Array.isArray(explicitItems) || explicitItems.length === 0) {
        throw new ValidationError('Either from_cart or items[] must be provided', 'missing_items');
      }
      lineItems = explicitItems.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
    }

    // Fetch live prices + validate all products
    const productIds = lineItems.map(i => i.product_id);
    const productsResult = await client.query(`
      SELECT id, product_name, product_sku, price, currency, attributes,
             track_inventory, stock_quantity, is_active
      FROM products
      WHERE id = ANY($1)
        AND tenant_id = $2
        AND (verification_app_id = $3 OR verification_app_id IS NULL)
    `, [productIds, tenantId, verificationAppId]);

    const productMap = new Map(productsResult.rows.map(p => [p.id, p]));

    const orderItems = [];
    let subtotal = 0;

    for (const item of lineItems) {
      const product = productMap.get(item.product_id);
      if (!product) throw new ValidationError(`Product ${item.product_id} not found`, 'product_not_found');
      if (!product.is_active) throw new ValidationError(`Product ${item.product_id} is not active`, 'product_inactive');

      if (product.track_inventory && product.stock_quantity < item.quantity) {
        throw new ValidationError(
          `Insufficient stock for product ${item.product_id}. Available: ${product.stock_quantity}`,
          'insufficient_stock'
        );
      }

      const unitPrice = parseFloat(product.price || 0);
      const totalPrice = parseFloat((unitPrice * item.quantity).toFixed(2));
      subtotal += totalPrice;

      orderItems.push({
        product_id: product.id,
        product_sku: product.product_sku,
        product_name: product.product_name,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        attributes: product.attributes
      });
    }

    subtotal = parseFloat(subtotal.toFixed(2));
    const taxAmt = parseFloat(parseFloat(tax_amount).toFixed(2));
    const totalAmount = parseFloat((subtotal + taxAmt).toFixed(2));
    const orderCurrency = currency || productsResult.rows[0]?.currency || 'INR';

    const orderNumber = await generateOrderNumber(client, tenantId);

    const orderInsert = await client.query(`
      INSERT INTO ecommerce_orders (
        order_number, tenant_id, verification_app_id, customer_ref,
        customer_name, customer_email, customer_phone,
        status, subtotal, tax_amount, total_amount, currency,
        shipping_address, notes, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      orderNumber, tenantId, verificationAppId, customerRef,
      customer_name || null, customer_email || null, customer_phone || null,
      subtotal, taxAmt, totalAmount, orderCurrency,
      shipping_address ? JSON.stringify(shipping_address) : null,
      notes || null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    const newOrder = orderInsert.rows[0];

    for (const item of orderItems) {
      await client.query(`
        INSERT INTO ecommerce_order_items
          (order_id, product_id, product_sku, product_name, quantity, unit_price, total_price, attributes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        newOrder.id, item.product_id, item.product_sku, item.product_name,
        item.quantity, item.unit_price, item.total_price,
        item.attributes ? JSON.stringify(item.attributes) : null
      ]);
    }

    // Decrement stock for tracked products (atomic check + update)
    for (const item of orderItems) {
      const prod = productMap.get(item.product_id);
      if (prod && prod.track_inventory) {
        const updateStock = await client.query(`
          UPDATE products
          SET stock_quantity = stock_quantity - $1,
              stock_status = CASE WHEN stock_quantity - $1 <= 0 THEN 'out_of_stock' ELSE stock_status END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND stock_quantity >= $1
          RETURNING stock_quantity
        `, [item.quantity, item.product_id]);

        if (updateStock.rows.length === 0) {
          throw new ValidationError(
            `Insufficient stock for product ${item.product_id} during finalize.`,
            'insufficient_stock'
          );
        }
      }
    }

    // Clear cart if from_cart
    if (from_cart) {
      const cartResult = await client.query(`
        SELECT id FROM ecommerce_carts
        WHERE tenant_id = $1 AND verification_app_id = $2 AND customer_ref = $3
      `, [tenantId, verificationAppId, customerRef]);

      if (cartResult.rows.length > 0) {
        await client.query('DELETE FROM ecommerce_cart_items WHERE cart_id = $1', [cartResult.rows[0].id]);
        await client.query(`
          UPDATE ecommerce_carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
        `, [cartResult.rows[0].id]);
      }
    }

    return { ...newOrder, items: orderItems };
  });

  await logApiUsage(verificationAppId, 'ecommerce', req, 201);

  return sendSuccess(res, { data: { order } }, 'Order placed successfully', 201);
});

/**
 * GET /api/ecommerce/v1/orders
 * List order history for a customer.
 */
exports.getOrders = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { status } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const params = [tenantId, verificationAppId, customerRef];
  let whereClause = `tenant_id = $1 AND verification_app_id = $2 AND customer_ref = $3`;

  if (status) {
    if (!VALID_STATUSES.has(status)) {
      throw new ValidationError(`Invalid status '${status}'`, 'invalid_status');
    }
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  const [ordersResult, countResult] = await Promise.all([
    db.query(`
      SELECT id, order_number, status, subtotal, tax_amount, total_amount,
             currency, placed_at, updated_at
      FROM ecommerce_orders
      WHERE ${whereClause}
      ORDER BY placed_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]),

    db.query(`
      SELECT COUNT(*) FROM ecommerce_orders WHERE ${whereClause}
    `, params)
  ]);

  const total = parseInt(countResult.rows[0].count);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, {
    data: {
      orders: ordersResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  });
});

/**
 * GET /api/ecommerce/v1/orders/:id
 * Single order with line items.
 */
exports.getOrder = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { id } = req.params;

  const orderResult = await db.query(`
    SELECT * FROM ecommerce_orders
    WHERE id = $1 AND tenant_id = $2 AND verification_app_id = $3 AND customer_ref = $4
  `, [id, tenantId, verificationAppId, customerRef]);

  if (orderResult.rows.length === 0) {
    await logApiUsage(verificationAppId, 'ecommerce', req, 404);
    throw new NotFoundError('Order');
  }

  const order = orderResult.rows[0];

  const itemsResult = await db.query(`
    SELECT product_id, product_sku, product_name, quantity, unit_price, total_price, attributes
    FROM ecommerce_order_items
    WHERE order_id = $1
    ORDER BY id ASC
  `, [id]);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { order: { ...order, items: itemsResult.rows } } });
});

/**
 * PATCH /api/ecommerce/v1/orders/:id/status
 * Advance or transition order status following strict progression rules.
 */
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { id } = req.params;
  const { status: newStatus } = req.body;

  if (!newStatus || !VALID_STATUSES.has(newStatus)) {
    throw new ValidationError(
      `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
      'invalid_status'
    );
  }

  const orderResult = await db.query(`
    SELECT id, status FROM ecommerce_orders
    WHERE id = $1 AND tenant_id = $2 AND verification_app_id = $3 AND customer_ref = $4
  `, [id, tenantId, verificationAppId, customerRef]);

  if (orderResult.rows.length === 0) {
    await logApiUsage(verificationAppId, 'ecommerce', req, 404);
    throw new NotFoundError('Order');
  }

  const currentStatus = orderResult.rows[0].status;

  if (currentStatus === 'refunded') {
    throw new ValidationError('Order is in a terminal status and cannot be updated', 'terminal_status');
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none'}`,
      'invalid_transition'
    );
  }

  const updated = await db.query(`
    UPDATE ecommerce_orders
    SET status = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `, [newStatus, id]);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { order: updated.rows[0] } }, 'Order status updated');
});

// ─────────────────────────────────────────────────────────────────────────────
// WISHLIST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/ecommerce/v1/wishlist
 * Return all saved products for a customer.
 */
exports.getWishlist = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;

  const result = await db.query(`
    SELECT
      w.product_id,
      p.product_name,
      p.product_sku,
      p.price,
      p.currency,
      p.thumbnail_url,
      p.stock_status,
      p.is_active,
      w.added_at
    FROM ecommerce_wishlists w
    JOIN products p ON p.id = w.product_id
    WHERE w.tenant_id = $1
      AND w.verification_app_id = $2
      AND w.customer_ref = $3
    ORDER BY w.added_at DESC
  `, [tenantId, verificationAppId, customerRef]);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, { data: { items: result.rows } });
});

/**
 * POST /api/ecommerce/v1/wishlist
 * Add a product to the wishlist (idempotent — ON CONFLICT DO NOTHING).
 */
exports.addToWishlist = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { product_id } = req.body;

  if (!product_id) throw new ValidationError('product_id is required', 'missing_product_id');

  // Validate product belongs to this tenant/app
  const productResult = await db.query(`
    SELECT id, product_name FROM products
    WHERE id = $1
      AND tenant_id = $2
      AND (verification_app_id = $3 OR verification_app_id IS NULL)
      AND is_active = true
  `, [product_id, tenantId, verificationAppId]);

  if (productResult.rows.length === 0) {
    await logApiUsage(verificationAppId, 'ecommerce', req, 404);
    throw new NotFoundError('Product');
  }

  const insertResult = await db.query(`
    INSERT INTO ecommerce_wishlists (tenant_id, verification_app_id, customer_ref, product_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, verification_app_id, customer_ref, product_id) DO NOTHING
    RETURNING added_at
  `, [tenantId, verificationAppId, customerRef, product_id]);

  const statusCode = insertResult.rows.length > 0 ? 201 : 200;

  await logApiUsage(verificationAppId, 'ecommerce', req, statusCode);

  return sendSuccess(res, {
    data: {
      product_id,
      product_name: productResult.rows[0].product_name,
      added_at: insertResult.rows[0]?.added_at || null
    }
  }, 'Product added to wishlist', statusCode);
});

/**
 * DELETE /api/ecommerce/v1/wishlist/:productId
 * Remove a product from the wishlist (idempotent).
 */
exports.removeFromWishlist = asyncHandler(async (req, res) => {
  const { verificationAppId, tenantId } = req.apiAuth;
  const { customerRef } = req;
  const { productId } = req.params;

  await db.query(`
    DELETE FROM ecommerce_wishlists
    WHERE tenant_id = $1
      AND verification_app_id = $2
      AND customer_ref = $3
      AND product_id = $4
  `, [tenantId, verificationAppId, customerRef, productId]);

  await logApiUsage(verificationAppId, 'ecommerce', req, 200);

  return sendSuccess(res, null, 'Product removed from wishlist');
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
