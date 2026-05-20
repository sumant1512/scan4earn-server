# Change: Add Dealer–Verification App Mapping

## Why
Currently dealers are created at the tenant level with no relationship to a specific verification app. This means a dealer could theoretically scan coupons across any app belonging to the tenant, which breaks app-level data isolation and makes analytics (scan counts, points earned) ambiguous. Requiring a dealer to belong to exactly one verification app enforces clear scoping and unlocks per-app dealer management.

## What Changes
- **BREAKING** — `POST /api/dealers` MUST include `verification_app_id`; requests without it SHALL be rejected with 422.
- **BREAKING** — `dealers` table gains a non-nullable `verification_app_id` FK column (migration required for existing rows).
- `GET /api/dealers` SHALL accept an optional `?app_id=` query parameter to filter by verification app.
- Dealer lookup during scan validation SHALL verify that the dealer's `verification_app_id` matches the scanning app's ID.
- New `dealer-management` capability spec is introduced (no existing spec).
- `verification-apps` spec is updated to document that dealers are scoped per app.

## Impact
- Affected specs: `dealer-management` (new), `verification-apps` (modified)
- Affected code:
  - `database/full_setup.sql` — add `verification_app_id` to `dealers` table
  - Schema migration — backfill or drop existing dealer rows before applying NOT NULL
  - `src/services/dealer.service.js` — enforce app validation on create/list
  - `src/controllers/dealer.controller.js` — pass `verification_app_id` from request
  - `src/routes/dealer.routes.js` — no route changes expected
  - Scan validation middleware — verify dealer↔app match at scan time
