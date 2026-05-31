# API Overview

Complete reference for all Scan4Earn APIs organized by role and functionality.

## API Base URLs

```
Development:   http://localhost:8080
Staging:       https://staging-api.scan4earn.com
Production:    https://api.scan4earn.com

Tenant-Specific (Subdomain):
  https://api.{tenant_slug}.scan4earn.com
  Example: https://api.sumukham.scan4earn.com
```

## Authentication Methods

### 1. JWT (For Web & Mobile Apps)

```
Header: Authorization: Bearer {access_token}

Token Format: 
  - access_token: 15 minute expiry
  - refresh_token: 7 day expiry
  - Both obtained via /api/auth/login

Roles:
  - SUPER_ADMIN: Full system access
  - TENANT_ADMIN: Tenant-scoped access
  - CUSTOMER: Personal account access
  - DEALER: Sales/scanning access
```

### 2. API Keys (For External Integrations)

```
Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}

Used by:
  - E-commerce platforms
  - Third-party integrations
  - Webhook handlers

Key Format:
  - 256-bit encrypted key
  - Expires every 90 days
  - Rotatable on-demand
```

## Global Headers

Required for all requests:

```
Content-Type: application/json
X-Tenant-Slug: {tenant_slug}        # Required (except public endpoints)
X-App-Id: {app_uuid}                 # For mobile/dealer endpoints
Authorization: Bearer {token}        # For authenticated endpoints

Optional:
X-Request-ID: {unique_id}            # For tracing
Accept-Language: en-US
```

## Common Response Format

All API responses follow this structure:

```javascript
// Success (2xx status)
{
  "status": true,
  "message": "Optional success message",
  "data": {
    // Endpoint-specific response body
  }
}

// Error (4xx, 5xx status)
{
  "status": false,
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    // Optional error details
  },
  "timestamp": "2026-05-31T10:30:00Z",
  "requestId": "req_123456"
}
```

## Endpoint Categories

### 🔐 Authentication (Public)

```
POST   /api/auth/register             - Register new user
POST   /api/auth/login                - Login and get tokens
POST   /api/auth/refresh              - Refresh access token
POST   /api/auth/logout               - Logout user
GET    /api/auth/me                   - Get current user
```

### 👤 User Management

```
GET    /api/users                     - List users (Super Admin)
GET    /api/users/{userId}            - Get user details
POST   /api/users                     - Create user
PATCH  /api/users/{userId}            - Update user
DELETE /api/users/{userId}            - Delete user
PATCH  /api/users/{userId}/password   - Change password
```

### 🏢 Tenant Management (Super Admin)

```
GET    /api/tenants                   - List all tenants
POST   /api/tenants                   - Create tenant
GET    /api/tenants/{tenantId}        - Get tenant details
PATCH  /api/tenants/{tenantId}        - Update tenant
DELETE /api/tenants/{tenantId}        - Delete tenant
GET    /api/tenants/{tenantId}/stats  - Get tenant statistics
```

### 📊 Dashboard & Analytics

```
GET    /api/dashboard                 - Dashboard overview
GET    /api/dashboard/stats           - Detailed statistics
GET    /api/dashboard/revenue         - Revenue metrics
GET    /api/dashboard/customers       - Customer metrics
GET    /api/dashboard/campaigns       - Campaign performance
```

### 🎟️ Coupons & QR Codes

```
GET    /api/public/scan/{couponCode}  - Get coupon details (public)
POST   /api/mobile/v1/scan/{code}/redeem  - Redeem coupon
GET    /api/products                   - Get product catalog
GET    /api/products/{productId}       - Get product details
```

### 🎁 Rewards & Points

```
GET    /api/mobile/v1/rewards         - Get customer rewards
GET    /api/mobile/v1/points          - Get points balance
GET    /api/mobile/v1/cashback        - Get cashback balance
POST   /api/mobile/v1/redemptions     - Create redemption request
GET    /api/mobile/v1/redemptions     - Get redemption status
GET    /api/mobile/v1/transactions    - Get transaction history
```

