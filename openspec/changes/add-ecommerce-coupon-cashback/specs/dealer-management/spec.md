# Dealer Management

## Purpose
Dealer management allows TENANT_ADMIN users to onboard, manage, and monitor dealers within their tenant. Dealers are special users who can scan QR codes and earn credit points through the mobile app.

---

## ADDED Requirements

### Requirement: Dealer Onboarding by Tenant Admin
The system SHALL allow TENANT_ADMIN users to create and manage dealers within their tenant. Dealer onboarding requires: full_name, email, shop_name, address, pincode, city, state, and phone_e164.

#### Scenario: Create a new dealer
- **WHEN** a TENANT_ADMIN sends POST `/api/v1/tenants/:tenantId/dealers` with dealer details
- **THEN** the system SHALL:
  - Validate required fields: full_name, email, phone_e164, shop_name, address, pincode, city, state
  - Create a `users` record with role=DEALER, full_name, email, phone_e164, and tenant_id
  - Create a `dealers` record with shop_name, address, pincode, city, state
  - Auto-generate dealer_code if not provided
  - Initialize `dealer_points` record with balance=0
  - Return the created dealer profile

#### Scenario: Duplicate dealer code rejection
- **WHEN** creating a dealer with a dealer_code that already exists in the tenant
- **THEN** the system SHALL reject with 409 Conflict
- **AND** return `{ error: "Dealer code already exists in this tenant" }`

#### Scenario: Duplicate phone number rejection
- **WHEN** creating a dealer with a phone_e164 already registered in the tenant
- **THEN** the system SHALL reject with 409 Conflict
- **AND** return `{ error: "Phone number already registered" }`

### Requirement: Dealer Listing and Search
The system SHALL allow TENANT_ADMIN users to list and search dealers.

#### Scenario: List all dealers
- **WHEN** a TENANT_ADMIN sends GET `/api/v1/tenants/:tenantId/dealers`
- **THEN** the system SHALL return paginated list of dealers with:
  - id, dealer_code, full_name, email, phone_e164, shop_name, city, state, is_active, points_balance
  - Pagination metadata (page, limit, total)

#### Scenario: Search dealers by name or code
- **WHEN** a TENANT_ADMIN sends GET `/api/v1/tenants/:tenantId/dealers?search=acme`
- **THEN** the system SHALL return dealers matching the search term in full_name, shop_name, or dealer_code

### Requirement: Dealer Status Management
The system SHALL allow TENANT_ADMIN users to activate and deactivate dealers.

#### Scenario: Deactivate a dealer
- **WHEN** a TENANT_ADMIN sends PATCH `/api/v1/tenants/:tenantId/dealers/:id/status` with `{ is_active: false }`
- **THEN** the system SHALL set the dealer's is_active to false
- **AND** the associated user account SHALL be deactivated
- **AND** the dealer SHALL NOT be able to login or scan

#### Scenario: Reactivate a dealer
- **WHEN** a TENANT_ADMIN sends PATCH `/api/v1/tenants/:tenantId/dealers/:id/status` with `{ is_active: true }`
- **THEN** the system SHALL reactivate the dealer
- **AND** the dealer SHALL be able to login and scan again
- **AND** previous point balance SHALL be preserved

### Requirement: Dealer Points Tracking
The system SHALL track dealer credit points earned through QR code scanning.

#### Scenario: View dealer points balance
- **WHEN** a TENANT_ADMIN sends GET `/api/v1/tenants/:tenantId/dealers/:id/points`
- **THEN** the system SHALL return the dealer's current points balance

#### Scenario: View dealer point transaction history
- **WHEN** a TENANT_ADMIN sends GET `/api/v1/tenants/:tenantId/dealers/:id/transactions`
- **THEN** the system SHALL return paginated transaction history with:
  - id, amount, type (CREDIT/DEBIT), reason, reference_id, created_at
  - Support for date range filtering

### Requirement: Dealer Profile Update
The system SHALL allow TENANT_ADMIN users to update dealer information.

#### Scenario: Update dealer details
- **WHEN** a TENANT_ADMIN sends PUT `/api/v1/tenants/:tenantId/dealers/:id` with updated fields
- **THEN** the system SHALL update the dealer's full_name, email, shop_name, address, pincode, city, state, or metadata
- **AND** dealer_code SHALL NOT be modifiable after creation
- **AND** return the updated dealer profile

---

## Database Schema

**Tables:**
- `dealers` — Dealer metadata linked to users table
  - `id`, `user_id`, `tenant_id`, `dealer_code`, `shop_name`, `address`, `pincode`, `city`, `state`, `is_active`, `metadata` (JSONB)
  - UNIQUE(tenant_id, dealer_code)
- `dealer_points` — Dealer credit points balance
  - `id`, `dealer_id`, `tenant_id`, `balance`
  - UNIQUE(dealer_id, tenant_id)
- `dealer_point_transactions` — Point transaction history
  - `id`, `dealer_id`, `tenant_id`, `amount`, `type` (CREDIT/DEBIT), `reason`, `reference_id`, `reference_type`, `metadata` (JSONB)

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/dealers` | JWT (TENANT_ADMIN) | Create dealer |
| GET | `/api/v1/tenants/:tenantId/dealers` | JWT (TENANT_ADMIN) | List dealers |
| GET | `/api/v1/tenants/:tenantId/dealers/:id` | JWT (TENANT_ADMIN) | Get dealer |
| PUT | `/api/v1/tenants/:tenantId/dealers/:id` | JWT (TENANT_ADMIN) | Update dealer |
| PATCH | `/api/v1/tenants/:tenantId/dealers/:id/status` | JWT (TENANT_ADMIN) | Toggle status |
| GET | `/api/v1/tenants/:tenantId/dealers/:id/points` | JWT (TENANT_ADMIN) | View points |
| GET | `/api/v1/tenants/:tenantId/dealers/:id/transactions` | JWT (TENANT_ADMIN) | Point history |
