/**
 * Coupon Code Generator Utility
 */

/**
 * Generate coupon code from serial number
 * Format: CP-XXXXX (e.g., CP-31001)
 */
function generateCouponCode(serialNumber) {
  return `CP-${serialNumber.toString().padStart(6, '0')}`;
}

/**
 * Generate random coupon code
 */
function generateRandomCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = {
  generateCouponCode,
  generateRandomCode
};
