## Context
The `dealers` table currently has no link to `verification_apps`. A dealer is a physical person who scans coupons via a specific app. The same person may act as a dealer for multiple apps within the same tenant (e.g., a shop owner enrolled in both a "Retail App" and a "Wholesale App"), and their operational details (address, shop name, dealer code) may differ per app context.

## Goals / Non-Goals
- Goals:
  - Enforce that every dealer row is scoped to exactly one verification app
  - Allow the same person (same phone/email) to have separate dealer profiles for different apps
  - Each profile has its own address, shop name, dealer code, and active status
  - Scan validation resolves the correct dealer profile based on (user_id, scanning_app_id)
- Non-Goals: a shared/global dealer profile that is automatically inherited across apps

## Decisions

- **One user → multiple dealer profiles (one per app):**
  The `users` table remains unique on `(tenant_id, phone_e164)` — one person = one user record. The `dealers` table allows multiple rows for the same `user_id`, distinguished by `verification_app_id`. This means a person with phone "9999999999" can have a dealer profile in App A (with address "Mumbai, Shop 1") and a separate profile in App B (with address "Pune, Warehouse 2"). These are fully independent records.

- **NOT NULL `verification_app_id` on `dealers`:**
  Every dealer row MUST be linked to an app. An unscoped dealer has no operational meaning — scan events must be attributable to a specific app.

- **Uniqueness constraints:**
  - `UNIQUE (user_id, verification_app_id)` — prevents the same person from being registered twice in the same app.
  - `UNIQUE (tenant_id, verification_app_id, dealer_code)` — dealer codes are unique within an app, but the same code may exist across different apps.
  - The old `UNIQUE (tenant_id, dealer_code)` constraint is dropped.

- **JWT carries `user_id` only — `dealer_id` is removed from the token:**
  The existing dealer auth spec (`add-ecommerce-coupon-cashback`) puts `dealer_id` in the JWT. With multiple profiles, a dealer has multiple `dealer_id`s and the system cannot know at login time which app the dealer will scan in. Decision: remove `dealer_id` from the JWT entirely. The JWT carries only `user_id` and `role: DEALER`. At scan time, the correct dealer profile is resolved by querying `dealers WHERE user_id = jwt.user_id AND verification_app_id = scanning_app.id`. This change conflicts with the existing dealer auth spec and that spec must be updated accordingly before implementation.

- **Per-profile points balance (isolated per app):**
  `dealer_points` references `dealer_id`, which is per-profile. A dealer with profiles in App A and App B has two independent points balances. Points earned by scanning in App A belong to the App A profile and do not roll over to App B. This is intentional — different apps may run different reward programs.

- **Dealer registration rejects phone already used with a non-dealer role:**
  `users` is unique on `(tenant_id, phone_e164)`. If a phone number is already registered in the tenant as `TENANT_ADMIN` or `TENANT_USER`, registering it as a dealer would either fail with a DB constraint or silently return the wrong role. `createDealer()` MUST query `users` by phone before creating or reusing a record, and reject with 422 if the existing user's role is not `DEALER`.

- **Per-profile activation:**
  `is_active` lives on each dealer row, not on the user record. A dealer can be active in App A and deactivated in App B independently.

- **`ON DELETE CASCADE` on `verification_app_id` FK:**
  Deleting a verification app permanently removes all dealer profiles associated with it.

- **Migration strategy:**
  Fresh database — no existing dealer rows. The column is added as NOT NULL from the start. No backfill needed.

## Risks / Trade-offs
- **Breaking API change** → `POST /api/dealers` now requires `verification_app_id`. Any existing caller without it receives 422.
- **Duplicated profile data** → address, shop name etc. are intentionally duplicated per app. This is by design — each profile is independently managed.
- **Auth context resolution** → if a dealer's JWT is used against a scanning app they have no profile in, the request fails with 403. This is the correct behaviour — it prevents cross-app scanning.

## Migration Plan
1. Ensure `verification_apps` rows exist for the tenant.
2. `ALTER TABLE dealers ADD COLUMN verification_app_id UUID NOT NULL REFERENCES verification_apps(id) ON DELETE CASCADE` — only safe on fresh/empty tables.
3. Drop `CONSTRAINT unique_tenant_dealer_code`.
4. Add `CONSTRAINT unique_user_app UNIQUE (user_id, verification_app_id)`.
5. Add `CONSTRAINT unique_dealer_code_per_app UNIQUE (tenant_id, verification_app_id, dealer_code)`.
6. Add index `idx_dealers_verification_app ON dealers(verification_app_id)`.

## Open Questions
- ~~Should a dealer's app assignment be changeable after creation (PATCH), or immutable?~~
  **Resolved:** `verification_app_id` is immutable after creation. To enrol the same person in another app, create a new dealer row.

- ~~When a verification app is deleted, should its dealers be cascade-deleted or soft-blocked?~~
  **Resolved:** Cascade-delete via `ON DELETE CASCADE` on `dealers.verification_app_id`.

- ~~What goes in the dealer JWT — `dealer_id` or `user_id`?~~
  **Resolved:** JWT carries `user_id` only. `dealer_id` is removed from the token. Profile is resolved at scan time from `(user_id, scanning_app_id)`. The `add-ecommerce-coupon-cashback` dealer auth spec must be updated to match before implementation.

- ~~Are dealer points shared across app profiles or isolated per profile?~~
  **Resolved:** Isolated per profile. Each `dealer_id` (per app) has its own `dealer_points` row. Points earned in App A do not affect App B.

- ~~What happens if the phone used for dealer registration already belongs to a non-dealer user?~~
  **Resolved:** `createDealer()` checks the existing user's role. If the role is not `DEALER`, the request is rejected with 422 and an explicit message.
