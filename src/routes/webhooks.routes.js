const express = require('express');
const router = express.Router();
const webhooksController = require('../controllers/webhooks.controller');
const { authenticate } = require('../middleware/auth.middleware');

// All webhook routes require authentication
router.use(authenticate);

// Register webhook for verification app
router.post('/verification-apps/:id/webhooks', webhooksController.registerWebhook);

// List webhooks for verification app
router.get('/verification-apps/:id/webhooks', webhooksController.listWebhooks);

// Update webhook
router.put('/webhooks/:id', webhooksController.updateWebhook);

// Delete webhook
router.delete('/webhooks/:id', webhooksController.deleteWebhook);

// Get webhook delivery logs
router.get('/webhooks/:id/logs', webhooksController.getWebhookLogs);

// Test webhook
router.post('/webhooks/:id/test', webhooksController.testWebhook);

module.exports = router;
