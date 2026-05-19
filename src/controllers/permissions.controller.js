/**
 * Permissions Controller
 * Refactored to use modern error handling and validators
 */

const permissionService = require('../services/permission.service');
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
 * Create a new permission definition
 * POST /api/v1/permissions
 * Requires: SUPER_ADMIN role
 */
const createPermission = asyncHandler(async (req, res) => {
  const { code, name, description, scope, allowed_assigners } = req.body;

  // Validation
  validateRequiredFields(req.body, ['code', 'name', 'scope']);

  try {
    const permission = await permissionService.createPermission(
      { code, name, description, scope, allowed_assigners },
      req.user.id,
      req
    );

    return sendCreated(res, { permission }, 'Permission created successfully');

  } catch (error) {
    // Handle specific service errors
    if (error.message.includes('already exists')) {
      throw new ConflictError(error.message, 'PERMISSION_EXISTS', { field: 'code' });
    }

    if (error.message.includes('format') || error.message.includes('length') || error.message.includes('Scope')) {
      throw new ValidationError(error.message, 'INVALID_PERMISSION_DATA');
    }

    throw error;
  }
});

/**
 * List permissions with filtering
 * GET /api/v1/permissions
 */
const listPermissions = asyncHandler(async (req, res) => {
  const {
    scope,
    search,
    page = 1,
    limit = 50
  } = req.query;

  // For TENANT_ADMIN, only show permissions they can assign
  const filters = {
    scope,
    search,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100) // Max 100 per page
  };

  if (req.user.role === 'TENANT_ADMIN') {
    filters.assignable_by = 'TENANT_ADMIN';
  }

  const result = await permissionService.listPermissions(filters);

  return sendSuccess(res, {
    permissions: result.permissions,
    pagination: result.pagination
  });
});

/**
 * Get permission by code
 * GET /api/v1/permissions/:code
 */
const getPermission = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const permission = await permissionService.getPermissionByCode(code);

  if (!permission) {
    throw new NotFoundError('Permission');
  }

  return sendSuccess(res, { permission });
});

/**
 * Update permission metadata
 * PUT /api/v1/permissions/:id
 * Requires: SUPER_ADMIN role
 */
const updatePermission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, allowed_assigners } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (allowed_assigners !== undefined) updates.allowed_assigners = allowed_assigners;

  try {
    const permission = await permissionService.updatePermission(
      id,
      updates,
      req.user.id,
      req
    );

    return sendSuccess(res, { permission }, 'Permission updated successfully');

  } catch (error) {
    if (error.message === 'Permission not found') {
      throw new NotFoundError('Permission');
    }

    if (error.message.includes('cannot be modified')) {
      throw new ValidationError(error.message, 'IMMUTABLE_FIELD');
    }

    throw error;
  }
});

module.exports = {
  createPermission,
  listPermissions,
  getPermission,
  updatePermission
};
