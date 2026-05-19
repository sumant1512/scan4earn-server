/**
 * Tenant Management Controller (Super Admin)
 * Handles CRUD operations for tenants
 */

const pool = require('../../../config/database');
const emailService = require('../../../services/email.service');
const SlugGenerator = require('../../../services/slug-generator.service');

const { AppError, ValidationError, ConflictError, NotFoundError } = require('../../common/errors/AppError');
const { asyncHandler } = require('../../common/middleware/errorHandler.middleware');
const { executeTransaction, executeQuery } = require('../../common/utils/database.util');
const { validateRequiredFields, validateEmail, validateSlug } = require('../../common/validators/common.validator');
const { sendSuccess, sendCreated, sendNotFound, sendConflict } = require('../../common/utils/response.util');

class TenantController {
  /**
   * Create a new tenant
   * POST /api/super-admin/tenants
   */
  createTenant = asyncHandler(async (req, res) => {
    const {
      tenant_name,
      subdomain_slug,
      contact_person,
      email,
      phone,
      address,
      max_verification_apps
    } = req.body;
    const createdBy = req.user.id;

    // Validate max_verification_apps if provided
    if (max_verification_apps !== undefined) {
      const limit = parseInt(max_verification_apps, 10);
      if (isNaN(limit) || limit < 1) {
        throw new ValidationError('max_verification_apps must be a positive integer');
      }
    }

    // Validation
    validateRequiredFields(req.body, ['tenant_name', 'email']);
    validateEmail(email);

    // Check for duplicate email
    const existingTenant = await executeQuery(
      pool,
      'SELECT id FROM tenants WHERE email = $1',
      [email]
    );

    if (existingTenant.rows.length > 0) {
      throw new ConflictError('A tenant with this email already exists');
    }

    // Handle subdomain slug
    let slug = subdomain_slug;

    if (!slug) {
      slug = await SlugGenerator.generateUniqueSlug(tenant_name);
    } else {
      const validation = SlugGenerator.validateSlug(slug);
      if (!validation.valid) {
        throw new ValidationError(validation.error);
      }

      const available = await SlugGenerator.isSlugAvailable(slug);
      if (!available) {
        const suggestions = await SlugGenerator.generateSuggestions(tenant_name);
        return sendConflict(res, 'Subdomain is already taken', { suggestions });
      }
    }

    // Create tenant in transaction
    const tenant = await executeTransaction(pool, async (client) => {
      // Build settings JSONB
      const appLimit = max_verification_apps !== undefined
        ? parseInt(max_verification_apps, 10)
        : (parseInt(process.env.DEFAULT_MAX_VERIFICATION_APPS, 10) || 1);
      const settings = { max_verification_apps: appLimit };

      // Create tenant with subdomain
      const result = await client.query(
        `INSERT INTO tenants (tenant_name, subdomain_slug, email, phone, contact_person, address, created_by, settings, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [tenant_name, slug, email, phone, contact_person, address, createdBy, JSON.stringify(settings)]
      );

      const newTenant = result.rows[0];

      // Create tenant admin user
      await client.query(
        `INSERT INTO users (tenant_id, email, full_name, phone, role, is_active)
         VALUES ($1, $2, $3, $4, 'TENANT_ADMIN', true)`,
        [newTenant.id, email, contact_person || tenant_name, phone]
      );

      // Log audit
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [createdBy, 'CREATE_TENANT', 'TENANT', newTenant.id, req.ip, req.get('user-agent')]
      );

      return newTenant;
    });

    // Send welcome email asynchronously
    emailService.sendWelcomeEmail(tenant.email, tenant.tenant_name)
      .catch(err => console.error('Welcome email failed:', err));

    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const baseDomain = process.env.DOMAIN_BASE || 'localhost';
    const port = process.env.NODE_ENV === 'production' ? '' : ':4200';
    const subdomainUrl = `${protocol}://${slug}.${baseDomain}${port}`;

    return sendCreated(res, {
      tenant: {
        id: tenant.id,
        tenant_name: tenant.tenant_name,
        subdomain_slug: tenant.subdomain_slug,
        email: tenant.email,
        phone: tenant.phone,
        contact_person: tenant.contact_person,
        address: tenant.address,
        is_active: tenant.is_active,
        settings: tenant.settings,
        created_at: tenant.created_at
      },
      subdomain_url: subdomainUrl
    }, 'Tenant created successfully');
  });

  /**
   * Get all tenants with admin details
   * GET /api/super-admin/tenants
   */
  getAllTenants = asyncHandler(async (req, res) => {
    const query = `
      SELECT t.*,
        COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'TENANT_ADMIN') as tenant_admin_count,
        creator.full_name as created_by_name,
        creator.email as created_by_email
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN users creator ON t.created_by = creator.id
      GROUP BY t.id, creator.full_name, creator.email
      ORDER BY t.created_at DESC
    `;

    const result = await executeQuery(pool, query);

    const tenants = result.rows.map(tenant => ({
      ...tenant,
      status: tenant.is_active ? 'active' : 'inactive',
      tenant_admin_count: parseInt(tenant.tenant_admin_count || 0)
    }));

    // Fetch all admins for all tenants in one query
    if (tenants.length > 0) {
      const tenantIds = tenants.map(t => t.id);

      const adminsQuery = `
        SELECT
          u.id, u.email, u.full_name, u.phone, u.role,
          u.tenant_id, u.is_active, u.created_at, u.updated_at
        FROM users u
        WHERE u.tenant_id = ANY($1) AND u.role = 'TENANT_ADMIN'
        ORDER BY u.created_at DESC
      `;

      const adminsResult = await executeQuery(pool, adminsQuery, [tenantIds]);

      // Group admins by tenant_id
      const adminsByTenant = {};
      adminsResult.rows.forEach(admin => {
        if (!adminsByTenant[admin.tenant_id]) {
          adminsByTenant[admin.tenant_id] = [];
        }
        adminsByTenant[admin.tenant_id].push(admin);
      });

      // Add admins array to each tenant
      tenants.forEach(tenant => {
        tenant.admins = adminsByTenant[tenant.id] || [];
      });
    }

    return sendSuccess(res, { tenants, total: tenants.length });
  });

  /**
   * Get tenant by ID
   * GET /api/super-admin/tenants/:id
   */
  getTenantById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await executeQuery(
      pool,
      `SELECT t.*,
              tcb.balance as credit_balance,
              tcb.total_received as total_credits_received,
              tcb.total_spent as total_credits_spent,
              u.full_name as created_by_name,
              u.email as created_by_email,
              (SELECT COUNT(*) FROM credit_requests WHERE tenant_id = t.id AND status = 'pending') as pending_credit_requests,
              (SELECT COUNT(*) FROM coupons WHERE tenant_id = t.id) as total_coupons,
              (SELECT COUNT(*) FROM verification_apps WHERE tenant_id = t.id) as verification_apps_count
       FROM tenants t
       LEFT JOIN tenant_credit_balance tcb ON t.id = tcb.tenant_id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Tenant');
    }

    const tenant = result.rows[0];
    tenant.status = tenant.is_active ? 'active' : 'inactive';

    return sendSuccess(res, { tenant });
  });

  /**
   * Update tenant
   * PUT /api/super-admin/tenants/:id
   */
  updateTenant = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { tenant_name, contact_person, email, phone, address, max_verification_apps } = req.body;
    const updatedBy = req.user.id;

    // Validate email if provided
    if (email) {
      validateEmail(email);
    }

    // Validate max_verification_apps if provided
    if (max_verification_apps !== undefined) {
      const limit = parseInt(max_verification_apps, 10);
      if (isNaN(limit) || limit < 1) {
        throw new ValidationError('max_verification_apps must be a positive integer');
      }
    }

    const result = await executeTransaction(pool, async (client) => {
      // Check if tenant exists
      const existingTenant = await client.query(
        'SELECT * FROM tenants WHERE id = $1',
        [id]
      );

      if (existingTenant.rows.length === 0) {
        throw new NotFoundError('Tenant');
      }

      // Check for duplicate email (excluding current tenant)
      if (email) {
        const duplicateCheck = await client.query(
          'SELECT id FROM tenants WHERE email = $1 AND id != $2',
          [email, id]
        );

        if (duplicateCheck.rows.length > 0) {
          throw new ConflictError('Another tenant with this email already exists');
        }
      }

      // Update tenant
      const appLimit = max_verification_apps !== undefined ? parseInt(max_verification_apps, 10) : null;
      const updateResult = await client.query(
        `UPDATE tenants
         SET tenant_name = COALESCE($1, tenant_name),
             email = COALESCE($2, email),
             phone = COALESCE($3, phone),
             contact_person = COALESCE($4, contact_person),
             address = COALESCE($5, address),
             settings = CASE WHEN $7::integer IS NOT NULL
                              THEN jsonb_set(settings, '{max_verification_apps}', to_jsonb($7::integer))
                              ELSE settings END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [tenant_name, email, phone, contact_person, address, id, appLimit]
      );

      // Log audit
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [updatedBy, 'UPDATE_TENANT', 'TENANT', id, req.ip, req.get('user-agent')]
      );

      return updateResult.rows[0];
    });

