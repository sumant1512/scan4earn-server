/**
 * Common Validators
 * Reusable validation functions
 */

const { ValidationError } = require('../errors/AppError');

/**
 * Validate required fields
 */
const validateRequiredFields = (data, requiredFields) => {
  const missing = [];

  requiredFields.forEach(field => {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  });

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      { missing }
    );
  }
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
  return true;
};

/**
 * Validate phone number
 */
const validatePhone = (phone) => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phone)) {
    throw new ValidationError('Invalid phone number format');
  }
  return true;
};

/**
 * Validate UUID
 */
const validateUUID = (uuid, fieldName = 'ID') => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new ValidationError(`Invalid ${fieldName} format`);
  }
  return true;
};

/**
 * Validate string length
 */
const validateStringLength = (str, fieldName, min = 1, max = 255) => {
  if (typeof str !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  const length = str.trim().length;

  if (length < min) {
    throw new ValidationError(`${fieldName} must be at least ${min} characters`);
  }

  if (length > max) {
    throw new ValidationError(`${fieldName} must be at most ${max} characters`);
  }

  return true;
};

/**
 * Validate number range
 */
const validateNumberRange = (num, fieldName, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (typeof num !== 'number' || isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`);
  }

  return true;
};

/**
 * Validate enum value
 */
const validateEnum = (value, fieldName, allowedValues) => {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      { allowedValues }
    );
  }
  return true;
};

/**
 * Validate date format
 */
const validateDate = (dateString, fieldName) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`);
  }
  return true;
};

/**
 * Validate pagination parameters
 */
const validatePagination = (page, limit) => {
  if (page !== undefined) {
    validateNumberRange(parseInt(page), 'page', 1);
  }

  if (limit !== undefined) {
    validateNumberRange(parseInt(limit), 'limit', 1, 100);
  }

  return {
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 10
  };
};

/**
 * Validate slug format (for subdomain, etc.)
 */
const validateSlug = (slug) => {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug)) {
    throw new ValidationError(
      'Slug must contain only lowercase letters, numbers, and hyphens'
    );
  }

  if (slug.length < 3) {
    throw new ValidationError('Slug must be at least 3 characters');
  }

  if (slug.length > 63) {
    throw new ValidationError('Slug must be at most 63 characters');
  }

  return true;
};

/**
 * Validate price/amount
 */
const validatePrice = (price, fieldName = 'price') => {
  const parsedPrice = typeof price === 'string' ? parseFloat(price) : price;

  if (isNaN(parsedPrice)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (parsedPrice < 0) {
    throw new ValidationError(`${fieldName} cannot be negative`);
  }

  // Check for too many decimal places
  const decimalPlaces = (parsedPrice.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    throw new ValidationError(`${fieldName} can have at most 2 decimal places`);
  }

  return parsedPrice;
};

/**
 * Validate currency code
 */
const validateCurrency = (currency) => {
  const validCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CNY'];
  validateEnum(currency, 'currency', validCurrencies);
  return true;
};

/**
 * Sanitize string input (remove XSS)
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;

  return str
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '');
};

module.exports = {
  validateRequiredFields,
  validateEmail,
  validatePhone,
  validateUUID,
  validateStringLength,
  validateNumberRange,
  validateEnum,
  validateDate,
  validatePagination,
  validateSlug,
  validatePrice,
  validateCurrency,
  sanitizeString
};
