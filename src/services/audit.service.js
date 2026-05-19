/**
 * Audit Service
 * Handles audit logging for security-related operations
 */

const db = require('../config/database');

/**
 * Log permission creation
 * @param {string} permissionId - ID of created permission
 * @param {string} actorId - ID of user who created it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional, for transactions)
 */
async function logPermissionCreation(permissionId, actorId, metadata, req, client = null) {
  return logAction('CREATE_PERMISSION', actorId, 'permission', permissionId, metadata, req, client);
}

/**
 * Log user creation
 * @param {string} userId - ID of created user
 * @param {string} tenantId - Tenant ID
 * @param {string} actorId - ID of user who created it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional)
 */
async function logUserCreation(userId, tenantId, actorId, metadata, req, client = null) {
  return logAction('CREATE_USER', actorId, 'user', userId, {
    ...metadata,
    tenant_id: tenantId
  }, req, client);
}

/**
 * Log user deletion
 * @param {string} userId - ID of deleted user
 * @param {string} tenantId - Tenant ID
 * @param {string} actorId - ID of user who deleted it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional)
 */
async function logUserDeletion(userId, tenantId, actorId, metadata, req, client = null) {
  return logAction('DELETE_USER', actorId, 'user', userId, {
    ...metadata,
    tenant_id: tenantId
  }, req, client);
}

/**
 * Log permission assignment
 * @param {string} assignmentId - ID of permission assignment
 * @param {string} actorId - ID of user who assigned it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional)
 */
async function logPermissionAssignment(assignmentId, actorId, metadata, req, client = null) {
  return logAction('ASSIGN_PERMISSION', actorId, 'permission_assignment', assignmentId, metadata, req, client);
}

/**
 * Log generic action
 * @param {string} action - Action name (e.g., 'CREATE_PERMISSION')
 * @param {string} actorId - ID of user performing action
 * @param {string} targetType - Type of target resource
 * @param {string} targetId - ID of target resource
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional, for transactions)
 */
async function logAction(action, actorId, targetType, targetId, metadata, req, client = null) {
  const dbClient = client || db;

  // Extract request metadata
  const ipAddress = req ? (req.ip || req.connection?.remoteAddress || null) : null;
  const userAgent = req ? (req.get('user-agent') || null) : null;
  const requestId = req ? (req.id || req.headers['x-request-id'] || null) : null;

  // Get actor role from user
  let actorRole = null;
  if (actorId) {
    try {
      const userResult = await dbClient.query(
        'SELECT role FROM users WHERE id = $1',
        [actorId]
      );
      if (userResult.rows.length > 0) {
        actorRole = userResult.rows[0].role;
      }
    } catch (error) {
      console.error('Failed to fetch actor role:', error);
    }
  }

  const query = `
    INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, metadata, ip_address, user_agent, request_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const params = [
    actorId,
    actorRole,
    action,
    targetType,
    targetId,
    JSON.stringify(metadata || {}),
    ipAddress,
    userAgent,
    requestId
  ];

  const result = await dbClient.query(query, params);
  return result.rows[0];
}

/**
 * Log failed operation
 * @param {string} action - Action that failed
 * @param {string} actorId - ID of user who attempted it
 * @param {Object} metadata - Error details
 * @param {Object} req - Express request object
 */
async function logFailedOperation(action, actorId, metadata, req) {
  return logAction(action, actorId, null, null, metadata, req);
}

/**
 * Query audit logs with filtering
 * @param {Object} filters - Filter options
 * @param {string} filters.actor_id - Filter by actor
 * @param {string} filters.action - Filter by action
 * @param {string} filters.target_type - Filter by target type
 * @param {string} filters.target_id - Filter by target ID
 * @param {Date} filters.start_date - Filter by start date
 * @param {Date} filters.end_date - Filter by end date
 * @param {number} filters.page - Page number
 * @param {number} filters.limit - Results per page
 * @returns {Promise<Object>} Paginated audit logs
 */
async function queryAuditLogs(filters = {}) {
  const {
    actor_id,
    action,
    target_type,
    target_id,
    start_date,
    end_date,
    page = 1,
    limit = 50
  } = filters;

  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (actor_id) {
    query += ` AND actor_id = $${paramIndex}`;
    params.push(actor_id);
    paramIndex++;
  }

  if (action) {
    query += ` AND action = $${paramIndex}`;
    params.push(action);
    paramIndex++;
  }

  if (target_type) {
    query += ` AND target_type = $${paramIndex}`;
    params.push(target_type);
    paramIndex++;
  }

  if (target_id) {
    query += ` AND target_id = $${paramIndex}`;
    params.push(target_id);
    paramIndex++;
  }

  if (start_date) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(start_date);
    paramIndex++;
  }

  if (end_date) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(end_date);
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

  return {
    logs: result.rows,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Log feature creation
 * @param {string} featureId - ID of created feature
 * @param {string} actorId - ID of user who created it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional, for transactions)
 */
async function logFeatureCreation(featureId, actorId, metadata, req, client = null) {
  return logAction('CREATE_FEATURE', actorId, 'feature', featureId, metadata, req, client);
}

/**
 * Log feature update
 * @param {string} featureId - ID of updated feature
 * @param {string} actorId - ID of user who updated it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional, for transactions)
 */
async function logFeatureUpdate(featureId, actorId, metadata, req, client = null) {
  return logAction('UPDATE_FEATURE', actorId, 'feature', featureId, metadata, req, client);
}

/**
 * Log feature deletion
 * @param {string} featureId - ID of deleted feature
 * @param {string} actorId - ID of user who deleted it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional, for transactions)
 */
async function logFeatureDeletion(featureId, actorId, metadata, req, client = null) {
  return logAction('DELETE_FEATURE', actorId, 'feature', featureId, metadata, req, client);
}

/**
 * Log feature enable for tenant
 * @param {string} tenantFeatureId - ID of tenant feature record
 * @param {string} actorId - ID of user who enabled it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional, for transactions)
 */
async function logFeatureEnable(tenantFeatureId, actorId, metadata, req, client = null) {
  return logAction('ENABLE_FEATURE', actorId, 'tenant_feature', tenantFeatureId, metadata, req, client);
}

/**
 * Log feature disable for tenant
 * @param {string} featureId - ID of feature
 * @param {string} actorId - ID of user who disabled it
 * @param {Object} metadata - Additional context
 * @param {Object} req - Express request object
 * @param {Object} client - Database client (optional, for transactions)
 */
async function logFeatureDisable(featureId, actorId, metadata, req, client = null) {
  return logAction('DISABLE_FEATURE', actorId, 'feature', featureId, metadata, req, client);
}

/**
 * Log feature toggle action
 * @param {string} tenantFeatureId - Tenant feature ID
 * @param {string} actorId - User performing the action
 * @param {Object} metadata - Additional metadata
 * @param {Object} req - Express request
 * @param {Object} client - Database client (optional)
 */
async function logFeatureToggle(tenantFeatureId, actorId, metadata, req, client = null) {
  return logAction('TOGGLE_FEATURE', actorId, 'tenant_feature', tenantFeatureId, metadata, req, client);
}

module.exports = {
  logPermissionCreation,
  logUserCreation,
  logUserDeletion,
  logPermissionAssignment,
  logFeatureCreation,
  logFeatureUpdate,
  logFeatureDeletion,
  logFeatureEnable,
  logFeatureDisable,
  logFeatureToggle,
  logAction,
  logFailedOperation,
  queryAuditLogs
};
