/**
 * Tenant Users Routes
 * Handles routing for tenant user management and permission assignment
 */

const express = require('express');
const router = express.Router();
const tenantUsersController = require('../controllers/tenantUsers.controller');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth.middleware');

/**
 * All routes require authentication
 */
router.use(authenticate);

/**
 * POST /api/v1/tenants/:tenantId/users
 * Create a tenant user with initial permissions
 * Requires: manage_tenant_users permission OR SUPER_ADMIN
 */
router.post(
  '/:tenantId/users',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  requirePermission('manage_tenant_users'),
  tenantUsersController.createTenantUser
);

/**
 * GET /api/v1/tenants/:tenantId/users
 * List users in a tenant
 * Requires: view_tenant_users permission OR SUPER_ADMIN
 */
router.get(
  '/:tenantId/users',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER']),
  requirePermission('view_tenant_users'),
  tenantUsersController.listTenantUsers
);

/**
 * GET /api/v1/tenants/:tenantId/users/:userId
 * Get user details with permissions
 * Requires: view_tenant_users permission OR SUPER_ADMIN
 */
router.get(
  '/:tenantId/users/:userId',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER']),
  requirePermission('view_tenant_users'),
  tenantUsersController.getTenantUser
);

/**
 * DELETE /api/v1/tenants/:tenantId/users/:userId
 * Delete a tenant user (soft delete)
 * Requires: manage_tenant_users permission OR SUPER_ADMIN
 */
router.delete(
  '/:tenantId/users/:userId',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  requirePermission('manage_tenant_users'),
  tenantUsersController.deleteTenantUser
);

/**
 * GET /api/v1/tenants/:tenantId/users/:userId/permissions
 * Get effective permissions for a user
 * Requires: view_permissions permission OR SUPER_ADMIN
 */
router.get(
  '/:tenantId/users/:userId/permissions',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER']),
  requirePermission('view_permissions'),
  tenantUsersController.getUserPermissions
);

/**
 * POST /api/v1/tenants/:tenantId/users/:userId/permissions
 * Assign permissions to a specific user
 * Requires: assign_permissions permission OR SUPER_ADMIN
 */
router.post(
  '/:tenantId/users/:userId/permissions',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  requirePermission('assign_permissions'),
  tenantUsersController.assignUserPermissions
);

/**
 * POST /api/v1/tenants/:tenantId/permissions
 * Assign tenant-level permissions (inherited by all users)
 * Requires: assign_permissions permission OR SUPER_ADMIN
 */
router.post(
  '/:tenantId/permissions',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  requirePermission('assign_permissions'),
  tenantUsersController.assignTenantPermissions
);

module.exports = router;
