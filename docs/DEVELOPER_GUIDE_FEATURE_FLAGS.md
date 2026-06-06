# Developer Guide: Using Feature Flags

## Overview

The MScan feature flag system allows controlled rollout of new features to specific tenants. Features are defined globally by super administrators and can be enabled/disabled per tenant, enabling phased rollouts, premium features, and controlled access to new functionality.

## Key Concepts

- **Feature**: A globally defined capability with a unique code, name, and description
- **Tenant Feature**: The assignment of a feature to a specific tenant (enabled/disabled)
- **Feature Code**: A unique identifier for features (e.g., `advanced-reporting`, `bulk-operations`)
- **Default Enabled**: Whether new tenants automatically get access to the feature

## Backend Usage

### Checking Feature Status

Use the `featureService.isFeatureEnabledForTenant()` function to check if a feature is enabled:

```javascript
const featureService = require("../services/feature.service");

// Check if advanced reporting is enabled for a tenant
const isEnabled = await featureService.isFeatureEnabledForTenant(
  "advanced-reporting",
  tenantId,
);

if (isEnabled) {
  // Show advanced reporting features
  return await generateAdvancedReport(data);
} else {
  // Fall back to basic reporting
  return await generateBasicReport(data);
}
```

### Using Feature Middleware

Apply feature gating to routes using the feature middleware:

```javascript
const {
  requireFeature,
  checkFeature,
  requireAnyFeature,
  requireAllFeatures,
} = require("../middleware/feature.middleware");

// Block access unless feature is enabled
router.get(
  "/advanced-reports",
  requireFeature("advanced-reporting"),
  reportController.getAdvancedReports,
);

// Check feature status without blocking (adds to req.features)
router.get(
  "/dashboard",
  checkFeature("advanced-reporting"),
  dashboardController.getDashboard,
);

// Require any of multiple features
router.post(
  "/bulk-operations",
  requireAnyFeature(["bulk-import", "bulk-export"]),
  bulkController.performBulkOperation,
);

// Require all specified features
router.get(
  "/premium-analytics",
  requireAllFeatures(["advanced-reporting", "real-time-data"]),
  analyticsController.getPremiumAnalytics,
);
```

### Available Middleware Functions

- `requireFeature(featureCode, options)` - Blocks request if feature not enabled
- `checkFeature(featureCode)` - Checks feature status and adds to `req.features` without blocking
- `requireAnyFeature(featureCodes, options)` - Requires at least one of the listed features
- `requireAllFeatures(featureCodes, options)` - Requires all listed features to be enabled

### Custom Error Messages

```javascript
router.get(
  "/premium-feature",
  requireFeature("premium-feature", {
    errorMessage:
      "This premium feature requires a subscription upgrade. Contact your administrator.",
  }),
  premiumController.getPremiumFeature,
);
```

### Getting Tenant Features

Retrieve all features for a tenant:

```javascript
const tenantFeatures = await featureService.getTenantFeatures(tenantId);
// Returns array of features with enabled_for_tenant status
```

## Frontend Usage

### Angular Service

Use the `FeaturesService` to interact with feature flags:

```typescript
import { FeaturesService } from './services/features.service';

constructor(private featuresService: FeaturesService) {}

// Check feature status
async checkFeature(featureCode: string): Promise<boolean> {
  try {
    const response = await this.featuresService.checkFeatureStatus(this.tenantId, featureCode).toPromise();
    return response?.data?.enabled || false;
  } catch (error) {
    return false; // Default to disabled on error
  }
}

// Get all tenant features
async getTenantFeatures(tenantId: string): Promise<TenantFeature[]> {
  const response = await this.featuresService.getTenantFeatures(tenantId).toPromise();
  return response?.data?.features || [];
}
```

### Component Example

```typescript
import { Component, OnInit } from "@angular/core";
import { FeaturesService } from "../../services/features.service";

@Component({
  selector: "app-reports",
  template: `
    <div class="reports">
      <h2>Reports</h2>

      <!-- Always visible basic report -->
      <button (click)="generateBasicReport()">Basic Report</button>

      <!-- Conditionally visible advanced report -->
      <button
        *ngIf="advancedReportingEnabled"
        (click)="generateAdvancedReport()"
      >
        Advanced Report
      </button>
    </div>
  `,
})
export class ReportsComponent implements OnInit {
  advancedReportingEnabled = false;

  constructor(private featuresService: FeaturesService) {}

  async ngOnInit() {
    this.advancedReportingEnabled =
      await this.checkFeature("advanced-reporting");
  }

  private async checkFeature(featureCode: string): Promise<boolean> {
    // Implementation as shown above
  }
}
```

## Best Practices

### 1. Feature Code Naming

- Use kebab-case or snake_case: `advanced-reporting`, `bulk_operations`
- Keep codes descriptive but concise
- Avoid changing codes once features are in production

### 2. Graceful Degradation

Always provide fallback behavior when features are disabled:

```javascript
// Good: Graceful degradation
if (
  await featureService.isFeatureEnabledForTenant("advanced-filtering", tenantId)
) {
  return await applyAdvancedFilters(query, advancedFilters);
} else {
  return await applyBasicFilters(query, basicFilters);
}

// Avoid: Hard failures
if (
  !(await featureService.isFeatureEnabledForTenant(
    "required-feature",
    tenantId,
  ))
) {
  throw new Error("Feature not available");
}
```

