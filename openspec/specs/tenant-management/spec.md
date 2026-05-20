# Tenant Management

## Purpose
Super Admins can create, configure, and manage tenant accounts. Each tenant represents a business using the MScan platform with unique subdomain and settings.

---

## Requirements

### Requirement: Tenant Creation
The system SHALL allow SUPER_ADMIN users to create new tenant accounts with unique subdomains.

#### Scenario: Successful tenant creation
- **WHEN** a SUPER_ADMIN creates a tenant with subdomain `acme` and name `Acme Corp`
- **THEN** the system SHALL validate subdomain uniqueness
- **AND** create the tenant record in the database
- **AND** assign initial credit balance (default: 100 credits)
- **AND** return the created tenant with ID and subdomain

#### Scenario: Duplicate subdomain rejection
- **WHEN** a SUPER_ADMIN attempts to create a tenant with an existing subdomain
- **THEN** the system SHALL reject with error "Subdomain already exists"
- **AND** NOT create the tenant record

#### Scenario: Real-time subdomain validation
- **WHEN** a user types a subdomain in the tenant creation form
- **THEN** the frontend SHALL check availability in real-time
- **AND** display availability status before form submission

---

### Requirement: Tenant Admin Auto-Creation
The system SHALL automatically create a TENANT_ADMIN user when a new tenant is created.

#### Scenario: Tenant Admin creation with invitation
- **WHEN** a new tenant is created with admin email `admin@acme.com`
- **THEN** the system SHALL create a TENANT_ADMIN user account
- **AND** generate an OTP invitation
- **AND** send the OTP invitation email to `admin@acme.com`
- **AND** the admin SHALL use the OTP to login for the first time

---

### Requirement: Tenant Settings Configuration
The system SHALL support tenant-specific settings stored as JSONB for flexibility.

#### Scenario: Configure tenant settings
- **WHEN** a SUPER_ADMIN or TENANT_ADMIN updates tenant settings
- **THEN** the system SHALL accept JSONB configuration
- **AND** store settings like `allow_public_scan`, `require_email_verification`, `max_products`, etc.
- **AND** the settings SHALL be applied to tenant operations

**Example Settings:**
```json
{
  "allow_public_scan": true,
  "require_email_verification": true,
  "max_products": 1000,
  "max_coupons_per_batch": 10000
}
```

---

### Requirement: Tenant Activation and Deactivation
The system SHALL allow SUPER_ADMIN to activate or deactivate tenants.

#### Scenario: Deactivate tenant
- **WHEN** a SUPER_ADMIN deactivates a tenant
- **THEN** the system SHALL set `is_active = false`
- **AND** all tenant users SHALL be unable to login
- **AND** subdomain access SHALL return "Account inactive" message

#### Scenario: Reactivate tenant
- **WHEN** a SUPER_ADMIN reactivates a previously inactive tenant
- **THEN** the system SHALL set `is_active = true`
- **AND** tenant users SHALL regain login access

---

### Requirement: Tenant Statistics and Monitoring
The system SHALL provide SUPER_ADMIN with tenant usage statistics.

#### Scenario: View tenant statistics
- **WHEN** a SUPER_ADMIN views tenant details
- **THEN** the system SHALL display:
  - Total products created
  - Total coupons generated
  - Total scans performed
  - Credit balance and usage history
  - Last activity timestamp

---

### Requirement: Initial Credit Allocation
The system SHALL assign initial credits to new tenants.

#### Scenario: Default credit assignment
- **WHEN** a tenant is created without specifying credits
- **THEN** the system SHALL assign 100 credits by default
- **AND** record the initial credit transaction

#### Scenario: Custom credit assignment
- **WHEN** a SUPER_ADMIN creates a tenant with custom credits (e.g., 500)
- **THEN** the system SHALL assign the specified amount
- **AND** record the transaction with reason "Initial allocation"

---

## Database Schema

- `tenants` - Tenant accounts
  - `id` (UUID, primary key)
  - `subdomain` (VARCHAR, unique)
  - `name` (VARCHAR)
  - `credit_balance` (INTEGER, default: 100)
  - `settings` (JSONB, nullable)
  - `is_active` (BOOLEAN, default: true)
  - `created_at`, `updated_at` (TIMESTAMP)

**Indexes:**
- Unique index on `subdomain`
- Index on `is_active` for filtering

---

## API Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/tenants` | Create new tenant | SUPER_ADMIN |
| GET | `/api/tenants` | List all tenants with pagination | SUPER_ADMIN |
| GET | `/api/tenants/:id` | Get tenant details | SUPER_ADMIN, TENANT_ADMIN (own) |
| PUT | `/api/tenants/:id` | Update tenant settings | SUPER_ADMIN, TENANT_ADMIN (own) |
| POST | `/api/tenant-admins` | Create tenant admin | SUPER_ADMIN |

---

## UI Components

- `TenantListComponent` - List all tenants with search/filter (SUPER_ADMIN)
- `TenantFormComponent` - Create/edit tenant form
- `TenantDetailComponent` - View tenant statistics and details
- `AddTenantAdminComponent` - Create additional tenant admins

---

## Validation Rules

1. **Subdomain Format**: Alphanumeric, lowercase, 3-20 characters, no special chars except hyphen
2. **Reserved Subdomains**: Cannot use: www, api, admin, app, mail, ftp, smtp, staging, dev, test, demo
3. **Tenant Name**: Required, 2-100 characters
4. **Admin Email**: Valid email format, unique across the system
5. **Credit Balance**: Non-negative integer
