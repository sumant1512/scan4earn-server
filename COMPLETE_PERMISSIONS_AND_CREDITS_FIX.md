# Complete Permissions and Credits Fix for Tenant Admin

## Overview
This document summarizes all changes made to fix tenant admin access issues for rewards and credits sections.

## Problem Statement
Tenant admins were unable to access:
1. **Rewards routes** - Due to permission middleware blocking them
2. **Credits routes** - Due to missing tenant admin credit endpoints (403 Forbidden on `/api/credits/balance`)

## Two-Part Solution

### Part 1: Permission Middleware Fix
**Issue**: `requirePermission` middleware only bypassed checks for SUPER_ADMIN, forcing TENANT_ADMIN to have explicit permissions.

**Solution**: Updated middleware to bypass permission checks for both SUPER_ADMIN and TENANT_ADMIN.

**File**: `mscan-server/src/middleware/auth.middleware.js` (line 119)

**Change**:
```javascript
// Before
if (req.user.role === 'SUPER_ADMIN') {
  return next();
}

// After
if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'TENANT_ADMIN') {
  return next();
}
```

**Impact**: Tenant admins now have unrestricted access to all tenant-scoped resources including rewards (coupons, apps, scans).

### Part 2: Credit Routes Implementation
**Issue**: `/api/credits/*` routes only existed for super admins. No tenant admin routes for credit balance, requests, or transactions.

**Solution**: Created complete tenant admin credit management system with role-based routing.

## New Files Created

### 1. Tenant Admin Credit Controller
**File**: `mscan-server/src/modules/tenant-admin/controllers/credit.controller.js`

**Methods**:
```javascript
getBalance()         // GET /api/credits/balance
createRequest()      // POST /api/credits/request
getRequests()        // GET /api/credits/requests
getTransactions()    // GET /api/credits/transactions
```

**Features**:
- Automatic filtering by tenant_id
- Proper error handling
- Validation of request data
- Pagination support

### 2. Tenant Admin Credit Routes
**File**: `mscan-server/src/modules/tenant-admin/routes/credit.routes.js`

**Middleware Stack**:
- `authenticate` - JWT verification
- `requireTenant` - Validates tenant context
- `requestValidator` - Request format validation
- `preventDuplicates` - Prevents duplicate submissions

### 3. Unified Credits Router
**File**: `mscan-server/src/routes/credits.routes.js`

**Smart Routing Logic**:
- Detects user role from JWT
- Routes to appropriate controller
- Maintains backward compatibility
- Ensures data isolation

**Route Distribution**:

| Endpoint | Tenant Admin | Super Admin |
|----------|--------------|-------------|
| `GET /balance` | ✅ Own balance | ❌ Blocked |
| `POST /request` | ✅ Create request | ❌ Blocked |
| `GET /requests` | ✅ Own requests | ✅ All requests |
| `GET /transactions` | ✅ Own transactions | ✅ All transactions |
| `GET /balances` | ❌ Blocked | ✅ All tenants |
| `POST /approve/:id` | ❌ Blocked | ✅ Approve |
| `POST /reject/:id` | ❌ Blocked | ✅ Reject |
| `GET /transactions/:tenantId` | ❌ Blocked | ✅ Specific tenant |

## Files Modified

### 1. Server.js
**File**: `mscan-server/src/server.js` (line 141)

**Change**:
```javascript
// Before
const superAdminCreditRoutes = require('./modules/super-admin/routes/credit.routes');
app.use('/api/credits', superAdminCreditRoutes);

// After
const creditsRoutes = require('./routes/credits.routes'); // Unified router
app.use('/api/credits', creditsRoutes);
```

### 2. Tenant Admin Routes Index
**File**: `mscan-server/src/modules/tenant-admin/routes/index.js`

**Change**:
```javascript
const creditRoutes = require('./credit.routes');
router.use('/credits', creditRoutes);
```

### 3. Auth Middleware
**File**: `mscan-server/src/middleware/auth.middleware.js` (line 119)

As described in Part 1 above.

## Access Matrix

### Tenant Admin Access (After Fix)

| Section | Endpoints | Status |
|---------|-----------|--------|
| **Rewards** | All coupon, app, batch, scan operations | ✅ Full Access |
| **Credits** | Balance, requests, transactions | ✅ Full Access |
| **Products** | CRUD operations | ✅ Full Access |
| **Templates** | CRUD operations | ✅ Full Access |
| **Users** | Manage tenant users | ✅ Full Access |
| **Analytics** | View analytics | ✅ Full Access |

