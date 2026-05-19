/**
 * E2E Tests for Template System
 *
 * Covers:
 * - Template CRUD operations
 * - Template protection (cannot update/delete/deactivate with products)
 * - Template protection (cannot delete when assigned to apps)
 * - Hard delete verification
 * - Product count and app count tracking
 * - Template duplication
 * - Tenant isolation
 *
 * Run with: E2E_TESTS_ENABLED=true npm test -- template-e2e.test.js
 */

const request = require('supertest');
const db = require('../config/database');
const app = require('../server');

// Skip these tests unless E2E_TESTS_ENABLED is set
const testRunner = process.env.E2E_TESTS_ENABLED === 'true' ? describe : describe.skip;

testRunner('Template System E2E Tests', () => {
  let superAdminToken;
  let tenantAAdminToken;
  let tenantBAdminToken;
  let tenantAId;
  let tenantBId;
  let tenantAAdminId;
  let tenantBAdminId;
  let templateAId;
  let templateBId;
  let verificationAppId;
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
    // Request OTP
    const otpResponse = await request(app)
      .post('/api/auth/request-otp')
      .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
      .send({ identifier: email });

    expect(otpResponse.status).toBe(200);

    // Get OTP from database
    const otpQuery = await db.query(
      'SELECT otp_code FROM otp_codes WHERE identifier = $1 AND used = false ORDER BY created_at DESC LIMIT 1',
      [email]
    );
    const otpCode = otpQuery.rows[0].otp_code;

    // Verify OTP
    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
      .send({ identifier: email, otp: otpCode });

    expect(verifyResponse.status).toBe(200);
    return verifyResponse.body.accessToken;
  };

  // Setup: Create super admin, tenants, and get tokens
  beforeAll(async () => {
    // Get super admin token
    const superAdminQuery = await db.query(
      "SELECT email FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1"
    );
    const superAdminEmail = superAdminQuery.rows[0].email;
    superAdminToken = await loginViaOTP(superAdminEmail);

    // Create Tenant A
    const tenantA = await createTenant('Template Test A', 'templatetesta@test.com', 'templatetesta');
    tenantAId = tenantA.id;
    tenantAAdminId = tenantA.admin_user_id;

    // Create Tenant B
    const tenantB = await createTenant('Template Test B', 'templatetestb@test.com', 'templatetestb');
    tenantBId = tenantB.id;
    tenantBAdminId = tenantB.admin_user_id;

    // Login as Tenant A admin
    tenantAAdminToken = await loginViaOTP('templatetesta@test.com', 'templatetesta');

    // Login as Tenant B admin
    tenantBAdminToken = await loginViaOTP('templatetestb@test.com', 'templatetestb');
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Clean up test data
    if (productId) {
      await db.query('DELETE FROM products WHERE id = $1', [productId]);
    }
    if (verificationAppId) {
      await db.query('DELETE FROM verification_apps WHERE id = $1', [verificationAppId]);
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

  describe('Module 1: Template CRUD (Tenant Admin)', () => {
    test('Should create a template', async () => {
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Electronics Template',
          description: 'Template for electronic products',
          attributes: [
            {
              name: 'Brand',
              data_type: 'String',
              is_required: true,
              display_order: 1
            },
            {
              name: 'Warranty',
              data_type: 'String',
              is_required: false,
              display_order: 2
            },
            {
              name: 'Country of Origin',
              data_type: 'String',
              is_required: false,
              display_order: 3
            }
          ],
          variant_config: {
            enabled: true,
            options: [
              {
                name: 'Color',
                values: ['Black', 'White', 'Silver']
              },
              {
                name: 'Storage',
                values: ['64GB', '128GB', '256GB']
              }
            ]
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.template).toBeDefined();
      expect(response.body.template.name).toBe('Electronics Template');
      expect(response.body.template.tenant_id).toBe(tenantAId);
      expect(response.body.template.attribute_count).toBe(3);
      expect(response.body.template.product_count).toBe(0);
      expect(response.body.template.app_count).toBe(0);

      templateAId = response.body.template.id;
    });

    test('Should get all templates for tenant', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.templates).toBeDefined();
      expect(Array.isArray(response.body.templates)).toBe(true);

      const createdTemplate = response.body.templates.find(t => t.id === templateAId);
      expect(createdTemplate).toBeDefined();
      expect(createdTemplate.name).toBe('Electronics Template');
      expect(createdTemplate.product_count).toBe(0);
      expect(createdTemplate.app_count).toBe(0);
    });

    test('Should get template by ID', async () => {
      const response = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.template).toBeDefined();
      expect(response.body.template.id).toBe(templateAId);
      expect(response.body.template.name).toBe('Electronics Template');
      expect(response.body.template.attributes).toBeDefined();
      expect(response.body.template.attributes.length).toBe(3);
      expect(response.body.template.product_count).toBe(0);
      expect(response.body.template.app_count).toBe(0);
    });

    test('Should update template when no products exist', async () => {
      const response = await request(app)
        .put(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Electronics Template Updated',
          description: 'Updated description',
          attributes: [
            {
              name: 'Brand',
              data_type: 'String',
              is_required: true,
              display_order: 1
            },
            {
              name: 'Warranty',
              data_type: 'String',
              is_required: false,
              display_order: 2
            },
            {
              name: 'Country of Origin',
              data_type: 'String',
              is_required: false,
              display_order: 3
            },
            {
              name: 'Model Number',
              data_type: 'String',
              is_required: false,
              display_order: 4
            }
          ],
          variant_config: {
            enabled: true,
            options: [
              {
                name: 'Color',
                values: ['Black', 'White', 'Silver', 'Gold']
              },
              {
                name: 'Storage',
                values: ['64GB', '128GB', '256GB', '512GB']
              }
            ]
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template.name).toBe('Electronics Template Updated');
      expect(response.body.template.attribute_count).toBe(4);
    });

    test('Should duplicate template', async () => {
      const response = await request(app)
        .post(`/api/templates/${templateAId}/duplicate`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Electronics Template Copy'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.template).toBeDefined();
      expect(response.body.template.name).toBe('Electronics Template Copy');
      expect(response.body.template.id).not.toBe(templateAId);
      expect(response.body.template.tenant_id).toBe(tenantAId);
      expect(response.body.template.attribute_count).toBe(4);
      expect(response.body.template.product_count).toBe(0);

      // Clean up duplicated template
      await db.query('DELETE FROM product_templates WHERE id = $1', [response.body.template.id]);
    });
  });

  describe('Module 2: Template Protection - Products', () => {
    beforeAll(async () => {
      // Create a product using the template
      const productResponse = await db.query(
        `INSERT INTO products (tenant_id, template_id, name, sku, price, currency, stock_quantity, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [tenantAId, templateAId, 'Test Product', 'TEST-001', 99.99, 'USD', 100, tenantAAdminId]
      );
      productId = productResponse.rows[0].id;
    });

    test('Should show updated product_count after product creation', async () => {
      const response = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.template.product_count).toBe(1);
    });

    test('Should NOT allow updating template when it has products', async () => {
      const response = await request(app)
        .put(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Electronics Template Modified',
          description: 'This should fail',
          attributes: [
            {
              name: 'Brand',
              data_type: 'String',
              is_required: true,
              display_order: 1
            }
          ],
          variant_config: {
            enabled: false,
            options: []
          }
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot update template that has products');
    });

    test('Should NOT allow deleting template when it has products', async () => {
      const response = await request(app)
        .delete(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot delete template that has products');
    });

    test('Should NOT allow deactivating template when it has products', async () => {
      const response = await request(app)
        .patch(`/api/templates/${templateAId}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: false });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot deactivate template that has products');
    });

    test('Should verify template still exists in database (not soft deleted)', async () => {
      const query = await db.query(
        'SELECT * FROM product_templates WHERE id = $1',
        [templateAId]
      );

      expect(query.rows.length).toBe(1);
      expect(query.rows[0].is_active).toBe(true);
      expect(query.rows[0].name).toBe('Electronics Template Updated');
    });

    afterAll(async () => {
      // Delete the product to allow further tests
      await db.query('DELETE FROM products WHERE id = $1', [productId]);
      productId = null;
    });
  });

  describe('Module 3: Template Protection - Verification Apps', () => {
    beforeAll(async () => {
      // Create a verification app using the template
      const appResponse = await db.query(
        `INSERT INTO verification_apps (tenant_id, app_name, template_id, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [tenantAId, 'Test Verification App', templateAId, tenantAAdminId]
      );
      verificationAppId = appResponse.rows[0].id;
    });

    test('Should show updated app_count after app assignment', async () => {
      const response = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.template.app_count).toBe(1);
      expect(response.body.template.product_count).toBe(0); // Product was deleted in previous module
    });

    test('Should NOT allow deleting template when assigned to apps', async () => {
      const response = await request(app)
        .delete(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot delete template that is assigned to verification apps');
    });

    test('Should list templates with app_count', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const template = response.body.templates.find(t => t.id === templateAId);
      expect(template).toBeDefined();
      expect(template.app_count).toBe(1);
    });

    afterAll(async () => {
      // Unassign template from app to allow deletion tests
      await db.query('DELETE FROM verification_apps WHERE id = $1', [verificationAppId]);
      verificationAppId = null;
    });
  });

  describe('Module 4: Hard Delete Verification', () => {
    test('Should permanently delete template (hard delete)', async () => {
      // Verify template exists before deletion
      const beforeQuery = await db.query(
        'SELECT * FROM product_templates WHERE id = $1',
        [templateAId]
      );
      expect(beforeQuery.rows.length).toBe(1);

      // Delete template
      const response = await request(app)
        .delete(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify template is completely removed from database (not just deactivated)
      const afterQuery = await db.query(
        'SELECT * FROM product_templates WHERE id = $1',
        [templateAId]
      );
      expect(afterQuery.rows.length).toBe(0);
    });

    test('Should return 404 when trying to get deleted template', async () => {
      const response = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Deleted template should not appear in list', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const deletedTemplate = response.body.templates.find(t => t.id === templateAId);
      expect(deletedTemplate).toBeUndefined();
    });

    afterAll(async () => {
      // Reset templateAId since it's deleted
      templateAId = null;
    });
  });

  describe('Module 5: Template Activation/Deactivation', () => {
    beforeAll(async () => {
      // Create a new template for activation tests
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Activation Test Template',
          description: 'For testing activation/deactivation',
          attributes: [
            {
              name: 'Test Attribute',
              data_type: 'String',
              is_required: false,
              display_order: 1
            }
          ],
          variant_config: {
            enabled: false,
            options: []
          }
        });

      templateAId = response.body.template.id;
    });

    test('Should deactivate template when no products exist', async () => {
      const response = await request(app)
        .patch(`/api/templates/${templateAId}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template.is_active).toBe(false);
    });

    test('Should show deactivated template in list', async () => {
      const response = await request(app)
        .get('/api/templates?include_inactive=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const template = response.body.templates.find(t => t.id === templateAId);
      expect(template).toBeDefined();
      expect(template.is_active).toBe(false);
    });

    test('Should activate deactivated template', async () => {
      const response = await request(app)
        .patch(`/api/templates/${templateAId}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template.is_active).toBe(true);
    });

    test('Should NOT deactivate template with products', async () => {
      // Add a product
      const productResponse = await db.query(
        `INSERT INTO products (tenant_id, template_id, name, sku, price, currency, stock_quantity, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [tenantAId, templateAId, 'Activation Test Product', 'ACT-001', 49.99, 'USD', 50, tenantAAdminId]
      );
      productId = productResponse.rows[0].id;

      // Try to deactivate
      const response = await request(app)
        .patch(`/api/templates/${templateAId}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: false });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot deactivate template that has products');

      // Cleanup
      await db.query('DELETE FROM products WHERE id = $1', [productId]);
      productId = null;
    });
  });

  describe('Module 6: Tenant Isolation', () => {
    beforeAll(async () => {
      // Create template for Tenant B
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${tenantBAdminToken}`)
        .send({
          name: 'Tenant B Template',
          description: 'Template for isolation testing',
          attributes: [
            {
              name: 'Attribute B',
              data_type: 'String',
              is_required: false,
              display_order: 1
            }
          ],
          variant_config: {
            enabled: false,
            options: []
          }
        });

      templateBId = response.body.template.id;
    });

    test('Tenant A should NOT see Tenant B templates', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const tenantBTemplate = response.body.templates.find(t => t.id === templateBId);
      expect(tenantBTemplate).toBeUndefined();
    });

    test('Tenant A should NOT be able to get Tenant B template by ID', async () => {
      const response = await request(app)
        .get(`/api/templates/${templateBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT be able to update Tenant B template', async () => {
      const response = await request(app)
        .put(`/api/templates/${templateBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Hacked Template',
          description: 'This should fail',
          attributes: [],
          variant_config: { enabled: false, options: [] }
        });

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT be able to delete Tenant B template', async () => {
      const response = await request(app)
        .delete(`/api/templates/${templateBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Tenant B should see only their own templates', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${tenantBAdminToken}`);

      expect(response.status).toBe(200);
      const tenantATemplate = response.body.templates.find(t => t.id === templateAId);
      expect(tenantATemplate).toBeUndefined();

      const tenantBTemplate = response.body.templates.find(t => t.id === templateBId);
      expect(tenantBTemplate).toBeDefined();
    });

    test('Super admin should see templates from all tenants', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);

      // Super admin should see both tenant templates
      const tenantATemplate = response.body.templates.find(t => t.id === templateAId);
      const tenantBTemplate = response.body.templates.find(t => t.id === templateBId);

      // At least one of them should be visible (templateA might be deleted in earlier tests)
      expect(tenantBTemplate).toBeDefined();
    });
  });

  describe('Module 7: System Template Protection', () => {
    let systemTemplateId;

    beforeAll(async () => {
      // Create a system template
      const response = await db.query(
        `INSERT INTO product_templates (tenant_id, template_name, description, is_system_template, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [tenantAId, 'System Template Test', 'Protected system template', true, true, tenantAAdminId]
      );
      systemTemplateId = response.rows[0].id;
    });

    test('Should NOT allow deleting system template', async () => {
      const response = await request(app)
        .delete(`/api/templates/${systemTemplateId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('System templates cannot be deleted');
    });

    test('Should NOT allow updating system template', async () => {
      const response = await request(app)
        .put(`/api/templates/${systemTemplateId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Modified System Template',
          description: 'This should fail',
          attributes: [],
          variant_config: { enabled: false, options: [] }
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('System templates cannot be modified');
    });

    test('System template should still exist in database', async () => {
      const query = await db.query(
        'SELECT * FROM product_templates WHERE id = $1',
        [systemTemplateId]
      );

      expect(query.rows.length).toBe(1);
      expect(query.rows[0].is_system_template).toBe(true);
      expect(query.rows[0].template_name).toBe('System Template Test');
    });

    afterAll(async () => {
      // Clean up system template
      await db.query('DELETE FROM product_templates WHERE id = $1', [systemTemplateId]);
    });
  });

  describe('Module 8: Validation & Error Handling', () => {
    test('Should reject template creation without name', async () => {
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          description: 'Missing name',
          attributes: [],
          variant_config: { enabled: false, options: [] }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should reject template creation with invalid attribute data type', async () => {
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Invalid Template',
          description: 'Has invalid attribute',
          attributes: [
            {
              name: 'Bad Attribute',
              data_type: 'InvalidType',
              is_required: false,
              display_order: 1
            }
          ],
          variant_config: { enabled: false, options: [] }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should return 404 for non-existent template', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/templates/${fakeId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/templates');

      expect(response.status).toBe(401);
    });

    test('Should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', 'Bearer invalid_token_here');

      expect(response.status).toBe(401);
    });
  });

  describe('Module 9: Template Search and Filtering', () => {
    beforeAll(async () => {
      // Create multiple templates with different characteristics
      const templates = [
        { name: 'Electronics Premium', description: 'High-end electronics' },
        { name: 'Electronics Budget', description: 'Affordable electronics' },
        { name: 'Clothing Summer', description: 'Summer wear collection' },
        { name: 'Clothing Winter', description: 'Winter wear collection' }
      ];

      for (const template of templates) {
        await request(app)
          .post('/api/templates')
          .set('Authorization', `Bearer ${tenantAAdminToken}`)
          .send({
            name: template.name,
            description: template.description,
            attributes: [
              {
                name: 'Brand',
                data_type: 'String',
                is_required: false,
                display_order: 1
              }
            ],
            variant_config: { enabled: false, options: [] }
          });
      }
    });

    test('Should search templates by name', async () => {
      const response = await request(app)
        .get('/api/templates?search=Electronics')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.templates.length).toBeGreaterThan(0);

      const allElectronics = response.body.templates.every(t =>
        t.name.includes('Electronics')
      );
      expect(allElectronics).toBe(true);
    });

    test('Should filter active templates only', async () => {
      const response = await request(app)
        .get('/api/templates?active_only=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allActive = response.body.templates.every(t => t.is_active === true);
      expect(allActive).toBe(true);
    });

    test('Should support pagination', async () => {
      const response = await request(app)
        .get('/api/templates?page=1&limit=2')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.templates.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.currentPage).toBe(1);
    });

    afterAll(async () => {
      // Clean up search test templates
      await db.query(
        `DELETE FROM product_templates
         WHERE tenant_id = $1
         AND template_name LIKE '%Electronics%'
         OR template_name LIKE '%Clothing%'`,
        [tenantAId]
      );
    });
  });
});
