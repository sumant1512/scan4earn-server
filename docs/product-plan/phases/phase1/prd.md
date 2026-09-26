# Phase 1 — Roles, Ownership & Data Boundary Foundation

**Depends on:** nothing (this is the foundation everything else builds on)
**Unlocks:** Phase 2 (dashboard/feature flags), Phase 3 (Tenant billing), Phase 6 (domains) all assume this identity model exists. Phase 8 later formalizes FR-16/FR-18's Consumer into a full OTP-based account model (PRD v3, §6.10) — this phase ships only the baseline rule (direct scan, no dealer, per-Application scoping), not the account/history layer.
**Master reference:** `./PRD.md`

## Goal

Establish who can log in as what, what each role owns, and the one rule the entire product depends on: **operational business data never reaches the Super Admin or Tenant Admin tiers.** No billing, no dashboards, no domains yet — just the identity/authorization skeleton.

## In Scope

### Functional Requirements
- **FR-1, FR-2, FR-3:** Super Admin can create/suspend Tenants, approve/reject Tenant credit requests (existing mechanism, unchanged for now), and manage global feature flags/product-template library.
- **FR-4:** Super Admin sees platform-wide counts only (Tenants, Applications by type, active subscriptions, credits sold, pending requests, per-Tenant health list). Billing-derived fields (subscriptions sold, credits sold) show `0`/empty until Phase 3/5 populate them — the screen itself ships now.
- **FR-5, FR-10 (hard constraints):** No Super Admin or Tenant Admin screen/API may return a row from an Application-grain table. Enforce at the authorization-middleware layer, not the UI.
- **FR-6:** Tenant Admin can onboard a client business and provision an Application, choosing `type` (`ECOMMERCE`/`SCAN_AND_EARN`/`HYBRID`), name, and branding. **Billing terms (price/duration) are NOT part of this phase** — added in Phase 4 (FR-6b).
- **FR-7:** Tenant Admin sends an owner-invite (email + OTP); Application has no functioning owner until accepted. Invite expires after **14 days**; on expiry the Application reverts to unowned/inert and the slot is freed.
- **FR-8:** Existing tenant-level credit request/balance mechanism carries forward unchanged (no payment-gating yet — that's Phase 5).
- **FR-9:** Tenant Admin sees an administrative Application list: name, client, type, status, owner. (Credits-consumed/subscription-tier columns are added incrementally in Phase 3/4/5.)
- **FR-11:** Application Owner accepts the invite within the 14-day window, sets up OTP login, becomes the sole account bound to `owner_user_id` — permanently, no delegation, no second login ever added for this Application (RD-1).
- **FR-14 (rule only):** An owner who owns more than one Application can be authenticated against all of them; each remains independently scoped in every query. (The actual UI switcher ships in Phase 2.)
- **FR-16:** Consumers scan QR codes directly — no dealer, no assisted-scanning role exists anywhere in the schema or code.
- **FR-18:** Consumer identity is scoped per Application (`UNIQUE(application_id, phone/email)`), not platform-wide.

### Data Model Changes
- **DR-1:** Formalize `application_id` (NOT NULL) as the join key on every business-operational table (`products`, `coupons`, `coupon_batches`, `ecommerce_orders`, `scans`, `points_transactions`, `cashback_transactions`, `stock_movements`, `webhooks`, `api_usage_logs`) — rename from `verification_app_id` in all user-facing surfaces (code/DB columns may keep the existing name internally if a rename is too invasive; user-facing terminology must say "Application").
- **DR-2:** `applications` (formerly `verification_apps`) carries exactly one `owner_user_id` — NOT NULL once accepted, NULL only in the pre-acceptance inert state.
- **DR-3:** Tenant-grain tables (`tenants`, `tenant_credit_balance`, `credit_requests`, `tenant_subscriptions`, `product_templates`, `custom_domains`) are the *only* tables a Super Admin/Tenant Admin query may touch.
- **DR-4:** Drop `dealers`, `dealer_points`, `dealer_point_transactions` entirely. Remove `DEALER` from `users.role` CHECK constraint.
- **DR-5:** Collapse `APP_MANAGER`/`APP_VIEWER` into a single `APPLICATION_OWNER` role.
- **DR-6:** Application deletion is soft-delete only — never `SET NULL`/`CASCADE` on financial history.

### Non-Functional Requirements
- **NFR-1:** The data boundary (FR-5/FR-10) is enforced in authorization middleware, covered by an automated CI check asserting which roles may reach which table-backed endpoints. Any violation is a P0 bug.
- **NFR-2:** `scope = min(role, host) AND identity = registered owner` enforced server-side on every request touching an Application-scoped route.
- **NFR-6:** Composite FKs / `UNIQUE(id, tenant_id)` constraints prevent cross-Tenant data leakage.

### Resolved Decisions Landing Here
- **RD-1:** One login per Application, forever, no delegation.
- **RD-2:** 14-day owner-invite expiry; Application reverts to inert and frees its slot.
- **RD-3:** No Super Admin/Tenant Admin impersonation path into an Application, ever, under any circumstance.

## Explicitly Out of Scope (deferred)
- All billing/payment (§6.8 of master PRD) — Phases 3, 4, 5.
- Unified dashboard shell and feature-flag-driven menus — Phase 2.
- Custom domains — Phase 6.
- Rich analytics/KPIs/charts — Phase 7.

## Rollout Note
This phase is not customer-facing on its own — it's a migration + authorization rewrite. Safe to ship to production ahead of Phase 2 since it only tightens what already exists (removes dealers, collapses roles) and adds a hard boundary that was already the design intent.

## Definition of Done
- [ ] Migration drops dealer tables and role value; `users.role` CHECK updated.
- [ ] `applications.owner_user_id` nullable-until-accepted, invite-expiry job in place.
- [ ] Automated test suite proves a Tenant Admin JWT gets 403 on every Application-grain endpoint, including Applications it provisioned itself.
- [ ] Automated test suite proves a Super Admin JWT gets 403 on every Application-grain endpoint.
- [ ] No UI in either admin portal renders an order, stock, scan, or cashback figure.
