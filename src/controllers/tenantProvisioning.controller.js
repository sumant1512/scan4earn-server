const tenantProvisioningService = require('../services/tenantProvisioning.service');
const logger = require('../modules/common/logger/logger');

class TenantProvisioningController {
  /**
   * Trigger provisioning for a tenant
   * POST /api/super-admin/tenants/{id}/provision
   */
  async provisionTenant(req, res, next) {
    try {
      const { id: tenantId } = req.params;

      // Verify super admin
      if (req.userContext.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only super admins can provision tenants'
          }
        });
      }

      logger.info(`[PROVISIONING] Provisioning requested for tenant`, {
        tenantId,
        requestedBy: req.userContext.userId
      });

      // Get tenant data
      const db = require('../config/database');
      const tenantQuery = `
        SELECT id, tenant_name, email FROM tenants WHERE id = $1
      `;
      const tenantResult = await db.query(tenantQuery, [tenantId]);

      if (tenantResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Tenant not found'
          }
        });
      }

      const tenant = tenantResult.rows[0];

      // Trigger provisioning
      const provisioningResult = await tenantProvisioningService.provisionTenant({
        id: tenant.id,
        name: tenant.tenant_name,
        email: tenant.email
      });

      logger.info(`[PROVISIONING] ✓ Tenant provisioned successfully`, {
        tenantId,
        tenantName: tenant.tenant_name
      });

      return res.status(200).json({
        success: true,
        message: 'Tenant provisioned successfully',
        data: provisioningResult.data
      });
    } catch (error) {
      logger.error(`[PROVISIONING] Error provisioning tenant`, {
        error: error.message,
        tenantId: req.params.id
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'PROVISIONING_FAILED',
          message: error.message
        }
      });
    }
  }

  /**
   * Get provisioning status for a tenant
   * GET /api/super-admin/tenants/{id}/provisioning-status
   */
  async getProvisioningStatus(req, res, next) {
    try {
      const { id: tenantId } = req.params;

      // Verify super admin
      if (req.userContext.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only super admins can view provisioning status'
          }
        });
      }

      const status = await tenantProvisioningService.getProvisioningStatus(tenantId);

      return res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      if (error.message === 'Tenant not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Tenant not found'
          }
        });
      }

      logger.error(`[PROVISIONING] Error getting provisioning status`, {
        error: error.message,
        tenantId: req.params.id
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_RETRIEVAL_FAILED',
          message: error.message
        }
      });
    }
  }

  /**
   * Retry provisioning for a failed tenant
   * POST /api/super-admin/tenants/{id}/retry-provision
   */
  async retryProvisioning(req, res, next) {
    try {
      const { id: tenantId } = req.params;

      // Verify super admin
      if (req.userContext.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only super admins can retry provisioning'
          }
        });
      }

      logger.info(`[PROVISIONING] Retry provisioning for tenant`, {
        tenantId,
        requestedBy: req.userContext.userId
      });

      // Get tenant data
      const db = require('../config/database');
      const tenantQuery = `
        SELECT id, tenant_name, email, provisioning_status
        FROM tenants
        WHERE id = $1
      `;
      const tenantResult = await db.query(tenantQuery, [tenantId]);

      if (tenantResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Tenant not found'
          }
        });
      }

      const tenant = tenantResult.rows[0];

      // Can only retry failed provisions
      if (tenant.provisioning_status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CANNOT_RETRY',
            message: `Cannot retry provisioning for tenant in ${tenant.provisioning_status} status`
          }
        });
      }

      // Trigger provisioning again
      const provisioningResult = await tenantProvisioningService.provisionTenant({
        id: tenant.id,
        name: tenant.tenant_name,
        email: tenant.email
      });

      logger.info(`[PROVISIONING] ✓ Tenant provisioning retried successfully`, {
        tenantId,
        tenantName: tenant.tenant_name
      });

      return res.status(200).json({
        success: true,
        message: 'Tenant provisioning retried successfully',
        data: provisioningResult.data
      });
    } catch (error) {
      logger.error(`[PROVISIONING] Error retrying provisioning`, {
        error: error.message,
        tenantId: req.params.id
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'PROVISIONING_FAILED',
          message: error.message
        }
      });
    }
  }

  /**
   * Get provisioning settings
   * GET /api/super-admin/provisioning-settings
   */
  async getProvisioningSettings(req, res, next) {
    try {
      // Verify super admin
      if (req.userContext.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only super admins can view provisioning settings'
          }
        });
      }

      const db = require('../config/database');
      const query = `
        SELECT setting_key, setting_value, description
        FROM provisioning_settings
        ORDER BY setting_key
      `;

      const result = await db.query(query);

      const settings = {};
      for (const row of result.rows) {
        settings[row.setting_key] = {
          value: row.setting_value,
          description: row.description
        };
      }

      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      logger.error(`[PROVISIONING] Error getting provisioning settings`, {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'SETTINGS_RETRIEVAL_FAILED',
          message: error.message
        }
      });
    }
  }

  /**
   * Update provisioning settings
   * PUT /api/super-admin/provisioning-settings
   */
  async updateProvisioningSettings(req, res, next) {
    try {
      // Verify super admin
      if (req.userContext.userRole !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Only super admins can update provisioning settings'
          }
        });
      }

      const { settings } = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing or invalid settings object'
          }
        });
      }

      const db = require('../config/database');

      for (const [key, value] of Object.entries(settings)) {
        const query = `
          UPDATE provisioning_settings
          SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
          WHERE setting_key = $2
        `;

        await db.query(query, [String(value), key]);
      }

      logger.info(`[PROVISIONING] Provisioning settings updated`, {
        updatedBy: req.userContext.userId,
        keys: Object.keys(settings)
      });

      return res.status(200).json({
        success: true,
        message: 'Provisioning settings updated successfully'
      });
    } catch (error) {
      logger.error(`[PROVISIONING] Error updating provisioning settings`, {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'SETTINGS_UPDATE_FAILED',
          message: error.message
        }
      });
    }
  }
}

module.exports = new TenantProvisioningController();
