/**
 * E2E Tests for Category Management System
 *
 * Covers:
 * - Category CRUD operations
 * - Nested categories (parent-child relationships)
 * - Category hierarchy
 * - Product-category relationships
 * - Category ordering
 * - Tenant isolation
 *
 * Run with: E2E_TESTS_ENABLED=true npm test -- category-e2e.test.js
 */

const request = require('supertest');
const db = require('../config/database');
const app = require('../server');

const testRunner = process.env.E2E_TESTS_ENABLED === 'true' ? describe : describe.skip;

testRunner('Category Management System E2E Tests', () => {
  let superAdminToken;
  let tenantAAdminToken;
  let tenantBAdminToken;
  let tenantAId;
  let tenantBId;
  let tenantAAdminId;
  let tenantBAdminId;
  let rootCategoryId;
  let childCategory1Id;
  let childCategory2Id;
  let grandchildCategoryId;
  let categoryBId;
  let productId;

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

  beforeAll(async () => {
    // Get super admin token
    const superAdminQuery = await db.query(
      "SELECT email FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1"
    );
    const superAdminEmail = superAdminQuery.rows[0].email;
    superAdminToken = await loginViaOTP(superAdminEmail);

    // Create tenants
    const tenantA = await createTenant('Category Test A', 'categorytesta@test.com', 'categorytesta');
    tenantAId = tenantA.id;
    tenantAAdminId = tenantA.admin_user_id;
    tenantAAdminToken = await loginViaOTP('categorytesta@test.com', 'categorytesta');

    const tenantB = await createTenant('Category Test B', 'categorytestb@test.com', 'categorytestb');
    tenantBId = tenantB.id;
    tenantBAdminId = tenantB.admin_user_id;
    tenantBAdminToken = await loginViaOTP('categorytestb@test.com', 'categorytestb');
  });

  afterAll(async () => {
    // Cleanup
    if (productId) {
      await db.query('DELETE FROM products WHERE id = $1', [productId]);
    }
    await db.query('DELETE FROM categories WHERE tenant_id = $1', [tenantAId]);
    await db.query('DELETE FROM categories WHERE tenant_id = $1', [tenantBId]);
    if (tenantAId) {
      await db.query('DELETE FROM users WHERE tenant_id = $1', [tenantAId]);
      await db.query('DELETE FROM tenants WHERE id = $1', [tenantAId]);
    }
    if (tenantBId) {
      await db.query('DELETE FROM users WHERE tenant_id = $1', [tenantBId]);
      await db.query('DELETE FROM tenants WHERE id = $1', [tenantBId]);
    }
  });

  describe('Module 1: Category CRUD', () => {
    test('Should create root category', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Electronics',
          description: 'Electronic devices and accessories',
          display_order: 1,
          is_active: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.category).toBeDefined();
      expect(response.body.category.name).toBe('Electronics');
      expect(response.body.category.parent_id).toBeNull();
      expect(response.body.category.tenant_id).toBe(tenantAId);
      expect(response.body.category.level).toBe(0);

      rootCategoryId = response.body.category.id;
    });

    test('Should get all categories for tenant', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.categories).toBeDefined();
      expect(Array.isArray(response.body.categories)).toBe(true);

      const createdCategory = response.body.categories.find(c => c.id === rootCategoryId);
      expect(createdCategory).toBeDefined();
      expect(createdCategory.name).toBe('Electronics');
    });

    test('Should get category by ID', async () => {
      const response = await request(app)
        .get(`/api/categories/${rootCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.category).toBeDefined();
      expect(response.body.category.id).toBe(rootCategoryId);
      expect(response.body.category.name).toBe('Electronics');
    });

    test('Should update category', async () => {
      const response = await request(app)
        .put(`/api/categories/${rootCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Electronics & Gadgets',
          description: 'Updated description',
          display_order: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.category.name).toBe('Electronics & Gadgets');
      expect(response.body.category.description).toBe('Updated description');
    });

    test('Should delete category without children', async () => {
      // Create temp category to delete
      const createResponse = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Temp Category',
          description: 'Temporary'
        });

      const tempCategoryId = createResponse.body.category.id;

      // Delete it
      const deleteResponse = await request(app)
        .delete(`/api/categories/${tempCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/categories/${tempCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(getResponse.status).toBe(404);
    });
  });

  describe('Module 2: Nested Categories', () => {
    test('Should create child category', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Mobile Phones',
          description: 'Smartphones and mobile devices',
          parent_id: rootCategoryId,
          display_order: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.category.name).toBe('Mobile Phones');
      expect(response.body.category.parent_id).toBe(rootCategoryId);
      expect(response.body.category.level).toBe(1);

      childCategory1Id = response.body.category.id;
    });

    test('Should create another child category', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Laptops',
          description: 'Laptop computers',
          parent_id: rootCategoryId,
          display_order: 2
        });

      expect(response.status).toBe(201);
      expect(response.body.category.parent_id).toBe(rootCategoryId);
      expect(response.body.category.level).toBe(1);

      childCategory2Id = response.body.category.id;
    });

    test('Should create grandchild category', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Android Phones',
          description: 'Android smartphones',
          parent_id: childCategory1Id,
          display_order: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.category.parent_id).toBe(childCategory1Id);
      expect(response.body.category.level).toBe(2);

      grandchildCategoryId = response.body.category.id;
    });

    test('Should get category tree structure', async () => {
      const response = await request(app)
        .get('/api/categories?tree=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.categories).toBeDefined();

      // Find root category in tree
      const rootCategory = response.body.categories.find(c => c.id === rootCategoryId);
      expect(rootCategory).toBeDefined();
      expect(rootCategory.children).toBeDefined();
      expect(rootCategory.children.length).toBeGreaterThan(0);

      // Verify child exists
      const childCategory = rootCategory.children.find(c => c.id === childCategory1Id);
      expect(childCategory).toBeDefined();
      expect(childCategory.children).toBeDefined();
      expect(childCategory.children.length).toBeGreaterThan(0);
    });

    test('Should get all children of a category', async () => {
      const response = await request(app)
        .get(`/api/categories/${rootCategoryId}/children`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.children).toBeDefined();
      expect(response.body.children.length).toBe(2); // Mobile Phones and Laptops

      const childIds = response.body.children.map(c => c.id);
      expect(childIds).toContain(childCategory1Id);
      expect(childIds).toContain(childCategory2Id);
    });

    test('Should get category path (breadcrumb)', async () => {
      const response = await request(app)
        .get(`/api/categories/${grandchildCategoryId}/path`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.path).toBeDefined();
      expect(response.body.path.length).toBe(3);

      // Path should be: Electronics -> Mobile Phones -> Android Phones
      expect(response.body.path[0].id).toBe(rootCategoryId);
      expect(response.body.path[1].id).toBe(childCategory1Id);
      expect(response.body.path[2].id).toBe(grandchildCategoryId);
    });

    test('Should NOT allow creating circular reference', async () => {
      // Try to make root category a child of its own grandchild
      const response = await request(app)
        .put(`/api/categories/${rootCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Electronics & Gadgets',
          parent_id: grandchildCategoryId // This would create a loop
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('circular');
    });

    test('Should NOT delete category with children', async () => {
      const response = await request(app)
        .delete(`/api/categories/${rootCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('has children');
    });

    test('Should move category to different parent', async () => {
      // Move Android Phones from Mobile Phones to Laptops
      const response = await request(app)
        .put(`/api/categories/${grandchildCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Android Phones',
          parent_id: childCategory2Id // Move to Laptops
        });

      expect(response.status).toBe(200);
      expect(response.body.category.parent_id).toBe(childCategory2Id);

      // Verify new path
      const pathResponse = await request(app)
        .get(`/api/categories/${grandchildCategoryId}/path`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(pathResponse.body.path[1].id).toBe(childCategory2Id);

      // Move back
      await request(app)
        .put(`/api/categories/${grandchildCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Android Phones',
          parent_id: childCategory1Id
        });
    });

    test('Should make child category a root category', async () => {
      const response = await request(app)
        .put(`/api/categories/${grandchildCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Android Phones',
          parent_id: null // Remove parent
        });

      expect(response.status).toBe(200);
      expect(response.body.category.parent_id).toBeNull();
      expect(response.body.category.level).toBe(0);

      // Restore
      await request(app)
        .put(`/api/categories/${grandchildCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Android Phones',
          parent_id: childCategory1Id
        });
    });
  });

  describe('Module 3: Category Ordering', () => {
    test('Should respect display_order in category list', async () => {
      const response = await request(app)
        .get(`/api/categories/${rootCategoryId}/children`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);

      // Should be ordered by display_order
      if (response.body.children.length > 1) {
        for (let i = 1; i < response.body.children.length; i++) {
          expect(response.body.children[i].display_order).toBeGreaterThanOrEqual(
            response.body.children[i - 1].display_order
          );
        }
      }
    });

    test('Should update display_order', async () => {
      const response = await request(app)
        .put(`/api/categories/${childCategory1Id}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Mobile Phones',
          display_order: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.category.display_order).toBe(10);

      // Restore
      await request(app)
        .put(`/api/categories/${childCategory1Id}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Mobile Phones',
          display_order: 1
        });
    });

    test('Should reorder categories in batch', async () => {
      const response = await request(app)
        .post('/api/categories/reorder')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          orders: [
            { id: childCategory1Id, display_order: 2 },
            { id: childCategory2Id, display_order: 1 }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify new order
      const getResponse = await request(app)
        .get(`/api/categories/${rootCategoryId}/children`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(getResponse.body.children[0].id).toBe(childCategory2Id);
      expect(getResponse.body.children[1].id).toBe(childCategory1Id);
    });
  });

  describe('Module 4: Category Activation/Deactivation', () => {
    test('Should deactivate category', async () => {
      const response = await request(app)
        .patch(`/api/categories/${childCategory1Id}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.category.is_active).toBe(false);
    });

    test('Deactivated category should not appear in default list', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const deactivatedCategory = response.body.categories.find(c => c.id === childCategory1Id);
      expect(deactivatedCategory).toBeUndefined();
    });

    test('Should show deactivated category when include_inactive=true', async () => {
      const response = await request(app)
        .get('/api/categories?include_inactive=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const deactivatedCategory = response.body.categories.find(c => c.id === childCategory1Id);
      expect(deactivatedCategory).toBeDefined();
      expect(deactivatedCategory.is_active).toBe(false);
    });

    test('Should activate category', async () => {
      const response = await request(app)
        .patch(`/api/categories/${childCategory1Id}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.category.is_active).toBe(true);
    });

    test('Should cascade deactivation to children', async () => {
      // Deactivate parent
      await request(app)
        .patch(`/api/categories/${childCategory1Id}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: false, cascade: true });

      // Check if grandchild is also deactivated
      const response = await request(app)
        .get(`/api/categories/${grandchildCategoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.category.is_active).toBe(false);

      // Restore
      await request(app)
        .patch(`/api/categories/${childCategory1Id}/status`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({ is_active: true, cascade: true });
    });
  });

  describe('Module 5: Product-Category Relationships', () => {
    beforeAll(async () => {
      // Create a product in the category
      const productResponse = await db.query(
        `INSERT INTO products (tenant_id, category_id, name, sku, price, currency, stock_quantity, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [tenantAId, childCategory1Id, 'Test Product', 'CAT-TEST-001', 99.99, 'USD', 10, tenantAAdminId]
      );
      productId = productResponse.rows[0].id;
    });

    test('Should show product_count for category', async () => {
      const response = await request(app)
        .get(`/api/categories/${childCategory1Id}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.category.product_count).toBeGreaterThan(0);
    });

    test('Should NOT delete category with products', async () => {
      const response = await request(app)
        .delete(`/api/categories/${childCategory1Id}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('has products');
    });

    test('Should allow deleting category after removing products', async () => {
      // Remove product from category
      await db.query('DELETE FROM products WHERE id = $1', [productId]);
      productId = null;

      // Create new category to delete
      const createResponse = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Deletable Category'
        });

      const categoryId = createResponse.body.category.id;

      // Should succeed now
      const deleteResponse = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
    });

    test('Should get products by category', async () => {
      // Create product for test
      const productResponse = await db.query(
        `INSERT INTO products (tenant_id, category_id, name, sku, price, currency, stock_quantity, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [tenantAId, childCategory1Id, 'Category Product', 'CAT-PROD-001', 49.99, 'USD', 20, tenantAAdminId]
      );
      productId = productResponse.rows[0].id;

      const response = await request(app)
        .get(`/api/categories/${childCategory1Id}/products`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.products).toBeDefined();
      expect(response.body.products.length).toBeGreaterThan(0);
      const allInCategory = response.body.products.every(p => p.category_id === childCategory1Id);
      expect(allInCategory).toBe(true);
    });
  });

  describe('Module 6: Tenant Isolation', () => {
    beforeAll(async () => {
      // Create category for Tenant B
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantBAdminToken}`)
        .send({
          name: 'Tenant B Category',
          description: 'Category for isolation testing'
        });
      categoryBId = response.body.category.id;
    });

    test('Tenant A should NOT see Tenant B categories', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const tenantBCategory = response.body.categories.find(c => c.id === categoryBId);
      expect(tenantBCategory).toBeUndefined();
    });

    test('Tenant A should NOT get Tenant B category by ID', async () => {
      const response = await request(app)
        .get(`/api/categories/${categoryBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT update Tenant B category', async () => {
      const response = await request(app)
        .put(`/api/categories/${categoryBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Hacked Category'
        });

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT delete Tenant B category', async () => {
      const response = await request(app)
        .delete(`/api/categories/${categoryBId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Tenant A should NOT create child under Tenant B category', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Cross Tenant Child',
          parent_id: categoryBId
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Parent category not found');
    });

    test('Super admin should see categories from all tenants', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      const hasMultipleTenants = response.body.categories.some(c => c.tenant_id === tenantAId) &&
                                 response.body.categories.some(c => c.tenant_id === tenantBId);
      expect(hasMultipleTenants).toBe(true);
    });
  });

  describe('Module 7: Validation & Error Handling', () => {
    test('Should reject category without name', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          description: 'Missing name'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should reject duplicate category names at same level', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Mobile Phones', // Already exists under Electronics
          parent_id: rootCategoryId
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    test('Should allow same category name at different levels', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Mobile Phones', // Same name but at root level
          parent_id: null
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Cleanup
      await db.query('DELETE FROM categories WHERE id = $1', [response.body.category.id]);
    });

    test('Should reject non-existent parent category', async () => {
      const fakeParentId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Invalid Parent Category',
          parent_id: fakeParentId
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Parent category not found');
    });

    test('Should reject negative display_order', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tenantAAdminToken}`)
        .send({
          name: 'Negative Order',
          display_order: -1
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should return 404 for non-existent category', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/categories/${fakeId}`)
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(404);
    });

    test('Should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/categories');

      expect(response.status).toBe(401);
    });
  });

  describe('Module 8: Search and Filtering', () => {
    test('Should search categories by name', async () => {
      const response = await request(app)
        .get('/api/categories?search=Mobile')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.categories.length).toBeGreaterThan(0);
      const allMatch = response.body.categories.every(c =>
        c.name.toLowerCase().includes('mobile')
      );
      expect(allMatch).toBe(true);
    });

    test('Should filter root categories only', async () => {
      const response = await request(app)
        .get('/api/categories?root_only=true')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allRootCategories = response.body.categories.every(c => c.parent_id === null);
      expect(allRootCategories).toBe(true);
    });

    test('Should filter by level', async () => {
      const response = await request(app)
        .get('/api/categories?level=1')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      const allLevel1 = response.body.categories.every(c => c.level === 1);
      expect(allLevel1).toBe(true);
    });

    test('Should support pagination', async () => {
      const response = await request(app)
        .get('/api/categories?page=1&limit=2')
        .set('Authorization', `Bearer ${tenantAAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.categories.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.currentPage).toBe(1);
    });
  });
});
