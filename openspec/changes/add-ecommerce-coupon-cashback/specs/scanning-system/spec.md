## ADDED Requirements

### Requirement: Dealer-Based Coupon Scanning
The system SHALL provide a scanning flow where only authorized DEALER users can scan QR codes and earn credit points. Dealers do NOT receive money.

#### Scenario: Dealer scans coupon QR code
- **WHEN** a DEALER user scans a coupon QR code via POST `/api/mobile/v1/dealer/scan`
- **THEN** the system SHALL:
  - Authenticate via JWT and verify role=DEALER
  - Validate feature flag `coupon_cashback.dealer_scanning` is enabled for the tenant
  - Validate the coupon exists, is ACTIVE, and belongs to the tenant
  - Validate the coupon has not been already scanned/used
  - Resolve dealer profile from `(user_id, scanning_app_id)`
  - Award credit points to the dealer's `dealer_points` balance
  - Create a `dealer_point_transactions` record (type=CREDIT, reason=scan)
  - Update coupon status to USED
  - Record scan event in `scan_sessions`
  - Return `{ success: true, points_awarded, dealer_balance }`

#### Scenario: Non-dealer attempts dealer scan
- **WHEN** a user with role != DEALER attempts to access `/api/mobile/v1/dealer/scan`
- **THEN** the system SHALL reject with 403 Forbidden
- **AND** return `{ error: "Only dealers can perform this action" }`

#### Scenario: Dealer scanning disabled
- **WHEN** a DEALER attempts to scan and `coupon_cashback.dealer_scanning` feature flag is disabled
- **THEN** the system SHALL reject with 403 Forbidden
- **AND** return `{ error: "Dealer scanning is not enabled for this tenant" }`

---

### Requirement: Open Customer Cashback Scanning (App-Based)
The system SHALL provide a scanning flow where any CUSTOMER user can scan a coupon QR code and receive an instant UPI payout. The payout is triggered at scan time — there is no separate claim step. The customer MUST have a primary UPI ID registered before scanning.

#### Scenario: Customer scans coupon with UPI ID on file
- **WHEN** a CUSTOMER user scans a coupon QR code via POST `/api/mobile/v1/cashback/scan`
- **THEN** the system SHALL, in a single atomic operation:
  - Authenticate via JWT and verify role=CUSTOMER
  - Validate feature flag `coupon_cashback.open_scanning` is enabled
  - Validate the coupon exists, is ACTIVE, and belongs to the tenant
  - Validate the coupon has not already been used
  - Fetch the customer's primary UPI ID from `customer_upi_details`
  - Calculate cashback amount from coupon configuration
  - Mark coupon status as USED
  - Create a `cashback_transactions` record with status=PROCESSING, upi_id=primary UPI
  - Immediately call the payment gateway UPI payout API
- **AND** on gateway success:
  - Update `cashback_transactions` status to COMPLETED
  - Store `gateway_transaction_id` and `payout_reference`
  - Return `{ success: true, cashback_amount, upi_id, status: "COMPLETED", transaction_id }`
- **AND** on gateway failure:
  - Update `cashback_transactions` status to FAILED, store `failure_reason`
  - Coupon remains USED (not rolled back)
  - Return `{ success: false, cashback_amount, upi_id, status: "FAILED", transaction_id, error: "Payout failed. You can retry using your transaction ID." }`

#### Scenario: Customer scans without a registered UPI ID
- **WHEN** a CUSTOMER attempts to scan a coupon and has no primary UPI ID in `customer_upi_details`
- **THEN** the system SHALL reject with HTTP 422 before processing the coupon
- **AND** return `{ error: "No UPI ID registered. Please add a UPI ID before scanning.", action: "ADD_UPI" }`
- **AND** the coupon status SHALL remain unchanged (NOT marked as USED)

#### Scenario: Customer scanning disabled
- **WHEN** a CUSTOMER attempts to scan and `coupon_cashback.open_scanning` feature flag is disabled
- **THEN** the system SHALL reject with 403 Forbidden
- **AND** return `{ error: "Open scanning is not enabled for this tenant" }`

---

