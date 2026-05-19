/**
 * Ecommerce Mobile Routes
 * Base path: /api/mobile/v1/ecommerce
 */

const express = require('express');
const router = express.Router();
const ecommerceMobileController = require('../controllers/ecommerceMobile.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { requireFeature } = require('../middleware/feature.middleware');

// All routes require CUSTOMER auth + ecommerce feature
router.use(authenticate);
router.use(requireRole(['CUSTOMER']));
router.use(requireFeature('ecommerce', {
  errorMessage: 'Feature not available'
}));

router.get('/products', ecommerceMobileController.listProducts);
router.get('/products/:id', ecommerceMobileController.getProduct);
router.get('/profile', ecommerceMobileController.getProfile);
router.put('/profile', ecommerceMobileController.updateProfile);

module.exports = router;
