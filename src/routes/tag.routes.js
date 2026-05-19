const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tag.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/tags
 * @desc    Get all tags for tenant
 * @access  Private (Tenant Admin, Super Admin, Tenant User)
 * @query   ?verification_app_id=xxx&is_active=true
 */
router.get('/',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN', 'TENANT_USER']),
  tagController.getAllTags
);

/**
 * @route   GET /api/tags/:id
 * @desc    Get tag by ID
 * @access  Private (Tenant Admin, Super Admin, Tenant User)
 */
router.get('/:id',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN', 'TENANT_USER']),
  tagController.getTagById
);

/**
 * @route   POST /api/tags
 * @desc    Create new tag
 * @access  Private (Tenant Admin, Super Admin)
 */
router.post('/',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  tagController.createTag
);

/**
 * @route   PUT /api/tags/:id
 * @desc    Update tag
 * @access  Private (Tenant Admin, Super Admin)
 */
router.put('/:id',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  tagController.updateTag
);

/**
 * @route   DELETE /api/tags/:id
 * @desc    Delete tag
 * @access  Private (Tenant Admin, Super Admin)
 */
router.delete('/:id',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']),
  tagController.deleteTag
);

/**
 * @route   GET /api/tags/app/:appId
 * @desc    Get tags for a verification app
 * @access  Private (Tenant Admin, Super Admin, Tenant User)
 */
router.get('/app/:appId',
  requireRole(['TENANT_ADMIN', 'SUPER_ADMIN', 'TENANT_USER']),
  tagController.getTagsForApp
);

module.exports = router;
