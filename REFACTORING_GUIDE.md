# Scan4Earn Server Refactoring Guide

## Overview

The Scan4Earn server codebase has been refactored to improve maintainability, reduce code duplication, and provide better error handling. This guide explains the new structure and how to use the refactored modules.

## New Folder Structure

```
src/
├── modules/
│   ├── common/                    # Shared utilities and middleware
│   │   ├── errors/
│   │   │   └── AppError.js       # Centralized error classes
│   │   ├── middleware/
│   │   │   └── errorHandler.middleware.js
│   │   ├── interceptors/
│   │   │   ├── request.interceptor.js
│   │   │   └── response.interceptor.js
│   │   ├── validators/
│   │   │   └── common.validator.js
│   │   └── utils/
│   │       ├── database.util.js   # DB helper functions
│   │       └── response.util.js   # Response formatters
│   │
│   ├── super-admin/               # Super admin specific modules
│   │   ├── controllers/
│   │   │   ├── tenant.controller.js
│   │   │   └── credit.controller.js
│   │   └── routes/
│   │       ├── index.js
│   │       ├── tenant.routes.js
│   │       └── credit.routes.js
│   │
│   ├── tenant-admin/              # Tenant admin specific modules
│   │   ├── controllers/
│   │   │   └── template.controller.js
│   │   └── routes/
│   │       ├── index.js
│   │       └── template.routes.js
│   │
│   └── shared/                    # Shared between roles (future)
│       ├── controllers/
│       ├── routes/
│       └── services/
│
├── controllers/                   # Legacy controllers (to be refactored)
├── routes/                        # Legacy routes (to be refactored)
├── services/                      # Business logic services
├── middleware/                    # Legacy middleware
└── server.js                      # Main application entry
```

## Key Features

### 1. Centralized Error Handling

All new controllers use custom error classes for consistent error responses:

```javascript
const { ValidationError, NotFoundError, ConflictError } = require('../../common/errors/AppError');

// Instead of:
if (!data) {
  return res.status(404).json({ error: 'Not found' });
}

// Use:
if (!data) {
  throw new NotFoundError('Resource');
}
```

### 2. Async Handler Wrapper

No more try-catch blocks in every controller method:

```javascript
const { asyncHandler } = require('../../common/middleware/errorHandler.middleware');

// Wrap all route handlers
createTenant = asyncHandler(async (req, res) => {
  // Your code here - errors automatically caught
  const result = await someAsyncOperation();
  return sendSuccess(res, result);
});
```

### 3. Standardized Response Formatters

Consistent API responses across all endpoints:

```javascript
const { sendSuccess, sendCreated, sendPaginated } = require('../../common/utils/response.util');

// Success response
sendSuccess(res, { user }, 'User created successfully');

// Created response (201)
sendCreated(res, { tenant }, 'Tenant created successfully');

// Paginated response
sendPaginated(res, items, page, limit, total, 'items');
```

### 4. Database Utilities

Reusable database operations:

```javascript
const { executeTransaction, executeQuery, buildPaginationQuery } = require('../../common/utils/database.util');

// Automatic transaction handling with rollback on error
const result = await executeTransaction(db, async (client) => {
  // All queries here are in a transaction
  const tenant = await client.query(...);
  const user = await client.query(...);
  return tenant;
});

// Safe query execution with error handling
const result = await executeQuery(db, query, params);
```

### 5. Request Interceptors

Common request processing:

```javascript
const { requestValidator, preventDuplicates, sanitizeBody } = require('../../common/interceptors/request.interceptor');

// Auto-validate pagination params and UUIDs
router.use(requestValidator);

// Prevent duplicate form submissions
router.post('/', preventDuplicates(2000), controller.create);

// Auto-sanitize request body
router.use(sanitizeBody);
```

### 6. Response Interceptors

Security and caching headers:

