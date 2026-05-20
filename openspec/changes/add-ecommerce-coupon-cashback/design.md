## Context

MScan currently supports 3 user roles (SUPER_ADMIN, TENANT_ADMIN, TENANT_USER) with email-based OTP login. The platform has an existing `customers` table for mobile-based users (used in mobile scan auth) and a public scan flow. This change extends the system to support two new verticals: **Ecommerce** (customer profile and product browsing) and **Coupon Cashback** (dealer points + customer UPI payouts), adding DEALER and CUSTOMER as first-class roles in the `users` table while preserving the existing `customers` table for backward compatibility.

Since this is pre-release, all new endpoints go under `/api/mobile/v1/` (no v2 versioning). Database changes go directly into `full_setup.sql` (no migration scripts).

**Stakeholders**: Tenant admins (manage dealers), end customers (scan & earn), dealers (scan & earn points), super admins (feature flag control).

## Goals / Non-Goals

### Goals
- Add DEALER and CUSTOMER as recognized roles in the auth system
- Enable mobile-first OTP authentication for DEALER and CUSTOMER users
- Auto-create CUSTOMER profile on first OTP verification with mobile number only (zero-friction)
- Support dealer onboarding with required fields: full_name, email, shop_name, address, pincode, city, state
- Support dealer-based scanning (credit points) and open scanning (UPI cashback)
- Make scanning mode configurable per tenant via 2 feature flags: `dealer_scanning` and `open_scanning`
- Expose mobile-friendly REST APIs under `/api/mobile/v1/`
- Support UPI payout tracking for customer cashback
- Provide customer profile management and product catalog browsing

### Non-Goals
- Payment gateway integration (UPI payout initiation is out of scope; only tracking)
- SMS delivery service integration (OTP delivery mechanism is pluggable)
- Mobile app UI implementation (only API contracts)
- Wallet-to-wallet transfers between dealers
- Order management / order placement (out of scope for this phase)
- Separate v2 API versioning (product not released yet)

## Decisions

### D1: User Type Storage Strategy
**Decision**: Add DEALER and CUSTOMER to the existing `users.role` CHECK constraint and create a separate `dealers` table for dealer-specific metadata (shop_name, address, pincode, city, state).

**Rationale**: The `users` table already handles JWT-based auth. Adding roles keeps auth unified. Dealer-specific fields belong in a dedicated table to avoid bloating `users`.

**Alternatives considered**:
- Separate `dealer_users` table: Rejected — fragments auth logic, requires dual token generation.
- Use existing `customers` table for CUSTOMER role: Rejected — `customers` is phone-keyed without full user lifecycle; we keep it for backward compatibility and create users with role=CUSTOMER alongside it.

### D2: Customer Auto-Registration
**Decision**: On first OTP verification for an unregistered mobile number, create both a `users` record (role=CUSTOMER, phone_e164 only) and a `customers` record (for backward compat with existing mobile/public scan flows).

**Rationale**: Preserves existing mobile scan flow while enabling full auth (JWT tokens, role checks) for new ecommerce/cashback features. Customer registers with mobile number only — no name, email, or other fields required at registration time.

### D3: Dealer Onboarding Fields
**Decision**: Dealer creation by TENANT_ADMIN requires: `full_name`, `email`, `shop_name`, `address`, `pincode`, `city`, `state`. These fields are stored in the `dealers` table (not in `users`), with `full_name` and `email` in the `users` table, and `phone_e164` in `users` for mobile OTP login.

**Rationale**: Dealers represent businesses, so shop details are mandatory for operational tracking. Customers are end-users who need frictionless registration, so only mobile number is required.

### D4: Feature Flag Simplification
**Decision**: Only 4 feature flags total (down from 6):
```
ecommerce                           (standalone)
coupon_cashback (parent)
├── coupon_cashback.dealer_scanning  (dealer-only mode, app is implicit)
└── coupon_cashback.open_scanning    (open mode, UPI payout is implicit)
```

**Rationale**:
- `app_required` flag removed: dealer scanning inherently requires the app (JWT auth via mobile app). If a tenant enables dealer scanning, app is required by definition.
- `upi_payout` flag removed: open scanning inherently means the customer gets UPI cashback. If open scanning is enabled, UPI payout is the mechanism by definition.

