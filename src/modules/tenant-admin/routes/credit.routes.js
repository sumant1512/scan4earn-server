/**
 * Credit Management Routes (Tenant Admin)
 * Routes for viewing balance, requesting credits, and managing transactions
 */

const express = require('express');
const router = express.Router();
const creditController = require('../controllers/credit.controller');
const authMiddleware = require('../../../middleware/auth.middleware');
const { requestValidator, preventDuplicates } = require('../../common/interceptors/request.interceptor');

// Middleware to check tenant role
const requireTenant = (req, res, next) => {
  // Explicitly block super admin from using tenant endpoints
  if (req.user.role === 'SUPER_ADMIN') {
    return res.status(403).json({
      status: false,
      error: {
        message: 'Access denied. This endpoint is for tenant admins only.',
        code: 'FORBIDDEN'
      }
    });
  }

  // Check for tenant context
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

// Apply auth middleware
router.use(authMiddleware.authenticate);
router.use(requireTenant);
router.use(requestValidator);

// Credit balance
router.get('/balance', creditController.getBalance);

// Credit requests
router.post('/request', preventDuplicates(2000), creditController.createRequest);
router.get('/requests', creditController.getRequests);

// Credit transactions
router.get('/transactions', creditController.getTransactions);

module.exports = router;
