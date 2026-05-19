const db = require('../config/database');

/**
 * Telemetry Service
 * Records scan-related events to the database when available,
 * otherwise logs structured events to console.
 */
async function recordEvent(eventType, payload) {
  const {
    tenant_id = null,
    session_id = null,
    coupon_code = null,
    mobile_e164 = null,
    device_id = null,
    metadata = {}
  } = payload || {};

  try {
    await db.query(
      `INSERT INTO scan_events (tenant_id, session_id, event_type, coupon_code, mobile_e164, device_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenant_id, session_id, eventType, coupon_code, mobile_e164, device_id, metadata]
    );
  } catch (err) {
    // Fallback to structured console log if table not present or other errors
    console.log(`[Telemetry] ${eventType}`, {
      tenant_id,
      session_id,
      coupon_code,
      mobile_e164,
      device_id,
      metadata,
      error: err && err.message
    });
  }
}

module.exports = { recordEvent };
