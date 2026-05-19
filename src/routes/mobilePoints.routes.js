const express = require('express');
const router = express.Router();
const controller = require('../controllers/mobilePoints.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Mobile Points Routes (Authenticated)
 * Base: /api/mobile/v1/points
 */

// Paginated transaction history (EARN, REDEEM, EXPIRE, ADJUST)
// GET /api/mobile/v1/points/transactions?page=1&limit=20&type=EARN
router.get('/transactions', authenticate, controller.getTransactions);

// Submit a redemption request (locks points until admin approves/rejects)
// POST /api/mobile/v1/points/redeem   { points: 100, notes?: "..." }
// Header: X-App-Id (required)
router.post('/redeem', authenticate, controller.requestRedemption);

// Customer's own redemption request history
// GET /api/mobile/v1/points/redemptions?page=1&limit=20&status=pending|approved|rejected
router.get('/redemptions', authenticate, controller.getRedemptionHistory);

module.exports = router;
