/**
 * Features Routes
 * Handles routing for feature flag management endpoints
 */

const express = require('express');
const router = express.Router();
const featureController = require('../controllers/feature.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

/**
 * All routes require authentication
 */
router.use(authenticate);

/**
 * POST /api/features
 * Create a new feature definition
 * Requires: SUPER_ADMIN role
 */
router.post(
  '/',
  requireRole(['SUPER_ADMIN']),
  featureController.createFeature
);

/**
 * GET /api/features
 * List all features
 * Accessible by: SUPER_ADMIN
 */
router.get(
  '/',
  requireRole(['SUPER_ADMIN']),
  featureController.listFeatures
);

/**
 * GET /api/features/:id
 * Get feature by ID
 * Accessible by: SUPER_ADMIN
 */
router.get(
  '/:id',
  requireRole(['SUPER_ADMIN']),
  featureController.getFeature
);

/**
 * PUT /api/features/:id
 * Update feature
 * Requires: SUPER_ADMIN role
 */
router.put(
  '/:id',
  requireRole(['SUPER_ADMIN']),
  featureController.updateFeature
);

/**
 * DELETE /api/features/:id
 * Delete feature
 * Requires: SUPER_ADMIN role
 */
router.delete(
  '/:id',
  requireRole(['SUPER_ADMIN']),
  featureController.deleteFeature
);

/**
 * POST /api/tenants/:tenantId/features/:featureId
 * Enable feature for tenant
 * Requires: SUPER_ADMIN role
 */
router.post(
  '/tenants/:tenantId/features/:featureId',
  requireRole(['SUPER_ADMIN']),
  featureController.enableFeatureForTenant
);

/**
 * PATCH /api/tenants/:tenantId/features/:featureId
 * Toggle feature for tenant (enable/disable)
 * Requires: SUPER_ADMIN or TENANT_ADMIN (own tenant, only if assigned)
 */
router.patch(
  '/tenants/:tenantId/features/:featureId',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  featureController.toggleFeatureForTenant
);

/**
 * GET /api/tenants/:tenantId/features
 * Get features for tenant
 * Accessible by: SUPER_ADMIN, TENANT_ADMIN (own tenant)
 */
router.get(
  '/tenants/:tenantId/features',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']),
  featureController.getTenantFeatures
);

/**
 * GET /api/tenants/:tenantId/features/:featureCode/check
 * Check if feature is enabled for tenant
 * Accessible by: SUPER_ADMIN, TENANT_ADMIN (own tenant), TENANT_USER (own tenant)
 */
router.get(
  '/tenants/:tenantId/features/:featureCode/check',
  requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER']),
  featureController.checkFeatureForTenant
);

module.exports = router;