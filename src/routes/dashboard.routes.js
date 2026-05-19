/**
 * Dashboard Routes
 */
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Protected routes - role-based stats
router.get('/stats', authenticate, dashboardController.getDashboardStats);

module.exports = router;
