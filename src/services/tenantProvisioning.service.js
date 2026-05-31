const { v4: uuid } = require('uuid');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { sendEmail } = require('./email.service');
const { generateApiKey, hashApiKey } = require('../utils/apiKeyHelper');
const logger = require('../modules/common/logger/logger');

class TenantProvisioningService {
  /**
   * Provision a new tenant with complete setup
   * @param {Object} tenantData - Tenant information
   * @param {string} tenantData.id - Tenant ID
   * @param {string} tenantData.name - Tenant name
   * @param {string} tenantData.email - Tenant admin email
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Provisioning result
   */
  async provisionTenant(tenantData, options = {}) {
    const tenantId = tenantData.id;
    const startTime = new Date();

    logger.info(`[PROVISIONING] Starting tenant provisioning for ${tenantData.name}`, {
      tenantId,
      email: tenantData.email
    });

    try {
      // Mark as in progress
      await this.updateProvisioningStatus(tenantId, 'in_progress', startTime);

      // Step 1: Create admin user
      const adminUser = await this.createAdminUser(tenantId, tenantData.email);
      await this.logProvisioningStep(tenantId, 'admin_user_created', 'success');

      // Step 2: Create default verification app
      const verificationApp = await this.createDefaultVerificationApp(
        tenantId,
        tenantData.name
      );
      await this.logProvisioningStep(tenantId, 'verification_app_created', 'success');

      // Step 3: Generate sandbox API keys
      const sandboxKeys = await this.generateSandboxKeys(
        tenantId,
        verificationApp.id
      );
      await this.logProvisioningStep(
        tenantId,
        'sandbox_keys_generated',
        'success'
      );

      // Step 4: Seed sandbox environment with demo data
      await this.seedSandboxData(tenantId, verificationApp.id);
      await this.logProvisioningStep(tenantId, 'sandbox_data_seeded', 'success');

      // Step 5: Send onboarding email
      await this.sendOnboardingEmail(
        tenantData.email,
        adminUser,
        verificationApp,
        sandboxKeys
      );
      await this.logProvisioningStep(
        tenantId,
        'onboarding_email_sent',
        'success'
      );

      // Mark as completed
      await this.updateProvisioningStatus(tenantId, 'completed', null, startTime);

      logger.info(`[PROVISIONING] ✓ Tenant provisioning completed`, {
        tenantId,
        duration: Date.now() - startTime.getTime()
      });

      return {
        success: true,
        message: 'Tenant provisioned successfully',
        data: {
          tenantId,
          adminUser,
          verificationApp,
          sandboxKeys
        }
      };
    } catch (error) {
      logger.error(`[PROVISIONING] ✗ Tenant provisioning failed`, {
        tenantId,
        error: error.message,
        stack: error.stack
      });

      // Mark as failed
      await this.updateProvisioningStatus(
        tenantId,
        'failed',
        startTime,
        error.message
      );

      // Try to log the error step
      try {
        await this.logProvisioningStep(
          tenantId,
          'provisioning_failed',
          'failed',
          error.message
        );
      } catch (logError) {
        logger.error('Failed to log provisioning error', { error: logError.message });
      }

      throw error;
    }
  }

