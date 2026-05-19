/**
 * E-commerce API Routes
 *
 * Product catalog integration for e-commerce platforms
 * Requires E-commerce API key authentication
 * Supports read and write operations
 */

const express = require('express');
const router = express.Router();
const ecommerceApiController = require('../controllers/ecommerceApi.controller');
const { authenticateEcommerceApiKey } = require('../middleware/ecommerceApiKey.middleware');

// All routes require E-commerce API key authentication
router.use(authenticateEcommerceApiKey);

// GET /api/ecommerce/v1/products - Get product catalog
router.get('/products', ecommerceApiController.getProducts);

// GET /api/ecommerce/v1/products/:id - Get single product
router.get('/products/:id', ecommerceApiController.getProduct);

// POST /api/ecommerce/v1/products/sync - Bulk sync products
router.post('/products/sync', ecommerceApiController.syncProducts);

// PUT /api/ecommerce/v1/products/:id - Update single product
router.put('/products/:id', ecommerceApiController.updateProduct);

// GET /api/ecommerce/v1/templates - Get product templates
router.get('/templates', ecommerceApiController.getTemplates);

module.exports = router;
