# TMS Backend API Documentation

## Base URL

```
Development: http://localhost:8080
Production: https://api.scan4earn.com
Subdomain: https://api.{tenant-slug}.scan4earn.com (if tenant-specific API endpoint)
```

## Subdomain Routing

The TMS system supports subdomain-based tenant routing. Each tenant has a unique subdomain:

**Examples:**

- Root domain: `https://scan4earn.com` (Super Admin)
- Tenant A: `https://acme.scan4earn.com`
- Tenant B: `https://global-transport.scan4earn.com`

**Local Development:**

- Root: `http://localhost:4200`
- Tenant: `http://tenant-slug.localhost:4200`

**Authentication:**

- JWT tokens include `subdomainSlug` field for tenant identification
- After OTP verification, users are redirected to their tenant's subdomain
- Subdomain validation ensures users can only access their tenant's data

## Authentication Flow

## Public Scan API

### Rate Limits

- `POST /api/public/scan/start`: 60 requests per 10 minutes per `(coupon_code, device_id, ip)`
- `POST /api/public/scan/:sessionId/mobile`: 10 requests per 24 hours per `mobile_e164` (falls back to IP)
- `POST /api/public/scan/:sessionId/verify-otp`: 20 requests per 10 minutes per `sessionId` (per-session)
- All endpoints also have a generic IP limiter (120 req/min). On limit, returns:

```json
{ "success": false, "error": "rate_limited*", "retry_after": "timestamp" }
```

### Telemetry Events

The system records structured events to `scan_events` (or logs if table not present):

- `scan_started`: `{ tenant_id, session_id, coupon_code, device_id }`
- `otp_sent`: `{ tenant_id, session_id, mobile_e164 (masked) }`
- `otp_failed`: `{ tenant_id, session_id, coupon_code, attempts }`
- `otp_verified`: `{ tenant_id, session_id, coupon_code, mobile_e164 }`
- `points_awarded`: `{ tenant_id, session_id, coupon_code, amount, balance }`
- `coupon_redeemed`: `{ tenant_id, session_id, coupon_code }`

### Flow

1. `POST /api/public/scan/start` → validates `coupon_code` is `active` and creates session.
2. `POST /api/public/scan/:sessionId/mobile` → captures `mobile_e164`, generates OTP.
3. `POST /api/public/scan/:sessionId/verify-otp` → verifies OTP, awards `coupon_points`, updates ledger, and marks coupon `used`.

### 1. Request OTP

```bash
POST /auth/request-otp
Content-Type: application/json

{
  "email": "sumantmishra511@gmail.com"
}

Response:
{
  "success": true,
  "message": "OTP sent to your email address",
  "expiresIn": 5
}
```

**Note:** Check `scan4earn-server/server.log` for the OTP code in development.

### 2. Verify OTP & Login

```bash
POST /auth/verify-otp
Content-Type: application/json

{
  "email": "sumantmishra511@gmail.com",
  "otp": "123456"
}

Response:
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "userType": "SUPER_ADMIN",
    "subdomain": null  // null for super admin, tenant slug for tenant users
  }
}
```

**JWT Token Payload:**

```json
{
  "userId": "uuid",
  "role": "TENANT_ADMIN",
  "tenantId": "tenant-uuid",
  "subdomainSlug": "acme-logistics", // Tenant's subdomain
  "jti": "unique-token-id",
  "type": "access",
  "iat": 1234567890,
  "exp": 1234569690
}
```

**Subdomain Redirect:**

- Super Admin: Remains on root domain (`scan4earn.com`)
- Tenant Users: Redirected to tenant subdomain after login (`acme-logistics.scan4earn.com`)

### 3. Get User Context

```bash
GET /auth/context
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "sumantmishra511@gmail.com",
    "fullName": "System Administrator",
    "role": "SUPER_ADMIN",
    "permissions": [
      "view_all_tenants",
      "create_customer",
      "manage_users",
      "view_system_stats",
      "access_admin_panel"
    ]
  }
}
```

### 4. Refresh Token

```bash
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGci..."
}

Response:
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

### 5. Logout

```bash
POST /auth/logout
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "refreshToken": "eyJhbGci..."
}

Response:
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Permission-Based Authorization

Scan4Earn implements granular permission-based access control. All authenticated endpoints check for specific permissions.

### Permission System Overview

- **SUPER_ADMIN**: Bypasses all permission checks (full system access)
- **TENANT_ADMIN**: Full CRUD permissions for all tenant resources
- **TENANT_USER**: Read-only permissions (view-only access)

### Permissions in JWT Token

User permissions are included in the JWT token payload:

```json
{
  "userId": "uuid",
  "role": "TENANT_ADMIN",
  "tenantId": "uuid",
  "permissions": [
    "create_app",
    "edit_app",
    "delete_app",
    "view_apps",
    "create_coupon",
    "edit_coupon"
    // ... more permissions
  ]
}
```

### Permission Error Response

