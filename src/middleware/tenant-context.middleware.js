/**
 * Tenant Context Middleware
 * Validates tenant context using the slug already resolved by subdomainMiddleware
 * (from X-Tenant-Slug header or hostname). Enforces tenant isolation.
 */

const tenantContextMiddleware = (req, res, next) => {
  const user = req.user; // From auth middleware

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let tenantId = null;

  // Use the slug already resolved by subdomainMiddleware (from header or hostname).
  // req.subdomain is null when no tenant was resolved (root domain / super admin path).
  const resolvedSlug = req.subdomain || null;
  const isRootDomain = req.isRootDomain || !resolvedSlug;

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

    // SECURITY: Validate the resolved tenant slug matches the user's own tenant
    if (resolvedSlug && user.tenant) {
      const expectedSubdomain = user.tenant.subdomain_slug;
      if (resolvedSlug !== expectedSubdomain) {
        console.warn(`Tenant slug mismatch: ${resolvedSlug} !== ${expectedSubdomain} for user ${user.id}`);
        return res.status(403).json({
          error: 'Tenant mismatch. Access denied.'
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
    subdomain: resolvedSlug,
    userId: user.id,
    userRole: user.role
  };

  next();
};

module.exports = tenantContextMiddleware;