### Data Isolation

**Tenant Admin**:
- All queries automatically filtered by `tenant_id`
- Cannot access other tenants' data
- Scope: Own tenant only

**Super Admin**:
- Global access to all tenants
- Can approve/reject credit requests
- Can view all balances and transactions
- Scope: Cross-tenant

## Security Features

1. **Role-Based Access Control**
   - Tenant admins: Full access to own tenant
   - Super admins: Global access
   - Tenant users: Granular permissions

2. **Automatic Data Filtering**
   - Tenant context enforced at controller level
   - No manual filtering required
   - Prevents data leakage

3. **Middleware Protection**
   - Authentication required
   - Role validation
   - Request validation
   - Duplicate prevention

4. **Permission Hierarchy**
   ```
   SUPER_ADMIN (Global)
       ↓
   TENANT_ADMIN (Tenant Full Access)
       ↓
   TENANT_USER (Granular Permissions)
   ```

## API Endpoints Reference

### Credits - Tenant Admin

```bash
# Get credit balance
GET /api/credits/balance
Authorization: Bearer <tenant_admin_token>

# Request credits
POST /api/credits/request
Authorization: Bearer <tenant_admin_token>
{
  "requested_amount": 1000,
  "justification": "New campaign launch"
}

# View requests
GET /api/credits/requests?status=pending&page=1&limit=20
Authorization: Bearer <tenant_admin_token>

# View transactions
GET /api/credits/transactions?page=1&limit=20
Authorization: Bearer <tenant_admin_token>
```

### Credits - Super Admin

```bash
# View all requests
GET /api/credits/requests?tenant_id=<uuid>&page=1
Authorization: Bearer <super_admin_token>

# Approve request
POST /api/credits/approve/:id
Authorization: Bearer <super_admin_token>

# Reject request
POST /api/credits/reject/:id
Authorization: Bearer <super_admin_token>
{
  "rejection_reason": "Insufficient justification"
}

# View all balances
GET /api/credits/balances?page=1&limit=20
Authorization: Bearer <super_admin_token>

# View all transactions
GET /api/credits/transactions?page=1&limit=20
Authorization: Bearer <super_admin_token>

# View tenant transactions
GET /api/credits/transactions/:tenantId?page=1&limit=20
Authorization: Bearer <super_admin_token>
```

## Testing Checklist

### Tenant Admin

- [x] Can access `/api/credits/balance`
- [x] Can create credit requests
- [x] Can view own credit requests
- [x] Can view own transactions
- [x] Cannot access other tenants' data
- [x] Cannot approve/reject requests
- [x] Can access all rewards routes
- [x] Can manage coupons, apps, batches
- [x] Can view scan history

### Super Admin

- [x] Can view all credit requests
- [x] Can approve credit requests
- [x] Can reject credit requests
- [x] Can view all tenant balances
- [x] Can view all transactions
- [x] Can filter by tenant_id
- [x] Maintains global access

## Migration Required

**None** - This is a pure code fix with no database changes required.

## Deployment

1. Pull latest code
2. Restart Node.js server
3. Changes take effect immediately
4. No configuration changes needed

## Backward Compatibility

- ✅ All existing super admin routes continue to work
- ✅ Frontend credit service compatible
- ✅ No breaking changes
- ✅ Existing JWT tokens valid

## Performance Considerations

- Tenant admin queries include WHERE tenant_id filter (indexed)
- Pagination implemented for all list endpoints
- Minimal overhead from role-based routing
- Database query performance unchanged

## Future Enhancements

1. Add real-time credit balance updates
2. Implement credit usage analytics
3. Add bulk credit operations
4. Credit usage forecasting
5. Automated credit alerts

## Related Documentation

- `TENANT_ADMIN_PERMISSIONS_FIX.md` - Permission middleware fix details
- `CREDIT_ROUTES_FIX.md` - Credit routes implementation details
- `TEMPLATE_EDIT_PROTECTION.md` - Template editing restrictions

## Summary

The tenant admin access issues have been completely resolved with:

1. **Permission middleware updated** - Tenant admins bypass permission checks
2. **Credit routes created** - Complete tenant admin credit management system
3. **Smart routing implemented** - Role-based route distribution
4. **Data isolation enforced** - Automatic tenant filtering
5. **Backward compatibility maintained** - No breaking changes

Tenant admins now have full, unrestricted access to all their tenant's resources while maintaining proper data isolation and security.
