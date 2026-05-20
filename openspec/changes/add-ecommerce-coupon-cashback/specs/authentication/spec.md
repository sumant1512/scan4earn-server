## MODIFIED Requirements

### Requirement: Role-Based Access Control
The system SHALL support five user types with hierarchical permissions: SUPER_ADMIN, TENANT_ADMIN, TENANT_USER, DEALER, and CUSTOMER.

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

#### Scenario: Dealer scoped access
- **WHEN** a DEALER user accesses a resource
- **THEN** the system SHALL verify the user has role DEALER
- **AND** restrict access to dealer-permitted endpoints only (scan, points, profile)
- **AND** scope data to the dealer's tenant

#### Scenario: Customer scoped access
- **WHEN** a CUSTOMER user accesses a resource
- **THEN** the system SHALL verify the user has role CUSTOMER
- **AND** restrict access to customer-permitted endpoints only (ecommerce, cashback, profile)
- **AND** scope data to the customer's tenant

## ADDED Requirements

### Requirement: Mobile OTP Authentication for CUSTOMER
The system SHALL provide OTP-based mobile authentication for CUSTOMER users with automatic profile creation on first login. Customer registration requires mobile number only — no name, email, or other fields.

#### Scenario: Customer requests OTP via mobile number
- **WHEN** a user submits their mobile number (E.164 format) to `/api/mobile/v1/auth/request-otp`
- **THEN** the system SHALL generate a 6-digit OTP
- **AND** store the OTP in `mobile_otps` with tenant context
- **AND** mark the OTP as valid for 5 minutes
- **AND** return `{ expiresIn: 5 }` to the client

#### Scenario: Customer verifies OTP and auto-registers
- **WHEN** a user submits a valid OTP for an unregistered mobile number
- **THEN** the system SHALL create a `users` record with role=CUSTOMER, phone_e164 only (no name or email required)
- **AND** create or update a `customers` record with phone_verified=true
- **AND** generate JWT tokens with role=CUSTOMER, tenantId, and permissions
- **AND** return `{ accessToken, refreshToken, role: "CUSTOMER", is_new_user: true }`

#### Scenario: Returning customer OTP login
- **WHEN** a user submits a valid OTP for a previously registered mobile number
- **THEN** the system SHALL NOT create a new user
- **AND** generate JWT tokens for the existing CUSTOMER user
- **AND** return `{ accessToken, refreshToken, role: "CUSTOMER", is_new_user: false }`

#### Scenario: OTP rate limiting for mobile
- **WHEN** a mobile number requests more than 5 OTPs within 15 minutes
- **THEN** the system SHALL reject with 429 Too Many Requests
- **AND** return `{ error: "rate_limited" }`

### Requirement: Mobile OTP Authentication for DEALER
The system SHALL provide OTP-based mobile authentication for DEALER users. Dealers MUST be pre-registered by a TENANT_ADMIN.

#### Scenario: Dealer requests OTP via mobile number
- **WHEN** a dealer submits their registered mobile number to `/api/mobile/v1/auth/dealer/request-otp`
- **THEN** the system SHALL validate the mobile number exists as a DEALER in the tenant
- **AND** generate a 6-digit OTP
- **AND** return `{ expiresIn: 5 }`

#### Scenario: Dealer OTP login for pre-registered dealer
- **WHEN** a dealer submits a valid OTP
- **THEN** the system SHALL generate JWT tokens with role=DEALER
- **AND** include dealer_id in the token payload
- **AND** return `{ accessToken, refreshToken, role: "DEALER" }`

#### Scenario: Unregistered phone attempts dealer login
- **WHEN** a mobile number not registered as DEALER attempts to login via dealer auth endpoint
- **THEN** the system SHALL reject with 404 Not Found
- **AND** return `{ error: "Dealer not found. Contact your administrator." }`

### Requirement: Unified User Context for All Roles
The system SHALL return role-specific context in the GET `/api/mobile/v1/auth/me` endpoint.

#### Scenario: Customer context response
- **WHEN** a CUSTOMER user requests their context
- **THEN** the system SHALL return:
  - `id`, `phone`, `full_name`, `email`, `role: "CUSTOMER"`
  - `tenant: { id, name, subdomain }`
  - `profile_complete: true/false` (based on name and email presence)

#### Scenario: Dealer context response
- **WHEN** a DEALER user requests their context
- **THEN** the system SHALL return:
  - `id`, `phone`, `full_name`, `role: "DEALER"`
  - `tenant: { id, name, subdomain }`
  - `dealer: { dealer_code, shop_name, points_balance }`
