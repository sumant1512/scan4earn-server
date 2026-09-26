# Phase 6 — Custom Domains & Routing

**Depends on:** Phase 1 (Tenants and Applications must exist to have anything to point a domain at)
**Unlocks:** Nothing else depends on this — it can be parallelized with Phases 2–5 if resourcing allows (see Rollout Note)
**Master reference:** `./PRD.md` §6.6

## Goal

Let a Tenant or an Application Owner map their own domain instead of using the default `scan4earn.com` subdomain/path — the premium, white-label layer of the product.

## In Scope

### Functional Requirements
- **FR-23:** Every Tenant and every Application resolves by default under `scan4earn.com` (Tenant via subdomain, Application via path) with zero DNS setup.
- **FR-24:** A Tenant may map a custom domain to its own reseller portal (administrative content only — the FR-10 data boundary applies regardless of hostname).
- **FR-25:** An Application Owner may map a custom domain directly to their Application — expected to be the common case, since each client business is typically a distinct branded company.
- **FR-26:** Hostname resolution (custom domain → subdomain → root → 404) is independent from, and always followed by, an identity check: the authenticated user must equal the Application's `owner_user_id` for any Application-scoped operational route to succeed. Host resolution alone is never sufficient authorization.
- **FR-27:** Printed/physical QR codes always encode the permanent `scan4earn.com/s/:code` URL, never a custom domain — branding is applied at scan time based on current Application config.

### Data Model Changes
- **DR-7:** `custom_domains` table: `hostname` (UNIQUE), `tenant_id` (NOT NULL), `application_id` (NULL = Tenant portal, set = one Application), `is_primary`, `verification_token`, `status`, `ssl_status`.

### Non-Functional Requirements
- **NFR-5 (Domain lifecycle):** TLS auto-issue/auto-renew with alerting on failure; DNS drift detection (scheduled re-resolution of CNAME/TXT); reserved-namespace blocklist for Tenant slugs and `custom_domains` hostnames; Application soft-delete deactivates its domains with a branded 410, never a bare error.

## Explicitly Out of Scope (deferred)
- Nothing further defers *from* this phase, but this phase itself is fully independent of billing — do not gate domain mapping behind Phase 3/4/5 unless deliberately bundling the "custom domain" feature as a paid add-on (the master PRD's money-loop notes this as a plausible premium upsell, but it is not a hard requirement here).

## Rollout Note

This phase has the fewest dependencies of the whole roadmap — it only needs Phase 1's Tenant/Application records to exist. It can run in parallel with Phases 2–5 if you have the engineering capacity to split a workstream here; sequencing it last (as numbered) is a reasonable default if capacity is constrained, since it's the one gap that doesn't block any other phase's rollout to real customers.

## Definition of Done
- [ ] A Tenant can map a custom domain to its reseller portal; TXT + CNAME verification flow works end to end; certificate auto-issues on verification.
- [ ] An Application Owner can map a custom domain directly to their Application; the domain serves only that Application's routes, nothing else.
- [ ] Opening an Application-scoped route via any hostname still enforces the FR-26 identity check — a valid host resolution with the wrong logged-in user still 403s.
- [ ] Letting a domain's TLS cert approach expiry triggers an `ssl_expiring` alert before it lapses.
- [ ] A broken CNAME/TXT is detected by the drift job and flagged `dns_broken` without taking down the default `*.scan4earn.com` fallback.
- [ ] Printed QR codes are verified to never encode a custom domain, only the permanent `scan4earn.com/s/:code` form.
