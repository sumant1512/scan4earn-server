# Mobile API v1

## Purpose
The Mobile API v1 provides a unified, role-aware REST API for the MScan mobile app, supporting CUSTOMER and DEALER users with OTP-based authentication, profile management, and role-specific features (ecommerce, cashback, dealer scanning). All endpoints are under `/api/mobile/v1/` — no v2 versioning as the product is not yet released.

---

## ADDED Requirements

### Requirement: Mobile API v1 Authentication
The system SHALL provide mobile authentication endpoints under `/api/mobile/v1/auth/` supporting both CUSTOMER auto-registration (mobile number only) and DEALER pre-registered login.

#### Scenario: Customer OTP request
- **WHEN** POST `/api/mobile/v1/auth/request-otp` is called with `{ phone_e164, tenant_slug }`
- **THEN** the system SHALL:
  - Resolve tenant from subdomain or tenant_slug parameter
  - Generate 6-digit OTP
  - Store in `mobile_otps` table
  - Return `{ success: true, expiresIn: 5 }`
  - Log OTP to console in dev mode (OTP_DEV_MODE=true)

#### Scenario: Customer OTP verify with auto-registration
- **WHEN** POST `/api/mobile/v1/auth/verify-otp` is called with `{ phone_e164, otp }`
- **THEN** the system SHALL:
  - Verify OTP matches and is not expired
  - If phone_e164 is new: create `users` (role=CUSTOMER, phone_e164 only — no name or email required) + `customers` (phone_verified=true)
  - Generate JWT with `{ userId, role: "CUSTOMER", tenantId, subdomainSlug }`
  - Return `{ accessToken, refreshToken, role: "CUSTOMER", is_new_user: true/false }`

#### Scenario: Dealer OTP request
- **WHEN** POST `/api/mobile/v1/auth/dealer/request-otp` is called with `{ phone_e164 }`
- **THEN** the system SHALL:
  - Validate phone exists as DEALER user in the tenant
  - If not found: return 404 `{ error: "Dealer not found" }`
  - If found: generate OTP and return `{ success: true, expiresIn: 5 }`

#### Scenario: Dealer OTP verify
- **WHEN** POST `/api/mobile/v1/auth/dealer/verify-otp` is called with `{ phone_e164, otp }`
- **THEN** the system SHALL:
  - Verify OTP for the dealer
  - Generate JWT with `{ userId, role: "DEALER", tenantId, subdomainSlug, dealerId }`
  - Return `{ accessToken, refreshToken, role: "DEALER" }`

#### Scenario: Token refresh
- **WHEN** POST `/api/mobile/v1/auth/refresh` is called with `{ refreshToken }`
- **THEN** the system SHALL verify the refresh token and issue new token pair

#### Scenario: Get authenticated user profile
- **WHEN** GET `/api/mobile/v1/auth/me` is called with valid JWT
- **THEN** the system SHALL return role-specific profile:
  - CUSTOMER: `{ id, phone, full_name, email, role, tenant, profile_complete }`
  - DEALER: `{ id, phone, full_name, role, tenant, dealer: { code, shop_name, points } }`

#### Scenario: Logout
- **WHEN** POST `/api/mobile/v1/auth/logout` is called
- **THEN** the system SHALL blacklist the current tokens

### Requirement: Mobile API Response Format
The system SHALL return consistent response format across all mobile v1 endpoints.

#### Scenario: Success response format
- **WHEN** any mobile v1 endpoint succeeds
- **THEN** the response SHALL follow format:
  ```json
  {
    "status": true,
    "data": { ... },
    "message": "Optional success message"
  }
  ```

#### Scenario: Error response format
- **WHEN** any mobile v1 endpoint fails
- **THEN** the response SHALL follow format:
  ```json
  {
    "status": false,
    "error": {
      "message": "Human-readable error",
      "code": "MACHINE_READABLE_CODE"
    }
  }
  ```

### Requirement: Mobile API Rate Limiting
The system SHALL enforce rate limits on mobile v1 endpoints to prevent abuse.

#### Scenario: OTP request rate limiting
- **WHEN** a mobile number requests OTP more than 5 times in 15 minutes
- **THEN** the system SHALL return 429 Too Many Requests
- **AND** include `retry_after` in response

#### Scenario: Scan endpoint rate limiting
- **WHEN** a user makes more than 60 scan requests per minute
- **THEN** the system SHALL return 429 Too Many Requests

### Requirement: Mobile API Feature Flag Enforcement
The system SHALL check feature flags before granting access to module-specific endpoints.

