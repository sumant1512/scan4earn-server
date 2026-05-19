/**
 * Unit Tests for Email Service
 */

const emailService = require('../services/email.service');
const nodemailer = require('nodemailer');

// Mock nodemailer
jest.mock('nodemailer');

describe('Email Service', () => {
  let mockTransport;
  let mockSendMail;
  let consoleLogSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Spy on console.log to capture dev mode output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    
    mockSendMail = jest.fn().mockResolvedValue({
      messageId: 'test-message-id',
      accepted: ['test@example.com'],
      rejected: []
    });

    mockTransport = {
      sendMail: mockSendMail,
      verify: jest.fn((callback) => callback(null, true))
    };

    nodemailer.createTransport.mockReturnValue(mockTransport);
  });
  
  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('sendOTPEmail', () => {
    const testEmail = 'test@example.com';
    const testOTP = '123456';

    it('should log OTP to console in dev mode (no transporter)', async () => {
      const result = await emailService.sendOTPEmail(testEmail, testOTP);

      // In dev mode without transporter, it logs to console
      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(testEmail)
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    const testEmail = 'newuser@example.com';
    const testName = 'John Doe';

    it('should log welcome message in dev mode (no transporter)', async () => {
      const result = await emailService.sendWelcomeEmail(testEmail, testName);

      // In dev mode without transporter, it logs to console
      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(testEmail)
      );
    });
  });
});
