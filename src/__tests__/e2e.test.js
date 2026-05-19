/**
 * End-to-End Tests for Complete OTP Login Flow
 * 
 * NOTE: These tests require a real database connection.
 * Skip with: npm test -- --testPathIgnorePatterns=e2e.test.js
 * Or set E2E_TESTS_ENABLED=true to run them
 */

const request = require('supertest');
const { Pool } = require('pg');

// Test configuration
const API_URL = process.env.TEST_API_URL || 'http://localhost:8080';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'scan4earn_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin'
};

const E2E_TESTS_ENABLED = process.env.E2E_TESTS_ENABLED === 'true';

const describeIf = (condition) => condition ? describe : describe.skip;

describeIf(E2E_TESTS_ENABLED)('E2E: Complete OTP Login Flow', () => {
  let dbPool;
  let testEmail;
  let testOTP;
  let accessToken;
  let refreshToken;

  beforeAll(() => {
    dbPool = new Pool(DB_CONFIG);
  });

  afterAll(async () => {
    await dbPool.end();
  });

  beforeEach(async () => {
    testEmail = `test-${Date.now()}@example.com`;
    
    // Create test tenant first
    const tenantResult = await dbPool.query(
      `INSERT INTO tenants (company_name, contact_email, is_active)
       VALUES ($1, $2, $3) RETURNING id`,
      ['Test Company', testEmail, true]
    );
    const tenantId = tenantResult.rows[0].id;
    
    // Create test user in database with tenant_id
    await dbPool.query(
      `INSERT INTO users (email, full_name, role, tenant_id, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [testEmail, 'Test User', 'TENANT_ADMIN', tenantId, true]
    );
  });

  afterEach(async () => {
    // Cleanup: Remove test user, OTPs, and tenant (CASCADE will handle users)
    await dbPool.query('DELETE FROM otps WHERE email = $1', [testEmail]);
    await dbPool.query('DELETE FROM token_blacklist WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [testEmail]);
    await dbPool.query('DELETE FROM tenants WHERE contact_email = $1', [testEmail]);
  });

  describe('Complete Login Flow', () => {
    it('should complete full login flow: request OTP -> verify -> access dashboard', async () => {
      // Step 1: Request OTP
      const otpRequestResponse = await request(API_URL)
        .post('/auth/request-otp')
        .send({ email: testEmail })
        .expect(200);

      expect(otpRequestResponse.body.success).toBe(true);
      expect(otpRequestResponse.body.message).toContain('OTP sent');

      // Get OTP from database (simulating email)
      const otpRecord = await dbPool.query(
        'SELECT otp_code FROM otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [testEmail]
      );
      testOTP = otpRecord.rows[0].otp_code;

      // Step 2: Verify OTP
      const verifyResponse = await request(API_URL)
        .post('/auth/verify-otp')
        .send({
          email: testEmail,
          otp: testOTP
        })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.data).toHaveProperty('accessToken');
      expect(verifyResponse.body.data).toHaveProperty('refreshToken');
      
      accessToken = verifyResponse.body.data.accessToken;
      refreshToken = verifyResponse.body.data.refreshToken;

      // Step 3: Load user context
      const contextResponse = await request(API_URL)
        .get('/auth/context')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(contextResponse.body.success).toBe(true);
      expect(contextResponse.body.data.user.email).toBe(testEmail);
      expect(contextResponse.body.data.user.role).toBe('TENANT_ADMIN');

      // Step 4: Access protected resource (user profile)
      const profileResponse = await request(API_URL)
        .get('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.data.email).toBe(testEmail);
    });

    it('should handle OTP expiration', async () => {
      // Request OTP
      await request(API_URL)
        .post('/auth/request-otp')
        .send({ email: testEmail })
        .expect(200);

      // Get OTP
      const otpRecord = await dbPool.query(
        'SELECT otp_code FROM otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [testEmail]
      );
      testOTP = otpRecord.rows[0].otp_code;

      // Manually expire the OTP
      await dbPool.query(
        'UPDATE otps SET expires_at = NOW() - INTERVAL \'1 minute\' WHERE email = $1',
        [testEmail]
      );

      // Try to verify expired OTP
      const verifyResponse = await request(API_URL)
        .post('/auth/verify-otp')
        .send({
          email: testEmail,
          otp: testOTP
        })
        .expect(401);

      expect(verifyResponse.body.success).toBe(false);
      expect(verifyResponse.body.message).toContain('Invalid or expired');
    });

    it('should enforce OTP attempt limits', async () => {
      // Request OTP
      await request(API_URL)
        .post('/auth/request-otp')
        .send({ email: testEmail })
        .expect(200);

      // Try wrong OTP 3 times
      for (let i = 0; i < 3; i++) {
        await request(API_URL)
          .post('/auth/verify-otp')
          .send({
            email: testEmail,
            otp: '000000' // Wrong OTP
          })
          .expect(401);
      }

      // Get the correct OTP
      const otpRecord = await dbPool.query(
        'SELECT otp_code FROM otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [testEmail]
      );
      testOTP = otpRecord.rows[0].otp_code;

      // 4th attempt should fail even with correct OTP
      const response = await request(API_URL)
        .post('/auth/verify-otp')
        .send({
          email: testEmail,
          otp: testOTP
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Token Refresh Flow', () => {
    beforeEach(async () => {
      // Login to get tokens
      await request(API_URL)
        .post('/auth/request-otp')
        .send({ email: testEmail });

      const otpRecord = await dbPool.query(
        'SELECT otp_code FROM otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [testEmail]
      );

      const verifyResponse = await request(API_URL)
        .post('/auth/verify-otp')
        .send({
          email: testEmail,
          otp: otpRecord.rows[0].otp_code
        });

      accessToken = verifyResponse.body.data.accessToken;
      refreshToken = verifyResponse.body.data.refreshToken;
    });

    it('should refresh access token successfully', async () => {
      const refreshResponse = await request(API_URL)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.data.accessToken).toBeDefined();
      expect(refreshResponse.body.data.refreshToken).toBeDefined();
      expect(refreshResponse.body.data.accessToken).not.toBe(accessToken);

      // Use new access token
      const newAccessToken = refreshResponse.body.data.accessToken;
      const contextResponse = await request(API_URL)
        .get('/auth/context')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      expect(contextResponse.body.success).toBe(true);
    });

    it('should invalidate old access token after refresh', async () => {
      // Refresh to get new token
      await request(API_URL)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Old access token should be invalidated
      await request(API_URL)
        .get('/auth/context')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('Logout Flow', () => {
    beforeEach(async () => {
      // Login to get tokens
      await request(API_URL)
        .post('/auth/request-otp')
        .send({ email: testEmail });

      const otpRecord = await dbPool.query(
        'SELECT otp_code FROM otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [testEmail]
      );

      const verifyResponse = await request(API_URL)
        .post('/auth/verify-otp')
        .send({
          email: testEmail,
          otp: otpRecord.rows[0].otp_code
        });

      accessToken = verifyResponse.body.data.accessToken;
      refreshToken = verifyResponse.body.data.refreshToken;
    });

    it('should logout and invalidate all tokens', async () => {
      // Logout
      await request(API_URL)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Access token should not work
      await request(API_URL)
        .get('/auth/context')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      // Refresh token should not work
      await request(API_URL)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('Customer Registration Flow', () => {
    let adminAccessToken;

    beforeEach(async () => {
      // Create and login as super admin
      const adminEmail = `admin-${Date.now()}@example.com`;
      
      await dbPool.query(
        `INSERT INTO users (email, full_name, role, status, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [adminEmail, 'Admin User', 'SUPER_ADMIN', 'ACTIVE', adminEmail]
      );

      // Get admin token
      await request(API_URL)
        .post('/auth/request-otp')
        .send({ email: adminEmail });

      const otpRecord = await dbPool.query(
        'SELECT otp_code FROM otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [adminEmail]
      );

      const verifyResponse = await request(API_URL)
        .post('/auth/verify-otp')
        .send({
          email: adminEmail,
          otp: otpRecord.rows[0].otp_code
        });

      adminAccessToken = verifyResponse.body.data.accessToken;
    });

    it('should register new customer and tenant', async () => {
      const customerEmail = `customer-${Date.now()}@example.com`;
      const customerData = {
        fullName: 'New Customer',
        email: customerEmail,
        phoneNumber: '+1234567890',
        tenantName: 'New Tenant Company',
        tenantCode: `TENANT${Date.now()}`
      };

      const registerResponse = await request(API_URL)
        .post('/users/register-customer')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(customerData)
        .expect(201);

      expect(registerResponse.body.success).toBe(true);

      // Verify customer was created
      const userRecord = await dbPool.query(
        'SELECT * FROM users WHERE email = $1',
        [customerEmail]
      );

      expect(userRecord.rows.length).toBe(1);
      expect(userRecord.rows[0].full_name).toBe('New Customer');
      expect(userRecord.rows[0].role).toBe('TENANT_ADMIN');

      // Verify tenant was created
      const tenantRecord = await dbPool.query(
        'SELECT * FROM tenants WHERE code = $1',
        [customerData.tenantCode]
      );

      expect(tenantRecord.rows.length).toBe(1);
      expect(tenantRecord.rows[0].name).toBe('New Tenant Company');

      // Cleanup
      await dbPool.query('DELETE FROM users WHERE email = $1', [customerEmail]);
      await dbPool.query('DELETE FROM tenants WHERE code = $1', [customerData.tenantCode]);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce OTP request rate limits', async () => {
      const uniqueEmail = `ratelimit-${Date.now()}@example.com`;

      // Create test user
      await dbPool.query(
        `INSERT INTO users (email, full_name, role, status, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [uniqueEmail, 'Rate Limit Test', 'TENANT_ADMIN', 'ACTIVE', uniqueEmail]
      );

      // Make 3 successful requests
      for (let i = 0; i < 3; i++) {
        await request(API_URL)
          .post('/auth/request-otp')
          .send({ email: uniqueEmail })
          .expect(200);
      }

      // 4th request should be rate limited
      const response = await request(API_URL)
        .post('/auth/request-otp')
        .send({ email: uniqueEmail })
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Too many');

      // Cleanup
      await dbPool.query('DELETE FROM users WHERE email = $1', [uniqueEmail]);
      await dbPool.query('DELETE FROM otps WHERE email = $1', [uniqueEmail]);
    });
  });
});