    return sendSuccess(res, { tenant: result }, 'Tenant updated successfully');
  });

  /**
   * Toggle tenant status (activate/deactivate)
   * PATCH /api/super-admin/tenants/:id/status
   */
  toggleTenantStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updatedBy = req.user.id;

    const result = await executeTransaction(pool, async (client) => {
      // First, get the current tenant status
      const currentTenant = await client.query(
        'SELECT id, is_active, email, tenant_name FROM tenants WHERE id = $1',
        [id]
      );

      if (currentTenant.rows.length === 0) {
        throw new NotFoundError('Tenant');
      }

      // Toggle the status (flip true to false or false to true)
      const currentStatus = currentTenant.rows[0].is_active;
      const newStatus = !currentStatus;

      // Update the tenant with the toggled status
      const updateResult = await client.query(
        `UPDATE tenants
         SET is_active = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [newStatus, id]
      );

      const tenant = updateResult.rows[0];
      const action = newStatus ? 'ACTIVATE_TENANT' : 'DEACTIVATE_TENANT';

      // Log audit
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [updatedBy, action, 'TENANT', id, req.ip, req.get('user-agent')]
      );

      return tenant;
    });

    // Send status change notification email asynchronously
    emailService.sendTenantStatusChangeEmail(result.email, result.tenant_name, result.is_active)
      .catch(err => console.error('Status change email failed:', err));

    return sendSuccess(res, { tenant: result }, `Tenant ${result.is_active ? 'activated' : 'deactivated'} successfully`);
  });

  /**
   * Check subdomain availability
   * GET /api/super-admin/tenants/check-slug/:slug
   */
  checkSlugAvailability = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const validation = SlugGenerator.validateSlug(slug);
    if (!validation.valid) {
      return sendSuccess(res, {
        available: false,
        error: validation.error
      });
    }

    const available = await SlugGenerator.isSlugAvailable(slug);

    return sendSuccess(res, {
      available,
      slug,
      message: available ? 'Subdomain is available' : 'Subdomain is already taken'
    });
  });

  /**
   * Get subdomain suggestions
   * GET /api/super-admin/tenants/suggest-slugs
   */
  getSuggestedSlugs = asyncHandler(async (req, res) => {
    const { tenantName } = req.query;

    validateRequiredFields({ tenantName }, ['tenantName']);

    const suggestions = await SlugGenerator.generateSuggestions(tenantName);

    return sendSuccess(res, { suggestions, count: suggestions.length });
  });

  /**
   * Get all Tenant Admins for a specific tenant
   * GET /api/super-admin/tenants/:tenantId/admins
   */
  getTenantAdmins = asyncHandler(async (req, res) => {
    const { tenantId } = req.params;

    // Get tenant info
    const tenantResult = await executeQuery(
      pool,
      'SELECT id, tenant_name, subdomain_slug, email FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      throw new NotFoundError('Tenant');
    }

    const tenant = tenantResult.rows[0];

    // Get all TENANT_ADMIN users for this tenant
    const adminsResult = await executeQuery(
      pool,
      `SELECT u.id, u.email, u.full_name, u.phone, u.role,
              u.tenant_id, u.is_active, u.created_at, u.updated_at
       FROM users u
       WHERE u.tenant_id = $1 AND u.role = 'TENANT_ADMIN'
       ORDER BY u.created_at DESC`,
      [tenantId]
    );

    return sendSuccess(res, {
      admins: adminsResult.rows,
      tenant: {
        id: tenant.id,
        name: tenant.tenant_name,
        domain: `${tenant.subdomain_slug}.${process.env.DOMAIN_BASE || 'scan4earn.com'}`,
        subdomain: tenant.subdomain_slug
      }
    });
  });
}

module.exports = new TenantController();
