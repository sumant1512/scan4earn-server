const db = require('../config/database');
const SlugGenerator = require('./../services/slug-generator.service');

/**
 * Middleware to detect subdomain and resolve tenant context
 * This enables multi-tenant subdomain routing (e.g., acme-corp.scan4earn.com)
 */
const subdomainMiddleware = async (req, res, next) => {
  try {
    const hostname = req.hostname;
    const baseDomain = process.env.DOMAIN_BASE || 'scan4earn.com';
    
    // Skip subdomain resolution for super admin routes (always on root domain)
    if (req.path.startsWith('/api/super-admin')) {
      req.isRootDomain = true;
      return next();
    }
    
    // Extract subdomain from hostname
    const subdomain = extractSubdomain(hostname, baseDomain);
    
    // Root domain (no subdomain) or reserved subdomain (e.g. "api", "www", "admin")
    if (!subdomain || SlugGenerator.isReserved(subdomain)) {
      req.isRootDomain = true;
      return next();
    }
    
    // Resolve tenant from subdomain (database lookup)
    const result = await db.query(
      'SELECT id, tenant_name, subdomain_slug, is_active FROM tenants WHERE subdomain_slug = $1',
      [subdomain]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: `No tenant found for subdomain: ${subdomain}`,
        subdomain
      });
    }
    
    const tenant = result.rows[0];
    
    // Check if tenant is active
    if (!tenant.is_active) {
      return res.status(403).json({
        error: 'Tenant inactive',
        message: 'This tenant account is currently inactive',
        subdomain
      });
    }
    
    // Attach tenant context to request for downstream use
    req.tenant = tenant;
    req.subdomain = subdomain;
    
    next();
  } catch (error) {
    console.error('Subdomain middleware error:', error);
    res.status(500).json({ 
      error: 'Failed to resolve subdomain',
      message: 'An error occurred while processing the subdomain'
    });
  }
};

/**
 * Extract subdomain from hostname
 * Handles localhost development and production domains
 */
function extractSubdomain(hostname, baseDomain) {
  // Handle localhost without subdomain
  if (hostname === 'localhost' || hostname.startsWith('127.0.0.1') || hostname.startsWith('0.0.0.0')) {
    return null;
  }
  
  // Handle IP addresses (no subdomain)
  if (/^\d+\.\d+\.\d+\.\d+/.test(hostname)) {
    return null;
  }
  
  // Handle subdomain.localhost (local development)
  if (hostname.endsWith('.localhost')) {
    const parts = hostname.split('.');
    // subdomain.localhost has 2 parts, so parts[0] is subdomain
    return parts.length >= 2 ? parts[0] : null;
  }
  
  // Handle subdomain.domain.tld (production)
  const domainRegex = new RegExp(`\\.${baseDomain.replace('.', '\\.')}$`);
  
  // Check if hostname ends with our base domain
  if (!domainRegex.test(hostname)) {
    // Not our domain, treat as root
    return null;
  }
  
  // Extract subdomain by removing base domain
  const subdomain = hostname.replace(domainRegex, '');
  
  // Return null if no subdomain (root domain)
  return subdomain || null;
}

/**
 * Middleware to require tenant subdomain for tenant routes
 * Use this after authentication middleware on tenant-specific routes
 */
const requireTenantSubdomain = (req, res, next) => {
  // Skip for super admin
  if (req.user && req.user.role === 'SUPER_ADMIN') {
    return next();
  }
  
  // Verify subdomain exists (tenant context loaded)
  if (!req.tenant) {
    return res.status(403).json({
      error: 'Invalid subdomain',
      message: 'Please access this resource from your tenant subdomain'
    });
  }
  
  // Verify user belongs to the tenant subdomain
  if (req.user && req.user.tenant_id !== req.tenant.id) {
    return res.status(403).json({
      error: 'Subdomain mismatch',
      message: 'You do not have access to this tenant',
      yourTenant: req.user.tenant_id,
      requestedTenant: req.tenant.id
    });
  }
  
  next();
};

module.exports = {
  subdomainMiddleware,
  requireTenantSubdomain,
  extractSubdomain
};