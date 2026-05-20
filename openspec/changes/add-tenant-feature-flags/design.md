# Design Decisions for Tenant Feature Flags

## Database Design

### Features Table (Nested / Tree Structure)

```sql
CREATE TABLE features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES features(id) ON DELETE SET NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    default_enabled BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

- Features can be arranged into a tree via `parent_id` (self-referential FK).
- Child features inherit visibility from parents in the UI; enabling/disabling a parent can cascade depending on business rules.
- `created_by` is maintained by the API when a SUPER_ADMIN creates a feature.
- `updated_at` is managed via `update_updated_at_column()` trigger for audit.

### Tenant Features Table

```sql
CREATE TABLE tenant_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    enabled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    enabled_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, feature_id)
);
```

- Tracks per-tenant enablement, who enabled it, and when.

### Migration Strategy

- Migrations are idempotent and safe to re-run.
- `APPLY_FEATURE_FLAGS_SCHEMA.sql` checks for:
  - Existence of `features` and `tenant_features` tables
  - Existence of the `created_by` and `parent_id` columns
  - Existence of the helper function `is_feature_enabled_for_tenant`
- This allows applying schema changes to existing deployments without destructive DDL.

## Service Layer Design

### Feature Service

- `createFeature(data, actorId, req)` — Create feature definition and record `created_by`; supports `parent_id` for nested feature trees
- `getFeatures()` — List all features (flat list)
- `getFeatureTree()` — List features as a nested tree (parents with children)
- `getFeatureChildren(featureId)` — List direct children of a feature
- `updateFeature(id, data)` — Update feature (including changing `parent_id`)
- `deleteFeature(id)` — Delete feature (must handle children explicitly; options include cascade-delete, prevent/delete if children exist, or reparent children to `NULL`)
- `enableFeatureForTenant(featureId, tenantId, userId)` — Enable feature for tenant; automatically enables all ancestors (returns list of affected feature IDs)
- `disableFeatureForTenant(featureId, tenantId, userId, cascade = false)` — Disable feature for tenant; optionally cascade-disable descendants (recommended to keep stored state aligned with effective state)
- `isFeatureEnabledForTenant(featureCode, tenantId)` — Check if enabled (uses helper SQL function that validates ancestor state)
- `getTenantFeatures(tenantId)` — List effective tenant feature settings (resolves parent/ancestor status)

### Strict Inheritance Rules (Tree Enforcement)

These rules define the strict inheritance behavior for nested feature flags:

- **Effective enabled state** is the AND of:
  1. the feature's own tenant flag (or default) and
  2. the enabled state of _all ancestor features_.

- **Enabling a feature**
  - Always results in all ancestor features being enabled for the tenant as well.
  - This prevents a child feature from ever being enabled while an ancestor is disabled.
  - If an ancestor is currently disabled, the system will enable it (and continue up the chain).

- **Disabling a feature**
  - Disables the feature for the tenant.
  - Descendants remain in their current state, but become **effectively disabled** because an ancestor is now off.
  - If `cascade = true`, the system also disables all descendants (recursive) to keep the stored state aligned with effective state.

- **Cycle prevention**
  - The system must enforce an acyclic feature graph (no loops). This can be done via application-level validation when setting/changing `parent_id`, and/or a database trigger that rejects cycles.

- **Ancestor-enabled helper**
  - `is_feature_enabled_for_tenant` must traverse the full ancestor chain and confirm every ancestor is enabled (tenant override or default) before returning `true`.
  - Recommended implementation: recursive CTE that walks parents and checks per-tenant enabled state.

This strict model ensures that the tenant’s enabled feature set always reflects a valid tree-based inheritance hierarchy, preventing “orphaned enabled” flags that are never effective.

### Validation Rules (Backend)

- Feature `code` must match `/^[a-z][a-z0-9_-]*$/`
- Code length must be 3–100 characters
- Backend will return a validation error if these constraints are violated

## API Design

### Role-based behavior (Super-Admin vs Tenant-Admin)

- **Super-Admin**
  - Can create feature flags (global definitions).
  - Can _assign_ a feature to a tenant (create tenant_feature record).
  - Can enable/disable a feature for a tenant (controls the assigned flag).

- **Tenant-Admin**
  - Can only view/manage feature flags that are already assigned to their tenant by a super-admin.
  - Cannot assign new features to the tenant.
  - Can enable/disable assigned feature flags for their tenant only.

### Endpoints

- `POST /api/features` — Create feature (SUPER_ADMIN only), accepts `parent_id` for nesting
- `GET /api/features` — List all features (flat list)
- `GET /api/features/tree` — List features as a nested tree
- `GET /api/features/:id/children` — List direct children of a feature
- `PUT /api/features/:id` — Update feature (including moving in the feature tree)
- `DELETE /api/features/:id` — Delete feature (may cascade to children)
- `POST /api/tenants/:tenantId/features/:featureId` — Assign / enable feature for tenant (SUPER_ADMIN only)
- `PATCH /api/tenants/:tenantId/features/:featureId` — Enable/disable assigned feature for tenant (TENANT_ADMIN + SUPER_ADMIN, only if already assigned)
- `DELETE /api/tenants/:tenantId/features/:featureId` — Disable (or unassign) feature for tenant (SUPER_ADMIN only)
- `GET /api/tenants/:tenantId/features` — Get tenant features (only assigned features)
- `GET /api/tenants/:tenantId/features/:featureCode/check` — Check if feature is enabled for tenant

## UI / Client Notes

- Feature code input is validated in the client to match backend rules (lowercase alphanumeric plus `-`/`_`).
- Tenant selector guards against empty selection to avoid calling `/api/tenants//features`.
- Super-admin sidebar now includes a dedicated "Features" page entry.
- Features are shown as a tree (nested) in the UI; parents can be expanded/collapsed to reveal child flags.
- When enabling/disabling a feature, the UI optionally offers a cascade toggle to apply the action to descendant flags as well.

## Usage Pattern

### In Code

```javascript
const featureService = require("./feature.service");

// Check if feature is enabled
if (
  await featureService.isFeatureEnabledForTenant("advanced-reporting", tenantId)
) {
  // Show advanced features
}
```

### Middleware

```javascript
const featureMiddleware = require("./feature.middleware");

router.get(
  "/advanced-endpoint",
  featureMiddleware.requireFeature("advanced-reporting"),
  handler,
);
```

## Security Considerations

- Only SUPER_ADMIN can manage features
- Feature checks are tenant-scoped
- Audit logging for feature enable/disable actions

## Performance Considerations

- Cache feature checks with short TTL
- Index on tenant_id, feature_id
- Avoid N+1 queries in feature checks
  </content>
  <parameter name="filePath">/Users/bhaskar/Product/mscan/openspec/changes/add-tenant-feature-flags/design.md
