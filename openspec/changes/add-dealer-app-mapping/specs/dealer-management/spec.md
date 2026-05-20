## ADDED Requirements

### Requirement: Dealer Must Be Scoped to a Verification App
The system SHALL require a `verification_app_id` when creating a dealer. Every dealer record MUST be permanently linked to exactly one verification app. The `verification_app_id` is set at creation and cannot be changed. Attempts to create a dealer without a valid `verification_app_id` SHALL be rejected.

#### Scenario: Create dealer with valid app ID
- **WHEN** a TENANT_ADMIN sends `POST /api/dealers` with a valid `verification_app_id` belonging to their tenant
- **THEN** the system SHALL create the dealer record linked to that app
- **AND** return the created dealer including `verification_app_id`

#### Scenario: Create dealer without app ID
- **WHEN** a TENANT_ADMIN sends `POST /api/dealers` without `verification_app_id`
- **THEN** the system SHALL reject with HTTP 422
- **AND** return `{ error: "verification_app_id is required" }`

#### Scenario: Create dealer with app ID from different tenant
- **WHEN** a TENANT_ADMIN sends `POST /api/dealers` with a `verification_app_id` belonging to a different tenant
- **THEN** the system SHALL reject with HTTP 422
- **AND** return `{ error: "Verification app not found or does not belong to this tenant" }`

---

### Requirement: Same Dealer User Can Have Multiple App Profiles
The system SHALL allow the same person (identified by phone number / user record) to hold separate dealer profiles for different verification apps within the same tenant. Each profile is an independent `dealers` row with its own address, shop name, dealer code, and active status. The uniqueness anchor is `(user_id, verification_app_id)` — one profile per person per app.

#### Scenario: Register same person as dealer in two different apps
- **WHEN** a TENANT_ADMIN creates a dealer for user with phone "9999999999" in App A with `{ shop_name: "Mumbai Shop", address: "Mumbai" }`
- **AND** then creates another dealer for the same phone in App B with `{ shop_name: "Pune Warehouse", address: "Pune" }`
- **THEN** both creations SHALL succeed
- **AND** each SHALL produce a distinct dealer record with its own `id`, `verification_app_id`, `shop_name`, and `address`
- **AND** both records SHALL reference the same `user_id`

#### Scenario: Prevent duplicate profile for same person in same app
- **WHEN** a TENANT_ADMIN attempts to create a second dealer record for a user who already has a dealer profile in the same verification app
- **THEN** the system SHALL reject with HTTP 409
- **AND** return `{ error: "This user already has a dealer profile for this verification app" }`

#### Scenario: Profile details are independent per app
- **WHEN** a TENANT_ADMIN updates the address on a dealer's App A profile
- **THEN** only the App A dealer record SHALL be updated
- **AND** the same user's App B dealer profile SHALL remain unchanged

---

### Requirement: Dealer List Filterable by Verification App
The system SHALL allow listing dealers filtered by verification app.

#### Scenario: List dealers for a specific app
- **WHEN** a TENANT_ADMIN sends `GET /api/dealers?app_id=<verification_app_id>`
- **THEN** the system SHALL return only dealers whose `verification_app_id` matches the given app ID
- **AND** SHALL NOT return dealer profiles belonging to other apps of the same tenant

#### Scenario: List dealers without app filter
- **WHEN** a TENANT_ADMIN sends `GET /api/dealers` without `app_id`
- **THEN** the system SHALL return all dealer profiles across all apps for the tenant
- **AND** each row SHALL include its `verification_app_id` so the caller can distinguish profiles

---

### Requirement: Dealer Code Unique Per App
The system SHALL enforce dealer code uniqueness within the scope of a single verification app and tenant. The same dealer code MAY exist across different apps within the same tenant.

#### Scenario: Duplicate dealer code within same app
- **WHEN** a TENANT_ADMIN attempts to create a dealer with `dealer_code` "D001" in an app that already has a dealer with that code
- **THEN** the system SHALL reject with HTTP 409
- **AND** return `{ error: "Dealer code already exists for this verification app" }`

#### Scenario: Same dealer code allowed in different apps
- **WHEN** a TENANT_ADMIN creates a dealer with `dealer_code` "D001" in App A, then creates another dealer with `dealer_code` "D001" in App B
- **THEN** both SHALL succeed
- **AND** each dealer record SHALL have a distinct `id`

---

### Requirement: Scan Validation Resolves Dealer Profile by User and App
During coupon scanning, the system SHALL resolve the dealer profile using both the authenticated user's `user_id` and the scanning app's `id`. If no profile exists for that combination, the scan SHALL be rejected.

#### Scenario: Dealer scans via their assigned app
- **WHEN** a dealer (user_id = U1) authenticated via App A's API key scans a coupon
- **AND** a dealer profile exists with `(user_id = U1, verification_app_id = App A)`
- **THEN** the scan SHALL proceed using that dealer profile

#### Scenario: Dealer attempts scan via an app they have no profile in
- **WHEN** a dealer (user_id = U1) authenticated via App B's API key scans a coupon
- **AND** no dealer profile exists for `(user_id = U1, verification_app_id = App B)`
- **THEN** the system SHALL reject with HTTP 403
- **AND** return `{ error: "Dealer has no profile for this verification app" }`

