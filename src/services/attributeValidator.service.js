/**
 * Attribute Validator Service
 *
 * Validates product attributes against template definitions
 * Supports multiple data types and validation rules
 */

const db = require('../config/database');

class AttributeValidator {
  /**
   * Get template with all its attributes
   */
  async getTemplateWithAttributes(templateId) {
    const result = await db.query(`
      SELECT
        t.id,
        t.template_name as name,
        t.custom_fields as attributes
      FROM product_templates t
      WHERE t.id = $1 AND t.is_active = true
    `, [templateId]);

    if (result.rows.length === 0) {
      throw new Error('Template not found or inactive');
    }

    const template = result.rows[0];

    // custom_fields is already a JSONB array, but ensure it's an array
    if (!template.attributes || !Array.isArray(template.attributes)) {
      template.attributes = [];
    }

    return template;
  }

  /**
   * Validate product attributes against template
   * @param {UUID} templateId - Template ID
   * @param {Object} attributes - Key-value pairs of attributes
   * @returns {Object} {valid: boolean, errors: Array}
   */
  async validateAttributes(templateId, attributes) {
    const template = await this.getTemplateWithAttributes(templateId);
    const errors = [];

    // Get template attributes (already filtered, no nulls in JSONB array)
    const templateAttributes = template.attributes || [];

    // Extract custom_fields from attributes structure
    const customFields = attributes?.custom_fields || {};

    for (const attr of templateAttributes) {
      // Look for value in custom_fields object
      const value = customFields[attr.attribute_key];

      // Check required
      if (attr.is_required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} is required`
        });
        continue;
      }

      // Skip validation if optional and empty
      if (value === undefined || value === null || value === '') {
        continue;
      }

      // Validate by data type
      switch (attr.data_type) {
        case 'string':
          this.validateString(value, attr, errors);
          break;
        case 'number':
          this.validateNumber(value, attr, errors);
          break;
        case 'select':
          this.validateSelect(value, attr, errors);
          break;
        case 'multi-select':
          this.validateMultiSelect(value, attr, errors);
          break;
        case 'date':
          this.validateDate(value, attr, errors);
          break;
        case 'boolean':
          this.validateBoolean(value, attr, errors);
          break;
        case 'url':
          this.validateUrl(value, attr, errors);
          break;
        case 'email':
          this.validateEmail(value, attr, errors);
          break;
        case 'structured-list':
          this.validateStructuredList(value, attr, errors);
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateString(value, attr, errors) {
    if (typeof value !== 'string') {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be a string`
      });
      return;
    }

    const rules = attr.validation_rules || {};

    if (rules.min_length && value.length < rules.min_length) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be at least ${rules.min_length} characters`
      });
    }

    if (rules.max_length && value.length > rules.max_length) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be at most ${rules.max_length} characters`
      });
    }

    if (rules.regex && !new RegExp(rules.regex).test(value)) {
      errors.push({
        field: attr.attribute_key,
        message: rules.regex_message || `${attr.attribute_name} format is invalid`
      });
    }
  }

  validateNumber(value, attr, errors) {
    const num = Number(value);
    if (isNaN(num)) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be a valid number`
      });
      return;
    }

    const rules = attr.validation_rules || {};

    // Support both 'min'/'max' (legacy) and 'min_value'/'max_value' (new)
    const minValue = rules.min_value !== undefined ? rules.min_value : rules.min;
    const maxValue = rules.max_value !== undefined ? rules.max_value : rules.max;

    if (minValue !== undefined && num < minValue) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be at least ${minValue}`
      });
    }

    if (maxValue !== undefined && num > maxValue) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be at most ${maxValue}`
      });
    }

    if (rules.decimals !== undefined) {
      const decimals = (value.toString().split('.')[1] || '').length;
      if (decimals > rules.decimals) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} must have at most ${rules.decimals} decimal places`
        });
      }
    }
  }

  validateSelect(value, attr, errors) {
    const rules = attr.validation_rules || {};
    // Support both 'options' (new) and 'allowed_values' (legacy)
    const allowedValues = rules.options || rules.allowed_values || [];

    const compareValue = rules.case_sensitive ? value : value.toLowerCase();
    const allowedSet = new Set(
      rules.case_sensitive
        ? allowedValues
        : allowedValues.map(v => v.toLowerCase())
    );

    if (!allowedSet.has(compareValue)) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be one of: ${allowedValues.join(', ')}`
      });
    }
  }

  validateMultiSelect(value, attr, errors) {
    if (!Array.isArray(value)) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be an array`
      });
      return;
    }

    const rules = attr.validation_rules || {};

    if (rules.min_selections && value.length < rules.min_selections) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must have at least ${rules.min_selections} selections`
      });
    }

    if (rules.max_selections && value.length > rules.max_selections) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must have at most ${rules.max_selections} selections`
      });
    }

    // Support both 'options' (new) and 'allowed_values' (legacy)
    const allowedValues = new Set(rules.options || rules.allowed_values || []);
    for (const v of value) {
      if (!allowedValues.has(v)) {
        errors.push({
          field: attr.attribute_key,
          message: `Invalid value '${v}' in ${attr.attribute_name}`
        });
      }
    }
  }

  validateDate(value, attr, errors) {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be a valid date`
      });
      return;
    }

    const rules = attr.validation_rules || {};

    if (rules.min_date) {
      const minDate = new Date(rules.min_date);
      if (date < minDate) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} must be on or after ${rules.min_date}`
        });
      }
    }

    if (rules.max_date) {
      const maxDate = new Date(rules.max_date);
      if (date > maxDate) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} must be on or before ${rules.max_date}`
        });
      }
    }
  }

  validateBoolean(value, attr, errors) {
    if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be true or false`
      });
    }
  }

  validateUrl(value, attr, errors) {
    try {
      const url = new URL(value);
      const rules = attr.validation_rules || {};

      if (rules.protocols && rules.protocols.length > 0) {
        if (!rules.protocols.includes(url.protocol.replace(':', ''))) {
          errors.push({
            field: attr.attribute_key,
            message: `${attr.attribute_name} must use one of these protocols: ${rules.protocols.join(', ')}`
          });
        }
      }
    } catch (error) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be a valid URL`
      });
    }
  }

  validateEmail(value, attr, errors) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be a valid email address`
      });
      return;
    }

    const rules = attr.validation_rules || {};
    if (rules.domain_whitelist && rules.domain_whitelist.length > 0) {
      const domain = value.split('@')[1];
      if (!rules.domain_whitelist.includes(domain)) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} must be from one of these domains: ${rules.domain_whitelist.join(', ')}`
        });
      }
    }
  }

  validateStructuredList(value, attr, errors) {
    if (!Array.isArray(value)) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must be an array of sections`
      });
      return;
    }

    const rules = attr.validation_rules || {};

    // Check number of sections
    if (rules.min_sections && value.length < rules.min_sections) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must have at least ${rules.min_sections} sections`
      });
    }

    if (rules.max_sections && value.length > rules.max_sections) {
      errors.push({
        field: attr.attribute_key,
        message: `${attr.attribute_name} must have at most ${rules.max_sections} sections`
      });
    }

    // Validate each section
    for (let i = 0; i < value.length; i++) {
      const section = value[i];

      if (typeof section !== 'object' || section === null) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} section ${i + 1} must be an object`
        });
        continue;
      }

      // Check for heading
      if (!section.heading || typeof section.heading !== 'string') {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} section ${i + 1} must have a heading`
        });
      }

      // Check for points
      if (!Array.isArray(section.points)) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} section ${i + 1} must have a points array`
        });
        continue;
      }

      // Check number of points
      if (rules.min_points_per_section && section.points.length < rules.min_points_per_section) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} section ${i + 1} must have at least ${rules.min_points_per_section} points`
        });
      }

      if (rules.max_points_per_section && section.points.length > rules.max_points_per_section) {
        errors.push({
          field: attr.attribute_key,
          message: `${attr.attribute_name} section ${i + 1} must have at most ${rules.max_points_per_section} points`
        });
      }

      // Validate each point is a string
      for (let j = 0; j < section.points.length; j++) {
        if (typeof section.points[j] !== 'string') {
          errors.push({
            field: attr.attribute_key,
            message: `${attr.attribute_name} section ${i + 1}, point ${j + 1} must be a string`
          });
        }
      }
    }
  }
}

module.exports = new AttributeValidator();
