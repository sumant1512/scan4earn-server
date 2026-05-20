# Change: Add Tenant-Specific Feature Flags for Controlled Feature Releases

## Why

The platform currently lacks a mechanism to release new features to specific tenants on a controlled basis. All tenants receive features simultaneously, making it impossible to:

- Perform phased rollouts for testing and feedback
- Provide premium features to select tenants
- Gradually release features to avoid overwhelming support
- Roll back features for specific tenants if issues arise

## What Changes

- Create a feature flag system where features can be defined globally and enabled/disabled per tenant
- Add database tables for feature definitions and tenant-specific feature assignments
- Implement service layer to check feature availability for tenants
- Add API endpoints for SUPER_ADMIN to manage features and tenant assignments
- Integrate feature checks into existing endpoints where new features are used
- Provide UI for SUPER_ADMIN to manage feature flags per tenant

## Impact

- **Database**: Added `features` and `tenant_features` tables with migration script
- **Backend**: Complete API implementation with services, controllers, routes, and middleware
- **Frontend**: Feature management UI accessible at `/super-admin/features`
- **Documentation**: Updated API documentation with feature endpoints

## Usage Examples

### In Code

```javascript
const featureService = require("./feature.service");

if (
  await featureService.isFeatureEnabledForTenant("advanced-reporting", tenantId)
) {
  // Enable advanced features
}
```

### Middleware

```javascript
router.get(
  "/premium-endpoint",
  featureMiddleware.requireFeature("premium-feature"),
  handler,
);
```

### Frontend

````typescript
this.featuresService.checkFeatureForTenant(tenantId, 'feature-code')
    .subscribe(response => {
        if (response.data.enabled) {
            // Show feature
        }
    });
```</content>
  <parameter name="filePath">/Users/bhaskar/Product/mscan/openspec/changes/add-tenant-feature-flags/proposal.md
````
