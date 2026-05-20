## 1. Database Schema

- [x] 1.1 Update `mscan-server/database/full_setup.sql` to include `max_verification_apps: 1` in the default `settings` JSONB for new tenants

## 2. Backend — Tenant Service & Controller

- [x] 2.1 In `tenant.controller.js` (`createTenant`): accept `max_verification_apps` input; default to `1` (or `process.env.DEFAULT_MAX_VERIFICATION_APPS`) when not provided; store in `settings` JSONB
- [x] 2.2 In `tenant.controller.js` (`PUT /api/tenants/:id`): accept and validate `max_verification_apps` in the request body; must be a positive integer ≥ 1
- [x] 2.3 Add `max_verification_apps` to the tenant detail response (`settings` column returned via `t.*`; `verification_apps_count` added to `getTenantById` query)

## 3. Backend — Verification App Service

- [x] 3.1 In `rewards.controller.js` (`createVerificationApp`): before inserting, fetch tenant `settings.max_verification_apps` and count existing apps
- [x] 3.2 If count ≥ limit, throw a 422 `APP_LIMIT_REACHED` error: `"Verification app limit reached. Contact your administrator to increase the limit."`
- [x] 3.3 Expose `apps_used` and `apps_limit` fields in the verification apps list API response for the tenant

## 4. Backend — Tests

- [x] 4.1 Integration test: `createVerificationApp` rejects when at limit — `verification-app-limit.test.js`
- [x] 4.2 Integration test: `createVerificationApp` succeeds when under limit — `verification-app-limit.test.js`
- [x] 4.3 Integration test: `PUT /api/super-admin/tenants/:id` updates `max_verification_apps` and subsequent app creation respects new limit — `verification-app-limit.test.js`
- [x] 4.4 Integration test: tenant creation defaults to `1` when `max_verification_apps` not provided — `verification-app-limit.test.js`

## 5. Frontend — Tenant Creation Form (Super Admin)

- [x] 5.1 Add `Max Verification Apps` numeric input field to the tenant creation form (`TenantFormComponent`)
- [x] 5.2 Default the field to `1`; validate as positive integer ≥ 1
- [x] 5.3 Wire the field to the create tenant API payload (form value flows through NgRx action → effect → service)

## 6. Frontend — Tenant Detail View (Super Admin)

- [x] 6.1 In `TenantDetailComponent`, display "X of Y apps used" for verification apps (shows `verification_apps_count` of `settings.max_verification_apps`)
- [x] 6.2 Add inline editable field to update `max_verification_apps`; calls `PUT /api/super-admin/tenants/:id`
- [x] 6.3 Show success/error inline feedback on save (auto-dismisses after 3 s)

## 7. Frontend — Verification Apps List (Tenant Admin)

- [x] 7.1 Display "X of Y apps used" badge at the top of `VerificationAppListComponent`
- [x] 7.2 Disable the "Create App" button when `apps_used >= apps_limit`
- [x] 7.3 Show tooltip "Contact your administrator to increase the app limit" on the disabled button

## 8. Frontend — Tests

- [x] 8.1 Unit test: `TenantFormComponent` includes `max_verification_apps` field with default value of `1` and validation — `tenant-form.component.spec.ts`
- [x] 8.2 Unit test: `VerificationAppListComponent` disables create button and shows correct usage count when at limit — `verification-app-list.component.spec.ts`

## 9. E2E Tests

- [x] 9.1 E2E: Super admin creates tenant with `max_verification_apps = 2`; tenant admin creates 2 apps successfully; third attempt shows error
- [x] 9.2 E2E: Super admin updates limit to 3; tenant admin successfully creates the third app
  > Playwright E2E suite added at `mscan-e2e/tests/super-admin/verification-app-limit.spec.ts`
