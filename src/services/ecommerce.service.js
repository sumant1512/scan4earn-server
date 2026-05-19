/**
 * Ecommerce Service
 * Handles product catalog browsing and customer profile management
 */

const db = require('../config/database');
const { NotFoundError } = require('../modules/common/errors/AppError');

/**
 * List products with pagination, search, and filtering
 */
const listProducts = async (tenantId, { page = 1, limit = 10, search = null, category = null, sort = 'newest' }) => {
  const offset = (page - 1) * limit;
  const params = [tenantId];
  let whereClause = 'p.tenant_id = $1 AND p.is_active = true';

  if (search) {
    params.push(`%${search}%`);
    whereClause += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
  }

  if (category) {
    params.push(category);
    whereClause += ` AND p.category = $${params.length}`;
  }

  // Count
  const countRes = await db.query(
    `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].total);

  // Sort
  let orderBy = 'p.created_at DESC';
  if (sort === 'price_asc') orderBy = 'p.price ASC';
  else if (sort === 'price_desc') orderBy = 'p.price DESC';
  else if (sort === 'name') orderBy = 'p.name ASC';

  params.push(limit, offset);
  const dataRes = await db.query(
    `SELECT p.id, p.name, p.description, p.price, p.images, p.category,
            CASE WHEN p.stock_quantity > 0 THEN 'in_stock' ELSE 'out_of_stock' END as stock_status
     FROM products p
     WHERE ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { products: dataRes.rows, total };
};

/**
 * Get single product details
 */
const getProductById = async (tenantId, productId) => {
  const result = await db.query(
    `SELECT p.id, p.name, p.description, p.price, p.images, p.category, p.tags,
            p.attributes, p.template_id,
            CASE WHEN p.stock_quantity > 0 THEN 'in_stock' ELSE 'out_of_stock' END as stock_status,
            t.name as template_name
     FROM products p
     LEFT JOIN templates t ON t.id = p.template_id
     WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = true`,
    [productId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Product');
  }

  return result.rows[0];
};

/**
 * Get customer profile for ecommerce
 */
const getProfile = async (userId, tenantId) => {
  const result = await db.query(
    `SELECT c.id, c.full_name, c.email, c.phone_e164, c.phone_verified, c.email_verified,
            c.tenant_id, t.tenant_name, t.subdomain_slug
     FROM customers c
     JOIN users u ON u.phone_e164 = c.phone_e164 AND u.tenant_id = c.tenant_id
     JOIN tenants t ON c.tenant_id = t.id
     WHERE u.id = $1 AND c.tenant_id = $2`,
    [userId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Customer profile');
  }

  const c = result.rows[0];
  const profileComplete = !!(c.full_name && c.email);

  return {
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    phone_e164: c.phone_e164,
    phone_verified: c.phone_verified,
    email_verified: c.email_verified,
    profile_complete: profileComplete,
    tenant: { id: c.tenant_id, name: c.tenant_name, subdomain: c.subdomain_slug }
  };
};

/**
 * Update customer profile
 */
const updateProfile = async (userId, tenantId, data) => {
  const { full_name, email } = data;

  // Get customer
  const custRes = await db.query(
    `SELECT c.id, c.email as current_email
     FROM customers c
     JOIN users u ON u.phone_e164 = c.phone_e164 AND u.tenant_id = c.tenant_id
     WHERE u.id = $1 AND c.tenant_id = $2`,
    [userId, tenantId]
  );

  if (custRes.rows.length === 0) {
    throw new NotFoundError('Customer profile');
  }

  const customer = custRes.rows[0];
  const emailChanged = email && email.toLowerCase() !== (customer.current_email || '').toLowerCase();

  // Update customers record
  const updateFields = [];
  const updateParams = [];
  let idx = 1;

  if (full_name) { updateFields.push(`full_name = $${idx++}`); updateParams.push(full_name); }
  if (email) {
    updateFields.push(`email = $${idx++}`);
    updateParams.push(email.toLowerCase());
    if (emailChanged) {
      updateFields.push(`email_verified = false`);
    }
  }

  if (updateFields.length > 0) {
    updateParams.push(customer.id);
    await db.query(
      `UPDATE customers SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}`,
      updateParams
    );

    // Also update users record
    const userFields = [];
    const userParams = [];
    let uIdx = 1;
    if (full_name) { userFields.push(`full_name = $${uIdx++}`); userParams.push(full_name); }
    if (email) { userFields.push(`email = $${uIdx++}`); userParams.push(email.toLowerCase()); }

    if (userFields.length > 0) {
      userParams.push(userId);
      await db.query(
        `UPDATE users SET ${userFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${uIdx}`,
        userParams
      );
    }
  }

  const profile = await getProfile(userId, tenantId);
  const result = { profile_updated: true, ...profile };

  if (emailChanged) {
    result.email_verification_required = true;
  }

  return result;
};

module.exports = {
  listProducts,
  getProductById,
  getProfile,
  updateProfile
};
