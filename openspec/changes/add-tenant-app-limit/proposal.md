# Change: Add Configurable Verification App Limit per Tenant

## Why

Currently, tenant admins can create an unlimited number of verification apps with no platform-enforced cap. Super admins have no way to control or audit how many apps a tenant is allowed to register, making it impossible to enforce usage tiers or respond to capacity requests without a code change.

## What Changes

- Add `max_verification_apps` field to tenant creation form (SUPER_ADMIN sets a limit at onboarding time)
- Store the limit in the `tenants.settings` JSONB column
- Enforce the limit in the verification-app creation flow: reject requests when the tenant has reached their cap
- Allow SUPER_ADMIN to update `max_verification_apps` for an existing tenant at any time (to handle upgrade requests from tenant admins)
- Display the current usage (e.g., "1 of 3 apps used") in the SUPER_ADMIN tenant detail view and the TENANT_ADMIN verification apps list

## Impact

- Affected specs: `tenant-management`, `verification-apps`
- Affected code:
  - `mscan-server/database/full_setup.sql` — include `max_verification_apps` in default `settings` JSONB for new tenants (default: `1`)
  - `mscan-server/src/services/tenant.service.js` — create/update tenant logic
  - `mscan-server/src/services/verification-app.service.js` — enforce cap on create
  - `mscan-server/src/controllers/tenant.controller.js` — expose update limit endpoint
  - `mscan-client/src/app/components/super-admin-dashboard/` — tenant form + detail view
  - `mscan-client/src/app/components/verification-apps/` — usage indicator
- No migration needed — this is part of the initial platform setup; the database will be freshly initialized
