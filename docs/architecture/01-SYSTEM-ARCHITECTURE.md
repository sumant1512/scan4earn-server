# System Architecture

## Executive Summary

Scan4Earn is a **multi-tenant, role-based loyalty and rewards platform** built on modern cloud-native architecture. It supports multiple concurrent business clients (tenants) while providing isolated, secure access for different user roles.

### Core Principles

1. **Multi-Tenancy:** Complete data isolation per tenant via subdomain + context
2. **Role-Based Access:** Different capabilities based on user role
3. **API-First Design:** RESTful APIs for all functionality
4. **Cloud Native:** Containerized, horizontally scalable
5. **Security-First:** JWT auth, API key management, rate limiting
6. **Mobile-Optimized:** Native app support with offline capabilities

## System Components

```
                    ┌─────────────────────────────┐
                    │   Client Applications       │
                    │                             │
        ┌───────────┼──────────────┬──────────────┼──────────┐
        │           │              │              │          │
    ┌───▼──┐    ┌──▼────┐    ┌───▼────┐    ┌───▼────┐  ┌──▼──┐
    │Mobile│    │Web    │    │E-Comm  │    │Partner │  │Admin│
    │ App  │    │Admin  │    │Partner │    │ Mobile │  │ UI  │
    └───┬──┘    └──┬────┘    └───┬────┘    └───┬────┘  └──┬──┘
        │          │             │             │          │
        └──────────┼─────────────┼─────────────┼──────────┘
                   │ HTTPS/REST  │             │
         ┌─────────▼─────────────▼─────────────▼──────────┐
         │                                                  │
         │     Scan4Earn API Gateway (Express.js)         │
         │                                                  │
         │  ┌──────────────────────────────────────────┐  │
         │  │  Middleware Layer                        │  │
         │  │  • CORS & Security Headers               │  │
         │  │  • Authentication (JWT, API Keys)        │  │
         │  │  • Subdomain Resolution (Multi-Tenancy) │  │
         │  │  • Rate Limiting                         │  │
         │  │  • Request Logging                       │  │
         │  └──────────────────────────────────────────┘  │
         │                                                  │
         │  ┌──────────────────────────────────────────┐  │
         │  │  Route Handlers (Controllers)            │  │
         │  │  • Auth & User Management                │  │
         │  │  • Dashboard & Analytics                 │  │
         │  │  • Tenant Management                     │  │
         │  │  • Product & Catalog                     │  │
         │  │  • Coupon & Rewards                      │  │
         │  │  • Mobile API v2                         │  │
         │  │  • E-Commerce API v1                     │  │
         │  └──────────────────────────────────────────┘  │
         │                                                  │
         │  ┌──────────────────────────────────────────┐  │
         │  │  Business Logic (Services)               │  │
         │  │  • Tenant isolation logic                │  │
         │  │  • Coupon generation & validation        │  │
         │  │  • Reward calculation                    │  │
         │  │  • Analytics & reporting                 │  │
         │  │  • Integration handlers                  │  │
         │  └──────────────────────────────────────────┘  │
         │                                                  │
         └─────────────┬───────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┬───────────────┐
         │                           │               │
    ┌────▼─────┐          ┌────────▼──┐    ┌───────▼────┐
    │PostgreSQL│          │   Cache   │    │   Logging  │
    │ Database │          │  (Redis)  │    │            │
    │          │          │ (Optional)│    │ (Cloud     │
    └──────────┘          └───────────┘    │  Logging)  │
                                           └────────────┘

    ┌────────────────────────────────┐
    │    External Services           │
    │                                │
    │ • Google Sheets (Reporting)    │
    │ • Email Service (SMTP)         │
    │ • Webhooks (Event Broadcast)   │
    │ • Google Cloud Run (Deploy)    │
    └────────────────────────────────┘
```

## Multi-Tenancy Architecture

Each tenant operates in an isolated context determined by **subdomain**:

```
┌────────────────────────────────────────────────┐
│  Request Flow: Multi-Tenant Resolution         │
├────────────────────────────────────────────────┤
│                                                 │
│  1. Request arrives: api.sumukham.scan4earn.com │
│     ↓                                           │
│  2. Subdomain extracted: "sumukham"            │
│     ↓                                           │
│  3. Tenant lookup: SELECT * FROM tenants       │
│     WHERE slug = 'sumukham'                    │
│     ↓                                           │
│  4. Tenant context attached to request         │
│     req.tenant = { id, name, slug, ... }      │
│     ↓                                           │
│  5. All queries filtered by tenant_id          │
│                                                 │
│  Result: User can only see their tenant's data │
└────────────────────────────────────────────────┘
```

