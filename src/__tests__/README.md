# Test Suite Documentation

## Overview

This directory contains comprehensive tests for the SCAN4EARN TMS backend, covering unit tests, integration tests, and end-to-end workflows.

## Test Structure

```
__tests__/
├── otp.service.test.js           # OTP generation and validation
├── user.service.test.js          # User management and tenants
├── email.service.test.js         # Email delivery and templates
├── auth.integration.test.js      # Auth API endpoints
├── user.integration.test.js      # User management APIs
└── e2e.test.js                   # Complete OTP login flow
```

## Quick Start

### 1. Setup

```bash
# Install dependencies
npm install

# Configure test environment
cp .env.example .env.test
# Edit .env.test with test values

# Create test database
psql -U postgres -c "CREATE DATABASE scan4earn_test_db;"
npm run migrate:test  # if migration script exists
```

### 2. Run Tests

```bash
# All tests
npm test

# With coverage report
npm test -- --coverage

# Watch mode for development
npm test -- --watch

# Specific test file
npm test otp.service.test.js

# Verbose output
npm test -- --verbose
```

## Test Categories

### Unit Tests

Test individual functions and services in isolation with mocked dependencies.

#### OTP Service (`otp.service.test.js`)
- **15 tests across 8 suites**
- Tests OTP generation, storage, verification, rate limiting
- Fully mocked database and email service

**Key Tests:**
- 6-digit OTP format generation
- Database storage with expiry calculation
- OTP validation (expired, used, invalid)
- Rate limiting (10 requests per 15 minutes)
- Cleanup of expired OTPs

#### User Service (`user.service.test.js`)
- **20+ tests across 7 suites**
- Tests tenant creation, user management, profile updates
- Transaction handling and rollback testing

**Key Tests:**
- Tenant creation with admin user
- User lookup by ID and email
- Profile updates (excluding sensitive fields)
- Pagination and filtering
- Error handling and validation

#### Email Service (`email.service.test.js`)
- **20+ tests across 6 suites**
- Tests email sending, templates, validation, rate limiting
- Mocked nodemailer transport

**Key Tests:**
- OTP email with correct template
- Welcome email personalization
- SMTP configuration
- Email validation
- Rate limiting and retry logic

### Integration Tests

Test API endpoints with mocked database and external services.

#### Auth API (`auth.integration.test.js`)
- **12+ tests across 4 endpoint groups**
- Tests complete authentication flow
- Validates request/response formats

**Endpoints Tested:**
- `POST /auth/request-otp` - OTP generation and delivery
- `POST /auth/verify-otp` - OTP validation and token issuance
- `POST /auth/refresh` - Token refresh and rotation
- `POST /auth/logout` - Token invalidation

#### User Management API (`user.integration.test.js`)
- **10+ tests across 3 endpoint groups**
- Tests user registration and profile management
- Validates input and authorization

**Endpoints Tested:**
- `POST /users/register-customer` - Customer registration
- `GET /users/profile` - Profile retrieval
- `PUT /users/profile` - Profile updates

### End-to-End Tests

Test complete user workflows with real database integration (requires test database).

#### Complete OTP Flow (`e2e.test.js`)
- **8 test scenarios**
- Full workflow from OTP request to dashboard access
- Real database operations

**Scenarios:**
1. Complete login: Request → Verify → Dashboard
2. OTP expiration handling
3. Attempt limit enforcement (max 3)
4. Token refresh workflow
5. Token invalidation and logout
6. Customer registration flow
7. Rate limiting enforcement

## Mocking Strategy

### Database Mocking
```javascript
jest.mock('../config/database');
db.query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
```

### Service Mocking
```javascript
jest.mock('../services/email.service');
emailService.sendEmail = jest.fn().mockResolvedValue(true);
```

### Authentication Mocking
```javascript
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'test-id', role: 'SUPER_ADMIN' };
    next();
  }
}));
```

## Common Test Patterns

### Async Testing
```javascript
it('should perform async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

### Error Testing
```javascript
it('should throw error for invalid input', async () => {
  await expect(functionThatThrows()).rejects.toThrow('Error message');
});
```

### Mock Verification
```javascript
it('should call database with correct parameters', async () => {
  await createOTP('test@example.com');
  
  expect(db.query).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO otps'),
    expect.arrayContaining(['test@example.com'])
  );
});
```

## Coverage Reports

Generate coverage report:
```bash
npm test -- --coverage
```

View HTML coverage report:
```bash
open coverage/lcov-report/index.html
```

### Coverage Targets
- **Statements:** 80%+
- **Branches:** 70%+
- **Functions:** 80%+
- **Lines:** 80%+

## Troubleshooting

### Tests Fail with "secretOrPrivateKey must have a value"
**Cause:** Missing JWT_SECRET or REFRESH_TOKEN_SECRET in .env.test  
**Fix:** Add to .env.test:
```
JWT_SECRET=test-secret-min-32-chars
REFRESH_TOKEN_SECRET=test-refresh-secret-min-32-chars
```

### Tests Fail with "column 'status' does not exist"
**Cause:** E2E tests reference non-existent column  
**Fix:** Update e2e.test.js line 37-40 to remove `status` column reference

### Tests Timeout
**Cause:** Database connection issues  
**Fix:** 
1. Verify test database is running
2. Check DB credentials in .env.test
3. Increase timeout: `jest.setTimeout(10000);`

### Mocks Not Working
**Cause:** Mock setup in wrong place or cleared prematurely  
**Fix:**
```javascript
beforeEach(() => {
  jest.clearAllMocks(); // Reset mocks before each test
});
```

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to set up fresh state
- Clean up after tests in `afterEach`

### 2. Descriptive Names
```javascript
// Good
it('should return 401 when OTP is expired', async () => { ... });

// Bad
it('test1', async () => { ... });
```

### 3. Arrange-Act-Assert Pattern
```javascript
it('should create OTP', async () => {
  // Arrange
  const email = 'test@example.com';
  db.query.mockResolvedValue({ rows: [] });
  
  // Act
  const result = await createOTP(email);
  
  // Assert
  expect(result).toBeDefined();
  expect(db.query).toHaveBeenCalled();
});
```

### 4. Test Edge Cases
- Empty inputs
- Null/undefined values
- Maximum/minimum values
- Concurrent requests
- Error conditions

### 5. Keep Tests Fast
- Mock external services
- Use in-memory databases when possible
- Avoid unnecessary waits
- Run unit tests frequently, E2E less often

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

## Manual Testing

For email delivery, use the manual test script:
```bash
node scripts/test-email.js your-email@example.com
```

## Adding New Tests

### 1. Create Test File
```bash
touch src/__tests__/new-service.test.js
```

### 2. Basic Structure
```javascript
const serviceToTest = require('../services/new-service');
const db = require('../config/database');

jest.mock('../config/database');

describe('New Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('functionName', () => {
    it('should do something', async () => {
      // Test implementation
    });
  });
});
```

### 3. Run and Verify
```bash
npm test new-service.test.js
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- Project Test Report: `../TEST_COMPLETION_REPORT.md`

## Support

For issues or questions:
1. Check this README
2. Review test completion report
3. Run fix script: `./fix-tests.sh`
4. Check individual test file comments

---

**Last Updated:** December 25, 2024  
**Framework:** Jest 29.7.0  
**Total Tests:** 83+  
**Coverage:** See `npm test -- --coverage`
