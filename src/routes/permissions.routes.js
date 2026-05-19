/**
 * Permissions Routes
 * Handles routing for permission management endpoints
 */

const express = require('express');
const router = express.Router();
const permissionsController = require('../controllers/permissions.controller');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth.middleware');

/**
 * All routes require authentication
 */
router.use(authenticate);

/**
 * POST /api/v1/permissions
 * Create a new permission definition
 * Requires: SUPER_ADMIN role
 */
router.post(
  '/',
  requireRole(['SUPER_ADMIN']),
  permissionsController.createPermission
);

/**
 * GET /api/v1/permissions
 * List permissions with filtering
 * Accessible by: SUPER_ADMIN, TENANT_ADMIN (filtered to assignable permissions)
 */
router.get(
  '/',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  permissionsController.listPermissions
);

/**
 * GET /api/v1/permissions/:code
 * Get permission by code
 * Accessible by: SUPER_ADMIN, TENANT_ADMIN
 */
router.get(
  '/:code',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  permissionsController.getPermission
);

/**
 * PUT /api/v1/permissions/:id
 * Update permission metadata (name, description, allowed_assigners)
 * Requires: SUPER_ADMIN role
 * Note: Permission code is immutable after creation
 */
router.put(
  '/:id',
  requireRole(['SUPER_ADMIN']),
  permissionsController.updatePermission
);

module.exports = router;
