/**
 * Redemption Admin Routes
 * Tenant admin API to manage customer redemption requests.
 * Base: /api/redemptions
 *
 * All routes require TENANT_ADMIN or TENANT_USER role.
 * Requests are app-scoped via the verification_app_id stored on each request.
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/redemptionAdmin.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// All routes require authentication and a tenant role
router.use(authenticate);
router.use(requireRole(['TENANT_ADMIN', 'TENANT_USER']));

// ── List & summary ─────────────────────────────────────────────────────────

// GET /api/redemptions
//   ?app_id=UUID &status=pending|approved|rejected &page=1 &limit=20
router.get('/', controller.listRequests);

// GET /api/redemptions/summary
//   ?app_id=UUID
router.get('/summary', controller.getSummary);

// ── Single request ─────────────────────────────────────────────────────────

// GET /api/redemptions/:id
router.get('/:id', controller.getRequest);

// ── Actions ────────────────────────────────────────────────────────────────

// POST /api/redemptions/:id/approve
router.post('/:id/approve', controller.approveRequest);

// POST /api/redemptions/:id/reject   { reason?: "..." }
router.post('/:id/reject', controller.rejectRequest);

module.exports = router;
