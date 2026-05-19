/**
 * E2E Tests for Verification App System
 *
 * Covers:
 * - Verification App CRUD operations
 * - Template assignment to apps
 * - App configuration (rewards, QR settings)
 * - Tenant isolation
 * - App activation/deactivation
 * - Product-app relationships
 *
 * Run with: E2E_TESTS_ENABLED=true npm test -- verification-app-e2e.test.js
 */

const request = require('supertest');
const db = require('../config/database');
const app = require('../server');

const testRunner = process.env.E2E_TESTS_ENABLED === 'true' ? describe : describe.skip;

testRunner('Verification App System E2E Tests', () => {
  let superAdminToken;
  let tenantAAdminToken;
  let tenantBAdminToken;
  let tenantAId;
  let tenantBId;
  let tenantAAdminId;
  let tenantBAdminId;
  let templateAId;
  let templateBId;
  let appAId;
  let appBId;
  let productId;

  // Helper function to create tenant
  const createTenant = async (name, email, slug) => {
    const response = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        company_name: name,
        admin_email: email,
        admin_name: `${name} Admin`,
        admin_phone: '+1234567890',
        subdomain_slug: slug,
        max_users: 10,
        max_products: 1000,
        status: 'active'
      });
    return response.body.tenant;
  };

  // Helper function to login via OTP
  const loginViaOTP = async (email, subdomain = null) => {
    const otpResponse = await request(app)
      .post('/api/auth/request-otp')
      .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
      .send({ identifier: email });

    expect(otpResponse.status).toBe(200);

    const otpQuery = await db.query(
      'SELECT otp_code FROM otp_codes WHERE identifier = $1 AND used = false ORDER BY created_at DESC LIMIT 1',
      [email]
    );
    const otpCode = otpQuery.rows[0].otp_code;

    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
      .send({ identifier: email, otp: otpCode });

    expect(verifyResponse.status).toBe(200);
    return verifyResponse.body.accessToken;
  };

  // Helper to create template
  const createTemplate = async (token, name) => {
    const response = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: name,
        description: `Template for ${name}`,
        attributes: [
          { name: 'Brand', data_type: 'String', is_required: true, display_order: 1 },
          { name: 'Model', data_type: 'String', is_required: false, display_order: 2 }
        ],
        variant_config: {
          enabled: true,
          options: [
            { name: 'Color', values: ['Black', 'White'] },
            { name: 'Size', values: ['Small', 'Medium', 'Large'] }
          ]
        }
      });
    return response.body.template.id;
  };

  beforeAll(async () => {
    // Get super admin token
    const superAdminQuery = await db.query(
      "SELECT email FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1"
    );
    const superAdminEmail = superAdminQuery.rows[0].email;
    superAdminToken = await loginViaOTP(superAdminEmail);

    // Create Tenant A
    const tenantA = await createTenant('VerApp Test A', 'verapptesta@test.com', 'verapptesta');
    tenantAId = tenantA.id;
    tenantAAdminId = tenantA.admin_user_id;
    tenantAAdminToken = await loginViaOTP('verapptesta@test.com', 'verapptesta');

    // Create Tenant B
    const tenantB = await createTenant('VerApp Test B', 'verapptestb@test.com', 'verapptestb');
    tenantBId = tenantB.id;
    tenantBAdminId = tenantB.admin_user_id;
    tenantBAdminToken = await loginViaOTP('verapptestb@test.com', 'verapptestb');

    // Create templates
    templateAId = await createTemplate(tenantAAdminToken, 'Electronics Template A');
    templateBId = await createTemplate(tenantBAdminToken, 'Electronics Template B');
  });

  afterAll(async () => {
    // Cleanup
    if (productId) {
      await db.query('DELETE FROM products WHERE id = $1', [productId]);
    }
    if (appAId) {
      await db.query('DELETE FROM verification_apps WHERE id = $1', [appAId]);
    }
    if (appBId) {
      await db.query('DELETE FROM verification_apps WHERE id = $1', [appBId]);
    }
    if (templateAId) {
      await db.query('DELETE FROM product_templates WHERE id = $1', [templateAId]);
    }
    if (templateBId) {
      await db.query('DELETE FROM product_templates WHERE id = $1', [templateBId]);
    }
    if (tenantAId) {
      await db.query('DELETE FROM users WHERE tenant_id = $1', [tenantAId]);
      await db.query('DELETE FROM tenants WHERE id = $1', [tenantAId]);
    }
    if (tenantBId) {
      await db.query('DELETE FROM users WHERE tenant_id = $1', [tenantBId]);
      await db.query('DELETE FROM tenants WHERE id = $1', [tenantBId]);
    }
  });

  describe('Module 1: Verification App CRUD', () => {
    test('Should create verification app with template', async () => {
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Electronics Verification App',
          template_id: templateAId,
          description: 'App for verifying electronics',
          is_active: true,
          qr_config: {
            enabled: true,
            qr_type: 'DYNAMIC'
          },
          reward_config: {
            enabled: true,
            reward_type: 'POINTS',
            points_per_scan: 10
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.app).toBeDefined();
      expect(response.body.app.app_name).toBe('Electronics Verification App');
      expect(response.body.app.template_id).toBe(templateAId);
      expect(response.body.app.tenant_id).toBe(tenantAId);
      expect(response.body.app.is_active).toBe(true);

      appAId = response.body.app.id;
    });

    test('Should get all verification apps for tenant', async () => {
      const response = await request(app)
        .get('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.apps).toBeDefined();
      expect(Array.isArray(response.body.apps)).toBe(true);

      const createdApp = response.body.apps.find(a => a.id === appAId);
      expect(createdApp).toBeDefined();
      expect(createdApp.app_name).toBe('Electronics Verification App');
      expect(createdApp.template_id).toBe(templateAId);
    });

    test('Should get verification app by ID', async () => {
      const response = await request(app)
        .get(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.app).toBeDefined();
      expect(response.body.app.id).toBe(appAId);
      expect(response.body.app.app_name).toBe('Electronics Verification App');
      expect(response.body.app.template_id).toBe(templateAId);
      expect(response.body.app.qr_config).toBeDefined();
      expect(response.body.app.reward_config).toBeDefined();
    });

    test('Should update verification app', async () => {
      const response = await request(app)
        .put(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Updated Electronics App',
          description: 'Updated description',
          qr_config: {
            enabled: true,
            qr_type: 'STATIC'
          },
          reward_config: {
            enabled: true,
            reward_type: 'POINTS',
            points_per_scan: 20
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.app.app_name).toBe('Updated Electronics App');
      expect(response.body.app.reward_config.points_per_scan).toBe(20);
    });

    test('Should NOT allow changing template after creation', async () => {
      const response = await request(app)
        .put(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Updated App',
          template_id: templateBId // Try to change template
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot change template');
    });

    test('Should delete verification app', async () => {
      // Create temporary app to delete
      const createResponse = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Temp App',
          template_id: templateAId
        });

      const tempAppId = createResponse.body.app.id;

      // Delete it
      const deleteResponse = await request(app)
        .delete(`/api/verification-apps/${tempAppId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await request(app)
        .get(`/api/verification-apps/${tempAppId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(getResponse.status).toBe(404);
    });
  });

  describe('Module 2: Template Assignment', () => {
    test('Template should show updated app_count', async () => {
      const response = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.template.app_count).toBeGreaterThan(0);
    });

    test('Should create app without template', async () => {
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'No Template App',
          description: 'App without template assignment'
        });

      expect(response.status).toBe(201);
      expect(response.body.app.template_id).toBeNull();

      // Cleanup
      await db.query('DELETE FROM verification_apps WHERE id = $1', [response.body.app.id]);
    });

    test('Should NOT allow assigning non-existent template', async () => {
      const fakeTemplateId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Invalid Template App',
          template_id: fakeTemplateId
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Template not found');
    });

    test('Should NOT allow assigning template from another tenant', async () => {
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Cross Tenant App',
          template_id: templateBId // Tenant B's template
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Template not found');
    });
  });

  describe('Module 3: App Configuration', () => {
    test('Should configure QR settings', async () => {
      const response = await request(app)
        .put(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Updated Electronics App',
          qr_config: {
            enabled: true,
            qr_type: 'DYNAMIC',
            qr_prefix: 'ELEC',
            qr_expiry_days: 365
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.app.qr_config.enabled).toBe(true);
      expect(response.body.app.qr_config.qr_type).toBe('DYNAMIC');
      expect(response.body.app.qr_config.qr_prefix).toBe('ELEC');
    });

    test('Should configure reward settings', async () => {
      const response = await request(app)
        .put(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Updated Electronics App',
          reward_config: {
            enabled: true,
            reward_type: 'COUPON',
            coupon_template_id: 'WELCOME10',
            max_redemptions: 1
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.app.reward_config.enabled).toBe(true);
      expect(response.body.app.reward_config.reward_type).toBe('COUPON');
      expect(response.body.app.reward_config.coupon_template_id).toBe('WELCOME10');
    });

    test('Should disable rewards', async () => {
      const response = await request(app)
        .put(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Updated Electronics App',
          reward_config: {
            enabled: false
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.app.reward_config.enabled).toBe(false);
    });

    test('Should configure multiple settings at once', async () => {
      const response = await request(app)
        .put(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Fully Configured App',
          description: 'Complete configuration',
          qr_config: {
            enabled: true,
            qr_type: 'DYNAMIC',
            qr_prefix: 'APP',
            qr_expiry_days: 30
          },
          reward_config: {
            enabled: true,
            reward_type: 'POINTS',
            points_per_scan: 50
          },
          is_active: true
        });

      expect(response.status).toBe(200);
      expect(response.body.app.app_name).toBe('Fully Configured App');
      expect(response.body.app.qr_config.enabled).toBe(true);
      expect(response.body.app.reward_config.enabled).toBe(true);
      expect(response.body.app.is_active).toBe(true);
    });
  });

  describe('Module 4: App Activation/Deactivation', () => {
    test('Should deactivate verification app', async () => {
      const response = await request(app)
        .patch(`/api/verification-apps/${appAId}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.app.is_active).toBe(false);
    });

    test('Deactivated app should still appear in list', async () => {
      const response = await request(app)
        .get('/api/verification-apps?include_inactive=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const app = response.body.apps.find(a => a.id === appAId);
      expect(app).toBeDefined();
      expect(app.is_active).toBe(false);
    });

    test('Should activate verification app', async () => {
      const response = await request(app)
        .patch(`/api/verification-apps/${appAId}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.app.is_active).toBe(true);
    });

    test('Should filter active apps only', async () => {
      const response = await request(app)
        .get('/api/verification-apps?active_only=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allActive = response.body.apps.every(a => a.is_active === true);
      expect(allActive).toBe(true);
    });
  });

  describe('Module 5: Product-App Relationships', () => {
    beforeAll(async () => {
      // Create a product linked to the app
      const productResponse = await db.query(
        `INSERT INTO products (tenant_id, verification_app_id, template_id, name, sku, price, currency, stock_quantity, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [tenantAId, appAId, templateAId, 'Test Product', 'PROD-001', 99.99, 'USD', 100, tenantAAdminId]
      );
      productId = productResponse.rows[0].id;
    });

    test('Should get app with product count', async () => {
      const response = await request(app)
        .get(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.app.product_count).toBeGreaterThan(0);
    });

    test('Should NOT delete app that has products', async () => {
      const response = await request(app)
        .delete(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot delete app that has products');
    });

    test('Should allow deleting app after removing products', async () => {
      // Remove product
      await db.query('DELETE FROM products WHERE id = $1', [productId]);
      productId = null;

      // Create new app to delete
      const createResponse = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Deletable App',
          template_id: templateAId
        });

      const appId = createResponse.body.app.id;

      // Delete should succeed
      const deleteResponse = await request(app)
        .delete(`/api/verification-apps/${appId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
    });
  });

  describe('Module 6: Tenant Isolation', () => {
    beforeAll(async () => {
      // Create app for Tenant B
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantBAdminToken}`)
        .send({
          app_name: 'Tenant B App',
          template_id: templateBId
        });
      appBId = response.body.app.id;
    });

    test('Tenant A should NOT see Tenant B apps', async () => {
      const response = await request(app)
        .get('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const tenantBApp = response.body.apps.find(a => a.id === appBId);
      expect(tenantBApp).toBeUndefined();
    });

    test('Tenant A should NOT get Tenant B app by ID', async () => {
      const response = await request(app)
        .get(`/api/verification-apps/${appBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT update Tenant B app', async () => {
      const response = await request(app)
        .put(`/api/verification-apps/${appBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Hacked App'
        });

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT delete Tenant B app', async () => {
      const response = await request(app)
        .delete(`/api/verification-apps/${appBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Tenant B should see only their own apps', async () => {
      const response = await request(app)
        .get('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantBAdminToken}`);

      expect(response.status).toBe(200);
      const tenantAApp = response.body.apps.find(a => a.id === appAId);
      expect(tenantAApp).toBeUndefined();

      const tenantBApp = response.body.apps.find(a => a.id === appBId);
      expect(tenantBApp).toBeDefined();
    });

    test('Super admin should see apps from all tenants', async () => {
      const response = await request(app)
        .get('/api/verification-apps')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);

      const hasMultipleTenants = response.body.apps.some(a => a.tenant_id === tenantAId) &&
                                 response.body.apps.some(a => a.tenant_id === tenantBId);
      expect(hasMultipleTenants).toBe(true);
    });
  });

  describe('Module 7: Validation & Error Handling', () => {
    test('Should reject app creation without name', async () => {
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          template_id: templateAId
          // Missing app_name
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should reject duplicate app names for same tenant', async () => {
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Fully Configured App', // Already exists
          template_id: templateAId
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    test('Should allow same app name for different tenants', async () => {
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantBAdminToken}`)
        .send({
          app_name: 'Fully Configured App', // Same name but different tenant
          template_id: templateBId
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Cleanup
      await db.query('DELETE FROM verification_apps WHERE id = $1', [response.body.app.id]);
    });

    test('Should reject invalid QR config', async () => {
      const response = await request(app)
        .post('/api/verification-apps')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          app_name: 'Invalid QR App',
          qr_config: {
            enabled: true,
            qr_type: 'INVALID_TYPE'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should return 404 for non-existent app', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/verification-apps/${fakeId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/verification-apps');

      expect(response.status).toBe(401);
    });
  });

  describe('Module 8: Search and Filtering', () => {
    test('Should search apps by name', async () => {
      const response = await request(app)
        .get('/api/verification-apps?search=Configured')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.apps.length).toBeGreaterThan(0);
      const allMatch = response.body.apps.every(a =>
        a.app_name.toLowerCase().includes('configured')
      );
      expect(allMatch).toBe(true);
    });

    test('Should filter by template', async () => {
      const response = await request(app)
        .get(`/api/verification-apps?template_id=${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allMatch = response.body.apps.every(a => a.template_id === templateAId);
      expect(allMatch).toBe(true);
    });

    test('Should support pagination', async () => {
      const response = await request(app)
        .get('/api/verification-apps?page=1&limit=2')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.apps.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.currentPage).toBe(1);
    });
  });
});
