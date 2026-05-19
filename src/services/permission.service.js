/**
 * Permission Service
 * Handles permission definition creation, retrieval, and validation
 */

const db = require('../config/database');
const auditService = require('./audit.service');

/**
 * Create a new permission definition
 * @param {Object} data - Permission data
 * @param {string} data.code - Unique permission code (e.g., 'tenant.user.create')
 * @param {string} data.name - Human-readable name
 * @param {string} data.description - Description of what permission allows
 * @param {string} data.scope - GLOBAL, TENANT, or USER
 * @param {Array<string>} data.allowed_assigners - Roles that can assign this permission
 * @param {string} actorId - ID of user creating the permission
 * @param {Object} req - Express request object for audit logging
 * @returns {Promise<Object>} Created permission
 */
async function createPermission(data, actorId, req = null) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Validate permission code format (namespace.resource.action)
    const codeRegex = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
    if (!codeRegex.test(data.code)) {
      throw new Error('Permission code must follow format: namespace.resource.action (lowercase, underscores allowed)');
    }

    // Validate code length
    if (data.code.length < 5 || data.code.length > 255) {
      throw new Error('Permission code must be between 5 and 255 characters');
    }

    // Validate scope
    const validScopes = ['GLOBAL', 'TENANT', 'USER'];
    if (!validScopes.includes(data.scope)) {
      throw new Error(`Scope must be one of: ${validScopes.join(', ')}`);
    }

    // Default allowed_assigners to SUPER_ADMIN if not provided
    const allowed_assigners = data.allowed_assigners || ['SUPER_ADMIN'];

    // Check for duplicate code
    const duplicateCheck = await client.query(
      'SELECT id FROM permissions WHERE code = $1',
      [data.code]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new Error(`Permission with code '${data.code}' already exists`);
    }

    // Insert permission
    const result = await client.query(
      `INSERT INTO permissions (code, name, description, scope, allowed_assigners, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.code, data.name, data.description || null, data.scope, allowed_assigners, actorId]
    );

    const permission = result.rows[0];

    // Log audit entry
    if (req) {
      await auditService.logPermissionCreation(permission.id, actorId, {
        permission_code: permission.code,
        permission_name: permission.name,
        scope: permission.scope
      }, req, client);
    }

    await client.query('COMMIT');

    return permission;
  } catch (error) {
    await client.query('ROLLBACK');

    // Log failed attempt if req provided
    if (req && actorId) {
      try {
        await auditService.logFailedOperation('CREATE_PERMISSION_FAILED', actorId, {
          attempted_code: data.code,
          error: error.message
        }, req);
      } catch (auditError) {
        console.error('Failed to log audit entry:', auditError);
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * List permissions with filtering
 * @param {Object} filters - Filter options
 * @param {string} filters.scope - Filter by scope (GLOBAL, TENANT, USER)
 * @param {string} filters.search - Search in code, name, or description
 * @param {string} filters.assignable_by - Filter by role that can assign
 * @param {number} filters.page - Page number (1-indexed)
 * @param {number} filters.limit - Results per page
 * @returns {Promise<Object>} Paginated permission list
 */
async function listPermissions(filters = {}) {
  const {
    scope,
    search,
    assignable_by,
    page = 1,
    limit = 50
  } = filters;

  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM permissions WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  // Filter by scope
  if (scope) {
    query += ` AND scope = $${paramIndex}`;
    params.push(scope);
    paramIndex++;
  }

  // Filter by assignable_by role
  if (assignable_by) {
    query += ` AND $${paramIndex} = ANY(allowed_assigners)`;
    params.push(assignable_by);
    paramIndex++;
  }

  // Search filter
  if (search) {
    query += ` AND (code ILIKE $${paramIndex} OR name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Get total count
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
  const countResult = await db.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);

  // Add sorting and pagination
  query += ` ORDER BY code ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await db.query(query, params);

  return {
    permissions: result.rows,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get permission by code
 * @param {string} code - Permission code
 * @returns {Promise<Object|null>} Permission object or null
 */
async function getPermissionByCode(code) {
  const result = await db.query(
    'SELECT * FROM permissions WHERE code = $1',
    [code]
  );

  return result.rows[0] || null;
}

/**
 * Get permission by ID
 * @param {string} id - Permission ID
 * @returns {Promise<Object|null>} Permission object or null
 */
async function getPermissionById(id) {
  const result = await db.query(
    'SELECT * FROM permissions WHERE id = $1',
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Validate if a role can assign a specific permission
 * @param {string} permissionId - Permission ID to assign
 * @param {string} assignerRole - Role of user attempting assignment
 * @param {string} tenantId - Tenant ID (for scope validation)
 * @returns {Promise<Object>} Validation result { valid: boolean, error: string }
 */
async function validateAssignment(permissionId, assignerRole, tenantId = null) {
  // Get permission
  const permission = await getPermissionById(permissionId);

  if (!permission) {
    return { valid: false, error: 'Permission not found' };
  }

  // Check if assigner role is in allowed_assigners
  if (!permission.allowed_assigners.includes(assignerRole)) {
    return {
      valid: false,
      error: `This permission can only be assigned by: ${permission.allowed_assigners.join(', ')}`
    };
  }

  // Validate scope compatibility
  if (permission.scope === 'GLOBAL' && assignerRole !== 'SUPER_ADMIN') {
    return {
      valid: false,
      error: 'Only SUPER_ADMIN can assign GLOBAL scope permissions'
    };
  }

  if (permission.scope === 'TENANT' && !tenantId && assignerRole !== 'SUPER_ADMIN') {
    return {
      valid: false,
      error: 'Tenant ID required for TENANT scope permissions'
    };
  }

  return { valid: true };
}

/**
 * Get permissions by IDs (batch fetch)
 * @param {Array<string>} ids - Array of permission IDs
 * @returns {Promise<Array>} Array of permission objects
 */
async function getPermissionsByIds(ids) {
  if (!ids || ids.length === 0) {
    return [];
  }

  const result = await db.query(
    'SELECT * FROM permissions WHERE id = ANY($1::uuid[])',
    [ids]
  );

  return result.rows;
}

/**
 * Update permission metadata
 * @param {string} id - Permission ID
 * @param {Object} updates - Fields to update (name, description only; code is immutable)
 * @param {string} actorId - ID of user updating the permission
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Updated permission
 */
async function updatePermission(id, updates, actorId, req = null) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Prevent code modification
    if (updates.code) {
      throw new Error('Permission code cannot be modified after creation');
    }

    // Build update query
    const allowedFields = ['name', 'description', 'allowed_assigners'];
    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex}`);
        params.push(updates[field]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(id);
    const result = await client.query(
      `UPDATE permissions SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Permission not found');
    }

    const permission = result.rows[0];

    // Log audit entry
    if (req) {
      await auditService.logAction('UPDATE_PERMISSION', actorId, 'permission', permission.id, {
        permission_code: permission.code,
        updated_fields: Object.keys(updates)
      }, req, client);
    }

    await client.query('COMMIT');

    return permission;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createPermission,
  listPermissions,
  getPermissionByCode,
  getPermissionById,
  getPermissionsByIds,
  validateAssignment,
  updatePermission
};
