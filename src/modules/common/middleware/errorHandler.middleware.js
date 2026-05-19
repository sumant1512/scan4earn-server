/**
 * Global Error Handling Middleware
 * Catches all errors and sends consistent error responses
 */

const { AppError } = require('../errors/AppError');

/**
 * Error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Convert non-operational errors to AppError
  if (!(error instanceof AppError)) {
    const statusCode = error.statusCode || error.status || 500;
    const message = error.message || 'Internal Server Error';
    error = new AppError(message, statusCode);
  }

  // Log error for debugging (in production, send to logging service)
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
      url: req.url,
      method: req.method,
      body: req.body,
      user: req.user?.id
    });
  }

  // Send error response
  res.status(error.statusCode).json(error.toJSON());
};

/**
 * Handle 404 - Route not found
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.method} ${req.url} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