#### Scenario: Ecommerce module disabled
- **WHEN** a CUSTOMER accesses `/api/mobile/v1/ecommerce/*` and `ecommerce` flag is disabled
- **THEN** the system SHALL return 403 `{ error: "Feature not available", code: "FEATURE_DISABLED" }`

#### Scenario: Cashback module disabled
- **WHEN** a CUSTOMER accesses `/api/mobile/v1/cashback/*` and `coupon_cashback` flag is disabled
- **THEN** the system SHALL return 403 `{ error: "Feature not available", code: "FEATURE_DISABLED" }`

#### Scenario: Dealer scanning disabled
- **WHEN** a DEALER accesses `/api/mobile/v1/dealer/scan` and `coupon_cashback.dealer_scanning` flag is disabled
- **THEN** the system SHALL return 403 `{ error: "Dealer scanning not enabled", code: "FEATURE_DISABLED" }`

---

## Complete API Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/auth/request-otp` | None | Customer OTP request |
| POST | `/api/mobile/v1/auth/verify-otp` | None | Customer OTP verify + auto-register |
| POST | `/api/mobile/v1/auth/dealer/request-otp` | None | Dealer OTP request |
| POST | `/api/mobile/v1/auth/dealer/verify-otp` | None | Dealer OTP verify |
| POST | `/api/mobile/v1/auth/refresh` | None | Refresh tokens |
| GET | `/api/mobile/v1/auth/me` | JWT | Get profile |
| POST | `/api/mobile/v1/auth/logout` | JWT | Logout |

### Dealer Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/dealer/scan` | JWT (DEALER) | Scan QR code |
| GET | `/api/mobile/v1/dealer/points` | JWT (DEALER) | Points balance |
| GET | `/api/mobile/v1/dealer/points/history` | JWT (DEALER) | Points history |
| GET | `/api/mobile/v1/dealer/profile` | JWT (DEALER) | Dealer profile |

### Customer Cashback Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/cashback/scan` | JWT (CUSTOMER) | Scan for cashback |
| POST | `/api/mobile/v1/cashback/upi` | JWT (CUSTOMER) | Save UPI ID |
| GET | `/api/mobile/v1/cashback/upi` | JWT (CUSTOMER) | Get UPI details |
| POST | `/api/mobile/v1/cashback/claim` | JWT (CUSTOMER) | Claim cashback |
| GET | `/api/mobile/v1/cashback/history` | JWT (CUSTOMER) | Cashback history |
| GET | `/api/mobile/v1/cashback/balance` | JWT (CUSTOMER) | Cashback balance |

### Customer Ecommerce Endpoints (Profile & Catalog Only)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/mobile/v1/ecommerce/products` | JWT (CUSTOMER) | Browse products |
| GET | `/api/mobile/v1/ecommerce/products/:id` | JWT (CUSTOMER) | Product details |
| GET | `/api/mobile/v1/ecommerce/profile` | JWT (CUSTOMER) | Get profile |
| PUT | `/api/mobile/v1/ecommerce/profile` | JWT (CUSTOMER) | Update profile |

### Public Cashback Endpoints (No App Required)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/public/cashback/start` | None | Start session |
| POST | `/api/public/cashback/:sessionId/mobile` | None | Submit mobile |
| POST | `/api/public/cashback/:sessionId/verify-otp` | None | Verify OTP |
| POST | `/api/public/cashback/:sessionId/upi` | None | Submit UPI |
| POST | `/api/public/cashback/:sessionId/confirm` | None | Confirm cashback |

---

## JWT Token Payload

### Customer Token
```json
{
  "userId": "uuid",
  "role": "CUSTOMER",
  "tenantId": "uuid",
  "subdomainSlug": "tenant-slug",
  "permissions": [],
  "jti": "unique-id",
  "type": "access"
}
```

### Dealer Token
```json
{
  "userId": "uuid",
  "role": "DEALER",
  "tenantId": "uuid",
  "subdomainSlug": "tenant-slug",
  "dealerId": "uuid",
  "permissions": [],
  "jti": "unique-id",
  "type": "access"
}
```

---

## Security Considerations

1. **Tenant Resolution**: Mobile API MUST resolve tenant from subdomain header or explicit tenant parameter
2. **Role Enforcement**: Each endpoint group MUST verify the caller's role matches expected role
3. **Feature Flag Checks**: Module endpoints MUST check feature flags before processing
4. **Token Expiry**: Mobile access tokens expire in 30 minutes; refresh tokens in 7 days
5. **OTP Security**: OTPs expire after 5 minutes, max 3 verification attempts per OTP
6. **Rate Limiting**: All public and auth endpoints MUST have rate limiting
7. **Data Isolation**: All queries MUST filter by tenant_id