### 🏪 Dealer Features

```
POST   /api/mobile/v1/dealer/scan     - Scan on behalf of customer
GET    /api/mobile/v1/dealer/dashboard - Dealer earnings/stats
GET    /api/mobile/v1/dealer/sales    - Dealer sales history
```

### 🛒 E-Commerce Integration

```
GET    /api/mobile/v2/products        - Get products (external)
GET    /api/mobile/v2/templates       - Get templates
POST   /api/ecommerce/v1/customers/verify - Verify customer
GET    /api/ecommerce/v1/customers/{id}/balance - Get balance
POST   /api/ecommerce/v1/rewards/award - Award reward
POST   /api/ecommerce/v1/coupons      - Create coupon
POST   /api/ecommerce/v1/checkout/apply-coupon - Apply coupon
POST   /api/ecommerce/v1/orders/complete - Mark order complete
```

### 🔧 Configuration & Settings

```
GET    /api/verification-apps         - List apps
POST   /api/verification-apps         - Create app
GET    /api/verification-apps/{id}    - Get app
PATCH  /api/verification-apps/{id}    - Update app
POST   /api/verification-apps/{id}/enable-mobile-api - Enable API
GET    /api/verification-apps/{id}/mobile-api/key-status - Key status
POST   /api/verification-apps/{id}/regenerate-mobile-key - Rotate key
GET    /api/features                  - Get feature flags
```

### 📢 Webhooks & Events

```
GET    /api/webhooks                  - List webhooks
POST   /api/webhooks                  - Create webhook
PATCH  /api/webhooks/{id}             - Update webhook
DELETE /api/webhooks/{id}             - Delete webhook
GET    /api/webhooks/{id}/events      - Get webhook events
```

### 📋 Admin & Operations

```
GET    /api/v1/permissions            - List permissions
POST   /api/v1/permissions            - Create permission
GET    /api/v1/tenants/{id}/users     - List tenant users
POST   /api/v1/tenants/{id}/users     - Invite user
DELETE /api/v1/tenants/{id}/users/{userId} - Remove user
```

### 📧 Credits & Billing

```
GET    /api/credits                   - Get credit balance (role-based)
POST   /api/credits/transfer          - Transfer credits
GET    /api/credits/history           - Credit transaction history
```

## HTTP Status Codes

| Code | Meaning | When to Retry |
|------|---------|---------------|
| 200 | OK | No |
| 201 | Created | No |
| 204 | No Content | No |
| 400 | Bad Request | No (fix request) |
| 401 | Unauthorized | Yes (refresh token) |
| 403 | Forbidden | No |
| 404 | Not Found | No |
| 409 | Conflict | No (resolve conflict) |
| 429 | Rate Limited | Yes (after delay) |
| 500 | Server Error | Yes (with backoff) |
| 503 | Unavailable | Yes (with backoff) |

## Rate Limiting

```
Global Limit: 100 requests/minute per IP
User Limit: 1000 requests/minute per access token
API Key Limit: 1000 requests/minute per key
Burst: 10 requests/second

Response Headers:
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1622467200

When limit exceeded (429):
{
  "status": false,
  "message": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60  // seconds
}
```

## Pagination

Endpoints returning lists support pagination:

```
Query Parameters:
?page=1           - Page number (1-indexed)
&limit=20         - Items per page (max 100)
&sort=created_at  - Sort field
&order=desc       - Sort order (asc|desc)

Response Includes:
{
  "data": [...],
  "pagination": {
    "total": 500,
    "page": 1,
    "limit": 20,
    "pages": 25,
    "hasMore": true
  }
}
```

## Filtering

Query parameters for filtering:

```
GET /api/mobile/v1/rewards?status=active&type=points

Supported:
- Equality: ?field=value
- Comparison: ?field[gte]=100&field[lte]=1000
- Text search: ?search=keyword
- Multiple values: ?status=active&status=pending
```