When a user lacks required permission, endpoints return:

```json
{
  "success": false,
  "message": "Insufficient permissions to perform this action",
  "code": "PERMISSION_DENIED",
  "details": {
    "required": ["create_coupon"],
    "mode": "any"
  }
}
```

### Common Permissions

#### Verification App Permissions

- `create_app` - Create verification apps
- `edit_app` - Modify verification apps
- `delete_app` - Delete verification apps
- `view_apps` - View verification apps (read-only)

#### Coupon Permissions

- `create_coupon` - Create coupons
- `edit_coupon` - Modify/activate/deactivate coupons
- `delete_coupon` - Delete coupons
- `view_coupons` - View coupons (read-only)
- `create_batch` - Create coupon batches
- `edit_batch` - Modify batches
- `view_batches` - View batches

#### Product & Category Permissions

- `create_product` / `edit_product` / `delete_product` / `view_products`
- `create_category` / `edit_category` / `delete_category` / `view_categories`

#### Credit Permissions

- `request_credits` - Request credit top-ups (TENANT_ADMIN only)
- `view_credit_balance` - View credit balance
- `view_credit_transactions` - View credit history

#### Analytics Permissions

- `view_analytics` - Access analytics dashboard
- `view_scans` - View scan history

#### User Management Permissions

- `create_tenant_user` / `edit_tenant_user` / `delete_tenant_user`
- `assign_permissions` - Assign permissions to users
- `view_tenant_users` / `view_permissions` - View users and permissions

**For complete permission list, see:** `scan4earn-server/PERMISSIONS.md`

### Testing Permissions

Use the `/auth/context` endpoint to see current user's permissions:

```bash
GET /auth/context
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "TENANT_ADMIN",
    "permissions": ["create_app", "edit_app", ...],
    "tenant": { ... }
  }
}
```

## Feature Flags (Super Admin Only)

Feature flags allow controlled rollout of new features to specific tenants. Features are defined globally and can be enabled/disabled per tenant.

### Create Feature

```bash
POST /api/features
Authorization: Bearer {superAdminAccessToken}
Content-Type: application/json

{
  "code": "advanced-reporting",
  "name": "Advanced Reporting",
  "description": "Enhanced analytics and reporting features",
  "default_enabled": false
}

Response:
{
  "status": true,
  "message": "Feature created successfully",
  "data": {
    "feature": {
      "id": "uuid",
      "code": "advanced-reporting",
      "name": "Advanced Reporting",
      "description": "Enhanced analytics and reporting features",
      "is_active": true,
      "default_enabled": false,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  }
}
```

### List Features

```bash
GET /api/features
Authorization: Bearer {superAdminAccessToken}

Response:
{
  "status": true,
  "data": {
    "features": [
      {
        "id": "uuid",
        "code": "advanced-reporting",
        "name": "Advanced Reporting",
        "description": "Enhanced analytics and reporting features",
        "is_active": true,
        "default_enabled": false,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

### Enable Feature for Tenant

```bash
POST /api/features/tenants/{tenantId}/features/{featureId}
Authorization: Bearer {superAdminAccessToken}

Response:
{
  "status": true,
  "message": "Feature enabled for tenant",
  "data": {
    "tenant_feature": {
      "id": "uuid",
      "tenant_id": "{tenantId}",
      "feature_id": "{featureId}",
      "enabled": true,
      "enabled_at": "2024-01-01T00:00:00Z",
      "enabled_by": "uuid"
    }
  }
}
```

### Disable Feature for Tenant

```bash
DELETE /api/features/tenants/{tenantId}/features/{featureId}
Authorization: Bearer {superAdminAccessToken}

Response:
{
  "status": true,
  "message": "Feature disabled for tenant"
}
```

### Get Tenant Features

```bash
GET /api/features/tenants/{tenantId}/features
Authorization: Bearer {accessToken}

Response:
{
  "status": true,
  "data": {
    "features": [
      {
        "id": "uuid",
        "tenant_id": "{tenantId}",
        "feature_id": "uuid",
        "enabled": true,
        "enabled_at": "2024-01-01T00:00:00Z",
        "enabled_by": "uuid",
        "code": "advanced-reporting",
        "name": "Advanced Reporting",
        "description": "Enhanced analytics and reporting features",
        "enabled_for_tenant": true
      }
    ]
  }
}
```

### Check Feature Status

```bash
GET /api/features/tenants/{tenantId}/features/{featureCode}/check
Authorization: Bearer {accessToken}

Response:
{
  "status": true,
  "data": {
    "enabled": true
  }
}
```

## User Management (Super Admin Only)

### Create Customer (Tenant)

```bash
POST /users/customers
Authorization: Bearer {superAdminAccessToken}
Content-Type: application/json

{
  "companyName": "Test Transport Co",
  "adminEmail": "admin@testtransport.com",
  "adminName": "John Doe",
  "contactPhone": "+1234567890",
  "address": "123 Test Street, Test City",
  "subdomainSlug": "test-transport"  // Optional: custom subdomain (auto-generated if omitted)
}

