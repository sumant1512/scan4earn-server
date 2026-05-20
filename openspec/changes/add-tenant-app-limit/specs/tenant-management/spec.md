## MODIFIED Requirements

### Requirement: Tenant Creation
The system SHALL allow SUPER_ADMIN users to create new tenant accounts with unique subdomains.

#### Scenario: Successful tenant creation
- **WHEN** a SUPER_ADMIN creates a tenant with subdomain `acme` and name `Acme Corp`
- **THEN** the system SHALL validate subdomain uniqueness
- **AND** create the tenant record in the database
- **AND** assign initial credit balance (default: 100 credits)
- **AND** set `settings.max_verification_apps` to the value provided by the super admin (default: 1 if not specified)
- **AND** return the created tenant with ID and subdomain

#### Scenario: Duplicate subdomain rejection
- **WHEN** a SUPER_ADMIN attempts to create a tenant with an existing subdomain
- **THEN** the system SHALL reject with error "Subdomain already exists"
- **AND** NOT create the tenant record

#### Scenario: Real-time subdomain validation
- **WHEN** a user types a subdomain in the tenant creation form
- **THEN** the frontend SHALL check availability in real-time
- **AND** display availability status before form submission

#### Scenario: Setting max verification apps at creation
- **WHEN** a SUPER_ADMIN creates a tenant and sets `max_verification_apps` to `10`
- **THEN** the system SHALL store `10` in `settings.max_verification_apps`
- **AND** the tenant admin SHALL be limited to creating at most 10 verification apps

#### Scenario: Default max verification apps when not specified
- **WHEN** a SUPER_ADMIN creates a tenant without specifying `max_verification_apps`
- **THEN** the system SHALL default `settings.max_verification_apps` to `1`

---

## ADDED Requirements

### Requirement: Tenant Verification App Limit Management
The system SHALL allow SUPER_ADMIN to view and update the maximum number of verification apps a tenant is permitted to create.

#### Scenario: Update app limit for existing tenant
- **WHEN** a SUPER_ADMIN updates a tenant's `max_verification_apps` from `1` to `10`
- **THEN** the system SHALL persist the new limit in `settings.max_verification_apps`
- **AND** the tenant admin SHALL immediately be able to create apps up to the new limit

#### Scenario: Reduce app limit below current usage
- **WHEN** a SUPER_ADMIN sets `max_verification_apps` to a value lower than the tenant's current app count
- **THEN** the system SHALL persist the new (lower) limit
- **AND** the tenant SHALL NOT be able to create additional apps until their app count falls below the new limit
- **AND** existing apps SHALL remain active and unaffected

#### Scenario: Super admin views app usage in tenant detail
- **WHEN** a SUPER_ADMIN views the detail page for a tenant
- **THEN** the system SHALL display the current number of active verification apps
- **AND** the configured `max_verification_apps` limit
- **AND** allow inline editing of the limit without leaving the page
