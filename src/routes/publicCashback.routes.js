/**
 * Public Cashback Routes
 * Base path: /api/public/cashback
 * No authentication required - session-based flow
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const publicCashbackController = require('../controllers/publicCashback.controller');

// Rate limiting for public endpoints
const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    status: false,
    error: { message: 'Too many requests, please try again later', code: 'RATE_LIMITED' }
  },
  keyGenerator: (req) => req.ip
});

router.use(publicRateLimit);

router.post('/start', publicCashbackController.startSession);
router.post('/:sessionId/mobile', publicCashbackController.submitMobile);
router.post('/:sessionId/verify-otp', publicCashbackController.verifyOtp);
router.post('/:sessionId/upi', publicCashbackController.submitUpi);
router.post('/:sessionId/confirm', publicCashbackController.confirmCashback);

module.exports = router;
