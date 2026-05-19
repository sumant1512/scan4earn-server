/**
 * Response Utilities
 * Standardized response formatters
 */

/**
 * Send success response
 * Standardized format: { status: true, data: {...}, message: "..." }
 * Always returns data nested under 'data' property to match frontend interface expectations
 */
const sendSuccess = (res, data, message = null, statusCode = 200) => {
  const response = {
    status: true,
    data
  };

  if (message) {
    response.message = message;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send paginated response
 * Standardized format: { status: true, data: { items: [...], pagination: {...} } }
 */
const sendPaginated = (res, items, page, limit, total, itemKey = 'items') => {
  const totalPages = Math.ceil(total / limit);

  return res.status(200).json({
    status: true,
    data: {
      [itemKey]: items,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalItems: total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    }
  });
};

/**
 * Send created response
 */
const sendCreated = (res, data, message = null) => {
  return sendSuccess(res, data, message, 201);
};

/**
 * Send no content response
 */
const sendNoContent = (res) => {
  return res.status(204).send();
};

/**
 * Send error response
 * Standardized format: { status: false, error: { message: "...", code: "..." } }
 */
const sendError = (res, message, statusCode = 500, errorCode = null, details = null) => {
  const response = {
    status: false,
    error: {
      message,
      code: errorCode
    }
  };

  if (details) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send validation error response
 */
const sendValidationError = (res, errors) => {
  return sendError(res, 'Validation failed', 400, 'VALIDATION_ERROR', errors);
};

/**
 * Send not found response
 */
const sendNotFound = (res, resource = 'Resource') => {
  return sendError(res, `${resource} not found`, 404, 'NOT_FOUND');
};

/**
 * Send unauthorized response
 */
const sendUnauthorized = (res, message = 'Authentication required') => {
  return sendError(res, message, 401, 'UNAUTHORIZED');
};

/**
 * Send forbidden response
 */
const sendForbidden = (res, message = 'Insufficient permissions') => {
  return sendError(res, message, 403, 'FORBIDDEN');
};

/**
 * Send conflict response
 */
const sendConflict = (res, message, details = null) => {
  return sendError(res, message, 409, 'CONFLICT', details);
};

module.exports = {
  sendSuccess,
  sendPaginated,
  sendCreated,
  sendNoContent,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendConflict
};
