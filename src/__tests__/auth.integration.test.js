/**
 * Integration Tests for Authentication API
 */

const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth.routes');
const db = require('../config/database');

// Mock database and services
jest.mock('../config/database');
jest.mock('../services/email.service');
jest.mock('../services/otp.service');
jest.mock('../services/token.service');

// Mock authentication middleware  
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => {
    // Extract token from Authorization header if exists
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded;
      } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    } else {
      req.user = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        role: 'TENANT_ADMIN',
        jti: 'test-jti'
      };
    }
    next();
  }
}));

const otpService = require('../services/otp.service');
const tokenService = require('../services/token.service');
const emailService = require('../services/email.service');

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

// Add error handler
app.use((err, req, res, next) => {
  res.status(500).json({
    error: err.message
  });
});

describe('Authentication API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/request-otp', () => {
    it('should request OTP for valid email', async () => {
      // Mock database query to find user
      db.query = jest.fn().mockResolvedValue({
        rows: [{ id: 'user-id', is_active: true }],
        rowCount: 1
      });

      // Mock rate limit check
      otpService.checkRateLimit = jest.fn().mockReturnValue({
        allowed: true
      });

      // Mock OTP creation (returns the OTP string)
      otpService.createOTP = jest.fn().mockResolvedValue('123456');

      const response = await request(app)
        .post('/auth/request-otp')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('OTP sent');
    });

    it('should return success even for non-existent user (security)', async () => {
      db.query = jest.fn().mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      const response = await request(app)
        .post('/auth/request-otp')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('If the email exists');
    });

    it('should reject inactive user', async () => {
      db.query = jest.fn().mockResolvedValue({
        rows: [{ id: 'user-id', is_active: false }],
        rowCount: 1
      });

      const response = await request(app)
        .post('/auth/request-otp')
        .send({ email: 'inactive@example.com' })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('deactivated');
    });

    it('should handle email sending failure', async () => {
      db.query = jest.fn().mockResolvedValue({
        rows: [{ id: 'user-id', is_active: true }],
        rowCount: 1
      });

      otpService.checkRateLimit = jest.fn().mockReturnValue({
        allowed: true
      });

      otpService.createOTP = jest.fn().mockResolvedValue('123456');
      emailService.sendOTPEmail = jest.fn().mockRejectedValue(new Error('Email service down'));

      const response = await request(app)
        .post('/auth/request-otp')
        .send({ email: 'test@example.com' })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('Failed to send OTP');
    });

    it('should handle database errors in request OTP', async () => {
      db.query = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/auth/request-otp')
        .send({ email: 'test@example.com' })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without email', async () => {
      const response = await request(app)
        .post('/auth/request-otp')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/auth/request-otp')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should enforce rate limiting', async () => {
      // Mock database query to find user
      db.query = jest.fn().mockResolvedValue({
        rows: [{ id: 'user-id', is_active: true }],
        rowCount: 1
      });

      otpService.checkRateLimit = jest.fn().mockReturnValue({
        allowed: false,
        remaining: 0
      });

      const response = await request(app)
        .post('/auth/request-otp')
        .send({ email: 'test@example.com' })
        .expect(429);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('Too many');
    });
  });

  describe('POST /auth/verify-otp', () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      full_name: 'Test User',
      role: 'TENANT_ADMIN',
      tenant_id: '223e4567-e89b-12d3-a456-426614174000'
    };

    it('should verify valid OTP and return tokens', async () => {
      // Mock OTP verification (returns object)
      otpService.verifyOTP = jest.fn().mockResolvedValue({
        valid: true,
        message: 'OTP verified successfully'
      });

      // Mock user lookup
      db.query = jest.fn().mockResolvedValue({
        rows: [mockUser],
        rowCount: 1
      });

      // Mock token generation
      tokenService.generateTokens = jest.fn().mockReturnValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token'
      });

      const response = await request(app)
        .post('/auth/verify-otp')
        .send({
          email: 'test@example.com',
          otp: '123456'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('userType', 'TENANT_ADMIN');
    });

    it('should reject invalid OTP', async () => {
      otpService.verifyOTP = jest.fn().mockResolvedValue({
        valid: false,
        message: 'Invalid or expired OTP'
      });

      const response = await request(app)
        .post('/auth/verify-otp')
        .send({
          email: 'test@example.com',
          otp: '000000'
        })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('Invalid or expired OTP');
    });

    it('should reject non-existent user', async () => {
      otpService.verifyOTP = jest.fn().mockResolvedValue({
        valid: true,
        message: 'OTP verified successfully'
      });
      db.query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .post('/auth/verify-otp')
        .send({
          email: 'nonexistent@example.com',
          otp: '123456'
        })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('User not found');
    });

    it('should require both email and OTP', async () => {
      const response1 = await request(app)
        .post('/auth/verify-otp')
        .send({ email: 'test@example.com' })
        .expect(400);

      const response2 = await request(app)
        .post('/auth/verify-otp')
        .send({ otp: '123456' })
        .expect(400);

      expect(response1.body.success).toBe(false);
      expect(response2.body.success).toBe(false);
    });

    it('should handle database errors in verifyOTP', async () => {
      otpService.verifyOTP = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/auth/verify-otp')
        .send({
          email: 'test@example.com',
          otp: '123456'
        })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /auth/refresh', () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      role: 'TENANT_ADMIN',
      tenant_id: '223e4567-e89b-12d3-a456-426614174000'
    };

    it('should refresh tokens with valid refresh token', async () => {
      // Mock token verification
      tokenService.verifyRefreshToken = jest.fn().mockResolvedValue({
        userId: mockUser.id,
        jti: 'old-jti'
      });

      // Mock user lookup
      db.query = jest.fn().mockResolvedValue({
        rows: [mockUser],
        rowCount: 1
      });

      // Mock new token generation
      tokenService.generateTokens = jest.fn().mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      });

      // Mock blacklisting old token
      tokenService.blacklistTokens = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'old-refresh-token' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('accessToken', 'new-access-token');
      expect(response.body.data).toHaveProperty('refreshToken', 'new-refresh-token');
    });

    it('should reject invalid refresh token', async () => {
      tokenService.verifyRefreshToken = jest.fn().mockRejectedValue(
        new Error('Invalid token')
      );

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should require refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /auth/logout', () => {
    beforeEach(() => {
      // Setup JWT secrets for logout test
      process.env.JWT_ACCESS_SECRET = 'test-access-secret';
      process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    });

    it('should logout and blacklist tokens', async () => {
      const jwt = require('jsonwebtoken');
      const mockToken = jwt.sign(
        { userId: 'user-id', role: 'TENANT_ADMIN', jti: 'mock-jti' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '30m' }
      );

      // Mock verifyRefreshToken for logout
      tokenService.verifyRefreshToken = jest.fn().mockResolvedValue({
        userId: 'user-id',
        jti: 'refresh-jti'
      });

      tokenService.blacklistTokens = jest.fn().mockResolvedValue(true);
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Not blacklisted
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Audit log

      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ refreshToken: 'mock-refresh-token' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('Logged out successfully');
    });

    it('should require refresh token', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('required');
    });
  });

  describe('GET /auth/context', () => {
    it('should return user context for authenticated user', async () => {
      const mockUserData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'TENANT_ADMIN',
        phone: '+1234567890',
        tenant_id: '223e4567-e89b-12d3-a456-426614174000',
        tenant_name: 'Test Company',
        tenant_email: 'contact@testcompany.com'
      };

      db.query = jest.fn().mockResolvedValue({
        rows: [mockUserData],
        rowCount: 1
      });

      const response = await request(app)
        .get('/auth/context')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('email', mockUserData.email);
      expect(response.body.data).toHaveProperty('role', mockUserData.role);
      expect(response.body.data).toHaveProperty('permissions');
      expect(response.body.data.tenant).toHaveProperty('companyName', mockUserData.tenant_name);
    });

    it('should return context without tenant for super admin', async () => {
      const mockSuperAdmin = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'admin@system.com',
        full_name: 'Super Admin',
        role: 'SUPER_ADMIN',
        phone: '+1234567890',
        tenant_id: null,
        tenant_name: null,
        tenant_email: null
      };

      db.query = jest.fn().mockResolvedValue({
        rows: [mockSuperAdmin],
        rowCount: 1
      });

      const response = await request(app)
        .get('/auth/context')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('role', 'SUPER_ADMIN');
      expect(response.body.data.tenant).toBeUndefined();
      expect(response.body.data.permissions).toContain('view_all_tenants');
    });

    it('should handle user not found', async () => {
      db.query = jest.fn().mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      const response = await request(app)
        .get('/auth/context')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('User not found');
    });

    it('should handle database errors in getUserContext', async () => {
      db.query = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/auth/context')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /auth/refresh - error handling', () => {
    it('should handle database errors during token refresh', async () => {
      tokenService.verifyRefreshToken = jest.fn().mockResolvedValue({
        userId: 'user-id',
        jti: 'old-jti'
      });

      // This will cause an error when trying to blacklist
      tokenService.blacklistTokens = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-token' })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /auth/logout - error handling', () => {
    it('should handle database errors during logout gracefully', async () => {
      tokenService.verifyRefreshToken = jest.fn().mockResolvedValue({
        userId: 'user-id',
        jti: 'refresh-jti'
      });

      tokenService.blacklistTokens = jest.fn().mockResolvedValue(true);
      db.query = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/auth/logout')
        .send({ refreshToken: 'valid-token' })
        .expect(200);

      // Logout should succeed even if audit log fails
      expect(response.body).toHaveProperty('success', true);
    });
  });
});