Response:
{
  "success": true,
  "message": "Customer created successfully",
  "data": {
    "tenant": {
      "id": "uuid",
      "companyName": "Test Transport Co",
      "contactEmail": "admin@testtransport.com",
      "subdomainSlug": "test-transport"  // Generated or custom subdomain
    },
    "admin": {
      "id": "uuid",
      "email": "admin@testtransport.com",
      "fullName": "John Doe",
      "role": "TENANT_ADMIN"
    }
  }
}
```

**Subdomain Slug Rules:**

- 3-50 characters
- Lowercase alphanumeric and hyphens only
- Cannot use reserved subdomains (www, api, admin, app, etc.)
- Must be unique across all tenants
- Auto-generated from company name if not provided

### Get All Customers

```bash
GET /users/customers
Authorization: Bearer {superAdminAccessToken}

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "companyName": "Test Transport Co",
      "contactEmail": "admin@testtransport.com",
      "contactPhone": "+1234567890",
      "address": "123 Test Street",
      "subdomainSlug": "test-transport",  // Tenant's subdomain
      "isActive": true,
      "userCount": 1,
      "createdAt": "2025-12-26T00:00:00.000Z"
    }
  ]
}
```

## User Profile

### Get Profile

```bash
GET /users/profile
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "sumantmishra511@gmail.com",
    "fullName": "System Administrator",
    "phone": null,
    "role": "SUPER_ADMIN",
    "isActive": true,
    "createdAt": "2025-12-26T00:00:00.000Z"
  }
}
```

### Update Profile

```bash
PUT /users/profile
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "fullName": "Updated Name",
  "phone": "+9876543210"
}

Response:
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "uuid",
    "email": "sumantmishra511@gmail.com",
    "fullName": "Updated Name",
    "phone": "+9876543210",
    "role": "SUPER_ADMIN"
  }
}
```

## Dashboard

### Get Dashboard Stats

```bash
GET /dashboard/stats
Authorization: Bearer {accessToken}

# Super Admin Response:
{
  "success": true,
  "data": {
    "totalTenants": 1,
    "totalUsers": 2,
    "activeSessions24h": 1,
    "systemHealth": "healthy",
    "recentTenants": [
      {
        "id": "uuid",
        "companyName": "Test Transport Co",
        "contactEmail": "admin@testtransport.com",
        "createdAt": "2025-12-26T00:00:00.000Z"
      }
    ]
  }
}

# Tenant User Response:
{
  "success": true,
  "data": {
    "tenant": {
      "companyName": "Test Transport Co",
      "contactEmail": "admin@testtransport.com",
      "memberSince": "2025-12-26T00:00:00.000Z"
    },
    "totalUsers": 1,
    "activeUsers24h": 1,
    "recentActivity": [
      {
        "action": "LOGIN",
        "user": "John Doe",
        "email": "admin@testtransport.com",
        "timestamp": "2025-12-26T00:00:00.000Z"
      }
    ]
  }
}
```

## Health Check

```bash
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2025-12-26T00:00:00.000Z",
  "database": "connected"
}
```

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "message": "Email is required"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Invalid token"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 409 Conflict

```json
{
  "success": false,
  "message": "A user with this email already exists"
}
```

### 429 Too Many Requests

```json
{
  "success": false,
  "message": "Too many OTP requests. Please try again in 10 minutes"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Internal Server Error"
}
```

---

## Tenant Subdomain Management

### Check Subdomain Availability

Real-time availability checker for tenant subdomain registration.

```bash
GET /tenants/check-slug/:slug
Authorization: Bearer {accessToken}

# Example
GET /tenants/check-slug/acme-logistics

Response (Available):
{
  "success": true,
  "available": true,
  "slug": "acme-logistics",
  "message": "Subdomain is available"
}

Response (Taken):
{
  "success": true,
  "available": false,
  "slug": "acme",
  "message": "Subdomain is already taken",
  "suggestions": [
    "acme-2",
    "acme-logistics",
    "acme-transport"
  ]
}

Response (Invalid):
{
  "success": false,
  "available": false,
  "slug": "a",
  "message": "Subdomain must be 3-50 characters",
  "error": "Invalid slug format"
}

Response (Reserved):
{
  "success": false,
  "available": false,
  "slug": "www",
  "message": "This subdomain is reserved",
  "error": "Reserved subdomain"
}
```

**Reserved Subdomains:**

- System: `www`, `api`, `admin`, `app`, `mail`, `ftp`, `smtp`, `pop`, `imap`
- DNS: `ns1`, `ns2`, `localhost`
- Environments: `staging`, `dev`, `test`, `demo`

### Get Subdomain Suggestions

Generate alternative subdomain slugs based on tenant name.

```bash
GET /tenants/suggest-slugs?name={tenantName}
Authorization: Bearer {accessToken}

