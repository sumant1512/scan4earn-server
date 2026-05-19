/**
 * Mobile App API v2 Routes
 *
 * Product catalog access for external mobile applications
 * Requires Mobile API key authentication
 */

const express = require('express');
const router = express.Router();
const mobileApiV2Controller = require('../controllers/mobileApiV2.controller');
const { authenticateMobileApiKey } = require('../middleware/mobileApiKey.middleware');

// All routes require Mobile API key authentication
router.use(authenticateMobileApiKey);

// GET /api/mobile/v2/products - Get product catalog
router.get('/products', mobileApiV2Controller.getProducts);

// GET /api/mobile/v2/products/:id - Get single product
router.get('/products/:id', mobileApiV2Controller.getProduct);

// GET /api/mobile/v2/templates - Get product templates
router.get('/templates', mobileApiV2Controller.getTemplates);

// GET /api/mobile/v2/templates/:id/attributes - Get template attributes
router.get('/templates/:id/attributes', mobileApiV2Controller.getTemplateAttributes);

module.exports = router;
