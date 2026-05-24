/**
 * Features Controller
 * Handles feature flag management endpoints
 */

const featureService = require('../services/feature.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ConflictError,
  ValidationError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendCreated
} = require('../modules/common/utils/response.util');

/**
 * Create a new feature definition
 * POST /api/features
 * Requires: SUPER_ADMIN role
 */
const createFeature = asyncHandler(async (req, res) => {
  const { code, name, description, is_active, default_enabled, parent_id } = req.body;

  // Validation
  validateRequiredFields(req.body, ['code', 'name']);

  try {
    const feature = await featureService.createFeature(
      { code, name, description, is_active, default_enabled, parent_id },
      req.user.id,
      req
    );

    return sendCreated(res, { feature }, 'Feature created successfully');

  } catch (error) {
    // Handle specific service errors
    if (error.message.includes('already exists')) {
      throw new ConflictError(error.message, 'FEATURE_EXISTS', { field: 'code' });
    }

    if (error.message.includes('format') || error.message.includes('length')) {
      throw new ValidationError(error.message, 'INVALID_FEATURE_DATA');
    }

    throw error;
  }
});

/**
 * List all features
 * GET /api/features
 */
const listFeatures = asyncHandler(async (req, res) => {
  const features = await featureService.getFeatures();

  return sendSuccess(res, { features });
});

/**
 * Get feature by ID
 * GET /api/features/:id
 */
const getFeature = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const feature = await featureService.getFeatureById(id);

  if (!feature) {
    throw new NotFoundError('Feature');
  }

  return sendSuccess(res, { feature });
});

/**
 * Update feature
 * PUT /api/features/:id
 * Requires: SUPER_ADMIN role
 */
const updateFeature = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active, default_enabled, parent_id } = req.body;

  try {
    const feature = await featureService.updateFeature(
      id,
      { name, description, is_active, default_enabled, parent_id },
      req.user.id,
      req
    );

    return sendSuccess(res, { feature }, 'Feature updated successfully');

  } catch (error) {
    if (error.message === 'Feature not found') {
      throw new NotFoundError('Feature');
    }

    throw error;
  }
});

/**
 * Delete feature
 * DELETE /api/features/:id
 * Requires: SUPER_ADMIN role
 */
const deleteFeature = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await featureService.deleteFeature(id, req.user.id, req);

    return sendSuccess(res, null, 'Feature deleted successfully');

  } catch (error) {
    if (error.message === 'Feature not found') {
      throw new NotFoundError('Feature');
    }

    throw error;
  }
});

/**
 * Enable feature for tenant
 * POST /api/tenants/:tenantId/features/:featureId
 * Requires: SUPER_ADMIN role
 */
const enableFeatureForTenant = asyncHandler(async (req, res) => {
  const { tenantId, featureId } = req.params;

  try {
    const tenantFeature = await featureService.enableFeatureForTenant(
      featureId,
      tenantId,
      req.user.id,
      req
    );

    return sendSuccess(res, { tenant_feature: tenantFeature }, 'Feature enabled for tenant');

  } catch (error) {
    if (error.message.includes('not found')) {
      throw new NotFoundError('Feature or tenant');
    }

    throw error;
  }
});

/**
 * Disable feature for tenant
 * DELETE /api/tenants/:tenantId/features/:featureId
 * Requires: SUPER_ADMIN role
 */
const disableFeatureForTenant = asyncHandler(async (req, res) => {
  const { tenantId, featureId } = req.params;

  try {
    await featureService.disableFeatureForTenant(
      featureId,
      tenantId,
      req.user.id,
      req
    );

    return sendSuccess(res, null, 'Feature disabled for tenant');

  } catch (error) {
    if (error.message === 'Feature not found') {
      throw new NotFoundError('Feature');
    }

    throw error;
  }
});

/**
 * Get features for tenant
 * GET /api/tenants/:tenantId/features
 */
const getTenantFeatures = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  const features = await featureService.getTenantFeatures(tenantId, req.user.role);

  return sendSuccess(res, { features });
});

/**
 * Check if feature is enabled for tenant
 * GET /api/tenants/:tenantId/features/:featureCode/check
 */
const checkFeatureForTenant = asyncHandler(async (req, res) => {
  const { tenantId, featureCode } = req.params;

  const enabled = await featureService.isFeatureEnabledForTenant(featureCode, tenantId);

  return sendSuccess(res, { enabled });
});

/**
 * Toggle feature for tenant (enable/disable)
 * PATCH /api/tenants/:tenantId/features/:featureId
 * Requires: SUPER_ADMIN or TENANT_ADMIN (own tenant, only if assigned)
 */
const toggleFeatureForTenant = asyncHandler(async (req, res) => {
  const { tenantId, featureId } = req.params;
  const { enabled } = req.body;

  // Validate enabled is boolean
  if (typeof enabled !== 'boolean') {
    throw new ValidationError('enabled must be a boolean', 'INVALID_TOGGLE_DATA');
  }

  try {
    const result = await featureService.toggleFeatureForTenant(
      featureId,
      tenantId,
      req.user.id,
      req.user.role,
      enabled,
      req
    );

    return sendSuccess(res, { feature: result }, `Feature ${enabled ? 'enabled' : 'disabled'} successfully`);

  } catch (error) {
    if (error.message.includes('not assigned')) {
      throw new ValidationError(error.message, 'FEATURE_NOT_ASSIGNED');
    }
    if (error.message.includes('not found')) {
      throw new NotFoundError(error.message);
    }
    throw error;
  }
});

module.exports = {
  createFeature,
  listFeatures,
  getFeature,
  updateFeature,
  deleteFeature,
  enableFeatureForTenant,
  disableFeatureForTenant,
  toggleFeatureForTenant,
  getTenantFeatures,
  checkFeatureForTenant
};