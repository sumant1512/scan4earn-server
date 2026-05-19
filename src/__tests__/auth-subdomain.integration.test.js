/**
 * Integration Tests for Authentication with Subdomain Routing
 */
const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/config/database');

describe('Authentication Subdomain Integration Tests', () => {
  let tenantId;
  let userId;
  const testTenant = {
    tenant_name: 'Auth Test Company',
    email: 'auth@testcompany.com',
    phone: '9876543210',
    subdomain_slug: 'auth-test'
  };
  const testUser = {
    email: 'user@authtest.com',
    full_name: 'Test User',
    phone: '1234567890',
    role: 'ADMIN'
  };

  beforeAll(async () => {
    // Create test tenant
    const tenantRes = await db.query(
      `INSERT INTO tenants (tenant_name, email, phone, subdomain_slug, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [testTenant.tenant_name, testTenant.email, testTenant.phone, testTenant.subdomain_slug]
    );
    tenantId = tenantRes.rows[0].id;

    // Create test user
    const userRes = await db.query(
      `INSERT INTO users (email, full_name, phone, role, tenant_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [testUser.email, testUser.full_name, testUser.phone, testUser.role, tenantId]
    );
    userId = userRes.rows[0].id;
  });

  afterAll(async () => {
    // Clean up
    if (userId) {
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (tenantId) {
      await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
  });

  describe('POST /api/auth/request-otp - Tenant-scoped OTP', () => {
    it('should send OTP for tenant user from tenant subdomain', async () => {
      const res = await request(app)
        .post('/api/auth/request-otp')
        .set('Host', 'auth-test.localhost')
        .send({ email: testUser.email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('OTP sent');
    });

    it('should reject tenant user login from wrong subdomain', async () => {
      const res = await request(app)
        .post('/api/auth/request-otp')
        .set('Host', 'wrong-tenant.localhost')
        .send({ email: testUser.email });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should reject tenant user login from root domain', async () => {
      const res = await request(app)
        .post('/api/auth/request-otp')
        .set('Host', 'localhost')
        .send({ email: testUser.email });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should allow super admin login from root domain', async () => {
      // Assuming super admin exists
      const res = await request(app)
        .post('/api/auth/request-otp')
        .set('Host', 'localhost')
        .send({ email: 'sumantmishra511@gmail.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/verify-otp - Login with Subdomain', () => {
    beforeEach(async () => {
      // Generate OTP for user
      await db.query(
        `INSERT INTO otp_codes (email, otp_code, expires_at)
         VALUES ($1, '123456', NOW() + INTERVAL '10 minutes')
         ON CONFLICT (email) DO UPDATE SET otp_code = '123456', expires_at = NOW() + INTERVAL '10 minutes'`,
        [testUser.email]
      );
    });

    it('should login tenant user and include subdomain in response', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .set('Host', 'auth-test.localhost')
        .send({ email: testUser.email, otp: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.subdomain).toBe('auth-test');
      expect(res.body.data.userType).toBe('ADMIN');
    });

    it('should include subdomainSlug in JWT token', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .set('Host', 'auth-test.localhost')
        .send({ email: testUser.email, otp: '123456' });

      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(res.body.data.accessToken);
      
      expect(decoded.subdomainSlug).toBe('auth-test');
      expect(decoded.userId).toBe(userId);
      expect(decoded.tenantId).toBe(tenantId);
    });

    it('should reject login from wrong subdomain', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .set('Host', 'wrong-subdomain.localhost')
        .send({ email: testUser.email, otp: '123456' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/auth/context - Subdomain Validation', () => {
    let userToken;

    beforeAll(async () => {
      // Generate OTP and login
      await db.query(
        `INSERT INTO otp_codes (email, otp_code, expires_at)
         VALUES ($1, '123456', NOW() + INTERVAL '10 minutes')
         ON CONFLICT (email) DO UPDATE SET otp_code = '123456', expires_at = NOW() + INTERVAL '10 minutes'`,
        [testUser.email]
      );

      const loginRes = await request(app)
        .post('/api/auth/verify-otp')
        .set('Host', 'auth-test.localhost')
        .send({ email: testUser.email, otp: '123456' });

      userToken = loginRes.body.data.accessToken;
    });

    it('should return context when on correct subdomain', async () => {
      const res = await request(app)
        .get('/api/auth/context')
        .set('Host', 'auth-test.localhost')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant.subdomain).toBe('auth-test');
    });

    it('should reject context request from wrong subdomain', async () => {
      const res = await request(app)
        .get('/api/auth/context')
        .set('Host', 'wrong-subdomain.localhost')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Subdomain mismatch');
    });
  });

  describe('Token Refresh with Subdomain', () => {
    let refreshToken;

    beforeAll(async () => {
      // Login and get refresh token
      await db.query(
        `INSERT INTO otp_codes (email, otp_code, expires_at)
         VALUES ($1, '123456', NOW() + INTERVAL '10 minutes')
         ON CONFLICT (email) DO UPDATE SET otp_code = '123456', expires_at = NOW() + INTERVAL '10 minutes'`,
        [testUser.email]
      );

      const loginRes = await request(app)
        .post('/api/auth/verify-otp')
        .set('Host', 'auth-test.localhost')
        .send({ email: testUser.email, otp: '123456' });

      refreshToken = loginRes.body.data.refreshToken;
    });

    it('should maintain subdomain in refreshed token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Host', 'auth-test.localhost')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(res.body.data.accessToken);
      
      expect(decoded.subdomainSlug).toBe('auth-test');
    });
  });
});