# Example
GET /tenants/suggest-slugs?name=Acme%20Logistics%20Inc

Response:
{
  "success": true,
  "suggestions": [
    "acme-logistics-inc",
    "acme-logistics",
    "acme",
    "acme-inc",
    "acmelogistics"
  ]
}
```

**Slug Generation Rules:**

- Convert to lowercase
- Replace spaces with hyphens
- Remove special characters
- Trim to 50 characters max
- Ensure minimum 3 characters
- Check against reserved list
- Verify uniqueness in database

### Create Tenant with Custom Subdomain

```bash
POST /tenants
Authorization: Bearer {superAdminAccessToken}
Content-Type: application/json

{
  "companyName": "Acme Logistics",
  "contactEmail": "admin@acme.com",
  "adminName": "John Smith",
  "contactPhone": "+1234567890",
  "address": "123 Business St",
  "subdomainSlug": "acme"  // Optional: auto-generated if omitted
}

Response (Success):
{
  "success": true,
  "message": "Tenant created successfully",
  "data": {
    "id": "uuid",
    "companyName": "Acme Logistics",
    "contactEmail": "admin@acme.com",
    "subdomainSlug": "acme",
    "tenantUrl": "https://acme.scan4earn.com"
  }
}

Response (Conflict):
{
  "success": false,
  "message": "Subdomain 'acme' is already taken",
  "suggestions": [
    "acme-2",
    "acme-logistics",
    "acme-transport"
  ]
}
```

### Get Tenant by Subdomain

```bash
GET /tenants/by-subdomain/:slug
Authorization: Bearer {accessToken}

# Example
GET /tenants/by-subdomain/acme

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "companyName": "Acme Logistics",
    "subdomainSlug": "acme",
    "contactEmail": "admin@acme.com",
    "isActive": true,
    "createdAt": "2025-12-26T00:00:00.000Z"
  }
}
```

### Subdomain Validation in Authentication

When a tenant user logs in, the system validates that they're accessing from the correct subdomain:

```bash
GET /auth/context
Authorization: Bearer {accessToken}
Host: acme.scan4earn.com

Response (Valid Subdomain):
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@acme.com",
    "role": "TENANT_ADMIN",
    "tenant": {
      "id": "uuid",
      "name": "Acme Logistics",
      "subdomain": "acme"
    }
  }
}

Response (Subdomain Mismatch):
{
  "success": false,
  "message": "Subdomain mismatch. Please access from your tenant's subdomain: acme.scan4earn.com",
  "expectedSubdomain": "acme",
  "currentSubdomain": "wrong-subdomain"
}
```

---

---

## Multi-App Architecture (Verification Apps)

### Overview

Tenants can create multiple verification applications (mobile apps, web apps) with isolated data but shared user credits. Each app gets a unique API key for external integration.

**Key Features:**

- Isolated categories, products, and coupons per app
- Shared user credits across all tenant apps
- Secure API key authentication for external apps
- "All Apps" vs single app filtering in dashboard

### Internal APIs (Tenant Dashboard)

#### Get Verification Apps

```bash
GET /api/rewards/verification-apps
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "data": [
    {
      "verification_app_id": 1,
      "app_name": "Mobile App",
      "code": "mobile-app-1",
      "api_key": "a1b2c3...",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Create Verification App

**Required Permission:** `create_app`

```bash
POST /api/rewards/verification-apps
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "app_name": "Mobile App"
}

Response:
{
  "success": true,
  "message": "Verification app created successfully",
  "data": {
    "verification_app_id": 1,
    "app_name": "Mobile App",
    "code": "mobile-app-1",
    "api_key": "64-character-hex-string",
    "is_active": true
  }
}
```

#### Regenerate API Key

**Required Permission:** `edit_app`

```bash
POST /api/rewards/verification-apps/:id/regenerate-api-key
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "message": "API key regenerated successfully",
  "data": {
    "verification_app_id": 1,
    "api_key": "new-64-character-hex-string"
  }
}
```

#### Toggle App Status

**Required Permission:** `edit_app`

```bash
PATCH /api/rewards/verification-apps/:id/toggle-status
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "message": "App activated/deactivated successfully",
  "data": {
    "verification_app_id": 1,
    "is_active": true
  }
}
```

#### Delete Verification App

**Required Permission:** `delete_app`

```bash
DELETE /api/rewards/verification-apps/:id
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "message": "Verification app deleted successfully",
  "stats": {
    "categories_deleted": 5,
    "products_deleted": 20,
    "batches_affected": 3,
    "coupons_affected": 100
  }
}
```

#### Get Categories (App-Filtered)

```bash
GET /api/categories?app_id=1
Authorization: Bearer {accessToken}

# app_id=1 returns only categories for app 1
# Omit app_id to see all categories across all apps

Response:
{
  "success": true,
  "categories": [
    {
      "category_id": 1,
      "category_name": "Electronics",
      "verification_app_id": 1,
      "app_name": "Mobile App"
    }
  ]
}
```

#### Get Products (App-Filtered)

```bash
GET /api/products?app_id=1
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "products": [
    {
      "product_id": 1,
      "product_name": "Headphones",
      "points": 500,
      "verification_app_id": 1,
      "app_name": "Mobile App"
    }
  ]
}
```

### User Credits API (Internal)

#### Get User Credits

```bash
GET /api/user-credits/:userId
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "data": {
    "user_id": 123,
    "balance": 1500,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Add Credits (Admin)

```bash
POST /api/user-credits/:userId/add
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "amount": 500,
  "description": "Bonus credits",
  "verification_app_id": 1
}

Response:
{
  "success": true,
  "message": "Credits added successfully",
  "data": {
    "transaction_id": 1,
    "user_id": 123,
    "amount": 500,
    "new_balance": 2000
  }
}
```

#### Deduct Credits (Admin)

```bash
POST /api/user-credits/:userId/deduct
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "amount": 200,
  "description": "Refund processing",
  "verification_app_id": 1
}

