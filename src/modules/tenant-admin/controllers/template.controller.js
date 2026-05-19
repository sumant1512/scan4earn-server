/**
 * Template Management Controller (Tenant Admin)
 * Handles CRUD operations for product templates
 */

const templateService = require('../../../services/template.service');
const { AppError, ValidationError, ConflictError, NotFoundError } = require('../../common/errors/AppError');
const { asyncHandler } = require('../../common/middleware/errorHandler.middleware');
const { validateRequiredFields } = require('../../common/validators/common.validator');
const { sendSuccess, sendCreated, sendNotFound, sendConflict } = require('../../common/utils/response.util');

class TemplateController {
  /**
   * Get all templates
   * GET /api/tenant-admin/templates
   */
  getAllTemplates = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      search: req.query.search,
      include_system: req.query.include_system !== undefined ? req.query.include_system === 'true' : true
    };

    const templates = await templateService.getAllTemplates(tenantId, filters);

    // Transform templates to match frontend expectations (backward compatibility)
    const transformedTemplates = templates.map(t => ({
      id: t.id,
      tenant_id: t.tenant_id,
      name: t.template_name,
      description: t.description,
      icon: t.icon || '📋',
      is_system_template: false,
      is_active: t.is_active,
      created_at: t.created_at,
      updated_at: t.updated_at,
      attribute_count: t.custom_fields ? (Array.isArray(t.custom_fields) ? t.custom_fields.length : 0) : 0,
      product_count: t.product_count || 0,
      app_count: t.app_count || 0
    }));

    // Calculate pagination
    const total = transformedTemplates.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTemplates = transformedTemplates.slice(startIndex, endIndex);

    return sendSuccess(res, {
      templates: paginatedTemplates,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  });

  /**
   * Get template by ID
   * GET /api/tenant-admin/templates/:id
   */
  getTemplateById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;

    const template = await templateService.getTemplateById(id, tenantId);

    if (!template) {
      throw new NotFoundError('Template');
    }

    return sendSuccess(res, template, 'Template retrieved successfully');
  });

  /**
   * Create new template
   * POST /api/tenant-admin/templates
   */
  createTemplate = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenant_id;
    const templateData = req.body;

    // Validate required fields
    validateRequiredFields(templateData, ['template_name', 'industry_type', 'variant_config', 'custom_fields']);

    const template = await templateService.createTemplate(tenantId, templateData);

    return sendCreated(res, { data: template }, 'Template created successfully');
  });

  /**
   * Update existing template
   * PUT /api/tenant-admin/templates/:id
   */
  updateTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;
    const updates = req.body;

    const template = await templateService.updateTemplate(id, tenantId, updates);

    if (!template) {
      throw new NotFoundError('Template');
    }

    return sendSuccess(res, { data: template }, 'Template updated successfully');
  });

  /**
   * Delete template
   * DELETE /api/tenant-admin/templates/:id
   */
  deleteTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;

    const result = await templateService.deleteTemplate(id, tenantId);

    if (!result) {
      throw new NotFoundError('Template');
    }

    return sendSuccess(res, {}, 'Template deleted successfully');
  });

  /**
   * Get templates for a verification app
   * GET /api/tenant-admin/templates/app/:appId
   */
  getTemplatesForApp = asyncHandler(async (req, res) => {
    const { appId } = req.params;
    const tenantId = req.user.tenant_id;

    const templates = await templateService.getTemplatesForApp(appId, tenantId);

    return sendSuccess(res, { data: templates, count: templates.length });
  });

  /**
   * Duplicate template
   * POST /api/tenant-admin/templates/:id/duplicate
   */
  duplicateTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;
    const { name } = req.body;

    validateRequiredFields(req.body, ['name']);

    // Get source template
    const sourceTemplate = await templateService.getTemplateById(id, tenantId);

    if (!sourceTemplate) {
      throw new NotFoundError('Source template');
    }

    // Create duplicate with new name
    const duplicateData = {
      template_name: name,
      description: sourceTemplate.description,
      variant_config: sourceTemplate.variant_config,
      custom_fields: sourceTemplate.custom_fields,
      is_active: true
    };

    const newTemplate = await templateService.createTemplate(tenantId, duplicateData);

    return sendCreated(res, { template: newTemplate }, 'Template duplicated successfully');
  });

  /**
   * Toggle template status (activate/deactivate)
   * PATCH /api/tenant-admin/templates/:id/toggle-status
   */
  toggleTemplateStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;

    const template = await templateService.toggleTemplateStatus(id, tenantId);

    if (!template) {
      throw new NotFoundError('Template');
    }

    const action = template.is_active ? 'activated' : 'deactivated';

    return sendSuccess(res, { data: template }, `Template ${action} successfully`);
  });
}

// Export controller instance with bound methods
const controller = new TemplateController();

module.exports = {
  getAllTemplates: controller.getAllTemplates,
  getTemplateById: controller.getTemplateById,
  createTemplate: controller.createTemplate,
  updateTemplate: controller.updateTemplate,
  deleteTemplate: controller.deleteTemplate,
  getTemplatesForApp: controller.getTemplatesForApp,
  duplicateTemplate: controller.duplicateTemplate,
  toggleTemplateStatus: controller.toggleTemplateStatus
};