## Error Codes Reference

| Code | Status | Description |
|------|--------|-------------|
| INVALID_CREDENTIALS | 401 | Login failed |
| TOKEN_EXPIRED | 401 | Access token expired |
| INVALID_TOKEN | 401 | Token validation failed |
| INSUFFICIENT_PERMISSIONS | 403 | User lacks required role |
| TENANT_NOT_FOUND | 404 | Tenant doesn't exist |
| USER_NOT_FOUND | 404 | User not found |
| COUPON_NOT_FOUND | 404 | Coupon doesn't exist |
| COUPON_EXPIRED | 400 | Coupon past expiry date |
| COUPON_ALREADY_REDEEMED | 409 | Coupon already used |
| INSUFFICIENT_BALANCE | 400 | Not enough points/cashback |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| VALIDATION_ERROR | 400 | Input validation failed |
| INTERNAL_ERROR | 500 | Server error |

## API Versioning

Current API versions:

```
/api/mobile/v1/*           - Mobile API v1 (stable)
/api/mobile/v2/*           - Mobile API v2 (current)
/api/ecommerce/v1/*        - E-Commerce API v1 (current)
/api/v1/*                  - General API v1 (legacy)

Deprecated (sunset 2026-12-31):
/api/public/*              - Use v2 endpoints instead
```

## SDKs & Client Libraries

Officially supported:

- **JavaScript:** [@scan4earn/sdk](https://github.com/scan4earn/js-sdk)
- **React Native:** [@scan4earn/react-native](https://github.com/scan4earn/react-native-sdk)
- **Flutter:** [scan4earn_flutter](https://pub.dev/packages/scan4earn_flutter)
- **Python:** [scan4earn-python](https://pypi.org/project/scan4earn/)
- **PHP:** [scan4earn-php](https://packagist.org/packages/scan4earn/sdk)

## Testing

### Sandbox Credentials

For testing without real transactions:

```
Tenant Slug: sandbox
API Key: test_key_sandbox_123456789
App ID: app_sandbox_uuid

Test Data:
  Phone: +919876543210
  Email: test@sandbox.local
  Password: TestPass123!
```

### Common Test Cases

```javascript
// Test authentication
POST /api/auth/login
Body: { phone: "+919876543210", password: "TestPass123!" }

// Test coupon scan
GET /api/public/scan/TEST001
Expected: 200 OK with coupon details

// Test reward earning
POST /api/mobile/v1/scan/TEST001/redeem
Headers: Authorization: Bearer {test_token}

// Test rate limiting
for (let i = 0; i < 2000; i++) {
  fetch('/api/mobile/v1/rewards')  // Should hit 429 after 1000
}
```

## API Reference Links

For detailed endpoint documentation:

- [Mobile App API](04-MOBILE-APP-API.md)
- [E-Commerce API](05-ECOMMERCE-API.md)
- [Super Admin API](02-SUPER-ADMIN-API.md)
- [Tenant Admin API](03-TENANT-ADMIN-API.md)
- [Public APIs](06-PUBLIC-API.md)

## Best Practices

1. **Always include error handling** for network failures
2. **Implement exponential backoff** for retries
3. **Cache responses** when safe (read operations)
4. **Monitor rate limits** and adjust request frequency
5. **Use correct Content-Type** header
6. **Log requests** for debugging
7. **Validate responses** before using data
8. **Keep credentials secure** (never commit to version control)

## Support & Documentation

- Detailed API docs: See individual API reference files
- Code examples: [Code Examples Directory](../examples/)
- Integration guides: [Integration Guides](../guides/)
- Troubleshooting: [Troubleshooting Guide](../guides/08-TROUBLESHOOTING.md)

---

**Last Updated:** 2026-05-31  
**API Version:** 2.0  
**Status:** Production Ready