Response:
{
  "success": true,
  "message": "Credits deducted successfully",
  "data": {
    "transaction_id": 2,
    "user_id": 123,
    "amount": 200,
    "new_balance": 1800
  }
}
```

#### Adjust Credits (Admin)

```bash
POST /api/user-credits/:userId/adjust
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "amount": -100,
  "reason": "Correction for double entry",
  "verification_app_id": 1
}

Response:
{
  "success": true,
  "message": "Credits adjusted successfully",
  "data": {
    "transaction_id": 3,
    "user_id": 123,
    "adjustment": -100,
    "new_balance": 1700
  }
}
```

#### Get Credit Transactions

```bash
GET /api/user-credits/:userId/transactions?limit=50&offset=0
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "data": [
    {
      "transaction_id": 1,
      "transaction_type": "earn",
      "amount": 100,
      "balance_after": 1700,
      "description": "Earned from scanning",
      "verification_app_id": 1,
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

#### Get Credit Stats

```bash
GET /api/user-credits/:userId/stats
Authorization: Bearer {accessToken}

Response:
{
  "success": true,
  "data": {
    "total_earned": 2500,
    "total_spent": 800,
    "current_balance": 1700,
    "by_app": [
      {
        "verification_app_id": 1,
        "app_name": "Mobile App",
        "earned": 1500,
        "spent": 500
      }
    ]
  }
}
```

### External App APIs

**Authentication:** All external app endpoints require API key authentication via Bearer token.

```
Authorization: Bearer {api_key}
```

For complete external API documentation, see [EXTERNAL_APP_API.md](./EXTERNAL_APP_API.md)

#### External Endpoints Summary

- `GET /api/app/:appCode/categories` - Get app categories
- `GET /api/app/:appCode/products` - Get app products
- `GET /api/app/:appCode/users/:userId/credits` - Get user balance
- `GET /api/app/:appCode/users/:userId/credit-transactions` - Transaction history
- `POST /api/app/:appCode/scans` - Scan coupon and earn credits
- `POST /api/app/:appCode/redeem` - Redeem credits for product

**Example External Request:**

```bash
curl -X GET \
  "https://tenant.scan4earn.com/api/app/mobile-app-1/categories" \
  -H "Authorization: Bearer a1b2c3d4e5f6..."
```

---

## Multi-App Architecture APIs

### Verification Apps Management (Internal - Tenant Admin)

#### Create Verification App

```bash
POST /api/rewards/verification-apps
Authorization: Bearer {tenant_jwt}
Content-Type: application/json

{
  "app_name": "iOS Loyalty App",
  "description": "Main customer-facing iOS app"
}

Response:
{
  "success": true,
  "app": {
    "id": "uuid",
    "app_name": "iOS Loyalty App",
    "code": "ios-loyalty-app",
    "api_key": "generated-secure-key",
    "description": "Main customer-facing iOS app",
    "is_active": true,
    "created_at": "2024-01-10T...",
    "updated_at": "2024-01-10T..."
  }
}
```

#### List Verification Apps

```bash
GET /api/rewards/verification-apps
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "apps": [
    {
      "id": "uuid",
      "app_name": "iOS Loyalty App",
      "code": "ios-loyalty-app",
      "description": "Main customer-facing iOS app",
      "is_active": true,
      "created_at": "2024-01-10T..."
    }
  ]
}
```

#### Update Verification App

```bash
PUT /api/rewards/verification-apps/:id
Authorization: Bearer {tenant_jwt}
Content-Type: application/json

{
  "app_name": "Updated iOS App",
  "description": "Updated description",
  "is_active": true
}

Response:
{
  "success": true,
  "app": { ...updated app object }
}
```

#### Regenerate API Key

```bash
POST /api/rewards/verification-apps/:id/regenerate-key
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "api_key": "new-generated-secure-key"
}
```

#### Toggle App Status

```bash
PATCH /api/rewards/verification-apps/:id/toggle
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "is_active": false
}
```

#### Delete Verification App

```bash
DELETE /api/rewards/verification-apps/:id
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "message": "Verification app deleted successfully"
}
```

### User Credits Management

#### Get User Credits

```bash
GET /api/user-credits/:userId
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "credits": {
    "user_credit_id": "uuid",
    "user_id": "uuid",
    "tenant_id": "uuid",
    "balance": 150,
    "created_at": "2024-01-10T...",
    "updated_at": "2024-01-10T..."
  }
}
```

#### Get Credit Transactions

```bash
GET /api/user-credits/:userId/transactions?page=1&limit=20
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "transactions": [
    {
      "transaction_id": "uuid",
      "user_credit_id": "uuid",
      "transaction_type": "earn",
      "amount": 10,
      "balance_after": 150,
      "reference_type": "coupon_scan",
      "reference_id": "coupon-uuid",
      "description": "Scanned coupon ABC123",
      "created_at": "2024-01-10T..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

#### Add Credits (Admin)

```bash
POST /api/user-credits/:userId/add
Authorization: Bearer {tenant_jwt}
Content-Type: application/json

{
  "amount": 50,
  "description": "Bonus credits for referral"
}

Response:
{
  "success": true,
  "credits": {
    "balance": 200,
    "transaction_id": "uuid"
  }
}
```

#### Deduct Credits (Admin)

```bash
POST /api/user-credits/:userId/deduct
Authorization: Bearer {tenant_jwt}
Content-Type: application/json

{
  "amount": 25,
  "description": "Manual adjustment"
}

Response:
{
  "success": true,
  "credits": {
    "balance": 175,
    "transaction_id": "uuid"
  }
}
```

#### Adjust Credits (Admin)

```bash
POST /api/user-credits/:userId/adjust
Authorization: Bearer {tenant_jwt}
Content-Type: application/json

{
  "amount": -10,
  "description": "Correction for duplicate scan"
}

Response:
{
  "success": true,
  "credits": {
    "balance": 165,
    "transaction_id": "uuid"
  }
}
```

#### Get Credit Stats

```bash
GET /api/user-credits/:userId/stats
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "stats": {
    "total_earned": 250,
    "total_spent": 85,
    "current_balance": 165,
    "transaction_count": 23,
    "last_transaction_date": "2024-01-10T..."
  }
}
```

### App-Scoped Data Filtering

All categories and products APIs now support filtering by app:

#### Get Categories (with app filter)

```bash
GET /api/categories?app_id=uuid
GET /api/categories?app_id=all  # Show all apps
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "categories": [
    {
      "id": "uuid",
      "name": "Electronics",
      "icon": "phone_iphone",
      "description": "Electronic devices",
      "verification_app_id": "uuid",
      "app_name": "iOS Loyalty App",
      "app_code": "ios-loyalty-app",
      "product_count": 15,
      "created_at": "2024-01-10T..."
    }
  ]
}
```

#### Get Products (with app filter)

```bash
GET /api/products?app_id=uuid
GET /api/products?app_id=all  # Show all apps
Authorization: Bearer {tenant_jwt}

