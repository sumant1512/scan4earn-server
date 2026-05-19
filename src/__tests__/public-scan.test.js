const request = require('supertest');
const app = require('../server');
const pool = require('../config/database');

describe('Public Scan API - Session Lifecycle', () => {
  let tenantId;
  let verificationAppId;
  let couponCode;
  let couponId;

  beforeAll(async () => {
    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (company_name, contact_email, subdomain_slug, status)
       VALUES ('Test Scan Co', 'test@scanco.com', 'scanco', 'active')
       RETURNING id`
    );
    tenantId = tenantResult.rows[0].id;

    // Create verification app
    const appResult = await pool.query(
      `INSERT INTO verification_apps (tenant_id, app_name, code, api_key, is_active)
       VALUES ($1, 'Test App', 'test-app', 'test-api-key', true)
       RETURNING verification_app_id`,
      [tenantId]
    );
    verificationAppId = appResult.rows[0].verification_app_id;

    // Create test coupon
    couponCode = 'TESTQR123456';
    const couponResult = await pool.query(
      `INSERT INTO coupons 
       (tenant_id, verification_app_id, coupon_code, coupon_reference, 
        discount_type, discount_value, coupon_points, expiry_date, status)
       VALUES ($1, $2, $3, 'REF001', 'FIXED_AMOUNT', 100, 50, 
               NOW() + INTERVAL '30 days', 'active')
       RETURNING id`,
      [tenantId, verificationAppId, couponCode]
    );
    couponId = couponResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM coupons WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM verification_apps WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await pool.end();
  });

  describe('POST /api/public/scan/start', () => {
    it('should create a scan session for valid active coupon', async () => {
      const response = await request(app)
        .post('/api/public/scan/start')
        .send({
          coupon_code: couponCode,
          device_id: 'test-device-123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('session_id');
      expect(response.body.data).toHaveProperty('coupon_code', couponCode);
      expect(response.body.data).toHaveProperty('coupon_points', 50);
      expect(response.body.data.status).toBe('started');
    });

    it('should reject invalid coupon code', async () => {
      const response = await request(app)
        .post('/api/public/scan/start')
        .send({
          coupon_code: 'INVALID123',
          device_id: 'test-device-123'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should reject inactive coupon', async () => {
      // Create inactive coupon
      const inactiveCode = 'INACTIVE123';
      await pool.query(
        `INSERT INTO coupons 
         (tenant_id, verification_app_id, coupon_code, coupon_reference,
          discount_type, discount_value, coupon_points, expiry_date, status)
         VALUES ($1, $2, $3, 'REF002', 'FIXED_AMOUNT', 100, 50,
                 NOW() + INTERVAL '30 days', 'draft')`,
        [tenantId, verificationAppId, inactiveCode]
      );

      const response = await request(app)
        .post('/api/public/scan/start')
        .send({
          coupon_code: inactiveCode,
          device_id: 'test-device-123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not active');

      // Cleanup
      await pool.query('DELETE FROM coupons WHERE coupon_code = $1', [inactiveCode]);
    });

    it('should be idempotent - return existing session', async () => {
      const deviceId = 'test-device-idempotent';
      
      // First request
      const response1 = await request(app)
        .post('/api/public/scan/start')
        .send({
          coupon_code: couponCode,
          device_id: deviceId
        })
        .expect(200);

      const sessionId1 = response1.body.data.session_id;

      // Second request with same device and coupon
      const response2 = await request(app)
        .post('/api/public/scan/start')
        .send({
          coupon_code: couponCode,
          device_id: deviceId
        })
        .expect(200);

      const sessionId2 = response2.body.data.session_id;

      // Should return same session
      expect(sessionId1).toBe(sessionId2);
    });
  });

  describe('POST /api/public/scan/:sessionId/mobile', () => {
    let sessionId;

    beforeEach(async () => {
      // Create a new session for each test
      const response = await request(app)
        .post('/api/public/scan/start')
        .send({
          coupon_code: couponCode,
          device_id: `device-${Date.now()}`
        });
      sessionId = response.body.data.session_id;
    });

    it('should capture mobile number and send OTP', async () => {
      const response = await request(app)
        .post(`/api/public/scan/${sessionId}/mobile`)
        .send({
          mobile_e164: '+1234567890'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('OTP sent');
    });

    it('should reject invalid mobile format', async () => {
      const response = await request(app)
        .post(`/api/public/scan/${sessionId}/mobile`)
        .send({
          mobile_e164: 'invalid'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid session ID', async () => {
      const response = await request(app)
        .post('/api/public/scan/invalid-session-id/mobile')
        .send({
          mobile_e164: '+1234567890'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/public/scan/:sessionId/verify-otp', () => {
    let sessionId;
    let mobileNumber;
    let otp;

    beforeEach(async () => {
      // Create session
      const startResponse = await request(app)
        .post('/api/public/scan/start')
        .send({
          coupon_code: couponCode,
          device_id: `device-${Date.now()}`
        });
      sessionId = startResponse.body.data.session_id;

      // Capture mobile and get OTP
      mobileNumber = `+1${Date.now()}`;
      await request(app)
        .post(`/api/public/scan/${sessionId}/mobile`)
        .send({ mobile_e164: mobileNumber });

      // Get OTP from database (in real scenario, check logs)
      const otpResult = await pool.query(
        'SELECT otp FROM scan_sessions WHERE session_id = $1',
        [sessionId]
      );
      otp = otpResult.rows[0].otp;
    });

    it('should verify OTP and award points', async () => {
      const response = await request(app)
        .post(`/api/public/scan/${sessionId}/verify-otp`)
        .send({
          otp: otp
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('points_awarded', 50);
      expect(response.body.data).toHaveProperty('new_balance');
      expect(response.body.data.status).toBe('completed');
    });

    it('should reject invalid OTP', async () => {
      const response = await request(app)
        .post(`/api/public/scan/${sessionId}/verify-otp`)
        .send({
          otp: '000000'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid OTP');
    });

    it('should prevent duplicate point awards (idempotency)', async () => {
      // First verification
      await request(app)
        .post(`/api/public/scan/${sessionId}/verify-otp`)
        .send({ otp: otp })
        .expect(200);

      // Second verification with same session
      const response2 = await request(app)
        .post(`/api/public/scan/${sessionId}/verify-otp`)
        .send({ otp: otp })
        .expect(400);

      expect(response2.body.success).toBe(false);
      expect(response2.body.error).toContain('already completed');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit on scan start', async () => {
      const deviceId = `rate-limit-device-${Date.now()}`;
      
      // Make multiple rapid requests
      const promises = [];
      for (let i = 0; i < 65; i++) {
        promises.push(
          request(app)
            .post('/api/public/scan/start')
            .send({
              coupon_code: couponCode,
              device_id: deviceId
            })
        );
      }

      const responses = await Promise.all(promises);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
