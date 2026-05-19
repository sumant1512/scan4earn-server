/**
 * Coupon Generator Service
 * Generates unique coupon codes and QR codes
 */

const crypto = require('crypto');

class CouponGeneratorService {
  /**
   * Generate a unique, readable coupon code
   * @param {string} tenantPrefix - Optional tenant prefix
   * @returns {string} - Generated coupon code
   */
  generateCouponCode(tenantPrefix = null) {
    // Character set excluding confusing characters (O, 0, I, l, 1)
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    
    // Generate 8-character random code
    let code = '';
    for (let i = 0; i < 8; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      code += charset[randomIndex];
    }
    
    // Format: XXXX-XXXX or PREFIX-XXXX-XXXX
    const formatted = code.match(/.{1,4}/g).join('-');
    
    if (tenantPrefix) {
      return `${tenantPrefix}-${formatted}`;
    }
    
    return formatted;
  }

  /**
   * Validate coupon code format
   * @param {string} code - Coupon code to validate
   * @returns {boolean} - Valid or not
   */
  validateCouponCodeFormat(code) {
    // Format: XXXX-XXXX or PREFIX-XXXX-XXXX
    const regex = /^([A-Z0-9]+-)?[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return regex.test(code);
  }

  /**
   * Generate batch of unique coupon codes
   * @param {number} count - Number of codes to generate
   * @param {string} tenantPrefix - Optional tenant prefix
   * @returns {string[]} - Array of unique codes
   */
  generateBatchCodes(count, tenantPrefix = null) {
    const codes = new Set();
    
    while (codes.size < count) {
      const code = this.generateCouponCode(tenantPrefix);
      codes.add(code);
    }
    
    return Array.from(codes);
  }

  /**
   * Generate a short, shareable coupon code (for marketing)
   * @param {string} keyword - Optional keyword to include
   * @returns {string} - Short code
   */
  generateShortCode(keyword = null) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    
    if (keyword) {
      // Use first 4 letters of keyword + random chars
      const cleanKeyword = keyword.toUpperCase().replace(/[^A-Z]/g, '');
      code = cleanKeyword.substring(0, 4);
      
      for (let i = code.length; i < 8; i++) {
        code += charset[crypto.randomInt(0, charset.length)];
      }
    } else {
      for (let i = 0; i < 8; i++) {
        code += charset[crypto.randomInt(0, charset.length)];
      }
    }
    
    return code;
  }
}

module.exports = new CouponGeneratorService();
