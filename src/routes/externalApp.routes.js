const express = require('express');
const router = express.Router();
const { authenticateAppApiKey } = require('../middleware/appApiKey.middleware');
const externalAppController = require('../controllers/externalApp.controller');

/**
 * External App API Routes
 * All routes require API key authentication via Bearer token
 * Format: Authorization: Bearer <api_key>
 */

// Apply API key authentication to all routes
router.use(authenticateAppApiKey);

/**
 * @route   GET /api/app/:appCode/products
 * @desc    Get all products for the authenticated app
 * @access  External App (API Key)
 */
router.get('/:appCode/products', externalAppController.getProducts);

/**
 * @route   GET /api/app/:appCode/users/:userId/credits
 * @desc    Get user's credit balance
 * @access  External App (API Key)
 */
router.get('/:appCode/users/:userId/credits', externalAppController.getUserCredits);

/**
 * @route   GET /api/app/:appCode/users/:userId/credit-transactions
 * @desc    Get user's credit transaction history
 * @query   limit - Number of records per page (default: 50)
 * @query   offset - Pagination offset (default: 0)
 * @access  External App (API Key)
 */
router.get('/:appCode/users/:userId/credit-transactions', externalAppController.getUserCreditTransactions);

/**
 * @route   POST /api/app/:appCode/scans
 * @desc    Record a coupon scan and award credits to user
 * @body    { user_id, coupon_code, points }
 * @access  External App (API Key)
 */
router.post('/:appCode/scans', externalAppController.recordScan);

/**
 * @route   POST /api/app/:appCode/redeem
 * @desc    Redeem user credits for a product
 * @body    { user_id, product_id }
 * @access  External App (API Key)
 */
router.post('/:appCode/redeem', externalAppController.redeemProduct);

module.exports = router;
