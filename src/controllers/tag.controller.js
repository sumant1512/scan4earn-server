/**
 * Tag Controller
 * Refactored to use modern error handling and validators
 */

const tagService = require('../services/tag.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ConflictError,
  NotFoundError,
  ValidationError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendCreated
} = require('../modules/common/utils/response.util');

/**
 * Get all tags
 * GET /api/tags
 * Query params:
 *   - app_id: Filter by verification app (optional)
 *   - is_active: Filter by active status (optional)
 *   - search: Search by tag name (optional)
 */
const getAllTags = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { app_id, is_active, search } = req.query;

  const filters = {};

  // Only add app_id filter if it has a value and is not "all"
  if (app_id && app_id !== '' && app_id !== 'all') {
    filters.verification_app_id = app_id;
  }

  // Only add is_active filter if explicitly provided
  if (is_active !== undefined) {
    filters.is_active = is_active === 'true';
  }

  // Only add search filter if it has a value
  if (search) {
    filters.search = search;
  }

  const tags = await tagService.getAllTags(tenantId, filters);

  return sendSuccess(res, tags, null, 200, { count: tags.length });
});

/**
 * Get tag by ID
 * GET /api/tags/:id
 */
const getTagById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const tag = await tagService.getTagById(id, tenantId);

  if (!tag) {
    throw new NotFoundError('Tag');
  }

  return sendSuccess(res, tag);
});

/**
 * Create new tag
 * POST /api/tags
 */
const createTag = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const tagData = req.body;

  // Validation
  validateRequiredFields(tagData, ['verification_app_id', 'name']);

  // Validate that verification_app_id is not "all" or empty
  if (tagData.verification_app_id === 'all' || tagData.verification_app_id === '') {
    throw new ValidationError('Please select a specific verification app. Tags must belong to a specific app.');
  }

  try {
    const tag = await tagService.createTag(tenantId, tagData);
    return sendCreated(res, tag, 'Tag created successfully');

  } catch (error) {
    if (error.message.includes('already exists')) {
      throw new ConflictError(error.message);
    }

    if (error.message.includes('not found')) {
      throw new NotFoundError(error.message);
    }

    throw error;
  }
});

/**
 * Update existing tag
 * PUT /api/tags/:id
 */
const updateTag = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  const updates = req.body;

  try {
    const tag = await tagService.updateTag(id, tenantId, updates);

    if (!tag) {
      throw new NotFoundError('Tag');
    }

    return sendSuccess(res, tag, 'Tag updated successfully');

  } catch (error) {
    if (error.message.includes('already exists')) {
      throw new ConflictError(error.message);
    }

    throw error;
  }
});

/**
 * Delete tag
 * DELETE /api/tags/:id
 */
const deleteTag = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  try {
    const result = await tagService.deleteTag(id, tenantId);

    if (!result) {
      throw new NotFoundError('Tag');
    }

    return sendSuccess(res, null, 'Tag deleted successfully');

  } catch (error) {
    if (error.message.includes('in use')) {
      throw new ConflictError(error.message);
    }

    throw error;
  }
});

/**
 * Get tags for a verification app
 * GET /api/tags/app/:appId
 */
const getTagsForApp = asyncHandler(async (req, res) => {
  const { appId } = req.params;
  const tenantId = req.user.tenant_id;

  const tags = await tagService.getTagsForApp(appId, tenantId);

  return sendSuccess(res, tags, null, 200, { count: tags.length });
});

/**
 * Get product tags
 * GET /api/products/:productId/tags
 */
const getProductTags = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const tags = await tagService.getProductTags(productId);

  return sendSuccess(res, tags, null, 200, { count: tags.length });
});

module.exports = {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
  getTagsForApp,
  getProductTags
};
