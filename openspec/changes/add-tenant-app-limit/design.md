# Design: Configurable Verification App Limit per Tenant

## Context

The `tenants` table already has a `settings` JSONB column that stores flexible per-tenant configuration (e.g., `max_products`, `allow_public_scan`). The `verification_apps` table is scoped per tenant via `tenant_id`.

**Stakeholders**: Super Admins (set/adjust limit), Tenant Admins (consume limit, see usage).

## Goals / Non-Goals

- **Goals**:
  - Let super admin set a cap on verification apps at tenant creation time
  - Let super admin raise (or lower) the cap later without a code deploy
  - Enforce the cap server-side so it cannot be bypassed from the client
  - Show clear usage feedback to tenant admins ("X of Y apps used")

- **Non-Goals**:
  - Per-user-role app limits (only per-tenant limit in scope)
  - Automated upgrade request workflow (tenant admin requesting more is out-of-band; super admin edits manually)
  - Soft-delete of apps counting against the limit (only active/existing apps count)

## Decisions

### Decision: Store limit in `tenants.settings` JSONB (not a new column)

The `settings` JSONB column already exists and is used for similar per-tenant caps (`max_products`, `max_coupons_per_batch`). Adding `max_verification_apps` here is consistent with the established pattern and requires no DDL schema migration — only a data migration to back-fill a default value.

**Key**: `settings->>'max_verification_apps'` (integer, stored as JSON number)

**Default value**: `1` for new tenants when super admin does not specify a value at creation time.

**Alternatives considered**:
- Dedicated `max_verification_apps INTEGER` column — cleaner type safety but adds DDL change and deviates from the existing JSONB pattern used for all similar limits.

### Decision: Enforce cap in service layer (not DB constraint)

The count check (`SELECT COUNT(*) FROM verification_apps WHERE tenant_id = $1`) happens in `verification-app.service.js` before insert. This keeps enforcement consistent with tenant context middleware and allows readable error messages. A DB-level `CHECK` constraint is impractical for a per-tenant count.

### Decision: Expose limit update via existing tenant update endpoint

`PUT /api/tenants/:id` already allows updating tenant settings. Super admin simply patches `settings.max_verification_apps`. No new endpoint needed.

## Risks / Trade-offs

- **Race condition on concurrent creates**: Two simultaneous app-create requests could both pass the count check before either inserts. Mitigation: acceptable for low-concurrency admin use; can add advisory lock or serializable transaction later if needed.

## Open Questions

- Should the platform-default cap be a configurable env variable (`DEFAULT_MAX_VERIFICATION_APPS=1`) or a hardcoded constant? (Recommend env variable for flexibility.)
- Should tenant admins be able to _see_ their limit (read-only) from their own dashboard, or only super admins? (Recommend: tenant admins see usage + limit, read-only.)
