const express = require('express');
const tenantProvisioningController = require('../controllers/tenantProvisioning.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../modules/common/utils/asyncHandler');

const router = express.Router();

// All tenant provisioning routes require authentication and super admin role
router.use(authenticateToken);

/**
 * Provision a new tenant
 * POST /api/super-admin/tenants/:id/provision
 *
 * This endpoint triggers automated provisioning for a newly created tenant.
 *
 * Steps performed:
 * 1. Create admin user account
 * 2. Create default verification app
 * 3. Generate sandbox API keys
 * 4. Seed sandbox environment with demo data
 * 5. Send onboarding email
 *
 * Request:
 * {
 *   "id": "tenant-uuid"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Tenant provisioned successfully",
 *   "data": {
 *     "tenantId": "...",
 *     "adminUser": {
 *       "id": "...",
 *       "email": "...",
 *       "role": "TENANT_ADMIN",
 *       "temporaryPassword": "..."
 *     },
 *     "verificationApp": {
 *       "id": "...",
 *       "name": "Primary App",
 *       "code": "..."
 *     },
 *     "sandboxKeys": {
 *       "mobileApiKey": "...",
 *       "ecommerceApiKey": "..."
 *     }
 *   }
 * }
 */
router.post(
  '/super-admin/tenants/:id/provision',
  asyncHandler((req, res, next) =>
    tenantProvisioningController.provisionTenant(req, res, next)
  )
);

/**
 * Get provisioning status for a tenant
 * GET /api/super-admin/tenants/:id/provisioning-status
 *
 * Returns the current provisioning status and audit trail.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "tenantId": "...",
 *     "tenantName": "...",
 *     "status": "completed|in_progress|failed|pending",
 *     "startedAt": "2026-05-31T10:00:00Z",
 *     "completedAt": "2026-05-31T10:05:00Z",
 *     "errorMessage": null,
 *     "steps": [
 *       {
 *         "step": "admin_user_created",
 *         "status": "success",
 *         "message": null,
 *         "created_at": "2026-05-31T10:00:30Z"
 *       },
 *       ...
 *     ]
 *   }
 * }
 */
router.get(
  '/super-admin/tenants/:id/provisioning-status',
  asyncHandler((req, res, next) =>
    tenantProvisioningController.getProvisioningStatus(req, res, next)
  )
);

/**
 * Retry provisioning for a failed tenant
 * POST /api/super-admin/tenants/:id/retry-provision
 *
 * Retries provisioning if it previously failed.
 * Can only be used when status is 'failed'.
 *
 * Response: Same as /provision endpoint
 */
router.post(
  '/super-admin/tenants/:id/retry-provision',
  asyncHandler((req, res, next) =>
    tenantProvisioningController.retryProvisioning(req, res, next)
  )
);

/**
 * Get provisioning settings
 * GET /api/super-admin/provisioning-settings
 *
 * Returns all provisioning configuration settings.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "auto_create_admin_user": {
 *       "value": "true",
 *       "description": "Automatically create admin user for new tenant"
 *     },
 *     "auto_create_verification_app": {
 *       "value": "true",
 *       "description": "Automatically create default verification app"
 *     },
 *     ...
 *   }
 * }
 */
router.get(
  '/super-admin/provisioning-settings',
  asyncHandler((req, res, next) =>
    tenantProvisioningController.getProvisioningSettings(req, res, next)
  )
);

/**
 * Update provisioning settings
 * PUT /api/super-admin/provisioning-settings
 *
 * Updates global provisioning settings.
 *
 * Request:
 * {
 *   "settings": {
 *     "auto_create_admin_user": "true",
 *     "send_onboarding_email": "false",
 *     "sandbox_data_retention_days": "14"
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Provisioning settings updated successfully"
 * }
 */
router.put(
  '/super-admin/provisioning-settings',
  asyncHandler((req, res, next) =>
    tenantProvisioningController.updateProvisioningSettings(req, res, next)
  )
);

module.exports = router;
