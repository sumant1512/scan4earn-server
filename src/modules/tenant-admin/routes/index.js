/**
 * Tenant Admin Routes Index
 * Consolidates all tenant admin routes
 */

const express = require('express');
const router = express.Router();

const templateRoutes = require('./template.routes');
const creditRoutes = require('./credit.routes');

// Mount tenant admin routes
router.use('/templates', templateRoutes);
router.use('/credits', creditRoutes);

module.exports = router;
