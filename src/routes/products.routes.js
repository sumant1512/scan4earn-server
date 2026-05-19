/**
 * Products Routes
 * API endpoints for product management
 */

const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Middleware to check tenant role
const requireTenant = (req, res, next) => {
  // Explicitly block super admin
  if (req.user.role === 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'Access denied. This endpoint is for tenant admins only.'
    });
  }

  // Check for tenant context
  if (!req.user.tenant_id) {
    return res.status(403).json({
      error: 'Access denied. Tenant access required.'
    });
  }

  next();
};

// All routes require authentication and tenant user
router.use(authMiddleware.authenticate);
router.use(requireTenant);

// GET /api/products - List products
router.get('/', authMiddleware.requirePermission('view_products'), productsController.getProducts);

// GET /api/products/:id/attributes - Get product attributes with template metadata
router.get('/:id/attributes', authMiddleware.requirePermission('view_products'), productsController.getProductAttributes);

// GET /api/products/:id - Get single product
router.get('/:id', authMiddleware.requirePermission('view_products'), productsController.getProduct);

// POST /api/products - Create product
router.post('/', authMiddleware.requirePermission('create_product'), productsController.createProduct);

// PUT /api/products/:id - Update product
router.put('/:id', authMiddleware.requirePermission('edit_product'), productsController.updateProduct);

// DELETE /api/products/:id - Delete product
router.delete('/:id', authMiddleware.requirePermission('delete_product'), productsController.deleteProduct);

module.exports = router;
