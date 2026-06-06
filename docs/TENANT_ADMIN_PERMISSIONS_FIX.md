# Tenant Admin Permissions Fix

## Problem
Tenant admins were unable to access the rewards and credits sections from the backend despite being the administrators of their tenant.

## Root Cause

The `requirePermission` middleware in `auth.middleware.js` was only bypassing permission checks for `SUPER_ADMIN` role, while `TENANT_ADMIN` users were required to have explicit permissions in their JWT token.

**Before (auth.middleware.js:119-122):**
```javascript
// Only Super Admin bypasses permission checks
// TENANT_ADMIN must have proper permissions assigned
if (req.user.role === 'SUPER_ADMIN') {
  console.log(`✅ Permission check bypassed for ${req.user.role}`);
  return next();
}
```

This design meant that:
- ✅ `SUPER_ADMIN`: Bypassed all permission checks (global admin)
- ❌ `TENANT_ADMIN`: Required explicit permissions even though they are the tenant administrator
- ✅ `TENANT_USER`: Required granular permissions (as expected)

## Solution

Updated the `requirePermission` middleware to bypass permission checks for both `SUPER_ADMIN` and `TENANT_ADMIN` roles.

**After (auth.middleware.js:119-122):**
```javascript
// SUPER_ADMIN and TENANT_ADMIN bypass permission checks
// SUPER_ADMIN has global access, TENANT_ADMIN has full access within their tenant
if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'TENANT_ADMIN') {
  console.log(`✅ Permission check bypassed for ${req.user.role}`);
  return next();
}
```

## Rationale

**Tenant Admin Role:**
- Tenant admins are the **owners/administrators of their tenant**
- They should have **unrestricted access** to all tenant-scoped resources
- They manage their tenant users and can assign granular permissions to them
- Requiring explicit permission checks for tenant admins doesn't make sense architecturally

**Permission System Hierarchy:**
1. **SUPER_ADMIN**: Global administrator with access to all tenants and system settings
2. **TENANT_ADMIN**: Tenant administrator with full access to their tenant's resources
3. **TENANT_USER**: Regular user with customizable, granular permissions within their tenant

## What This Fixes

Tenant admins now have full access to:

### Rewards Routes (`/api/v1/rewards/*`)
- ✅ Verification app management (`create_app`, `edit_app`, `delete_app`, `view_apps`)
- ✅ Coupon management (`create_coupon`, `edit_coupon`, `view_coupons`)
- ✅ Batch operations (`create_batch`, `edit_batch`, `delete_batch`)
- ✅ Scan history and analytics (`view_scans`, `view_analytics`)

### Credits Routes (`/api/v1/user-credits/*`)
- ✅ Credit balance viewing (`view_credit_balance`)
- ✅ Credit transaction history (`view_credit_transactions`)
- ✅ Credit requests (`request_credits`)
- ✅ Credit statistics (`view_analytics`)

### Other Protected Routes
- ✅ Product management
- ✅ Template management
- ✅ User management
- ✅ All other tenant-scoped resources

## Impact

**No Migration Required:** This is a code-only fix that takes effect immediately.

**Security:**
- Tenant admins are already isolated by tenant context (via `tenant_id`)
- The `requireTenant` middleware ensures tenant admins can only access their own tenant's data
- This change aligns with the principle that tenant admins are the owners of their tenant

**Backward Compatibility:**
- Existing tenant users (non-admin) continue to use granular permissions
- Super admins continue to have global access
- No changes to permission definitions or database schema

## Files Modified

1. `mscan-server/src/middleware/auth.middleware.js` (lines 119-122)

## Testing

Tenant admins can now:
1. Log in to their tenant subdomain
2. Access all sections including Rewards and Credits
3. Perform all CRUD operations without permission denied errors
4. Manage their tenant users and assign them granular permissions

## Related Code

The `getPermissionsByRole` function in `auth.controller.js` (lines 310-368) already defined all necessary permissions for TENANT_ADMIN, but these weren't being used effectively due to the middleware restriction. While these permissions are still encoded in the JWT for consistency, the middleware now bypasses the check for tenant admins.
