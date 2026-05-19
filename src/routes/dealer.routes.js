/**
 * Dealer Routes
 * Tenant Admin endpoints for dealer management
 * Base path: /api/v1/tenants/:tenantId/dealers
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const dealerController = require('../controllers/dealer.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// All routes require authentication + TENANT_ADMIN role
router.use(authenticate);
router.use(requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']));

router.post('/', dealerController.createDealer);
router.get('/', dealerController.listDealers);
router.get('/:id', dealerController.getDealer);
router.put('/:id', dealerController.updateDealer);
router.patch('/:id/status', dealerController.toggleStatus);
router.get('/:id/points', dealerController.getPoints);
router.get('/:id/transactions', dealerController.getTransactions);

module.exports = router;