### D5: API Versioning — All Under v1
**Decision**: All new endpoints go under `/api/mobile/v1/` namespace. Remove v2 mobile API concept entirely.

**Rationale**: Product is not yet released. No backward compatibility concerns with external consumers. Consolidating under v1 avoids premature versioning complexity. The existing v2 routes (`mobileApiV2.routes.js`) are product catalog endpoints that should be moved to v1 or kept as-is under a different namespace.

### D6: Scanning Permission Model
**Decision**: Use feature flags to determine scanning mode:
- `coupon_cashback.dealer_scanning` enabled → only role=DEALER can scan (JWT required via app)
- `coupon_cashback.open_scanning` enabled → any user can scan (public flow with OTP + UPI, or app-based CUSTOMER flow)
- Both can be enabled simultaneously (dealers earn points, customers earn cashback)

### D7: No Order Management
**Decision**: Ecommerce module in this phase covers customer profile and product catalog browsing only. No order creation, cart, or checkout flow.

**Rationale**: Order management is a large scope item that should be a separate change proposal. This phase establishes the customer registration and product browsing foundation.

## Database Schema Changes (in full_setup.sql)

### New Tables

```sql
-- Dealer metadata (extends users with role=DEALER)
CREATE TABLE dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dealer_code VARCHAR(50),
  shop_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, dealer_code)
);

-- Dealer credit points balance
CREATE TABLE dealer_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  balance INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dealer_id, tenant_id)
);

-- Dealer point transaction history
CREATE TABLE dealer_point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  reason VARCHAR(100) NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer UPI details for cashback
CREATE TABLE customer_upi_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  upi_id VARCHAR(255) NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, tenant_id, upi_id)
);

-- Cashback transaction tracking
CREATE TABLE cashback_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scan_session_id UUID REFERENCES scan_sessions(id),
  coupon_code VARCHAR(100),
  amount DECIMAL(10, 2) NOT NULL,
  upi_id VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED')),
  payout_reference VARCHAR(255),
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Modified Constraints (in full_setup.sql)

```sql
-- Extend users role constraint to include DEALER and CUSTOMER
role VARCHAR(50) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_USER', 'DEALER', 'CUSTOMER'))

-- Keep existing tenant-null constraint (works for new roles too)
CHECK (
  (role = 'SUPER_ADMIN' AND tenant_id IS NULL) OR
  (role != 'SUPER_ADMIN' AND tenant_id IS NOT NULL)
)

-- Add phone_e164 column to users table
phone_e164 VARCHAR(20),
UNIQUE(phone_e164, tenant_id)
```

### New Feature Flag Entries (in full_setup.sql)

```sql
INSERT INTO features (code, name, description, is_default_enabled, parent_id) VALUES
('ecommerce', 'Ecommerce', 'Enable ecommerce module for tenant', false, NULL),
('coupon_cashback', 'Coupon Cashback', 'Enable coupon cashback module', false, NULL),
('coupon_cashback.dealer_scanning', 'Dealer Scanning', 'Dealer-only QR scanning (app required)', false, (SELECT id FROM features WHERE code = 'coupon_cashback')),
('coupon_cashback.open_scanning', 'Open Scanning', 'Open QR scanning for all users (UPI cashback)', false, (SELECT id FROM features WHERE code = 'coupon_cashback'));
```

## API Design (all under /api/mobile/v1/)

### Mobile Auth API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/auth/request-otp` | None | Request OTP via mobile number (customer) |
| POST | `/api/mobile/v1/auth/verify-otp` | None | Verify OTP, auto-register CUSTOMER, return JWT |
| POST | `/api/mobile/v1/auth/dealer/request-otp` | None | Request OTP for dealer login |
| POST | `/api/mobile/v1/auth/dealer/verify-otp` | None | Verify OTP for dealer, return JWT |
| GET | `/api/mobile/v1/auth/me` | JWT | Get current user profile (CUSTOMER or DEALER) |
| POST | `/api/mobile/v1/auth/refresh` | None | Refresh JWT token |
| POST | `/api/mobile/v1/auth/logout` | JWT | Logout |

