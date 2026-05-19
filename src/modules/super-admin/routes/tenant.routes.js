/**
 * Tenant Management Routes (Super Admin)
 * All routes require SUPER_ADMIN role
 */

const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenant.controller');
const authMiddleware = require('../../../middleware/auth.middleware');
const { requestValidator, preventDuplicates } = require('../../common/interceptors/request.interceptor');

// Middleware to check Super Admin role
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      status: false,
      error: {
        message: 'Access denied. Super Admin privileges required.',
        code: 'FORBIDDEN'
      }
    });
  }
  next();
};

// Public endpoints (no auth required) - for tenant registration form
router.get('/check-slug/:slug', tenantController.checkSlugAvailability);
router.get('/suggest-slugs', requestValidator, tenantController.getSuggestedSlugs);

// Apply auth middleware and request validation to protected routes
router.use(authMiddleware.authenticate);
router.use(requireSuperAdmin);
router.use(requestValidator);

// Tenant CRUD operations
router.post('/', preventDuplicates(2000), tenantController.createTenant);
router.get('/', tenantController.getAllTenants);
router.get('/:id', tenantController.getTenantById);
router.get('/:tenantId/admins', tenantController.getTenantAdmins);
router.put('/:id', preventDuplicates(2000), tenantController.updateTenant);
router.patch('/:id/status', preventDuplicates(2000), tenantController.toggleTenantStatus);

module.exports = router;
