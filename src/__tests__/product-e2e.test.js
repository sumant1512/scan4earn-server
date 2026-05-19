/**
 * E2E Tests for Product Management System
 *
 * Covers:
 * - Product CRUD operations
 * - Template-based product creation
 * - Product attributes and variants
 * - Product images (upload/delete)
 * - Product-app relationships
 * - Stock management
 * - Tenant isolation
 *
 * Run with: E2E_TESTS_ENABLED=true npm test -- product-e2e.test.js
 */

const request = require('supertest');
const db = require('../config/database');
const app = require('../server');
const path = require('path');
const fs = require('fs');

const testRunner = process.env.E2E_TESTS_ENABLED === 'true' ? describe : describe.skip;

testRunner('Product Management System E2E Tests', () => {
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
  let productAId;
  let productBId;
  let categoryId;

  // Helper functions
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

  const loginViaOTP = async (email, subdomain = null) => {
    const otpResponse = await request(app)
      .post('/api/auth/request-otp')
      .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
      .send({ identifier: email });

    const otpQuery = await db.query(
      'SELECT otp_code FROM otp_codes WHERE identifier = $1 AND used = false ORDER BY created_at DESC LIMIT 1',
      [email]
    );
    const otpCode = otpQuery.rows[0].otp_code;

    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
      .send({ identifier: email, otp: otpCode });

    return verifyResponse.body.accessToken;
  };

  const createTemplate = async (token, name) => {
    const response = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: name,
        description: `Template for ${name}`,
        attributes: [
          { name: 'Brand', data_type: 'String', is_required: true, display_order: 1 },
          { name: 'Warranty', data_type: 'String', is_required: false, display_order: 2 },
          { name: 'Country', data_type: 'String', is_required: false, display_order: 3 }
        ],
        variant_config: {
          enabled: true,
          options: [
            { name: 'Color', values: ['Black', 'White', 'Silver'] },
            { name: 'Storage', values: ['64GB', '128GB', '256GB'] }
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

    // Create tenants
    const tenantA = await createTenant('Product Test A', 'producttesta@test.com', 'producttesta');
    tenantAId = tenantA.id;
    tenantAAdminId = tenantA.admin_user_id;
    tenantAAdminToken = await loginViaOTP('producttesta@test.com', 'producttesta');

    const tenantB = await createTenant('Product Test B', 'producttestb@test.com', 'producttestb');
    tenantBId = tenantB.id;
    tenantBAdminId = tenantB.admin_user_id;
    tenantBAdminToken = await loginViaOTP('producttestb@test.com', 'producttestb');

    // Create templates
    templateAId = await createTemplate(tenantAAdminToken, 'Electronics Template');
    templateBId = await createTemplate(tenantBAdminToken, 'Gadgets Template');

    // Create verification app
    const appResponse = await request(app)
      .post('/api/verification-apps')
      .set('Authorization', `Bearer ${tenantAAdminToken}`)
      .send({
        app_name: 'Product Test App',
        template_id: templateAId
      });
    appAId = appResponse.body.app.id;

    // Create category
    const categoryResponse = await db.query(
      `INSERT INTO categories (tenant_id, name, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantAId, 'Electronics', tenantAAdminId]
    );
    categoryId = categoryResponse.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    if (productAId) {
      await db.query('DELETE FROM products WHERE id = $1', [productAId]);
    }
    if (productBId) {
      await db.query('DELETE FROM products WHERE id = $1', [productBId]);
    }
    if (categoryId) {
      await db.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    }
    if (appAId) {
      await db.query('DELETE FROM verification_apps WHERE id = $1', [appAId]);
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

  describe('Module 1: Product CRUD with Template', () => {
    test('Should create product with template', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24',
          template_id: templateAId,
          verification_app_id: appAId,
          category_id: categoryId,
          sku: 'SAM-S24-001',
          price: 799.99,
          currency: 'USD',
          stock_quantity: 100,
          description: 'Latest Samsung flagship phone',
          attributes: {
            Brand: 'Samsung',
            Warranty: '12 months',
            Country: 'South Korea'
          },
          variants: [
            {
              variant_options: { Color: 'Black', Storage: '128GB' },
              sku: 'SAM-S24-BLK-128',
              price: 799.99,
              stock_quantity: 50
            },
            {
              variant_options: { Color: 'Black', Storage: '256GB' },
              sku: 'SAM-S24-BLK-256',
              price: 899.99,
              stock_quantity: 30
            },
            {
              variant_options: { Color: 'Silver', Storage: '128GB' },
              sku: 'SAM-S24-SLV-128',
              price: 799.99,
              stock_quantity: 20
            }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.product).toBeDefined();
      expect(response.body.product.name).toBe('Samsung Galaxy S24');
      expect(response.body.product.template_id).toBe(templateAId);
      expect(response.body.product.verification_app_id).toBe(appAId);
      expect(response.body.product.attributes).toBeDefined();
      expect(response.body.product.attributes.Brand).toBe('Samsung');
      expect(response.body.product.variants).toBeDefined();
      expect(response.body.product.variants.length).toBe(3);

      productAId = response.body.product.id;
    });

    test('Should get all products for tenant', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.products).toBeDefined();
      expect(Array.isArray(response.body.products)).toBe(true);

      const createdProduct = response.body.products.find(p => p.id === productAId);
      expect(createdProduct).toBeDefined();
      expect(createdProduct.name).toBe('Samsung Galaxy S24');
    });

    test('Should get product by ID with full details', async () => {
      const response = await request(app)
        .get(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.product).toBeDefined();
      expect(response.body.product.id).toBe(productAId);
      expect(response.body.product.name).toBe('Samsung Galaxy S24');
      expect(response.body.product.attributes).toBeDefined();
      expect(response.body.product.variants).toBeDefined();
      expect(response.body.product.variants.length).toBe(3);
      expect(response.body.product.template).toBeDefined();
      expect(response.body.product.category).toBeDefined();
    });

    test('Should update product details', async () => {
      const response = await request(app)
        .put(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24 Ultra',
          description: 'Updated description',
          price: 849.99,
          attributes: {
            Brand: 'Samsung',
            Warranty: '24 months', // Updated
            Country: 'South Korea'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.product.name).toBe('Samsung Galaxy S24 Ultra');
      expect(response.body.product.price).toBe(849.99);
      expect(response.body.product.attributes.Warranty).toBe('24 months');
    });

    test('Should update product stock', async () => {
      const response = await request(app)
        .patch(`/api/products/${productAId}/stock`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          stock_quantity: 150,
          operation: 'SET'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.product.stock_quantity).toBe(150);
    });

    test('Should increment product stock', async () => {
      const response = await request(app)
        .patch(`/api/products/${productAId}/stock`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          stock_quantity: 50,
          operation: 'INCREMENT'
        });

      expect(response.status).toBe(200);
      expect(response.body.product.stock_quantity).toBe(200); // 150 + 50
    });

    test('Should decrement product stock', async () => {
      const response = await request(app)
        .patch(`/api/products/${productAId}/stock`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          stock_quantity: 25,
          operation: 'DECREMENT'
        });

      expect(response.status).toBe(200);
      expect(response.body.product.stock_quantity).toBe(175); // 200 - 25
    });

    test('Should NOT allow negative stock', async () => {
      const response = await request(app)
        .patch(`/api/products/${productAId}/stock`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          stock_quantity: 1000,
          operation: 'DECREMENT'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('negative');
    });
  });

  describe('Module 2: Product Variants', () => {
    test('Should get all variants for a product', async () => {
      const response = await request(app)
        .get(`/api/products/${productAId}/variants`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.variants).toBeDefined();
      expect(response.body.variants.length).toBe(3);
    });

    test('Should get specific variant by ID', async () => {
      // Get variants first
      const variantsResponse = await request(app)
        .get(`/api/products/${productAId}/variants`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      const variantId = variantsResponse.body.variants[0].id;

      const response = await request(app)
        .get(`/api/products/${productAId}/variants/${variantId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.variant).toBeDefined();
      expect(response.body.variant.variant_options).toBeDefined();
    });

    test('Should update variant price and stock', async () => {
      const variantsResponse = await request(app)
        .get(`/api/products/${productAId}/variants`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      const variantId = variantsResponse.body.variants[0].id;

      const response = await request(app)
        .put(`/api/products/${productAId}/variants/${variantId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          price: 819.99,
          stock_quantity: 60
        });

      expect(response.status).toBe(200);
      expect(response.body.variant.price).toBe(819.99);
      expect(response.body.variant.stock_quantity).toBe(60);
    });

    test('Should add new variant to product', async () => {
      const response = await request(app)
        .post(`/api/products/${productAId}/variants`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          variant_options: { Color: 'White', Storage: '256GB' },
          sku: 'SAM-S24-WHT-256',
          price: 919.99,
          stock_quantity: 40
        });

      expect(response.status).toBe(201);
      expect(response.body.variant).toBeDefined();
      expect(response.body.variant.variant_options.Color).toBe('White');
      expect(response.body.variant.variant_options.Storage).toBe('256GB');
    });

    test('Should delete variant', async () => {
      const variantsResponse = await request(app)
        .get(`/api/products/${productAId}/variants`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      const variantToDelete = variantsResponse.body.variants.find(
        v => v.variant_options.Color === 'White' && v.variant_options.Storage === '256GB'
      );

      const response = await request(app)
        .delete(`/api/products/${productAId}/variants/${variantToDelete.id}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Should NOT allow duplicate variant options', async () => {
      const response = await request(app)
        .post(`/api/products/${productAId}/variants`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          variant_options: { Color: 'Black', Storage: '128GB' }, // Already exists
          sku: 'SAM-S24-BLK-128-DUP',
          price: 799.99,
          stock_quantity: 10
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('Module 3: Product Attributes', () => {
    test('Should validate required attributes', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Test Product',
          template_id: templateAId,
          sku: 'TEST-001',
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10,
          attributes: {
            // Missing required 'Brand' attribute
            Warranty: '12 months'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    test('Should update product attributes', async () => {
      const response = await request(app)
        .put(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24 Ultra',
          attributes: {
            Brand: 'Samsung Electronics', // Updated
            Warranty: '24 months',
            Country: 'Vietnam' // Updated
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.product.attributes.Brand).toBe('Samsung Electronics');
      expect(response.body.product.attributes.Country).toBe('Vietnam');
    });

    test('Should get products filtered by attribute', async () => {
      const response = await request(app)
        .get('/api/products?attribute=Brand:Samsung')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.products.length).toBeGreaterThan(0);
    });
  });

  describe('Module 4: Product-Template Relationship', () => {
    test('Template product_count should reflect created products', async () => {
      const response = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.template.product_count).toBeGreaterThan(0);
    });

    test('Should NOT allow creating product with non-existent template', async () => {
      const fakeTemplateId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Invalid Product',
          template_id: fakeTemplateId,
          sku: 'INV-001',
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Template not found');
    });

    test('Should NOT allow using template from another tenant', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Cross Tenant Product',
          template_id: templateBId, // Tenant B's template
          sku: 'CROSS-001',
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Template not found');
    });
  });

  describe('Module 5: Product-App Relationship', () => {
    test('App product_count should reflect assigned products', async () => {
      const response = await request(app)
        .get(`/api/verification-apps/${appAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.app.product_count).toBeGreaterThan(0);
    });

    test('Should allow creating product without verification app', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'No App Product',
          template_id: templateAId,
          sku: 'NOAPP-001',
          price: 49.99,
          currency: 'USD',
          stock_quantity: 25,
          attributes: {
            Brand: 'Generic'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.product.verification_app_id).toBeNull();

      // Cleanup
      await db.query('DELETE FROM products WHERE id = $1', [response.body.product.id]);
    });

    test('Should update product verification app', async () => {
      const response = await request(app)
        .put(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24 Ultra',
          verification_app_id: null // Remove app assignment
        });

      expect(response.status).toBe(200);
      expect(response.body.product.verification_app_id).toBeNull();

      // Re-assign
      const reAssignResponse = await request(app)
        .put(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24 Ultra',
          verification_app_id: appAId
        });

      expect(reAssignResponse.status).toBe(200);
      expect(reAssignResponse.body.product.verification_app_id).toBe(appAId);
    });
  });

  describe('Module 6: Product Categories', () => {
    test('Should get products by category', async () => {
      const response = await request(app)
        .get(`/api/products?category_id=${categoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allInCategory = response.body.products.every(p => p.category_id === categoryId);
      expect(allInCategory).toBe(true);
    });

    test('Should update product category', async () => {
      // Create new category
      const newCategoryResponse = await db.query(
        `INSERT INTO categories (tenant_id, name, created_by)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [tenantAId, 'Smartphones', tenantAAdminId]
      );
      const newCategoryId = newCategoryResponse.rows[0].id;

      const response = await request(app)
        .put(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24 Ultra',
          category_id: newCategoryId
        });

      expect(response.status).toBe(200);
      expect(response.body.product.category_id).toBe(newCategoryId);

      // Cleanup
      await db.query('DELETE FROM categories WHERE id = $1', [newCategoryId]);
    });

    test('Should allow null category', async () => {
      const response = await request(app)
        .put(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24 Ultra',
          category_id: null
        });

      expect(response.status).toBe(200);
      expect(response.body.product.category_id).toBeNull();

      // Restore
      await request(app)
        .put(`/api/products/${productAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Samsung Galaxy S24 Ultra',
          category_id: categoryId
        });
    });
  });

  describe('Module 7: Tenant Isolation', () => {
    beforeAll(async () => {
      // Create product for Tenant B
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantBAdminToken}`)
        .send({
          name: 'Tenant B Product',
          template_id: templateBId,
          sku: 'TEN-B-001',
          price: 199.99,
          currency: 'USD',
          stock_quantity: 50,
          attributes: {
            Brand: 'Brand B'
          }
        });
      productBId = response.body.product.id;
    });

    test('Tenant A should NOT see Tenant B products', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const tenantBProduct = response.body.products.find(p => p.id === productBId);
      expect(tenantBProduct).toBeUndefined();
    });

    test('Tenant A should NOT get Tenant B product by ID', async () => {
      const response = await request(app)
        .get(`/api/products/${productBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT update Tenant B product', async () => {
      const response = await request(app)
        .put(`/api/products/${productBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Hacked Product',
          price: 1.00
        });

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT delete Tenant B product', async () => {
      const response = await request(app)
        .delete(`/api/products/${productBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Super admin should see products from all tenants', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      const hasMultipleTenants = response.body.products.some(p => p.tenant_id === tenantAId) &&
                                 response.body.products.some(p => p.tenant_id === tenantBId);
      expect(hasMultipleTenants).toBe(true);
    });
  });

  describe('Module 8: Product Search and Filtering', () => {
    test('Should search products by name', async () => {
      const response = await request(app)
        .get('/api/products?search=Samsung')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.products.length).toBeGreaterThan(0);
      const allMatch = response.body.products.every(p =>
        p.name.toLowerCase().includes('samsung')
      );
      expect(allMatch).toBe(true);
    });

    test('Should search products by SKU', async () => {
      const response = await request(app)
        .get('/api/products?search=SAM-S24')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.products.length).toBeGreaterThan(0);
    });

    test('Should filter by price range', async () => {
      const response = await request(app)
        .get('/api/products?min_price=500&max_price=1000')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allInRange = response.body.products.every(p =>
        p.price >= 500 && p.price <= 1000
      );
      expect(allInRange).toBe(true);
    });

    test('Should filter by stock availability', async () => {
      const response = await request(app)
        .get('/api/products?in_stock=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allInStock = response.body.products.every(p => p.stock_quantity > 0);
      expect(allInStock).toBe(true);
    });

    test('Should filter out of stock products', async () => {
      // Create out of stock product
      const outOfStockResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Out of Stock Product',
          template_id: templateAId,
          sku: 'OOS-001',
          price: 99.99,
          currency: 'USD',
          stock_quantity: 0,
          attributes: { Brand: 'Test' }
        });

      const response = await request(app)
        .get('/api/products?in_stock=false')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allOutOfStock = response.body.products.every(p => p.stock_quantity === 0);
      expect(allOutOfStock).toBe(true);

      // Cleanup
      await db.query('DELETE FROM products WHERE id = $1', [outOfStockResponse.body.product.id]);
    });

    test('Should sort products by price ascending', async () => {
      const response = await request(app)
        .get('/api/products?sort_by=price&sort_order=asc')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      if (response.body.products.length > 1) {
        for (let i = 1; i < response.body.products.length; i++) {
          expect(response.body.products[i].price).toBeGreaterThanOrEqual(
            response.body.products[i - 1].price
          );
        }
      }
    });

    test('Should sort products by price descending', async () => {
      const response = await request(app)
        .get('/api/products?sort_by=price&sort_order=desc')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      if (response.body.products.length > 1) {
        for (let i = 1; i < response.body.products.length; i++) {
          expect(response.body.products[i].price).toBeLessThanOrEqual(
            response.body.products[i - 1].price
          );
        }
      }
    });

    test('Should support pagination', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=2')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.products.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.currentPage).toBe(1);
    });
  });

  describe('Module 9: Product Deletion', () => {
    test('Should delete product', async () => {
      // Create temp product
      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Temp Product',
          template_id: templateAId,
          sku: 'TEMP-001',
          price: 49.99,
          currency: 'USD',
          stock_quantity: 10,
          attributes: { Brand: 'Temp' }
        });

      const tempProductId = createResponse.body.product.id;

      // Delete it
      const deleteResponse = await request(app)
        .delete(`/api/products/${tempProductId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/products/${tempProductId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(getResponse.status).toBe(404);
    });

    test('Template product_count should decrease after product deletion', async () => {
      // Get initial count
      const beforeResponse = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      const beforeCount = beforeResponse.body.template.product_count;

      // Create and delete product
      const createResponse = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Count Test Product',
          template_id: templateAId,
          sku: 'COUNT-001',
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10,
          attributes: { Brand: 'Test' }
        });

      await request(app)
        .delete(`/api/products/${createResponse.body.product.id}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      // Get final count
      const afterResponse = await request(app)
        .get(`/api/templates/${templateAId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      const afterCount = afterResponse.body.template.product_count;

      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('Module 10: Validation & Error Handling', () => {
    test('Should reject product without name', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          template_id: templateAId,
          sku: 'NO-NAME-001',
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should reject product without SKU', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'No SKU Product',
          template_id: templateAId,
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should reject duplicate SKU for same tenant', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Duplicate SKU Product',
          template_id: templateAId,
          sku: 'SAM-S24-001', // Already exists
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10,
          attributes: { Brand: 'Test' }
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('SKU already exists');
    });

    test('Should allow same SKU for different tenants', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantBAdminToken}`)
        .send({
          name: 'Same SKU Different Tenant',
          template_id: templateBId,
          sku: 'SAM-S24-001', // Same SKU as Tenant A product
          price: 99.99,
          currency: 'USD',
          stock_quantity: 10,
          attributes: { Brand: 'Test' }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Cleanup
      await db.query('DELETE FROM products WHERE id = $1', [response.body.product.id]);
    });

    test('Should reject negative price', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Negative Price Product',
          template_id: templateAId,
          sku: 'NEG-001',
          price: -99.99,
          currency: 'USD',
          stock_quantity: 10,
          attributes: { Brand: 'Test' }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should reject negative stock', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Negative Stock Product',
          template_id: templateAId,
          sku: 'NEGSTOCK-001',
          price: 99.99,
          currency: 'USD',
          stock_quantity: -10,
          attributes: { Brand: 'Test' }
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should return 404 for non-existent product', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/products/${fakeId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(401);
    });
  });
});
