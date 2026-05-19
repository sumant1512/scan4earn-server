/**
 * Tenant Context Middleware
 * Extracts and validates tenant context from subdomain or user context
 * Enforces tenant isolation for multi-tenant architecture
 */

const tenantContextMiddleware = (req, res, next) => {
  const user = req.user; // From auth middleware

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let tenantId = null;
  let isRootDomain = false;

  // Extract subdomain from request
  const host = req.get('host') || '';
  const hostParts = host.split('.');
  let subdomain = null;

  // Check if subdomain exists (e.g., acme.scan4earn.com -> subdomain = 'acme')
  if (hostParts.length >= 3) {
    subdomain = hostParts[0];
  }

  // Check if root domain (for super admin)
  if (!subdomain || subdomain === 'admin' || subdomain === 'www' || subdomain === 'localhost') {
    isRootDomain = true;
  }

  if (user.role === 'SUPER_ADMIN') {
    // Super admin can:
    // 1. Access from root/admin domain
    // 2. Optionally specify tenant_id in query/body for cross-tenant access
    tenantId = req.query.tenant_id || req.body.tenant_id || null;

  } else {
    // Tenant admin/user MUST use their own tenant
    tenantId = user.tenant_id;

    if (!tenantId) {
      return res.status(403).json({
        error: 'Tenant context required. User not associated with any tenant.'
      });
    }

    // SECURITY: Validate subdomain matches user's tenant (if subdomain exists)
    if (subdomain && !isRootDomain && user.tenant) {
      const expectedSubdomain = user.tenant.subdomain_slug;
      if (subdomain !== expectedSubdomain) {
        console.warn(`Subdomain mismatch: ${subdomain} !== ${expectedSubdomain} for user ${user.id}`);
        return res.status(403).json({
          error: 'Subdomain mismatch. Access denied.'
        });
      }
    }

    // SECURITY: Tenant admin/user cannot specify different tenant_id
    const requestedTenantId = req.query.tenant_id || req.body.tenant_id;
    if (requestedTenantId && requestedTenantId !== tenantId) {
      return res.status(403).json({
        error: 'Cannot access other tenant data. Access denied.'
      });
    }
  }

  // Attach tenant context to request
  req.tenantContext = {
    tenantId,
    isRootDomain,
    isSuperAdmin: user.role === 'SUPER_ADMIN',
    subdomain: subdomain || null,
    userId: user.id,
    userRole: user.role
  };

  next();
};

module.exports = tenantContextMiddleware;
