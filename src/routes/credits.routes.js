/**
 * Credits Routes Router
 * Routes credit requests to appropriate handler based on user role
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const tenantContextMiddleware = require('../middleware/tenant-context.middleware');

// Import controllers directly
const superAdminCreditController = require('../modules/super-admin/controllers/credit.controller');
const tenantAdminCreditController = require('../modules/tenant-admin/controllers/credit.controller');
const { requestValidator, preventDuplicates } = require('../modules/common/interceptors/request.interceptor');

// Apply authentication middleware
router.use(authMiddleware.authenticate);
router.use(tenantContextMiddleware); // Sets req.tenantContext for both super admin and tenant admin
router.use(requestValidator);

// Middleware to check role and route appropriately
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      status: false,
      error: {
        message: 'Access denied. Super Admin privileges required.',
        code: 'FORBIDDEN'
      }
    });
  }
  next();
};

const requireTenant = (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') {
    return res.status(403).json({
      status: false,
      error: {
        message: 'Access denied. This endpoint is for tenant admins only.',
        code: 'FORBIDDEN'
      }
    });
  }

  if (!req.user.tenant_id) {
    return res.status(403).json({
      status: false,
      error: {
        message: 'Tenant access required',
        code: 'FORBIDDEN'
      }
    });
  }

  next();
};

// Tenant Admin routes (for TENANT_ADMIN and TENANT_USER)
router.get('/balance', requireTenant, tenantAdminCreditController.getBalance);
router.post('/request', requireTenant, preventDuplicates(2000), tenantAdminCreditController.createRequest);
router.get('/requests',
  (req, res, next) => {
    // Route based on role
    if (req.user.role === 'SUPER_ADMIN') {
      return superAdminCreditController.getAllCreditRequests(req, res, next);
    }
    return tenantAdminCreditController.getRequests(req, res, next);
  }
);
router.get('/transactions',
  (req, res, next) => {
    // Route based on role
    if (req.user.role === 'SUPER_ADMIN') {
      return superAdminCreditController.getAllTransactions(req, res, next);
    }
    return tenantAdminCreditController.getTransactions(req, res, next);
  }
);

// Super Admin only routes
router.post('/approve/:id', requireSuperAdmin, preventDuplicates(2000), superAdminCreditController.approveCreditRequest);
router.post('/reject/:id', requireSuperAdmin, preventDuplicates(2000), superAdminCreditController.rejectCreditRequest);
router.get('/balances', requireSuperAdmin, superAdminCreditController.getAllTenantBalances);
router.get('/transactions/:tenantId', requireSuperAdmin, superAdminCreditController.getTenantTransactionHistory);

module.exports = router;
