const request = require('supertest');
const express = require('express');
const routes = require('../routes/mobileAuth.routes');
const db = require('../config/database');

jest.mock('../config/database');
jest.mock('../services/token.service');

// Minimal subdomain/tenant injector
const tenantMiddleware = (req, res, next) => {
  req.tenant = { id: 'tenant-123', subdomain_slug: 'acme' };
  next();
};

const app = express();
app.use(express.json());
app.use(tenantMiddleware);
app.use('/mobile/auth', routes);

describe('Mobile Auth Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('request-otp should create mobile OTP', async () => {
    db.query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await request(app)
      .post('/mobile/auth/request-otp')
      .send({ phone_e164: '+15551234567' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(db.query).toHaveBeenCalledTimes(2); // invalidate + insert
  });

  it('verify-otp should upsert customer and return tokens', async () => {
    // Mock otp fetch
    db.getClient = jest.fn().mockResolvedValue({
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'otp-id', otp_code: '123456', expires_at: new Date(Date.now() + 300000), attempts: 0, is_used: false }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // mark used
        .mockResolvedValueOnce({ rows: [{ id: 'cust-1', phone_e164: '+15551234567' }], rowCount: 1 }), // upsert customer
      release: jest.fn()
    });
    const client = await db.getClient();
    client.query.mockResolvedValueOnce({}); // BEGIN
    client.query.mockResolvedValueOnce({ rows: [{ id: 'otp-id', otp_code: '123456', expires_at: new Date(Date.now() + 300000), attempts: 0, is_used: false }] });
    client.query.mockResolvedValueOnce({}); // mark used
    client.query.mockResolvedValueOnce({ rows: [{ id: 'cust-1', phone_e164: '+15551234567' }] });
    client.query.mockResolvedValueOnce({}); // COMMIT

    const tokenService = require('../services/token.service');
    tokenService.generateTokens = jest.fn().mockReturnValue({ accessToken: 'a', refreshToken: 'r' });

    const res = await request(app)
      .post('/mobile/auth/verify-otp')
      .send({ phone_e164: '+15551234567', otp: '123456' })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('verify-otp should reject invalid otp', async () => {
    db.getClient = jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    });
    const client = await db.getClient();
    client.query.mockResolvedValueOnce({}); // BEGIN
    client.query.mockResolvedValueOnce({ rows: [{ id: 'otp-id', otp_code: '123456', expires_at: new Date(Date.now() + 300000), attempts: 0, is_used: false }] });
    client.query.mockResolvedValueOnce({}); // attempts +1
    client.query.mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/mobile/auth/verify-otp')
      .send({ phone_e164: '+15551234567', otp: '000000' })
      .expect(401);
    expect(res.body.success).toBe(false);
  });
});
