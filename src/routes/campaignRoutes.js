/**
 * Campaign Routes
 */

const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes require authentication.
router.use(authenticate);

// Campaign management
router.get('/:campaign_id', authorize('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER'), campaignController.getCampaignDetails);
router.get('/', authorize('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER'), campaignController.listCampaigns);
router.post('/', authorize('SUPER_ADMIN', 'TENANT_ADMIN'), campaignController.createCampaign);

module.exports = router;
