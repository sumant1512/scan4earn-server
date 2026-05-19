/**
 * Dashboard Controller
 * Refactored to use modern error handling
 */
const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ForbiddenError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  sendSuccess
} = require('../modules/common/utils/response.util');

/**
 * Get Dashboard Statistics
 * Returns stats based on user role
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const { role, tenant_id: tenantId } = req.user;

  if (role === 'SUPER_ADMIN') {
    // Super Admin Dashboard: System-wide stats
    const [tenantsResult, usersResult, activeSessionsResult] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM tenants WHERE is_active = true'),
      db.query('SELECT COUNT(*) as count FROM users WHERE is_active = true'),
      db.query(`SELECT COUNT(DISTINCT user_id) as count
                FROM audit_logs
                WHERE action = 'LOGIN'
                AND created_at > NOW() - INTERVAL '24 hours'`)
    ]);

    const stats = {
      totalTenants: parseInt(tenantsResult.rows[0].count),
      totalUsers: parseInt(usersResult.rows[0].count),
      activeSessions24h: parseInt(activeSessionsResult.rows[0].count),
      systemHealth: 'healthy'
    };

    // Recent tenants
    const recentTenants = await db.query(
      `SELECT id, tenant_name, email, created_at
       FROM tenants
       ORDER BY created_at DESC
       LIMIT 5`
    );

    stats.recentTenants = recentTenants.rows.map(t => ({
      id: t.id,
      tenant_name: t.tenant_name,
      email: t.email,
      created_at: t.created_at
    }));

    return sendSuccess(res, stats);

  } else {
    // Tenant Dashboard: Tenant-specific stats
    if (!tenantId) {
      throw new ForbiddenError('Tenant ID not found');
    }

    const [tenantResult, usersResult, activeUsersResult] = await Promise.all([
      db.query(
        'SELECT tenant_name, email, created_at FROM tenants WHERE id = $1',
        [tenantId]
      ),
      db.query(
        'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND is_active = true',
        [tenantId]
      ),
      db.query(
        `SELECT COUNT(DISTINCT user_id) as count
         FROM audit_logs
         WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
         AND action = 'LOGIN'
         AND created_at > NOW() - INTERVAL '24 hours'`,
        [tenantId]
      )
    ]);

    if (tenantResult.rows.length === 0) {
      throw new NotFoundError('Tenant');
    }

    const tenant = tenantResult.rows[0];

    const stats = {
      tenant: {
        tenant_name: tenant.tenant_name,
        email: tenant.email,
        created_at: tenant.created_at
      },
      totalUsers: parseInt(usersResult.rows[0].count),
      activeUsers24h: parseInt(activeUsersResult.rows[0].count)
    };

    // Recent activity for tenant users
    const recentActivity = await db.query(
      `SELECT al.action, al.created_at, u.full_name, u.email
       FROM audit_logs al
       JOIN users u ON al.user_id = u.id
       WHERE u.tenant_id = $1
       ORDER BY al.created_at DESC
       LIMIT 10`,
      [tenantId]
    );

    stats.recentActivity = recentActivity.rows.map(a => ({
      action: a.action,
      user: a.full_name,
      email: a.email,
      timestamp: a.created_at
    }));

    return sendSuccess(res, stats);
  }
});

module.exports = {
  getDashboardStats
};
