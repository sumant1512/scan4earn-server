/**
 * Integration Tests for Tenant Endpoints with Subdomain Routing
 */
const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/config/database');

describe('Tenant Subdomain Integration Tests', () => {
  let superAdminToken;
  let tenantId;

  beforeAll(async () => {
    // Get super admin token
    // Note: This assumes you have a test database with a super admin user
    const loginRes = await request(app)
      .post('/api/auth/request-otp')
      .send({ email: 'sumantmishra511@gmail.com' });

    // In real tests, you'd verify OTP from database or use a test OTP
    const otpRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'sumantmishra511@gmail.com', otp: '123456' });
    
    superAdminToken = otpRes.body.data.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    if (tenantId) {
      await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
  });

  describe('POST /api/tenants - Create Tenant with Custom Subdomain', () => {
    it('should create tenant with custom subdomain', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          tenant_name: 'Test Integration Company',
          email: 'test@integration.com',
          phone: '1234567890',
          subdomain_slug: 'test-integration'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subdomain_slug).toBe('test-integration');
      
      tenantId = res.body.data.id;
    });

    it('should auto-generate subdomain if not provided', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          tenant_name: 'Auto Generated Slug Company',
          email: 'autoslug@test.com',
          phone: '1234567890'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.subdomain_slug).toBeTruthy();
      expect(res.body.data.subdomain_slug).toMatch(/^[a-z0-9][a-z0-9-]+[a-z0-9]$/);
      
      // Cleanup
      await db.query('DELETE FROM tenants WHERE id = $1', [res.body.data.id]);
    });

    it('should reject duplicate subdomain', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          tenant_name: 'Duplicate Test',
          email: 'duplicate@test.com',
          phone: '1234567890',
          subdomain_slug: 'test-integration' // Same as first test
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid subdomain format', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          tenant_name: 'Invalid Slug Test',
          email: 'invalid@test.com',
          phone: '1234567890',
          subdomain_slug: 'INVALID_SLUG'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject reserved subdomain', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          tenant_name: 'Reserved Test',
          email: 'reserved@test.com',
          phone: '1234567890',
          subdomain_slug: 'www'
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('reserved');
    });
  });

  describe('GET /api/tenants/check-slug/:slug - Check Subdomain Availability', () => {
    it('should return available for unused slug', async () => {
      const res = await request(app)
        .get('/api/tenants/check-slug/available-slug-123');

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
    });

    it('should return unavailable for existing slug', async () => {
      const res = await request(app)
        .get('/api/tenants/check-slug/test-integration');

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
    });

    it('should return unavailable for reserved slug', async () => {
      const res = await request(app)
        .get('/api/tenants/check-slug/admin');

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.message).toContain('reserved');
    });

    it('should validate slug format', async () => {
      const res = await request(app)
        .get('/api/tenants/check-slug/INVALID');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tenants/suggest-slugs - Get Slug Suggestions', () => {
    it('should return 5 suggestions', async () => {
      const res = await request(app)
        .get('/api/tenants/suggest-slugs')
        .query({ name: 'New Company Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.suggestions).toHaveLength(5);
      expect(res.body.data.count).toBe(5);
    });

    it('should return all valid slugs', async () => {
      const res = await request(app)
        .get('/api/tenants/suggest-slugs')
        .query({ name: 'Test Company' });

      res.body.data.suggestions.forEach(slug => {
        expect(slug).toMatch(/^[a-z0-9][a-z0-9-]+[a-z0-9]$/);
        expect(slug.length).toBeGreaterThanOrEqual(3);
        expect(slug.length).toBeLessThanOrEqual(50);
      });
    });

    it('should return error if name is missing', async () => {
      const res = await request(app)
        .get('/api/tenants/suggest-slugs');

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/tenants/:id - Update Tenant (Subdomain Immutable)', () => {
    it('should update tenant but not change subdomain', async () => {
      const res = await request(app)
        .put(`/api/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          tenant_name: 'Updated Company Name',
          subdomain_slug: 'new-slug' // Should be ignored
        });

      expect(res.status).toBe(200);
      expect(res.body.data.tenant_name).toBe('Updated Company Name');
      expect(res.body.data.subdomain_slug).toBe('test-integration'); // Unchanged
    });
  });
});
