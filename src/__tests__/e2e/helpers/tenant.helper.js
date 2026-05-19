/**
 * Tenant Helper
 * Handles tenant creation and management for E2E tests
 */

const request = require('supertest');

class TenantHelper {
  constructor(app) {
    this.app = app;
  }

  /**
   * Create a tenant
   * @param {string} token - Super admin token
   * @param {Object} data - Tenant data
   * @returns {Promise<Object>} Created tenant
   */
  async createTenant(token, { name, email, slug, phone = '+1234567890' }) {
    const response = await request(this.app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_name: name,
        admin_email: email,
        admin_name: `${name} Admin`,
        admin_phone: phone,
        subdomain_slug: slug,
        max_users: 10,
        max_products: 1000,
        status: 'active'
      });

    if (response.status !== 201) {
      throw new Error(`Tenant creation failed: ${response.status} - ${JSON.stringify(response.body)}`);
    }

    return response.body.tenant;
  }

  /**
   * Get tenant by ID
   * @param {string} token - Access token
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Tenant
   */
  async getTenantById(token, tenantId) {
    const response = await request(this.app)
      .get(`/api/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${token}`);

    if (response.status !== 200) {
      throw new Error(`Get tenant failed: ${response.status}`);
    }

    return response.body.tenant;
  }

  /**
   * Update tenant
   * @param {string} token - Access token
   * @param {string} tenantId - Tenant ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated tenant
   */
  async updateTenant(token, tenantId, data) {
    const response = await request(this.app)
      .put(`/api/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(data);

    if (response.status !== 200) {
      throw new Error(`Update tenant failed: ${response.status}`);
    }

    return response.body.tenant;
  }

  /**
   * Delete tenant (only for cleanup)
   * @param {string} token - Super admin token
   * @param {string} tenantId - Tenant ID
   */
  async deleteTenant(token, tenantId) {
    const response = await request(this.app)
      .delete(`/api/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${token}`);

    return response.status === 200 || response.status === 404;
  }
}

module.exports = TenantHelper;
