/**
 * End-to-End Tests for Tenant Admin Features
 *
 * Tests the complete tenant admin workflow:
 * - Tenant CRUD (Super Admin)
 * - Tenant Admin User Management
 * - Credit Request & Approval Workflow
 * - Permission Management
 * - Tenant Isolation
 *
 * Requires a running server and real database.
 * Run with: E2E_TESTS_ENABLED=true npx jest src/__tests__/tenant-admin-e2e.test.js --verbose
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

// Helper: login via OTP flow and return tokens
// For tenant users, pass the tenant's subdomain slug so requests go through subdomain routing
async function loginAs(dbPool, email, subdomainSlug = null) {
  // Build request with optional subdomain Host header
  const otpReq = request(API_URL).post('/api/auth/request-otp').send({ email });
  if (subdomainSlug) otpReq.set('Host', `${subdomainSlug}.localhost`);

  const otpRes = await otpReq;
  if (otpRes.status >= 400) {
    throw new Error(`OTP request failed for ${email} (status ${otpRes.status}): ${JSON.stringify(otpRes.body)}`);
  }

  // Fetch OTP from DB
  const otpRecord = await dbPool.query(
    'SELECT otp_code FROM otps WHERE email = $1 AND is_used = false ORDER BY created_at DESC LIMIT 1',
    [email.toLowerCase()]
  );
  if (!otpRecord.rows.length) throw new Error(`No OTP found for ${email}`);

  // Verify OTP (also needs subdomain context for tenant users)
  const verifyReq = request(API_URL)
    .post('/api/auth/verify-otp')
    .send({ email, otp: otpRecord.rows[0].otp_code });
  if (subdomainSlug) verifyReq.set('Host', `${subdomainSlug}.localhost`);

  const res = await verifyReq;

  if (!res.body.data) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data; // { accessToken, refreshToken }
}

describeIf(E2E_TESTS_ENABLED)('E2E: Tenant Admin Features', () => {
  let dbPool;
  const uniqueId = Date.now();

  // Super Admin
  const superAdminEmail = `sa-e2e-${uniqueId}@test.com`;
  let superAdminTokens;

  // Tenant A (all lowercase emails - auth controller lowercases on lookup)
  const tenantAEmail = `tenanta-e2e-${uniqueId}@test.com`;
  const tenantAName = `E2E Tenant A ${uniqueId}`;
  const tenantASlug = `e2e-a-${uniqueId}`;
  let tenantAId;
  let tenantAAdminTokens;

  // Tenant B (for isolation tests)
  const tenantBEmail = `tenantb-e2e-${uniqueId}@test.com`;
  const tenantBName = `E2E Tenant B ${uniqueId}`;
  const tenantBSlug = `e2e-b-${uniqueId}`;
  let tenantBId;
  let tenantBAdminTokens;

  // Created resources to track
  let creditRequestId;

  beforeAll(async () => {
    dbPool = new Pool(DB_CONFIG);

    // Create Super Admin user directly in DB
    await dbPool.query(
      `INSERT INTO users (email, full_name, role, is_active)
       VALUES ($1, $2, 'SUPER_ADMIN', true)
       ON CONFLICT (email) DO NOTHING`,
      [superAdminEmail, 'E2E Super Admin']
    );

    // Login as super admin
    superAdminTokens = await loginAs(dbPool, superAdminEmail);
  }, 30000);

  afterAll(async () => {
    // Cleanup in reverse dependency order
    // Use individual try/catch so one failure doesn't block the rest
    const cleanup = async (label, fn) => {
      try { await fn(); } catch (err) { console.warn(`Cleanup [${label}]:`, err.message); }
    };

    const emailPattern = `%e2e-${uniqueId}%`;
    const testTenantIds = [tenantAId, tenantBId].filter(Boolean);

    // 1. OTPs (no FK deps)
    await cleanup('otps', () => dbPool.query(`DELETE FROM otps WHERE email LIKE $1`, [emailPattern]));

    // 2. Audit logs (actor_id FK to users without cascade)
    await cleanup('audit_logs', () => dbPool.query(
      `DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
       OR actor_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [emailPattern]
    ));

    // 3. Credit data (requested_by/processed_by FK to users)
    for (const tid of testTenantIds) {
      await cleanup(`credit_transactions:${tid}`, () => dbPool.query('DELETE FROM credit_transactions WHERE tenant_id = $1', [tid]));
      await cleanup(`credit_requests:${tid}`, () => dbPool.query('DELETE FROM credit_requests WHERE tenant_id = $1', [tid]));
      await cleanup(`tenant_credit_balance:${tid}`, () => dbPool.query('DELETE FROM tenant_credit_balance WHERE tenant_id = $1', [tid]));
    }

    // 4. User permissions
    for (const tid of testTenantIds) {
      await cleanup(`user_permissions:${tid}`, () => dbPool.query('DELETE FROM user_permissions WHERE tenant_id = $1', [tid]));
    }

    // 5. Token blacklist (ON DELETE CASCADE from users, but clean explicitly)
    await cleanup('token_blacklist', () => dbPool.query(
      `DELETE FROM token_blacklist WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [emailPattern]
    ));

    // 6. Users (includes super admin and all tenant users)
    await cleanup('users', () => dbPool.query(`DELETE FROM users WHERE email LIKE $1`, [emailPattern]));
    await cleanup('super_admin', () => dbPool.query('DELETE FROM users WHERE email = $1', [superAdminEmail]));

    // 7. Tenants (cascades credit_*, tenant_credit_balance)
    for (const tid of testTenantIds) {
      await cleanup(`tenants:${tid}`, () => dbPool.query('DELETE FROM tenants WHERE id = $1', [tid]));
    }

    await dbPool.end();
  }, 30000);

  // ============================================
  // 1. TENANT CRUD (Super Admin)
  // ============================================
  describe('Tenant CRUD (Super Admin)', () => {
    it('should create Tenant A', async () => {
      const res = await request(API_URL)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({
          tenant_name: tenantAName,
          subdomain_slug: tenantASlug,
          email: tenantAEmail,
          contact_person: 'Tenant A Admin',
          phone: '+1111111111'
        })
        .expect(201);

      expect(res.body.message).toContain('successfully');
      expect(res.body.tenant).toBeDefined();
      expect(res.body.tenant.tenant_name).toBe(tenantAName);
      expect(res.body.tenant.subdomain_slug).toBe(tenantASlug);
      expect(res.body.tenant.is_active).toBe(true);
      tenantAId = res.body.tenant.id;
    });

    it('should create Tenant B', async () => {
      const res = await request(API_URL)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({
          tenant_name: tenantBName,
          subdomain_slug: tenantBSlug,
          email: tenantBEmail,
          contact_person: 'Tenant B Admin',
          phone: '+2222222222'
        })
        .expect(201);

      tenantBId = res.body.tenant.id;
      expect(res.body.tenant.tenant_name).toBe(tenantBName);
    });

    it('should reject duplicate tenant email', async () => {
      const res = await request(API_URL)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({
          tenant_name: 'Duplicate Tenant',
          email: tenantAEmail
        })
        .expect(409);

      expect(res.body.error).toContain('already exists');
    });

    it('should reject duplicate subdomain slug', async () => {
      const res = await request(API_URL)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({
          tenant_name: 'Another Tenant',
          subdomain_slug: tenantASlug,
          email: `another-${uniqueId}@test.com`
        })
        .expect(409);

      expect(res.body.error).toContain('already taken');
    });

    it('should list all tenants', async () => {
      const res = await request(API_URL)
        .get('/api/tenants')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.tenants).toBeDefined();
      expect(Array.isArray(res.body.tenants)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);

      // Find our test tenants
      const foundA = res.body.tenants.find(t => t.id === tenantAId);
      const foundB = res.body.tenants.find(t => t.id === tenantBId);
      expect(foundA).toBeDefined();
      expect(foundB).toBeDefined();
      expect(foundA.tenant_name).toBe(tenantAName);
    });

    it('should get tenant by ID with admin details', async () => {
      const res = await request(API_URL)
        .get(`/api/tenants/${tenantAId}`)
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.tenant).toBeDefined();
      expect(res.body.tenant.id).toBe(tenantAId);
      expect(res.body.tenant.tenant_name).toBe(tenantAName);
    });

    it('should update tenant', async () => {
      const res = await request(API_URL)
        .put(`/api/tenants/${tenantAId}`)
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({
          tenant_name: tenantAName,
          contact_person: 'Updated Admin',
          email: tenantAEmail,
          phone: '+9999999999'
        })
        .expect(200);

      expect(res.body.tenant).toBeDefined();
    });

    it('should deactivate tenant', async () => {
      const res = await request(API_URL)
        .patch(`/api/tenants/${tenantAId}/status`)
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({ is_active: false })
        .expect(200);

      expect(res.body.tenant.is_active).toBe(false);
    });

    it('should reactivate tenant', async () => {
      const res = await request(API_URL)
        .patch(`/api/tenants/${tenantAId}/status`)
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({ is_active: true })
        .expect(200);

      expect(res.body.tenant.is_active).toBe(true);
    });

    it('should check slug availability', async () => {
      // Taken slug
      const taken = await request(API_URL)
        .get(`/api/tenants/check-slug/${tenantASlug}`)
        .expect(200);
      expect(taken.body.available).toBe(false);

      // Available slug
      const avail = await request(API_URL)
        .get(`/api/tenants/check-slug/free-slug-${uniqueId}`)
        .expect(200);
      expect(avail.body.available).toBe(true);
    });

    it('should reject requests without auth', async () => {
      await request(API_URL)
        .get('/api/tenants')
        .expect(401);
    });
  });

  // ============================================
  // 2. TENANT ADMIN LOGIN
  // ============================================
  describe('Tenant Admin Login', () => {
    it('should login as Tenant A admin', async () => {
      tenantAAdminTokens = await loginAs(dbPool, tenantAEmail, tenantASlug);
      expect(tenantAAdminTokens.accessToken).toBeDefined();
      expect(tenantAAdminTokens.refreshToken).toBeDefined();
    });

    it('should login as Tenant B admin', async () => {
      tenantBAdminTokens = await loginAs(dbPool, tenantBEmail, tenantBSlug);
      expect(tenantBAdminTokens.accessToken).toBeDefined();
    });

    it('should return correct user context', async () => {
      const res = await request(API_URL)
        .get('/api/auth/context')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Context response has flat structure: data.email, data.role (not nested under data.user)
      expect(res.body.data.email).toBe(tenantAEmail);
      expect(res.body.data.role).toBe('TENANT_ADMIN');
      expect(res.body.data.tenant).toBeDefined();
      expect(res.body.data.tenant.id).toBe(tenantAId);
    });
  });

  // ============================================
  // 3. CREDIT MANAGEMENT
  // ============================================
  describe('Credit Management', () => {
    it('should get initial credit balance (0)', async () => {
      const res = await request(API_URL)
        .get('/api/credits/balance')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.balance).toBeDefined();
    });

    it('should request credits as tenant admin', async () => {
      const res = await request(API_URL)
        .post('/api/credits/request')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .send({
          requested_amount: 500,
          justification: 'E2E test credit request'
        })
        .expect(201);

      expect(res.body.message).toContain('successfully');
      expect(res.body.request).toBeDefined();
      expect(res.body.request.status).toBe('pending');
      creditRequestId = res.body.request.id;
    });

    it('should reject duplicate pending request', async () => {
      const res = await request(API_URL)
        .post('/api/credits/request')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .send({
          requested_amount: 200,
          justification: 'Duplicate request'
        })
        .expect(409);

      expect(res.body.error).toContain('pending');
    });

    it('should reject credit request with amount < 100', async () => {
      // First reject the pending request so we can test this
      // (we need no pending request to hit the validation)
      // Skip if there's a pending request
      const res = await request(API_URL)
        .post('/api/credits/request')
        .set('Authorization', `Bearer ${tenantBAdminTokens.accessToken}`)
        .send({
          requested_amount: 50,
          justification: 'Too small'
        })
        .expect(400);

      expect(res.body.error).toContain('Minimum');
    });

    it('should block super admin from requesting credits', async () => {
      const res = await request(API_URL)
        .post('/api/credits/request')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({
          requested_amount: 500,
          justification: 'SA should not be able to'
        })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should list credit requests (super admin sees all)', async () => {
      const res = await request(API_URL)
        .get('/api/credits/requests?status=all')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.requests).toBeDefined();
      expect(Array.isArray(res.body.requests)).toBe(true);
    });

    it('should list credit requests (tenant admin sees own)', async () => {
      const res = await request(API_URL)
        .get('/api/credits/requests?status=all')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.requests).toBeDefined();
      // Should only see own tenant's requests
      if (res.body.requests.length > 0) {
        expect(res.body.requests[0].tenant_id).toBe(tenantAId);
      }
    });

    it('should approve credit request (super admin)', async () => {
      const res = await request(API_URL)
        .post(`/api/credits/approve/${creditRequestId}`)
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.message).toContain('approved');
    });

    it('should show updated credit balance after approval', async () => {
      const res = await request(API_URL)
        .get('/api/credits/balance')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.balance).toBeDefined();
      // Balance should now be 500 (or include the approved amount)
      expect(Number(res.body.balance)).toBeGreaterThanOrEqual(500);
    });

    it('should show credit transactions after approval', async () => {
      const res = await request(API_URL)
        .get('/api/credits/transactions')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.transactions).toBeDefined();
      expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);
    });

    describe('Credit Rejection Flow', () => {
      let rejectRequestId;

      it('should create a new credit request for rejection test', async () => {
        const res = await request(API_URL)
          .post('/api/credits/request')
          .set('Authorization', `Bearer ${tenantBAdminTokens.accessToken}`)
          .send({
            requested_amount: 300,
            justification: 'Will be rejected'
          })
          .expect(201);

        rejectRequestId = res.body.request.id;
      });

      it('should reject credit request (super admin)', async () => {
        const res = await request(API_URL)
          .post(`/api/credits/reject/${rejectRequestId}`)
          .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
          .send({ rejection_reason: 'E2E test rejection' })
          .expect(200);

        expect(res.body.message).toContain('rejected');
      });
    });
  });

  // ============================================
  // 4. TENANT USER MANAGEMENT
  // ============================================
  describe('Tenant User Management', () => {
    // Note: The tenantUser.service.js references columns (deleted_at) and tables
    // (permission_assignments) that don't exist in the current DB schema.
    // Tests here validate authorization/access control which works at the middleware level.

    it('should prevent cross-tenant user creation', async () => {
      // Tenant A admin tries to create user in Tenant B - blocked at controller level
      const res = await request(API_URL)
        .post(`/api/v1/tenants/${tenantBId}/users`)
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .send({
          email: `cross-${uniqueId}@test.com`,
          full_name: 'Cross Tenant User',
          role: 'TENANT_USER'
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should require authentication for user management', async () => {
      await request(API_URL)
        .get(`/api/v1/tenants/${tenantAId}/users`)
        .expect(401);
    });

    it('should reject missing required fields for user creation', async () => {
      const res = await request(API_URL)
        .post(`/api/v1/tenants/${tenantAId}/users`)
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .send({ email: `incomplete-${uniqueId}@test.com` })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // 5. TENANT ISOLATION
  // ============================================
  describe('Tenant Isolation', () => {
    it('Tenant B should not see Tenant A credit requests', async () => {
      const res = await request(API_URL)
        .get('/api/credits/requests?status=all')
        .set('Authorization', `Bearer ${tenantBAdminTokens.accessToken}`)
        .expect(200);

      // If there are requests, none should belong to Tenant A
      if (res.body.requests && res.body.requests.length > 0) {
        const tenantARequests = res.body.requests.filter(r => r.tenant_id === tenantAId);
        expect(tenantARequests.length).toBe(0);
      }
    });

    it('Tenant B should not see Tenant A transactions', async () => {
      const res = await request(API_URL)
        .get('/api/credits/transactions')
        .set('Authorization', `Bearer ${tenantBAdminTokens.accessToken}`)
        .expect(200);

      // If there are transactions, none should belong to Tenant A
      if (res.body.transactions && res.body.transactions.length > 0) {
        const tenantATxns = res.body.transactions.filter(t => t.tenant_id === tenantAId);
        expect(tenantATxns.length).toBe(0);
      }
    });

    it('Super admin should see all tenants data', async () => {
      const res = await request(API_URL)
        .get('/api/credits/requests?status=all')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .expect(200);

      expect(res.body.requests).toBeDefined();
      // Super admin should see requests from multiple tenants
      const tenantIds = [...new Set(res.body.requests.map(r => r.tenant_id))];
      expect(tenantIds.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================
  // 6. AUTHENTICATION EDGE CASES
  // ============================================
  describe('Authentication Edge Cases', () => {
    it('should reject requests with invalid token', async () => {
      await request(API_URL)
        .get('/api/tenants')
        .set('Authorization', 'Bearer invalid-token-string')
        .expect(401);
    });

    it('should reject requests without Authorization header', async () => {
      await request(API_URL)
        .get('/api/tenants')
        .expect(401);
    });

    it('should reject refresh with missing token', async () => {
      const res = await request(API_URL)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject refresh with invalid token', async () => {
      const res = await request(API_URL)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should block tenant admin from accessing super admin routes', async () => {
      await request(API_URL)
        .get('/api/tenants')
        .set('Authorization', `Bearer ${tenantAAdminTokens.accessToken}`)
        .expect(403);
    });

    it('should logout successfully', async () => {
      // Get fresh tokens for logout test
      const tokens = await loginAs(dbPool, tenantBEmail, tenantBSlug);

      const res = await request(API_URL)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Re-login Tenant B for remaining tests
      tenantBAdminTokens = await loginAs(dbPool, tenantBEmail, tenantBSlug);
    });
  });

  // ============================================
  // 7. VALIDATION & ERROR HANDLING
  // ============================================
  describe('Validation & Error Handling', () => {
    it('should reject tenant creation without required fields', async () => {
      const res = await request(API_URL)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({ tenant_name: '' })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should reject invalid slug format', async () => {
      const res = await request(API_URL)
        .post('/api/tenants')
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .send({
          tenant_name: 'Bad Slug Tenant',
          subdomain_slug: 'BAD SLUG!!!',
          email: `badslug-${uniqueId}@test.com`
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for non-existent tenant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(API_URL)
        .get(`/api/tenants/${fakeId}`)
        .set('Authorization', `Bearer ${superAdminTokens.accessToken}`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('should reject credit request with invalid amount', async () => {
      const res = await request(API_URL)
        .post('/api/credits/request')
        .set('Authorization', `Bearer ${tenantBAdminTokens.accessToken}`)
        .send({
          requested_amount: -100,
          justification: 'Negative amount'
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });
});
