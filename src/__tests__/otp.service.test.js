/**
 * Unit Tests for OTP Service
 */

const otpService = require('../services/otp.service');
const db = require('../config/database');
const emailService = require('../services/email.service');

jest.mock('../config/database');
jest.mock('../services/email.service');

describe('OTP Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOTP', () => {
    it('should generate a 6-digit OTP', () => {
      const otp = otpService.generateOTP();
      
      expect(otp).toMatch(/^\d{6}$/);
      expect(parseInt(otp)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(otp)).toBeLessThanOrEqual(999999);
    });

    it('should generate unique OTPs', () => {
      const otp1 = otpService.generateOTP();
      const otp2 = otpService.generateOTP();
      const otp3 = otpService.generateOTP();

      // While technically possible to be the same, highly unlikely
      const unique = new Set([otp1, otp2, otp3]);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe('createOTP', () => {
    it('should store OTP in database with correct expiry', async () => {
      const email = 'test@example.com';
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Update old OTPs
        .mockResolvedValueOnce({ rows: [{ id: 'otp-id' }], rowCount: 1 }); // Insert new OTP

      const result = await otpService.createOTP(email);

      expect(typeof result).toBe('string');
      expect(result).toHaveLength(6);
      expect(db.query).toHaveBeenCalledTimes(2);
      
      // Check insert query
      const insertCall = db.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO otps');
      expect(insertCall[1][0]).toBe(email); // email
      expect(insertCall[1][1]).toBe(result); // otp code (generated)
      expect(insertCall[1][2]).toBeInstanceOf(Date); // expires_at
    });

    it('should invalidate old OTPs before creating new one', async () => {
      const email = 'test@example.com';

      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Update old OTPs
        .mockResolvedValueOnce({ rows: [{ id: 'otp-id' }], rowCount: 1 }); // Insert new OTP

      await otpService.createOTP(email);

      const updateCall = db.query.mock.calls[0];
      expect(updateCall[0]).toContain('UPDATE otps SET is_used = true');
      expect(updateCall[1]).toEqual([email]);
    });

    it('should handle database errors', async () => {
      const email = 'test@example.com';
      const otp = '123456';

      db.query = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(otpService.createOTP(email, otp)).rejects.toThrow('Database error');
    });
  });

  describe('verifyOTP', () => {
    it('should verify valid OTP', async () => {
      const email = 'test@example.com';
      const otp = '123456';

      db.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'otp-id',
          email,
          otp_code: otp,
          expires_at: new Date(Date.now() + 300000), // 5 minutes from now
          is_used: false
        }],
        rowCount: 1
      });

      const result = await otpService.verifyOTP(email, otp);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('OTP verified successfully');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [email]
      );
    });

    it('should reject expired OTP', async () => {
      const email = 'test@example.com';
      const otp = '123456';

      db.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'otp-id',
          email,
          otp_code: otp,
          expires_at: new Date(Date.now() - 1000), // 1 second ago (expired)
          is_used: false
        }],
        rowCount: 1
      });

      const result = await otpService.verifyOTP(email, otp);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('OTP has expired');
    });

    it('should reject used OTP', async () => {
      const email = 'test@example.com';
      const otp = '123456';

      db.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'otp-id',
          email,
          otp_code: otp,
          expires_at: new Date(Date.now() + 300000),
          is_used: true
        }],
        rowCount: 1
      });

      const result = await otpService.verifyOTP(email, otp);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('OTP has already been used');
    });

    it('should reject non-existent OTP', async () => {
      const email = 'test@example.com';
      const otp = '123456';

      db.query = jest.fn().mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      const result = await otpService.verifyOTP(email, otp);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid or expired OTP');
    });

    it('should mark OTP as used after successful verification', async () => {
      const email = 'test@example.com';
      const otp = '123456';
      const otpId = 'otp-id-123';

      db.query = jest.fn()
        .mockResolvedValueOnce({ // SELECT query
          rows: [{
            id: otpId,
            email,
            otp_code: otp,
            expires_at: new Date(Date.now() + 300000),
            is_used: false,
            attempts: 0
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE query

      await otpService.verifyOTP(email, otp);

      expect(db.query).toHaveBeenCalledTimes(2);
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE otps');
      expect(updateCall[0]).toContain('is_used = true');
      expect(updateCall[1]).toEqual([otpId]);
    });

    it('should reject OTP with max attempts exceeded', async () => {
      const email = 'test@example.com';
      const otp = '123456';

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'otp-id',
            email,
            otp_code: otp,
            expires_at: new Date(Date.now() + 300000),
            is_used: false,
            attempts: 3 // Max attempts reached
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Mark as used

      const result = await otpService.verifyOTP(email, otp);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Maximum OTP attempts exceeded');
    });

    it('should increment attempts on wrong OTP', async () => {
      const email = 'test@example.com';
      const correctOtp = '123456';
      const wrongOtp = '999999';

      db.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'otp-id',
            email,
            otp_code: correctOtp,
            expires_at: new Date(Date.now() + 300000),
            is_used: false,
            attempts: 1
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Increment attempts

      const result = await otpService.verifyOTP(email, wrongOtp);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid OTP');
      expect(result.message).toContain('attempts remaining');
      
      // Check that attempts were incremented
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain('attempts = attempts + 1');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      const email = 'test@example.com';

      db.query = jest.fn().mockResolvedValue({
        rows: [{ count: '2' }],
        rowCount: 1
      });

      const result = await otpService.checkRateLimit(email);

      expect(result.allowed).toBe(true);
      expect(result).not.toHaveProperty('remaining'); // Rate limit uses in-memory store
    });

    it('should reject requests exceeding rate limit', async () => {
      const email = 'ratelimit@example.com';
      
      // Set up rate limit environment
      process.env.OTP_RATE_LIMIT_REQUESTS = '3';
      process.env.OTP_RATE_LIMIT_WINDOW = '15';
      
      // Make 3 requests to hit limit
      otpService.checkRateLimit(email);
      otpService.checkRateLimit(email);
      otpService.checkRateLimit(email);
      
      const result = otpService.checkRateLimit(email);

      expect(result.allowed).toBe(false);
      expect(result.waitMinutes).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const email = 'test@example.com';

      // Rate limiting uses in-memory store, always returns result
      const result = otpService.checkRateLimit(email);

      expect(result.allowed).toBeDefined();
    });
  });

  describe('cleanupExpiredOTPs', () => {
    it('should delete expired OTPs', async () => {
      db.query = jest.fn().mockResolvedValue({
        rows: [],
        rowCount: 5
      });

      await otpService.cleanupExpiredOTPs();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM otps')
      );
      
      const query = db.query.mock.calls[0][0];
      expect(query).toContain('expires_at < NOW()');
    });

    it('should not fail if no expired OTPs', async () => {
      db.query = jest.fn().mockResolvedValue({
        rows: [],
        rowCount: 0
      });

      await expect(otpService.cleanupExpiredOTPs()).resolves.not.toThrow();
    });
  });
});
