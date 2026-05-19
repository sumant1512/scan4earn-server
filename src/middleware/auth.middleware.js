/**
 * Authentication Middleware
 */
const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Verify JWT access token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Check if token is blacklisted
    const blacklistCheck = await db.query(
      'SELECT id FROM token_blacklist WHERE token_jti = $1',
      [decoded.jti]
    );

    if (blacklistCheck.rows.length > 0) {
      return res.status(401).json({
        status: false,
        message: 'Token has been revoked'
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      tenant_id: decoded.tenantId || null,
      permissions: decoded.permissions || [] // Include permissions from JWT
    };

    // For CUSTOMER role, fetch customer context
    if (decoded.role === 'CUSTOMER') {
      const customerResult = await db.query(
        'SELECT id, phone_e164 FROM customers WHERE id = (SELECT id FROM customers WHERE tenant_id = $1 AND phone_e164 = (SELECT phone_e164 FROM users WHERE id = $2)) OR id = $2 LIMIT 1',
        [decoded.tenantId, decoded.userId]
      );
      if (customerResult.rows.length > 0) {
        req.user.customerId = customerResult.rows[0].id;
        req.user.phone_e164 = customerResult.rows[0].phone_e164;
      }
    }

    // For DEALER role: do NOT resolve a single dealer profile here.
    // One user may have multiple dealer rows (one per verification app).
    // The specific profile is resolved at request time using the X-App-Id header.

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(401).json({
      status: false,
      message: 'Invalid token'
    });
  }
};

/**
 * Authorize based on roles
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: 'Not authenticated'
      });
    }

    console.log(`🔐 Authorization Check: User role="${req.user.role}", Allowed roles=[${allowedRoles.join(', ')}]`);
    
    if (!allowedRoles.includes(req.user.role)) {
      console.log(`❌ Authorization DENIED: "${req.user.role}" not in [${allowedRoles.join(', ')}]`);
      return res.status(403).json({
        status: false,
        message: 'Insufficient permissions'
      });
    }

    console.log(`✅ Authorization GRANTED`);
    next();
  };
};

/**
 * Require specific permission(s)
 * @param {string|Array<string>} permissions - Single permission or array of permissions
 * @param {string} mode - 'any' (OR logic) or 'all' (AND logic). Default: 'any'
 */
const requirePermission = (permissions, mode = 'any') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: 'Not authenticated'
      });
    }

    // SUPER_ADMIN and TENANT_ADMIN bypass permission checks
    // SUPER_ADMIN has global access, TENANT_ADMIN has full access within their tenant
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'TENANT_ADMIN') {
      console.log(`✅ Permission check bypassed for ${req.user.role}`);
      return next();
    }

    // Normalize permissions to array
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    const userPermissions = req.user.permissions || [];

    console.log(`🔐 Permission Check: Required=[${requiredPermissions.join(', ')}], Mode=${mode}, User permissions=[${userPermissions.join(', ')}]`);

    // Check permissions based on mode
    let hasPermission = false;

    if (mode === 'all') {
      // AND logic - user must have ALL required permissions
      hasPermission = requiredPermissions.every(perm => userPermissions.includes(perm));
    } else {
      // OR logic (default) - user must have AT LEAST ONE required permission
      hasPermission = requiredPermissions.some(perm => userPermissions.includes(perm));
    }

    if (!hasPermission) {
      console.log(`❌ Permission DENIED: User lacks required permission(s)`);

      // Log unauthorized attempt to audit_logs if we have database access
      // This is async but we don't await it to avoid blocking the response
      db.query(
        `INSERT INTO audit_logs (user_id, action, metadata, ip_address, user_agent)
         VALUES ($1, 'UNAUTHORIZED_ACCESS_ATTEMPT', $2, $3, $4)`,
        [
          req.user.id,
          JSON.stringify({
            required_permissions: requiredPermissions,
            mode: mode,
            endpoint: req.path,
            method: req.method
          }),
          req.ip,
          req.get('user-agent') || 'unknown'
        ]
      ).catch(err => console.error('Failed to log unauthorized attempt:', err));

      return res.status(403).json({
        status: false,
        message: 'Insufficient permissions to perform this action',
        code: 'PERMISSION_DENIED',
        details: {
          required: requiredPermissions,
          mode: mode
        }
      });
    }

    console.log(`✅ Permission check PASSED`);
    next();
  };
};

// Wrapper for requireRole to handle both array and spread arguments
const requireRole = (roles) => {
  // If roles is an array, spread it; otherwise treat as single role
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return authorize(...allowedRoles);
};

module.exports = {
  authenticate,
  authorize,
  requireRole,
  requirePermission
};
