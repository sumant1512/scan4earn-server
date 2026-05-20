# Authentication & Authorization

## Purpose
MScan uses OTP-based passwordless authentication with JWT tokens and permission-based authorization for fine-grained access control.

---

## Requirements

### Requirement: OTP-Based Authentication
The system SHALL provide passwordless authentication using email-based One-Time Passwords (OTP).

#### Scenario: User requests OTP
- **WHEN** a user submits their email address
- **THEN** the system SHALL generate a 6-digit OTP
- **AND** send the OTP via email using Nodemailer
- **AND** mark the OTP as valid for 5 minutes

#### Scenario: User verifies OTP
- **WHEN** a user submits a valid OTP within the expiry window
- **THEN** the system SHALL validate the OTP
- **AND** generate an access token (expiry: 30 minutes) and refresh token (expiry: 7 days)
- **AND** mark the OTP as used
- **AND** return the tokens to the user

#### Scenario: Expired OTP rejection
- **WHEN** a user submits an OTP older than 5 minutes
- **THEN** the system SHALL reject with error "OTP expired"
- **AND** the user SHALL request a new OTP

#### Scenario: OTP rate limiting
- **WHEN** a user requests more than 5 OTPs within 15 minutes
- **THEN** the system SHALL reject with error "Too many OTP requests"
- **AND** enforce a cooldown period

---

### Requirement: JWT Token Management
The system SHALL use JSON Web Tokens (JWT) for session management with access and refresh token strategy.

#### Scenario: Access token usage
- **WHEN** a user makes an authenticated API request
- **THEN** the system SHALL verify the access token signature
- **AND** extract user claims (userId, tenantId, userType, permissions)
- **AND** inject user context into the request

#### Scenario: Access token expiration
- **WHEN** an access token expires (after 30 minutes)
- **THEN** the system SHALL reject the request with 401 Unauthorized
- **AND** the client SHALL use the refresh token to obtain a new access token

#### Scenario: Refresh token rotation
- **WHEN** a client uses a refresh token to obtain new access token
- **THEN** the system SHALL validate the refresh token
- **AND** issue a new access token
- **AND** optionally issue a new refresh token (rotation)

---

### Requirement: Role-Based Access Control
The system SHALL support three user types with hierarchical permissions: SUPER_ADMIN, TENANT_ADMIN, and TENANT_USER.

#### Scenario: Super Admin full access
- **WHEN** a SUPER_ADMIN user accesses any resource
- **THEN** the system SHALL grant access without permission checks
- **AND** all features SHALL be available

#### Scenario: Tenant Admin tenant-scoped access
- **WHEN** a TENANT_ADMIN accesses resources
- **THEN** the system SHALL grant full access within their tenant
- **AND** restrict access to other tenants' data

#### Scenario: Tenant User permission-based access
- **WHEN** a TENANT_USER accesses a resource
- **THEN** the system SHALL check if the user has the required permission
- **AND** grant access only if permission exists

---

### Requirement: Fine-Grained Permissions
The system SHALL support granular permissions for TENANT_USER roles following the pattern `{action}_{resource}`.

#### Scenario: Permission assignment
- **WHEN** a TENANT_ADMIN assigns permission `CREATE_PRODUCTS` to a TENANT_USER
- **THEN** the system SHALL store the permission in `user_permissions` table
- **AND** the user SHALL be able to create products

#### Scenario: Permission enforcement on API
- **WHEN** a TENANT_USER with only `VIEW_PRODUCTS` permission attempts to create a product
- **THEN** the system SHALL reject with 403 Forbidden
- **AND** return error "Missing permission: CREATE_PRODUCTS"

#### Scenario: Frontend permission-based rendering
- **WHEN** a user's permissions are loaded
- **THEN** the frontend SHALL hide UI elements for actions without permission
- **AND** disable buttons/links for restricted features

---

### Requirement: Logout and Token Revocation
The system SHALL support user logout with token revocation.

#### Scenario: User logout
- **WHEN** a user logs out
- **THEN** the system SHALL revoke the refresh token
- **AND** clear client-side tokens
- **AND** subsequent requests with the access token SHALL fail after expiry

---

## Available Permissions

| Resource | Permissions |
|----------|-------------|
| Products | `VIEW_PRODUCTS`, `CREATE_PRODUCTS`, `EDIT_PRODUCTS`, `DELETE_PRODUCTS` |
| Coupons | `VIEW_COUPONS`, `CREATE_COUPONS`, `ACTIVATE_COUPONS`, `DELETE_COUPONS` |
| Users | `VIEW_TENANT_USERS`, `MANAGE_TENANT_USERS`, `ASSIGN_PERMISSIONS` |
| Analytics | `VIEW_ANALYTICS`, `EXPORT_REPORTS` |
| Apps | `VIEW_APPS`, `MANAGE_APPS` |
| Credits | `VIEW_CREDITS`, `REQUEST_CREDITS` |

---

## Database Schema

- `users` - User accounts with `user_type` (SUPER_ADMIN, TENANT_ADMIN, TENANT_USER)
- `otps` - OTP codes with expiry timestamp and used flag
- `user_permissions` - Permission assignments (user_id, permission_code)
- `refresh_tokens` - Active refresh tokens

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/request-otp` | Request OTP |
| POST | `/api/auth/verify-otp` | Verify OTP and login |
| POST | `/api/auth/refresh-token` | Refresh access token |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/permissions` | List all permissions |
| POST | `/api/permissions/assign` | Assign permission to user |
| DELETE | `/api/permissions/revoke` | Revoke permission |

---

## UI Components

- `LoginComponent` - OTP-based login form (src/app/components/login/)
- `UserPermissionsComponent` - Manage user permissions
- `AuthGuard` - Route protection based on authentication
- `PermissionGuard` - Route protection based on permissions

---

## Security Considerations

1. **OTP Expiry**: OTPs MUST expire after 5 minutes
2. **OTP Single Use**: OTPs MUST be marked as used after verification
3. **Rate Limiting**: OTP requests MUST be rate-limited per email
4. **JWT Secrets**: JWT secrets MUST be stored securely in environment variables
5. **Token Storage**: Access tokens SHOULD be stored in memory, refresh tokens in httpOnly cookies
6. **Permission Validation**: Permissions MUST be checked on both frontend and backend
