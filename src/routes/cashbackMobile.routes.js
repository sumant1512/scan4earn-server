/**
 * Cashback Mobile Routes
 * Base path: /api/mobile/v1/cashback
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const cashbackMobileController = require('../controllers/cashbackMobile.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { requireFeature } = require('../middleware/feature.middleware');

// Scan rate limiting: 60 scans per minute per customer
const scanRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    status: false,
    error: { message: 'Too many scan requests, please try again later', code: 'RATE_LIMITED' }
  },
  keyGenerator: (req) => req.user?.id || req.ip
});

// All routes require CUSTOMER auth + open_scanning feature
router.use(authenticate);
router.use(requireRole(['CUSTOMER']));
router.use(requireFeature('coupon_cashback.open_scanning', {
  errorMessage: 'Feature not available'
}));

router.post('/scan', scanRateLimit, cashbackMobileController.scan);
router.post('/retry/:transactionId', cashbackMobileController.retry);
router.post('/upi', cashbackMobileController.saveUpi);
router.get('/upi', cashbackMobileController.getUpi);
router.get('/history', cashbackMobileController.getHistory);
router.get('/balance', cashbackMobileController.getBalance);

module.exports = router;
