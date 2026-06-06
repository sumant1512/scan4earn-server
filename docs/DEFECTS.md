# Defect Report — Ecommerce + Coupon Cashback Feature Audit

**Date:** 2026-03-22
**Scope:** Dealer Management (backend + frontend), Dealer Mobile API, Customer Cashback API, Permission Guard
**Status:** Under Review — No fixes applied yet

---

## Summary Table

| ID | Severity | Component | Title |
|----|----------|-----------|-------|
| DEF-001 | CRITICAL | Backend / Auth | `dealer_id` absent from JWT token payload |
| DEF-002 | CRITICAL | Backend / Dealer Mobile | Silent failure when middleware `dealerId` lookup fails |
| DEF-003 | HIGH | Frontend / Guards | `PermissionGuard` redirects to non-existent route |
| DEF-004 | HIGH | Database | `scan_sessions` has no `dealer_id` column |
| DEF-005 | MEDIUM | Backend / Routes | Dealer creation not gated by feature flag |
| DEF-006 | MEDIUM | Database | `cashback_transactions` has no `dealer_id` reference |
| DEF-007 | MEDIUM | Backend / Service | No audit log for dealer activation/deactivation |
| DEF-008 | LOW | Backend / Validation | User-provided `dealer_code` has no format validation |
| DEF-009 | LOW | Backend / Validation | `metadata` JSONB field not validated before insert |
| DEF-010 | LOW | Frontend / Types | `CreateDealerRequest.email` typed as required but backend accepts null |

---

## DEF-001 — `dealer_id` absent from JWT token payload

**Severity:** CRITICAL
**Component:** Backend / Auth
**Files Affected:**
- `mscan-server/src/services/token.service.js`
- `mscan-server/src/middleware/auth.middleware.js`
- `mscan-server/src/controllers/mobileAuth.controller.js`

### Description
The `generateTokens()` function in `token.service.js` accepts `(userId, role, tenantId, subdomainSlug, permissions)` as parameters. There is no `dealerId` parameter, so the JWT access token never contains the dealer's record ID.

To compensate, `auth.middleware.js` performs an additional database query after token verification to look up the dealer record and attach `dealerId` to `req.user`. This approach works under normal conditions but introduces a single point of failure and adds latency to every dealer mobile API request.

### Root Cause
The token generation function was designed before the DEALER role existed and was not updated to include the dealer record identifier.

### Impact
- Every dealer mobile API request performs an extra DB query that could be avoided
- If the dealer record is soft-deleted, renamed, or the query fails (DB timeout), `req.user.dealerId` is `undefined` with no error thrown — the request continues and all downstream handlers receive a broken context
- Dealer-specific JWT claims (e.g., `shop_name`) cannot be included for stateless use in future microservices or audit logging

### Proposed Fix
1. Add an optional `dealerId` parameter to `token.service.js` → `generateTokens(userId, role, tenantId, subdomainSlug, permissions, dealerId = null)`
2. Include `dealer_id: dealerId` in the JWT payload when non-null
3. In `mobileAuth.controller.js` → `verifyDealerOtp()`, query the dealer record before calling `generateTokens()` and pass the `dealer.id`
4. In `auth.middleware.js`, read `decoded.dealer_id` from the token and set `req.user.dealerId = decoded.dealer_id` — remove the DB lookup that currently compensates for the missing claim
5. Keep the DB lookup as a fallback only if `decoded.dealer_id` is absent (for backward compatibility during rolling deployment)

---

## DEF-002 — Silent failure when middleware `dealerId` lookup fails

**Severity:** CRITICAL
**Component:** Backend / Dealer Mobile
**Files Affected:**
- `mscan-server/src/controllers/dealerMobile.controller.js`
- `mscan-server/src/middleware/auth.middleware.js`

### Description
All endpoints in `dealerMobile.controller.js` destructure `dealerId` from `req.user`:

```js
const { id: userId, dealerId } = req.user;
```

If `auth.middleware.js` fails to populate `req.user.dealerId` (because the dealer record does not exist, is deleted, or the DB query throws), `dealerId` is `undefined`. The handlers do not validate this before using it in queries, so the subsequent `WHERE dealer_id = $1` clauses silently return zero rows rather than throwing an authentication error.

### Root Cause
No guard clause checks that `dealerId` is truthy before executing business logic in any of the four dealer mobile endpoints (`scan`, `getPoints`, `getPointsHistory`, `getProfile`).

### Impact
- A dealer whose record is deleted retains a valid JWT and can call mobile endpoints without error
- All API responses return empty data (0 points, empty history) instead of a `401 Unauthorized` or `404 Not Found`
- Debugging is extremely difficult because the HTTP response is 200 OK with empty data

