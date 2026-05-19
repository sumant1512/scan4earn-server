/**
 * API Configuration Routes
 * Endpoints for managing API keys and configuration for verification apps
 */

const express = require('express');
const router = express.Router();
const apiConfigController = require('../controllers/apiConfig.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authMiddleware.authenticate);

// Middleware to check tenant role (no super admin for app config)
const requireTenant = (req, res, next) => {
  // Explicitly block super admin
  if (req.user.role === 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This endpoint is for tenant admins only.'
    });
  }

  // Check for tenant context
  if (!req.user.tenant_id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Tenant access required.'
    });
  }

  next();
};

router.use(requireTenant);

// GET /api/verification-apps/:id/api-config - Get API configuration
router.get(
  '/:id/api-config',
  authMiddleware.requirePermission('view_apps'),
  apiConfigController.getApiConfig
);

// PUT /api/verification-apps/:id/api-config - Update API configuration
router.put(
  '/:id/api-config',
  authMiddleware.requirePermission('edit_app'),
  apiConfigController.updateApiConfig
);

// POST /api/verification-apps/:id/regenerate-mobile-key - Regenerate Mobile API key
router.post(
  '/:id/regenerate-mobile-key',
  authMiddleware.requirePermission('edit_app'),
  apiConfigController.regenerateMobileKey
);

// POST /api/verification-apps/:id/regenerate-ecommerce-key - Regenerate E-commerce API key
router.post(
  '/:id/regenerate-ecommerce-key',
  authMiddleware.requirePermission('edit_app'),
  apiConfigController.regenerateEcommerceKey
);

// POST /api/verification-apps/:id/enable-mobile-api - Enable Mobile API
router.post(
  '/:id/enable-mobile-api',
  authMiddleware.requirePermission('edit_app'),
  apiConfigController.enableMobileApi
);

// POST /api/verification-apps/:id/enable-ecommerce-api - Enable E-commerce API
router.post(
  '/:id/enable-ecommerce-api',
  authMiddleware.requirePermission('edit_app'),
  apiConfigController.enableEcommerceApi
);

// GET /api/verification-apps/:id/api-usage - Get API usage statistics
router.get(
  '/:id/api-usage',
  authMiddleware.requirePermission('view_apps'),
  apiConfigController.getApiUsage
);

module.exports = router;
