## MODIFIED Requirements

### Requirement: Tenant User Creation
The system SHALL allow TENANT_ADMIN users to create new users within their tenant with specific roles including TENANT_ADMIN, TENANT_USER, DEALER, and CUSTOMER.

#### Scenario: Create Tenant Admin user
- **WHEN** a TENANT_ADMIN creates a new user with role TENANT_ADMIN
- **THEN** the system SHALL:
  - Create user account with email and tenant association
  - Set user_type to TENANT_ADMIN
  - Generate OTP invitation
  - Send invitation email
  - NOT require permission assignment (TENANT_ADMIN has full access)

#### Scenario: Create Tenant User with permissions
- **WHEN** a TENANT_ADMIN creates a new user with role TENANT_USER
- **THEN** the system SHALL:
  - Create user account
  - Set user_type to TENANT_USER
  - Prompt for initial permission selection
  - Create permission assignments in `user_permissions` table
  - Send invitation email with login instructions

#### Scenario: Create Dealer user
- **WHEN** a TENANT_ADMIN creates a new user with role DEALER
- **THEN** the system SHALL:
  - Validate required fields: full_name, email, phone_e164, shop_name, address, pincode, city, state
  - Create a `users` record with role=DEALER, full_name, email, phone_e164, and tenant_id
  - Create a `dealers` record with shop_name, address, pincode, city, state
  - Auto-generate dealer_code if not provided
  - Initialize `dealer_points` record with balance=0
  - NOT send email invitation (dealers use mobile OTP login)

#### Scenario: Customer auto-registration
- **WHEN** a mobile user verifies OTP for the first time
- **THEN** the system SHALL:
  - Create user account with phone_e164 and tenant association (mobile number only, no name or email required)
  - Set role to CUSTOMER
  - Create or update `customers` record with phone_verified=true
  - NOT require admin intervention

#### Scenario: Email uniqueness validation
- **WHEN** creating a user with email already in use
- **THEN** the system SHALL reject with error "Email already exists"
- **AND** suggest using a different email

## ADDED Requirements

### Requirement: User Type Hierarchy with Five Roles
The system SHALL recognize five distinct user types in a hierarchy.

#### Scenario: Complete role hierarchy
- **WHEN** the system evaluates user permissions
- **THEN** the hierarchy SHALL be:
  1. **SUPER_ADMIN** — Platform-level, all permissions, no tenant association
  2. **TENANT_ADMIN** — Tenant-level, full access within tenant, manages users and dealers
  3. **TENANT_USER** — Restricted tenant access, explicit permissions required
  4. **DEALER** — Tenant-scoped, mobile-first, scan and earn points only
  5. **CUSTOMER** — Tenant-scoped, mobile-first, ecommerce and cashback access
