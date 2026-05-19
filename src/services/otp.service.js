/**
 * OTP Service
 */
const db = require('../config/database');
const crypto = require('crypto');

// In-memory rate limiting store (in production, use Redis)
const rateLimitStore = new Map();

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Check rate limit for email
 */
const checkRateLimit = (email) => {
  const key = `otp_${email}`;
  const now = Date.now();
  const windowMs = parseInt(process.env.OTP_RATE_LIMIT_WINDOW) * 60 * 1000; // 15 minutes
  const maxRequests = parseInt(process.env.OTP_RATE_LIMIT_REQUESTS); // 3 requests

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }

  const requests = rateLimitStore.get(key);
  // Remove old requests outside the window
  const recentRequests = requests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    const oldestRequest = Math.min(...recentRequests);
    const waitTime = Math.ceil((windowMs - (now - oldestRequest)) / 1000 / 60);
    return {
      allowed: false,
      waitMinutes: waitTime
    };
  }

  recentRequests.push(now);
  rateLimitStore.set(key, recentRequests);

  return { allowed: true };
};

/**
 * Create and store OTP
 */
const createOTP = async (email) => {
  const otp = generateOTP();
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Invalidate any existing OTPs for this email
  await db.query(
    'UPDATE otps SET is_used = true WHERE email = $1 AND is_used = false',
    [email]
  );

  // Insert new OTP
  await db.query(
    `INSERT INTO otps (email, otp_code, expires_at, attempts, is_used)
     VALUES ($1, $2, $3, 0, false)`,
    [email, otp, expiresAt]
  );

  return otp;
};

/**
 * Verify OTP
 */
const verifyOTP = async (email, otpCode) => {
  // Get OTP
  const result = await db.query(
    `SELECT id, otp_code, expires_at, attempts, is_used
     FROM otps
     WHERE email = $1 AND is_used = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    return { valid: false, message: 'Invalid or expired OTP' };
  }

  const otp = result.rows[0];

  // Check if already used
  if (otp.is_used) {
    return { valid: false, message: 'OTP has already been used' };
  }

  // Check if expired
  if (new Date() > new Date(otp.expires_at)) {
    await db.query('UPDATE otps SET is_used = true WHERE id = $1', [otp.id]);
    return { valid: false, message: 'OTP has expired' };
  }

  // Check attempts
  const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS) || 3;
  if (otp.attempts >= maxAttempts) {
    await db.query('UPDATE otps SET is_used = true WHERE id = $1', [otp.id]);
    return { valid: false, message: 'Maximum OTP attempts exceeded' };
  }

  // Verify OTP code
  if (otp.otp_code !== otpCode) {
    // Increment attempts
    await db.query(
      'UPDATE otps SET attempts = attempts + 1 WHERE id = $1',
      [otp.id]
    );
    return { 
      valid: false, 
      message: `Invalid OTP. ${maxAttempts - otp.attempts - 1} attempts remaining` 
    };
  }

  // OTP is valid - mark as used
  await db.query('UPDATE otps SET is_used = true WHERE id = $1', [otp.id]);

  return { valid: true, message: 'OTP verified successfully' };
};

/**
 * Clean up expired OTPs (run periodically)
 */
const cleanupExpiredOTPs = async () => {
  await db.query(
    'DELETE FROM otps WHERE expires_at < NOW() - INTERVAL \'1 day\''
  );
};

module.exports = {
  generateOTP,
  checkRateLimit,
  createOTP,
  verifyOTP,
  cleanupExpiredOTPs
};
