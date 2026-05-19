/**
 * User Credits Routes
 */

const express = require('express');
const router = express.Router();
const userCreditsController = require('../controllers/userCredits.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware
router.use(authMiddleware.authenticate);

// Require tenant role
const requireTenant = (req, res, next) => {
  // Explicitly block super admin
  if (req.user.role === 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Access denied. This endpoint is for tenant admins only.'
    });
  }

  // Check for tenant context
  if (!req.user.tenant_id) {
    return res.status(403).json({ error: 'Tenant access required' });
  }

  next();
};

// User credit routes
router.get('/users/:userId/credits', requireTenant, authMiddleware.requirePermission('view_credit_balance'), userCreditsController.getUserCredits);
router.get('/users/:userId/credits/transactions', requireTenant, authMiddleware.requirePermission('view_credit_transactions'), userCreditsController.getCreditTransactions);
router.post('/users/:userId/credits/add', requireTenant, authMiddleware.requirePermission('request_credits'), userCreditsController.addCredits);
router.post('/users/:userId/credits/deduct', requireTenant, authMiddleware.requirePermission('request_credits'), userCreditsController.deductCredits);
router.post('/users/:userId/credits/adjust', requireTenant, authMiddleware.requirePermission('request_credits'), userCreditsController.adjustCredits);

// Credit statistics
router.get('/credits/stats', requireTenant, authMiddleware.requirePermission('view_analytics'), userCreditsController.getCreditStats);

module.exports = router;