#### Scenario: Dealer with profiles in multiple apps scans via correct app
- **WHEN** dealer U1 has profiles in both App A and App B
- **AND** they scan via App A's API key
- **THEN** the system SHALL use the App A dealer profile (dealer code, points balance, etc.)
- **AND** NOT mix in data from the App B profile

---

### Requirement: Dealer JWT Carries User ID Only
The system SHALL NOT include `dealer_id` in the dealer JWT. Because the same dealer user may have profiles across multiple apps, `dealer_id` is ambiguous at login time. The JWT SHALL carry `user_id` and `role: DEALER` only. The correct dealer profile SHALL be resolved at scan time using the authenticated user's `user_id` and the scanning app's ID derived from the API key.

#### Scenario: Dealer JWT payload does not contain dealer_id
- **WHEN** a dealer successfully completes OTP verification
- **THEN** the system SHALL issue a JWT containing `user_id` and `role: DEALER`
- **AND** the JWT SHALL NOT contain `dealer_id`

#### Scenario: Dealer profile resolved from JWT user_id at scan time
- **WHEN** a dealer presents their JWT to scan a coupon via App A's API key
- **THEN** the system SHALL resolve the dealer profile via `WHERE user_id = jwt.user_id AND verification_app_id = App A`
- **AND** use that profile's `dealer_id`, `dealer_code`, and points balance for the scan

---

### Requirement: Dealer Registration Rejects Phone Registered Under a Non-Dealer Role
The system SHALL check the existing user role before creating a dealer profile. If the provided phone number is already registered in the tenant under a role other than `DEALER` (e.g. `TENANT_ADMIN`, `TENANT_USER`), the registration SHALL be rejected.

#### Scenario: Register phone that belongs to a TENANT_USER
- **WHEN** a TENANT_ADMIN attempts to register phone "9999999999" as a dealer
- **AND** that phone already exists in the tenant with role `TENANT_USER`
- **THEN** the system SHALL reject with HTTP 422
- **AND** return `{ error: "This phone number is already registered as a TENANT_USER and cannot be used for a dealer profile" }`

#### Scenario: Register phone that belongs to an existing DEALER user
- **WHEN** a TENANT_ADMIN attempts to register phone "9999999999" as a dealer
- **AND** that phone already exists in the tenant with role `DEALER`
- **THEN** the system SHALL reuse the existing `users` row
- **AND** proceed to create the new dealer profile for the specified app

#### Scenario: Register phone that does not yet exist in the tenant
- **WHEN** a TENANT_ADMIN registers a phone number that has no existing user record in the tenant
- **THEN** the system SHALL create a new `users` row with `role: DEALER`
- **AND** then create the dealer profile linked to that user and the specified app

---

### Requirement: Dealer Points Balance Is Isolated Per App Profile
Each dealer app profile SHALL have its own independent points balance. Points earned by scanning in App A are credited only to the App A dealer profile and do not affect the same dealer's balance in App B. This allows different apps to run independent reward programs.

#### Scenario: Points earned in App A do not appear in App B
- **WHEN** a dealer with profiles in both App A and App B scans a coupon via App A and earns 50 points
- **THEN** the App A dealer profile's points balance SHALL increase by 50
- **AND** the App B dealer profile's points balance SHALL remain unchanged

#### Scenario: View points balance is scoped to the scanning app
- **WHEN** a dealer sends `GET /api/mobile/v1/dealer/points` authenticated via App A's API key
- **THEN** the system SHALL return the points balance for the App A dealer profile only
- **AND** NOT aggregate balances across other app profiles

#### Scenario: Same dealer registered across two tenants has separate points per tenant
- **WHEN** a person with phone "9999999999" is registered as a dealer in Tenant A and also in Tenant B
- **THEN** the system SHALL create a separate `users` row per tenant (enforced by `UNIQUE (tenant_id, phone_e164)`)
- **AND** each tenant SHALL have its own `dealer_id` for that person
- **AND** each `dealer_id` SHALL have its own independent `dealer_points` balance
- **AND** points earned by scanning in Tenant A SHALL NOT affect the points balance in Tenant B and vice versa

---

### Requirement: Dealer Activation and Deactivation Is Per App Profile
A TENANT_ADMIN SHALL be able to activate or deactivate a specific dealer app profile without affecting the same dealer's profiles in other apps. An inactive profile MUST NOT allow scanning in that app.

#### Scenario: Deactivate dealer in one app
- **WHEN** a TENANT_ADMIN sends `PATCH /api/dealers/:id` with `{ "is_active": false }` for a dealer's App A profile
- **THEN** the system SHALL set `is_active = false` on that specific dealer row
- **AND** the same user's profile in App B SHALL remain active and unaffected

#### Scenario: Inactive dealer profile attempts to scan
- **WHEN** a dealer whose profile for the scanning app has `is_active = false` attempts to scan a coupon
- **THEN** the system SHALL reject with HTTP 403
- **AND** return `{ error: "Dealer account is deactivated for this app" }`

#### Scenario: Reactivate dealer profile
- **WHEN** a TENANT_ADMIN sends `PATCH /api/dealers/:id` with `{ "is_active": true }`
- **THEN** the system SHALL set `is_active = true` on that profile
- **AND** the dealer SHALL be able to scan coupons via that app again
