# Architecture & Design Notes

Architectural decisions, improvements, and design patterns used in Scan4Earn.

## Core Architectural Principles

### 1. Multi-Tenancy First

Every feature is designed with multi-tenancy in mind:
- **Subdomain isolation:** Each tenant is a separate subdomain (e.g., api.sumukham.scan4earn.com)
- **Query-level filtering:** All queries automatically filtered by tenant_id
- **Request context:** Tenant context available throughout request lifecycle
- **Data isolation:** Complete logical separation between tenants

**Benefits:**
- Serves multiple businesses from single codebase
- Reduced operational overhead
- Flexible pricing per tenant
- Security through isolation

### 2. Role-Based Access Control (RBAC)

Fine-grained permission system:

```
Super Admin
├── Full system access
├── Tenant management
└── Global reporting

Tenant Admin
├── Tenant-scoped operations
├── Product & campaign management
├── Staff management
└── API key generation

Customer
├── Scan and redeem
├── View rewards
└── Personal dashboard

Dealer
├── Scan on behalf of customers
├── Commission tracking
└── Sales dashboard

External App / Partner
├── Read product catalog
├── Verify customers
├── Award rewards
└── Limited API access
```

### 3. API-First Design

Everything accessible via REST APIs:
- **No assumptions about clients:** Mobile, web, third-party all supported
- **Versioning:** Support multiple API versions simultaneously
- **Standardized responses:** Consistent error codes and formats
- **Pagination & filtering:** Built-in on list endpoints

### 4. Security Layered Approach

```
┌──────────────────────────────────────┐
│  Request                             │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│  HTTPS/TLS Encryption                │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│  Authentication (JWT or API Key)     │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│  Rate Limiting & DDoS Protection     │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│  Authorization (Role/Permissions)    │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│  Input Validation & Sanitization     │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│  Database Query (Tenant Filtered)    │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│  Audit Logging                       │
└──────────────────────────────────────┘
```

### 5. Service-Oriented Architecture

Clear separation of concerns:

```
Controllers: Handle HTTP requests/responses
     ↓
Services: Business logic and domain operations
     ↓
Repositories: Data access layer
     ↓
Database: Persistent storage
```

**Benefits:**
- Easy to test services independently
- Reusable business logic
- Clear data access patterns
- Easy to add caching/optimization

## Current Implementation Patterns

### Authentication Patterns

#### JWT-Based (Web & Mobile Users)

```javascript
// Login flow
1. POST /api/auth/login
   Body: { phone, password }
   
2. Server validates credentials
   - Query users table
   - Verify password hash
   - Check user is active
   
3. Generate tokens
   - accessToken (15 min): Short-lived, for API calls
   - refreshToken (7 days): Long-lived, for token refresh
   
4. Return tokens to client
   
5. Client includes in all requests:
   Authorization: Bearer {accessToken}

// Token refresh
6. When accessToken expires:
   POST /api/auth/refresh
   Body: { refreshToken }
   
7. Server validates refreshToken
   - Check not blacklisted
   - Check not expired
   - Generate new accessToken
   
8. Return new accessToken
```

#### API Key-Based (External Integrations)

```javascript
// Two-factor authentication:
1. X-App-Id header: Application UUID
2. Authorization header: Bearer {api_key}

// Validation
1. Extract X-App-Id from header
2. Find verification_app record
3. Extract api_key from Authorization header
4. Hash api_key using SHA-256
5. Compare with stored hash
6. Check expiration date
7. Log usage for audit trail
8. Allow/Deny request

// Benefits
- App-to-app authentication
- Audit trail of API usage
- Can be rotated without user action
- Rate limiting per app
```

### Tenant Isolation Patterns

#### Subdomain-Based Resolution

```javascript
// Middleware: Extract tenant from subdomain
const subdomainMiddleware = (req, res, next) => {
  // Extract from hostname
  const hostname = req.hostname; // e.g., "api.sumukham.scan4earn.com"
  const parts = hostname.split('.');
  
  if (parts.length >= 2) {
    const subdomain = parts[0]; // "sumukham"
    
    // Query tenant by slug
    const tenant = await db.query(
      'SELECT * FROM tenants WHERE slug = $1',
      [subdomain]
    );
    
    // Attach to request context
    req.tenant = tenant;
  }
  
  next();
};

// Result: All downstream code has req.tenant
```

