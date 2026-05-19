/**
 * Campaign Routes
 */

const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes require authentication and tenant admin role
router.use(authenticate);
router.use(authorize('TENANT_ADMIN'));

// Campaign management
router.post('/', campaignController.createCampaign);
router.get('/:campaign_id', campaignController.getCampaignDetails);
router.get('/', campaignController.listCampaigns);

module.exports = router;
