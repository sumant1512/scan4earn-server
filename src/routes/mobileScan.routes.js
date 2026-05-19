const express = require('express');
const router = express.Router();
const controller = require('../controllers/mobileScan.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Mobile Scan Routes (Authenticated)
 * Base: /api/mobile/v1/scan
 */

// Scan and verify coupon
router.post('/', authenticate, controller.scanCoupon);

// Get scan transaction history
router.get('/history', authenticate, controller.getScanHistory);

// Get specific scan transaction details
router.get('/:id', authenticate, controller.getScanDetails);

// Get scan statistics
router.get('/stats/summary', authenticate, controller.getScanStats);

module.exports = router;
