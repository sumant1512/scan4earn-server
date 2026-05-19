/**
 * Feature Middleware
 * Provides middleware for feature gating based on tenant feature flags
 */

const featureService = require('../services/feature.service');
const { ForbiddenError } = require('../modules/common/errors/AppError');

/**
 * Require specific feature to be enabled for tenant
 * @param {string} featureCode - Feature code to check
 * @param {Object} options - Options
 * @param {string} options.errorMessage - Custom error message
 * @returns {Function} Express middleware
 */
const requireFeature = (featureCode, options = {}) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenant_id;

      if (!tenantId) {
        return next(new ForbiddenError('Tenant context required for feature check'));
      }

      const isEnabled = await featureService.isFeatureEnabledForTenant(featureCode, tenantId);

      if (!isEnabled) {
        const message = options.errorMessage || `Feature '${featureCode}' is not enabled for your tenant`;
        return next(new ForbiddenError(message));
      }

      // Add feature status to request for potential use in handlers
      req.features = req.features || {};
      req.features[featureCode] = true;

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check feature status without blocking (adds to req.features)
 * @param {string} featureCode - Feature code to check
 * @returns {Function} Express middleware
 */
const checkFeature = (featureCode) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenant_id;

      if (tenantId) {
        const isEnabled = await featureService.isFeatureEnabledForTenant(featureCode, tenantId);
        req.features = req.features || {};
        req.features[featureCode] = isEnabled;
      } else {
        // No tenant context, assume disabled
        req.features = req.features || {};
        req.features[featureCode] = false;
      }

      next();
    } catch (error) {
      // On error, assume feature is disabled
      req.features = req.features || {};
      req.features[featureCode] = false;
      next();
    }
  };
};

/**
 * Require at least one of the specified features
 * @param {string[]} featureCodes - Array of feature codes
 * @param {Object} options - Options
 * @param {string} options.errorMessage - Custom error message
 * @returns {Function} Express middleware
 */
const requireAnyFeature = (featureCodes, options = {}) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenant_id;

      if (!tenantId) {
        return next(new ForbiddenError('Tenant context required for feature check'));
      }

      let hasFeature = false;
      req.features = req.features || {};

      for (const featureCode of featureCodes) {
        const isEnabled = await featureService.isFeatureEnabledForTenant(featureCode, tenantId);
        req.features[featureCode] = isEnabled;
        if (isEnabled) {
          hasFeature = true;
        }
      }

      if (!hasFeature) {
        const message = options.errorMessage || `None of the required features are enabled: ${featureCodes.join(', ')}`;
        return next(new ForbiddenError(message));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require all specified features
 * @param {string[]} featureCodes - Array of feature codes
 * @param {Object} options - Options
 * @param {string} options.errorMessage - Custom error message
 * @returns {Function} Express middleware
 */
const requireAllFeatures = (featureCodes, options = {}) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.user?.tenant_id;

      if (!tenantId) {
        return next(new ForbiddenError('Tenant context required for feature check'));
      }

      let allEnabled = true;
      const missingFeatures = [];
      req.features = req.features || {};

      for (const featureCode of featureCodes) {
        const isEnabled = await featureService.isFeatureEnabledForTenant(featureCode, tenantId);
        req.features[featureCode] = isEnabled;
        if (!isEnabled) {
          allEnabled = false;
          missingFeatures.push(featureCode);
        }
      }

      if (!allEnabled) {
        const message = options.errorMessage || `Missing required features: ${missingFeatures.join(', ')}`;
        return next(new ForbiddenError(message));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  requireFeature,
  checkFeature,
  requireAnyFeature,
  requireAllFeatures
};