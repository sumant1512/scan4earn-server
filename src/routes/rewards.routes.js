/**
 * Rewards System Routes
 */

const express = require('express');
const router = express.Router();
const rewardsController = require('../controllers/rewards.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Middleware to check tenant role
const requireTenant = (req, res, next) => {
  // Explicitly block super admin
  if (req.user.role === 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Access denied. This endpoint is for tenant admins only.'
    });
  }

  // Check for tenant context
  if (!req.user.tenant_id) {
    return res.status(403).json({
      error: 'Access denied. Tenant access required.'
    });
  }

  next();
};

// Public routes (no auth required)
router.post('/scans/verify', rewardsController.verifyScan);

// Apply auth middleware for protected routes
router.use(authMiddleware.authenticate);

// Verification app routes (Tenant)
router.post('/verification-apps', requireTenant, authMiddleware.requirePermission('create_app'), rewardsController.createVerificationApp);
router.get('/verification-apps', requireTenant, authMiddleware.requirePermission('view_apps'), rewardsController.getVerificationApps);
router.get('/verification-apps/:id', requireTenant, authMiddleware.requirePermission('view_apps'), rewardsController.getVerificationAppById);
router.put('/verification-apps/:id', requireTenant, authMiddleware.requirePermission('edit_app'), rewardsController.updateVerificationApp);
router.delete('/verification-apps/:id', requireTenant, authMiddleware.requirePermission('delete_app'), rewardsController.deleteVerificationApp);
router.post('/verification-apps/:id/regenerate-key', requireTenant, authMiddleware.requirePermission('edit_app'), rewardsController.regenerateApiKey);
router.patch('/verification-apps/:id/toggle-status', requireTenant, authMiddleware.requirePermission('edit_app'), rewardsController.toggleAppStatus);

// Coupon routes (Tenant)
router.post('/coupons', requireTenant, authMiddleware.requirePermission('create_coupon'), rewardsController.createCoupon);
router.post('/coupons/multi-batch', requireTenant, authMiddleware.requirePermission('create_batch'), rewardsController.createMultiBatchCoupons);
router.get('/coupons', requireTenant, authMiddleware.requirePermission('view_coupons'), rewardsController.getCoupons);
router.get('/coupons/:id', requireTenant, authMiddleware.requirePermission('view_coupons'), rewardsController.getCouponById);
router.patch('/coupons/:id/status', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.updateCouponStatus);

// Coupon lifecycle routes (Tenant)
router.post('/coupons/activate-range', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.activateCouponRange);
router.post('/coupons/activate-batch', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.activateCouponBatch);
router.post('/coupons/bulk-activate', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.bulkActivateCoupons);
router.patch('/coupons/:id/print', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.markCouponAsPrinted);
router.post('/coupons/bulk-print', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.bulkMarkAsPrinted);
router.post('/coupons/deactivate-range', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.deactivateCouponRange);

// Scan routes (Tenant)
router.get('/scans/history', requireTenant, authMiddleware.requirePermission('view_scans'), rewardsController.getScanHistory);
router.get('/scans/analytics', requireTenant, authMiddleware.requirePermission('view_analytics'), rewardsController.getScanAnalytics);

// Batch operations (Tenant)
router.post('/coupons/batch/:batch_id/print', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.batchPrint);
router.post('/coupons/batch/:batch_id/activate', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.batchActivate);
router.post('/coupons/batch/:batch_id/deactivate', requireTenant, authMiddleware.requirePermission('edit_coupon'), rewardsController.batchDeactivate);
router.get('/coupons/batch/:batch_id/stats', requireTenant, authMiddleware.requirePermission('view_coupons'), rewardsController.batchStats);

module.exports = router;