```javascript
const { securityHeaders, cacheControl } = require('../../common/interceptors/response.interceptor');

// Add security headers (X-Frame-Options, X-XSS-Protection, etc.)
app.use(securityHeaders);

// Set cache control per route
router.get('/public', cacheControl('public'), controller.getPublic);
```

### 7. Reusable Validators

DRY validation functions:

```javascript
const { validateRequiredFields, validateEmail, validatePrice } = require('../../common/validators/common.validator');

// Validate required fields
validateRequiredFields(req.body, ['name', 'email', 'phone']);

// Validate email format
validateEmail(email);

// Validate and parse price
const validPrice = validatePrice(price, 'product_price');
```

## API Endpoints

### New Modular Endpoints

#### Super Admin Routes (Refactored)
- `POST /api/super-admin/tenants` - Create tenant
- `GET /api/super-admin/tenants` - List all tenants
- `GET /api/super-admin/tenants/:id` - Get tenant by ID
- `PUT /api/super-admin/tenants/:id` - Update tenant
- `PATCH /api/super-admin/tenants/:id/status` - Toggle tenant status
- `GET /api/super-admin/tenants/:tenantId/admins` - Get tenant admins
- `GET /api/super-admin/tenants/check-slug/:slug` - Check subdomain availability
- `GET /api/super-admin/tenants/suggest-slugs` - Get subdomain suggestions
- `GET /api/super-admin/credits/requests` - Get credit requests
- `POST /api/super-admin/credits/approve/:id` - Approve credit request
- `POST /api/super-admin/credits/reject/:id` - Reject credit request
- `GET /api/super-admin/credits/balances` - Get all tenant balances
- `GET /api/super-admin/credits/transactions/:tenantId` - Get transaction history

#### Tenant Admin Routes (Refactored)
- `GET /api/tenant-admin/templates` - List templates
- `GET /api/tenant-admin/templates/:id` - Get template by ID
- `POST /api/tenant-admin/templates` - Create template
- `PUT /api/tenant-admin/templates/:id` - Update template
- `DELETE /api/tenant-admin/templates/:id` - Delete template
- `PATCH /api/tenant-admin/templates/:id/toggle-status` - Toggle template status
- `POST /api/tenant-admin/templates/:id/duplicate` - Duplicate template
- `GET /api/tenant-admin/templates/app/:appId` - Get templates for app

### Legacy Endpoints (To be refactored)

All existing `/api/*` endpoints continue to work as before. They will be gradually migrated to the new structure.

## Migration Guide

### For New Features

Use the new modular structure:

1. Create controller in appropriate module (super-admin, tenant-admin, or shared)
2. Use asyncHandler, error classes, and utilities
3. Create routes using interceptors
4. Add to module's index.js

Example:

```javascript
// modules/super-admin/controllers/user.controller.js
const { asyncHandler } = require('../../common/middleware/errorHandler.middleware');
const { sendSuccess } = require('../../common/utils/response.util');

class UserController {
  getUsers = asyncHandler(async (req, res) => {
    const users = await getUsersFromDB();
    return sendSuccess(res, { users });
  });
}

module.exports = new UserController();
```

### For Existing Features

Existing code continues to work. Gradually refactor by:

1. Moving controller to appropriate module folder
2. Replacing try-catch with asyncHandler
3. Replacing manual error responses with error classes
4. Using database utilities instead of raw queries
5. Using response formatters instead of res.json()
6. Moving routes to module folder

## Benefits

1. **Reduced Code Duplication**: Common patterns extracted to utilities
2. **Better Error Handling**: Consistent error responses, automatic error catching
3. **Improved Security**: Built-in request validation, sanitization, security headers
4. **Easier Testing**: Smaller, focused functions with clear responsibilities
5. **Better Organization**: Clear separation between super-admin and tenant-admin
6. **Maintainability**: Easier to find and update code
7. **Scalability**: Easy to add new features following established patterns

## Notes

- Legacy endpoints continue to work unchanged
- New features should use the modular structure
- Existing features can be gradually refactored
- E2E tests and documentation remain unchanged
- Database schema remains unchanged
