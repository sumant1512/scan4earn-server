/**
 * Request Interceptors
 * Handle common request processing tasks
 */

const { ValidationError } = require('../errors/AppError');

/**
 * Request logging interceptor
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }

  // Log response time on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (process.env.LOG_RESPONSE_TIME === 'true') {
      console.log(`[${req.method} ${req.url}] ${res.statusCode} - ${duration}ms`);
    }
  });

  next();
};

/**
 * Request validation interceptor
 * Validates common request parameters
 */
const requestValidator = (req, res, next) => {
  // Validate pagination parameters
  if (req.query.page) {
    const page = parseInt(req.query.page);
    if (isNaN(page) || page < 1) {
      throw new ValidationError('Invalid page parameter');
    }
    req.query.page = page;
  }

  if (req.query.limit) {
    const limit = parseInt(req.query.limit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Invalid limit parameter (1-100)');
    }
    req.query.limit = limit;
  }

  // Validate UUID parameters in path
  if (req.params.id || req.params.tenantId || req.params.userId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    Object.keys(req.params).forEach(key => {
      if (key.toLowerCase().includes('id') && !uuidRegex.test(req.params[key])) {
        throw new ValidationError(`Invalid ${key} format`);
      }
    });
  }

  next();
};

/**
 * Sanitize request body
 * Remove null/undefined values and trim strings
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitized = {};

    Object.keys(req.body).forEach(key => {
      const value = req.body[key];

      // Skip null/undefined
      if (value === null || value === undefined) {
        return;
      }

      // Trim strings
      if (typeof value === 'string') {
        sanitized[key] = value.trim();
      } else {
        sanitized[key] = value;
      }
    });

    req.body = sanitized;
  }

  next();
};

/**
 * Prevent duplicate requests
 * Uses request signature to detect duplicates within time window
 */
const duplicateRequestCache = new Map();

const preventDuplicates = (windowMs = 1000) => (req, res, next) => {
  // Only apply to POST/PUT/PATCH/DELETE
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Create request signature
  const signature = `${req.user?.id || 'anonymous'}-${req.method}-${req.url}-${JSON.stringify(req.body)}`;

  // Check if duplicate
  if (duplicateRequestCache.has(signature)) {
    const lastRequest = duplicateRequestCache.get(signature);
    const timeSinceLastRequest = Date.now() - lastRequest;

    if (timeSinceLastRequest < windowMs) {
      return res.status(429).json({
        success: false,
        error: {
          message: 'Duplicate request detected. Please wait before retrying.',
          code: 'DUPLICATE_REQUEST'
        }
      });
    }
  }

  // Store request
  duplicateRequestCache.set(signature, Date.now());

  // Cleanup old entries periodically
  if (duplicateRequestCache.size > 1000) {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamp] of duplicateRequestCache.entries()) {
      if (timestamp < cutoff) {
        duplicateRequestCache.delete(key);
      }
    }
  }

  next();
};

module.exports = {
  requestLogger,
  requestValidator,
  sanitizeBody,
  preventDuplicates
};