### Tenant Isolation Strategy

- **Database Level:** `tenant_id` column on all tables
- **Query Level:** Every SELECT/UPDATE/DELETE includes `tenant_id` filter
- **Application Level:** `req.tenant` context passed through middleware
- **API Level:** Requests to different subdomains use different databases logically

## User Roles & Permissions

### 1. Super Admin
**Access:** Full system control across all tenants
- Tenant management (create, update, delete)
- Global analytics and reporting
- System settings and configuration
- User management across tenants

```javascript
// Routes: /api/tenants/*
// Auth: JWT with role='SUPER_ADMIN'
// Context: No tenant restriction
```

### 2. Tenant Admin
**Access:** Full control within their tenant
- Product catalog management
- Campaign creation and management
- Dashboard and analytics
- Staff and permission management
- API key generation for integrations
- Reward configuration

```javascript
// Routes: /api/* (tenant-scoped via subdomain)
// Auth: JWT with role='TENANT_ADMIN'
// Context: req.tenant provides isolation
// Header: X-Tenant-Slug: tenant_subdomain
```

### 3. Customer
**Access:** Personal account and rewards
- Scan QR codes for coupons
- View earned rewards and points
- Redeem rewards/cashback
- View transaction history
- Update profile

```javascript
// Routes: /api/mobile/v1/* and /api/mobile/v2/*
// Auth: JWT with role='CUSTOMER'
// Headers: X-App-Id, X-Tenant-Slug
```

### 4. Dealer
**Access:** Multi-tenant scan capability
- Scan QR codes on behalf of customers
- Earn dealer commissions
- View dealer dashboard
- Manage sales transactions

```javascript
// Routes: /api/mobile/v1/dealer/*
// Auth: JWT with role='DEALER'
// Context: May have access to multiple apps via X-App-Id
```

### 5. Partner/External App
**Access:** Limited read access for e-commerce integration
- Read product catalog
- Create coupons/rewards
- Verify customer actions
- Send transaction data

```javascript
// Routes: /api/mobile/v2/* and /api/ecommerce/v1/*
// Auth: API Key (mobile_api_key + app_id)
// No JWT required
```

## Authentication Flows

### Login Flow (JWT)

```
User submits credentials
↓
POST /api/auth/login { phone, password }
↓
Validate credentials against users table
↓
Check password hash (bcrypt)
↓
Fetch user role and permissions
↓
Generate JWT tokens:
  - access_token (15 min expiry)
  - refresh_token (7 day expiry)
↓
Return tokens to client
↓
Client stores in secure storage
↓
All future requests include: Authorization: Bearer {access_token}
```

### Mobile App API Authentication

```
Two-Factor Authentication:

Factor 1: X-App-Id (UUID)
Factor 2: Authorization: Bearer {mobile_api_key}

Request validation:
1. Extract X-App-Id from header
2. Verify app exists in verification_apps table
3. Extract mobile_api_key from Authorization header
4. Hash the key and match against database
5. Check key expiration status
6. Allow/Deny request

Keys expire every 90 days (configurable)
Grace period: 14 days (warning if near expiry)
```

### E-Commerce Partner Authentication

```
API Key Format:
  - Header: Authorization: Bearer {api_key}
  - Header: X-App-Id: {application_id}

Validation:
1. Extract both headers
2. Find verification app by id
3. Hash incoming key and compare
4. Check rate limits per app
5. Log usage for audit trail
```

## Data Models

### Core Entities

```
Tenants
  ├── Users (SUPER_ADMIN, TENANT_ADMIN)
  ├── Verification Apps
  │   ├── Mobile App Instances
  │   └── API Keys
  ├── Products
  ├── Categories
  ├── Coupons
  │   ├── Rewards
  │   └── Transactions
  └── Campaigns

Customers
  ├── Profile
  ├── Rewards Balance
  ├── Redemption Requests
  └── Transaction History

Dealers
  ├── Profile
  ├── Commission Balance
  └── Scan History
```

### Key Tables

**Users**
```sql
id, email, phone_e164, password_hash, role, tenant_id, 
permissions, created_at, updated_at
```

**Tenants**
```sql
id, name, slug, domain, plan, settings, 
created_at, updated_at
```

**Verification Apps**
```sql
id, tenant_id, name, type, mobile_api_key, api_key_expiry,
settings, created_at, updated_at
```

