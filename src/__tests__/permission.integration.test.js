/**
 * Permission-Based Authorization Integration Tests
 * Tests actual API endpoints with TENANT_ADMIN vs TENANT_USER permissions
 */

const request = require('supertest');
const app = require('../server');
const db = require('../config/database');
const tokenService = require('../services/token.service');

describe('Permission-Based Authorization Integration Tests', () => {
  let tenantAdminToken;
  let tenantUserToken;
  let testTenantId;
  let testVerificationAppId;
  let testProductId;
  let testCategoryId;

  // Setup test data
  beforeAll(async () => {
    // Create test tenant
    const tenantResult = await db.query(
      `INSERT INTO tenants (tenant_name, email, subdomain_slug, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Permission Test Tenant', 'permission-test@example.com', 'permission-test', true]
    );
    testTenantId = tenantResult.rows[0].id;

    // Create TENANT_ADMIN user
    const adminResult = await db.query(
      `INSERT INTO users (email, full_name, role, tenant_id, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['admin@permission-test.com', 'Test Admin', 'TENANT_ADMIN', testTenantId, true]
    );
    const adminUserId = adminResult.rows[0].id;

    // Create TENANT_USER user
    const userResult = await db.query(
      `INSERT INTO users (email, full_name, role, tenant_id, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['user@permission-test.com', 'Test User', 'TENANT_USER', testTenantId, true]
    );
    const tenantUserId = userResult.rows[0].id;

    // Generate tokens
    const adminPermissions = [
      'create_app', 'edit_app', 'delete_app', 'view_apps',
      'create_coupon', 'edit_coupon', 'delete_coupon', 'view_coupons',
      'create_product', 'edit_product', 'delete_product', 'view_products',
      'create_category', 'edit_category', 'delete_category', 'view_categories',
      'request_credits', 'view_analytics', 'view_scans'
    ];

    const userPermissions = [
      'view_apps', 'view_coupons', 'view_products', 'view_categories',
      'view_scans', 'view_analytics', 'view_credit_balance'
    ];

    const adminTokens = tokenService.generateTokens(
      adminUserId,
      'TENANT_ADMIN',
      testTenantId,
      'permission-test',
      adminPermissions
    );
    tenantAdminToken = adminTokens.accessToken;

    const userTokens = tokenService.generateTokens(
      tenantUserId,
      'TENANT_USER',
      testTenantId,
      'permission-test',
      userPermissions
    );
    tenantUserToken = userTokens.accessToken;
  });

  // Cleanup test data
  afterAll(async () => {
    // Clean up in reverse order of foreign key dependencies
    if (testCategoryId) {
      await db.query('DELETE FROM categories WHERE id = $1', [testCategoryId]);
    }
    if (testProductId) {
      await db.query('DELETE FROM products WHERE id = $1', [testProductId]);
    }
    if (testVerificationAppId) {
      await db.query('DELETE FROM verification_apps WHERE verification_app_id = $1', [testVerificationAppId]);
    }
    await db.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  describe('Verification App Endpoints', () => {
    it('TENANT_ADMIN should create verification app', async () => {
      const appData = {
        app_name: 'Permission Test App',
        description: 'Test app for permission testing',
        welcome_message: 'Welcome!',
        scan_success_message: 'Success!',
        scan_failure_message: 'Failed!'
      };

      const response = await request(app)
        .post('/api/v1/rewards/verification-apps')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .send(appData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('verification_app_id');
      testVerificationAppId = response.body.data.verification_app_id;
    });

    it('TENANT_USER should NOT create verification app (403)', async () => {
      const appData = {
        app_name: 'Unauthorized App',
        description: 'Should fail',
        welcome_message: 'Welcome!',
        scan_success_message: 'Success!',
        scan_failure_message: 'Failed!'
      };

      const response = await request(app)
        .post('/api/v1/rewards/verification-apps')
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send(appData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    it('TENANT_USER should view verification apps', async () => {
      const response = await request(app)
        .get('/api/v1/rewards/verification-apps')
        .set('Authorization', `Bearer ${tenantUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('TENANT_USER should NOT edit verification app (403)', async () => {
      if (!testVerificationAppId) {
        console.log('Skipping: No verification app created');
        return;
      }

      const response = await request(app)
        .put(`/api/v1/rewards/verification-apps/${testVerificationAppId}`)
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send({ app_name: 'Updated Name' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('Product Endpoints', () => {
    it('TENANT_ADMIN should create product', async () => {
      if (!testVerificationAppId) {
        console.log('Skipping: No verification app created');
        return;
      }

      const productData = {
        product_name: 'Permission Test Product',
        product_sku: 'PERM-TEST-001',
        description: 'Test product',
        verification_app_id: testVerificationAppId,
        price: 99.99,
        currency: 'USD'
      };

      const response = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .send(productData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      testProductId = response.body.product.id;
    });

    it('TENANT_USER should NOT create product (403)', async () => {
      const productData = {
        product_name: 'Unauthorized Product',
        product_sku: 'UNAUTH-001',
        description: 'Should fail'
      };

      const response = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send(productData);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    it('TENANT_USER should view products', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('TENANT_USER should NOT edit product (403)', async () => {
      if (!testProductId) {
        console.log('Skipping: No product created');
        return;
      }

      const response = await request(app)
        .put(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send({ product_name: 'Updated Name' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    it('TENANT_USER should NOT delete product (403)', async () => {
      if (!testProductId) {
        console.log('Skipping: No product created');
        return;
      }

      const response = await request(app)
        .delete(`/api/v1/products/${testProductId}`)
        .set('Authorization', `Bearer ${tenantUserToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('Category Endpoints', () => {
    it('TENANT_ADMIN should create category', async () => {
      if (!testVerificationAppId) {
        console.log('Skipping: No verification app created');
        return;
      }

      const categoryData = {
        name: 'Permission Test Category',
        description: 'Test category',
        verification_app_id: testVerificationAppId
      };

      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .send(categoryData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      testCategoryId = response.body.category.id;
    });

    it('TENANT_USER should NOT create category (403)', async () => {
      const categoryData = {
        name: 'Unauthorized Category',
        description: 'Should fail'
      };

      const response = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send(categoryData);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    it('TENANT_USER should view categories', async () => {
      const response = await request(app)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${tenantUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('TENANT_USER should NOT edit category (403)', async () => {
      if (!testCategoryId) {
        console.log('Skipping: No category created');
        return;
      }

      const response = await request(app)
        .put(`/api/v1/categories/${testCategoryId}`)
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    it('TENANT_USER should NOT delete category (403)', async () => {
      if (!testCategoryId) {
        console.log('Skipping: No category created');
        return;
      }

      const response = await request(app)
        .delete(`/api/v1/categories/${testCategoryId}`)
        .set('Authorization', `Bearer ${tenantUserToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('Coupon Endpoints', () => {
    it('TENANT_ADMIN should create coupon', async () => {
      if (!testVerificationAppId) {
        console.log('Skipping: No verification app created');
        return;
      }

      const couponData = {
        verification_app_id: testVerificationAppId,
        discount_value: 50,
        description: 'Permission test coupon',
        quantity: 1,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await request(app)
        .post('/api/v1/rewards/coupons')
        .set('Authorization', `Bearer ${tenantAdminToken}`)
        .send(couponData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('TENANT_USER should NOT create coupon (403)', async () => {
      const couponData = {
        verification_app_id: testVerificationAppId || 1,
        discount_value: 50,
        description: 'Unauthorized coupon',
        quantity: 1,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      const response = await request(app)
        .post('/api/v1/rewards/coupons')
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send(couponData);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    });

    it('TENANT_USER should view coupons', async () => {
      const response = await request(app)
        .get('/api/v1/rewards/coupons')
        .set('Authorization', `Bearer ${tenantUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Analytics Endpoints', () => {
    it('TENANT_USER should view analytics (read-only permission)', async () => {
      const response = await request(app)
        .get(`/api/v1/tenants/${testTenantId}/analytics/overview`)
        .set('Authorization', `Bearer ${tenantUserToken}`);

      // Should succeed as TENANT_USER has view_analytics permission
      expect([200, 404]).toContain(response.status);
      // 404 is acceptable if no data exists yet
    });
  });

  describe('Audit Logging', () => {
    it('should log unauthorized access attempts', async () => {
      // Attempt unauthorized action
      await request(app)
        .post('/api/v1/rewards/verification-apps')
        .set('Authorization', `Bearer ${tenantUserToken}`)
        .send({ app_name: 'Unauthorized' });

      // Check audit log
      const auditResult = await db.query(
        `SELECT * FROM audit_logs
         WHERE action = 'UNAUTHORIZED_ACCESS_ATTEMPT'
         AND metadata->>'endpoint' LIKE '%verification-apps%'
         ORDER BY created_at DESC
         LIMIT 1`
      );

      expect(auditResult.rows.length).toBeGreaterThan(0);
      const log = auditResult.rows[0];
      expect(log.metadata.required_permissions).toContain('create_app');
    });
  });
});
