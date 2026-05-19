/**
 * Super Admin Routes Index
 * Consolidates all super admin routes
 */

const express = require('express');
const router = express.Router();

const tenantRoutes = require('./tenant.routes');
const creditRoutes = require('./credit.routes');

// Mount super admin routes
router.use('/tenants', tenantRoutes);
router.use('/credits', creditRoutes);

module.exports = router;
