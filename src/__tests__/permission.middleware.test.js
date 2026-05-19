/**
 * Permission Middleware Unit Tests
 */

const { requirePermission } = require('../middleware/auth.middleware');
const db = require('../config/database');

// Mock database
jest.mock('../config/database', () => ({
  query: jest.fn()
}));

describe('requirePermission Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: null,
      ip: '127.0.0.1',
      path: '/test',
      method: 'POST',
      get: jest.fn(() => 'test-agent')
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    db.query.mockClear();
  });

  describe('Authentication Check', () => {
    it('should return 401 if user is not authenticated', () => {
      const middleware = requirePermission('create_coupon');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not authenticated'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('SUPER_ADMIN Bypass', () => {
    it('should allow SUPER_ADMIN to bypass permission checks', () => {
      req.user = {
        id: 1,
        role: 'SUPER_ADMIN',
        permissions: []
      };

      const middleware = requirePermission('create_coupon');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('TENANT_ADMIN Bypass', () => {
    it('should allow TENANT_ADMIN to bypass permission checks', () => {
      req.user = {
        id: 2,
        role: 'TENANT_ADMIN',
        tenant_id: 1,
        permissions: []
      };

      const middleware = requirePermission('create_coupon');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('Single Permission Check', () => {
    it('should allow user with required permission', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons', 'view_products']
      };

      const middleware = requirePermission('view_coupons');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny user without required permission', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons', 'view_products']
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const middleware = requirePermission('create_coupon');
      middleware(req, res, next);

      // Wait for async operations
      return new Promise(resolve => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'Insufficient permissions to perform this action',
            code: 'PERMISSION_DENIED',
            details: {
              required: ['create_coupon'],
              mode: 'any'
            }
          });
          expect(next).not.toHaveBeenCalled();

          // Verify audit log was attempted
          expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO audit_logs'),
            expect.arrayContaining([
              3,
              expect.stringContaining('create_coupon'),
              '127.0.0.1',
              'test-agent'
            ])
          );
          resolve();
        }, 100);
      });
    });
  });

  describe('Multiple Permissions - ANY mode (OR logic)', () => {
    it('should allow user with at least one of required permissions', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons', 'view_products']
      };

      const middleware = requirePermission(['edit_coupon', 'view_coupons'], 'any');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny user without any of required permissions', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons', 'view_products']
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const middleware = requirePermission(['create_coupon', 'edit_coupon'], 'any');
      middleware(req, res, next);

      return new Promise(resolve => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(next).not.toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });
  });

  describe('Multiple Permissions - ALL mode (AND logic)', () => {
    it('should allow user with all required permissions', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons', 'view_products', 'view_analytics']
      };

      const middleware = requirePermission(['view_coupons', 'view_products'], 'all');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny user missing one of required permissions', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons', 'view_products']
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const middleware = requirePermission(['view_coupons', 'view_analytics'], 'all');
      middleware(req, res, next);

      return new Promise(resolve => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'Insufficient permissions to perform this action',
            code: 'PERMISSION_DENIED',
            details: {
              required: ['view_coupons', 'view_analytics'],
              mode: 'all'
            }
          });
          expect(next).not.toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty permissions array', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: []
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const middleware = requirePermission('view_coupons');
      middleware(req, res, next);

      return new Promise(resolve => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(next).not.toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });

    it('should handle null permissions', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: null
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const middleware = requirePermission('view_coupons');
      middleware(req, res, next);

      return new Promise(resolve => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(next).not.toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });

    it('should handle undefined permissions', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1
        // permissions: undefined
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const middleware = requirePermission('view_coupons');
      middleware(req, res, next);

      return new Promise(resolve => {
        setTimeout(() => {
          expect(res.status).toHaveBeenCalledWith(403);
          expect(next).not.toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });
  });

  describe('Audit Logging', () => {
    it('should log unauthorized access attempts', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons']
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const middleware = requirePermission('create_coupon');
      middleware(req, res, next);

      return new Promise(resolve => {
        setTimeout(() => {
          // Verify audit log was called
          expect(db.query).toHaveBeenCalled();

          // Verify the call parameters
          const callArgs = db.query.mock.calls[0];
          expect(callArgs[0]).toContain('INSERT INTO audit_logs');
          expect(callArgs[1][0]).toBe(3); // user_id
          expect(callArgs[1][2]).toBe('127.0.0.1'); // ip_address
          expect(callArgs[1][3]).toBe('test-agent'); // user_agent

          // Verify metadata contains required permissions and endpoint info
          const metadata = JSON.parse(callArgs[1][1]);
          expect(metadata.required_permissions).toContain('create_coupon');
          expect(metadata.endpoint).toBe('/test');
          expect(metadata.method).toBe('POST');
          resolve();
        }, 100);
      });
    }, 10000);

    it('should handle audit log errors gracefully', () => {
      req.user = {
        id: 3,
        role: 'TENANT_USER',
        tenant_id: 1,
        permissions: ['view_coupons']
      };

      // Mock audit log insert to fail
      db.query.mockRejectedValueOnce(new Error('Database error'));

      const middleware = requirePermission('create_coupon');
      middleware(req, res, next);

      return new Promise(resolve => {
        setTimeout(() => {
          // Should still return 403 even if audit log fails
          expect(res.status).toHaveBeenCalledWith(403);
          expect(next).not.toHaveBeenCalled();
          resolve();
        }, 100);
      });
    });
  });
});