#### Query Filtering

```javascript
// Every query includes tenant filter
const getProducts = async (tenantId) => {
  const result = await db.query(
    'SELECT * FROM products WHERE tenant_id = $1',
    [tenantId]
  );
  return result.rows;
};

// Usage in route
app.get('/api/products', authenticate, async (req, res) => {
  const products = await getProducts(req.tenant.id);
  res.json(products);
});
```

### Error Handling Pattern

```javascript
// Standardized error responses
{
  "status": false,
  "message": "Human-readable message",
  "code": "ERROR_CODE",
  "details": {
    // Optional additional context
  },
  "timestamp": "ISO timestamp",
  "requestId": "Unique request ID for tracing"
}

// Error codes map to HTTP status codes
400 - VALIDATION_ERROR (Bad Request)
401 - INVALID_CREDENTIALS (Unauthorized)
403 - INSUFFICIENT_PERMISSIONS (Forbidden)
404 - NOT_FOUND (Not Found)
409 - CONFLICT (Conflict)
429 - RATE_LIMIT_EXCEEDED (Too Many Requests)
500 - INTERNAL_ERROR (Server Error)
```

## Recommended Improvements

### 1. Add GraphQL Support (v3)

**Rationale:** Reduce over-fetching and under-fetching of data

**Implementation:**
- Add `@apollo/server` package
- Create GraphQL schema mirroring REST endpoints
- Support both REST and GraphQL simultaneously
- Phase out REST in v4 (if desired)

### 2. Implement Event-Driven Architecture

**Rationale:** Decouple services, enable real-time features

**Current:** Synchronous request-response

**Improved:**
```
Event Bus (Message Queue)
    ↑
    │ Publishes events
    │
┌──┴──────────────────────┐
│  Reward Service          │
│  Order Service           │
│  Notification Service    │
└──────────────────────────┘
    │
    │ Subscribes to events
    ↓
Real-time Updates (WebSocket/SSE)
Cache Invalidation
Async Notifications
```

**Benefits:**
- Better scalability
- Real-time capabilities
- Decoupled services
- Easier to add new features

### 3. Add Comprehensive Caching Layer

**Current:** Database on every request

**Improved:**
```
Request
  ↓
Check Cache (Redis)
  ├─ Hit: Return cached data
  └─ Miss: Query database
            ↓
        Cache result (TTL-based)
        ↓
    Return to client
```

**Cache-Friendly Endpoints:**
- Product catalog (invalidate on update)
- Category list (invalidate on change)
- API key validation (5-min TTL)
- User permissions (30-min TTL)

### 4. Implement Database Sharding

**Current:** Single database for all tenants

**Improved:** Shard by tenant_id for large-scale deployments

```
Tenant A ──┐
Tenant B ──┤──> Shard 1 (Database)
Tenant C ──┤
Tenant D ──┤
           │
Tenant E ──┐
Tenant F ──┤──> Shard 2 (Database)
Tenant G ──┤
Tenant H ──┤

Benefits:
- Horizontal scalability
- Reduced contention
- Per-tenant backup/restore
- Faster queries
```

### 5. Add Request Validation Schema

**Current:** Manual validation in controllers

**Improved:** Centralized schema validation
```javascript
const createProductSchema = {
  name: { type: 'string', required: true, maxLength: 100 },
  description: { type: 'string', maxLength: 500 },
  price: { type: 'number', required: true, min: 0 },
  reward_type: { enum: ['points', 'cashback', 'product'] }
};

// Automatic validation on request
router.post('/products', validateSchema(createProductSchema), createProduct);
```

### 6. Implement Request Tracing

**Current:** Basic request ID in logs

**Improved:** OpenTelemetry integration for distributed tracing

```javascript
// Trace request through:
API Gateway → Database → External Services → Response

Benefits:
- Identify slow queries
- Track cross-service calls
- Debug production issues
- Performance profiling
```

### 7. Add Feature Flags Management

**Current:** Environment variables for features

**Improved:** Dynamic feature toggles with admin control

```javascript
// Enable/disable features per tenant without restart
const features = await featureService.getFeatures(tenantId);

if (features.CASHBACK_ENABLED) {
  // Enable cashback feature
}

// Benefits:
// - A/B testing
// - Gradual rollout
// - Emergency kill switches
// - Per-tenant feature control
```

