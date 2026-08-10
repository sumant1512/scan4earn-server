/**
 * Batch Workflow Routes
 */

const express = require('express');
const router = express.Router();
const batchController = require('../controllers/batchController');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes require authentication.
router.use(authenticate);

// Batch workflow
router.get('/:batch_id', authorize('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER'), batchController.getBatchDetails);
router.get('/', authorize('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER'), batchController.listBatches);
router.post('/', authorize('SUPER_ADMIN', 'TENANT_ADMIN'), batchController.createBatch);
router.post('/:batch_id/assign-codes', authorize('SUPER_ADMIN', 'TENANT_ADMIN'), batchController.assignSerialNumbers);
router.post('/:batch_id/activate', authorize('SUPER_ADMIN', 'TENANT_ADMIN'), batchController.activateBatch);

module.exports = router;