Response:
{
  "success": true,
  "products": [
    {
      "id": "uuid",
      "name": "iPhone 15",
      "sku": "IPH15-128",
      "category_id": "uuid",
      "category_name": "Electronics",
      "verification_app_id": "uuid",
      "app_name": "iOS Loyalty App",
      "points_required": 1000,
      "stock": 50,
      "created_at": "2024-01-10T..."
    }
  ]
}
```

---

## Default Users

### Super Admin

- **Email:** sumantmishra511@gmail.com
- **Login:** Use OTP authentication

### Test Tenant Admin (after creating customer)

- **Email:** admin@testtransport.com
- **Login:** Use OTP authentication

## Development Notes

- OTPs are logged to console in development mode (check `server.log`)
- Access tokens expire in 30 minutes
- Refresh tokens expire in 7 days
- OTP rate limit: 3 requests per 15 minutes per email
- OTP expires in 5 minutes
- Maximum OTP attempts: 3

## Testing with cURL

```bash
# Full login flow
OTP_RESPONSE=$(curl -s -X POST http://localhost:8080/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"sumantmishra511@gmail.com"}')

# Check logs for OTP
tail -1 scan4earn-server/server.log

# Verify OTP (replace 123456 with actual OTP)
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8080/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"sumantmishra511@gmail.com","otp":"123456"}')

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

# Get dashboard stats
curl -s http://localhost:8080/api/dashboard/stats \
  -H "Authorization: Bearer $TOKEN"
