# Scan4Earn Server (Backend)

## 📖 Complete Documentation

For complete product documentation including API reference, architecture, and integration guides:

👉 **See:** [`../COMPLETE_PRODUCT_DOCUMENTATION.md`](../COMPLETE_PRODUCT_DOCUMENTATION.md)

---

## 🚀 Server Code Overview

This folder contains the Node.js/Express backend server for Scan4Earn API.

### Key Implementation Files

**Authentication & API Key Management:**
- `src/middleware/mobileApiKey.middleware.js` - Two-factor authentication (X-App-Id + api_key)
- `src/utils/apiKeyHelper.js` - Key lifecycle utilities (hash, log, expire, rotate)
- `src/controllers/apiConfig.controller.js` - API key management endpoints
- `src/routes/apiConfig.routes.js` - API routes definition
- `src/server.js` - Express server setup (updated CORS for X-App-Id header)

### API Endpoints Implemented

**Tenant Admin Endpoints** (requires JWT + X-Tenant-Slug):
```
POST   /api/verification-apps/{id}/enable-mobile-api
GET    /api/verification-apps/{id}/mobile-api/key-status
POST   /api/verification-apps/{id}/regenerate-mobile-key
GET    /api/verification-apps/{id}/api-config
GET    /api/verification-apps/{id}/api-usage
```

**External App Endpoints** (requires X-App-Id + mobile_api_key):
```
GET    /api/mobile/v2/products
GET    /api/mobile/v2/products/{id}
GET    /api/mobile/v2/templates
GET    /api/mobile/v2/templates/{id}/attributes
```

---

## 🔧 Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run tests
npm test
```

---

## 📚 Architecture

### Authentication Flows

**Tenant Admin Authentication:**
```
Headers: Authorization: Bearer {jwt_token}
         X-Tenant-Slug: {tenant_subdomain}
↓
Middleware: Validate JWT + Tenant isolation
↓
Controller: Process admin requests (enable API, rotate keys, check status)
```

**External App Authentication:**
```
Headers: Authorization: Bearer {mobile_api_key}
         X-App-Id: {verification_app_uuid}
↓
Middleware: Validate both factors
↓
Check: Key not expired
↓
Check: In grace period (warning if yes)
↓
Controller: Process API request
```

---

## 🔑 Key Features

### Two-Factor Authentication
- Requires `X-App-Id` (UUID) + `mobile_api_key` (256-bit)
- Both must match for access
- Generic errors prevent enumeration

### Key Lifecycle
- Keys auto-expire in 90 days
- Grace period on rotation (14 days default)
- Audit logging of all rotations
- Key versioning (v1 → v2 → v3...)

### API Status Checking
- NEW endpoint: `GET /mobile-api/key-status`
- Returns: key_status, expiry countdown, grace period, rotation history
- Useful for proactive key rotation

---

## 📝 Database Integration

This backend connects to PostgreSQL database managed in `../scan4earn-database-main/`.

**Key database operations:**
- Query: `verification_apps` table for key validation
- Log: Rotations to `api_key_audit_log` table
- Check: Expiration dates before allowing requests

See `../scan4earn-database-main/` for:
- Database schema (migrations)
- Deployment guide
- Monitoring queries

---

## 🚀 Deployment

1. **Database:** Run migration in `../scan4earn-database-main/migrations/003_api_key_lifecycle_management.sql`
2. **Server:** Deploy this code to production
3. **Restart:** Restart Node.js process
4. **Test:** Verify endpoints are responding

See `../COMPLETE_PRODUCT_DOCUMENTATION.md` → Deployment & Operations section for detailed steps.

---

## 🔍 Code Examples

### Enable Mobile API (Get Initial Key)
```javascript
// In Node.js app
const response = await fetch(
  'https://api.scan4earn.com/api/verification-apps/{app_id}/enable-mobile-api',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'X-Tenant-Slug': 'sumukham',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  }
);

const { app_id, api_key } = await response.json();
// Save both values securely!
```

### Call External App API
```javascript
// Client using the API
const products = await fetch(
  'https://api.scan4earn.com/api/mobile/v2/products',
  {
    headers: {
      'Authorization': `Bearer ${mobile_api_key}`,
      'X-App-Id': app_id,
      'Content-Type': 'application/json'
    }
  }
);
```

---

## 🧪 Testing

**Test endpoints:**
```bash
# Missing X-App-Id header
curl -H "Authorization: Bearer mobile_xxx" \
  https://api.scan4earn.com/api/mobile/v2/products
# Expected: 400 "Missing X-App-Id header"

# Invalid credentials
curl -H "Authorization: Bearer wrong_key" \
  -H "X-App-Id: {uuid}" \
  https://api.scan4earn.com/api/mobile/v2/products
# Expected: 401 "Invalid credentials"

# Valid request
curl -H "Authorization: Bearer mobile_valid_key" \
  -H "X-App-Id: {valid_uuid}" \
  https://api.scan4earn.com/api/mobile/v2/products
# Expected: 200 with products
```

---

## 📊 Files Modified/Created

| File | Type | Change |
|------|------|--------|
| `src/middleware/mobileApiKey.middleware.js` | Middleware | Updated - Add X-App-Id validation + expiration check |
| `src/utils/apiKeyHelper.js` | Utility | New - Key lifecycle functions |
| `src/controllers/apiConfig.controller.js` | Controller | Updated - Add lifecycle management + status endpoint |
| `src/routes/apiConfig.routes.js` | Routes | Updated - Add /mobile-api/key-status route |
| `src/server.js` | Server | Updated - CORS for X-App-Id header |

---

## 🔗 Related Documents

- **Complete Documentation:** See `../COMPLETE_PRODUCT_DOCUMENTATION.md`
  - Executive Summary
  - Product Overview
  - Full Architecture
  - Integration Guides (Mobile + Web)
  - Security & Compliance
  - FAQ & Troubleshooting

- **Database Documentation:** See `../scan4earn-database-main/README.md`
  - Schema changes
  - Migration instructions
  - Monitoring queries

---

## 💬 Questions?

Refer to the main documentation:
- **What was built?** → `COMPLETE_PRODUCT_DOCUMENTATION.md` → Executive Summary
- **How to integrate?** → `COMPLETE_PRODUCT_DOCUMENTATION.md` → Integration Guides
- **How to deploy?** → `COMPLETE_PRODUCT_DOCUMENTATION.md` → Deployment & Operations
- **Common issues?** → `COMPLETE_PRODUCT_DOCUMENTATION.md` → FAQ & Troubleshooting

---

**Status:** ✅ Production Ready  
**Last Updated:** 2026-05-31  
**API Version:** 2.0 (Mobile API v2)
