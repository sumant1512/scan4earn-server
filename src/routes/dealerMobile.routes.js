/**
 * Dealer Mobile Routes
 * Base path: /api/mobile/v1/dealer
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const dealerMobileController = require('../controllers/dealerMobile.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { requireFeature } = require('../middleware/feature.middleware');

// Scan rate limiting: 60 scans per minute per dealer
const scanRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    status: false,
    error: { message: 'Too many scan requests, please try again later', code: 'RATE_LIMITED' }
  },
  keyGenerator: (req) => req.user?.id || req.ip
});

// All routes require DEALER auth + coupon_cashback.dealer_scanning feature
router.use(authenticate);
router.use(requireRole(['DEALER']));
router.use(requireFeature('coupon_cashback.dealer_scanning', {
  errorMessage: 'Dealer scanning is not enabled for this tenant'
}));

router.post('/scan', scanRateLimit, dealerMobileController.scan);
router.get('/points', dealerMobileController.getPoints);
router.get('/points/history', dealerMobileController.getPointHistory);
router.get('/profile', dealerMobileController.getProfile);

module.exports = router;
