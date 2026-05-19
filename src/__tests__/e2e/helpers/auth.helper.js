/**
 * Authentication Helper
 * Handles all authentication-related operations for E2E tests
 */

const request = require('supertest');
const db = require('../../../config/database');

class AuthHelper {
  constructor(app) {
    this.app = app;
    this.tokenCache = new Map();
  }

  /**
   * Login via OTP flow
   * @param {string} email - User email
   * @param {string|null} subdomain - Tenant subdomain
   * @param {boolean} useCache - Whether to use cached token
   * @returns {Promise<string>} Access token
   */
  async loginViaOTP(email, subdomain = null, useCache = false) {
    const cacheKey = `${email}-${subdomain}`;

    // Return cached token if available and requested
    if (useCache && this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey);
    }

    try {
      // Request OTP
      const otpResponse = await request(this.app)
        .post('/api/auth/request-otp')
        .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
        .send({ identifier: email });

      if (otpResponse.status !== 200) {
        throw new Error(`OTP request failed: ${otpResponse.status} - ${JSON.stringify(otpResponse.body)}`);
      }

      // Get OTP from database
      const otpQuery = await db.query(
        'SELECT otp_code FROM otp_codes WHERE identifier = $1 AND used = false ORDER BY created_at DESC LIMIT 1',
        [email]
      );

      if (otpQuery.rows.length === 0) {
        throw new Error(`No OTP found for ${email}`);
      }

      const otpCode = otpQuery.rows[0].otp_code;

      // Verify OTP
      const verifyResponse = await request(this.app)
        .post('/api/auth/verify-otp')
        .set('Host', subdomain ? `${subdomain}.localhost:8080` : 'localhost:8080')
        .send({ identifier: email, otp: otpCode });

      if (verifyResponse.status !== 200) {
        throw new Error(`OTP verification failed: ${verifyResponse.status} - ${JSON.stringify(verifyResponse.body)}`);
      }

      const token = verifyResponse.body.accessToken;

      // Cache the token
      this.tokenCache.set(cacheKey, token);

      return token;
    } catch (error) {
      throw new Error(`Login failed for ${email}: ${error.message}`);
    }
  }

  /**
   * Get super admin token
   * @returns {Promise<string>} Super admin access token
   */
  async getSuperAdminToken() {
    const query = await db.query(
      "SELECT email FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1"
    );

    if (query.rows.length === 0) {
      throw new Error('No super admin found in database');
    }

    const superAdminEmail = query.rows[0].email;
    return this.loginViaOTP(superAdminEmail, null, true);
  }

  /**
   * Logout user
   * @param {string} token - Access token
   * @returns {Promise<Object>} Response
   */
  async logout(token) {
    const response = await request(this.app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    return response;
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<string>} New access token
   */
  async refreshToken(refreshToken) {
    const response = await request(this.app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    if (response.status !== 200) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    return response.body.accessToken;
  }

  /**
   * Clear token cache
   */
  clearCache() {
    this.tokenCache.clear();
  }
}

module.exports = AuthHelper;
