/**
 * Tenant User Service
 * Handles tenant user creation, permission management, and user operations
 */

const db = require('../config/database');
const permissionService = require('./permission.service');
const auditService = require('./audit.service');
const bcrypt = require('bcrypt');

/**
 * Create a tenant user with permission assignments
 * @param {string} tenantId - Tenant ID
 * @param {Object} userData - User data
 * @param {string} userData.email - User email
 * @param {string} userData.full_name - User's full name
 * @param {string} userData.phone - User's phone (optional)
 * @param {string} userData.role - TENANT_ADMIN or TENANT_USER
 * @param {Array<string>} permissionIds - Permission IDs to assign
 * @param {string} actorId - ID of user creating this user
 * @param {string} actorRole - Role of actor
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Created user with assigned permissions
 */
async function createUser(tenantId, userData, permissionIds = [], actorId, actorRole, req = null) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Validate email uniqueness within tenant
    const duplicateCheck = await client.query(
      'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
      [userData.email.toLowerCase(), tenantId]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new Error(`User with email '${userData.email}' already exists in this tenant`);
    }

    // Validate role
    const validRoles = ['TENANT_ADMIN', 'TENANT_USER'];
    if (!validRoles.includes(userData.role)) {
      throw new Error(`Role must be one of: ${validRoles.join(', ')}`);
    }

    // Validate permission assignments
    if (permissionIds && permissionIds.length > 0) {
      const validationResults = await Promise.all(
        permissionIds.map(pid => permissionService.validateAssignment(pid, actorRole, tenantId))
      );

      const invalidPermissions = validationResults
        .map((result, index) => ({
          permissionId: permissionIds[index],
          ...result
        }))
        .filter(r => !r.valid);

      if (invalidPermissions.length > 0) {
        throw new Error(`Unauthorized permission assignments: ${invalidPermissions.map(p => p.error).join('; ')}`);
      }

      if (userData.role === 'TENANT_USER') {
        const permissions = await permissionService.getPermissionsByIds(permissionIds);
        const writePermissionPattern = /^(create|edit|delete|manage|assign|request|approve|reject)_/;
        const writePermissions = permissions.filter(permission => writePermissionPattern.test(permission.code));

        if (writePermissions.length > 0) {
          throw new Error('TENANT_USER can only receive view permissions');
        }
      }
    }

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, full_name, phone, role, tenant_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [userData.email.toLowerCase(), userData.full_name, userData.phone || null, userData.role, tenantId]
    );

    const user = userResult.rows[0];

    // Assign user-level permissions
    const assignments = [];
    if (permissionIds && permissionIds.length > 0) {
      for (const permissionId of permissionIds) {
        const assignmentResult = await client.query(
          `INSERT INTO permission_assignments (permission_id, user_id, assigned_by, is_tenant_level)
           VALUES ($1, $2, $3, false)
           RETURNING *`,
          [permissionId, user.id, actorId]
        );

        assignments.push(assignmentResult.rows[0]);

        // Log each assignment
        await auditService.logPermissionAssignment(
          assignmentResult.rows[0].id,
          actorId,
          {
            user_id: user.id,
            permission_id: permissionId,
            is_tenant_level: false
          },
          req,
          client
        );
      }
    }

    // Log user creation
    await auditService.logUserCreation(
      user.id,
      tenantId,
      actorId,
      {
        email: user.email,
        role: user.role,
        permissions_assigned: permissionIds.length
      },
      req,
      client
    );

    await client.query('COMMIT');

    // Get tenant info for response
    const tenantResult = await client.query(
      'SELECT tenant_name, subdomain_slug FROM tenants WHERE id = $1',
      [tenantId]
    );
    
    const tenant = tenantResult.rows[0] || {};

    return {
      user,
      assigned_permissions: assignments.length,
      tenant: {
        id: tenantId,
        name: tenant.tenant_name,
        subdomain: tenant.subdomain_slug,
        domain: `${tenant.subdomain_slug}.${process.env.DOMAIN_BASE || 'scan4earn.com'}`
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * List users in a tenant with their permissions
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @param {string} filters.role - Filter by role
 * @param {string} filters.search - Search in email or name
 * @param {boolean} filters.include_permissions - Include user permissions
 * @param {number} filters.page - Page number
 * @param {number} filters.limit - Results per page
 * @returns {Promise<Object>} Paginated user list
 */
async function listUsers(tenantId, filters = {}) {
  const {
    role,
    search,
    include_permissions = true,
    page = 1,
    limit = 50
  } = filters;

  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM users WHERE tenant_id = $1 AND deleted_at IS NULL';
  const params = [tenantId];
  let paramIndex = 2;

  if (role) {
    query += ` AND role = $${paramIndex}`;
    params.push(role);
    paramIndex++;
  }

  if (search) {
    query += ` AND (email ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Get total count
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
  const countResult = await db.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);

  // Add sorting and pagination
  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await db.query(query, params);
  const users = result.rows;

  // Include permissions if requested
  if (include_permissions) {
    for (const user of users) {
      user.permissions = await getEffectivePermissions(user.id, tenantId);
    }
  }

  return {
    users,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get user with permissions
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object|null>} User with permissions
 */
async function getUserWithPermissions(userId, tenantId) {
  const result = await db.query(
    'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [userId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  user.permissions = await getEffectivePermissions(userId, tenantId);

  return user;
}

/**
 * Update editable tenant-user profile fields.
 */
async function updateUser(userId, tenantId, userData) {
  const result = await db.query(
    `UPDATE users
     SET full_name = $1,
         phone = $2,
         role = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
       AND tenant_id = $5
       AND deleted_at IS NULL
     RETURNING *`,
    [userData.full_name, userData.phone || null, userData.role, userId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * Delete user (soft delete)
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @param {string} actorId - ID of user performing deletion
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Deleted user
 */
async function deleteUser(userId, tenantId, actorId, req = null) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Get user before deletion
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [userId, tenantId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found or already deleted');
    }

    const user = userResult.rows[0];

    // Soft delete user
    const deleteResult = await client.query(
      `UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = $1 RETURNING *`,
      [userId]
    );

    // Log deletion
    await auditService.logUserDeletion(
      userId,
      tenantId,
      actorId,
      {
        email: user.email,
        role: user.role
      },
      req,
      client
    );

    await client.query('COMMIT');

    return deleteResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Assign permissions to user
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @param {Array<string>} permissionIds - Permission IDs to assign
 * @param {string} actorId - ID of user assigning permissions
 * @param {string} actorRole - Role of actor
 * @param {Object} req - Express request object
 * @returns {Promise<Array>} Assigned permissions
 */
async function assignPermissionsToUser(userId, tenantId, permissionIds, actorId, actorRole, req = null) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Verify user exists and belongs to tenant
    const userCheck = await client.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [userId, tenantId]
    );

    if (userCheck.rows.length === 0) {
      throw new Error('User not found in this tenant');
    }

    // Validate permission assignments
    const validationResults = await Promise.all(
      permissionIds.map(pid => permissionService.validateAssignment(pid, actorRole, tenantId))
    );

    const invalidPermissions = validationResults
      .map((result, index) => ({
        permissionId: permissionIds[index],
        ...result
      }))
      .filter(r => !r.valid);

    if (invalidPermissions.length > 0) {
      throw new Error(`Unauthorized permission assignments: ${invalidPermissions.map(p => p.error).join('; ')}`);
    }

    // Assign permissions (skip duplicates)
    const assignments = [];
    for (const permissionId of permissionIds) {
      // Check if already assigned
      const existing = await client.query(
        `SELECT id FROM permission_assignments
         WHERE permission_id = $1 AND user_id = $2 AND is_tenant_level = false`,
        [permissionId, userId]
      );

      if (existing.rows.length > 0) {
        continue; // Skip duplicate
      }

      const assignmentResult = await client.query(
        `INSERT INTO permission_assignments (permission_id, user_id, assigned_by, is_tenant_level)
         VALUES ($1, $2, $3, false)
         RETURNING *`,
        [permissionId, userId, actorId]
      );

      assignments.push(assignmentResult.rows[0]);

      // Log assignment
      await auditService.logPermissionAssignment(
        assignmentResult.rows[0].id,
        actorId,
        {
          user_id: userId,
          permission_id: permissionId,
          is_tenant_level: false
        },
        req,
        client
      );
    }

    await client.query('COMMIT');

    return assignments;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Assign tenant-level permissions
 * @param {string} tenantId - Tenant ID
 * @param {Array<string>} permissionIds - Permission IDs to assign
 * @param {string} actorId - ID of user assigning permissions
 * @param {Object} req - Express request object
 * @returns {Promise<Array>} Assigned permissions
 */
async function assignPermissionsToTenant(tenantId, permissionIds, actorId, req = null) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Validate permissions are TENANT scope
    const permissions = await permissionService.getPermissionsByIds(permissionIds);

    const invalidScopes = permissions.filter(p => p.scope !== 'TENANT');
    if (invalidScopes.length > 0) {
      throw new Error('Only TENANT scope permissions can be assigned at tenant level');
    }

    // Assign permissions (skip duplicates)
    const assignments = [];
    for (const permissionId of permissionIds) {
      // Check if already assigned
      const existing = await client.query(
        `SELECT id FROM permission_assignments
         WHERE permission_id = $1 AND tenant_id = $2 AND is_tenant_level = true`,
        [permissionId, tenantId]
      );

      if (existing.rows.length > 0) {
        continue; // Skip duplicate
      }

      const assignmentResult = await client.query(
        `INSERT INTO permission_assignments (permission_id, tenant_id, assigned_by, is_tenant_level)
         VALUES ($1, $2, $3, true)
         RETURNING *`,
        [permissionId, tenantId, actorId]
      );

      assignments.push(assignmentResult.rows[0]);

      // Log assignment
      await auditService.logPermissionAssignment(
        assignmentResult.rows[0].id,
        actorId,
        {
          tenant_id: tenantId,
          permission_id: permissionId,
          is_tenant_level: true
        },
        req,
        client
      );
    }

    await client.query('COMMIT');

    return assignments;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get effective permissions for a user (union of tenant-level + user-level)
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of permission codes
 */
async function getEffectivePermissions(userId, tenantId) {
  const result = await db.query(
    'SELECT * FROM get_user_effective_permissions($1, $2)',
    [userId, tenantId]
  );

  return result.rows.map(row => row.permission_code);
}

module.exports = {
  createUser,
  updateUser,
  listUsers,
  getUserWithPermissions,
  deleteUser,
  assignPermissionsToUser,
  assignPermissionsToTenant,
  getEffectivePermissions
};
