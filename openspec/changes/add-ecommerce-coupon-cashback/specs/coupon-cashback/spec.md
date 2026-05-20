# Coupon Cashback System

## Purpose
The coupon cashback system enables two reward models for coupon scanning: dealer credit points (in-app currency) and customer direct cashback (instant UPI payout). Payout happens at the moment of scan — there is no separate claim step. The mode is configurable per tenant via feature flags.

---

## ADDED Requirements

### Requirement: Cashback Transaction Lifecycle
The system SHALL track cashback transactions through a defined status lifecycle. Because payout is instant, transactions begin at PROCESSING and resolve to COMPLETED or FAILED within the same scan request. There is no PENDING state in the primary flow.

#### Scenario: Successful cashback status transitions
- **WHEN** a coupon is scanned and the payment gateway call succeeds
- **THEN** the transaction lifecycle SHALL be: PROCESSING → COMPLETED
- **AND** COMPLETED transactions MAY be REVERSED by TENANT_ADMIN
- **AND** each transition SHALL be recorded with a timestamp

#### Scenario: Failed cashback status transitions
- **WHEN** a coupon is scanned and the payment gateway call fails or times out
- **THEN** the transaction lifecycle SHALL be: PROCESSING → FAILED
- **AND** the `failure_reason` and gateway error code SHALL be stored
- **AND** the transaction SHALL be available for retry (FAILED → PROCESSING → COMPLETED | FAILED)

#### Scenario: Atomicity of scan and payout initiation
- **WHEN** a cashback scan is processed
- **THEN** the system SHALL mark the coupon as USED and create the PROCESSING transaction record in a single DB transaction BEFORE calling the gateway
- **AND** if the system crashes after the DB commit but before the gateway call, the transaction SHALL remain in PROCESSING state and be detectable by a background reconciliation job

---

### Requirement: UPI ID Required Before Scanning
The system SHALL require customers to have at least one primary UPI ID registered before they can scan a coupon. Scanning SHALL be blocked — and the coupon SHALL NOT be marked USED — if no primary UPI ID is on file.

#### Scenario: Customer registers UPI before first scan
- **WHEN** a CUSTOMER saves a UPI ID via POST `/api/mobile/v1/cashback/upi`
- **THEN** the system SHALL store it as primary in `customer_upi_details`
- **AND** the customer SHALL now be eligible to scan coupons

#### Scenario: Scan blocked without UPI ID
- **WHEN** a CUSTOMER attempts to scan a coupon with no primary UPI ID registered
- **THEN** the system SHALL reject with HTTP 422
- **AND** return `{ error: "No UPI ID registered. Please add a UPI ID before scanning.", action: "ADD_UPI" }`
- **AND** the coupon status SHALL remain ACTIVE and unchanged

---

### Requirement: Instant Payout via Payment Gateway
The system SHALL call the payment gateway UPI payout API immediately at scan time. The gateway call is synchronous from the scan handler's perspective — the scan response reflects the final payout outcome (COMPLETED or FAILED).

#### Scenario: Payment gateway called at scan time
- **WHEN** a coupon scan is validated and the transaction is created
- **THEN** the system SHALL immediately call the configured payment gateway with:
  - `upi_id`: customer's primary UPI ID
  - `amount`: cashback amount from coupon configuration
  - `reference_id`: cashback transaction ID (for idempotency)
  - `remarks`: coupon code and tenant name
- **AND** SHALL NOT return a response to the customer until the gateway responds

#### Scenario: Gateway responds with success
- **WHEN** the payment gateway returns a success response
- **THEN** the system SHALL update the transaction status to COMPLETED
- **AND** store the `gateway_transaction_id` and `payout_reference` returned by the gateway
- **AND** return `{ success: true, cashback_amount, upi_id, status: "COMPLETED", transaction_id }` to the customer

#### Scenario: Gateway responds with failure
- **WHEN** the payment gateway returns an error or the call times out
- **THEN** the system SHALL update the transaction status to FAILED
- **AND** store the `failure_reason` and gateway error code
- **AND** return `{ success: false, cashback_amount, upi_id, status: "FAILED", transaction_id, error: "Payout failed. You can retry using your transaction ID." }`
- **AND** the coupon SHALL remain USED (payout failure does not undo the scan)

