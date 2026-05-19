const db = require("../config/database");

class TagService {
  /**
   * Get all tags for a tenant/app
   */
  async getAllTags(tenantId, filters = {}) {
    try {
      let query = `
        SELECT
          t.id,
          t.tenant_id,
          t.verification_app_id,
          t.name,
          t.description,
          t.icon,
          t.is_active,
          t.created_at,
          t.updated_at,
          va.app_name as verification_app_name
        FROM tags t
        LEFT JOIN verification_apps va ON va.id = t.verification_app_id
        WHERE t.tenant_id = $1
      `;

      const params = [tenantId];
      let paramIndex = 2;

      // Filter by verification app (skip if "all" or empty)
      if (filters.verification_app_id && filters.verification_app_id !== '' && filters.verification_app_id !== 'all') {
        query += ` AND t.verification_app_id = $${paramIndex}`;
        params.push(filters.verification_app_id);
        paramIndex++;
      } else {
        console.log("No verification_app_id filter (showing all apps)");
      }

      // Filter by active status
      if (filters.is_active !== undefined) {
        query += ` AND t.is_active = $${paramIndex}`;
        params.push(filters.is_active);
        paramIndex++;
      }

      // Filter by search term
      if (filters.search) {
        console.log("Adding search filter:", filters.search);
        query += ` AND t.name ILIKE $${paramIndex}`;
        params.push(`%${filters.search}%`);
        paramIndex++;
      }

      query += ` ORDER BY t.name ASC`;

      const result = await db.query(query, params);

      console.log("Query returned rows:", result.rows.length);
      if (result.rows.length > 0) {
        console.log("Sample row:", result.rows[0]);
      }
      console.log("========================");

      return result.rows;
    } catch (error) {
      console.error("Error getting tags:", error);
      throw error;
    }
  }

