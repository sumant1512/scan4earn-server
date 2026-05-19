/**
 * User Routes
 */
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Super Admin only routes
router.post('/customers', 
  authenticate, 
  authorize('SUPER_ADMIN'), 
  userController.createCustomer
);

router.get('/customers', 
  authenticate, 
  authorize('SUPER_ADMIN'), 
  userController.getAllCustomers
);

// Authenticated user routes
router.get('/profile', authenticate, userController.getUserProfile);
router.put('/profile', authenticate, userController.updateUserProfile);

module.exports = router;