### Proposed Fix
Add a guard at the top of each dealer mobile handler (or in a shared middleware specific to dealer routes):

```js
if (!req.user.dealerId) {
  throw new AuthenticationError('Dealer record not found. Please log in again.');
}
```

Alternatively, create a `requireDealer` middleware that enforces this check once and mounts it on all `/api/mobile/v1/dealer/*` routes in `dealerMobile.routes.js`.

---

## DEF-003 — `PermissionGuard` redirects to non-existent route

**Severity:** HIGH
**Component:** Frontend / Guards
**Files Affected:**
- `mscan-client/src/app/guards/permission.guard.ts`

### Description
When a user lacks the required permission for a route, `PermissionGuard` redirects them to `/admin/dashboard`. This path does not exist in `app.routes.ts`. The correct super-admin dashboard path is `/super-admin/dashboard` and the tenant dashboard path is `/tenant/dashboard`.

### Root Cause
Pre-existing bug in `permission.guard.ts` — the redirect path was hardcoded before the routing structure was finalised and never updated.

### Impact
- Any user (SUPER_ADMIN or TENANT_USER) navigating to a permission-guarded route they don't have access to receives a 404 page instead of being redirected to a valid dashboard
- This affects every permission-guarded route: dealer create/edit, coupon create, product create, template create, credit request, and all user management routes

### Proposed Fix
Update the redirect logic in `permission.guard.ts` to resolve the correct dashboard path based on the user's role:

```ts
// Instead of:
router.navigate(['/admin/dashboard']);

// Use:
const user = authService.getCurrentUserSync(); // or from token
const dashboardPath = user?.role === 'SUPER_ADMIN'
  ? '/super-admin/dashboard'
  : '/tenant/dashboard';
router.navigate([dashboardPath]);
```

If a synchronous user check is not available, fall back to `/login` as the safe default rather than a hardcoded path.

---

## DEF-004 — `scan_sessions` has no `dealer_id` column

**Severity:** HIGH
**Component:** Database
**Files Affected:**
- `mscan-server/database/full_setup.sql` — `scan_sessions` table definition
- `mscan-server/src/services/dealerScan.service.js` — `scanCoupon()` insert

### Description
When a dealer scans a coupon, the resulting `scan_sessions` record uses `scanned_by` (a `user_id` foreign key) to track who performed the scan. There is no direct `dealer_id` column. To determine "which dealer scanned this session," a query must JOIN `scan_sessions → users → dealers`, which is fragile: if the user record is modified, deactivated, or the role changes, the JOIN may return incorrect results.

### Root Cause
The `scan_sessions` schema was designed before the DEALER role existed. The `scanned_by` column was sufficient when all scanners were authenticated tenant users.

### Impact
- Dealer-specific analytics (e.g., "top dealers by scan volume," "dealer scan history") require three-table JOINs
- No foreign key constraint directly links a scan session to a dealer record, so referential integrity relies solely on application logic
- If a dealer's `user_id` is reused or reassigned, historical scan attribution becomes incorrect

### Proposed Fix
Add a nullable `dealer_id UUID REFERENCES dealers(id)` column to `scan_sessions`:

```sql
ALTER TABLE scan_sessions ADD COLUMN dealer_id UUID REFERENCES dealers(id) ON DELETE SET NULL;
```

Update `dealerScan.service.js` → `scanCoupon()` to populate this column during the scan insert:

```js
INSERT INTO scan_sessions (coupon_id, scanned_by, dealer_id, tenant_id, ...)
VALUES ($1, $2, $3, $4, ...)
```

Existing rows will have `NULL` for `dealer_id`, which is acceptable. Add an index on `dealer_id` for query performance.

---

## DEF-005 — Dealer creation not gated by feature flag

**Severity:** MEDIUM
**Component:** Backend / Routes
**Files Affected:**
- `mscan-server/src/routes/dealer.routes.js`

### Description
The dealer management routes (`POST /api/v1/tenants/:tenantId/dealers`, `GET`, `PUT`, `PATCH`) do not apply the `requireFeature('coupon_cashback')` or `requireFeature('coupon_cashback.dealer_scanning')` middleware. A tenant admin can create dealers even when the `coupon_cashback` feature flag is disabled for their tenant.

### Root Cause
The `requireFeature` middleware was applied to the dealer mobile scanning routes but was not considered for the admin-side dealer CRUD routes.

### Impact
- Tenant admins can create dealers for a tenant where cashback/dealer scanning is not yet enabled
- Created dealers cannot log in or scan via the mobile API (those routes are feature-gated), but they exist in the database and count against any future resource limits
- Causes confusion: "I created a dealer but they can't log in" — the real reason is the feature is disabled, but there is no indication of this during dealer creation

