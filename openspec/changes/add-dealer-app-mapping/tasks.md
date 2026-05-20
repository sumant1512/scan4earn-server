## 1. Database Schema
- [ ] 1.1 Add `verification_app_id UUID NOT NULL REFERENCES verification_apps(id) ON DELETE CASCADE` to `dealers` table in `full_setup.sql`
- [ ] 1.2 Drop `CONSTRAINT unique_tenant_dealer_code UNIQUE (tenant_id, dealer_code)`
- [ ] 1.3 Add `CONSTRAINT unique_user_app UNIQUE (user_id, verification_app_id)` — one profile per person per app
- [ ] 1.4 Add `CONSTRAINT unique_dealer_code_per_app UNIQUE (tenant_id, verification_app_id, dealer_code)` — dealer codes scoped per app
- [ ] 1.5 Add index `idx_dealers_verification_app ON dealers(verification_app_id)`
- [ ] 1.6 Apply migration for existing databases (fresh DB: safe to add NOT NULL directly; existing rows: delete or backfill before applying)

## 2. Auth — JWT Change (conflicts with add-ecommerce-coupon-cashback)
- [ ] 2.1 Remove `dealer_id` from dealer JWT payload in the auth service (dealer OTP verify handler)
- [ ] 2.2 Update dealer JWT to carry only `user_id` and `role: DEALER`
- [ ] 2.3 Update the dealer auth spec delta in `add-ecommerce-coupon-cashback` change to reflect the removal of `dealer_id` from the token — coordinate with that change before merging either

## 3. Service Layer
- [ ] 3.1 Update `createDealer()` to require and validate `verification_app_id` belongs to the same tenant
- [ ] 3.2 Update `createDealer()` to check phone against existing `users` rows:
  - If no user exists → create `users` row with `role: DEALER`
  - If user exists with `role: DEALER` → reuse the user row
  - If user exists with any other role → reject with 422 `"This phone number is already registered as a <role> and cannot be used for a dealer profile"`
- [ ] 3.3 Update `createDealer()` to check `UNIQUE (user_id, verification_app_id)` and return 409 `"This user already has a dealer profile for this verification app"` on conflict
- [ ] 3.4 Update `getDealers()` to accept optional `?app_id=` filter; include `verification_app_id` in all returned rows
- [ ] 3.5 Update `getDealerById()` to include `verification_app_id` in returned payload
- [ ] 3.6 Update `updateDealer()` (PATCH) to allow editing `shop_name`, `address`, `pincode`, `city`, `state`, `is_active`, `dealer_code` — `verification_app_id` and `user_id` are immutable after creation
- [ ] 3.7 Update scan validation to resolve dealer profile via `WHERE user_id = jwt.user_id AND verification_app_id = scanning_app.id`
- [ ] 3.8 Update scan validation to return 403 `"Dealer has no profile for this verification app"` when no profile found
- [ ] 3.9 Update scan validation to return 403 `"Dealer account is deactivated for this app"` when profile `is_active = false`
- [ ] 3.10 Update dealer points query (`GET /api/mobile/v1/dealer/points`) to resolve `dealer_id` from `(user_id, scanning_app_id)` rather than from JWT

## 4. Controller & Validation
- [ ] 4.1 Add `verification_app_id` as required field in create-dealer request schema/validator
- [ ] 4.2 Make `verification_app_id` read-only after creation — reject any PATCH that includes it with 422 `"verification_app_id cannot be changed after creation"`
- [ ] 4.3 Expose `?app_id=` query parameter on `GET /api/dealers`
- [ ] 4.4 Ensure `PATCH /api/dealers/:id` accepts `shop_name`, `address`, `pincode`, `city`, `state`, `dealer_code`, `is_active`

## 5. API Documentation
- [ ] 5.1 Update API docs to reflect required `verification_app_id` on dealer creation (non-editable after creation)
- [ ] 5.2 Document that dealer JWT no longer contains `dealer_id`
- [ ] 5.3 Document `?app_id=` filter on list endpoint
- [ ] 5.4 Document multi-profile behaviour: same phone may return multiple rows when listing without `?app_id=`
- [ ] 5.5 Document that points balances are isolated per app profile

## 6. Validation
- [ ] 6.1 Run `openspec validate add-dealer-app-mapping --strict` and fix any issues
- [ ] 6.2 Manual test: create dealer with valid `verification_app_id` → success
- [ ] 6.3 Manual test: create dealer without `verification_app_id` → 422
- [ ] 6.4 Manual test: create dealer with app ID from different tenant → 422
- [ ] 6.5 Manual test: register phone that belongs to a TENANT_USER → 422 with role mentioned in message
- [ ] 6.6 Manual test: register phone that belongs to existing DEALER user → reuses user row, creates new profile
- [ ] 6.7 Manual test: register phone with no existing user → creates user row + dealer profile
- [ ] 6.8 Manual test: create same user as dealer in App A and App B → both succeed, distinct rows, same `user_id`
- [ ] 6.9 Manual test: create same user as dealer in same app twice → 409
- [ ] 6.10 Manual test: update address on App A profile → App B profile unchanged
- [ ] 6.11 Manual test: PATCH `verification_app_id` → 422 (immutable)
- [ ] 6.12 Manual test: dealer JWT does not contain `dealer_id`
- [ ] 6.13 Manual test: dealer scans via their assigned app → success, correct profile resolved from user_id + app
- [ ] 6.14 Manual test: dealer scans via an app they have no profile in → 403
- [ ] 6.15 Manual test: dealer with two profiles scans via App A → App A data used, App B unaffected
- [ ] 6.16 Manual test: points earned via App A scan do not appear in App B points balance
- [ ] 6.17 Manual test: GET dealer/points via App A API key returns App A balance only
- [ ] 6.18 Manual test: deactivate dealer App A profile → App B profile still active
- [ ] 6.19 Manual test: deactivated dealer scans via App A → 403
- [ ] 6.20 Manual test: reactivate dealer → scanning works again
- [ ] 6.21 Manual test: delete verification app → all its dealer profiles cascade-deleted
- [ ] 6.22 Manual test: register same phone as dealer in Tenant A and Tenant B → two separate user rows, two separate dealer_id rows, two separate points balances
- [ ] 6.23 Manual test: points earned scanning in Tenant A do not appear in Tenant B points balance for same phone
