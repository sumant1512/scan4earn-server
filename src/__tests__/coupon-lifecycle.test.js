/**
 * Tests for Coupon Lifecycle Management APIs
 */

const request = require('supertest');
const express = require('express');
const pool = require('../config/database');
const rewardsController = require('../controllers/rewards.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Mock the database pool
jest.mock('../config/database');

// Mock auth middleware
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => {
    req.user = { 
      id: 'test-user-id', 
      tenant_id: 'test-tenant-id',
      role: 'TENANT_ADMIN'
    };
    next();
  }
}));

describe('Coupon Lifecycle APIs', () => {
  let app;
  let mockClient;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(authMiddleware.authenticate);

    // Setup routes
    app.post('/api/rewards/coupons/activate-range', rewardsController.activateCouponRange);
    app.post('/api/rewards/coupons/activate-batch', rewardsController.activateCouponBatch);
    app.patch('/api/rewards/coupons/:id/print', rewardsController.markCouponAsPrinted);
    app.post('/api/rewards/coupons/bulk-print', rewardsController.bulkMarkAsPrinted);
    app.post('/api/rewards/coupons/deactivate-range', rewardsController.deactivateCouponRange);

    // Mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/rewards/coupons/activate-range', () => {
    it('should activate coupons in valid range', async () => {
      const mockCoupons = [
        { id: 1, coupon_code: 'COUP-001', status: 'printed' },
        { id: 2, coupon_code: 'COUP-002', status: 'printed' },
        { id: 3, coupon_code: 'COUP-003', status: 'printed' }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockCoupons }) // Find coupons
        .mockResolvedValueOnce({ 
          rowCount: 3, 
          rows: mockCoupons.map(c => ({ id: c.id, coupon_code: c.coupon_code }))
        }) // Update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const response = await request(app)
        .post('/api/rewards/coupons/activate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'COUP-003',
          status_filter: 'printed',
          activation_note: 'Store A deployment'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.activated_count).toBe(3);
      expect(response.body.activated_codes).toHaveLength(3);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should return error for invalid coupon code format', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/activate-range')
        .send({
          from_code: 'INVALID',
          to_code: 'COUP-003'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid coupon code format');
    });

    it('should return error for mismatched prefixes', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/activate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'TEST-003'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('same prefix');
    });

    it('should return error when from_code > to_code', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/activate-range')
        .send({
          from_code: 'COUP-010',
          to_code: 'COUP-005'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('less than or equal');
    });

    it('should return error when range exceeds 1000', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/activate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'COUP-1001'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cannot exceed 1000');
    });

    it('should handle no coupons found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Find - no coupons
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const response = await request(app)
        .post('/api/rewards/coupons/activate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'COUP-003',
          status_filter: 'printed'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('No coupons found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should skip coupons with wrong status', async () => {
      const mockCoupons = [
        { id: 1, coupon_code: 'COUP-001', status: 'printed' },
        { id: 2, coupon_code: 'COUP-002', status: 'active' },
        { id: 3, coupon_code: 'COUP-003', status: 'printed' }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: mockCoupons }) // Find coupons
        .mockResolvedValueOnce({ 
          rowCount: 2, 
          rows: [
            { id: 1, coupon_code: 'COUP-001' },
            { id: 3, coupon_code: 'COUP-003' }
          ]
        }) // Update only printed
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const response = await request(app)
        .post('/api/rewards/coupons/activate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'COUP-003',
          status_filter: 'printed'
        });

      expect(response.status).toBe(200);
      expect(response.body.activated_count).toBe(2);
      expect(response.body.skipped_count).toBe(1);
    });
  });

  describe('POST /api/rewards/coupons/activate-batch', () => {
    it('should activate all printed coupons in batch', async () => {
      const mockCoupons = [
        { id: 1, coupon_code: 'COUP-001', status: 'printed' },
        { id: 2, coupon_code: 'COUP-002', status: 'printed' }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 2, rows: mockCoupons }) // Find printed
        .mockResolvedValueOnce({ 
          rowCount: 2, 
          rows: mockCoupons.map(c => ({ id: c.id, coupon_code: c.coupon_code }))
        }) // Update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const response = await request(app)
        .post('/api/rewards/coupons/activate-batch')
        .send({
          batch_id: 'batch-123',
          activation_note: 'Batch deployment'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.activated_count).toBe(2);
      expect(response.body.batch_id).toBe('batch-123');
    });

    it('should return error when batch_id is missing', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/activate-batch')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('batch_id is required');
    });

    it('should return error when no printed coupons in batch', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // No printed coupons
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const response = await request(app)
        .post('/api/rewards/coupons/activate-batch')
        .send({ batch_id: 'batch-123' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('No printed coupons found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('PATCH /api/rewards/coupons/:id/print', () => {
    it('should mark draft coupon as printed', async () => {
      const mockResult = {
        rowCount: 1,
        rows: [{
          id: 1,
          coupon_code: 'COUP-001',
          status: 'printed',
          printed_at: new Date(),
          printed_count: 1
        }]
      };

      pool.query.mockResolvedValue(mockResult);

      const response = await request(app)
        .patch('/api/rewards/coupons/1/print');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.coupon.status).toBe('printed');
      expect(response.body.coupon.printed_count).toBe(1);
    });

    it('should increment printed_count for reprint', async () => {
      const mockResult = {
        rowCount: 1,
        rows: [{
          id: 1,
          coupon_code: 'COUP-001',
          status: 'printed',
          printed_at: new Date(),
          printed_count: 2
        }]
      };

      pool.query.mockResolvedValue(mockResult);

      const response = await request(app)
        .patch('/api/rewards/coupons/1/print');

      expect(response.status).toBe(200);
      expect(response.body.coupon.printed_count).toBe(2);
    });

    it('should return 404 for non-existent coupon', async () => {
      pool.query.mockResolvedValue({ rowCount: 0, rows: [] });

      const response = await request(app)
        .patch('/api/rewards/coupons/999/print');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Coupon not found');
    });
  });

  describe('POST /api/rewards/coupons/bulk-print', () => {
    it('should mark multiple coupons as printed', async () => {
      const mockResult = {
        rowCount: 3,
        rows: [
          { id: 1, coupon_code: 'COUP-001', status: 'printed', printed_count: 1 },
          { id: 2, coupon_code: 'COUP-002', status: 'printed', printed_count: 1 },
          { id: 3, coupon_code: 'COUP-003', status: 'printed', printed_count: 1 }
        ]
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce(mockResult) // Update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const response = await request(app)
        .post('/api/rewards/coupons/bulk-print')
        .send({ coupon_ids: [1, 2, 3] });

      expect(response.status).toBe(200);
      expect(response.body.printed_count).toBe(3);
      expect(response.body.coupons).toHaveLength(3);
    });

    it('should return error when coupon_ids is empty', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/bulk-print')
        .send({ coupon_ids: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('coupon_ids array is required');
    });

    it('should return error when coupon_ids is not an array', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/bulk-print')
        .send({ coupon_ids: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('coupon_ids array is required');
    });
  });

  describe('POST /api/rewards/coupons/deactivate-range', () => {
    it('should deactivate coupons in range', async () => {
      const mockResult = {
        rowCount: 3,
        rows: [
          { id: 1, coupon_code: 'COUP-001' },
          { id: 2, coupon_code: 'COUP-002' },
          { id: 3, coupon_code: 'COUP-003' }
        ]
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce(mockResult) // Update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const response = await request(app)
        .post('/api/rewards/coupons/deactivate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'COUP-003',
          deactivation_reason: 'Lost coupons'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.deactivated_count).toBe(3);
      expect(response.body.deactivated_codes).toHaveLength(3);
    });

    it('should return error when deactivation_reason is missing', async () => {
      const response = await request(app)
        .post('/api/rewards/coupons/deactivate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'COUP-003'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('deactivation_reason');
    });

    it('should not deactivate used coupons', async () => {
      // The SQL query excludes coupons with status 'used'
      const mockResult = {
        rowCount: 2, // Only 2 deactivated, 1 was 'used'
        rows: [
          { id: 1, coupon_code: 'COUP-001' },
          { id: 3, coupon_code: 'COUP-003' }
        ]
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce(mockResult) // Update (excludes used)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const response = await request(app)
        .post('/api/rewards/coupons/deactivate-range')
        .send({
          from_code: 'COUP-001',
          to_code: 'COUP-003',
          deactivation_reason: 'Lost coupons'
        });

      expect(response.status).toBe(200);
      expect(response.body.deactivated_count).toBe(2);
    });
  });
});
