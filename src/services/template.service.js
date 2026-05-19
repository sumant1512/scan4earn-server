const db = require('../config/database');

class TemplateService {

  /**
   * Get all templates for a tenant
   */
  async getAllTemplates(tenantId, filters = {}) {
    try {
      let query = `
        SELECT
          pt.id,
          pt.tenant_id,
          pt.template_name,
          pt.industry_type,
          pt.description,
          pt.icon,
          pt.variant_config,
          pt.custom_fields,
          pt.is_active,
          pt.created_at,
          pt.updated_at,
          COALESCE(COUNT(DISTINCT p.id), 0)::INTEGER as product_count,
          COALESCE(COUNT(DISTINCT va.id), 0)::INTEGER as app_count
        FROM product_templates pt
        LEFT JOIN products p ON pt.id = p.template_id
        LEFT JOIN verification_apps va ON pt.id = va.template_id
        WHERE pt.tenant_id = $1
      `;

      const params = [tenantId];
      let paramIndex = 2;

      // Filter by active status
      if (filters.is_active !== undefined) {
        query += ` AND pt.is_active = $${paramIndex}`;
        params.push(filters.is_active);
        paramIndex++;
      }

      query += ` GROUP BY pt.id ORDER BY pt.template_name ASC`;

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId, tenantId) {
    try {
      const query = `
        SELECT
          pt.id,
          pt.tenant_id,
          pt.template_name,
          pt.industry_type,
          pt.description,
          pt.icon,
          pt.variant_config,
          pt.custom_fields,
          pt.is_active,
          pt.created_at,
          pt.updated_at,
          COALESCE(COUNT(DISTINCT p.id), 0)::INTEGER as product_count,
          COALESCE(COUNT(DISTINCT va.id), 0)::INTEGER as app_count
        FROM product_templates pt
        LEFT JOIN products p ON pt.id = p.template_id
        LEFT JOIN verification_apps va ON pt.id = va.template_id
        WHERE pt.id = $1 AND pt.tenant_id = $2
        GROUP BY pt.id
      `;

      const result = await db.query(query, [templateId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting template by ID:', error);
      throw error;
    }
  }

  /**
   * Create new template
   */
  async createTemplate(tenantId, templateData) {
    try {
      const {
        template_name,
        industry_type,
        description,
        icon,
        variant_config,
        custom_fields,
        is_active = true
      } = templateData;

      // Validate required fields
      if (!industry_type) {
        throw new Error('industry_type is required');
      }

      // Validate variant_config structure
      this.validateVariantConfig(variant_config);

      // Validate custom_fields structure
      this.validateCustomFields(custom_fields);

      const query = `
        INSERT INTO product_templates (
          tenant_id,
          template_name,
          industry_type,
          description,
          icon,
          variant_config,
          custom_fields,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          tenant_id,
          template_name,
          industry_type,
          description,
          icon,
          variant_config,
          custom_fields,
          is_active,
          created_at,
          updated_at
      `;

      const params = [
        tenantId,
        template_name,
        industry_type,
        description,
        icon,
        JSON.stringify(variant_config),
        JSON.stringify(custom_fields),
        is_active
      ];

      const result = await db.query(query, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  /**
   * Update existing template
   */
  async updateTemplate(templateId, tenantId, updates) {
    try {
      // Check if template has products before allowing any updates
      const productCheck = await db.query(
        'SELECT COUNT(*) as count FROM products WHERE template_id = $1',
        [templateId]
      );

      const productCount = parseInt(productCheck.rows[0].count);

      if (productCount > 0) {
        const error = new Error('Cannot update template that has products. Please delete all products first or create a new template.');
        error.statusCode = 400;
        error.code = 'TEMPLATE_HAS_PRODUCTS';
        throw error;
      }

      // Check if template is assigned to any verification apps
      const appCheck = await db.query(
        'SELECT COUNT(*) as count FROM verification_apps WHERE template_id = $1',
        [templateId]
      );

      const appCount = parseInt(appCheck.rows[0].count);

      if (appCount > 0) {
        const error = new Error('Cannot update template that is assigned to verification apps. Please unassign from all apps first or create a new template.');
        error.statusCode = 400;
        error.code = 'TEMPLATE_ASSIGNED_TO_APPS';
        throw error;
      }

      const {
        template_name,
        industry_type,
        description,
        icon,
        variant_config,
        custom_fields,
        is_active
      } = updates;

      // Validate if provided
      if (variant_config) {
        this.validateVariantConfig(variant_config);
      }

      if (custom_fields) {
        this.validateCustomFields(custom_fields);
      }

      const updateFields = [];
      const params = [templateId, tenantId];
      let paramIndex = 3;

      if (template_name !== undefined) {
        updateFields.push(`template_name = $${paramIndex}`);
        params.push(template_name);
        paramIndex++;
      }

      if (industry_type !== undefined) {
        updateFields.push(`industry_type = $${paramIndex}`);
        params.push(industry_type);
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

      if (variant_config !== undefined) {
        updateFields.push(`variant_config = $${paramIndex}`);
        params.push(JSON.stringify(variant_config));
        paramIndex++;
      }

      if (custom_fields !== undefined) {
        updateFields.push(`custom_fields = $${paramIndex}`);
        params.push(JSON.stringify(custom_fields));
        paramIndex++;
      }

      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex}`);
        params.push(is_active);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      const query = `
        UPDATE product_templates
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id = $2
        RETURNING
          id,
          tenant_id,
          template_name,
          industry_type,
          description,
          icon,
          variant_config,
          custom_fields,
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
      console.error('Error updating template:', error);
      throw error;
    }
  }

  /**
   * Delete template (hard delete - permanently remove)
   */
  async deleteTemplate(templateId, tenantId) {
    try {
      // Check if template is used by products
      const productCheck = await db.query(
        'SELECT COUNT(*) as count FROM products WHERE template_id = $1',
        [templateId]
      );

      if (parseInt(productCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete template that has products. Please delete all products first.');
      }

      // Check if template is assigned to any verification apps
      const appCheck = await db.query(
        'SELECT COUNT(*) as count FROM verification_apps WHERE template_id = $1',
        [templateId]
      );

      if (parseInt(appCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete template that is assigned to verification apps. Please unassign from all apps first.');
      }

      // Hard delete the template
      const query = `
        DELETE FROM product_templates
        WHERE id = $1 AND tenant_id = $2
        RETURNING id
      `;

      const result = await db.query(query, [templateId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return { success: true, id: result.rows[0].id };
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Toggle template status (activate/deactivate)
   */
  async toggleTemplateStatus(templateId, tenantId) {
    try {
      // Get current template status
      const template = await this.getTemplateById(templateId, tenantId);

      if (!template) {
        throw new Error('Template not found');
      }

      // Check if template has products before allowing deactivation
      if (template.is_active && template.product_count > 0) {
        throw new Error('Cannot deactivate template that has products. Please delete all products first.');
      }

      // Toggle status
      const newStatus = !template.is_active;

      const query = `
        UPDATE product_templates
        SET is_active = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND tenant_id = $3
        RETURNING
          id,
          tenant_id,
          template_name,
          industry_type,
          description,
          icon,
          variant_config,
          custom_fields,
          is_active,
          created_at,
          updated_at
      `;

      const result = await db.query(query, [newStatus, templateId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error toggling template status:', error);
      throw error;
    }
  }

  /**
   * Validate variant_config structure
   */
  validateVariantConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('variant_config must be an object');
    }

    if (!config.variant_label || typeof config.variant_label !== 'string') {
      throw new Error('variant_config.variant_label is required and must be a string');
    }

    if (!Array.isArray(config.dimensions)) {
      throw new Error('variant_config.dimensions must be an array');
    }

    if (!Array.isArray(config.common_fields)) {
      throw new Error('variant_config.common_fields must be an array');
    }

    // Validate dimension fields
    config.dimensions.forEach((dim, index) => {
      if (!dim.attribute_key || !dim.attribute_name || !dim.type) {
        throw new Error(`variant_config.dimensions[${index}] must have attribute_key, attribute_name, and type`);
      }

      // Validate attribute_key format
      if (!/^[a-z0-9_]+$/.test(dim.attribute_key)) {
        throw new Error(`variant_config.dimensions[${index}].attribute_key must contain only lowercase letters, numbers, and underscores`);
      }
    });

    // Validate common fields
    config.common_fields.forEach((field, index) => {
      if (!field.attribute_key || !field.attribute_name || !field.type) {
        throw new Error(`variant_config.common_fields[${index}] must have attribute_key, attribute_name, and type`);
      }

      // Validate attribute_key format
      if (!/^[a-z0-9_]+$/.test(field.attribute_key)) {
        throw new Error(`variant_config.common_fields[${index}].attribute_key must contain only lowercase letters, numbers, and underscores`);
      }
    });

    return true;
  }

  /**
   * Validate custom_fields structure
   */
  validateCustomFields(fields) {
    if (!Array.isArray(fields)) {
      throw new Error('custom_fields must be an array');
    }

    fields.forEach((field, index) => {
      // Check for required fields (using new schema: attribute_key, attribute_name, data_type)
      if (!field.attribute_key || !field.attribute_name || !field.data_type) {
        throw new Error(`custom_fields[${index}] must have attribute_key, attribute_name, and data_type`);
      }

      // Validate attribute_key format (lowercase, alphanumeric, underscores only)
      if (!/^[a-z0-9_]+$/.test(field.attribute_key)) {
        throw new Error(`custom_fields[${index}].attribute_key must contain only lowercase letters, numbers, and underscores`);
      }

      // Validate select/multi-select types have options
      if ((field.data_type === 'select' || field.data_type === 'multi-select') &&
          (!field.validation_rules || !Array.isArray(field.validation_rules.options))) {
        throw new Error(`custom_fields[${index}] with type '${field.data_type}' must have validation_rules.options array`);
      }
    });

    return true;
  }

  /**
   * Get templates for a verification app
   */
  async getTemplatesForApp(appId, tenantId) {
    try {
      const query = `
        SELECT
          pt.id,
          pt.tenant_id,
          pt.template_name,
          pt.description,
          pt.variant_config,
          pt.custom_fields,
          pt.is_active,
          pt.created_at,
          pt.updated_at
        FROM product_templates pt
        WHERE pt.tenant_id = $1 AND pt.is_active = true
        ORDER BY pt.template_name ASC
      `;

      const result = await db.query(query, [tenantId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting templates for app:', error);
      throw error;
    }
  }
}

module.exports = new TemplateService();
