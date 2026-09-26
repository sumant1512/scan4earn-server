# Phase 4 — Tenant ⇄ Application Subscription & Paywall (Layer 2)

**Depends on:** Phase 1 (identity), Phase 2 (dashboard shell to host the paywall + billing menu), Phase 3 (reuses payment-gateway infrastructure)
**Unlocks:** Real, safe onboarding of paying Applications — this is the phase that makes Phase 2's dashboard production-ready
**Master reference:** `./PRD.md` §6.8 Layer 2, §6.9

## Goal

Make every individual Application's continued operation contingent on its own payment — set by its Tenant, paid by its owner — and enforce a single, unavoidable "Activate & Pay" page whenever that payment lapses.

## In Scope

### Functional Requirements
- **FR-6b:** When provisioning an Application (Phase 1's FR-6), the Tenant Admin also sets that Application's billing terms: a custom `price_per_month` (numeric input) and a `duration_months` (1/3/6/9/12). This produces the Application's first billing cycle, created in `pending_payment` status.
- **FR-11a:** On first login (after accepting the owner-invite from Phase 1), the Application Owner lands directly on a single Activate & Pay page: price × duration = total, with a gateway checkout button. No other route in the Application is reachable until payment is confirmed.
- **FR-11b, FR-11c (gating clause):** The Ecommerce/Scan & Earn menus built in Phase 2 now only render once `application_subscriptions.status = 'active'` — this is the missing "after activation" condition Phase 2 explicitly deferred.
- **FR-11f:** Renew the subscription, before or after expiry, via the same Activate & Pay flow. Renewal extends `end_date` by the paid duration from whichever is later: the current `end_date` (renewing early) or the payment date (reactivating after a lapse).
- **FR-16a:** If a scan or storefront request resolves to an Application that is not `active`, the consumer-facing response is a branded "temporarily unavailable" page — never a raw 404/500.
- **FR-20 (enhancement):** Tenant Admin dashboard's Application list gains per-Application billing columns: price, duration, status, next renewal date.
- **FR-22a (subscription part only):** Both dashboard KPI screens (Phase 2) gain a "Billing" menu item showing this Application's own subscription status, renewal date, and payment history. (The credit-balance half of FR-22a ships in Phase 5.)
- **FR-31:** If an Application's subscription is not `active` — never-paid, expired, or manually suspended — **every** route for that Application shows the single Activate & Pay page/response:
  - Owner's dashboard — every URL redirects here.
  - Public storefront/API (ecommerce) — a branded "temporarily unavailable" response.
  - Scan-and-earn public scan landing — scanning a valid coupon on an inactive Application shows the same branded page, not a reward flow.
- **FR-32:** Renewal always uses the same single page, whether renewing early or reactivating after a lapse.
- **FR-33 (assumption, carried from master PRD — flag back if wrong):** A Tenant's own Layer 1 plan lapsing does **not** cascade to suspend its already-active Applications. Each Application's uptime depends solely on its own Layer 2 subscription. A lapsed Tenant plan only blocks provisioning of *new* Applications.

### Data Model Changes
- **DR-10:** New `application_subscriptions` table: `id`, `application_id`, `tenant_id`, `price_per_month`, `duration_months` (1/3/6/9/12), `total_amount`, `currency`, `start_date`, `end_date`, `status` (`pending_payment`/`active`/`expired`/`cancelled`), `payment_status`, `gateway_order_id`, `paid_at`, `created_by`, `created_at`, `updated_at`.

### Non-Functional Requirements
- Reuses NFR-7, NFR-8, NFR-9, NFR-10 from Phase 3 — no new payment infrastructure, just a second consumer of it.

### Resolved Decisions Landing Here
- **RD-6:** The paywall blocks everything — dashboard, public storefront/API, and scan landing — not just the dashboard.
- **RD-8 (assumption):** Tenant-level lapse does not cascade to already-active Applications; see FR-33.

## Explicitly Out of Scope (deferred)
- Credit-balance gating on coupon batches (a separate, additional gate specific to scan-and-earn) — Phase 5.
- Any recurring/auto-charge billing — explicitly out of scope for the whole product (see master PRD Non-goals); this remains fixed-term, pay-to-renew only.

## Rollout Note

Ship this alongside, or immediately after, Phase 2 — Phase 2's dashboard is not production-safe for real customers without this paywall (see Phase 2's own Rollout Note). This phase is the one that makes onboarding a real, paying Application Owner safe.

**Do not confuse this phase's "payment" with Phase 8's.** This phase is the Application Owner paying their *Tenant* to keep the Application running (settles into the platform's own gateway account, same as Phases 3/5). Phase 8 is a *shopper* paying the Application Owner for a product order (settles into the Application Owner's own gateway sub-account). They are two unrelated money flows that happen to both live behind an "Activate & Pay" / "checkout" UI.

## Definition of Done
- [ ] Creating an Application produces a `pending_payment` `application_subscriptions` row; the owner sees nothing but Activate & Pay until it's paid.
- [ ] Confirmed payment flips the row to `active` and unlocks the full dashboard (both menu groups per `app_type`).
- [ ] Letting a subscription's `end_date` pass without renewal re-locks the dashboard, the public API, and the scan landing page — verified for all three surfaces, not just the dashboard.
- [ ] Renewal (both early and post-lapse) correctly recomputes `end_date` per FR-11f's rule.
- [ ] A Tenant's own plan lapsing is verified to NOT lock out that Tenant's already-active Applications (FR-33 assumption test) — and creating a *new* Application is verified to be blocked in that state.
