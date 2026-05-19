/**
 * Unit Tests for OTP Service
 */

const otpService = require('../otp.service');
const db = require('../../config/database');

// Mock database
jest.mock('../../config/database', () => ({
  query: jest.fn()
}));

describe('OTP Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOTP', () => {
    it('should generate a 6-digit OTP', () => {
      const otp = otpService.generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first OTP request', () => {
      const result = otpService.checkRateLimit('test@example.com');
      expect(result.allowed).toBe(true);
    });
  });

  describe('createOTP', () => {
    it('should create OTP successfully', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const otp = await otpService.createOTP('test@example.com');
      expect(otp).toMatch(/^\d{6}$/);
    });
  });

  describe('verifyOTP', () => {
    it('should verify valid OTP', async () => {
      const mockOTP = {
        id: '1',
        otp_code: '123456',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
        is_used: false
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockOTP] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await otpService.verifyOTP('test@example.com', '123456');
      expect(result.valid).toBe(true);
    });
  });
});
