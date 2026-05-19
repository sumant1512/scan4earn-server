/**
 * Dealer Service
 * Handles dealer CRUD operations for tenant admin.
 *
 * Design: one dealer row per (user_id, verification_app_id) pair.
 * The same person can be registered across multiple apps — each registration
 * is a separate dealer record with its own points balance.
 */

const db = require('../config/database');
const { executeTransaction } = require('../modules/common/utils/database.util');
const { ConflictError, NotFoundError, UnprocessableError, ValidationError } = require('../modules/common/errors/AppError');

/**
 * Generate a unique dealer code
 */
function generateDealerCode(shopName) {
  const prefix = shopName
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 4)
    .toUpperCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${suffix}`;
}

/**
 * Create a new dealer profile for a verification app.
 * - If the phone belongs to an existing DEALER user → reuse that user.
 * - If the phone belongs to any other role → reject with 422.
 * - Creates a new user only when the phone is not registered at all.
 */
const createDealer = async (tenantId, data) => {
  const { verification_app_id, full_name, email, phone_e164, shop_name, address, pincode, city, state, dealer_code, metadata } = data;

  return executeTransaction(db, async (client) => {
    // Validate verification_app_id belongs to this tenant
    const appCheck = await client.query(
      'SELECT id FROM verification_apps WHERE id = $1 AND tenant_id = $2',
      [verification_app_id, tenantId]
    );
    if (appCheck.rows.length === 0) {
      throw new ValidationError('Verification app not found or does not belong to this tenant');
    }

    // Look up the phone number across users in this tenant
    const phoneCheck = await client.query(
      'SELECT id, role FROM users WHERE tenant_id = $1 AND phone_e164 = $2',
      [tenantId, phone_e164]
    );

    let userId;

    if (phoneCheck.rows.length > 0) {
      const existing = phoneCheck.rows[0];
      if (existing.role !== 'DEALER') {
        throw new UnprocessableError(
          `Phone number is already registered with role ${existing.role}`,
          'role_conflict'
        );
      }
      // Reuse the existing DEALER user
      userId = existing.id;

      // Check if already registered for this specific app
      const appDealerCheck = await client.query(
        'SELECT id FROM dealers WHERE user_id = $1 AND verification_app_id = $2',
        [userId, verification_app_id]
      );
      if (appDealerCheck.rows.length > 0) {
        throw new ConflictError('Dealer is already registered for this verification app');
      }
    } else {
      // Check email uniqueness within tenant
      if (email) {
        const emailCheck = await client.query(
          'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
          [tenantId, email.toLowerCase()]
        );
        if (emailCheck.rows.length > 0) {
          throw new ConflictError('Email already registered');
        }
      }

      // Create a new user record
      const userRes = await client.query(
        `INSERT INTO users (tenant_id, email, full_name, phone_e164, role, is_active)
         VALUES ($1, $2, $3, $4, 'DEALER', true)
         RETURNING id`,
        [tenantId, email ? email.toLowerCase() : null, full_name, phone_e164]
      );
      userId = userRes.rows[0].id;
    }

    // Generate or validate dealer code (unique per tenant + app)
    const code = dealer_code || generateDealerCode(shop_name);

    const codeCheck = await client.query(
      'SELECT id FROM dealers WHERE tenant_id = $1 AND verification_app_id = $2 AND dealer_code = $3',
      [tenantId, verification_app_id, code]
    );
    if (codeCheck.rows.length > 0) {
      throw new ConflictError('Dealer code already exists for this verification app');
    }

    // Create dealer profile row
    const dealerRes = await client.query(
      `INSERT INTO dealers (user_id, tenant_id, verification_app_id, dealer_code, shop_name, address, pincode, city, state, is_active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
       RETURNING *`,
      [userId, tenantId, verification_app_id, code, shop_name, address, pincode, city, state, metadata ? JSON.stringify(metadata) : '{}']
    );
    const dealer = dealerRes.rows[0];

    // Initialize dealer points for this profile
    await client.query(
      `INSERT INTO dealer_points (dealer_id, tenant_id, balance)
       VALUES ($1, $2, 0)`,
      [dealer.id, tenantId]
    );

    // Fetch user info for the response
    const userInfo = await client.query(
      'SELECT full_name, email, phone_e164 FROM users WHERE id = $1',
      [userId]
    );
    const u = userInfo.rows[0];

    return {
      id: dealer.id,
      user_id: userId,
      verification_app_id,
      dealer_code: code,
      full_name: u.full_name,
      email: u.email,
      phone_e164: u.phone_e164,
      shop_name,
      address,
      pincode,
      city,
      state,
      is_active: true,
      points_balance: 0
    };
  });
};

/**
 * List dealers with pagination, search, and optional app filter
 */
const listDealers = async (tenantId, { page = 1, limit = 10, search = null, app_id = null }) => {
  const offset = (page - 1) * limit;
  const params = [tenantId];
  let whereClause = 'd.tenant_id = $1';

  if (app_id) {
    params.push(app_id);
    whereClause += ` AND d.verification_app_id = $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    const searchIdx = params.length;
    whereClause += ` AND (u.full_name ILIKE $${searchIdx} OR d.shop_name ILIKE $${searchIdx} OR d.dealer_code ILIKE $${searchIdx})`;
  }

  const countRes = await db.query(
    `SELECT COUNT(*) as total
     FROM dealers d
     JOIN users u ON u.id = d.user_id
     WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].total);

  params.push(limit, offset);
  const dataRes = await db.query(
    `SELECT d.id, d.dealer_code, d.verification_app_id,
            u.full_name, u.email, u.phone_e164,
            d.shop_name, d.city, d.state, d.is_active,
            COALESCE(dp.balance, 0) as points_balance
     FROM dealers d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN dealer_points dp ON dp.dealer_id = d.id AND dp.tenant_id = d.tenant_id
     WHERE ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { dealers: dataRes.rows, total };
};