### Proposed Fix
Apply `requireFeature` middleware to the dealer router in `dealer.routes.js`:

```js
const { requireFeature } = require('../middleware/featureFlag.middleware');

router.use(requireFeature('coupon_cashback'));

// Existing route definitions follow...
router.post('/:tenantId/dealers', authenticate, authorize('TENANT_ADMIN', 'SUPER_ADMIN'), dealerController.createDealer);
```

Alternatively, apply it only to the write routes (POST, PUT, PATCH, DELETE) and allow GET (list/view) without the feature check, so admins can still see historical dealer records even after disabling the feature.

---

## DEF-006 — `cashback_transactions` has no `dealer_id` reference

**Severity:** MEDIUM
**Component:** Database
**Files Affected:**
- `mscan-server/database/full_setup.sql` — `cashback_transactions` table definition
- `mscan-server/src/services/cashback.service.js` — `scanCoupon()` / cashback creation

### Description
When a dealer scans a coupon and a customer cashback transaction is created, the `cashback_transactions` row contains `customer_id`, `tenant_id`, `scan_session_id`, and `coupon_code`, but no `dealer_id`. There is no direct way to query "all cashback transactions triggered by dealer X" without first resolving the scan session and then the dealer from it.

### Root Cause
`cashback_transactions` was designed from the customer perspective (who receives the cashback). The dealer who triggered it was considered traceable via `scan_session_id → scan_sessions.scanned_by`, but this is an indirect and fragile link (see also DEF-004).

### Impact
- Cannot generate "cashback payout by dealer" reports without expensive multi-table JOINs
- If DEF-004 is fixed (scan_sessions gets `dealer_id`), this defect still requires two JOINs to resolve
- Dealer accountability for cashback payouts is impossible without resolving the full session chain

### Proposed Fix
Add a nullable `dealer_id UUID REFERENCES dealers(id)` column to `cashback_transactions`:

```sql
ALTER TABLE cashback_transactions ADD COLUMN dealer_id UUID REFERENCES dealers(id) ON DELETE SET NULL;
```

Update `cashback.service.js` to populate this column when a cashback is created via dealer scan:

```js
// When called from dealer scanning context:
await db.query(
  `INSERT INTO cashback_transactions (customer_id, tenant_id, scan_session_id, coupon_code, dealer_id, ...)
   VALUES ($1, $2, $3, $4, $5, ...)`,
  [customerId, tenantId, sessionId, couponCode, dealerId, ...]
);
```

`dealer_id` remains `NULL` for cashbacks initiated via the public (no-app) flow.

---

## DEF-007 — No audit log for dealer activation/deactivation

**Severity:** MEDIUM
**Component:** Backend / Service
**Files Affected:**
- `mscan-server/src/services/dealer.service.js` — `toggleStatus()` method

### Description
The `toggleStatus()` function updates `dealers.is_active` in the database but does not insert a corresponding record into `audit_logs`. All other significant actions in the system are audited: user login, logout, credit approvals, tenant creation, etc. Dealer status changes are not.

### Root Cause
Audit logging was not included when `toggleStatus()` was implemented in `dealer.service.js`.

### Impact
- No traceability for compliance: if a dealer is deactivated and disputes when and why, there is no log to reference
- Cannot answer "who deactivated this dealer and when?" without checking `dealers.updated_at`, which only shows the timestamp, not the acting user
- Inconsistent with system-wide audit practice

### Proposed Fix
Add an `audit_logs` insert inside the `toggleStatus()` transaction:

```js
await db.query(
  `INSERT INTO audit_logs (user_id, action, details, ip_address, user_agent)
   VALUES ($1, $2, $3, $4, $5)`,
  [
    performedByUserId,  // pass this in from the controller via req.user.id
    isActive ? 'DEALER_ACTIVATED' : 'DEALER_DEACTIVATED',
    JSON.stringify({ dealer_id: dealerId, tenant_id: tenantId }),
    ipAddress,
    userAgent
  ]
);
```

Update `dealer.controller.js` → `toggleDealerStatus` handler to pass `req.user.id`, `req.ip`, and `req.get('user-agent')` to the service method.

---

## DEF-008 — User-provided `dealer_code` has no format validation

**Severity:** LOW
**Component:** Backend / Validation
**Files Affected:**
- `mscan-server/src/services/dealer.service.js` — `createDealer()`

### Description
When a `dealer_code` is provided by the caller in the request body, it is accepted and inserted without any format validation. The auto-generated code follows a consistent format (e.g., `DLR-XXXXXXXX`), but a user-supplied code can be any string including special characters, SQL-injection-looking strings (which are safely parameterised), or very long values that may cause display issues.

