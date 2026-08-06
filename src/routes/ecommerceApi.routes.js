/**
 * E-commerce API Routes
 *
 * Product catalog integration and headless commerce backend for external apps.
 * Requires E-commerce API key authentication on all routes.
 */

const express = require('express');
const router = express.Router();
const ecommerceApiController = require('../controllers/ecommerceApi.controller');
const {
  authenticateEcommerce,
  requireEcommerceFeature,
  requireCustomerRef,
  requireVerificationAppContext
} = require('../middleware/ecommerceApiKey.middleware');
const { authenticate } = require('../middleware/appAuth.middleware');

// All routes require E-commerce API key authentication

router.get('/products', requireVerificationAppContext, ecommerceApiController.getProducts);
router.get('/products/:id', requireVerificationAppContext, ecommerceApiController.getProduct);

router.use(authenticate);
router.use(authenticateEcommerce);

// ── Existing product catalog endpoints (no feature flag required) ──────────────

// POST before GET /:id to avoid route capture
router.post('/products/sync', ecommerceApiController.syncProducts);
router.put('/products/:id', ecommerceApiController.updateProduct);
router.get('/templates', ecommerceApiController.getTemplates);

// ── Inventory (ecommerce-inventory feature flag) ──────────────────────────────

router.get('/products/:id/stock', requireEcommerceFeature('ecommerce-inventory'), ecommerceApiController.getProductStock);

// ── Cart (ecommerce-cart feature flag + X-Customer-Ref) ──────────────────────

router.use('/cart', requireEcommerceFeature('ecommerce-cart'), requireCustomerRef);
router.get('/cart', ecommerceApiController.getCart);
router.post('/cart/items', ecommerceApiController.addCartItem);
router.put('/cart/items/:productId', ecommerceApiController.updateCartItem);
router.delete('/cart/items/:productId', ecommerceApiController.removeCartItem);
router.delete('/cart', ecommerceApiController.clearCart);

// ── Orders (ecommerce-orders feature flag + X-Customer-Ref) ──────────────────

router.use('/orders', requireEcommerceFeature('ecommerce-orders'), requireCustomerRef);
router.post('/orders', ecommerceApiController.placeOrder);
router.get('/orders', ecommerceApiController.getOrders);
router.get('/orders/:id', ecommerceApiController.getOrder);
router.patch('/orders/:id/status', ecommerceApiController.updateOrderStatus);

// ── Wishlist (ecommerce-wishlist feature flag + X-Customer-Ref) ───────────────

router.use('/wishlist', requireEcommerceFeature('ecommerce-wishlist'), requireCustomerRef);
router.get('/wishlist', ecommerceApiController.getWishlist);
router.post('/wishlist', ecommerceApiController.addToWishlist);
router.delete('/wishlist/:productId', ecommerceApiController.removeFromWishlist);

module.exports = router;
