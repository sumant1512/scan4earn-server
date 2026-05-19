const request = require('supertest');
const app = require('../server');
const pool = require('../config/database');

describe('Batch Coupon Creation API', () => {
  let accessToken;
  let tenantId;
  let verificationAppId;
  let userId;

  beforeAll(async () => {
    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (company_name, contact_email, subdomain_slug, status)
       VALUES ('Test Batch Co', 'batch@test.com', 'batch-test', 'active')
       RETURNING id`
    );
    tenantId = tenantResult.rows[0].id;

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, tenant_id, role)
       VALUES ('admin@batch.com', $1, 'tenant_admin')
       RETURNING id`,
      [tenantId]
    );
    userId = userResult.rows[0].id;

    // Create verification app
    const appResult = await pool.query(
      `INSERT INTO verification_apps (tenant_id, app_name, code, api_key, is_active)
       VALUES ($1, 'Test Batch App', 'batch-app', 'batch-api-key', true)
       RETURNING verification_app_id`,
      [tenantId]
    );
    verificationAppId = appResult.rows[0].verification_app_id;

    // Create initial credit balance
    await pool.query(
      `INSERT INTO tenant_credit_balance (tenant_id, balance, total_purchased)
       VALUES ($1, 10000, 10000)`,
      [tenantId]
    );

    // Generate access token
    const jwt = require('jsonwebtoken');
    accessToken = jwt.sign(
      { 
        userId: userId, 
        tenantId: tenantId,
        role: 'tenant_admin' 
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM coupons WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenant_credit_balance WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM verification_apps WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await pool.end();
  });

  describe('POST /api/coupons/multi-batch', () => {
    it('should create multiple batches of coupons', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 5,
              discountAmount: 100,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Batch 1 - $100 off',
              couponPoints: 50
            },
            {
              quantity: 3,
              discountAmount: 50,
              expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Batch 2 - $50 off',
              couponPoints: 25
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.coupons).toHaveLength(8); // 5 + 3
      expect(response.body.data.totalCost).toBe(650); // (5 * 100) + (3 * 50)
      expect(response.body.data).toHaveProperty('newBalance');
      
      // Verify batch IDs are assigned
      const batch1Coupons = response.body.data.coupons.filter(
        c => c.discount_value === 100
      );
      const batch2Coupons = response.body.data.coupons.filter(
        c => c.discount_value === 50
      );
      
      expect(batch1Coupons).toHaveLength(5);
      expect(batch2Coupons).toHaveLength(3);
      expect(batch1Coupons.every(c => c.batch_id === batch1Coupons[0].batch_id)).toBe(true);
      expect(batch2Coupons.every(c => c.batch_id === batch2Coupons[0].batch_id)).toBe(true);
    });

    it('should include coupon_points in created coupons', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 2,
              discountAmount: 200,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Points test',
              couponPoints: 75
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.coupons.every(c => c.coupon_points === 75)).toBe(true);
    });

    it('should default coupon_points to discount_value if not provided', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 1,
              discountAmount: 150,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Default points test'
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.coupons[0].coupon_points).toBe(150);
    });

    it('should reject if insufficient credits', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 1000,
              discountAmount: 1000,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Too expensive'
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Insufficient credits');
    });

    it('should require at least one batch', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [],
          verificationAppId: verificationAppId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate batch quantity is positive', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 0,
              discountAmount: 100,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Invalid quantity'
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate expiry date is in the future', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 1,
              discountAmount: 100,
              expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
              description: 'Expired date'
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should create unique coupon codes for each coupon', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 10,
              discountAmount: 50,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Uniqueness test'
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(201);

      const couponCodes = response.body.data.coupons.map(c => c.coupon_code);
      const uniqueCodes = new Set(couponCodes);
      
      expect(uniqueCodes.size).toBe(10);
    });

    it('should deduct credits from balance', async () => {
      // Get current balance
      const balanceBefore = await pool.query(
        'SELECT balance FROM tenant_credit_balance WHERE tenant_id = $1',
        [tenantId]
      );
      const beforeBalance = balanceBefore.rows[0].balance;

      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 2,
              discountAmount: 100,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Credit deduction test'
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(201);

      expect(response.body.data.newBalance).toBe(beforeBalance - 200);

      // Verify in database
      const balanceAfter = await pool.query(
        'SELECT balance FROM tenant_credit_balance WHERE tenant_id = $1',
        [tenantId]
      );
      expect(balanceAfter.rows[0].balance).toBe(beforeBalance - 200);
    });

    it('should create transaction records', async () => {
      const response = await request(app)
        .post('/api/coupons/multi-batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          batches: [
            {
              quantity: 1,
              discountAmount: 50,
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              description: 'Transaction test'
            }
          ],
          verificationAppId: verificationAppId
        })
        .expect(201);

      // Check transaction was created
      const txResult = await pool.query(
        `SELECT * FROM tenant_credit_transactions 
         WHERE tenant_id = $1 AND amount = -50
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
      );

      expect(txResult.rows.length).toBe(1);
      expect(txResult.rows[0].transaction_type).toBe('coupon_creation');
    });
  });

  describe('GET /api/coupons', () => {
    it('should list coupons with batch information', async () => {
      const response = await request(app)
        .get('/api/coupons')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      if (response.body.data.length > 0) {
        expect(response.body.data[0]).toHaveProperty('coupon_code');
        expect(response.body.data[0]).toHaveProperty('batch_id');
        expect(response.body.data[0]).toHaveProperty('coupon_points');
      }
    });

    it('should filter by verification app', async () => {
      const response = await request(app)
        .get(`/api/coupons?verification_app_id=${verificationAppId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(
        c => c.verification_app_id === verificationAppId
      )).toBe(true);
    });
  });
});
