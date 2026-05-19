const db = require('../config/database');

// Reserved subdomains that cannot be used by tenants
const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'app', 'mail', 'ftp',
  'localhost', 'staging', 'dev', 'test', 'demo',
  'cdn', 'assets', 'static', 'docs', 'help',
  'support', 'status', 'blog', 'forum', 'store',
  'super-admin', 'system', 'root', 'scan4earn',
  'dashboard', 'login', 'signup', 'register',
  'undefined', 'null', 'admin-panel'
];

class SlugGenerator {
  /**
   * Generate a URL-safe slug from tenant name (for suggestions)
   */
  static generateSlug(tenantName) {
    if (!tenantName || typeof tenantName !== 'string') {
      throw new Error('Tenant name is required');
    }

    // Convert to lowercase
    let slug = tenantName.toLowerCase();
    
    // Replace spaces and special chars with hyphens
    slug = slug.replace(/[^a-z0-9]+/g, '-');
    
    // Remove leading/trailing hyphens
    slug = slug.replace(/^-+|-+$/g, '');
    
    // Limit length to 50 characters
    slug = slug.substring(0, 50);
    
    // Ensure doesn't end with hyphen after truncation
    slug = slug.replace(/-+$/, '');
    
    // Ensure minimum length
    if (slug.length < 3) {
      slug = slug + '-tenant';
    }
    
    return slug;
  }

  /**
   * Check if slug is available in database
   */
  static async isSlugAvailable(slug) {
    try {
      const result = await db.query(
        'SELECT id FROM tenants WHERE subdomain_slug = $1',
        [slug]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error('Error checking slug availability:', error);
      throw error;
    }
  }

  /**
   * Check if slug is reserved
   */
  static isReserved(slug) {
    const reservedList = process.env.RESERVED_SUBDOMAINS 
      ? process.env.RESERVED_SUBDOMAINS.split(',') 
      : RESERVED_SUBDOMAINS;
    
    return reservedList.includes(slug.toLowerCase());
  }

  /**
   * Generate unique slug with conflict resolution
   */
  static async generateUniqueSlug(tenantName) {
    const baseSlug = this.generateSlug(tenantName);
    
    // Check if reserved
    if (this.isReserved(baseSlug)) {
      // Add suffix to bypass reserved names
      const altSlug = `${baseSlug}-tenant`;
      if (await this.isSlugAvailable(altSlug)) {
        return altSlug;
      }
    }
    
    // Check if available
    if (await this.isSlugAvailable(baseSlug)) {
      return baseSlug;
    }
    
    // Try with numbers appended
    for (let i = 2; i <= 100; i++) {
      const slug = `${baseSlug}-${i}`;
      if (await this.isSlugAvailable(slug)) {
        return slug;
      }
    }
    
    throw new Error('Unable to generate unique subdomain. Please try a different name.');
  }

  /**
   * Generate multiple slug suggestions from tenant name
   */
  static async generateSuggestions(tenantName) {
    if (!tenantName || typeof tenantName !== 'string') {
      return [];
    }

    const suggestions = new Set();
    const baseSlug = this.generateSlug(tenantName);
    
    // Add base slug
    suggestions.add(baseSlug);
    
    // Add variations
    const words = tenantName.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 0);
    
    if (words.length > 1) {
      // All words together without hyphens
      const combined = words.join('');
      if (combined.length >= 3 && combined.length <= 50) {
        suggestions.add(combined);
      }
      
      // First word only
      if (words[0].length >= 3) {
        suggestions.add(words[0]);
      }
      
      // First two words
      if (words.length >= 2) {
        const firstTwo = words.slice(0, 2).join('-');
        if (firstTwo.length <= 50) {
          suggestions.add(firstTwo);
        }
      }
      
      // Add abbreviated version (first letters)
      if (words.length >= 2) {
        const abbreviated = words.map(w => w[0]).join('');
        if (abbreviated.length >= 3) {
          suggestions.add(abbreviated);
        }
      }
    }
    
    // Filter available suggestions
    const available = [];
    for (const slug of suggestions) {
      if (!this.isReserved(slug) && await this.isSlugAvailable(slug)) {
        available.push(slug);
        if (available.length >= 5) break; // Limit to 5 suggestions
      }
    }
    
    // If no suggestions available, add numbered versions
    if (available.length === 0) {
      for (let i = 2; i <= 10; i++) {
        const numberedSlug = `${baseSlug}-${i}`;
        if (!this.isReserved(numberedSlug) && await this.isSlugAvailable(numberedSlug)) {
          available.push(numberedSlug);
          if (available.length >= 5) break;
        }
      }
    }
    
    return available.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Validate custom slug format (for user input)
   */
  static validateSlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return {
        valid: false,
        error: 'Subdomain is required'
      };
    }

    // Check length
    if (slug.length < 3) {
      return {
        valid: false,
        error: 'Subdomain must be at least 3 characters'
      };
    }

    if (slug.length > 50) {
      return {
        valid: false,
        error: 'Subdomain must be at most 50 characters'
      };
    }

    // Check format: lowercase letters, numbers, hyphens only
    // Must start and end with letter or number
    const regex = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
    if (!regex.test(slug)) {
      return {
        valid: false,
        error: 'Subdomain must contain only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.'
      };
    }

    // Check for consecutive hyphens
    if (slug.includes('--')) {
      return {
        valid: false,
        error: 'Subdomain cannot contain consecutive hyphens'
      };
    }
    
    // Check if reserved
    if (this.isReserved(slug)) {
      return {
        valid: false,
        error: 'This subdomain is reserved and cannot be used'
      };
    }
    
    return { valid: true };
  }
}

module.exports = SlugGenerator;