```

---

## Analytics Dashboard API

The Analytics API provides comprehensive insights into tenant scan activity, customer behavior, geographic trends, and campaign performance.

### Base Path

```
/api/v1/tenants/:tenantId/analytics
```

### Authentication

All analytics endpoints require authentication with one of the following roles:

- `SUPER_ADMIN`
- `TENANT_ADMIN`
- `TENANT_USER`

Users can only access analytics for their own tenant (verified by `tenant_id` in JWT token).

---

### 1. Overview Dashboard Statistics

Get high-level statistics for the tenant dashboard.

**Endpoint:** `GET /api/v1/tenants/:tenantId/analytics/overview`

**Query Parameters:**

- `dateFrom` (optional): ISO 8601 date string (e.g., "2026-01-01T00:00:00Z")
- `dateTo` (optional): ISO 8601 date string

**Response:**

```json
{
  "success": true,
  "data": {
    "total_scans": 15420,
    "unique_customers": 3245,
    "successful_scans": 14890,
    "failed_scans": 530,
    "total_rewards_given": "154500.00",
    "total_coupons_created": 50000,
    "active_coupons": 48670,
    "total_campaigns": 12,
    "active_campaigns": 3,
    "success_rate": "96.56"
  }
}
```

**Example:**

```bash
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/overview?dateFrom=2026-01-01T00:00:00Z&dateTo=2026-01-17T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN"
```

---

### 2. Scan Trends Over Time

Get time-series data for scan trends visualization (line charts).

**Endpoint:** `GET /api/v1/tenants/:tenantId/analytics/trends`

**Query Parameters:**

- `dateFrom` (optional): ISO 8601 date string (default: 30 days ago)
- `dateTo` (optional): ISO 8601 date string (default: now)
- `interval` (optional): `hour`, `day`, or `week` (default: `day`)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "period": "2026-01-15T00:00:00.000Z",
      "total_scans": 450,
      "successful_scans": 432,
      "failed_scans": 18,
      "total_rewards": "4500.00",
      "unique_customers": 287
    },
    {
      "period": "2026-01-16T00:00:00.000Z",
      "total_scans": 523,
      "successful_scans": 510,
      "failed_scans": 13,
      "total_rewards": "5200.00",
      "unique_customers": 312
    }
  ]
}
```

**Example:**

```bash
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/trends?interval=day" \
  -H "Authorization: Bearer $TOKEN"
```

---

### 3. Top Cities by Scan Volume

Get geographic insights showing top performing cities.

**Endpoint:** `GET /api/v1/tenants/:tenantId/analytics/top-cities`

**Query Parameters:**

- `limit` (optional): Number of cities to return (default: 10, max: 50)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "city": "Mumbai",
      "state": "Maharashtra",
      "scan_count": 2450,
      "successful_scans": 2380,
      "total_rewards": "24500.00",
      "unique_customers": 856
    },
    {
      "city": "Delhi",
      "state": "Delhi",
      "scan_count": 1890,
      "successful_scans": 1845,
      "total_rewards": "18900.00",
      "unique_customers": 623
    }
  ]
}
```

---

### 4. Enhanced Scan History

Get paginated scan history with advanced filtering.

**Endpoint:** `GET /api/v1/tenants/:tenantId/analytics/scans`

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)
- `status` (optional): Filter by scan status (`success` or `failed`)
- `city` (optional): Filter by customer city (partial match)
- `dateFrom` (optional): ISO 8601 date string
- `dateTo` (optional): ISO 8601 date string
- `customerId` (optional): Filter by specific customer UUID
- `productId` (optional): Filter by specific product UUID
- `campaignId` (optional): Filter by specific campaign UUID

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "scan_timestamp": "2026-01-17T10:30:00Z",
      "scan_status": "success",
      "customer_id": "uuid",
      "customer_name": "John Doe",
      "customer_email": "john@example.com",
      "customer_phone": "+919876543210",
      "customer_city": "Mumbai",
      "customer_state": "Maharashtra",
      "product_id": "uuid",
      "product_name": "Product A",
      "coupon_code": "ABC123",
      "campaign_name": "New Year Campaign",
      "reward_amount": "10.00",
      "location_address": "123 Street, Mumbai",
      "latitude": "19.0760",
      "longitude": "72.8777"
    }
  ],
  "pagination": {
    "total": 15420,
    "page": 1,
    "limit": 50,
    "totalPages": 309
  }
}
```

**Example:**

```bash
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/scans?page=1&limit=50&status=success&city=Mumbai" \
  -H "Authorization: Bearer $TOKEN"
```

---

### 5. Export Scan History to Excel

Download scan history as Excel file (.xlsx).

**Endpoint:** `GET /api/v1/tenants/:tenantId/analytics/scans/export`

**Query Parameters:** (Same as scan history filters)

- `status`, `city`, `dateFrom`, `dateTo`, `customerId`, `productId`, `campaignId`

