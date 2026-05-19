/**
 * Dealer Controller
 * Tenant Admin endpoints for dealer management
 */

const dealerService = require('../services/dealer.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const { validateRequiredFields, validatePhone, validateEmail, validateUUID, validatePagination } = require('../modules/common/validators/common.validator');
const { sendSuccess, sendCreated, sendPaginated } = require('../modules/common/utils/response.util');
const { UnprocessableError } = require('../modules/common/errors/AppError');

/**
 * Create a new dealer profile for a verification app
 */
exports.createDealer = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  validateUUID(tenantId, 'tenantId');
  validateRequiredFields(req.body, ['verification_app_id', 'full_name', 'phone_e164', 'shop_name', 'address', 'pincode', 'city', 'state']);
  validateUUID(req.body.verification_app_id, 'verification_app_id');
  if (req.body.email) validateEmail(req.body.email);
  validatePhone(req.body.phone_e164);

  const dealer = await dealerService.createDealer(tenantId, req.body);
  return sendCreated(res, dealer, 'Dealer created successfully');
});

/**
 * List dealers with search, pagination, and optional app filter (?app_id=)
 */
exports.listDealers = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  validateUUID(tenantId, 'tenantId');
  const { page, limit } = validatePagination(req.query.page, req.query.limit);
  const { search, app_id } = req.query;

  const { dealers, total } = await dealerService.listDealers(tenantId, { page, limit, search, app_id });
  return sendPaginated(res, dealers, page, limit, total, 'dealers');
});

/**
 * Get single dealer
 */
exports.getDealer = asyncHandler(async (req, res) => {
  const { tenantId, id } = req.params;
  validateUUID(tenantId, 'tenantId');
  validateUUID(id, 'dealerId');

  const dealer = await dealerService.getDealerById(tenantId, id);
  return sendSuccess(res, dealer);
});

/**
 * Update dealer profile fields.
 * verification_app_id is immutable — reject attempts to change it.
 */
exports.updateDealer = asyncHandler(async (req, res) => {
  const { tenantId, id } = req.params;
  validateUUID(tenantId, 'tenantId');
  validateUUID(id, 'dealerId');

  if ('verification_app_id' in req.body) {
    throw new UnprocessableError('verification_app_id cannot be changed after creation');
  }

  const dealer = await dealerService.updateDealer(tenantId, id, req.body);
  return sendSuccess(res, dealer, 'Dealer updated successfully');
});

/**
 * Toggle dealer active status
 */
exports.toggleStatus = asyncHandler(async (req, res) => {
  const { tenantId, id } = req.params;
  validateUUID(tenantId, 'tenantId');
  validateUUID(id, 'dealerId');
  validateRequiredFields(req.body, ['is_active']);

  const dealer = await dealerService.toggleDealerStatus(tenantId, id, req.body.is_active);
  return sendSuccess(res, dealer, `Dealer ${req.body.is_active ? 'activated' : 'deactivated'} successfully`);
});

/**
 * Get dealer points balance
 */
exports.getPoints = asyncHandler(async (req, res) => {
  const { tenantId, id } = req.params;
  validateUUID(tenantId, 'tenantId');
  validateUUID(id, 'dealerId');

  const points = await dealerService.getDealerPoints(tenantId, id);
  return sendSuccess(res, points);
});

/**
 * Get dealer point transactions
 */
exports.getTransactions = asyncHandler(async (req, res) => {
  const { tenantId, id } = req.params;
  validateUUID(tenantId, 'tenantId');
  validateUUID(id, 'dealerId');
  const { page, limit } = validatePagination(req.query.page, req.query.limit);

  const { transactions, total } = await dealerService.getDealerPointTransactions(tenantId, id, { page, limit });
  return sendPaginated(res, transactions, page, limit, total, 'transactions');
});
