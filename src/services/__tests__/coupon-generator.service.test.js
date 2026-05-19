const CouponGenerator = require('../coupon-generator.service');

describe('CouponGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new CouponGenerator();
  });

  describe('generateCouponCode', () => {
    it('should generate a valid 12-character alphanumeric code', () => {
      const code = generator.generateCouponCode();
      expect(code).toHaveLength(12);
      expect(code).toMatch(/^[A-Z0-9]{12}$/);
    });

    it('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 1000; i++) {
        codes.add(generator.generateCouponCode());
      }
      expect(codes.size).toBe(1000);
    });
  });

});
