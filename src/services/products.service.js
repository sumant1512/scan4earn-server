const db = require('../config/database');
const tagService = require('./tag.service');

class ProductsService {

  /**
   * Get all products with template and tag information
   */
  async getProducts(tenantId, filters = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        search = '',
        verification_app_id,
        template_id
      } = filters;

      const offset = (page - 1) * limit;

      let query = `
        SELECT
          p.id,
          p.tenant_id,
          p.product_name,
          p.product_sku,
          p.description,
          p.price,
          p.currency,
          p.image_url,
          p.is_active,
          p.created_at,
          p.updated_at,
          p.verification_app_id,
          p.template_id,
          p.attributes,
          va.app_name,
          pt.template_name,
          (
            SELECT json_agg(json_build_object(
              'id', t.id,
              'name', t.name,
              'icon', t.icon
            ))
            FROM tags t
            INNER JOIN product_tags pt_tags ON pt_tags.tag_id = t.id
            WHERE pt_tags.product_id = p.id AND t.is_active = true
          ) as tags
        FROM products p
        LEFT JOIN verification_apps va ON p.verification_app_id = va.id
        LEFT JOIN product_templates pt ON p.template_id = pt.id
        WHERE p.tenant_id = $1
      `;

      const params = [tenantId];
      let paramIndex = 2;

      if (verification_app_id) {
        query += ` AND p.verification_app_id = $${paramIndex}`;
        params.push(verification_app_id);
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

      query += `
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM products WHERE tenant_id = $1';
      const countParams = [tenantId];
      let countIndex = 2;

      if (verification_app_id) {
        countQuery += ` AND verification_app_id = $${countIndex}`;
        countParams.push(verification_app_id);
        countIndex++;
      }

      if (template_id) {
        countQuery += ` AND template_id = $${countIndex}`;
        countParams.push(template_id);
        countIndex++;
      }

      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      return {
        products: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting products:', error);
      throw error;
    }
  }

  /**
   * Get product by ID
   */
  async getProductById(productId, tenantId) {
    try {
      const query = `
        SELECT
          p.id,
          p.tenant_id,
          p.product_name,
          p.product_sku,
          p.description,
          p.price,
          p.currency,
          p.image_url,
          p.is_active,
          p.created_at,
          p.updated_at,
          p.verification_app_id,
          p.template_id,
          p.attributes,
          va.app_name,
          pt.template_name,
          pt.variant_config,
          pt.custom_fields,
          (
            SELECT json_agg(json_build_object(
              'id', t.id,
              'name', t.name,
              'icon', t.icon,
              'description', t.description
            ))
            FROM tags t
            INNER JOIN product_tags pt_tags ON pt_tags.tag_id = t.id
            WHERE pt_tags.product_id = p.id AND t.is_active = true
          ) as tags
        FROM products p
        LEFT JOIN verification_apps va ON p.verification_app_id = va.id
        LEFT JOIN product_templates pt ON p.template_id = pt.id
        WHERE p.id = $1 AND p.tenant_id = $2
      `;

      const result = await db.query(query, [productId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting product by ID:', error);
      throw error;
    }
  }

  /**
   * Create new product with template-based attributes
   */
  async createProduct(tenantId, productData) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const {
        product_name,
        product_sku,
        description,
        price,
        currency = 'USD',
        image_url,
        verification_app_id,
        template_id,
        attributes = {},
        tag_ids = [],
        is_active = true
      } = productData;

      // Validate required fields
      if (!product_name || !template_id) {
        throw new Error('product_name and template_id are required');
      }

      // Check if SKU already exists
      if (product_sku) {
        const existing = await client.query(
          'SELECT id FROM products WHERE tenant_id = $1 AND product_sku = $2',
          [tenantId, product_sku]
        );

        if (existing.rows.length > 0) {
          throw new Error('Product SKU already exists');
        }
      }

      // Insert product
      const productQuery = `
        INSERT INTO products (
          tenant_id,
          product_name,
          product_sku,
          description,
          price,
          currency,
          image_url,
          verification_app_id,
          template_id,
          attributes,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, product_name, product_sku, price, currency, template_id, attributes, created_at
      `;

      const productParams = [
        tenantId,
        product_name,
        product_sku,
        description,
        price,
        currency,
        image_url,
        verification_app_id,
        template_id,
        JSON.stringify(attributes),
        is_active
      ];

      const productResult = await client.query(productQuery, productParams);
      const product = productResult.rows[0];

      // Assign tags
      if (tag_ids && tag_ids.length > 0) {
        const tagValues = tag_ids.map((tagId, index) =>
          `($1, $${index + 2})`
        ).join(', ');

        await client.query(
          `INSERT INTO product_tags (product_id, tag_id) VALUES ${tagValues}`,
          [product.id, ...tag_ids]
        );
      }

      await client.query('COMMIT');

      return product;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update existing product
   */
  async updateProduct(productId, tenantId, updates) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const {
        product_name,
        product_sku,
        description,
        price,
        currency,
        image_url,
        attributes,
        tag_ids,
        is_active
      } = updates;

      const updateFields = [];
      const params = [productId, tenantId];
      let paramIndex = 3;

      if (product_name !== undefined) {
        updateFields.push(`product_name = $${paramIndex}`);
        params.push(product_name);
        paramIndex++;
      }

      if (product_sku !== undefined) {
        // Check if SKU already exists for another product
        const existing = await client.query(
          'SELECT id FROM products WHERE tenant_id = $1 AND product_sku = $2 AND id != $3',
          [tenantId, product_sku, productId]
        );

        if (existing.rows.length > 0) {
          throw new Error('Product SKU already exists');
        }

        updateFields.push(`product_sku = $${paramIndex}`);
        params.push(product_sku);
        paramIndex++;
      }

      if (description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }

      if (price !== undefined) {
        updateFields.push(`price = $${paramIndex}`);
        params.push(price);
        paramIndex++;
      }

      if (currency !== undefined) {
        updateFields.push(`currency = $${paramIndex}`);
        params.push(currency);
        paramIndex++;
      }

      if (image_url !== undefined) {
        updateFields.push(`image_url = $${paramIndex}`);
        params.push(image_url);
        paramIndex++;
      }

      if (attributes !== undefined) {
        updateFields.push(`attributes = $${paramIndex}`);
        params.push(JSON.stringify(attributes));
        paramIndex++;
      }

      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex}`);
        params.push(is_active);
        paramIndex++;
      }

