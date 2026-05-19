/**
 * Cashback Admin Routes
 * Base path: /api/cashback
 * Requires TENANT_ADMIN or SUPER_ADMIN role.
 */

const express = require('express');
const router = express.Router();
const cashbackAdminController = require('../controllers/cashbackAdmin.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

router.use(authenticate);
router.use(requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']));

router.get('/transactions', cashbackAdminController.getTransactions);

module.exports = router;
