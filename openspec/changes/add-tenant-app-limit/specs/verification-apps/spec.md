## MODIFIED Requirements

### Requirement: Multiple Verification Apps per Tenant
The system SHALL support creating multiple verification apps for different channels per tenant, subject to a per-tenant configurable limit set by SUPER_ADMIN.

#### Scenario: Create verification app within limit
- **WHEN** a TENANT_ADMIN creates a verification app "Mobile App - iOS"
- **AND** the tenant's current app count is below `settings.max_verification_apps`
- **THEN** the system SHALL:
  - Generate a unique API key
  - Create app record with name and type (MOBILE)
  - Return app ID and API key (shown once)
  - Associate app with tenant

#### Scenario: Reject app creation when limit is reached
- **WHEN** a TENANT_ADMIN attempts to create a new verification app
- **AND** the tenant's current app count equals `settings.max_verification_apps`
- **THEN** the system SHALL reject the request with HTTP 422
- **AND** return error message "Verification app limit reached. Contact your administrator to increase the limit."
- **AND** NOT create the app record

#### Scenario: Multiple apps for different channels
- **WHEN** a tenant creates apps: "Mobile App", "Web Kiosk", "POS Terminal"
- **THEN** each app SHALL have:
  - Unique API key for authentication
  - Independent configuration settings
  - Separate scan history and analytics
  - Same access to tenant's products and coupons

---

## ADDED Requirements

### Requirement: Verification App Usage Display
The system SHALL display the tenant's current verification app usage relative to their configured limit.

#### Scenario: Tenant admin sees usage indicator in app list
- **WHEN** a TENANT_ADMIN views the verification apps list
- **THEN** the system SHALL display a usage summary such as "1 of 3 apps used"
- **AND** disable the "Create App" button when the limit is reached
- **AND** show a tooltip "Contact your administrator to increase the app limit" on the disabled button

#### Scenario: Usage count reflects only non-deleted apps
- **WHEN** a TENANT_ADMIN has created 3 apps, deleted 2, and the limit is 3
- **THEN** the system SHALL count 1 app as in use
- **AND** the tenant SHALL be able to create 2 more apps
