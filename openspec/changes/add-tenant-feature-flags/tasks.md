# Implementation Tasks for Tenant Feature Flags

## Database Schema

- [x] Add `features` table to `full_setup.sql`
- [x] Add `tenant_features` table to `full_setup.sql`
- [x] Create migration script for existing databases

## Backend Services

- [x] Create `feature.service.js` with CRUD operations for features
- [x] Add `isFeatureEnabledForTenant(featureCode, tenantId)` function
- [x] Create `feature.controller.js` for API endpoints
- [x] Add `feature.routes.js` and integrate into main router
- [x] Update existing services to use feature checks where applicable

## Middleware & Utilities

- [x] Create `feature.middleware.js` for optional feature gating
- [x] Add feature check utilities to common modules

## API Endpoints

- [x] POST /api/features — Create new feature
- [x] GET /api/features — List all features
- [x] PUT /api/features/:id — Update feature
- [x] DELETE /api/features/:id — Delete feature
- [x] POST /api/tenants/:id/features — Enable feature for tenant
- [x] DELETE /api/tenants/:id/features/:featureId — Disable feature for tenant
- [x] GET /api/tenants/:id/features — List features for tenant
- [x] GET /api/tenants/:id/features/:featureCode/check — Check feature status

## Frontend UI

- [x] Add feature management section to super-admin dashboard
- [x] Create feature list component
- [x] Create tenant feature assignment component
- [x] Update tenant detail view to show enabled features

## Testing

- [ ] Add unit tests for feature service
- [ ] Add integration tests for feature APIs
- [ ] Add E2E tests for feature management
- [ ] Test feature gating in existing flows

## Documentation

- [x] Update API documentation
- [x] Add developer guide for using feature flags
- [x] Update tenant admin guide if needed</content>
      <parameter name="filePath">/Users/bhaskar/Product/mscan/openspec/changes/add-tenant-feature-flags/tasks.md
