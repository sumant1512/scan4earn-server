/**
 * Tenant Users Controller
 * Refactored to use modern error handling and validators
 */

const tenantUserService = require('../services/tenantUser.service');
const permissionService = require('../services/permission.service');
const emailService = require('../services/email.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  ValidationError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendCreated
} = require('../modules/common/utils/response.util');

/**
 * Create a tenant user with permissions
 * POST /api/v1/tenants/:tenantId/users
 */
const createTenantUser = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { email, full_name, phone, role, permission_ids, send_welcome_email } = req.body;

  validateRequiredFields(req.body, ['email', 'full_name', 'role']);

  // Validate tenant access
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenant_id !== tenantId) {
    throw new ForbiddenError('Cannot create users in other tenants');
  }

  try {
    const result = await tenantUserService.createUser(
      tenantId,
      { email, full_name, phone, role },
      permission_ids || [],
      req.user.id,
      req.user.role,
      req
    );

    // Send welcome email if requested (especially for Tenant Admins)
    let welcomeEmailSent = false;
    if (send_welcome_email === true && result.user) {
      try {
        await emailService.sendTenantAdminWelcomeEmail(
          result.user.email,
          result.user.full_name,
          result.tenant
        );
        welcomeEmailSent = true;
      } catch (emailError) {
        // Don't fail the request, just log the error
      }
    }

    return sendCreated(res, {
      ...result,
      welcome_email_sent: welcomeEmailSent
    }, 'User created successfully', {
      warnings: welcomeEmailSent ? undefined : (send_welcome_email ? [{
        code: 'EMAIL_DELIVERY_FAILED',
        message: 'User created but welcome email could not be sent'
      }] : undefined)
    });

  } catch (error) {
    if (error.message.includes('already exists')) {
      throw new ConflictError(error.message, 'USER_EXISTS');
    }

    if (error.message.includes('Unauthorized permission')) {
      throw new ForbiddenError(error.message, 'UNAUTHORIZED_PERMISSION_ASSIGNMENT');
    }

    if (error.message.includes('Role must be')) {
      throw new ValidationError(error.message);
    }

    throw error;
  }
});

/**
 * List users in a tenant
 * GET /api/v1/tenants/:tenantId/users
 */
const listTenantUsers = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { role, search, page = 1, limit = 50 } = req.query;

  // Validate tenant access
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenant_id !== tenantId) {
    throw new ForbiddenError('Cannot access users from other tenants');
  }

  const result = await tenantUserService.listUsers(tenantId, {
    role,
    search,
    include_permissions: true,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 100)
  });

  return sendSuccess(res, {
    users: result.users,
    pagination: result.pagination
  });
});

/**
 * Get user details with permissions
 * GET /api/v1/tenants/:tenantId/users/:userId
 */
const getTenantUser = asyncHandler(async (req, res) => {
  const { tenantId, userId } = req.params;

  // Validate tenant access
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenant_id !== tenantId) {
    throw new ForbiddenError('Cannot access users from other tenants');
  }

  const user = await tenantUserService.getUserWithPermissions(userId, tenantId);

  if (!user) {
    throw new NotFoundError('User');
  }

  return sendSuccess(res, { user });
});

/**
 * Delete a tenant user (soft delete)
 * DELETE /api/v1/tenants/:tenantId/users/:userId
 */
const deleteTenantUser = asyncHandler(async (req, res) => {
  const { tenantId, userId } = req.params;

  // Validate tenant access
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenant_id !== tenantId) {
    throw new ForbiddenError('Cannot delete users from other tenants');
  }

  // Prevent self-deletion
  if (userId === req.user.id) {
    throw new ValidationError('Cannot delete your own account');
  }

  try {
    const user = await tenantUserService.deleteUser(userId, tenantId, req.user.id, req);

    return sendSuccess(res, { user }, 'User deleted successfully');

  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('already deleted')) {
      throw new NotFoundError(error.message);
    }

    throw error;
  }
});

/**
 * Get effective permissions for a user
 * GET /api/v1/tenants/:tenantId/users/:userId/permissions
 */
const getUserPermissions = asyncHandler(async (req, res) => {
  const { tenantId, userId } = req.params;

  // Validate tenant access
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenant_id !== tenantId) {
    throw new ForbiddenError('Cannot access users from other tenants');
  }

  const permissions = await tenantUserService.getEffectivePermissions(userId, tenantId);

  // Get full permission details
  const permissionDetails = await Promise.all(
    permissions.map(code => permissionService.getPermissionByCode(code))
  );

  return sendSuccess(res, {
    user_id: userId,
    tenant_id: tenantId,
    permissions: permissionDetails.filter(p => p !== null)
  });
});

/**
 * Assign permissions to a user
 * POST /api/v1/tenants/:tenantId/users/:userId/permissions
 */
const assignUserPermissions = asyncHandler(async (req, res) => {
  const { tenantId, userId } = req.params;
  const { permission_ids } = req.body;

  if (!permission_ids || !Array.isArray(permission_ids) || permission_ids.length === 0) {
    throw new ValidationError('permission_ids array is required');
  }

  // Validate tenant access
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenant_id !== tenantId) {
    throw new ForbiddenError('Cannot assign permissions to users in other tenants');
  }

  try {
    const assignments = await tenantUserService.assignPermissionsToUser(
      userId,
      tenantId,
      permission_ids,
      req.user.id,
      req.user.role,
      req
    );

    return sendCreated(res, { assignments }, `${assignments.length} permission(s) assigned successfully`);

  } catch (error) {
    if (error.message.includes('User not found')) {
      throw new NotFoundError(error.message);
    }

    if (error.message.includes('Unauthorized')) {
      throw new ForbiddenError(error.message, 'UNAUTHORIZED_PERMISSION_ASSIGNMENT');
    }

    throw error;
  }
});

/**
 * Assign tenant-level permissions
 * POST /api/v1/tenants/:tenantId/permissions
 */
const assignTenantPermissions = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { permission_ids } = req.body;

  if (!permission_ids || !Array.isArray(permission_ids) || permission_ids.length === 0) {
    throw new ValidationError('permission_ids array is required');
  }

  // Validate tenant access
  if (req.user.role !== 'SUPER_ADMIN' && req.user.tenant_id !== tenantId) {
    throw new ForbiddenError('Cannot assign permissions to other tenants');
  }

  try {
    const assignments = await tenantUserService.assignPermissionsToTenant(
      tenantId,
      permission_ids,
      req.user.id,
      req
    );

    return sendCreated(res, { assignments }, `${assignments.length} tenant-level permission(s) assigned successfully`);

  } catch (error) {
    if (error.message.includes('TENANT scope')) {
      throw new ValidationError(error.message);
    }

    throw error;
  }
});

module.exports = {
  createTenantUser,
  listTenantUsers,
  getTenantUser,
  deleteTenantUser,
  getUserPermissions,
  assignUserPermissions,
  assignTenantPermissions
};
