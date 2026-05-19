/**
 * Ecommerce Mobile Controller
 * Customer mobile app endpoints for product catalog and profile
 */

const ecommerceService = require('../services/ecommerce.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const { validateUUID, validatePagination, validateEmail } = require('../modules/common/validators/common.validator');
const { sendSuccess, sendPaginated } = require('../modules/common/utils/response.util');

/**
 * Browse products
 */
exports.listProducts = asyncHandler(async (req, res) => {
  const { tenant_id } = req.user;
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const { search, category, sort } = req.query;

  const { products, total } = await ecommerceService.listProducts(tenant_id, { page, limit, search, category, sort });
  return sendPaginated(res, products, page, limit, total, 'products');
});

/**
 * Get product details
 */
exports.getProduct = asyncHandler(async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  validateUUID(id, 'productId');

  const product = await ecommerceService.getProductById(tenant_id, id);
  return sendSuccess(res, product);
});

/**
 * Get customer profile
 */
exports.getProfile = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;
  const profile = await ecommerceService.getProfile(id, tenant_id);
  return sendSuccess(res, profile);
});

/**
 * Update customer profile
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const { id, tenant_id } = req.user;

  if (req.body.email) {
    validateEmail(req.body.email);
  }

  const result = await ecommerceService.updateProfile(id, tenant_id, req.body);
  return sendSuccess(res, result, 'Profile updated successfully');
});
