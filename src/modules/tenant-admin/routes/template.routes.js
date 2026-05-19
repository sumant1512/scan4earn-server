/**
 * Template Management Routes (Tenant Admin)
 * All routes require authentication and appropriate role
 */

const express = require('express');
const router = express.Router();
const templateController = require('../controllers/template.controller');
const { authenticate, requireRole } = require('../../../middleware/auth.middleware');
const { requestValidator, preventDuplicates } = require('../../common/interceptors/request.interceptor');

// All routes require authentication
router.use(authenticate);
router.use(requestValidator);

/**
 * @route   GET /api/templates
 * @desc    Get all templates for tenant
 * @access  Private (Tenant Admin, Super Admin)
 */
router.get('/',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  templateController.getAllTemplates
);

/**
 * @route   GET /api/templates/:id
 * @desc    Get template by ID
 * @access  Private (Tenant Admin, Super Admin)
 */
router.get('/:id',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  templateController.getTemplateById
);

/**
 * @route   POST /api/templates
 * @desc    Create new template
 * @access  Private (Tenant Admin, Super Admin)
 */
router.post('/',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  preventDuplicates(2000),
  templateController.createTemplate
);

/**
 * @route   PUT /api/templates/:id
 * @desc    Update template
 * @access  Private (Tenant Admin, Super Admin)
 */
router.put('/:id',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  preventDuplicates(2000),
  templateController.updateTemplate
);

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete template
 * @access  Private (Tenant Admin, Super Admin)
 */
router.delete('/:id',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  preventDuplicates(2000),
  templateController.deleteTemplate
);

/**
 * @route   PATCH /api/templates/:id/toggle-status
 * @desc    Toggle template status (activate/deactivate)
 * @access  Private (Tenant Admin, Super Admin)
 */
router.patch('/:id/toggle-status',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  preventDuplicates(2000),
  templateController.toggleTemplateStatus
);

/**
 * @route   POST /api/templates/:id/duplicate
 * @desc    Duplicate template
 * @access  Private (Tenant Admin, Super Admin)
 */
router.post('/:id/duplicate',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  preventDuplicates(2000),
  templateController.duplicateTemplate
);

/**
 * @route   GET /api/templates/app/:appId
 * @desc    Get templates for a verification app
 * @access  Private (Tenant Admin, Super Admin)
 */
router.get('/app/:appId',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  templateController.getTemplatesForApp
);

module.exports = router;