  /**
   * Get tag by ID
   */
  async getTagById(tagId, tenantId) {
    try {
      const query = `
        SELECT
          t.id,
          t.tenant_id,
          t.verification_app_id,
          t.name,
          t.description,
          t.icon,
          t.is_active,
          t.created_at,
          t.updated_at,
          va.app_name as verification_app_name
        FROM tags t
        LEFT JOIN verification_apps va ON va.id = t.verification_app_id
        WHERE t.id = $1 AND t.tenant_id = $2
      `;

      const result = await db.query(query, [tagId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error("Error getting tag by ID:", error);
      throw error;
    }
  }

  /**
   * Create new tag
   */
  async createTag(tenantId, tagData) {
    try {
      const {
        verification_app_id,
        name,
        description,
        icon,
        is_active = true,
      } = tagData;

      // Validate required fields
      if (!verification_app_id || !name) {
        throw new Error("verification_app_id and name are required");
      }

      // Check if verification app belongs to tenant
      const appCheck = await db.query(
        "SELECT id FROM verification_apps WHERE id = $1 AND tenant_id = $2",
        [verification_app_id, tenantId],
      );

      if (appCheck.rows.length === 0) {
        throw new Error(
          "Verification app not found or does not belong to tenant",
        );
      }

      const query = `
        INSERT INTO tags (
          tenant_id,
          verification_app_id,
          name,
          description,
          icon,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          tenant_id,
          verification_app_id,
          name,
          description,
          icon,
          is_active,
          created_at,
          updated_at
      `;

      const params = [
        tenantId,
        verification_app_id,
        name,
        description,
        icon,
        is_active,
      ];

      const result = await db.query(query, params);
      return result.rows[0];
    } catch (error) {
      console.error("Error creating tag:", error);

      // Handle unique constraint violation
      if (error.code === "23505") {
        throw new Error(
          "Tag with this name already exists for this verification app",
        );
      }

      throw error;
    }
  }

  /**
   * Update existing tag
   */
  async updateTag(tagId, tenantId, updates) {
    try {
      const { name, description, icon, is_active } = updates;

      const updateFields = [];
      const params = [tagId, tenantId];
      let paramIndex = 3;

      if (name !== undefined) {
        updateFields.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
      }

      if (description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }

      if (icon !== undefined) {
        updateFields.push(`icon = $${paramIndex}`);
        params.push(icon);
        paramIndex++;
      }

      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex}`);
        params.push(is_active);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error("No fields to update");
      }

      const query = `
        UPDATE tags
        SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id = $2
        RETURNING
          id,
          tenant_id,
          verification_app_id,
          name,
          description,
          icon,
          is_active,
          created_at,
          updated_at
      `;

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error("Error updating tag:", error);

      // Handle unique constraint violation
      if (error.code === "23505") {
        throw new Error(
          "Tag with this name already exists for this verification app",
        );
      }

      throw error;
    }
  }

  /**
   * Delete tag (soft delete - set is_active to false)
   */
  async deleteTag(tagId, tenantId) {
    try {
      // Check if tag is used by products
      const usageCheck = await db.query(
        "SELECT COUNT(*) as count FROM product_tags WHERE tag_id = $1",
        [tagId],
      );

      if (parseInt(usageCheck.rows[0].count) > 0) {
        throw new Error("Cannot delete tag that is in use by products");
      }

      const query = `
        DELETE FROM tags
        WHERE id = $1 AND tenant_id = $2
        RETURNING id
      `;

      const result = await db.query(query, [tagId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return { success: true, id: result.rows[0].id };
    } catch (error) {
      console.error("Error deleting tag:", error);
      throw error;
    }
  }

  /**
   * Get tags for a specific verification app
   */
  async getTagsForApp(appId, tenantId) {
    try {
      const query = `
        SELECT
          id,
          tenant_id,
          verification_app_id,
          name,
          description,
          icon,
          is_active,
          created_at,
          updated_at
        FROM tags
        WHERE verification_app_id = $1 AND tenant_id = $2 AND is_active = true
        ORDER BY name ASC
      `;

      const result = await db.query(query, [appId, tenantId]);
      return result.rows;
    } catch (error) {
      console.error("Error getting tags for app:", error);
      throw error;
    }
  }

  /**
   * Get product tags (tags assigned to a product)
   */
  async getProductTags(productId) {
    try {
      const query = `
        SELECT
          t.id,
          t.name,
          t.description,
          t.icon,
          t.verification_app_id
        FROM tags t
        INNER JOIN product_tags pt ON pt.tag_id = t.id
        WHERE pt.product_id = $1 AND t.is_active = true
        ORDER BY t.name ASC
      `;

      const result = await db.query(query, [productId]);
      return result.rows;
    } catch (error) {
      console.error("Error getting product tags:", error);
      throw error;
    }
  }

  /**
   * Assign tags to a product
   */
  async assignTagsToProduct(productId, tagIds) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Remove existing tags
      await client.query("DELETE FROM product_tags WHERE product_id = $1", [
        productId,
      ]);

      // Insert new tags
      if (tagIds && tagIds.length > 0) {
        const values = tagIds
          .map((tagId, index) => `($1, $${index + 2})`)
          .join(", ");

        const query = `
          INSERT INTO product_tags (product_id, tag_id)
          VALUES ${values}
        `;

        await client.query(query, [productId, ...tagIds]);
      }

      await client.query("COMMIT");
      return { success: true };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error assigning tags to product:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove tags from a product
   */
  async removeTagsFromProduct(productId, tagIds = null) {
    try {
      let query;
      let params;

      if (tagIds && tagIds.length > 0) {
        // Remove specific tags
        const placeholders = tagIds
          .map((_, index) => `$${index + 2}`)
          .join(", ");
        query = `DELETE FROM product_tags WHERE product_id = $1 AND tag_id IN (${placeholders})`;
        params = [productId, ...tagIds];
      } else {
        // Remove all tags
        query = "DELETE FROM product_tags WHERE product_id = $1";
        params = [productId];
      }

      await db.query(query, params);
      return { success: true };
    } catch (error) {
      console.error("Error removing tags from product:", error);
      throw error;
    }
  }
}

module.exports = new TagService();
