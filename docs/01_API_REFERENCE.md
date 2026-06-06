# MScan API Reference

**Version:** 1.0
**Last Updated:** 2026-01-26
**Base URL:** `http://localhost:8080/api` (Development)
**Protocol:** REST with JSON

---

## Table of Contents

1. [Authentication](#authentication)
2. [Authorization](#authorization)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [API Endpoints](#api-endpoints)
   - [Authentication APIs](#1-authentication-apis)
   - [Tenant Management APIs](#2-tenant-management-apis)
   - [Verification Apps APIs](#3-verification-apps-apis)
   - [Coupon Management APIs](#4-coupon-management-apis)
   - [Product Catalog APIs](#5-product-catalog-apis)
   - [Product Templates APIs](#6-product-templates-apis)
   - [Tag Management APIs](#7-tag-management-apis)
   - [Credit Management APIs](#8-credit-management-apis)
   - [Tenant Users APIs](#9-tenant-users-apis)
   - [Permissions APIs](#10-permissions-apis)
   - [Mobile Scan APIs](#11-mobile-scan-apis)
   - [Mobile API V2](#12-mobile-api-v2)
   - [Mobile Auth APIs](#13-mobile-auth-apis)
   - [Public Scan APIs](#14-public-scan-apis)
   - [External App APIs](#15-external-app-apis)
   - [E-commerce APIs](#16-e-commerce-apis)
   - [User Management APIs](#17-user-management-apis)
   - [User Credits APIs](#18-user-credits-apis)
   - [Dashboard APIs](#19-dashboard-apis)
   - [API Configuration APIs](#20-api-configuration-apis)
   - [Inventory APIs](#21-inventory-apis)
   - [Webhook APIs](#22-webhook-apis)
   - [Batch Operations APIs](#23-batch-operations-apis)
   - [Campaign Management APIs](#24-campaign-management-apis)

---

## Authentication

MScan uses JWT (JSON Web Token) based authentication with a two-token strategy:

- **Access Token**: Short-lived (30 minutes), used for API requests
- **Refresh Token**: Long-lived (7 days), used to obtain new access tokens

### Authentication Flow

1. Request OTP via email (`POST /api/auth/request-otp`)
2. Verify OTP and receive tokens (`POST /api/auth/verify-otp`)
3. Include access token in subsequent requests
4. Refresh token when access token expires (`POST /api/auth/refresh`)

### Token Usage

Include the access token in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

---

## Authorization

MScan implements role-based access control (RBAC) with fine-grained permissions:

### Roles

1. **SUPER_ADMIN**: Platform-level administration
2. **TENANT_ADMIN**: Tenant management and configuration
3. **TENANT_USER**: Limited tenant access with assigned permissions

### Permission System

Permissions are granular and can be assigned to users:
- `create_coupon`, `view_coupons`, `edit_coupon`
- `create_app`, `view_apps`, `edit_app`
- `view_products`, `create_product`, `edit_product`
- `request_credits`, `approve_credits`
- `manage_tenant_users`, `assign_permissions`
- And many more...

### API Key Authentication

Some endpoints use API key authentication:
- **Mobile API**: `X-Mobile-API-Key` header
- **E-commerce API**: `X-Ecommerce-API-Key` header
- **External App API**: `X-App-API-Key` header

---

## Error Handling

All errors follow a standard format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Rate Limiting

Public endpoints have rate limiting:

- **Public Scan Start**: 10 requests per IP per hour
- **Mobile Collection**: 5 requests per session per 15 minutes
- **OTP Verification**: 5 attempts per session per 15 minutes

---

## API Endpoints

### 1. Authentication APIs

**Base Path:** `/api/auth`

#### 1.1 Request OTP

Request OTP for login via email.

**Endpoint:** `POST /api/auth/request-otp`
**Auth Required:** No
**Permissions:** None

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to your email"
}
```

---

#### 1.2 Verify OTP

Verify OTP and receive access/refresh tokens.

**Endpoint:** `POST /api/auth/verify-otp`
**Auth Required:** No
**Permissions:** None

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "userType": "TENANT_ADMIN",
    "subdomain": "acme"
  }
}
```

---

#### 1.3 Refresh Access Token

Obtain new access token using refresh token.

**Endpoint:** `POST /api/auth/refresh`
**Auth Required:** No
**Permissions:** None

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

#### 1.4 Get User Context

Get current authenticated user context.

**Endpoint:** `GET /api/auth/context`
**Auth Required:** Yes
**Permissions:** None

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@acme.com",
    "fullName": "John Doe",
    "role": "TENANT_ADMIN",
    "permissions": ["create_coupon", "view_coupons", "edit_coupon"],
    "tenant": {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "tenant_name": "Acme Corp",
      "subdomain_slug": "acme"
    }
  }
}
```

---

#### 1.5 Logout

Logout and blacklist tokens.

**Endpoint:** `POST /api/auth/logout`
**Auth Required:** Yes
**Permissions:** None

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 2. Tenant Management APIs

**Base Path:** `/api/tenants`

#### 2.1 Check Subdomain Availability

Check if a subdomain slug is available.

**Endpoint:** `GET /api/tenants/check-slug/:slug`
**Auth Required:** No
**Permissions:** None

**Response (200):**
```json
{
  "available": true,
  "message": "Subdomain is available"
}
```

---

#### 2.2 Get Suggested Slugs

Get suggested subdomain slugs based on tenant name.

**Endpoint:** `GET /api/tenants/suggest-slugs?tenantName=Acme%20Corporation`
**Auth Required:** No
**Permissions:** None

**Response (200):**
```json
{
  "suggestions": ["acme-corp", "acme-corporation", "acme"],
  "count": 3
}
```

---

#### 2.3 Create Tenant

Create a new tenant (Super Admin only).

**Endpoint:** `POST /api/tenants`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Request Body:**
```json
{
  "tenant_name": "Acme Corporation",
  "email": "admin@acme.com",
  "phone": "+1234567890",
  "address": "123 Business St, City, State 12345",
  "contact_person": "John Doe",
  "subdomain_slug": "acme"
}
```

**Response (201):**
```json
{
  "message": "Tenant created successfully",
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "tenant_name": "Acme Corporation",
    "email": "admin@acme.com",
    "subdomain_slug": "acme",
    "is_active": true,
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 2.4 Get All Tenants

List all tenants with pagination and filtering (Super Admin only).

**Endpoint:** `GET /api/tenants?page=1&limit=20&status=active&search=acme`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20, max: 100)
- `status` (optional): Filter by status (active/inactive)
- `search` (optional): Search by name or email

**Response (200):**
```json
{
  "tenants": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "tenant_name": "Acme Corporation",
      "email": "admin@acme.com",
      "subdomain_slug": "acme",
      "is_active": true,
      "created_at": "2026-01-26T10:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "total_pages": 1
}
```

---

#### 2.5 Get Tenant by ID

Get detailed information for a specific tenant (Super Admin only).

**Endpoint:** `GET /api/tenants/:id`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Response (200):**
```json
{
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "tenant_name": "Acme Corporation",
    "email": "admin@acme.com",
    "phone": "+1234567890",
    "address": "123 Business St",
    "contact_person": "John Doe",
    "subdomain_slug": "acme",
    "is_active": true,
    "created_at": "2026-01-26T10:30:00Z",
    "updated_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 2.6 Get Tenant Admins

Get list of admin users for a tenant (Super Admin only).

**Endpoint:** `GET /api/tenants/:tenantId/admins`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Response (200):**
```json
{
  "admins": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "admin@acme.com",
      "full_name": "John Doe",
      "role": "TENANT_ADMIN",
      "is_active": true
    }
  ]
}
```

---

#### 2.7 Update Tenant

Update tenant information (Super Admin only).

**Endpoint:** `PUT /api/tenants/:id`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Request Body:**
```json
{
  "tenant_name": "Acme Corp Updated",
  "phone": "+1234567891",
  "address": "456 New Address"
}
```

**Response (200):**
```json
{
  "message": "Tenant updated successfully",
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "tenant_name": "Acme Corp Updated",
    "phone": "+1234567891"
  }
}
```

---

#### 2.8 Toggle Tenant Status

Activate or deactivate a tenant (Super Admin only).

**Endpoint:** `PATCH /api/tenants/:id/status`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Response (200):**
```json
{
  "message": "Tenant status updated",
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "is_active": false
  }
}
```

---

### 3. Verification Apps APIs

**Base Path:** `/api/rewards/verification-apps`

#### 3.1 Create Verification App

Create a new verification app for QR code scanning.

**Endpoint:** `POST /api/rewards/verification-apps`
**Auth Required:** Yes
**Permissions:** `create_app`

**Request Body:**
```json
{
  "app_name": "Acme Rewards App",
  "description": "Mobile rewards application",
  "business_type": "Retail",
  "logo_url": "https://example.com/logo.png",
  "primary_color": "#FF5733",
  "secondary_color": "#C70039",
  "welcome_message": "Welcome to Acme Rewards!",
  "scan_success_message": "Points added successfully!",
  "scan_failure_message": "Invalid or expired coupon"
}
```

**Response (201):**
```json
{
  "message": "Verification app created successfully",
  "app": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "app_name": "Acme Rewards App",
    "code": "ACME001",
    "api_key": "va_1234567890abcdef",
    "is_active": true,
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 3.2 List Verification Apps

Get all verification apps for the tenant.

**Endpoint:** `GET /api/rewards/verification-apps?page=1&limit=20`
**Auth Required:** Yes
**Permissions:** `view_apps`

**Response (200):**
```json
{
  "apps": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "app_name": "Acme Rewards App",
      "code": "ACME001",
      "is_active": true,
      "total_coupons": 1500,
      "total_scans": 342
    }
  ],
  "total": 1
}
```

---

#### 3.3 Get Verification App

Get detailed information for a specific app.

**Endpoint:** `GET /api/rewards/verification-apps/:id`
**Auth Required:** Yes
**Permissions:** `view_apps`

**Response (200):**
```json
{
  "app": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
    "app_name": "Acme Rewards App",
    "code": "ACME001",
    "api_key": "va_1234567890abcdef",
    "description": "Mobile rewards application",
    "logo_url": "https://example.com/logo.png",
    "primary_color": "#FF5733",
    "secondary_color": "#C70039",
    "is_active": true,
    "total_coupons": 1500,
    "total_scans": 342
  }
}
```

---

#### 3.4 Update Verification App

Update verification app details.

**Endpoint:** `PUT /api/rewards/verification-apps/:id`
**Auth Required:** Yes
**Permissions:** `edit_app`

**Request Body:**
```json
{
  "app_name": "Acme Rewards Pro",
  "welcome_message": "Welcome back!",
  "primary_color": "#0066CC"
}
```

**Response (200):**
```json
{
  "message": "App updated successfully",
  "app": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "app_name": "Acme Rewards Pro",
    "primary_color": "#0066CC"
  }
}
```

---

#### 3.5 Regenerate API Key

Regenerate the API key for a verification app.

**Endpoint:** `POST /api/rewards/verification-apps/:id/regenerate-key`
**Auth Required:** Yes
**Permissions:** `edit_app`

**Response (200):**
```json
{
  "message": "API key regenerated",
  "api_key": "va_newkey1234567890"
}
```

---

### 4. Coupon Management APIs

**Base Path:** `/api/rewards/coupons`

#### 4.1 Create Single Coupon

Create a single coupon.

**Endpoint:** `POST /api/rewards/coupons`
**Auth Required:** Yes
**Permissions:** `create_coupon`

**Request Body:**
```json
{
  "verification_app_id": "770e8400-e29b-41d4-a716-446655440000",
  "discount_type": "FIXED_AMOUNT",
  "discount_value": 50.00,
  "discount_currency": "INR",
  "expiry_date": "2026-12-31T23:59:59Z",
  "total_usage_limit": 1,
  "per_user_usage_limit": 1,
  "description": "Discount on purchase",
  "terms": "Valid on orders above 500 INR",
  "product_id": 123,
  "product_name": "Asian Paints Royale",
  "product_sku": "AP-ROY-001"
}
```

**Response (201):**
```json
{
  "message": "Coupon created successfully",
  "coupon": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "coupon_code": "ACME-ABC123",
    "coupon_reference": "CP-001",
    "discount_type": "FIXED_AMOUNT",
    "discount_value": 50.00,
    "status": "draft",
    "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?data=ACME-ABC123",
    "credit_cost": 10,
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 4.2 Create Multi-Batch Coupons

Create multiple batches of coupons.

**Endpoint:** `POST /api/rewards/coupons/multi-batch`
**Auth Required:** Yes
**Permissions:** `create_batch`

**Request Body:**
```json
{
  "verification_app_id": "770e8400-e29b-41d4-a716-446655440000",
  "batches": [
    {
      "batch_name": "Dealer A - Zone North",
      "dealer_name": "Dealer A",
      "zone": "North",
      "quantity": 100
    },
    {
      "batch_name": "Dealer B - Zone South",
      "dealer_name": "Dealer B",
      "zone": "South",
      "quantity": 150
    }
  ],
  "discount_type": "FIXED_AMOUNT",
  "discount_value": 50.00,
  "expiry_date": "2026-12-31T23:59:59Z",
  "product_id": 123
}
```

**Response (201):**
```json
{
  "message": "Multi-batch coupons created successfully",
  "batches": [
    {
      "batch_id": "batch-001",
      "batch_name": "Dealer A - Zone North",
      "coupons_created": 100
    },
    {
      "batch_id": "batch-002",
      "batch_name": "Dealer B - Zone South",
      "coupons_created": 150
    }
  ],
  "total_coupons": 250,
  "total_credits_used": 2500
}
```

---

#### 4.3 List Coupons

Get all coupons with filtering and pagination.

**Endpoint:** `GET /api/rewards/coupons?page=1&limit=20&status=active&verification_app_id=...`
**Auth Required:** Yes
**Permissions:** `view_coupons`

**Query Parameters:**
- `page`: Page number
- `limit`: Results per page
- `status`: Filter by status (draft, printed, active, used, expired)
- `verification_app_id`: Filter by app
- `product_id`: Filter by product
- `search`: Search by code or reference

**Response (200):**
```json
{
  "coupons": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "coupon_code": "ACME-ABC123",
      "coupon_reference": "CP-001",
      "status": "active",
      "discount_type": "FIXED_AMOUNT",
      "discount_value": 50.00,
      "expiry_date": "2026-12-31T23:59:59Z",
      "current_usage_count": 0,
      "total_usage_limit": 1,
      "product_name": "Asian Paints Royale"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

#### 4.4 Get Coupon by ID

Get detailed coupon information.

**Endpoint:** `GET /api/rewards/coupons/:id`
**Auth Required:** Yes
**Permissions:** `view_coupons`

**Response (200):**
```json
{
  "coupon": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "coupon_code": "ACME-ABC123",
    "coupon_reference": "CP-001",
    "status": "active",
    "discount_type": "FIXED_AMOUNT",
    "discount_value": 50.00,
    "discount_currency": "INR",
    "expiry_date": "2026-12-31T23:59:59Z",
    "total_usage_limit": 1,
    "per_user_usage_limit": 1,
    "current_usage_count": 0,
    "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?data=ACME-ABC123",
    "product_id": 123,
    "product_name": "Asian Paints Royale",
    "product_sku": "AP-ROY-001",
    "batch_id": "batch-001",
    "created_at": "2026-01-26T10:30:00Z",
    "activated_at": "2026-01-26T11:00:00Z"
  }
}
```

---

#### 4.5 Update Coupon Status

Update coupon status (activate, deactivate, etc.).

**Endpoint:** `PATCH /api/rewards/coupons/:id/status`
**Auth Required:** Yes
**Permissions:** `edit_coupon`

**Request Body:**
```json
{
  "status": "active",
  "activation_note": "Activated for January campaign"
}
```

**Response (200):**
```json
{
  "message": "Coupon status updated",
  "coupon": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "status": "active",
    "activated_at": "2026-01-26T11:00:00Z"
  }
}
```

---

#### 4.6 Activate Coupon Range

Activate a range of coupons by serial numbers.

**Endpoint:** `POST /api/rewards/coupons/activate-range`
**Auth Required:** Yes
**Permissions:** `edit_coupon`

**Request Body:**
```json
{
  "batch_id": "batch-001",
  "serial_start": 30001,
  "serial_end": 30100,
  "activation_note": "Activated for dealer distribution"
}
```

**Response (200):**
```json
{
  "message": "Coupons activated successfully",
  "activated_count": 100
}
```

---

#### 4.7 Activate Entire Batch

Activate all coupons in a batch.

**Endpoint:** `POST /api/rewards/coupons/activate-batch`
**Auth Required:** Yes
**Permissions:** `edit_coupon`

**Request Body:**
```json
{
  "batch_id": "batch-001",
  "activation_note": "Batch activation for January campaign"
}
```

**Response (200):**
```json
{
  "message": "Batch activated successfully",
  "activated_count": 250
}
```

---

#### 4.8 Bulk Activate Coupons

Activate multiple coupons by IDs or codes.

**Endpoint:** `POST /api/rewards/coupons/bulk-activate`
**Auth Required:** Yes
**Permissions:** `edit_coupon`

**Request Body:**
```json
{
  "coupon_ids": [
    "880e8400-e29b-41d4-a716-446655440000",
    "990e8400-e29b-41d4-a716-446655440000"
  ],
  "activation_note": "Bulk activation"
}
```

**Response (200):**
```json
{
  "message": "Coupons activated",
  "activated_count": 2,
  "failed_count": 0
}
```

---

### 5. Product Catalog APIs

**Base Path:** `/api/products`

#### 5.1 List Products

Get all products with template information.

**Endpoint:** `GET /api/products?page=1&limit=20&verification_app_id=...&template_id=...`
**Auth Required:** Yes
**Permissions:** `view_products`

**Query Parameters:**
- `page`: Page number
- `limit`: Results per page
- `verification_app_id`: Filter by app
- `template_id`: Filter by template
- `search`: Search by name or SKU
- `is_active`: Filter by active status

**Response (200):**
```json
{
  "products": [
    {
      "id": 123,
      "product_name": "Asian Paints Royale",
      "product_sku": "AP-ROY-001",
      "description": "Premium emulsion paint",
      "price": 2500.00,
      "currency": "INR",
      "template_id": "template-001",
      "template_name": "Wall Paint & Coatings",
      "is_active": true,
      "created_at": "2026-01-26T10:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

#### 5.2 Get Product

Get detailed product information with attributes.

**Endpoint:** `GET /api/products/:id`
**Auth Required:** Yes
**Permissions:** `view_products`

**Response (200):**
```json
{
  "product": {
    "id": 123,
    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
    "verification_app_id": "770e8400-e29b-41d4-a716-446655440000",
    "product_name": "Asian Paints Royale",
    "product_sku": "AP-ROY-001",
    "description": "Premium emulsion paint",
    "price": 2500.00,
    "currency": "INR",
    "image_url": "https://example.com/product.jpg",
    "template_id": "template-001",
    "template_name": "Wall Paint & Coatings",
    "attributes": {
      "brand": "Asian Paints",
      "finish": "Matt",
      "color_family": "White",
      "coverage": "120 sq ft per liter"
    },
    "is_active": true,
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 5.3 Get Product Attributes

Get product attributes with template metadata.

**Endpoint:** `GET /api/products/:id/attributes`
**Auth Required:** Yes
**Permissions:** `view_products`

**Response (200):**
```json
{
  "product_id": 123,
  "template_id": "template-001",
  "template_name": "Wall Paint & Coatings",
  "attributes": {
    "brand": {
      "value": "Asian Paints",
      "type": "text",
      "label": "Brand Name"
    },
    "finish": {
      "value": "Matt",
      "type": "select",
      "label": "Finish Type",
      "options": ["Matt", "Glossy", "Semi-Glossy"]
    }
  }
}
```

---

#### 5.4 Create Product

Create a new product with template-based attributes.

**Endpoint:** `POST /api/products`
**Auth Required:** Yes
**Permissions:** `create_product`

**Request Body:**
```json
{
  "verification_app_id": "770e8400-e29b-41d4-a716-446655440000",
  "product_name": "Asian Paints Royale",
  "product_sku": "AP-ROY-001",
  "description": "Premium emulsion paint",
  "price": 2500.00,
  "currency": "INR",
  "image_url": "https://example.com/product.jpg",
  "template_id": "template-001",
  "attributes": {
    "brand": "Asian Paints",
    "finish": "Matt",
    "color_family": "White",
    "coverage": "120 sq ft per liter"
  }
}
```

**Response (201):**
```json
{
  "message": "Product created successfully",
  "product": {
    "id": 123,
    "product_name": "Asian Paints Royale",
    "product_sku": "AP-ROY-001",
    "template_id": "template-001",
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 5.5 Update Product

Update product details.

**Endpoint:** `PUT /api/products/:id`
**Auth Required:** Yes
**Permissions:** `edit_product`

**Request Body:**
```json
{
  "price": 2600.00,
  "attributes": {
    "coverage": "130 sq ft per liter"
  }
}
```

**Response (200):**
```json
{
  "message": "Product updated successfully",
  "product": {
    "id": 123,
    "price": 2600.00
  }
}
```

---

#### 5.6 Delete Product

Delete a product.

**Endpoint:** `DELETE /api/products/:id`
**Auth Required:** Yes
**Permissions:** `delete_product`

**Response (200):**
```json
{
  "message": "Product deleted successfully"
}
```

---

### 6. Product Templates APIs

**Base Path:** `/api/templates`

#### 6.1 List Templates

Get all product templates.

**Endpoint:** `GET /api/templates?is_active=true`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN

**Response (200):**
```json
{
  "templates": [
    {
      "id": "template-001",
      "template_name": "Wall Paint & Coatings",
      "description": "Template for paint products with variants",
      "is_active": true,
      "created_at": "2026-01-26T10:30:00Z"
    }
  ]
}
```

---

#### 6.2 Get Template

Get detailed template information with JSONB structures.

**Endpoint:** `GET /api/templates/:id`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN

**Response (200):**
```json
{
  "template": {
    "id": "template-001",
    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
    "template_name": "Wall Paint & Coatings",
    "description": "Template for paint products",
    "variant_config": {
      "variant_label": "Pack Sizes",
      "dimensions": [
        {
          "attribute_key": "pack_size",
          "attribute_name": "Pack Size",
          "type": "select",
          "required": true,
          "options": ["200ml", "500ml", "1L", "2L", "4L", "10L", "20L"]
        }
      ],
      "common_fields": [
        {
          "attribute_key": "sku",
          "attribute_name": "SKU Code",
          "type": "text",
          "required": true
        },
        {
          "attribute_key": "mrp",
          "attribute_name": "MRP",
          "type": "number",
          "required": true
        }
      ]
    },
    "custom_fields": [
      {
        "attribute_key": "brand",
        "attribute_name": "Brand Name",
        "data_type": "text",
        "is_required": true
      },
      {
        "attribute_key": "finish",
        "attribute_name": "Finish Type",
        "data_type": "select",
        "options": ["Matt", "Glossy", "Semi-Glossy"],
        "is_required": true
      }
    ],
    "is_active": true,
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 6.3 Create Template

Create a new product template.

**Endpoint:** `POST /api/templates`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN

**Request Body:**
```json
{
  "template_name": "Wall Paint & Coatings",
  "description": "Template for paint products",
  "variant_config": {
    "variant_label": "Pack Sizes",
    "dimensions": [
      {
        "attribute_key": "pack_size",
        "attribute_name": "Pack Size",
        "type": "select",
        "required": true,
        "options": ["200ml", "500ml", "1L", "2L"]
      }
    ],
    "common_fields": [
      {
        "attribute_key": "sku",
        "attribute_name": "SKU Code",
        "type": "text",
        "required": true
      }
    ]
  },
  "custom_fields": [
    {
      "attribute_key": "brand",
      "attribute_name": "Brand Name",
      "data_type": "text",
      "is_required": true
    }
  ]
}
```

**Response (201):**
```json
{
  "message": "Template created successfully",
  "template": {
    "id": "template-001",
    "template_name": "Wall Paint & Coatings",
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 6.4 Update Template

Update template metadata (name, description only).

**Endpoint:** `PUT /api/templates/:id`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN

**Request Body:**
```json
{
  "template_name": "Paint Products - Updated",
  "description": "Updated description"
}
```

**Response (200):**
```json
{
  "message": "Template updated successfully",
  "template": {
    "id": "template-001",
    "template_name": "Paint Products - Updated"
  }
}
```

---

#### 6.5 Delete Template

Delete a template (only if not used by any products).

**Endpoint:** `DELETE /api/templates/:id`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN

**Response (200):**
```json
{
  "message": "Template deleted successfully"
}
```

---

#### 6.6 Duplicate Template

Create a copy of an existing template.

**Endpoint:** `POST /api/templates/:id/duplicate`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN

**Request Body:**
```json
{
  "template_name": "Wall Paint Copy"
}
```

**Response (201):**
```json
{
  "message": "Template duplicated successfully",
  "template": {
    "id": "template-002",
    "template_name": "Wall Paint Copy"
  }
}
```

---

### 7. Tag Management APIs

**Base Path:** `/api/tags`

#### 7.1 List Tags

Get all tags for the tenant.

**Endpoint:** `GET /api/tags?verification_app_id=...&is_active=true`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN, TENANT_USER

**Response (200):**
```json
{
  "tags": [
    {
      "id": 1,
      "name": "Premium",
      "description": "Premium products",
      "icon": "star",
      "is_active": true
    }
  ]
}
```

---

#### 7.2 Create Tag

Create a new tag.

**Endpoint:** `POST /api/tags`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN, SUPER_ADMIN

**Request Body:**
```json
{
  "verification_app_id": "770e8400-e29b-41d4-a716-446655440000",
  "name": "Premium",
  "description": "Premium products",
  "icon": "star"
}
```

**Response (201):**
```json
{
  "message": "Tag created successfully",
  "tag": {
    "id": 1,
    "name": "Premium"
  }
}
```

---

### 8. Credit Management APIs

**Base Path:** `/api/credits`

#### 8.1 Request Credits

Request credits for the tenant.

**Endpoint:** `POST /api/credits/request`
**Auth Required:** Yes
**Permissions:** Required tenant role

**Request Body:**
```json
{
  "requested_amount": 1000,
  "justification": "Need credits for January campaign"
}
```

**Response (201):**
```json
{
  "message": "Credit request submitted",
  "request": {
    "id": "req-001",
    "requested_amount": 1000,
    "status": "pending",
    "requested_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 8.2 Get Credit Requests (Unified Endpoint)

Get credit requests with automatic tenant isolation. Works for both tenant admins (shows their own requests) and super admins (can filter by tenant).

**Endpoint:** `GET /api/credits/requests?status=pending&page=1&limit=20&tenant_id=xxx`
**Auth Required:** Yes
**Permissions:** Tenant admin (own requests) or SUPER_ADMIN (all requests)

**Query Parameters:**
- `status`: Filter by status - **pending** | **approved** | **rejected** | **history** (approved+rejected) | **all** (default: pending)
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)
- `tenant_id`: (Super Admin only) Filter by specific tenant ID. Omit to see all tenants.

**Tenant Isolation:**
- **Tenant Admin**: Automatically scoped to their tenant (cannot specify tenant_id)
- **Super Admin**: Can filter by tenant_id or omit to see all tenants

**Response (200):**
```json
{
  "requests": [
    {
      "id": 123,
      "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
      "tenant_name": "Acme Corporation",
      "contact_email": "admin@acme.com",
      "requested_by": 45,
      "requested_by_name": "John Doe",
      "requested_by_email": "john@acme.com",
      "requested_amount": 1000,
      "justification": "Need credits for January campaign",
      "status": "pending",
      "requested_at": "2026-01-26T10:30:00Z",
      "processed_by": null,
      "processed_by_name": null,
      "processed_at": null,
      "rejection_reason": null,
      "created_at": "2026-01-26T10:30:00Z",
      "updated_at": "2026-01-26T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

#### 8.3 Get Credit Balance

Get current credit balance for the tenant.

**Endpoint:** `GET /api/credits/balance`
**Auth Required:** Yes
**Permissions:** Required tenant role

**Response (200):**
```json
{
  "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
  "balance": 5000,
  "total_received": 10000,
  "total_spent": 5000,
  "total_coupons_created": 500,
  "last_updated": "2026-01-26T10:30:00Z"
}
```

---

#### 8.4 Get Credit Transactions

Get credit transaction history including both actual transactions (CREDIT/DEBIT/REFUND) and rejected credit requests. Automatically tenant-isolated.

**Endpoint:** `GET /api/credits/transactions?page=1&limit=20&type=CREDIT&tenant_id=xxx&app_id=yyy`
**Auth Required:** Yes
**Permissions:** Tenant admin (own transactions) or SUPER_ADMIN (all transactions)

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)
- `type`: Filter by type - **CREDIT** | **DEBIT** | **REFUND** | **all** (default: all)
- `tenant_id`: (Super Admin only) Filter by specific tenant ID
- `app_id`: Filter by verification app ID

**Tenant Isolation:**
- **Tenant Admin**: Automatically scoped to their tenant
- **Super Admin**: Can filter by tenant_id or omit to see all tenants

**Transaction Types:**
- **CREDIT**: Credit added to balance (e.g., approved request)
- **DEBIT**: Credit deducted from balance (e.g., coupon creation)
- **REFUND**: Credit refunded to balance
- **REJECTED**: Rejected credit request (includes justification and rejection_reason)

**Response (200):**
```json
{
  "transactions": [
    {
      "id": 101,
      "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
      "tenant_name": "Acme Corporation",
      "transaction_type": "CREDIT",
      "amount": 1000,
      "balance_before": 4000,
      "balance_after": 5000,
      "reference_type": "CREDIT_APPROVAL",
      "reference_id": 123,
      "description": "Credit request approved",
      "created_at": "2026-01-26T10:30:00Z",
      "created_by": 1,
      "created_by_name": "Super Admin",
      "justification": null,
      "rejection_reason": null
    },
    {
      "id": 102,
      "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
      "tenant_name": "Acme Corporation",
      "transaction_type": "DEBIT",
      "amount": 10,
      "balance_before": 5000,
      "balance_after": 4990,
      "reference_type": "COUPON_CREATION",
      "reference_id": 456,
      "description": "Coupon batch created",
      "created_at": "2026-01-26T11:00:00Z",
      "created_by": 45,
      "created_by_name": "John Doe",
      "justification": null,
      "rejection_reason": null
    },
    {
      "id": 789,
      "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
      "tenant_name": "Acme Corporation",
      "transaction_type": "REJECTED",
      "amount": 500,
      "balance_before": null,
      "balance_after": null,
      "reference_type": "CREDIT_REQUEST",
      "reference_id": 789,
      "description": "Credit Request Rejected",
      "created_at": "2026-01-25T15:00:00Z",
      "created_by": 1,
      "created_by_name": "Super Admin",
      "justification": "Need credits for campaign",
      "rejection_reason": "Insufficient justification provided"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

---

#### 8.5 Approve Credit Request (Super Admin)

Approve a credit request.

**Endpoint:** `POST /api/credits/approve/:id`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Response (200):**
```json
{
  "message": "Credit request approved",
  "credits_added": 1000,
  "new_balance": 5000
}
```

---

#### 8.6 Reject Credit Request (Super Admin)

Reject a credit request.

**Endpoint:** `POST /api/credits/reject/:id`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Request Body:**
```json
{
  "rejection_reason": "Insufficient justification provided"
}
```

**Response (200):**
```json
{
  "message": "Credit request rejected",
  "request": {
    "id": "req-001",
    "status": "rejected",
    "rejection_reason": "Insufficient justification provided"
  }
}
```

---

### 9. Tenant Users APIs

**Base Path:** `/api/v1/tenants/:tenantId/users`

#### 9.1 Create Tenant User

Create a new user with permissions.

**Endpoint:** `POST /api/v1/tenants/:tenantId/users`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN, TENANT_ADMIN
**Permissions:** `manage_tenant_users`

**Request Body:**
```json
{
  "email": "user@acme.com",
  "full_name": "Jane Smith",
  "phone": "+1234567890",
  "role": "TENANT_USER",
  "permissions": [
    "view_coupons",
    "view_scans",
    "view_products"
  ]
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "user-001",
    "email": "user@acme.com",
    "full_name": "Jane Smith",
    "role": "TENANT_USER",
    "permissions": ["view_coupons", "view_scans", "view_products"],
    "is_active": true,
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 9.2 List Tenant Users

Get all users in the tenant.

**Endpoint:** `GET /api/v1/tenants/:tenantId/users?page=1&limit=20&role=TENANT_USER`
**Auth Required:** Yes
**Permissions:** `view_tenant_users`

**Response (200):**
```json
{
  "users": [
    {
      "id": "user-001",
      "email": "user@acme.com",
      "full_name": "Jane Smith",
      "role": "TENANT_USER",
      "is_active": true,
      "permissions_count": 3
    }
  ],
  "total": 1
}
```

---

#### 9.3 Get Tenant User

Get user details with permissions.

**Endpoint:** `GET /api/v1/tenants/:tenantId/users/:userId`
**Auth Required:** Yes
**Permissions:** `view_tenant_users`

**Response (200):**
```json
{
  "user": {
    "id": "user-001",
    "email": "user@acme.com",
    "full_name": "Jane Smith",
    "phone": "+1234567890",
    "role": "TENANT_USER",
    "permissions": ["view_coupons", "view_scans", "view_products"],
    "is_active": true,
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 9.4 Delete Tenant User

Soft delete a tenant user.

**Endpoint:** `DELETE /api/v1/tenants/:tenantId/users/:userId`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN, TENANT_ADMIN
**Permissions:** `manage_tenant_users`

**Response (200):**
```json
{
  "message": "User deleted successfully"
}
```

---

#### 9.5 Get User Permissions

Get effective permissions for a user.

**Endpoint:** `GET /api/v1/tenants/:tenantId/users/:userId/permissions`
**Auth Required:** Yes
**Permissions:** `view_permissions`

**Response (200):**
```json
{
  "user_id": "user-001",
  "permissions": [
    {
      "code": "view_coupons",
      "name": "View Coupons",
      "description": "Can view coupon list",
      "category": "Coupon Management"
    },
    {
      "code": "view_scans",
      "name": "View Scans",
      "description": "Can view scan history",
      "category": "Analytics"
    }
  ]
}
```

---

#### 9.6 Assign User Permissions

Assign permissions to a user.

**Endpoint:** `POST /api/v1/tenants/:tenantId/users/:userId/permissions`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN, TENANT_ADMIN
**Permissions:** `assign_permissions`

**Request Body:**
```json
{
  "permission_codes": [
    "view_coupons",
    "create_coupon",
    "view_products"
  ]
}
```

**Response (200):**
```json
{
  "message": "Permissions assigned successfully",
  "permissions_count": 3
}
```

---

### 10. Permissions APIs

**Base Path:** `/api/v1/permissions`

#### 10.1 Create Permission

Create a new permission definition (Super Admin only).

**Endpoint:** `POST /api/v1/permissions`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Request Body:**
```json
{
  "code": "export_analytics",
  "name": "Export Analytics",
  "description": "Can export analytics data",
  "category": "Analytics",
  "is_active": true
}
```

**Response (201):**
```json
{
  "message": "Permission created successfully",
  "permission": {
    "id": 1,
    "code": "export_analytics",
    "name": "Export Analytics"
  }
}
```

---

#### 10.2 List Permissions

Get all permissions with filtering.

**Endpoint:** `GET /api/v1/permissions?category=Coupon%20Management&is_active=true`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN, TENANT_ADMIN

**Query Parameters:**
- `category`: Filter by category
- `is_active`: Filter by active status
- `search`: Search by code or name

**Response (200):**
```json
{
  "permissions": [
    {
      "id": 1,
      "code": "create_coupon",
      "name": "Create Coupon",
      "description": "Can create new coupons",
      "category": "Coupon Management",
      "is_active": true
    },
    {
      "id": 2,
      "code": "view_coupons",
      "name": "View Coupons",
      "description": "Can view coupon list",
      "category": "Coupon Management",
      "is_active": true
    }
  ]
}
```

---

### 11. Mobile Scan APIs

**Base Path:** `/api/mobile/v1/scan`
**Auth:** Mobile user authentication required

#### 11.1 Scan Coupon

Scan and verify a coupon.

**Endpoint:** `POST /api/mobile/v1/scan`
**Auth Required:** Yes (Mobile JWT)

**Request Body:**
```json
{
  "coupon_code": "ACME-ABC123",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "device_info": "Android 12, Model XYZ"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Coupon verified successfully",
  "scan": {
    "id": "scan-001",
    "coupon_code": "ACME-ABC123",
    "scan_status": "SUCCESS",
    "points_awarded": 100,
    "product_name": "Asian Paints Royale",
    "discount_value": 50.00,
    "scanned_at": "2026-01-26T10:30:00Z"
  }
}
```

---

#### 11.2 Get Scan History

Get user's scan transaction history.

**Endpoint:** `GET /api/mobile/v1/scan/history?page=1&limit=20`
**Auth Required:** Yes (Mobile JWT)

**Response (200):**
```json
{
  "scans": [
    {
      "id": "scan-001",
      "coupon_code": "ACME-ABC123",
      "product_name": "Asian Paints Royale",
      "scan_status": "SUCCESS",
      "points_awarded": 100,
      "scanned_at": "2026-01-26T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

### 12. Mobile API V2

**Base Path:** `/api/mobile/v2`
**Auth:** `X-Mobile-API-Key` header

#### 12.1 Get Products

Get product catalog for mobile app.

**Endpoint:** `GET /api/mobile/v2/products?page=1&limit=20`
**Auth Required:** Mobile API Key

**Response (200):**
```json
{
  "products": [
    {
      "id": 123,
      "product_name": "Asian Paints Royale",
      "product_sku": "AP-ROY-001",
      "price": 2500.00,
      "currency": "INR",
      "image_url": "https://example.com/product.jpg",
      "template_name": "Wall Paint & Coatings"
    }
  ],
  "total": 1
}
```

---

### 13. Mobile Auth APIs

**Base Path:** `/api/mobile/v1/auth`

#### 13.1 Request Mobile OTP

Request OTP for mobile authentication.

**Endpoint:** `POST /api/mobile/v1/auth/request-otp`
**Auth Required:** No

**Request Body:**
```json
{
  "mobile": "+919876543210",
  "app_code": "ACME001"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to mobile",
  "session_id": "session-001"
}
```

---

#### 13.2 Verify Mobile OTP

Verify OTP and get access token.

**Endpoint:** `POST /api/mobile/v1/auth/verify-otp`
**Auth Required:** No

**Request Body:**
```json
{
  "session_id": "session-001",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Authentication successful",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "mobile": "+919876543210",
    "points_balance": 500
  }
}
```

---

### 14. Public Scan APIs

**Base Path:** `/api/public/scan`
**Rate Limited:** Yes

#### 14.1 Start Scan Session

Start a public scan session.

**Endpoint:** `POST /api/public/scan/start`
**Auth Required:** No
**Rate Limit:** 10/hour per IP

**Request Body:**
```json
{
  "coupon_code": "ACME-ABC123",
  "app_code": "ACME001",
  "device_id": "device-xyz"
}
```

**Response (200):**
```json
{
  "session_id": "session-001",
  "coupon_valid": true,
  "product_name": "Asian Paints Royale",
  "discount_value": 50.00,
  "expiry_date": "2026-12-31T23:59:59Z"
}
```

---

#### 14.2 Collect Mobile Number

Collect mobile number for the session.

**Endpoint:** `POST /api/public/scan/:sessionId/mobile`
**Auth Required:** No
**Rate Limit:** 5/session/15min

**Request Body:**
```json
{
  "mobile_e164": "+919876543210"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to mobile",
  "masked_mobile": "+91987****210"
}
```

---

#### 14.3 Verify OTP for Scan

Verify OTP and complete scan.

**Endpoint:** `POST /api/public/scan/:sessionId/verify-otp`
**Auth Required:** No
**Rate Limit:** 5/session/15min

**Request Body:**
```json
{
  "otp_code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Coupon verified successfully",
  "points_awarded": 100,
  "new_balance": 600
}
```

---

### 15. External App APIs

**Base Path:** `/api/app/:appCode`
**Auth:** `X-App-API-Key` header

#### 15.1 Get Products

Get products for external app.

**Endpoint:** `GET /api/app/:appCode/products`
**Auth Required:** App API Key

**Response (200):**
```json
{
  "products": [
    {
      "id": 123,
      "product_name": "Asian Paints Royale",
      "product_sku": "AP-ROY-001",
      "price": 2500.00,
      "points_required": 500
    }
  ]
}
```

---

#### 15.2 Get User Credits

Get user's credit balance.

**Endpoint:** `GET /api/app/:appCode/users/:userId/credits`
**Auth Required:** App API Key

**Response (200):**
```json
{
  "user_id": "user-123",
  "balance": 500,
  "total_earned": 1000,
  "total_spent": 500
}
```

---

#### 15.3 Record Scan

Record a coupon scan and award credits.

**Endpoint:** `POST /api/app/:appCode/scans`
**Auth Required:** App API Key

**Request Body:**
```json
{
  "user_id": "user-123",
  "coupon_code": "ACME-ABC123",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "points_awarded": 100,
  "new_balance": 600
}
```

---

### 16. E-commerce APIs

**Base Path:** `/api/ecommerce/v1`
**Auth:** `X-Ecommerce-API-Key` header

#### 16.1 Get Products

Get product catalog for e-commerce integration.

**Endpoint:** `GET /api/ecommerce/v1/products?page=1&limit=50`
**Auth Required:** E-commerce API Key

**Response (200):**
```json
{
  "products": [
    {
      "id": 123,
      "product_name": "Asian Paints Royale",
      "product_sku": "AP-ROY-001",
      "price": 2500.00,
      "currency": "INR",
      "inventory_count": 100,
      "template_name": "Wall Paint & Coatings"
    }
  ],
  "total": 1
}
```

---

#### 16.2 Sync Products

Bulk sync products from e-commerce platform.

**Endpoint:** `POST /api/ecommerce/v1/products/sync`
**Auth Required:** E-commerce API Key

**Request Body:**
```json
{
  "products": [
    {
      "external_id": "ecom-123",
      "product_name": "Product A",
      "product_sku": "SKU-001",
      "price": 1000.00
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "synced": 1,
  "failed": 0
}
```

---

### 17. User Management APIs

**Base Path:** `/api/users`

#### 17.1 Create Customer (Super Admin)

Create a customer account.

**Endpoint:** `POST /api/users/customers`
**Auth Required:** Yes
**Roles:** SUPER_ADMIN

**Request Body:**
```json
{
  "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
  "phone_e164": "+919876543210",
  "email": "customer@example.com",
  "full_name": "Customer Name"
}
```

**Response (201):**
```json
{
  "message": "Customer created successfully",
  "customer": {
    "id": "cust-001",
    "phone_e164": "+919876543210",
    "email": "customer@example.com"
  }
}
```

---

#### 17.2 Get User Profile

Get current user profile.

**Endpoint:** `GET /api/users/profile`
**Auth Required:** Yes

**Response (200):**
```json
{
  "user": {
    "id": "user-001",
    "email": "user@acme.com",
    "full_name": "Jane Smith",
    "phone": "+1234567890",
    "role": "TENANT_USER",
    "tenant": {
      "tenant_name": "Acme Corporation",
      "subdomain_slug": "acme"
    }
  }
}
```

---

#### 17.3 Update User Profile

Update user profile information.

**Endpoint:** `PUT /api/users/profile`
**Auth Required:** Yes

**Request Body:**
```json
{
  "full_name": "Jane Smith Updated",
  "phone": "+1234567891"
}
```

**Response (200):**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "full_name": "Jane Smith Updated",
    "phone": "+1234567891"
  }
}
```

---

### 18. User Credits APIs

**Base Path:** `/api/users/:userId/credits`

#### 18.1 Get User Credits

Get user's credit balance.

**Endpoint:** `GET /api/users/:userId/credits`
**Auth Required:** Yes
**Permissions:** `view_credit_balance`

**Response (200):**
```json
{
  "user_id": "user-001",
  "balance": 500,
  "total_earned": 1000,
  "total_spent": 500,
  "last_updated": "2026-01-26T10:30:00Z"
}
```

---

#### 18.2 Get Credit Transactions

Get user's credit transaction history.

**Endpoint:** `GET /api/users/:userId/credits/transactions?page=1&limit=20`
**Auth Required:** Yes
**Permissions:** `view_credit_transactions`

**Response (200):**
```json
{
  "transactions": [
    {
      "id": "tx-001",
      "amount": 100,
      "reason": "Coupon scan reward",
      "balance_after": 600,
      "created_at": "2026-01-26T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

### 19. Dashboard APIs

**Base Path:** `/api/dashboard`

#### 19.1 Get Dashboard Stats

Get role-based dashboard statistics.

**Endpoint:** `GET /api/dashboard/stats`
**Auth Required:** Yes

**Response (Super Admin):**
```json
{
  "totalTenants": 10,
  "totalUsers": 150,
  "activeSessions24h": 45,
  "systemHealth": "healthy",
  "recentTenants": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "companyName": "Acme Corp",
      "contactEmail": "admin@acme.com",
      "createdAt": "2026-01-26T10:30:00Z"
    }
  ]
}
```

**Response (Tenant Admin):**
```json
{
  "tenant": {
    "companyName": "Acme Corp",
    "contactEmail": "admin@acme.com",
    "memberSince": "2026-01-01T00:00:00Z"
  },
  "totalUsers": 15,
  "activeUsers24h": 8,
  "totalCoupons": 1500,
  "totalScans": 342,
  "creditBalance": 5000,
  "recentActivity": [
    {
      "action": "Coupon Created",
      "user": "Jane Smith",
      "email": "jane@acme.com",
      "timestamp": "2026-01-26T10:30:00Z"
    }
  ]
}
```

---

### 20. API Configuration APIs

**Base Path:** `/api/verification-apps/:id`

#### 20.1 Get API Config

Get API configuration for a verification app.

**Endpoint:** `GET /api/verification-apps/:id/api-config`
**Auth Required:** Yes
**Permissions:** `view_apps`

**Response (200):**
```json
{
  "config": {
    "mobile_api_enabled": true,
    "mobile_api_key": "ma_1234567890abcdef",
    "ecommerce_api_enabled": true,
    "ecommerce_api_key": "ea_1234567890abcdef",
    "webhook_url": "https://example.com/webhook",
    "api_rate_limit": 1000
  }
}
```

---

#### 20.2 Regenerate Mobile API Key

Regenerate mobile API key.

**Endpoint:** `POST /api/verification-apps/:id/regenerate-mobile-key`
**Auth Required:** Yes
**Permissions:** `edit_app`

**Response (200):**
```json
{
  "message": "Mobile API key regenerated",
  "mobile_api_key": "ma_newkey1234567890"
}
```

---

### 21. Inventory APIs

**Base Path:** `/api/products/:id/stock`

#### 21.1 Update Stock

Update product stock level.

**Endpoint:** `POST /api/products/:id/stock`
**Auth Required:** Yes

**Request Body:**
```json
{
  "quantity": 100,
  "movement_type": "IN",
  "notes": "Stock replenishment"
}
```

**Response (200):**
```json
{
  "message": "Stock updated successfully",
  "current_stock": 200
}
```

---

### 22. Webhook APIs

**Base Path:** `/api/verification-apps/:id/webhooks`

#### 22.1 Register Webhook

Register a webhook for events.

**Endpoint:** `POST /api/verification-apps/:id/webhooks`
**Auth Required:** Yes

**Request Body:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["coupon.scanned", "coupon.activated"],
  "secret": "webhook-secret"
}
```

**Response (201):**
```json
{
  "message": "Webhook registered",
  "webhook": {
    "id": "webhook-001",
    "url": "https://example.com/webhook",
    "events": ["coupon.scanned", "coupon.activated"],
    "is_active": true
  }
}
```

---

### 23. Batch Operations APIs

**Base Path:** `/api/tenant/batches`

#### 23.1 Create Batch

Create a new coupon batch.

**Endpoint:** `POST /api/tenant/batches`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN

**Request Body:**
```json
{
  "batch_name": "January Campaign",
  "dealer_name": "Dealer A",
  "zone": "North",
  "total_coupons": 100
}
```

**Response (201):**
```json
{
  "message": "Batch created successfully",
  "batch": {
    "id": "batch-001",
    "batch_name": "January Campaign",
    "batch_status": "draft",
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

### 24. Campaign Management APIs

**Base Path:** `/api/tenant/rewards/campaigns`

#### 24.1 Create Campaign

Create a reward campaign.

**Endpoint:** `POST /api/tenant/rewards/campaigns`
**Auth Required:** Yes
**Roles:** TENANT_ADMIN

**Request Body:**
```json
{
  "name": "January Rewards Campaign",
  "batch_id": "batch-001",
  "start_date": "2026-01-01T00:00:00Z",
  "end_date": "2026-01-31T23:59:59Z",
  "reward_type": "common",
  "common_amount": 100.00
}
```

**Response (201):**
```json
{
  "message": "Campaign created successfully",
  "campaign": {
    "id": "campaign-001",
    "name": "January Rewards Campaign",
    "status": "scheduled",
    "created_at": "2026-01-26T10:30:00Z"
  }
}
```

---

## Health Check

**Endpoint:** `GET /health`
**Auth Required:** No

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-26T10:30:00Z",
  "database": "connected",
  "server": "running"
}
```

---

## Appendix

### Permission Codes Reference

| Code | Name | Category | Description |
|------|------|----------|-------------|
| `create_app` | Create App | App Management | Can create verification apps |
| `view_apps` | View Apps | App Management | Can view verification apps |
| `edit_app` | Edit App | App Management | Can edit verification apps |
| `delete_app` | Delete App | App Management | Can delete verification apps |
| `create_coupon` | Create Coupon | Coupon Management | Can create coupons |
| `view_coupons` | View Coupons | Coupon Management | Can view coupons |
| `edit_coupon` | Edit Coupon | Coupon Management | Can edit coupons |
| `create_batch` | Create Batch | Coupon Management | Can create coupon batches |
| `view_scans` | View Scans | Analytics | Can view scan history |
| `view_analytics` | View Analytics | Analytics | Can view analytics |
| `view_products` | View Products | Product Catalog | Can view products |
| `create_product` | Create Product | Product Catalog | Can create products |
| `edit_product` | Edit Product | Product Catalog | Can edit products |
| `delete_product` | Delete Product | Product Catalog | Can delete products |
| `request_credits` | Request Credits | Credit Management | Can request credits |
| `approve_credits` | Approve Credits | Credit Management | Can approve credit requests |
| `view_credit_balance` | View Credit Balance | Credit Management | Can view credit balance |
| `view_credit_transactions` | View Transactions | Credit Management | Can view credit transactions |
| `manage_tenant_users` | Manage Users | User Management | Can manage tenant users |
| `view_tenant_users` | View Users | User Management | Can view tenant users |
| `assign_permissions` | Assign Permissions | User Management | Can assign permissions |
| `view_permissions` | View Permissions | User Management | Can view permissions |

---

**Document End**

For support or questions, contact the development team.
