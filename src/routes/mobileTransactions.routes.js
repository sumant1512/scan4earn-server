const express = require('express');
const router = express.Router();
const controller = require('../controllers/mobileTransactions.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Mobile Transactions Routes (Authenticated)
 * Base: /api/mobile/v1/transactions
 */

// Unified transaction history (scan + redeem) for CUSTOMER and DEALER
// GET /api/mobile/v1/transactions?page=1&limit=20&type=scan|redeem
router.get('/', authenticate, controller.getTransactions);

module.exports = router;