/**
 * Get single dealer by ID
 */
const getDealerById = async (tenantId, dealerId) => {
  const result = await db.query(
    `SELECT d.*, d.verification_app_id,
            u.full_name, u.email, u.phone_e164, u.is_active as user_active,
            COALESCE(dp.balance, 0) as points_balance
     FROM dealers d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN dealer_points dp ON dp.dealer_id = d.id AND dp.tenant_id = d.tenant_id
     WHERE d.id = $1 AND d.tenant_id = $2`,
    [dealerId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Dealer');
  }

  return result.rows[0];
};

/**
 * Update dealer profile fields.
 * Only dealer-level fields are allowed: shop_name, address, pincode, city, state, dealer_code, metadata.
 * verification_app_id is immutable after creation.
 * full_name / email are user-level and shared across apps — not updated here.
 */
const updateDealer = async (tenantId, dealerId, data) => {
  const dealer = await getDealerById(tenantId, dealerId);

  const { shop_name, address, pincode, city, state, dealer_code, metadata } = data;

  const dealerFields = [];
  const dealerParams = [];
  let dIdx = 1;

  if (shop_name !== undefined) { dealerFields.push(`shop_name = $${dIdx++}`); dealerParams.push(shop_name); }
  if (address !== undefined) { dealerFields.push(`address = $${dIdx++}`); dealerParams.push(address); }
  if (pincode !== undefined) { dealerFields.push(`pincode = $${dIdx++}`); dealerParams.push(pincode); }
  if (city !== undefined) { dealerFields.push(`city = $${dIdx++}`); dealerParams.push(city); }
  if (state !== undefined) { dealerFields.push(`state = $${dIdx++}`); dealerParams.push(state); }
  if (dealer_code !== undefined) { dealerFields.push(`dealer_code = $${dIdx++}`); dealerParams.push(dealer_code); }
  if (metadata !== undefined) { dealerFields.push(`metadata = $${dIdx++}`); dealerParams.push(JSON.stringify(metadata)); }

  if (dealerFields.length > 0) {
    dealerParams.push(dealerId, tenantId);
    await db.query(
      `UPDATE dealers SET ${dealerFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${dIdx} AND tenant_id = $${dIdx + 1}`,
      dealerParams
    );
  }

  return getDealerById(tenantId, dealerId);
};

/**
 * Toggle dealer active status (dealer profile only — does not touch the user row,
 * because the user may have other active dealer profiles for other apps).
 */
const toggleDealerStatus = async (tenantId, dealerId, isActive) => {
  const dealer = await getDealerById(tenantId, dealerId);

  await db.query(
    'UPDATE dealers SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3',
    [isActive, dealerId, tenantId]
  );

  return { ...dealer, is_active: isActive };
};

/**
 * Get dealer points balance
 */
const getDealerPoints = async (tenantId, dealerId) => {
  const result = await db.query(
    'SELECT COALESCE(balance, 0) as balance FROM dealer_points WHERE dealer_id = $1 AND tenant_id = $2',
    [dealerId, tenantId]
  );

  return { balance: result.rows.length > 0 ? result.rows[0].balance : 0, currency: 'points' };
};

/**
 * Get dealer point transactions
 */
const getDealerPointTransactions = async (tenantId, dealerId, { page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;

  const countRes = await db.query(
    'SELECT COUNT(*) as total FROM dealer_point_transactions WHERE dealer_id = $1 AND tenant_id = $2',
    [dealerId, tenantId]
  );
  const total = parseInt(countRes.rows[0].total);

  const dataRes = await db.query(
    `SELECT id, amount, type, reason, reference_id, reference_type, metadata, created_at
     FROM dealer_point_transactions
     WHERE dealer_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [dealerId, tenantId, limit, offset]
  );

  return { transactions: dataRes.rows, total };
};

module.exports = {
  createDealer,
  listDealers,
  getDealerById,
  updateDealer,
  toggleDealerStatus,
  getDealerPoints,
  getDealerPointTransactions
};
