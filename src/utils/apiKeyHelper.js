/**
 * API Key Helper Utilities
 * Handles key generation, hashing, and audit logging
 */

const crypto = require('crypto');
const db = require('../config/database');

/**
 * Hash API key for audit logging (one-way hash)
 * @param {string} apiKey - The raw API key to hash
 * @returns {string} SHA256 hash of the key
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Log API key rotation to audit trail
 * @param {Object} params - Audit log parameters
 * @returns {Promise<void>}
 */
async function logKeyRotation(params) {
  const {
    verificationAppId,
    tenantId,
    apiType, // 'mobile' or 'ecommerce'
    previousKey, // old key (will be hashed)
    previousKeyVersion,
    newKeyVersion,
    newKeyExpiresAt,
    initiatedByUserId,
    initiatedByRole,
    rotationReason, // 'manual', 'automated_expiration', 'security_incident', 'scheduled_rotation'
    notes
  } = params;

  const previousKeyHash = previousKey ? hashApiKey(previousKey) : null;

  try {
    await db.query(`
      INSERT INTO api_key_audit_log (
        verification_app_id,
        tenant_id,
        api_type,
        previous_key_hash,
        previous_key_version,
        new_key_version,
        new_key_expires_at,
        initiated_by_user_id,
        initiated_by_role,
        rotation_reason,
        notes,
        rotated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
    `, [
      verificationAppId,
      tenantId,
      apiType,
      previousKeyHash,
      previousKeyVersion,
      newKeyVersion,
      newKeyExpiresAt,
      initiatedByUserId,
      initiatedByRole,
      rotationReason,
      notes
    ]);

    console.log(`✅ Key rotation logged: ${apiType} key v${newKeyVersion} for app ${verificationAppId}`);
  } catch (error) {
    console.error('Failed to log key rotation:', error);
    // Don't throw - audit logging failure shouldn't break the rotation
  }
}

/**
 * Get key rotation history for an app
 * @param {string} verificationAppId - App UUID
 * @param {string} apiType - 'mobile' or 'ecommerce'
 * @param {number} limit - Max results (default: 10)
 * @returns {Promise<Array>} Rotation history
 */
async function getKeyRotationHistory(verificationAppId, apiType, limit = 10) {
  try {
    const result = await db.query(`
      SELECT
        id,
        api_type,
        previous_key_version,
        new_key_version,
        new_key_expires_at,
        rotation_reason,
        initiated_by_role,
        rotated_at,
        notes
      FROM api_key_audit_log
      WHERE verification_app_id = $1 AND api_type = $2
      ORDER BY rotated_at DESC
      LIMIT $3
    `, [verificationAppId, apiType, limit]);

    return result.rows;
  } catch (error) {
    console.error('Failed to fetch key rotation history:', error);
    return [];
  }
}

/**
 * Calculate default key expiration date (90 days from now)
 * @returns {Date} Expiration timestamp
 */
function getDefaultKeyExpirationDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90); // 90 days
  return expiresAt;
}

/**
 * Calculate rotation grace period (14 days from now)
 * Allows clients to switch to new key gradually
 * @returns {Date} Grace period end timestamp
 */
function getDefaultRotationGracePeriod() {
  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 14); // 14 days
  return gracePeriodEnd;
}

module.exports = {
  hashApiKey,
  logKeyRotation,
  getKeyRotationHistory,
  getDefaultKeyExpirationDate,
  getDefaultRotationGracePeriod
};