### Root Cause
Input validation was added for required fields (`full_name`, `phone_e164`, `shop_name`, etc.) but the optional `dealer_code` field was omitted from validation.

### Impact
- Inconsistent dealer codes across the database (auto-generated vs. freeform user input)
- Codes with special characters may cause issues in QR code generation or external integrations that expect a specific format
- No upper bound on length — a 10,000-character dealer code is technically accepted

### Proposed Fix
Add a validation rule in `dealer.service.js` or the common validator before the insert:

```js
if (dealer_code) {
  if (!/^[A-Z0-9\-_]{3,20}$/.test(dealer_code.toUpperCase())) {
    throw new ValidationError('dealer_code must be 3–20 characters, alphanumeric with hyphens or underscores only');
  }
  dealer_code = dealer_code.toUpperCase();
}
```

Alternatively, reject user-provided codes entirely and always auto-generate to ensure consistency.

---

## DEF-009 — `metadata` JSONB field not validated before insert

**Severity:** LOW
**Component:** Backend / Validation
**Files Affected:**
- `mscan-server/src/services/dealer.service.js` — `createDealer()` and `updateDealer()`

### Description
The `metadata` field is accepted from the request body and passed directly to `JSON.stringify()` before insertion into the `metadata JSONB` column:

```js
JSON.stringify(metadata || {})
```

If the caller passes a JavaScript object containing a circular reference, `JSON.stringify()` throws a `TypeError: Converting circular structure to JSON`. This exception occurs inside the service function, outside the normal `asyncHandler` error boundary awareness, and will crash the request with an unhandled rejection.

Additionally, there is no size limit check. A `metadata` object of several megabytes would be accepted and stored, potentially causing performance issues on subsequent reads.

### Root Cause
The `metadata` field was added as a generic extensibility mechanism without accompanying input sanitisation.

### Impact
- Malformed `metadata` input can cause an unhandled exception and a 500 response instead of a clean 400 validation error
- No size guard on the stored metadata object

### Proposed Fix
Wrap the `JSON.stringify()` call in a try/catch:

```js
let metadataStr;
try {
  metadataStr = JSON.stringify(metadata || {});
} catch (e) {
  throw new ValidationError('metadata contains invalid or circular data');
}

// Optional: size guard
if (metadataStr.length > 10000) {
  throw new ValidationError('metadata exceeds maximum allowed size (10KB)');
}
```

---

## DEF-010 — `CreateDealerRequest.email` typed as required but backend accepts null

**Severity:** LOW
**Component:** Frontend / Types
**Files Affected:**
- `mscan-client/src/app/models/dealer.model.ts`

### Description
The `CreateDealerRequest` interface defines `email` as a required `string`:

```ts
export interface CreateDealerRequest {
  full_name: string;
  email: string;   // <-- required, non-nullable
  phone_e164: string;
  // ...
}
```

However, the backend `dealer.service.js` and the `users` table schema both treat email as nullable for dealers (the `users.email` column uses a partial unique index `WHERE email IS NOT NULL`). The dealer form currently requires email input, so there is no functional breakage today. But the TypeScript type diverges from the backend contract.

### Root Cause
The interface was written to match the current form behaviour (email required in UI) rather than the backend's actual data contract.

### Impact
- If the form is updated to make email optional for dealers (a likely future requirement), TypeScript will not catch the type mismatch at compile time
- Any code that constructs a `CreateDealerRequest` object and omits `email` will produce a compile-time error even though the backend would accept it

### Proposed Fix
Update the interface to match the backend contract:

```ts
export interface CreateDealerRequest {
  full_name: string;
  email?: string | null;   // optional, nullable — matches backend schema
  phone_e164: string;
  shop_name: string;
  address: string;
  pincode: string;
  city: string;
  state: string;
  dealer_code?: string;
}
```

The form component can continue to validate email as required in the UI independently of the type definition.

---

## Fix Priority Order (Recommendation)

If fixes are approved, the recommended implementation order is:

1. **DEF-003** — PermissionGuard redirect (1-line frontend fix, unblocks all permission-guarded routes immediately)
2. **DEF-002** — Guard clause for `dealerId` (small backend safety net, prevents silent 200s on broken state)
3. **DEF-001** — Embed `dealer_id` in JWT (foundational fix, enables DEF-002 to be handled at the token level)
4. **DEF-004 + DEF-006** — DB schema additions (together, as both require a migration and both address audit/reporting gaps)
5. **DEF-007** — Audit log for toggle status (add alongside DEF-004/006 since it touches the same service)
6. **DEF-005** — Feature flag gate on dealer creation routes
7. **DEF-008 + DEF-009 + DEF-010** — Input validation and type fixes (low risk, can be batched)
