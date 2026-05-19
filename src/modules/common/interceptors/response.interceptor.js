/**
 * Response Interceptors
 * Handle common response processing tasks
 */

/**
 * Standard success response formatter
 */
const formatSuccessResponse = (data, message = null, meta = null) => {
  const response = {
    success: true,
    data
  };

  if (message) {
    response.message = message;
  }

  if (meta) {
    response.meta = meta;
  }

  return response;
};

/**
 * Pagination response formatter
 */
const formatPaginatedResponse = (items, page, limit, total, itemKey = 'items') => {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    [itemKey]: items,
    pagination: {
      currentPage: page,
      pageSize: limit,
      totalItems: total,
      totalPages: totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1
    }
  };
};

/**
 * Add security headers to response
 */
const securityHeaders = (req, res, next) => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
};

/**
 * Cache control for different resource types
 */
const cacheControl = (type = 'no-cache') => {
  return (req, res, next) => {
    switch (type) {
      case 'public':
        res.setHeader('Cache-Control', 'public, max-age=3600');
        break;
      case 'private':
        res.setHeader('Cache-Control', 'private, max-age=600');
        break;
      case 'no-cache':
      default:
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        break;
    }
    next();
  };
};

/**
 * Response compression hints
 */
const compressionHints = (req, res, next) => {
  // Vary header for caching
  res.setHeader('Vary', 'Accept-Encoding');
  next();
};

/**
 * CORS headers (if needed beyond cors middleware)
 */
const corsHeaders = (req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:4200'];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');

  next();
};

module.exports = {
  formatSuccessResponse,
  formatPaginatedResponse,
  securityHeaders,
  cacheControl,
  compressionHints,
  corsHeaders
};
