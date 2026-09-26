# Phase 5 — Scan-and-Earn Credit Hierarchy (Layer 3)

**Depends on:** Phase 1 (identity), Phase 2 (coupon-batch CRUD must already exist to be gated), Phase 3 (payment-gateway infrastructure + existing `tenant_credit_balance` concept)
**Unlocks:** Closes the loop for scan-and-earn Applications — nothing else depends on this phase
**Master reference:** `./PRD.md` §6.8 Layer 3

## Goal

Add the cascading credit system that governs how many coupons a scan-and-earn (or hybrid) Application may generate: Application requests and pays its Tenant, Tenant requests and pays the Super Admin, and coupon-batch creation is finally metered against a real, payment-backed balance. This layer applies **only** to the scan-and-earn side of an Application — ecommerce Applications never touch it.

## In Scope

### Functional Requirements
- **FR-4b:** Super Admin configures the platform-wide credit exchange rate (INR per credit) used when a Tenant purchases credits. Rate changes only affect future purchases, never retroactively re-price an approved request.
- **FR-4c:** Approving a Tenant's credit-purchase request is automatic upon confirmed payment — crediting `tenant_credit_balance` by the requested amount. Payment confirmation *is* the approval; no separate manual click.
- **FR-6c:** Tenant Admin may optionally set its own credit resale rate (INR per credit) for its own Applications; defaults to the platform rate if unset.
- **FR-6d:** Tenant Admin approval of an Application's credit request is automatic upon the Application Owner's confirmed payment — but the platform must refuse to even generate a payable order if the Tenant's own `tenant_credit_balance` doesn't currently hold enough to cover it, surfacing "Tenant does not have enough credits to sell."
- **FR-11d:** Application Owner requests M credits from their own Tenant; total payable = M × the Tenant's resale rate (or platform default). On confirmed payment, `application_credit_balance` is credited by M and `tenant_credit_balance` is simultaneously debited by M — credits move down the hierarchy, never created out of thin air at the Tenant or Application level.
- **FR-11e:** Application Owner views their own Application's credit balance and full transaction ledger (requests, payments, batch debits) — scoped to that Application only.
- **FR-13 (completes the split from Phase 2):** Coupon-batch creation now enforces the gate Phase 2 deferred — a batch can only be created up to the Application's currently available `application_credit_balance`; required credits are debited automatically and atomically at creation time, with no bypass path. Requesting a batch against an insufficient balance is rejected outright, directing the owner to request more credits first (FR-11d).
- **FR-20 (enhancement):** Tenant Admin dashboard gains a list of pending Application credit requests awaiting approval (i.e., awaiting the requester's payment).
- **FR-22a (credit-balance half):** The Billing menu item added in Phase 4 now also shows, for scan-and-earn/hybrid Applications, the current credit balance and ledger (FR-11e).
- **Settlement note (not a new FR, but a hard architectural rule):** when a consumer actually scans a coupon and a cashback/points reward triggers, the real UPI payout is always disbursed from the **Super Admin's own configured payment/payout account** (unchanged from today's single `RAZORPAY_ACCOUNT_NUMBER` architecture). Credits are purely an internal entitlement ledger — never a pre-funded escrow for the payout itself. Any implementation spec for this phase must keep these two systems (credit ledger vs. cash settlement) explicitly separate.

### Data Model Changes
- **DR-11:** New `platform_credit_rate` config table (singleton row): `id`, `inr_per_credit`, `updated_by`, `updated_at`.
- **DR-12:** New `tenant_credit_rate` table: `tenant_id` (UNIQUE), `inr_per_credit` (NULL = inherit platform rate), `updated_by`, `updated_at`.
- **DR-13:** New `application_credit_balance` table, mirroring `tenant_credit_balance` at Application grain: `application_id` (UNIQUE), `balance`, `total_received`, `total_spent`.
- **DR-14:** New `application_credit_requests` table, mirroring `credit_requests` at Application grain plus payment columns: `application_id`, `tenant_id`, `requested_by`, `requested_amount`, `rate_applied`, `total_payable`, `status` (`pending_payment`/`approved`/`rejected`), `gateway_order_id`, `paid_at`, `processed_by`, `processed_at`, `rejection_reason`.
- **DR-15:** New `application_credit_transactions` table, mirroring `credit_transactions` at Application grain (`CREDIT`/`DEBIT`/`REFUND`, `balance_before`/`balance_after`, `reference_id`/`reference_type`).
- **DR-16:** Existing `credit_requests` (Tenant ⇄ Super Admin) gains `rate_applied`, `total_payable`, `gateway_order_id`, `paid_at` — approval becomes conditional on confirmed payment instead of a standalone manual action.
- **DR-17:** Coupon-batch credit debit moves from `tenant_credit_balance` to `application_credit_balance` — every coupon-batch-creation code path is updated to debit the Application's own balance, not its Tenant's.

### Non-Functional Requirements
- **NFR-3:** Every coupon/scan-generating action debits credits with no bypass path — this phase is where the "today's batch path charges 0" defect from the original codebase is fully closed, since the whole gating mechanism is new here.
- Reuses NFR-7, NFR-8, NFR-9, NFR-10 (payment infrastructure) from Phase 3.

### Resolved Decisions Landing Here
- **RD-5:** Super Admin sets one platform-wide INR-per-credit rate; a Tenant may optionally set its own resale rate for its Applications, defaulting to the platform rate if unset.

## Explicitly Out of Scope (deferred)
- Nothing further defers from here — this closes the scan-and-earn billing loop. Refunds/reversals of already-spent credits remain out of scope for the whole product (master PRD Non-goals).

## Rollout Note

Do not enable real scan-and-earn Applications for paying customers until this phase ships — Phase 2 alone lets an owner create unlimited coupon batches for free, which is fine for an internal beta but not for production. Ecommerce-only Applications are unaffected by this phase and can go live as soon as Phase 4 lands.

## Definition of Done
- [ ] Super Admin can set/change the platform credit rate; a rate change does not retroactively alter an already-approved request's price.
- [ ] Tenant can optionally set its own resale rate; Applications default to the platform rate when the Tenant hasn't set one.
- [ ] A Tenant cannot approve/fulfil an Application's credit request beyond its own current `tenant_credit_balance` — verified by an automated test attempting to oversell.
- [ ] Confirmed payment on an Application's credit request atomically credits `application_credit_balance` and debits `tenant_credit_balance` by the same amount, with no partial-state possibility on failure.
- [ ] Creating a coupon batch against an insufficient `application_credit_balance` is rejected before any QR codes are generated.
- [ ] A successful batch creation debits `application_credit_balance` atomically and exactly once (no double-debit under retry/concurrency).
- [ ] A scan-triggered cashback payout is confirmed to draw from the Super Admin's own payout account regardless of which Tenant/Application it belongs to.
