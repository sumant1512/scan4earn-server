/**
 * API Helper
 * Generic API helper with interceptors and error handling
 */

const request = require('supertest');

class APIHelper {
  constructor(app) {
    this.app = app;
    this.requestInterceptors = [];
    this.responseInterceptors = [];
  }

  /**
   * Add request interceptor
   * @param {Function} interceptor - Interceptor function
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   * @param {Function} interceptor - Interceptor function
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Apply request interceptors
   * @param {Object} req - Request object
   * @returns {Object} Modified request
   */
  _applyRequestInterceptors(req) {
    let modifiedReq = req;
    for (const interceptor of this.requestInterceptors) {
      modifiedReq = interceptor(modifiedReq);
    }
    return modifiedReq;
  }

  /**
   * Apply response interceptors
   * @param {Object} res - Response object
   * @returns {Object} Modified response
   */
  _applyResponseInterceptors(res) {
    let modifiedRes = res;
    for (const interceptor of this.responseInterceptors) {
      modifiedRes = interceptor(modifiedRes);
    }
    return modifiedRes;
  }

  /**
   * Generic GET request
   * @param {string} url - API endpoint
   * @param {string} token - Access token
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async get(url, token, options = {}) {
    try {
      let req = request(this.app).get(url);

      if (token) {
        req = req.set('Authorization', `Bearer ${token}`);
      }

      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          req = req.set(key, value);
        });
      }

      if (options.query) {
        req = req.query(options.query);
      }

      req = this._applyRequestInterceptors(req);
      const response = await req;
      return this._applyResponseInterceptors(response);
    } catch (error) {
      return this._handleError(error, 'GET', url);
    }
  }

  /**
   * Generic POST request
   * @param {string} url - API endpoint
   * @param {string} token - Access token
   * @param {Object} data - Request body
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async post(url, token, data, options = {}) {
    try {
      let req = request(this.app).post(url);

      if (token) {
        req = req.set('Authorization', `Bearer ${token}`);
      }

      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          req = req.set(key, value);
        });
      }

      req = this._applyRequestInterceptors(req);
      const response = await req.send(data);
      return this._applyResponseInterceptors(response);
    } catch (error) {
      return this._handleError(error, 'POST', url);
    }
  }

  /**
   * Generic PUT request
   * @param {string} url - API endpoint
   * @param {string} token - Access token
   * @param {Object} data - Request body
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async put(url, token, data, options = {}) {
    try {
      let req = request(this.app).put(url);

      if (token) {
        req = req.set('Authorization', `Bearer ${token}`);
      }

      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          req = req.set(key, value);
        });
      }

      req = this._applyRequestInterceptors(req);
      const response = await req.send(data);
      return this._applyResponseInterceptors(response);
    } catch (error) {
      return this._handleError(error, 'PUT', url);
    }
  }

  /**
   * Generic PATCH request
   * @param {string} url - API endpoint
   * @param {string} token - Access token
   * @param {Object} data - Request body
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async patch(url, token, data, options = {}) {
    try {
      let req = request(this.app).patch(url);

      if (token) {
        req = req.set('Authorization', `Bearer ${token}`);
      }

      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          req = req.set(key, value);
        });
      }

      req = this._applyRequestInterceptors(req);
      const response = await req.send(data);
      return this._applyResponseInterceptors(response);
    } catch (error) {
      return this._handleError(error, 'PATCH', url);
    }
  }

  /**
   * Generic DELETE request
   * @param {string} url - API endpoint
   * @param {string} token - Access token
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async delete(url, token, options = {}) {
    try {
      let req = request(this.app).delete(url);

      if (token) {
        req = req.set('Authorization', `Bearer ${token}`);
      }

      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          req = req.set(key, value);
        });
      }

      req = this._applyRequestInterceptors(req);
      const response = await req;
      return this._applyResponseInterceptors(response);
    } catch (error) {
      return this._handleError(error, 'DELETE', url);
    }
  }

  /**
   * Handle API errors
   * @param {Error} error - Error object
   * @param {string} method - HTTP method
   * @param {string} url - API endpoint
   * @returns {Object} Error response
   */
  _handleError(error, method, url) {
    console.error(`API Error [${method} ${url}]:`, error.message);

    // Return a structured error response
    return {
      status: error.status || 500,
      body: {
        success: false,
        message: error.message,
        error: error.toString()
      },
      error: error
    };
  }

  /**
   * Assert response status
   * @param {Object} response - Response object
   * @param {number} expectedStatus - Expected status code
   * @param {string} context - Context message
   */
  assertStatus(response, expectedStatus, context = '') {
    if (response.status !== expectedStatus) {
      const message = `${context ? context + ': ' : ''}Expected status ${expectedStatus}, got ${response.status}`;
      const details = response.body ? JSON.stringify(response.body) : '';
      throw new Error(`${message}. Response: ${details}`);
    }
  }

  /**
   * Assert response has success flag
   * @param {Object} response - Response object
   * @param {string} context - Context message
   */
  assertSuccess(response, context = '') {
    if (!response.body || response.body.success !== true) {
      const message = `${context ? context + ': ' : ''}Expected successful response`;
      const details = response.body ? JSON.stringify(response.body) : '';
      throw new Error(`${message}. Response: ${details}`);
    }
  }
}

module.exports = APIHelper;
