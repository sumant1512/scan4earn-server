# Phase 3 — Super Admin ⇄ Tenant Subscription Billing (Layer 1) + Payment Gateway Foundation

**Depends on:** Phase 1 (Tenants and roles must exist)
**Unlocks:** Phase 4 and Phase 5 both reuse the payment-gateway infrastructure built here
**Master reference:** `./PRD.md` §6.8 Layer 1

## Goal

Stand up the first real money flow in the product — a Tenant subscribing to a configurable plan and paying the Super Admin — and build the shared payment-gateway plumbing (Orders, webhooks, reconciliation) that Phases 4 and 5 will reuse rather than reinvent.

## In Scope

### Functional Requirements
- **FR-4a:** Super Admin manages a configurable subscription-plan catalog (create, edit, deactivate) — each plan has a name, flat `price_per_month`, and a `max_applications` ceiling (nullable = unlimited). Seed with:
  - Plan 1 — ₹2,000/mo, up to 3 Applications
  - Plan 2 — ₹5,500/mo, up to 10 Applications
  - Plan 3 — ₹50,000/mo, unlimited Applications
  These are ordinary catalog rows; Super Admin can add/edit/retire plans at any time without a deploy.
- **FR-6a:** Tenant Admin selects a plan + a duration in months, pays via gateway checkout; `total_amount = plan.price_per_month × duration_months`. On confirmed payment, the subscription activates and the Tenant's max-Applications ceiling is enforced from that point (Phase 1's FR-6 provisioning flow now checks this ceiling before allowing a new Application). Exceeding the ceiling blocks creation with an upgrade prompt — no overage billing.
- **FR-9 (enhancement):** Tenant Admin's Application list gains no new columns yet from this phase directly, but the Tenant Admin dashboard now shows the Tenant's own plan name, status, and renewal date (see FR-20 below).
- **FR-19 (enhancement):** Super Admin's platform dashboard now shows real numbers for active subscriptions and credits sold (structure existed in Phase 1; this phase populates it).
- **FR-20 (enhancement):** Tenant Admin dashboard shows: current plan, subscription status, renewal date.

### Data Model Changes
- **DR-8:** New `subscription_plans` table: `id`, `name`, `price_per_month`, `max_applications` (NULL = unlimited), `is_active`, `sort_order`, `created_by`, `created_at`, `updated_at`.
- **DR-9:** `tenant_subscriptions` gains a `plan_id` FK to `subscription_plans`; `total_amount = plan.price_per_month × duration_months`. Existing free-form `app_count`/`price_per_app_month` rows remain valid historical records, not migrated.

### Non-Functional Requirements (shared infrastructure — build once, reuse in Phases 4 & 5)
- **NFR-7:** All payment surfaces use the same pattern: create a gateway Order/Payment Link → redirect/embed checkout → verify payment via a **signed webhook** (never trust a client-side callback alone) → flip the row to active only once the signature verifies. Extends the existing Razorpay integration (`paymentGateway.service.js`, currently payout-only) to also support inbound Orders/Payment Links.
- **NFR-8:** Webhook handlers are idempotent — a retried webhook for the same `gateway_order_id` never double-credits or double-extends.
- **NFR-9:** A scheduled job reconciles any `pending_payment` row older than a configurable threshold against the gateway's order-status API, catching missed webhooks.
- **NFR-10:** No card/bank credentials are ever stored — only gateway references (`order_id`, `payment_id`). All collection happens on the gateway's own hosted checkout.

### Resolved Decisions Landing Here
- **RD-4:** Plan price is a flat monthly tier fee; total payable = plan price × duration, independent of how many Applications the Tenant actually runs (up to the ceiling).
- **RD-7:** Real online gateway checkout with automatic activation on a verified webhook — no manual "mark as paid" step, for this or any later payment surface.

## Explicitly Out of Scope (deferred)
- Application-level billing (Tenant charging its Applications) — Phase 4.
- Credit purchase/resale hierarchy — Phase 5.
- Enforcement of what happens when a Tenant's *own* plan lapses (touched on in Phase 4's RD-8/FR-33).

## Rollout Note

This phase can ship independently and immediately after Phase 1 — it does not depend on Phase 2's dashboard existing (a simple settings/billing page for Tenant Admin is enough), and nothing here affects Application Owners at all yet.

## Definition of Done
- [ ] Plan catalog seeded with the three initial plans; Super Admin can add a fourth without a deploy.
- [ ] Tenant Admin can select a plan+duration, complete a real (sandbox) gateway checkout, and see the subscription activate automatically on webhook confirmation.
- [ ] Provisioning an Application beyond the active plan's ceiling is blocked with a clear upgrade prompt.
- [ ] A duplicated webhook delivery for the same order does not double-activate or double-charge (NFR-8 test).
- [ ] A simulated missed webhook is caught and reconciled by the scheduled job within its configured threshold (NFR-9 test).
