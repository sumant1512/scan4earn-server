/**
 * Integration Tests: Verification App Limit per Tenant
 *
 * Covers tasks 4.1–4.4 from the add-tenant-app-limit spec:
 *   4.1 createVerificationApp rejects when at limit
 *   4.2 createVerificationApp succeeds when under limit
 *   4.3 PUT /api/super-admin/tenants/:id updates max_verification_apps; subsequent creates respect it
 *   4.4 Tenant creation defaults to 1 when max_verification_apps not provided
 *
 * Run with: E2E_TESTS_ENABLED=true npx jest verification-app-limit.test.js --verbose
 */

const request = require('supertest');
const { Pool } = require('pg');

const API_URL = process.env.TEST_API_URL || 'http://localhost:8080';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'scan4earn_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin'
};

const E2E_TESTS_ENABLED = process.env.E2E_TESTS_ENABLED === 'true';
const describeIf = (condition) => (condition ? describe : describe.skip);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loginAs(dbPool, email, subdomainSlug = null) {
  const otpReq = request(API_URL).post('/api/auth/request-otp').send({ email });
  if (subdomainSlug) otpReq.set('Host', `${subdomainSlug}.localhost`);

  const otpRes = await otpReq;
  if (otpRes.status >= 400) {
    throw new Error(`OTP request failed for ${email}: ${JSON.stringify(otpRes.body)}`);
  }

  const otpRecord = await dbPool.query(
    'SELECT otp_code FROM otps WHERE email = $1 AND is_used = false ORDER BY created_at DESC LIMIT 1',
    [email.toLowerCase()]
  );
  if (!otpRecord.rows.length) throw new Error(`No OTP found for ${email}`);

  const verifyReq = request(API_URL)
    .post('/api/auth/verify-otp')
    .send({ email, otp: otpRecord.rows[0].otp_code });
  if (subdomainSlug) verifyReq.set('Host', `${subdomainSlug}.localhost`);

  const res = await verifyReq;
  if (!res.body.data) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data; // { accessToken, refreshToken }
}

async function createTenant(superAdminToken, overrides = {}) {
  const slug = `limit-test-${Date.now()}`;
  const payload = {
    tenant_name: 'Limit Test Tenant',
    email: `admin-${Date.now()}@limittest.com`,
    contact_person: 'Test Admin',
    subdomain_slug: slug,
    ...overrides
  };

  const res = await request(API_URL)
    .post('/api/super-admin/tenants')
    .set('Authorization', `Bearer ${superAdminToken}`)
    .send(payload);

  if (res.status >= 400) {
    throw new Error(`createTenant failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

async function createTemplate(tenantAdminToken, subdomainSlug) {
  const res = await request(API_URL)
    .post('/api/templates')
    .set('Authorization', `Bearer ${tenantAdminToken}`)
    .set('Host', `${subdomainSlug}.localhost`)
    .send({
      template_name: `Template-${Date.now()}`,
      description: 'Test template',
      fields: []
    });

  if (res.status >= 400) {
    throw new Error(`createTemplate failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.template || res.body.data;
}

async function createVerificationApp(tenantAdminToken, subdomainSlug, templateId) {
  return request(API_URL)
    .post('/api/verification-apps')
    .set('Authorization', `Bearer ${tenantAdminToken}`)
    .set('Host', `${subdomainSlug}.localhost`)
    .send({
      app_name: `App-${Date.now()}`,
      template_id: templateId
    });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describeIf(E2E_TESTS_ENABLED)('Verification App Limit', () => {
  let dbPool;
  let superAdminToken;

  beforeAll(async () => {
    dbPool = new Pool(DB_CONFIG);

    // Login as super admin (email configured in .env / seed data)
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@scan4earn.com';
    const auth = await loginAs(dbPool, superAdminEmail);
    superAdminToken = auth.accessToken;
  });

  afterAll(async () => {
    await dbPool.end();
  });

  // ── 4.4 ──────────────────────────────────────────────────────────────────────
  describe('4.4 – Tenant creation defaults to 1 when max_verification_apps not provided', () => {
    it('should default settings.max_verification_apps to 1', async () => {
      const { tenant } = await createTenant(superAdminToken);
      expect(tenant.settings).toBeDefined();
      expect(tenant.settings.max_verification_apps).toBe(1);
    });
  });

  // ── 4.2 ──────────────────────────────────────────────────────────────────────
  describe('4.2 – createVerificationApp succeeds when under the limit', () => {
    it('should create an app when limit is 2 and no apps exist yet', async () => {
      const { tenant } = await createTenant(superAdminToken, { max_verification_apps: 2 });
      const { email, subdomain_slug } = tenant;

      const tenantAuth = await loginAs(dbPool, email, subdomain_slug);
      const template = await createTemplate(tenantAuth.accessToken, subdomain_slug);

      const res = await createVerificationApp(tenantAuth.accessToken, subdomain_slug, template.id);
      expect(res.status).toBe(201);
    });
  });

  // ── 4.1 ──────────────────────────────────────────────────────────────────────
  describe('4.1 – createVerificationApp rejects when at limit', () => {
    it('should return 422 when tenant has reached max_verification_apps', async () => {
      // Create tenant with limit = 1
      const { tenant } = await createTenant(superAdminToken, { max_verification_apps: 1 });
      const { email, subdomain_slug } = tenant;

      const tenantAuth = await loginAs(dbPool, email, subdomain_slug);
      const template = await createTemplate(tenantAuth.accessToken, subdomain_slug);

      // First app should succeed
      const first = await createVerificationApp(tenantAuth.accessToken, subdomain_slug, template.id);
      expect(first.status).toBe(201);

      // Second app should be rejected
      const second = await createVerificationApp(tenantAuth.accessToken, subdomain_slug, template.id);
      expect(second.status).toBe(422);
      expect(second.body.error?.message || second.body.message).toMatch(/limit reached/i);
    });
  });

  // ── 4.3 ──────────────────────────────────────────────────────────────────────
  describe('4.3 – PUT /api/super-admin/tenants/:id updates max_verification_apps', () => {
    it('should allow creating more apps after super admin raises the limit', async () => {
      // Create tenant with limit = 1
      const { tenant } = await createTenant(superAdminToken, { max_verification_apps: 1 });
      const { id: tenantId, email, subdomain_slug } = tenant;

      const tenantAuth = await loginAs(dbPool, email, subdomain_slug);
      const template = await createTemplate(tenantAuth.accessToken, subdomain_slug);

      // Fill the quota
      const first = await createVerificationApp(tenantAuth.accessToken, subdomain_slug, template.id);
      expect(first.status).toBe(201);

      // Confirm limit is hit
      const blocked = await createVerificationApp(tenantAuth.accessToken, subdomain_slug, template.id);
      expect(blocked.status).toBe(422);

      // Super admin raises the limit to 3
      const updateRes = await request(API_URL)
        .put(`/api/super-admin/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ max_verification_apps: 3 });
      expect(updateRes.status).toBe(200);

      // Now tenant can create more apps
      const second = await createVerificationApp(tenantAuth.accessToken, subdomain_slug, template.id);
      expect(second.status).toBe(201);
    });
  });
});