---

### Requirement: Failed Payout Retry
The system SHALL allow a customer to retry a FAILED cashback payout without re-scanning the coupon. The coupon is already USED; only the payout is retried.

#### Scenario: Customer retries a failed payout
- **WHEN** a CUSTOMER sends POST `/api/mobile/v1/cashback/retry/:transactionId`
- **AND** the transaction status is FAILED
- **THEN** the system SHALL:
  - Update the transaction status to PROCESSING
  - Re-call the payment gateway with the same amount and UPI ID
  - Return COMPLETED or FAILED based on the gateway response

#### Scenario: Retry on non-failed transaction rejected
- **WHEN** a CUSTOMER attempts to retry a transaction that is not in FAILED status
- **THEN** the system SHALL reject with HTTP 422
- **AND** return `{ error: "Only FAILED transactions can be retried" }`

#### Scenario: Retry with a different UPI ID
- **WHEN** a CUSTOMER sends POST `/api/mobile/v1/cashback/retry/:transactionId` with a new `upi_id` in the request body
- **THEN** the system SHALL use the new UPI ID for the retry payout
- **AND** update the `upi_id` on the transaction record

---

### Requirement: Customer UPI Management
The system SHALL allow customers to store and manage their UPI IDs for cashback payouts.

#### Scenario: Save UPI ID
- **WHEN** a CUSTOMER sends POST `/api/mobile/v1/cashback/upi` with `{ upi_id: "user@upi" }`
- **THEN** the system SHALL store the UPI ID in `customer_upi_details`
- **AND** set it as the primary UPI ID
- **AND** return `{ upi_id, is_primary: true }`

#### Scenario: Get saved UPI details
- **WHEN** a CUSTOMER sends GET `/api/mobile/v1/cashback/upi`
- **THEN** the system SHALL return all saved UPI IDs for the customer in the current tenant
- **AND** indicate which is primary

#### Scenario: UPI ID format validation
- **WHEN** a customer submits an invalid UPI ID format
- **THEN** the system SHALL reject with 400 Bad Request
- **AND** return `{ error: "Invalid UPI ID format. Expected format: username@bankname" }`

---

### Requirement: Cashback History and Balance
The system SHALL provide customers visibility into their cashback transactions.

#### Scenario: View cashback history
- **WHEN** a CUSTOMER sends GET `/api/mobile/v1/cashback/history`
- **THEN** the system SHALL return paginated cashback transactions with:
  - id, coupon_code, amount, upi_id, status, gateway_transaction_id, created_at
  - Support for status filtering and date range
  - Default sort: newest first

#### Scenario: View cashback balance
- **WHEN** a CUSTOMER sends GET `/api/mobile/v1/cashback/balance`
- **THEN** the system SHALL return:
  - `total_earned`: sum of all COMPLETED cashback amounts
  - `processing`: sum of all PROCESSING cashback amounts
  - `failed`: count of FAILED transactions eligible for retry

---

### Requirement: Dealer Points System
The system SHALL maintain a credit points system for dealers that is separate from real-money cashback.

#### Scenario: Dealer views own points via mobile
- **WHEN** a DEALER sends GET `/api/mobile/v1/dealer/points`
- **THEN** the system SHALL return `{ balance: 1500, currency: "points" }`

#### Scenario: Dealer views point history via mobile
- **WHEN** a DEALER sends GET `/api/mobile/v1/dealer/points/history`
- **THEN** the system SHALL return paginated transaction history with:
  - id, amount, type (CREDIT/DEBIT), reason, coupon_code, created_at
  - Default sort: newest first

---

### Requirement: Cashback Amount Configuration
The system SHALL determine cashback amounts from coupon configuration.

#### Scenario: Fixed cashback amount
- **WHEN** a coupon has `cashback_amount` field set to 50.00
- **THEN** the system SHALL award exactly 50.00 as cashback

#### Scenario: Coupon points used as cashback
- **WHEN** a coupon has `coupon_points` field set to 100 and no explicit `cashback_amount`
- **THEN** the system SHALL use `coupon_points` value as the cashback amount
- **AND** log a warning if the value seems unusually high (>1000)

---

## Database Schema

