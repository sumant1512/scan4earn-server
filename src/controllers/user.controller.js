/**
 * User Management Controller
 * Refactored to use modern error handling, validators, and utilities
 */
const db = require('../config/database');
const emailService = require('../services/email.service');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  ConflictError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields,
  validateEmail
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess,
  sendCreated
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

/**
 * Create Customer (Tenant) - Super Admin Only
 */
const createCustomer = asyncHandler(async (req, res) => {
  const {
    companyName,
    adminEmail,
    adminName,
    contactPhone,
    address
  } = req.body;

  // Validation
  validateRequiredFields(req.body, ['companyName', 'adminEmail', 'adminName']);
  validateEmail(adminEmail);

  const emailLower = adminEmail.toLowerCase();

  // Check if email already exists
  const emailCheck = await db.query(
    'SELECT id FROM users WHERE email = $1',
    [emailLower]
  );

  if (emailCheck.rows.length > 0) {
    throw new ConflictError('A user with this email already exists');
  }

  // Check if company already exists
  const companyCheck = await db.query(
    'SELECT id FROM tenants WHERE contact_email = $1',
    [emailLower]
  );

  if (companyCheck.rows.length > 0) {
    throw new ConflictError('A company with this contact email already exists');
  }

  // Execute transaction with automatic rollback
  const result = await executeTransaction(db, async (client) => {
    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (tenant_name, email, phone, address, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, tenant_name, email`,
      [companyName, emailLower, contactPhone || null, address || null]
    );

    const tenant = tenantResult.rows[0];

    // Create tenant admin user
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, full_name, phone, role, is_active)
       VALUES ($1, $2, $3, $4, 'TENANT_ADMIN', true)
       RETURNING id, email, full_name, role`,
      [tenant.id, emailLower, adminName, contactPhone || null]
    );

    const user = userResult.rows[0];

    // Log audit
    await client.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, 'CREATE_CUSTOMER', 'TENANT', $2, $3, $4)`,
      [req.user.id, tenant.id, req.ip, req.get('user-agent') || 'unknown']
    );

    return { tenant, user };
  });

  // Send welcome email (non-blocking)
  emailService.sendWelcomeEmail(result.user.email, companyName).catch(err => {
    console.error('Failed to send welcome email:', err);
  });

  return sendCreated(res, {
    tenant: {
      id: result.tenant.id,
      tenant_name: result.tenant.tenant_name,
      email: result.tenant.email
    },
    admin: {
      id: result.user.id,
      email: result.user.email,
      full_name: result.user.full_name,
      role: result.user.role
    }
  }, 'Customer created successfully');
});

/**
 * Get User Profile
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.tenant_id, u.is_active, u.created_at,
            t.tenant_name
     FROM users u
     LEFT JOIN tenants t ON u.tenant_id = t.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('User');
  }

  const user = result.rows[0];

  const profile = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at
  };

  if (user.tenant_id) {
    profile.tenant = {
      id: user.tenant_id,
      tenant_name: user.tenant_name
    };
  }

  return sendSuccess(res, profile);
});

/**
 * Update User Profile
 */
const updateUserProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { fullName, phone } = req.body;

  // Validation
  validateRequiredFields(req.body, ['fullName']);

  const result = await db.query(
    `UPDATE users
     SET full_name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING id, email, full_name, phone, role`,
    [fullName, phone || null, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('User');
  }

  const user = result.rows[0];

  // Log audit
  await db.query(
    `INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
     VALUES ($1, 'UPDATE_PROFILE', 'USER', $2)`,
    [userId, userId]
  );

  return sendSuccess(res, {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role
  }, 'Profile updated successfully');
});

/**
 * Get All Customers (Tenants) - Super Admin Only
 */
const getAllCustomers = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT t.id, t.tenant_name, t.email, t.phone,
            t.address, t.is_active, t.created_at,
            COUNT(u.id) as user_count
     FROM tenants t
     LEFT JOIN users u ON t.id = u.tenant_id
     GROUP BY t.id
     ORDER BY t.created_at DESC`
  );

  const customers = result.rows.map(row => ({
    id: row.id,
    tenant_name: row.tenant_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    is_active: row.is_active,
    user_count: parseInt(row.user_count),
    createdAt: row.created_at
  }));

  return sendSuccess(res, customers);
});

module.exports = {
  createCustomer,
  getUserProfile,
  updateUserProfile,
  getAllCustomers
};
