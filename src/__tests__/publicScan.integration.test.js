const request = require('supertest');
const express = require('express');
const routes = require('../routes/publicScan.routes');
const db = require('../config/database');

jest.mock('../config/database');

const app = express();
app.use(express.json());
app.use('/scan', routes);

describe('Public Scan Verify OTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject when coupon is not active', async () => {
    db.getClient = jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    });
    const client = await db.getClient();
    // BEGIN
    client.query.mockResolvedValueOnce({});
    // SELECT session + coupon (coupon_status=used)
    client.query.mockResolvedValueOnce({
      rows: [{
        id: 'sess-1', tenant_id: 't1', coupon_code: 'C1', mobile_e164: '+15550001111', otp_code: '123456', status: 'otp-sent',
        coupon_points: 10, coupon_status: 'used', total_usage_limit: 1, current_usage_count: 1
      }]
    });
    // ROLLBACK
    client.query.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/scan/sess-1/verify-otp')
      .send({ otp_code: '123456' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('invalid_or_redeemed_coupon');
  });

  it('should reject when usage limit exceeded', async () => {
    db.getClient = jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    });
    const client = await db.getClient();
    client.query.mockResolvedValueOnce({}); // BEGIN
    client.query.mockResolvedValueOnce({ // SELECT with limit reached
      rows: [{
        id: 'sess-2', tenant_id: 't1', coupon_code: 'C2', mobile_e164: '+15550002222', otp_code: '654321', status: 'otp-sent',
        coupon_points: 20, coupon_status: 'active', total_usage_limit: 1, current_usage_count: 1
      }]
    });
    client.query.mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/scan/sess-2/verify-otp')
      .send({ otp_code: '654321' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('usage_limit_exceeded');
  });

  it('should award points and redeem when valid', async () => {
    db.getClient = jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    });
    const client = await db.getClient();
    client.query.mockResolvedValueOnce({}); // BEGIN
    client.query.mockResolvedValueOnce({ // SELECT with active coupon within limit
      rows: [{
        id: 'sess-3', tenant_id: 't1', coupon_code: 'C3', mobile_e164: '+15550003333', otp_code: '111111', status: 'otp-sent',
        coupon_points: 15, coupon_status: 'active', total_usage_limit: null, current_usage_count: 0
      }]
    });
    client.query.mockResolvedValueOnce({}); // upsert user_points
    client.query.mockResolvedValueOnce({}); // insert transaction
    client.query.mockResolvedValueOnce({}); // update coupon
    client.query.mockResolvedValueOnce({}); // complete session
    client.query.mockResolvedValueOnce({ rows: [{ balance: 15 }] }); // select balance
    client.query.mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/scan/sess-3/verify-otp')
      .send({ otp_code: '111111' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.awarded_points).toBe(15);
    expect(res.body.coupon_status).toBe('redeemed');
  });
});
