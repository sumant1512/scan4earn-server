/**
 * Unit Tests for Subdomain Middleware
 */
const subdomainMiddleware = require('../../src/middleware/subdomain.middleware');
const db = require('../../src/config/database');

// Mock database
jest.mock('../../src/config/database');

describe('Subdomain Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      hostname: 'localhost',
      path: '/api/auth/login',
      get: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('extractSubdomain', () => {
    it('should extract subdomain from standard domain', () => {
      req.hostname = 'test-company.scan4earn.com';
      
      subdomainMiddleware(req, res, next);
      
      expect(req.subdomain).toBe('test-company');
    });

    it('should extract subdomain from localhost', () => {
      req.hostname = 'test-company.localhost';
      
      subdomainMiddleware(req, res, next);
      
      expect(req.subdomain).toBe('test-company');
    });

    it('should handle root domain (no subdomain)', () => {
      req.hostname = 'scan4earn.com';
      
      subdomainMiddleware(req, res, next);
      
      expect(req.subdomain).toBeNull();
    });

    it('should handle localhost without subdomain', () => {
      req.hostname = 'localhost';
      
      subdomainMiddleware(req, res, next);
      
      expect(req.subdomain).toBeNull();
    });

    it('should handle multi-level subdomains', () => {
      req.hostname = 'app.test-company.scan4earn.com';
      
      subdomainMiddleware(req, res, next);
      
      expect(req.subdomain).toBe('app');
    });

    it('should handle subdomains with ports', () => {
      req.hostname = 'test-company.localhost:8080';
      
      subdomainMiddleware(req, res, next);
      
      expect(req.subdomain).toBe('test-company');
    });
  });

  describe('tenantResolution', () => {
    it('should resolve tenant from subdomain', async () => {
      req.hostname = 'test-company.localhost';
      const mockTenant = {
        id: 1,
        subdomain_slug: 'test-company',
        tenant_name: 'Test Company',
        is_active: true
      };
      db.query.mockResolvedValue({ rows: [mockTenant] });
      
      await subdomainMiddleware(req, res, next);
      
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('subdomain_slug'),
        ['test-company']
      );
      expect(req.tenant).toEqual(mockTenant);
      expect(next).toHaveBeenCalled();
    });

    it('should return 404 for unknown subdomain', async () => {
      req.hostname = 'unknown-tenant.localhost';
      db.query.mockResolvedValue({ rows: [] });
      
      await subdomainMiddleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Tenant not found')
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 for inactive tenant', async () => {
      req.hostname = 'inactive-tenant.localhost';
      const mockTenant = {
        id: 1,
        subdomain_slug: 'inactive-tenant',
        tenant_name: 'Inactive Tenant',
        is_active: false
      };
      db.query.mockResolvedValue({ rows: [mockTenant] });
      
      await subdomainMiddleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('inactive')
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should skip tenant resolution on root domain', async () => {
      req.hostname = 'localhost';
      
      await subdomainMiddleware(req, res, next);
      
      expect(db.query).not.toHaveBeenCalled();
      expect(req.tenant).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      req.hostname = 'test-company.localhost';
      db.query.mockRejectedValue(new Error('Database connection failed'));
      
      await subdomainMiddleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('error')
      });
    });
  });

  describe('routeSkipping', () => {
    it('should skip subdomain check for super admin routes', async () => {
      req.hostname = 'test-company.localhost';
      req.path = '/api/super-admin/dashboard';
      
      await subdomainMiddleware(req, res, next);
      
      expect(db.query).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should skip subdomain check for auth routes', async () => {
      req.hostname = 'test-company.localhost';
      req.path = '/api/auth/request-otp';
      
      await subdomainMiddleware(req, res, next);
      
      // Auth routes still resolve tenant for context, but don't block
      expect(next).toHaveBeenCalled();
    });

    it('should not skip tenant routes', async () => {
      req.hostname = 'test-company.localhost';
      req.path = '/api/tenant/dashboard';
      db.query.mockResolvedValue({ rows: [{ id: 1, is_active: true }] });
      
      await subdomainMiddleware(req, res, next);
      
      expect(db.query).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('contextAttachment', () => {
    it('should attach tenant to request', async () => {
      req.hostname = 'test-company.localhost';
      const mockTenant = {
        id: 1,
        subdomain_slug: 'test-company',
        tenant_name: 'Test Company',
        is_active: true
      };
      db.query.mockResolvedValue({ rows: [mockTenant] });
      
      await subdomainMiddleware(req, res, next);
      
      expect(req.tenant).toEqual(mockTenant);
      expect(req.subdomain).toBe('test-company');
    });

    it('should set tenant to null on root domain', async () => {
      req.hostname = 'localhost';
      
      await subdomainMiddleware(req, res, next);
      
      expect(req.tenant).toBeNull();
      expect(req.subdomain).toBeNull();
    });
  });
});