      if (updateFields.length === 0 && tag_ids === undefined) {
        throw new Error('No fields to update');
      }

      // Update product if there are fields to update
      if (updateFields.length > 0) {
        const query = `
          UPDATE products
          SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, product_name, product_sku, price, currency, attributes, updated_at
        `;

        const result = await client.query(query, params);

        if (result.rows.length === 0) {
          throw new Error('Product not found');
        }
      }

      // Update tags if provided
      if (tag_ids !== undefined) {
        // Remove existing tags
        await client.query('DELETE FROM product_tags WHERE product_id = $1', [productId]);

        // Insert new tags
        if (tag_ids.length > 0) {
          const tagValues = tag_ids.map((tagId, index) =>
            `($1, $${index + 2})`
          ).join(', ');

          await client.query(
            `INSERT INTO product_tags (product_id, tag_id) VALUES ${tagValues}`,
            [productId, ...tag_ids]
          );
        }
      }

      await client.query('COMMIT');

      // Fetch and return updated product
      return await this.getProductById(productId, tenantId);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete product
   */
  async deleteProduct(productId, tenantId) {
    try {
      const query = `
        DELETE FROM products
        WHERE id = $1 AND tenant_id = $2
        RETURNING id
      `;

      const result = await db.query(query, [productId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return { success: true, id: result.rows[0].id };
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }
}

module.exports = new ProductsService();