**Coupons**
```sql
id, tenant_id, coupon_code, status, reward_type, 
reward_value, expiry_date, scanned_by, created_at
```

**Customers**
```sql
id, tenant_id, phone_e164, name, points_balance, 
created_at, updated_at
```

## API Versioning

### V1 (Legacy)
- Monolithic routes
- Tenant isolation via X-Tenant-Slug header
- Being phased out

### V2 (Current)
- Mobile API optimized
- Supports offline sync
- Reduced payload sizes
- Efficient filtering

### V3 (Future)
- GraphQL support (planned)
- Batch operations
- Webhooks v2

## Security Architecture

### Authentication
- **JWT:** For web/admin interfaces and mobile apps
- **API Keys:** For external integrations and webhooks
- **Multi-Factor:** X-App-Id + API Key combination

### Authorization
- Role-Based Access Control (RBAC)
- Permission-based checks
- Tenant-level isolation

### Data Protection
- Password: bcrypt with salt rounds
- API Keys: SHA-256 hashing
- Transit: HTTPS/TLS enforcement
- Storage: Encrypted sensitive fields (planned)

### Rate Limiting
- Global: 100 requests/minute per IP
- Per-API-Key: 1000 requests/minute
- Burst protection: 10 requests/second

### Audit Logging
- User login/logout
- API key generation/rotation
- Data modifications
- Permission changes

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│      Client Layer (Browser/Mobile)      │
└────────────────────┬────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────┐
│    Cloud Load Balancer (Google Cloud)   │
└────────────────────┬────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    ┌───────────┬───────────┬───────────┐
    │ Cloud Run │ Cloud Run │ Cloud Run │
    │ Instance1 │ Instance2 │ Instance3 │
    │           │           │           │
    │ Node.js   │ Node.js   │ Node.js   │
    │ Express   │ Express   │ Express   │
    └───────────┴───────────┴───────────┘
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Cloud SQL (PostgreSQL)│
        │  (Managed Database)    │
        └────────────────────────┘
```

**Benefits:**
- Automatic scaling
- Zero downtime deployments
- Built-in monitoring
- Managed backups
- DDoS protection

## Performance Optimization

1. **Database Indexing**
   - Indexes on frequently queried columns (tenant_id, user_id, coupon_code)
   - Composite indexes for multi-column filters
   - Regular ANALYZE for query optimization

2. **Caching Strategy** (Optional Redis)
   - Product catalog caching
   - User session caching
   - API key validation caching
   - TTL: 5-60 minutes based on data type

3. **Query Optimization**
   - N+1 query elimination
   - Batch operations where possible
   - Pagination on large datasets (default 20 items)
   - SELECT only needed columns

4. **Request Optimization**
   - Gzip compression
   - JSON minification
   - Payload size limits
   - Connection pooling (20 connections per tenant)

## Monitoring & Observability

### Metrics
- Request count and latency
- Database query performance
- Error rates by endpoint
- User activity metrics

### Logging
- Cloud Logging integration
- Structured JSON logs
- Log levels: DEBUG, INFO, WARN, ERROR
- Request ID tracking for debugging

### Health Checks
- `/health` endpoint returns database status
- Automatic retry on connection failure
- Cloud Run readiness probes

## Scalability Considerations

### Horizontal Scaling
- Stateless application design
- Database connection pooling
- Load balancer distribution
- No session affinity required

### Vertical Scaling
- Node.js memory optimization
- Efficient query execution
- Response size optimization

### Data Growth
- Partition large tables (coupons, transactions)
- Archive old data (retention policy: 2 years)
- Cleanup temporary data regularly

## Error Handling & Recovery

```javascript
// Global error handler with standardized format
{
  status: false | true,
  message: "Human readable message",
  code: "ERROR_CODE",
  timestamp: "ISO timestamp",
  requestId: "Unique request ID"
}
```

**Error Levels:**
- 400: Bad Request (validation error)
- 401: Unauthorized (auth failure)
- 403: Forbidden (permission denied)
- 404: Not Found
- 429: Rate Limited
- 500: Internal Server Error
- 503: Service Unavailable

## Next Steps

- [Data Models](02-DATA-MODELS.md) - Detailed schema
- [Authentication & Security](03-AUTHENTICATION-SECURITY.md) - Auth flows
- [Multi-Tenancy Design](04-MULTI-TENANCY.md) - Tenant isolation
- [API Overview](../api/01-API-OVERVIEW.md) - All endpoints
