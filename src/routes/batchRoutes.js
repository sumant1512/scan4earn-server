/**
 * Batch Workflow Routes
 */

const express = require('express');
const router = express.Router();
const batchController = require('../controllers/batchController');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes require authentication and tenant admin role
router.use(authenticate);
router.use(authorize('TENANT_ADMIN'));

// Batch workflow
router.post('/', batchController.createBatch);
router.post('/:batch_id/assign-codes', batchController.assignSerialNumbers);
router.post('/:batch_id/activate', batchController.activateBatch);
router.get('/:batch_id', batchController.getBatchDetails);
router.get('/', batchController.listBatches);

module.exports = router;