**Response:** Excel file download (Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

**Note:** Export is limited to 10,000 records. Requires `SUPER_ADMIN` or `TENANT_ADMIN` role.

**Example:**

```bash
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/scans/export?dateFrom=2026-01-01T00:00:00Z" \
  -H "Authorization: Bearer $TOKEN" \
  --output scan-history.xlsx
```

---

### 6. Customer Analytics

Get customer insights with ranking and behavior metrics.

**Endpoint:** `GET /api/v1/tenants/:tenantId/analytics/customers`

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)
- `sortBy` (optional): Sort column - `total_rewards_won`, `total_codes_redeemed`, `avg_reward_per_scan`, `member_since` (default: `total_rewards_won`)
- `sortOrder` (optional): `ASC` or `DESC` (default: `DESC`)
- `minScans` (optional): Minimum number of scans to include customer (default: 0)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "customer_id": "uuid",
      "tenant_id": "uuid",
      "full_name": "John Doe",
      "email": "john@example.com",
      "phone": "+919876543210",
      "total_products_purchased": 0,
      "total_codes_redeemed": 45,
      "total_rewards_won": "450.00",
      "first_scan_location": "123 Street, Mumbai",
      "first_scan_city": "Mumbai",
      "first_scan_state": "Maharashtra",
      "last_scan_date": "2026-01-17T10:30:00Z",
      "favorite_product_id": "uuid",
      "favorite_product_name": "Product A",
      "avg_reward_per_scan": "10.00",
      "member_since": "2025-12-01T08:00:00Z",
      "updated_at": "2026-01-17T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 3245,
    "page": 1,
    "limit": 50,
    "totalPages": 65
  }
}
```

**Example:**

```bash
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/customers?sortBy=total_rewards_won&sortOrder=DESC&minScans=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

### 7. Scan Map Data

Get location data for map-based visualization.

**Endpoint:** `GET /api/v1/tenants/:tenantId/analytics/map`

**Query Parameters:**

- `dateFrom` (optional): ISO 8601 date string
- `dateTo` (optional): ISO 8601 date string
- `limit` (optional): Maximum locations to return (default: 1000, max: 5000)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "latitude": "19.0760",
      "longitude": "72.8777",
      "location_address": "123 Street, Mumbai",
      "customer_city": "Mumbai",
      "customer_state": "Maharashtra",
      "reward_amount": "10.00",
      "scan_timestamp": "2026-01-17T10:30:00Z",
      "scan_status": "success"
    }
  ]
}
```

**Example:**

```bash
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/map?limit=500" \
  -H "Authorization: Bearer $TOKEN"
```

---

### 8. Campaign Performance Metrics

Get performance metrics for reward campaigns.

**Get All Campaigns:**
`GET /api/v1/tenants/:tenantId/analytics/campaigns`

**Get Specific Campaign:**
`GET /api/v1/tenants/:tenantId/analytics/campaigns/:campaignId`

**Response (all campaigns):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "New Year Campaign",
      "start_date": "2026-01-01T00:00:00Z",
      "end_date": "2026-01-31T23:59:59Z",
      "status": "active",
      "reward_type": "custom",
      "common_amount": null,
      "total_scans": 4523,
      "successful_scans": 4401,
      "total_rewards_distributed": "44010.00",
      "unique_participants": 1234
    }
  ]
}
```

**Response (single campaign):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "New Year Campaign",
    "start_date": "2026-01-01T00:00:00Z",
    "end_date": "2026-01-31T23:59:59Z",
    "status": "active",
    "reward_type": "custom",
    "common_amount": null,
    "total_scans": 4523,
    "successful_scans": 4401,
    "total_rewards_distributed": "44010.00",
    "unique_participants": 1234
  }
}
```

**Example:**

```bash
# Get all campaigns
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/campaigns" \
  -H "Authorization: Bearer $TOKEN"

# Get specific campaign
curl -X GET "http://localhost:8080/api/v1/tenants/{tenantId}/analytics/campaigns/{campaignId}" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Error Responses

All analytics endpoints follow the standard error response format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Technical error details"
}
```

**Common HTTP Status Codes:**

- `200 OK`: Success
- `403 Forbidden`: User doesn't have access to this tenant
- `404 Not Found`: Campaign/resource not found
- `500 Internal Server Error`: Database or server error

---

## Performance Considerations

1. **Customer Analytics Cache**: Customer metrics are pre-computed and cached in `customer_analytics_cache` table, updated automatically via triggers on successful scans.

2. **Date Range Queries**: Use date filters (`dateFrom`, `dateTo`) to limit result sets for better performance.

3. **Pagination**: Large result sets are paginated. Use `page` and `limit` parameters appropriately.

4. **Export Limits**: Excel exports are capped at 10,000 records to prevent memory issues.

5. **Map Data Limits**: Map visualizations are limited to 5,000 locations. Use date filters to focus on recent data.

---

## Database Tables Used

- `scans` or `scan_history`: Raw scan data with timestamps, locations, rewards
- `customer_analytics_cache`: Pre-computed customer metrics
- `reward_campaigns`: Campaign definitions and settings
- `coupon_batches`: Batch information with dealer/zone tracking
- `coupons`: Individual coupon data with serial numbers
- `products`: Product catalog
- `product_categories`: Product categorization
- `customers`: Customer profiles
