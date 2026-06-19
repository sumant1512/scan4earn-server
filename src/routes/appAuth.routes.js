/**
 * Authentication Routes
 */
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const appAuthController = require('../controllers/appAuth.controller');
const { authenticate } = require('../middleware/appAuth.middleware');

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

// Public routes
router.post('/request-otp', otpRateLimit, appAuthController.requestOTP);
router.post('/verify-otp', appAuthController.verifyOTP);
router.post('/refresh', appAuthController.refreshAccessToken);

// Protected routes
router.get('/context', authenticate, appAuthController.getUserContext);
router.post('/logout', authenticate, appAuthController.logout);

module.exports = router;
