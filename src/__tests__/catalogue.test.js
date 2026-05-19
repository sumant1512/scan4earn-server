const request = require('supertest');
const app = require('../server');
const pool = require('../config/database');

describe('Catalogue Management API', () => {
  let accessToken;
  let tenantId;
  let verificationAppId;
  let categoryId;
  let productId;

  beforeAll(async () => {
    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (company_name, contact_email, subdomain_slug, status)
       VALUES ('Test Catalogue Co', 'catalogue@test.com', 'catalogue-test', 'active')
       RETURNING id`
    );
    tenantId = tenantResult.rows[0].id;

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, tenant_id, role)
       VALUES ('admin@catalogue.com', $1, 'tenant_admin')
       RETURNING id`,
      [tenantId]
    );

    // Create verification app
    const appResult = await pool.query(
      `INSERT INTO verification_apps (tenant_id, app_name, code, api_key, is_active)
       VALUES ($1, 'Test App', 'test-app', 'test-api-key', true)
       RETURNING verification_app_id`,
      [tenantId]
    );
    verificationAppId = appResult.rows[0].verification_app_id;

    // Generate access token (simplified - in real scenario, go through auth flow)
    const jwt = require('jsonwebtoken');
    accessToken = jwt.sign(
      { 
        userId: userResult.rows[0].id, 
        tenantId: tenantId,
        role: 'tenant_admin' 
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM products WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM catalogue_categories WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM verification_apps WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await pool.end();
  });

  describe('Categories API', () => {
    describe('POST /api/categories', () => {
      it('should create a new category', async () => {
        const response = await request(app)
          .post('/api/categories')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Electronics',
            icon: 'phone_iphone',
            description: 'Electronic devices and accessories',
            verification_app_id: verificationAppId
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('Electronics');
        expect(response.body.data.icon).toBe('phone_iphone');

        categoryId = response.body.data.id;
      });

      it('should reject duplicate category name within same app', async () => {
        const response = await request(app)
          .post('/api/categories')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Electronics',
            icon: 'phone_iphone',
            verification_app_id: verificationAppId
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('already exists');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .post('/api/categories')
          .send({
            name: 'Test Category',
            verification_app_id: verificationAppId
          })
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/categories', () => {
      it('should get all categories for tenant', async () => {
        const response = await request(app)
          .get('/api/categories')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.categories)).toBe(true);
        expect(response.body.categories.length).toBeGreaterThan(0);
        expect(response.body.categories[0]).toHaveProperty('name');
        expect(response.body.categories[0]).toHaveProperty('app_name');
      });

      it('should filter by app_id', async () => {
        const response = await request(app)
          .get(`/api/categories?app_id=${verificationAppId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.categories.every(
          c => c.verification_app_id === verificationAppId
        )).toBe(true);
      });

      it('should include product count', async () => {
        const response = await request(app)
          .get('/api/categories')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.categories[0]).toHaveProperty('product_count');
      });
    });

    describe('PUT /api/categories/:id', () => {
      it('should update category', async () => {
        const response = await request(app)
          .put(`/api/categories/${categoryId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Electronics Updated',
            icon: 'devices',
            description: 'Updated description'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Electronics Updated');
        expect(response.body.data.icon).toBe('devices');
      });

      it('should reject update to duplicate name', async () => {
        // Create another category
        await pool.query(
          `INSERT INTO catalogue_categories (tenant_id, verification_app_id, name, icon)
           VALUES ($1, $2, 'Clothing', 'checkroom')`,
          [tenantId, verificationAppId]
        );

        const response = await request(app)
          .put(`/api/categories/${categoryId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Clothing'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('DELETE /api/categories/:id', () => {
      it('should not delete category with products', async () => {
        // Create a product in this category
        const productResult = await pool.query(
          `INSERT INTO products (tenant_id, verification_app_id, category_id, name, sku, points_required, stock_quantity)
           VALUES ($1, $2, $3, 'Test Product', 'TEST-001', 100, 10)
           RETURNING id`,
          [tenantId, verificationAppId, categoryId]
        );
        productId = productResult.rows[0].id;

        const response = await request(app)
          .delete(`/api/categories/${categoryId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('products');
      });

      it('should delete empty category', async () => {
        // Create a new empty category
        const catResult = await pool.query(
          `INSERT INTO catalogue_categories (tenant_id, verification_app_id, name, icon)
           VALUES ($1, $2, 'Empty Category', 'category')
           RETURNING id`,
          [tenantId, verificationAppId]
        );
        const emptyCatId = catResult.rows[0].id;

        const response = await request(app)
          .delete(`/api/categories/${emptyCatId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Products API', () => {
    describe('POST /api/products', () => {
      it('should create a new product', async () => {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'iPhone 15 Pro',
            sku: 'IPH15-PRO-256',
            category_id: categoryId,
            verification_app_id: verificationAppId,
            points_required: 5000,
            stock_quantity: 25,
            description: 'Latest iPhone model'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.name).toBe('iPhone 15 Pro');
        expect(response.body.data.points_required).toBe(5000);
      });

      it('should reject duplicate SKU within same tenant', async () => {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Another Product',
            sku: 'IPH15-PRO-256',
            category_id: categoryId,
            verification_app_id: verificationAppId,
            points_required: 1000,
            stock_quantity: 10
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('already exists');
      });

      it('should require valid category', async () => {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Test Product',
            sku: 'TEST-999',
            category_id: 99999,
            verification_app_id: verificationAppId,
            points_required: 100,
            stock_quantity: 10
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/products', () => {
      it('should get all products for tenant', async () => {
        const response = await request(app)
          .get('/api/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.products)).toBe(true);
        expect(response.body.products.length).toBeGreaterThan(0);
        expect(response.body.products[0]).toHaveProperty('name');
        expect(response.body.products[0]).toHaveProperty('category_name');
      });

      it('should filter by app_id', async () => {
        const response = await request(app)
          .get(`/api/products?app_id=${verificationAppId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.products.every(
          p => p.verification_app_id === verificationAppId
        )).toBe(true);
      });

      it('should filter by category_id', async () => {
        const response = await request(app)
          .get(`/api/products?category_id=${categoryId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.products.every(
          p => p.category_id === categoryId
        )).toBe(true);
      });
    });

    describe('PUT /api/products/:id', () => {
      it('should update product', async () => {
        const response = await request(app)
          .put(`/api/products/${productId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Test Product Updated',
            points_required: 150,
            stock_quantity: 15
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Test Product Updated');
        expect(response.body.data.points_required).toBe(150);
      });

      it('should validate stock quantity is non-negative', async () => {
        const response = await request(app)
          .put(`/api/products/${productId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            stock_quantity: -10
          })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('DELETE /api/products/:id', () => {
      it('should delete product', async () => {
        const response = await request(app)
          .delete(`/api/products/${productId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('deleted successfully');
      });

      it('should return 404 for non-existent product', async () => {
        const response = await request(app)
          .delete('/api/products/99999')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body.success).toBe(false);
      });
    });
  });
});
