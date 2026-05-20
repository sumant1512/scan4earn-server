# Credit Routes Fix - Tenant Admin Access

## Problem
Tenant admins were getting **403 Forbidden** errors when accessing credit endpoints like `/api/credits/balance` because:

1. The `/api/credits/*` routes were only configured for Super Admin access
2. No tenant admin credit routes existed for balance viewing and transaction history
3. Frontend was calling `/api/credits/balance` which didn't exist for tenant admins

## Root Cause Analysis

### Route Mapping Issue
- **Server.js (line 141)**: `/api/credits` was mapped to `superAdminCreditRoutes` only
- **Super Admin Routes**: Had `requireSuperAdmin` middleware blocking all non-super-admin access
- **Missing Routes**: No tenant admin routes for credit balance and transactions

### Frontend Expectations
The frontend `CreditService` (line 44) calls:
- `GET /api/credits/balance` - Get tenant's credit balance
- `POST /api/credits/request` - Create credit request
- `GET /api/credits/requests` - View credit requests
- `GET /api/credits/transactions` - View transactions

## Solution Implemented

### 1. Created Tenant Admin Credit Controller
**File**: `mscan-server/src/modules/tenant-admin/controllers/credit.controller.js`

**Methods**:
- `getBalance()` - Get tenant's credit balance
- `createRequest()` - Create a credit top-up request
- `getRequests()` - Get tenant's credit requests (filtered by tenant_id)
- `getTransactions()` - Get tenant's transaction history (filtered by tenant_id)

**Key Features**:
- All methods automatically filter by `req.user.tenant_id`
- Validates tenant context before processing
- Returns proper error codes and messages

### 2. Created Tenant Admin Credit Routes
**File**: `mscan-server/src/modules/tenant-admin/routes/credit.routes.js`

**Routes**:
- `GET /balance` - View credit balance
- `POST /request` - Request credits
- `GET /requests` - View requests
- `GET /transactions` - View transactions

**Middleware**:
- `authenticate` - Verify JWT token
- `requireTenant` - Block super admins, require tenant_id
- `requestValidator` - Validate request format
- `preventDuplicates` - Prevent duplicate submissions

### 3. Created Unified Credits Router
**File**: `mscan-server/src/routes/credits.routes.js`

This router intelligently routes requests based on user role:

**Tenant Admin Routes** (TENANT_ADMIN, TENANT_USER):
- `GET /balance` → Tenant admin controller
- `POST /request` → Tenant admin controller
- `GET /requests` → Tenant admin controller (filtered by tenant)
- `GET /transactions` → Tenant admin controller (filtered by tenant)

**Super Admin Routes** (SUPER_ADMIN):
- `GET /requests` → Super admin controller (all tenants)
- `GET /transactions` → Super admin controller (all tenants)
- `GET /balances` → View all tenant balances
- `GET /transactions/:tenantId` → Specific tenant transactions
- `POST /approve/:id` → Approve credit request
- `POST /reject/:id` → Reject credit request

**Smart Routing**:
- `/requests` and `/transactions` route to different controllers based on role
- Ensures proper data isolation between super admin (all tenants) and tenant admin (own tenant)

### 4. Updated Server.js
**File**: `mscan-server/src/server.js` (line 141)

**Before**:
```javascript
const superAdminCreditRoutes = require('./modules/super-admin/routes/credit.routes');
app.use('/api/credits', superAdminCreditRoutes);
```

**After**:
```javascript
const creditsRoutes = require('./routes/credits.routes'); // Unified credits router
app.use('/api/credits', creditsRoutes);
```

### 5. Updated Tenant Admin Routes Index
**File**: `mscan-server/src/modules/tenant-admin/routes/index.js`

Added credit routes to tenant admin module exports for consistency.

## API Endpoints Summary

### Tenant Admin Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/credits/balance` | Get own tenant's balance | TENANT_ADMIN |
| POST | `/api/credits/request` | Request credit top-up | TENANT_ADMIN |
| GET | `/api/credits/requests` | View own requests | TENANT_ADMIN |
| GET | `/api/credits/transactions` | View own transactions | TENANT_ADMIN |

### Super Admin Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/credits/requests` | View all requests | SUPER_ADMIN |
| POST | `/api/credits/approve/:id` | Approve request | SUPER_ADMIN |
| POST | `/api/credits/reject/:id` | Reject request | SUPER_ADMIN |
| GET | `/api/credits/balances` | View all balances | SUPER_ADMIN |
| GET | `/api/credits/transactions` | View all transactions | SUPER_ADMIN |
| GET | `/api/credits/transactions/:tenantId` | View tenant transactions | SUPER_ADMIN |

## Data Isolation

### Tenant Admin
- **Automatic Filtering**: All queries filtered by `req.user.tenant_id`
- **Cannot Access**: Other tenants' data
- **Scope**: Own tenant only

### Super Admin
- **Global Access**: Can view all tenants' data
- **Optional Filtering**: Can filter by tenant_id query parameter
- **Scope**: Cross-tenant

## Security Enhancements

1. **Role-Based Access Control**
   - Tenant admins blocked from super admin endpoints
   - Super admins blocked from tenant-specific endpoints (by design)

2. **Data Isolation**
   - Tenant admins automatically scoped to their tenant
   - No way to access other tenants' data

3. **Middleware Protection**
   - `requireTenant` - Validates tenant context
   - `requireSuperAdmin` - Validates super admin role
   - `tenantContextMiddleware` - Sets tenant context

4. **Duplicate Prevention**
   - Credit requests use `preventDuplicates(2000)` middleware
   - Prevents accidental double-submissions

## Combined with Previous Fix

This fix works together with the previous permission middleware fix:

**Previous Fix**: `TENANT_ADMIN` bypasses `requirePermission` middleware checks
**This Fix**: Provides the actual credit routes for tenant admins

Together, they ensure:
1. Tenant admins have full access to their tenant's resources
2. Proper credit management routes exist for both roles
3. Data is properly isolated between tenants

## Files Created

1. `mscan-server/src/modules/tenant-admin/controllers/credit.controller.js`
2. `mscan-server/src/modules/tenant-admin/routes/credit.routes.js`
3. `mscan-server/src/routes/credits.routes.js`

## Files Modified

1. `mscan-server/src/server.js` (line 141)
2. `mscan-server/src/modules/tenant-admin/routes/index.js`

## Testing

Tenant admins can now:
1. ✅ View their credit balance at `/api/credits/balance`
2. ✅ Request credit top-ups at `/api/credits/request`
3. ✅ View their credit requests at `/api/credits/requests`
4. ✅ View their transaction history at `/api/credits/transactions`

Super admins retain:
1. ✅ All tenant credit management capabilities
2. ✅ Global view of all requests and balances
3. ✅ Credit approval/rejection functionality

## Migration Required

**None** - This is a pure code addition with no database changes.

The fix is backward compatible and takes effect immediately upon server restart.