### Requirement: Open Customer Cashback Scanning (Public - No App)
The system SHALL provide a public web-based cashback flow for users without the mobile app, using a multi-step session. The UPI payout is triggered instantly at the confirm step.

#### Scenario: Step 1 — Start public cashback session
- **WHEN** a user scans a QR code and lands on the public page
- **THEN** POST `/api/public/cashback/start` with coupon_code
- **THEN** the system SHALL:
  - Validate the coupon exists, is ACTIVE, belongs to the tenant
  - Validate feature flag `coupon_cashback.open_scanning` is enabled
  - Create a scan session with status=pending-verification
  - Return `{ session_id, coupon_code, cashback_amount, status }`

#### Scenario: Step 2 — Submit mobile and receive OTP
- **WHEN** the user submits their mobile number
- **THEN** POST `/api/public/cashback/:sessionId/mobile` with mobile_e164
- **THEN** the system SHALL:
  - Validate session exists and is in pending-verification state
  - Generate 6-digit OTP
  - Store OTP in the session
  - Return `{ challenge_id, mobile_masked }`

#### Scenario: Step 3 — Verify OTP and auto-register
- **WHEN** the user submits the OTP
- **THEN** POST `/api/public/cashback/:sessionId/verify-otp` with otp_code
- **THEN** the system SHALL:
  - Validate the OTP matches
  - Auto-create CUSTOMER user if mobile number is new (phone_e164 only)
  - Create or update `customers` record
  - Update session status to verified
  - Return `{ verified: true, is_new_user }`

#### Scenario: Step 4 — Submit UPI ID
- **WHEN** the user submits their UPI ID
- **THEN** POST `/api/public/cashback/:sessionId/upi` with upi_id
- **THEN** the system SHALL:
  - Validate UPI ID format
  - Save UPI ID to `customer_upi_details`
  - Update session with the provided UPI ID
  - Return `{ upi_id, session_status: "ready-to-confirm" }`

#### Scenario: Step 5 — Confirm and instant payout
- **WHEN** the user confirms the cashback
- **THEN** POST `/api/public/cashback/:sessionId/confirm`
- **THEN** the system SHALL, in a single atomic operation:
  - Mark coupon status as USED
  - Create `cashback_transactions` record with status=PROCESSING
  - Immediately call the payment gateway UPI payout API
- **AND** on gateway success:
  - Update status to COMPLETED, store `gateway_transaction_id`
  - Complete the session
  - Return `{ success: true, cashback_amount, upi_id, status: "COMPLETED", transaction_id }`
- **AND** on gateway failure:
  - Update status to FAILED, store `failure_reason`
  - Coupon remains USED
  - Return `{ success: false, cashback_amount, upi_id, status: "FAILED", transaction_id, error: "Payout failed. Use your transaction ID to retry." }`

#### Scenario: Public cashback session timeout
- **WHEN** a public cashback session is inactive for 10 minutes
- **THEN** the system SHALL expire the session
- **AND** reject further submissions with error "Session expired"

---

### Requirement: Scan Mode Configuration via Feature Flags
The system SHALL use feature flags to configure which scanning modes are available per tenant. Only 2 scanning-related flags exist: `coupon_cashback.dealer_scanning` and `coupon_cashback.open_scanning`.

#### Scenario: Dealer-only scanning mode
- **WHEN** tenant has `coupon_cashback.dealer_scanning` enabled and `coupon_cashback.open_scanning` disabled
- **THEN** only DEALER users SHALL be able to scan coupons
- **AND** public and customer scan endpoints SHALL reject with 403

#### Scenario: Open scanning mode
- **WHEN** tenant has `coupon_cashback.open_scanning` enabled
- **THEN** both CUSTOMER users and public (anonymous) users SHALL be able to scan coupons
- **AND** instant UPI payout is triggered at scan time

#### Scenario: Both modes enabled
- **WHEN** tenant has both `coupon_cashback.dealer_scanning` and `coupon_cashback.open_scanning` enabled
- **THEN** dealers SHALL scan and earn credit points
- **AND** customers SHALL scan and receive instant UPI payout
- **AND** both flows SHALL operate independently
