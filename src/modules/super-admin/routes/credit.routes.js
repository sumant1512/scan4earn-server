/**
 * Credit Management Routes (Super Admin)
 * Routes for approving/rejecting credit requests and viewing balances
 */

const express = require('express');
const router = express.Router();
const creditController = require('../controllers/credit.controller');
const authMiddleware = require('../../../middleware/auth.middleware');
const tenantContextMiddleware = require('../../../middleware/tenant-context.middleware');
const { requestValidator, preventDuplicates } = require('../../common/interceptors/request.interceptor');

// Middleware to check Super Admin role
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

// Apply auth middleware and request validation
router.use(authMiddleware.authenticate);
router.use(tenantContextMiddleware); // Sets req.tenantContext for super admin
router.use(requireSuperAdmin);
router.use(requestValidator);

// Credit request management
router.get('/requests', creditController.getAllCreditRequests);
router.post('/approve/:id', preventDuplicates(2000), creditController.approveCreditRequest);
router.post('/reject/:id', preventDuplicates(2000), creditController.rejectCreditRequest);

// Credit balance and transactions
router.get('/balances', creditController.getAllTenantBalances);
router.get('/transactions', creditController.getAllTransactions); // All transactions (optionally filtered by tenant_id query param)
router.get('/transactions/:tenantId', creditController.getTenantTransactionHistory); // Specific tenant transactions

module.exports = router;