### 3. Default Behavior

- Set `default_enabled: false` for premium features
- Set `default_enabled: true` for features that should be available to all tenants
- Consider migration impact when changing defaults

### 4. Error Handling

Handle feature check failures gracefully:

```javascript
try {
  const isEnabled = await featureService.isFeatureEnabledForTenant(
    featureCode,
    tenantId,
  );
  // Use isEnabled
} catch (error) {
  // Log error but don't break functionality
  console.error("Feature check failed:", error);
  // Default to disabled or basic functionality
  const isEnabled = false;
}
```

### 5. Performance Considerations

- Cache feature status when possible to avoid repeated database calls
- Use `checkFeature` middleware for non-blocking checks
- Consider feature status in database queries to avoid unnecessary data fetching

### 6. Testing

Test both enabled and disabled states:

```javascript
// Test feature enabled
await featureService.enableFeatureForTenant(featureId, tenantId, actorId);
// Run tests...

// Test feature disabled
await featureService.disableFeatureForTenant(featureId, tenantId, actorId);
// Run tests...
```

## API Endpoints

### Super Admin Endpoints

```bash
# Create feature
POST /api/features

# List features
GET /api/features

# Update feature
PUT /api/features/:id

# Delete feature
DELETE /api/features/:id

# Enable feature for tenant
POST /api/features/tenants/:tenantId/features/:featureId

# Disable feature for tenant
DELETE /api/features/tenants/:tenantId/features/:featureId
```

### General Endpoints

```bash
# Get tenant features
GET /api/features/tenants/:tenantId/features

# Check specific feature
GET /api/features/tenants/:tenantId/features/:featureCode/check
```

## Database Schema

### Features Table

```sql
CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  default_enabled BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tenant Features Table

```sql
CREATE TABLE tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  enabled_at TIMESTAMP DEFAULT NOW(),
  enabled_by UUID REFERENCES users(id),
  UNIQUE(tenant_id, feature_id)
);
```

## Migration Strategy

When adding new features:

1. **Define the Feature**: Create feature in database or via API
2. **Update Code**: Add feature checks in relevant places
3. **Test Both States**: Verify behavior with feature enabled/disabled
4. **Gradual Rollout**: Enable for specific tenants first
5. **Monitor**: Watch for issues during rollout
6. **Full Enablement**: Enable for all tenants or set as default

## Troubleshooting

### Common Issues

1. **Feature not found**: Ensure feature code is correct and feature exists
2. **Tenant context missing**: Verify `req.user.tenant_id` is set correctly
3. **Middleware not working**: Check route order and middleware application
4. **Database errors**: Verify tenant and feature IDs are valid UUIDs

### Debugging

Enable debug logging to see feature checks:

```javascript
// Add to your route handlers
console.log("Feature status:", req.features);
console.log("Tenant ID:", req.user?.tenant_id);
```

## Examples

### Complete Route Example

```javascript
const express = require("express");
const {
  requireFeature,
  checkFeature,
} = require("../middleware/feature.middleware");
const featureService = require("../services/feature.service");

const router = express.Router();

// Public route with feature check
router.get("/reports", checkFeature("advanced-reporting"), async (req, res) => {
  const tenantId = req.user.tenant_id;
  const useAdvanced = req.features["advanced-reporting"];

  const reports = useAdvanced
    ? await generateAdvancedReports(tenantId)
    : await generateBasicReports(tenantId);

  res.json({ reports });
});

// Premium feature route
router.post(
  "/custom-reports",
  requireFeature("custom-reporting", {
    errorMessage: "Custom reporting requires premium subscription",
  }),
  reportController.createCustomReport,
);

module.exports = router;
```

### Frontend Component Example

```typescript
import { Component, OnInit } from "@angular/core";
import {
  FeaturesService,
  TenantFeature,
} from "../../services/features.service";

@Component({
  selector: "app-feature-dashboard",
  template: `
    <div class="dashboard">
      <h2>Dashboard</h2>

      <!-- Basic features always available -->
      <div class="basic-features">
        <button>Basic Report</button>
        <button>Simple Search</button>
      </div>

      <!-- Premium features -->
      <div class="premium-features" *ngIf="premiumFeatures.length > 0">
        <h3>Premium Features</h3>
        <div *ngFor="let feature of premiumFeatures">
          <button *ngIf="feature.enabled_for_tenant">
            {{ feature.name }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FeatureDashboardComponent implements OnInit {
  premiumFeatures: TenantFeature[] = [];

  constructor(private featuresService: FeaturesService) {}

  async ngOnInit() {
    try {
      const response = await this.featuresService
        .getTenantFeatures(this.tenantId)
        .toPromise();
      this.premiumFeatures = response?.data?.features || [];
    } catch (error) {
      console.error("Failed to load features:", error);
    }
  }
}
```

This guide covers the complete feature flag system implementation. For questions or issues, refer to the API documentation or contact the development team.</content>
<parameter name="filePath">/Users/bhaskar/Product/mscan/DEVELOPER_GUIDE_FEATURE_FLAGS.md