### Dealer Management API (Tenant Admin)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/tenants/:tenantId/dealers` | JWT (TENANT_ADMIN) | Onboard dealer (full_name, email, shop_name, address, pincode, city, state, phone_e164) |
| GET | `/api/v1/tenants/:tenantId/dealers` | JWT (TENANT_ADMIN) | List dealers |
| GET | `/api/v1/tenants/:tenantId/dealers/:id` | JWT (TENANT_ADMIN) | Get dealer details |
| PUT | `/api/v1/tenants/:tenantId/dealers/:id` | JWT (TENANT_ADMIN) | Update dealer |
| PATCH | `/api/v1/tenants/:tenantId/dealers/:id/status` | JWT (TENANT_ADMIN) | Activate/deactivate |
| GET | `/api/v1/tenants/:tenantId/dealers/:id/points` | JWT (TENANT_ADMIN) | View dealer points |
| GET | `/api/v1/tenants/:tenantId/dealers/:id/transactions` | JWT (TENANT_ADMIN) | Point history |

### Dealer Mobile API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/dealer/scan` | JWT (DEALER) | Scan QR code (earn points) |
| GET | `/api/mobile/v1/dealer/points` | JWT (DEALER) | View own points balance |
| GET | `/api/mobile/v1/dealer/points/history` | JWT (DEALER) | View point history |
| GET | `/api/mobile/v1/dealer/profile` | JWT (DEALER) | View own dealer profile |

### Customer Cashback API (Mobile)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/cashback/scan` | JWT (CUSTOMER) | Scan coupon, initiate cashback |
| POST | `/api/mobile/v1/cashback/upi` | JWT (CUSTOMER) | Save/update UPI ID |
| GET | `/api/mobile/v1/cashback/upi` | JWT (CUSTOMER) | Get saved UPI details |
| POST | `/api/mobile/v1/cashback/claim` | JWT (CUSTOMER) | Claim cashback to UPI |
| GET | `/api/mobile/v1/cashback/history` | JWT (CUSTOMER) | View cashback history |
| GET | `/api/mobile/v1/cashback/balance` | JWT (CUSTOMER) | View cashback balance |

### Customer Cashback API (Public - no app required)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/public/cashback/start` | None | Start cashback scan session |
| POST | `/api/public/cashback/:sessionId/mobile` | None | Submit mobile + consent |
| POST | `/api/public/cashback/:sessionId/verify-otp` | None | Verify OTP, auto-register |
| POST | `/api/public/cashback/:sessionId/upi` | None | Submit UPI ID |
| POST | `/api/public/cashback/:sessionId/confirm` | None | Confirm cashback |

### Ecommerce API (Mobile - Customer profile + catalog only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/mobile/v1/ecommerce/products` | JWT (CUSTOMER) | Browse product catalog |
| GET | `/api/mobile/v1/ecommerce/products/:id` | JWT (CUSTOMER) | Get product details |
| GET | `/api/mobile/v1/ecommerce/profile` | JWT (CUSTOMER) | Get customer profile |
| PUT | `/api/mobile/v1/ecommerce/profile` | JWT (CUSTOMER) | Update customer profile |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Dual user records (users + customers tables) | Bridge via customer_id FK; document clearly; plan future consolidation |
| UPI payout failures | Status tracking with retry; manual reconciliation dashboard |
| Feature flag simplification (no separate app_required/upi flags) | Clear documentation that dealer_scanning implies app, open_scanning implies UPI |
| Dealer impersonation | Dealer-only scanning enforced via JWT role check + feature flag |
| Customer auto-registration spam | Rate limiting on OTP requests; existing mobile OTP rate limits apply |

## Migration Plan

1. Update `full_setup.sql` directly with new tables, modified constraints, feature flag inserts
2. Run `npm run db:reset` to apply (pre-release, no migration needed)
3. Deploy updated auth middleware (recognizes new roles)
4. Deploy new API routes under `/api/mobile/v1/`
5. Tenant admins enable features per tenant via feature flags
6. Rollback: disable feature flags; new tables are inert if unused

## Open Questions

1. Should DEALER users be able to browse the product catalog (ecommerce features)?
2. What is the exact cashback amount calculation formula (fixed per coupon, percentage, or configurable)?
3. Should there be a minimum cashback threshold before UPI payout is allowed?
4. Should dealers have a points redemption mechanism, or are points purely for tracking/gamification?
5. Should the public cashback flow (no-app) have a daily limit per mobile number?
