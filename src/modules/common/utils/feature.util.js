/**
 * Feature Utilities
 * Common utilities for feature flag checking
 */

const featureService = require('../../services/feature.service');

/**
 * Check if feature is enabled for tenant (cached version)
 * @param {string} featureCode - Feature code
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<boolean>} Whether feature is enabled
 */
const isFeatureEnabled = async (featureCode, tenantId) => {
  return featureService.isFeatureEnabledForTenant(featureCode, tenantId);
};

/**
 * Check multiple features for tenant
 * @param {string[]} featureCodes - Array of feature codes
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Object with feature codes as keys and boolean values
 */
const checkMultipleFeatures = async (featureCodes, tenantId) => {
  const results = {};

  for (const code of featureCodes) {
    results[code] = await featureService.isFeatureEnabledForTenant(code, tenantId);
  }

  return results;
};

/**
 * Get feature status with fallback
 * @param {string} featureCode - Feature code
 * @param {string} tenantId - Tenant ID
 * @param {boolean} defaultValue - Default value if check fails
 * @returns {Promise<boolean>} Feature status or default
 */
const getFeatureStatus = async (featureCode, tenantId, defaultValue = false) => {
  try {
    return await featureService.isFeatureEnabledForTenant(featureCode, tenantId);
  } catch (error) {
    console.warn(`Feature check failed for ${featureCode}:`, error.message);
    return defaultValue;
  }
};

module.exports = {
  isFeatureEnabled,
  checkMultipleFeatures,
  getFeatureStatus
};