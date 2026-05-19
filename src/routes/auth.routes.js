/**
 * Authentication Routes
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Public routes
router.post('/request-otp', authController.requestOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/refresh', authController.refreshAccessToken);

// Protected routes
router.get('/context', authenticate, authController.getUserContext);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
