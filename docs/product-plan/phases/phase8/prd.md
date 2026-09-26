# Phase 8 — Consumer Identity & Ecommerce Checkout Payments

**Depends on:** Phase 1 (Application/role foundation), Phase 2 (ecommerce catalog/CRUD to check out against), Phase 3 (reuses the signed-webhook payment *pattern* — but see Rollout Note, this is not a drop-in reuse)
**Unlocks:** Phase 9 (shares this phase's consumer-identity model as its foundation)
**Master reference:** `./PRD.md` §6.10, §6.11 (added in PRD v3)

## Goal

Give every consumer a single, unified phone+OTP identity per Application — no separate signup form, ever — and make ecommerce checkout a real, payable transaction: the shopper pays, the money lands in the Application Owner's own account, and the resulting order/invoice is attached to an account the shopper can log back into later.

## In Scope

### Functional Requirements
- **FR-34, FR-35:** A Consumer's account is created implicitly on first successful OTP verification against a phone number, scoped per Application (`UNIQUE(application_id, phone)`). The same phone+OTP flow is both "login" and "register" — there is no separate password or sign-up form anywhere in the product for Consumers.
- **FR-36 (ecommerce half):** A Consumer's account holds their order history for this Application, viewable after logging in (OTP), regardless of whether the account was first created via guest checkout or an explicit login.
- **FR-37:** Consumer identity is never shared across Applications — the same phone number verified against two different Applications produces two entirely separate accounts.
- **FR-38:** Checkout requires phone number + OTP verification before an order can be placed — there is no fully anonymous order. This OTP step doubles as implicit account creation/login (FR-34/FR-35).
- **FR-39:** Address book: list/create/update/delete/set-default, scoped per Application per Consumer account. A shopper may also enter a one-off address inline at checkout without saving it.
- **FR-40:** Checkout payment is collected via a per-Application payment-gateway sub-account that the Application Owner completes KYC/onboarding for; funds settle directly to the Application Owner's own bank account — never through Scan4Earn's or the Tenant's own funds. Until onboarding completes, checkout is disabled or COD-only (Application Owner's choice, if the Tenant allows COD).
- **FR-41:** Payment confirmation follows the same signed-webhook pattern as platform billing (NFR-7/NFR-8) — never a client-side callback alone.
- **FR-42:** A logged-in Consumer can view their order list, order detail/tracking, and download a generated invoice for any completed order — scoped to their own orders only.
- **FR-43:** Order cancellation is allowed only while the order is in an early, cancellable status (before `shipped`); exact allowed statuses are configurable per Application by its owner.

### Data Model Changes
- **DR-18:** New `customer_addresses` table.
- **DR-19:** `ecommerce_orders` gains `payment_status`, `payment_method`, `gateway_order_id`, `gateway_payment_id`, `paid_at`, `invoice_url`.
- **DR-20:** New `application_payment_accounts` table (`gateway`, `linked_account_id`, `onboarding_status`, `payouts_enabled`) — the KYC/sub-account record gating FR-40.
- **DR-21:** `user_upi_details` rescoped to `application_id` instead of `tenant_id`, aligning it with how `CUSTOMER` users are already scoped elsewhere.

### Non-Functional Requirements
- **NFR-11:** An Application's checkout must never accept a live payment before its `application_payment_accounts` record reaches `verified`/`payouts_enabled` — enforced server-side.
- **NFR-13:** OTP rate-limiting/abuse protection (per phone number, per Application, per IP) on the unified OTP flow, since it is now the single front door to creating a Consumer account.

### Resolved Decisions Landing Here
- **RD-9:** Checkout payment is collected via a per-Application gateway sub-account, settling directly to the Application Owner — never through Scan4Earn's or the Tenant's own funds.
- **RD-12:** No anonymous ecommerce orders — phone+OTP is required at checkout and doubles as implicit account creation/login.
- **RD-13 (ecommerce half):** A Consumer's account is the same regardless of whether it was first created via checkout or an explicit login — scoped by `(application_id, phone)`.

## Explicitly Out of Scope (deferred)
- The mobile-app-based consumer identity/scan channel and the white-labeled app itself — Phase 9.
- Refunds/chargebacks on consumer payments — out of scope for the whole product (master PRD Non-goals).
- Product reviews/ratings, consumer push/SMS/email notifications beyond OTP — out of scope for the whole product.

## Rollout Note

**This is not a drop-in reuse of Phase 3's payment infrastructure.** Phase 3/4/5 all collect payment *into Scan4Earn's own platform gateway account* (Tenant/Application paying the platform). This phase requires the gateway's **marketplace/sub-account** capability (e.g. Razorpay Route linked accounts) so money can settle directly to a *third party* (the Application Owner) that Scan4Earn never touches. Budget this as new integration work, not a copy-paste of Phase 3's webhook handler, even though the signed-webhook *pattern* (NFR-7/NFR-8) is shared.

Do not enable live checkout for a real Application until its `application_payment_accounts` onboarding is verified (NFR-11) — ship COD-only or a disabled checkout state as the safe default in the interim.

## Definition of Done
- [ ] A new phone number verified via OTP at checkout creates a Consumer account scoped to that Application; a returning phone number logs into the existing one.
- [ ] Address book CRUD works; a logged-in shopper can reuse a saved address at checkout, and a first-time shopper can check out with a one-off inline address.
- [ ] An Application without a verified payment sub-account cannot accept a live payment — verified by an automated test attempting to force it.
- [ ] A confirmed payment webhook (and only a confirmed webhook, never a client callback) flips an order to `paid` and is idempotent under retry.
- [ ] A logged-in Consumer can view their order list/detail and download an invoice for a completed order.
- [ ] Order cancellation is blocked once an order passes the Application-configured cancellable-status boundary.