  /**
   * Create admin user for tenant
   * @private
   */
  async createAdminUser(tenantId, email) {
    const adminId = uuid();
    const tempPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const query = `
      INSERT INTO users (
        id, tenant_id, email, phone_e164,
        password_hash, role, is_active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await db.query(query, [
      adminId,
      tenantId,
      email,
      null, // Phone optional
      hashedPassword,
      'TENANT_ADMIN',
      true
    ]);

    const user = result.rows[0];

    logger.info(`[PROVISIONING] Admin user created`, {
      tenantId,
      userId: adminId,
      email
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      temporaryPassword: tempPassword // Return temp password for email
    };
  }

  /**
   * Create default verification app for tenant
   * @private
   */
  async createDefaultVerificationApp(tenantId, tenantName) {
    const appId = uuid();
    const appCode = tenantName.toLowerCase().replace(/\s+/g, '-');
    const appName = await this.getDefaultAppName();

    const query = `
      INSERT INTO verification_apps (
        id, tenant_id, app_name, code,
        is_active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await db.query(query, [
      appId,
      tenantId,
      appName,
      appCode,
      true
    ]);

    const app = result.rows[0];

    logger.info(`[PROVISIONING] Verification app created`, {
      tenantId,
      appId,
      appName
    });

    return {
      id: app.id,
      name: app.app_name,
      code: app.code
    };
  }

  /**
   * Generate sandbox API keys
   * @private
   */
  async generateSandboxKeys(tenantId, verificationAppId) {
    // Generate mobile API key
    const { key: mobileKey, hash: mobileKeyHash } = generateApiKey('mobile');
    const mobileKeyExpiry = new Date();
    mobileKeyExpiry.setDate(mobileKeyExpiry.getDate() + 90); // 90 days

    // Generate ecommerce API key
    const { key: ecommerceKey, hash: ecommerceKeyHash } = generateApiKey(
      'ecommerce'
    );
    const ecommerceKeyExpiry = new Date();
    ecommerceKeyExpiry.setDate(ecommerceKeyExpiry.getDate() + 90);

    const updateQuery = `
      UPDATE verification_apps
      SET
        mobile_api_key = $1,
        mobile_api_enabled = true,
        mobile_api_key_expires_at = $2,
        mobile_api_key_version = 1,
        ecommerce_api_key = $3,
        ecommerce_api_enabled = true,
        ecommerce_api_key_expires_at = $4,
        ecommerce_api_key_version = 1,
        api_rate_limits = $5
      WHERE id = $6
      RETURNING *
    `;

    const rateLimits = {
      mobile_rpm: 60,
      ecommerce_rpm: 120
    };

    await db.query(updateQuery, [
      mobileKeyHash,
      mobileKeyExpiry,
      ecommerceKeyHash,
      ecommerceKeyExpiry,
      JSON.stringify(rateLimits),
      verificationAppId
    ]);

    logger.info(`[PROVISIONING] API keys generated`, {
      tenantId,
      verificationAppId
    });

    return {
      mobileApiKey: mobileKey,
      mobileApiKeyExpiry: mobileKeyExpiry.toISOString(),
      ecommerceApiKey: ecommerceKey,
      ecommerceApiKeyExpiry: ecommerceKeyExpiry.toISOString()
    };
  }

  /**
   * Seed sandbox environment with demo data
   * @private
   */
  async seedSandboxData(tenantId, verificationAppId) {
    try {
      // Create demo product template
      const templateId = uuid();
      const templateQuery = `
        INSERT INTO product_templates (
          id, tenant_id, template_name, industry_type,
          variant_config, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `;

      await db.query(templateQuery, [
        templateId,
        tenantId,
        'Demo Product Template',
        'general',
        JSON.stringify({
          attributes: ['color', 'size', 'sku']
        }),
        true
      ]);

      // Create demo product
      const productId = uuid();
      const productQuery = `
        INSERT INTO products (
          id, tenant_id, verification_app_id,
          product_name, template_id,
          attributes, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `;

      await db.query(productQuery, [
        productId,
        tenantId,
        verificationAppId,
        'Demo Product - Test Item',
        templateId,
        JSON.stringify({
          color: 'Blue',
          size: 'M',
          sku: 'DEMO-001'
        }),
        true
      ]);

      // Create demo coupon batch
      const batchId = uuid();
      const batchQuery = `
        INSERT INTO coupon_batches (
          id, tenant_id, verification_app_id,
          batch_name, batch_code,
          status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `;

      await db.query(batchQuery, [
        batchId,
        tenantId,
        verificationAppId,
        'Demo Coupon Batch',
        'DEMO-BATCH-001',
        'draft'
      ]);

      // Create demo coupons
      const demoCoupons = [
        'SANDBOX-TEST-001',
        'SANDBOX-TEST-002',
        'SANDBOX-TEST-003'
      ];

      for (const couponCode of demoCoupons) {
        const couponId = uuid();
        const couponQuery = `
          INSERT INTO coupons (
            id, batch_id, tenant_id, coupon_code,
            status, created_at
          )
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT DO NOTHING
        `;

        await db.query(couponQuery, [
          couponId,
          batchId,
          tenantId,
          couponCode,
          'pending'
        ]);
      }

      logger.info(`[PROVISIONING] Sandbox data seeded`, {
        tenantId,
        verificationAppId,
        couponsCreated: demoCoupons.length
      });
    } catch (error) {
      logger.warn(`[PROVISIONING] Failed to seed sandbox data`, {
        tenantId,
        error: error.message
      });
      // Don't fail provisioning if seeding fails, just log warning
    }
  }

  /**
   * Send onboarding email to tenant admin
   * @private
   */
  async sendOnboardingEmail(email, adminUser, verificationApp, sandboxKeys) {
    try {
      const subject = '🚀 Welcome to Scan4Earn! Your Account is Ready';

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2c3e50;">Welcome to Scan4Earn! 🎉</h1>

          <p>Hi there,</p>

          <p>Your Scan4Earn account has been successfully created and is ready to use!</p>

          <h2 style="color: #34495e;">Getting Started</h2>

          <h3>1. Login Credentials</h3>
          <p>
            <strong>Email:</strong> ${email}<br>
            <strong>Temporary Password:</strong> <code style="background: #ecf0f1; padding: 5px 10px;">${adminUser.temporaryPassword}</code><br>
            <strong>Login URL:</strong> <a href="https://admin.scan4earn.com/login">https://admin.scan4earn.com/login</a>
          </p>
          <p style="color: #e74c3c; font-weight: bold;">⚠️ Please change your password immediately after logging in.</p>

          <h3>2. Your Primary Verification App</h3>
          <p>
            <strong>App Name:</strong> ${verificationApp.name}<br>
            <strong>App Code:</strong> ${verificationApp.code}
          </p>

          <h3>3. Sandbox API Keys (For Testing)</h3>
          <p>Use these keys to test your integration before going to production:</p>
          <p>
            <strong>Mobile API Key:</strong><br>
            <code style="background: #ecf0f1; padding: 5px 10px; word-break: break-all;">
              ${sandboxKeys.mobileApiKey}
            </code><br>
            <strong>Ecommerce API Key:</strong><br>
            <code style="background: #ecf0f1; padding: 5px 10px; word-break: break-all;">
              ${sandboxKeys.ecommerceApiKey}
            </code>
          </p>
          <p style="color: #27ae60;">✓ These keys are for sandbox/testing only. They expire in 90 days.</p>

          <h3>4. Next Steps</h3>
          <ol>
            <li><strong>Login</strong> to your admin portal</li>
            <li><strong>Change your password</strong> to something secure</li>
            <li><strong>Create products</strong> in your catalog</li>
            <li><strong>Create coupon batches</strong> for verification</li>
            <li><strong>Test the API</strong> with sandbox keys</li>
            <li><strong>Build your app</strong> using our SDK</li>
            <li><strong>Go live</strong> with production keys</li>
          </ol>

          <h3>5. Documentation & Support</h3>
          <p>
            <strong>API Documentation:</strong> <a href="https://docs.scan4earn.com">https://docs.scan4earn.com</a><br>
            <strong>SDK Guide:</strong> <a href="https://docs.scan4earn.com/sdk">https://docs.scan4earn.com/sdk</a><br>
            <strong>Starter Templates:</strong> <a href="https://docs.scan4earn.com/starter-templates">https://docs.scan4earn.com/starter-templates</a><br>
            <strong>Integration Examples:</strong> <a href="https://docs.scan4earn.com/examples">https://docs.scan4earn.com/examples</a>
          </p>

          <h3>6. Test Your Setup</h3>
          <p>We've created sandbox test coupons for you:</p>
          <ul>
            <li>SANDBOX-TEST-001</li>
            <li>SANDBOX-TEST-002</li>
            <li>SANDBOX-TEST-003</li>
          </ul>
          <p>Use these to test your QR scanning and redemption flows.</p>

          <h3>7. Questions?</h3>
          <p>
            <strong>Email:</strong> <a href="mailto:support@scan4earn.com">support@scan4earn.com</a><br>
            <strong>Chat:</strong> <a href="https://chat.scan4earn.com">https://chat.scan4earn.com</a><br>
            <strong>Phone:</strong> +91-XXX-XXX-XXXX (Available 9 AM - 6 PM IST)
          </p>

          <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 30px 0;">

          <p style="color: #7f8c8d; font-size: 12px;">
            This is an automated email from Scan4Earn. Please do not reply to this email.
            If you did not create this account, please contact us immediately.
          </p>
        </div>
      `;

      await sendEmail({
        to: email,
        subject,
        html: htmlContent
      });

      logger.info(`[PROVISIONING] Onboarding email sent`, {
        email
      });
    } catch (error) {
      logger.error(`[PROVISIONING] Failed to send onboarding email`, {
        email,
        error: error.message
      });
      // Don't fail provisioning if email fails, just log error
    }
  }

  /**
   * Update provisioning status in database
   * @private
   */
  async updateProvisioningStatus(
    tenantId,
    status,
    startTime = null,
    errorMessage = null
  ) {
    const completedAt = status === 'completed' ? 'CURRENT_TIMESTAMP' : null;

    let query = `
      UPDATE tenants
      SET
        provisioning_status = $1,
        provisioning_completed_at = ${completedAt || 'NULL'}
    `;

    const params = [status];

    if (startTime && status === 'in_progress') {
      query += `, provisioning_started_at = $${params.length + 1}`;
      params.push(startTime);
    }

    if (errorMessage) {
      query += `, provisioning_error_message = $${params.length + 1}`;
      params.push(errorMessage);
    } else if (status !== 'failed') {
      query += `, provisioning_error_message = NULL`;
    }

    query += ` WHERE id = $${params.length + 1}`;
    params.push(tenantId);

    await db.query(query, params);
  }

  /**
   * Log provisioning step
   * @private
   */
  async logProvisioningStep(
    tenantId,
    step,
    status = 'success',
    message = null
  ) {
    const query = `
      INSERT INTO tenant_provisioning_logs (
        tenant_id, step, status, message
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, step) DO UPDATE
      SET status = $3, message = $4
    `;

    await db.query(query, [tenantId, step, status, message]);
  }

  /**
   * Get provisioning settings
   * @private
   */
  async getProvisioningSettings() {
    const query = `
      SELECT setting_key, setting_value
      FROM provisioning_settings
    `;

    const result = await db.query(query);
    const settings = {};

    for (const row of result.rows) {
      settings[row.setting_key] = row.setting_value === 'true'; // Parse boolean
    }

    return settings;
  }

  /**
   * Get default verification app name
   * @private
   */
  async getDefaultAppName() {
    const query = `
      SELECT setting_value
      FROM provisioning_settings
      WHERE setting_key = 'default_verification_app_name'
    `;

    const result = await db.query(query);
    return result.rows[0]?.setting_value || 'Primary App';
  }

  /**
   * Generate temporary password
   * @private
   */
  generateTemporaryPassword() {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    const chars = uppercase + lowercase + numbers + special;
    let password = '';

    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest randomly
    for (let i = password.length; i < 12; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }

    // Shuffle
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }

  /**
   * Get provisioning status for a tenant
   */
  async getProvisioningStatus(tenantId) {
    const tenantQuery = `
      SELECT
        id, tenant_name, provisioning_status,
        provisioning_started_at, provisioning_completed_at,
        provisioning_error_message
      FROM tenants
      WHERE id = $1
    `;

    const logsQuery = `
      SELECT step, status, message, created_at
      FROM tenant_provisioning_logs
      WHERE tenant_id = $1
      ORDER BY created_at ASC
    `;

    const tenantResult = await db.query(tenantQuery, [tenantId]);
    const logsResult = await db.query(logsQuery, [tenantId]);

    if (tenantResult.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    const tenant = tenantResult.rows[0];

    return {
      tenantId,
      tenantName: tenant.tenant_name,
      status: tenant.provisioning_status,
      startedAt: tenant.provisioning_started_at,
      completedAt: tenant.provisioning_completed_at,
      errorMessage: tenant.provisioning_error_message,
      steps: logsResult.rows
    };
  }
}

module.exports = new TenantProvisioningService();
