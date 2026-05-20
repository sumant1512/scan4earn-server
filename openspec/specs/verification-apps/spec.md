# Verification Apps

## Purpose
Verification Apps represent separate application instances (mobile, web, kiosk, POS) that scan and verify coupons. Each app has unique API key, configuration, and tracks its own scan history.

---

## Requirements

### Requirement: Multiple Verification Apps per Tenant
The system SHALL support creating multiple verification apps for different channels per tenant.

#### Scenario: Create verification app
- **WHEN** a TENANT_ADMIN creates a verification app "Mobile App - iOS"
- **THEN** the system SHALL:
  - Generate a unique API key
  - Create app record with name and type (MOBILE)
  - Return app ID and API key (shown once)
  - Associate app with tenant

#### Scenario: Multiple apps for different channels
- **WHEN** a tenant creates apps: "Mobile App", "Web Kiosk", "POS Terminal"
- **THEN** each app SHALL have:
  - Unique API key for authentication
  - Independent configuration settings
  - Separate scan history and analytics
  - Same access to tenant's products and coupons

---

### Requirement: API Key Authentication
The system SHALL generate and validate unique API keys for each verification app.

#### Scenario: API key generation
- **WHEN** a verification app is created
- **THEN** the system SHALL generate a secure random API key
- **AND** hash the key before storing in database
- **AND** display the plaintext key to user ONCE
- **AND** warn user to store the key securely

#### Scenario: API key authentication
- **WHEN** an external app makes a request with `Authorization: Bearer <api_key>`
- **THEN** the system SHALL:
  - Hash the provided key
  - Lookup the app by hashed key
  - Validate app is active
  - Inject app context (app_id, tenant_id) into request
  - Reject if key is invalid

#### Scenario: API key regeneration
- **WHEN** a TENANT_ADMIN regenerates the API key for an app
- **THEN** the system SHALL:
  - Invalidate the old key immediately
  - Generate a new key
  - Return the new key (shown once)
  - Log the regeneration event

---

### Requirement: App-Specific Configuration
The system SHALL support flexible JSONB configuration for each verification app.

#### Scenario: Configure app settings
- **WHEN** configuring a verification app with settings:
```json
{
  "allow_duplicate_scans": false,
  "require_user_authentication": true,
  "scan_cooldown_seconds": 60,
  "max_scans_per_day": 100,
  "webhook_url": "https://example.com/webhook"
}
```
- **THEN** the system SHALL:
  - Store settings in JSONB column
  - Apply settings during scan operations
  - Validate settings structure

#### Scenario: Webhook notification on scan
- **WHEN** a coupon is scanned via an app with `webhook_url` configured
- **THEN** the system SHALL send POST request to webhook URL
- **AND** include scan details (coupon, user, timestamp)
- **AND** retry up to 3 times on failure

---

### Requirement: App Types and Categorization
The system SHALL support categorizing apps by type: MOBILE, WEB, KIOSK, POS.

#### Scenario: App type selection
- **WHEN** creating a verification app
- **THEN** the user SHALL select app type from: MOBILE, WEB, KIOSK, POS
- **AND** the type SHALL be stored for filtering and analytics

#### Scenario: Filter scans by app type
- **WHEN** viewing analytics filtered by app type "MOBILE"
- **THEN** the system SHALL show scans only from MOBILE apps
- **AND** compare performance across app types

---

### Requirement: App-Scoped Product and Coupon Access
The system SHALL allow filtering products and coupons by verification app.

#### Scenario: App-specific product assignment
- **WHEN** a TENANT_ADMIN assigns products ["Pizza", "Burger"] to app "Restaurant Kiosk"
- **THEN** the app SHALL only see those products via API
- **AND** NOT see other tenant products

#### Scenario: App context in scan tracking
- **WHEN** a coupon is scanned via app "Mobile App - iOS"
- **THEN** the scan history SHALL record app_id
- **AND** analytics SHALL show which app performed the scan

---

### Requirement: App Activation and Deactivation
The system SHALL allow activating/deactivating verification apps without deletion.

#### Scenario: Deactivate app
- **WHEN** a TENANT_ADMIN deactivates an app
- **THEN** the system SHALL:
  - Set is_active = false
  - Reject all API requests with that app's key
  - Return error "App is deactivated"
  - Preserve app configuration and history

#### Scenario: Reactivate app
- **WHEN** a TENANT_ADMIN reactivates an app
- **THEN** the system SHALL:
  - Set is_active = true
  - Allow API requests with existing key
  - Resume normal operations

---

### Requirement: App Deletion with Safeguards
The system SHALL prevent deletion of apps with scan history.

#### Scenario: Delete app without scans
- **WHEN** deleting an app with no scan history
- **THEN** the system SHALL delete the app record
- **AND** invalidate the API key

#### Scenario: Prevent deletion of app with scans
- **WHEN** attempting to delete an app with scan history
- **THEN** the system SHALL reject with error "Cannot delete app with scan history"
- **AND** suggest deactivation instead

---

## Database Schema

**Tables:**
- `verification_apps` - App configurations
  - `id`, `tenant_id`, `name`, `app_type` (ENUM), `api_key_hash`, `settings` (JSONB), `is_active`, `created_at`, `updated_at`
- `scan_history` - Scan records with `app_id` reference

**App Type Enum:** `MOBILE`, `WEB`, `KIOSK`, `POS`

**Indexes:**
- Unique index on `api_key_hash`
- Index on `tenant_id` and `is_active`

---

## API Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/api/verification-apps` | Create app | `MANAGE_APPS` |
| GET | `/api/verification-apps` | List apps | `VIEW_APPS` |
| GET | `/api/verification-apps/:id` | Get app details | `VIEW_APPS` |
| PUT | `/api/verification-apps/:id` | Update app config | `MANAGE_APPS` |
| POST | `/api/verification-apps/:id/regenerate-key` | Regenerate API key | `MANAGE_APPS` |
| DELETE | `/api/verification-apps/:id` | Delete app | `MANAGE_APPS` |

---

## UI Components

- `VerificationAppListComponent` - List all apps with status
- `VerificationAppConfigureComponent` - Create/edit app
- `VerificationAppApiConfigComponent` - API key management
- `AppSelectorComponent` - Header dropdown to switch between apps

---

## Security Considerations

1. **API Key Storage**: Keys MUST be hashed before database storage (bcrypt)
2. **Key Display**: Plaintext key SHOULD be shown only once during creation
3. **Key Regeneration**: Old keys MUST be invalidated immediately
4. **Rate Limiting**: API endpoints SHOULD enforce rate limits per app
5. **HTTPS Only**: API keys MUST only be transmitted over HTTPS