**Tables:**
- `cashback_transactions` — Tracks UPI cashback payouts
  - `id`, `customer_id`, `tenant_id`, `scan_session_id`, `coupon_code`, `amount`, `upi_id`, `status`, `gateway_transaction_id`, `payout_reference`, `failure_reason`, `metadata` (JSONB)
  - Status ENUM: PROCESSING, COMPLETED, FAILED, REVERSED
- `customer_upi_details` — Customer UPI IDs
  - `id`, `customer_id`, `tenant_id`, `upi_id`, `is_verified`, `is_primary`
  - UNIQUE(customer_id, tenant_id, upi_id)
- `dealer_points` — Dealer credit point balances
  - `id`, `dealer_id`, `tenant_id`, `balance`
  - UNIQUE(dealer_id, tenant_id)
- `dealer_point_transactions` — Dealer point transaction history
  - `id`, `dealer_id`, `tenant_id`, `amount`, `type`, `reason`, `reference_id`, `reference_type`, `metadata` (JSONB)

---

## API Endpoints

### Customer Cashback (Mobile App)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/cashback/scan` | JWT (CUSTOMER) | Scan coupon — instant payout triggered |
| POST | `/api/mobile/v1/cashback/retry/:transactionId` | JWT (CUSTOMER) | Retry a FAILED payout |
| POST | `/api/mobile/v1/cashback/upi` | JWT (CUSTOMER) | Save UPI ID |
| GET | `/api/mobile/v1/cashback/upi` | JWT (CUSTOMER) | Get UPI details |
| GET | `/api/mobile/v1/cashback/history` | JWT (CUSTOMER) | Cashback history |
| GET | `/api/mobile/v1/cashback/balance` | JWT (CUSTOMER) | Cashback balance |

### Customer Cashback (Public - No App)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/public/cashback/start` | None | Start session |
| POST | `/api/public/cashback/:sessionId/mobile` | None | Submit mobile + OTP |
| POST | `/api/public/cashback/:sessionId/verify-otp` | None | Verify OTP |
| POST | `/api/public/cashback/:sessionId/upi` | None | Submit UPI ID |
| POST | `/api/public/cashback/:sessionId/confirm` | None | Confirm — instant payout triggered |

### Dealer Points (Mobile App)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/dealer/scan` | JWT (DEALER) | Scan and earn points |
| GET | `/api/mobile/v1/dealer/points` | JWT (DEALER) | View balance |
| GET | `/api/mobile/v1/dealer/points/history` | JWT (DEALER) | Point history |
| GET | `/api/mobile/v1/dealer/profile` | JWT (DEALER) | View profile |

---

## Feature Flags

| Flag Code | Description | Default |
|-----------|-------------|---------|
| `coupon_cashback` | Parent flag for entire cashback module | disabled |
| `coupon_cashback.dealer_scanning` | Enable dealer-only QR scanning | disabled |
| `coupon_cashback.open_scanning` | Enable open scanning with instant UPI payout | disabled |

---

## External Dependencies

- **Payment Gateway** (e.g. Razorpay Payouts, Cashfree Payouts): Required for UPI transfers. Must support:
  - Synchronous payout API call with idempotency key
  - UPI ID as the transfer destination
  - Transaction reference for reconciliation
- **Background Reconciliation Job**: Required to detect transactions stuck in PROCESSING state (system crash after DB commit but before gateway call) and re-attempt or flag them.

---

## Security Considerations

1. **UPI ID Validation**: UPI IDs MUST be validated against format `username@bankhandle` before storing or using in payouts
2. **Idempotency**: Gateway calls MUST use the `cashback_transactions.id` as the idempotency key to prevent duplicate payouts on retry
3. **Cashback Limits**: Tenants SHOULD configure daily/monthly cashback limits per customer
4. **Duplicate Scan Prevention**: Each coupon MUST only be redeemable once; coupon is marked USED before the gateway call
5. **Rate Limiting**: Public cashback endpoints MUST have strict rate limits
6. **Session Expiry**: Public cashback sessions MUST expire after 10 minutes
7. **Dealer Verification**: Only pre-registered dealers MUST be able to access dealer scan endpoints
8. **Payout Audit Trail**: Every gateway call attempt, success, and failure MUST be logged with timestamp and gateway response