### 8. Implement Role-Based Caching

**Rationale:** Cache different data based on user role

```javascript
// Super Admin sees:
- All tenant data
- System-wide analytics

// Tenant Admin sees:
- Tenant-specific data
- Aggregated customer data

// Cache keys include role:
`products:${tenantId}:${userRole}`
```

### 9. Add Audit Trail for Sensitive Operations

**Current:** Basic logging

**Improved:** Complete audit trail of all changes

```javascript
// Log all sensitive operations
auditLog.record({
  action: 'UPDATE_CUSTOMER_POINTS',
  actor: userId,
  target: customerId,
  changes: {
    old_balance: 1000,
    new_balance: 1100,
    reason: 'Reward redemption'
  },
  timestamp: new Date(),
  ipAddress: req.ip
});
```

### 10. Implement Zero-Downtime Deployments

**Current:** Restart required for deployments

**Improved:** Blue-green deployment with health checks

```
┌─────────────────┐
│  Load Balancer  │
└────────┬────────┘
         │
    ┌────┴────┐
    ↓         ↓
┌────────┐ ┌────────┐
│ Blue   │ │ Green  │
│ (Old)  │ │ (New)  │
└────────┘ └────────┘

1. Deploy Green (New version)
2. Run smoke tests
3. Switch traffic: 0% → 100%
4. Monitor for errors
5. Keep Blue as instant rollback
```

## Data Model Improvements

### Current Schema

```sql
-- Simple structure, good for most use cases
users: id, email, phone, role, tenant_id, ...
products: id, tenant_id, name, price, ...
coupons: id, tenant_id, coupon_code, status, ...
```

### Recommended Enhancements

#### 1. Add Soft Deletes

```sql
-- Track historical data
ALTER TABLE products ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

-- Helps with:
// - GDPR compliance (grace period)
// - Audit trail
// - Accident recovery
// - Data forensics
```

#### 2. Add Change Tracking

```sql
-- Track all changes
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  table_name VARCHAR,
  record_id UUID,
  action VARCHAR (INSERT, UPDATE, DELETE),
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  changed_at TIMESTAMP
);
```

#### 3. Add Temporal Queries

```sql
-- Support "as of" queries
CREATE TABLE product_versions (
  product_id UUID,
  version_number INT,
  data JSONB,
  valid_from TIMESTAMP,
  valid_to TIMESTAMP
);

-- Query product as it was on 2026-03-15
SELECT * FROM product_versions
WHERE product_id = '...'
AND valid_from <= '2026-03-15'
AND valid_to > '2026-03-15';
```

## Performance Optimizations Implemented

1. **Connection Pooling:** Reuse database connections
2. **Indexing Strategy:** Indexes on high-cardinality columns
3. **Query Optimization:** Avoid N+1 queries
4. **Response Compression:** Gzip for large responses
5. **Rate Limiting:** Protect against abuse
6. **Pagination:** Limit result set sizes

## Security Improvements Implemented

1. **HTTPS/TLS Enforcement:** All traffic encrypted
2. **JWT Secrets:** Rotate regularly
3. **API Key Management:** Expiration and rotation
4. **Input Validation:** Prevent injection attacks
5. **CORS Configuration:** Only allow trusted origins
6. **Rate Limiting:** Prevent brute force
7. **Audit Logging:** Track all sensitive operations
8. **Password Hashing:** bcrypt with salt

## Future Roadmap

### v2.0 (Current)
- ✅ Multi-tenancy
- ✅ RBAC
- ✅ Mobile API
- ✅ E-Commerce Integration
- ✅ Dashboard
- ✅ Comprehensive documentation

### v2.1 (Next)
- [ ] Webhook v2 with retry logic
- [ ] Enhanced analytics
- [ ] Bulk operations API
- [ ] Export/Import tools

### v3.0 (Future)
- [ ] GraphQL API
- [ ] Real-time updates (WebSocket)
- [ ] Advanced analytics (ML-based)
- [ ] Subscription billing
- [ ] White-label mobile app SDK
- [ ] Event-driven architecture

---

**Last Updated:** 2026-05-31  
**Version:** 2.0
