/**
 * Credit Calculator Service
 * Calculates credit costs for coupon creation
 */

class CreditCalculatorService {
  /**
   * Calculate credit cost for creating a coupon
   * Simple formula: quantity × discount_value
   * @param {Object} couponParams - Coupon parameters
   * @returns {Object} - Cost breakdown and total
   */
  calculateCouponCreditCost(couponParams) {
    const {
      discount_value,
      is_batch = false,
      batch_quantity = 1
    } = couponParams;

    const quantity = is_batch ? batch_quantity : 1;
    const totalCost = quantity * discount_value;

    const breakdown = {
      base: 0,
      discountMultiplier: 1,
      quantityMultiplier: quantity,
      perCouponCost: discount_value,
      batchMultiplier: is_batch ? batch_quantity : 1
    };

    return {
      total: totalCost,
      breakdown,
      minimumCost: quantity
    };
  }

  /**
   * Calculate refund for unused coupon deactivation (if implementing refunds)
   * @param {Object} coupon - Coupon details
   * @returns {number} - Refund amount
   */
  calculateRefund(coupon) {
    // No refund policy - return 0
    // Could implement partial refunds based on usage
    const usagePercentage = coupon.total_usage_limit 
      ? coupon.current_usage_count / coupon.total_usage_limit 
      : 1;
    
    // Example: 50% refund if less than 10% used (currently disabled)
    // if (usagePercentage < 0.1) {
    //   return Math.floor(coupon.credit_cost * 0.5);
    // }
    
    return 0; // No refunds
  }

  /**
   * Calculate additional cost for extending coupon
   * @param {Object} currentCoupon - Current coupon details
   * @param {Date} newExpiryDate - New expiry date
   * @returns {number} - Additional credits needed
   */
  calculateExtensionCost(currentCoupon, newExpiryDate) {
    const currentExpiry = new Date(currentCoupon.expiry_date);
    const newExpiry = new Date(newExpiryDate);
    
    const additionalDays = Math.ceil((newExpiry - currentExpiry) / (1000 * 60 * 60 * 24));
    
    if (additionalDays <= 0) {
      return 0; // No cost for shorter period
    }

    // Cost = 10% of original cost per 30 days extension
    const costPerMonth = Math.ceil(currentCoupon.credit_cost * 0.1);
    const monthsExtension = Math.ceil(additionalDays / 30);
    
    return costPerMonth * monthsExtension;
  }

  /**
   * Calculate additional cost for increasing usage limit
   * @param {Object} currentCoupon - Current coupon details
   * @param {number} newLimit - New usage limit
   * @returns {number} - Additional credits needed
   */
  calculateLimitIncreaseCost(currentCoupon, newLimit) {
    const currentLimit = currentCoupon.total_usage_limit || 0;
    const increase = newLimit - currentLimit;
    
    if (increase <= 0) {
      return 0;
    }

    // Calculate cost per use based on original coupon
    const costPerUse = currentLimit > 0 
      ? currentCoupon.credit_cost / currentLimit 
      : 1;
    
    return Math.ceil(costPerUse * increase);
  }
}

module.exports = new CreditCalculatorService();
