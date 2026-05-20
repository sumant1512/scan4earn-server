# Change: Add Ecommerce & Coupon Cashback with Extended User Types

## Why
The platform currently supports three user types (SUPER_ADMIN, TENANT_ADMIN, TENANT_USER) and a basic public scan flow. To unlock two major revenue verticals — **Ecommerce** (self-service customer profiles with product browsing) and **Coupon Cashback** (dealer credit points & customer UPI payouts) — the system needs two additional user types (DEALER, CUSTOMER) with mobile-first OTP authentication, auto-registration, and configurable scanning modes controlled by feature flags.

## What Changes

### 1. Extended User Type System
- Add **DEALER** and **CUSTOMER** roles to the authentication and authorization system
- CUSTOMER auto-creation on first mobile OTP login (registered with mobile number only, no manual onboarding)
- DEALER onboarding managed by TENANT_ADMIN with required fields: full_name, email, shop_name, address, pincode, city, state

### 2. Ecommerce Flow
- Self-registration via mobile number + OTP (mobile number only)
- Auto-create CUSTOMER profile on first successful OTP verification
- Login → auto-registration → product browsing → profile management
- No order management in this phase — customer profile and catalog browsing only

### 3. Coupon Cashback System
- **Dealer-Based Scanning** (`coupon_cashback.dealer_scanning`): Only authorized dealers can scan QR codes via the mobile app (app is inherently required). Dealers earn credit points (no money).
- **Open Scanning** (`coupon_cashback.open_scanning`): Any user can scan coupon (with or without app). After scan: user enters mobile → OTP → provides UPI ID → cashback credited directly (UPI payout is inherent to this mode).
- Two feature flags only: `coupon_cashback.dealer_scanning` and `coupon_cashback.open_scanning`

### 4. New Database Entities (added directly to full_setup.sql)
- `dealers` table (tenant-scoped, linked to users, with shop_name, address, pincode, city, state)
- `dealer_points` / `dealer_point_transactions` tables
- `cashback_transactions` table (UPI payout tracking)
- `customer_upi_details` table

### 5. Feature Flags
- `ecommerce` — enable/disable ecommerce module per tenant
- `coupon_cashback` — enable/disable cashback module per tenant
- `coupon_cashback.dealer_scanning` — dealer-only scanning mode (app required is implicit)
- `coupon_cashback.open_scanning` — open scanning for all users (UPI payout is implicit)

### 6. Mobile API (all under v1)
- All new endpoints under `/api/mobile/v1/` — no v2 versioning (product not yet released)
- New mobile auth endpoints for CUSTOMER and DEALER roles
- Dealer scan endpoints (credit points flow)
- Customer cashback endpoints (UPI payout flow)
- Customer profile and catalog browsing endpoints

## Impact
- **Affected specs**: `authentication`, `user-management`, `scanning-system`
- **New specs**: `dealer-management`, `ecommerce`, `coupon-cashback`, `mobile-api`
- **Affected code**:
  - `mscan-server/database/full_setup.sql` — new tables, constraints, feature flags (no migration, part of initial setup)
  - `mscan-server/src/middleware/auth.middleware.js` — add DEALER, CUSTOMER role support
  - `mscan-server/src/controllers/auth.controller.js` — add permissions for new roles
  - `mscan-server/src/routes/` — new route files for dealer, ecommerce, cashback under v1
  - `mscan-server/src/controllers/` — new controllers
  - `mscan-server/src/services/` — new services
- **Breaking changes**: None — existing roles and flows remain unchanged; new roles and endpoints are additive
