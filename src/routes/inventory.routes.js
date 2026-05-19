const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All inventory routes require authentication
router.use(authenticate);

// Update stock for a product
router.post('/products/:id/stock', inventoryController.updateStock);

// Get stock movements for a product
router.get('/products/:id/stock/movements', inventoryController.getStockMovements);

// Get low stock products
router.get('/inventory/low-stock', inventoryController.getLowStockProducts);

// Get out of stock products
router.get('/inventory/out-of-stock', inventoryController.getOutOfStockProducts);

module.exports = router;
