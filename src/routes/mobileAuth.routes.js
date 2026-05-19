const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/mobileAuth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// OTP rate limiting: 5 requests per 15 minutes per IP
const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    status: false,
    error: { message: 'Too many OTP requests, please try again later', code: 'RATE_LIMITED' }
  },
  keyGenerator: (req) => `${req.ip}_${req.body.phone_e164 || ''}`
});

// Customer auth endpoints
router.post('/request-otp', otpRateLimit, controller.requestOtp);
router.post('/verify-otp', controller.verifyOtp);

// Dealer auth endpoints
router.post('/dealer/request-otp', otpRateLimit, controller.dealerRequestOtp);
router.post('/dealer/verify-otp', controller.dealerVerifyOtp);

// Common endpoints
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.getMe);

module.exports = router;
