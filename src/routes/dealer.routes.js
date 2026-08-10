/**
 * Dealer Routes
 * Tenant Admin endpoints for dealer management
 * Base path: /api/v1/tenants/:tenantId/dealers
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const dealerController = require('../controllers/dealer.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// All routes require authentication.
router.use(authenticate);

router.get('/', requireRole(['TENANT_ADMIN', 'TENANT_USER', 'SUPER_ADMIN']), dealerController.listDealers);
router.get('/:id', requireRole(['TENANT_ADMIN', 'TENANT_USER', 'SUPER_ADMIN']), dealerController.getDealer);
router.get('/:id/points', requireRole(['TENANT_ADMIN', 'TENANT_USER', 'SUPER_ADMIN']), dealerController.getPoints);
router.get('/:id/transactions', requireRole(['TENANT_ADMIN', 'TENANT_USER', 'SUPER_ADMIN']), dealerController.getTransactions);
router.post('/', requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']), dealerController.createDealer);
router.put('/:id', requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']), dealerController.updateDealer);
router.patch('/:id/status', requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']), dealerController.toggleStatus);

module.exports = router;
