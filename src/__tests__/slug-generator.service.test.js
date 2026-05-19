/**
 * Unit Tests for Slug Generator Service
 */
const slugGenerator = require('../../src/services/slug-generator.service');
const db = require('../../src/config/database');

// Mock database
jest.mock('../../src/config/database');

describe('Slug Generator Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSlugFromName', () => {
    it('should generate slug from simple tenant name', () => {
      const slug = slugGenerator.generateSlugFromName('Test Company');
      expect(slug).toBe('test-company');
    });

    it('should handle special characters', () => {
      const slug = slugGenerator.generateSlugFromName('Test & Company Ltd.');
      expect(slug).toBe('test-company-ltd');
    });

    it('should handle multiple spaces', () => {
      const slug = slugGenerator.generateSlugFromName('Test   Company   Name');
      expect(slug).toBe('test-company-name');
    });

    it('should remove leading/trailing hyphens', () => {
      const slug = slugGenerator.generateSlugFromName('---Test Company---');
      expect(slug).toBe('test-company');
    });

    it('should handle Unicode characters', () => {
      const slug = slugGenerator.generateSlugFromName('Tëst Çömpåny');
      expect(slug).toBe('test-compny');
    });

    it('should truncate to 50 characters', () => {
      const longName = 'A'.repeat(100);
      const slug = slugGenerator.generateSlugFromName(longName);
      expect(slug.length).toBeLessThanOrEqual(50);
    });

    it('should handle empty string', () => {
      const slug = slugGenerator.generateSlugFromName('');
      expect(slug).toBe('tenant');
    });

    it('should handle only special characters', () => {
      const slug = slugGenerator.generateSlugFromName('!@#$%^&*()');
      expect(slug).toBe('tenant');
    });
  });

  describe('validateCustomSlug', () => {
    it('should accept valid slug', () => {
      const result = slugGenerator.validateCustomSlug('test-company-123');
      expect(result.valid).toBe(true);
    });

    it('should reject slug shorter than 3 characters', () => {
      const result = slugGenerator.validateCustomSlug('ab');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('3 characters');
    });

    it('should reject slug longer than 50 characters', () => {
      const result = slugGenerator.validateCustomSlug('a'.repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50 characters');
    });

    it('should reject slug with uppercase letters', () => {
      const result = slugGenerator.validateCustomSlug('TestCompany');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase');
    });

    it('should reject slug with spaces', () => {
      const result = slugGenerator.validateCustomSlug('test company');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase letters, numbers');
    });

    it('should reject slug with special characters', () => {
      const result = slugGenerator.validateCustomSlug('test_company');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase letters, numbers');
    });

    it('should reject slug starting with hyphen', () => {
      const result = slugGenerator.validateCustomSlug('-test-company');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('alphanumeric');
    });

    it('should reject slug ending with hyphen', () => {
      const result = slugGenerator.validateCustomSlug('test-company-');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('alphanumeric');
    });

    it('should reject consecutive hyphens', () => {
      const result = slugGenerator.validateCustomSlug('test--company');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('consecutive hyphens');
    });

    it('should accept slug with numbers', () => {
      const result = slugGenerator.validateCustomSlug('test123');
      expect(result.valid).toBe(true);
    });

    it('should accept slug with single hyphens', () => {
      const result = slugGenerator.validateCustomSlug('test-company-name');
      expect(result.valid).toBe(true);
    });
  });

  describe('isReservedSlug', () => {
    it('should identify reserved subdomains', () => {
      expect(slugGenerator.isReservedSlug('www')).toBe(true);
      expect(slugGenerator.isReservedSlug('api')).toBe(true);
      expect(slugGenerator.isReservedSlug('admin')).toBe(true);
      expect(slugGenerator.isReservedSlug('app')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(slugGenerator.isReservedSlug('WWW')).toBe(true);
      expect(slugGenerator.isReservedSlug('Api')).toBe(true);
      expect(slugGenerator.isReservedSlug('ADMIN')).toBe(true);
    });

    it('should not flag non-reserved slugs', () => {
      expect(slugGenerator.isReservedSlug('test-company')).toBe(false);
      expect(slugGenerator.isReservedSlug('my-tenant')).toBe(false);
    });

    it('should identify all common reserved subdomains', () => {
      const reserved = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'smtp', 
                       'pop', 'imap', 'localhost', 'staging', 'dev', 'test', 'demo'];
      
      reserved.forEach(slug => {
        expect(slugGenerator.isReservedSlug(slug)).toBe(true);
      });
    });
  });

  describe('isSlugAvailable', () => {
    it('should return false if slug exists in database', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1 }] });
      
      const available = await slugGenerator.isSlugAvailable('existing-slug');
      
      expect(available).toBe(false);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('subdomain_slug'),
        ['existing-slug']
      );
    });

    it('should return true if slug does not exist', async () => {
      db.query.mockResolvedValue({ rows: [] });
      
      const available = await slugGenerator.isSlugAvailable('new-slug');
      
      expect(available).toBe(true);
    });

    it('should return false for reserved slugs', async () => {
      const available = await slugGenerator.isSlugAvailable('www');
      
      expect(available).toBe(false);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      db.query.mockRejectedValue(new Error('Database error'));
      
      await expect(slugGenerator.isSlugAvailable('test-slug')).rejects.toThrow('Database error');
    });
  });

  describe('generateSuggestions', () => {
    it('should generate 5 suggestions', async () => {
      db.query.mockResolvedValue({ rows: [] });
      
      const suggestions = await slugGenerator.generateSuggestions('Test Company');
      
      expect(suggestions).toHaveLength(5);
    });

    it('should return unique suggestions', async () => {
      db.query.mockResolvedValue({ rows: [] });
      
      const suggestions = await slugGenerator.generateSuggestions('Test Company');
      const uniqueSuggestions = new Set(suggestions);
      
      expect(uniqueSuggestions.size).toBe(suggestions.length);
    });

    it('should skip unavailable slugs', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // test-company taken
        .mockResolvedValueOnce({ rows: [] })           // test-company-inc available
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      
      const suggestions = await slugGenerator.generateSuggestions('Test Company');
      
      expect(suggestions).not.toContain('test-company');
      expect(suggestions.length).toBe(5);
    });

    it('should handle short names', async () => {
      db.query.mockResolvedValue({ rows: [] });
      
      const suggestions = await slugGenerator.generateSuggestions('AB');
      
      expect(suggestions).toHaveLength(5);
      suggestions.forEach(slug => {
        expect(slug.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('generateUniqueSlug', () => {
    it('should return base slug if available', async () => {
      db.query.mockResolvedValue({ rows: [] });
      
      const slug = await slugGenerator.generateUniqueSlug('Test Company');
      
      expect(slug).toBe('test-company');
    });

    it('should append -2 if base slug is taken', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // test-company taken
        .mockResolvedValueOnce({ rows: [] });          // test-company-2 available
      
      const slug = await slugGenerator.generateUniqueSlug('Test Company');
      
      expect(slug).toBe('test-company-2');
    });

    it('should increment suffix until available', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // test-company taken
        .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // test-company-2 taken
        .mockResolvedValueOnce({ rows: [{ id: 3 }] }) // test-company-3 taken
        .mockResolvedValueOnce({ rows: [] });          // test-company-4 available
      
      const slug = await slugGenerator.generateUniqueSlug('Test Company');
      
      expect(slug).toBe('test-company-4');
    });

    it('should handle reserved base slugs', async () => {
      db.query.mockResolvedValue({ rows: [] });
      
      const slug = await slugGenerator.generateUniqueSlug('WWW Services');
      
      expect(slug).not.toBe('www');
      expect(slug).toMatch(/^www-/);
    });
  });
});
