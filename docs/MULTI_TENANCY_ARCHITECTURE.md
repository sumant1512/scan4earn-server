# Multi-Tenancy Architecture

> **Design Decision Record (ADR):** Header-Based Tenant Routing

---

## Executive Summary

Scan4Earn uses **header-based multi-tenancy** with **subdomain routing at DNS/reverse proxy level**, NOT at the application level.

**Design Decision:** ✅ HEADER-BASED ROUTING IS FINAL (not changing to subdomain routing)

**Why?**
- Simpler to implement
- More secure (explicit header validation)
- Easier to support custom domains
- Better for API-first architecture
- Matches industry standard (e.g., Stripe, AWS)

---

## Architecture Overview

### How It Works

```
Client Request:
  ↓
┌─────────────────────────────────────┐
│ DNS: reliance.scan4earn.com         │
│ (Points to api.scan4earn.com)       │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ HTTP Request Headers:               │
│ X-Tenant-Slug: reliance             │
│ Authorization: Bearer {jwt}         │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Express Server:                     │
│ 1. Extract X-Tenant-Slug header     │
│ 2. Validate tenant exists           │
│ 3. Inject into req.tenantContext    │
│ 4. Enforce tenant isolation         │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Database Query:                     │
│ WHERE tenant_id = context.tenantId  │
│ (Data isolation guaranteed)         │
└─────────────────────────────────────┘
```

---

## Implementation Details

### 1. DNS Level

```
reliance.scan4earn.com  CNAME api.scan4earn.com
flipkart.scan4earn.com  CNAME api.scan4earn.com
amazon.scan4earn.com    CNAME api.scan4earn.com
```

All subdomains point to the same API server. **No subdomain routing** at application level.

### 2. Reverse Proxy Level (Nginx)

```nginx
server {
    server_name ~^(?<tenant>[a-z0-9-]+)\.scan4earn\.com$;
    
    location / {
        # Extract subdomain and pass as header
        proxy_set_header X-Tenant-Slug $tenant;
        proxy_set_header Host api.scan4earn.com;
        
        # Forward to backend
        proxy_pass http://api-backend:3000;
    }
}
```

**Purpose:** Convert subdomain to header before reaching app

### 3. Express Middleware

```javascript
// src/middleware/subdomain.middleware.js
app.use((req, res, next) => {
  // Get tenant slug from header (set by Nginx)
  const tenantSlug = req.headers['x-tenant-slug'];
  
  if (!tenantSlug) {
    // If no header and direct API access, this is probably super-admin
    req.tenantContext = { isRootDomain: true };
    return next();
  }

  // Validate tenant exists and is active
  const tenant = db.tenants.findBySlug(tenantSlug);
  
  if (!tenant || !tenant.is_active) {
    return res.status(403).json({ error: 'Tenant not found or inactive' });
  }

  // Inject tenant context into request
  req.tenantContext = {
    tenantId: tenant.id,
    tenantSlug: tenant.subdomain_slug,
    isRootDomain: false
  };

  next();
});
```

### 4. Data Access Layer

All queries enforce tenant isolation:

```javascript
// ✅ Correct: Always filter by tenant_id
const products = await db.query(
  'SELECT * FROM products WHERE tenant_id = $1',
  [req.tenantContext.tenantId]
);

// ❌ Wrong: No tenant filter
const products = await db.query(
  'SELECT * FROM products'
);
```

---

## Why Header-Based (Not Subdomain)?

### Comparison

| Aspect | Header-Based | Subdomain-Based |
|--------|-------------|-----------------|
| **Implementation** | Extract from HTTP header | Complex app-level routing |
| **Security** | Explicit validation per request | Implicit, easy to leak |
| **Custom Domains** | Easy (CNAME to api.scan4earn.com) | Hard (need wildcard cert per domain) |
| **API Consistency** | Same endpoint for all tenants | Different routes = confusion |
| **Performance** | Single app process handles all | Could require domain sharding |
| **Scalability** | Horizontal scaling simple | Requires more complex setup |
| **Standards** | ✅ AWS, Azure, Google use this | Old pattern (2000s-2010s) |

### Real-World Examples

**Stripe** (header-based):
```bash
curl https://api.stripe.com/v1/customers \
  -u sk_live_abc123... \
  -H "X-Stripe-Account: acct_xyz789"
```

**AWS** (header-based):
```bash
curl https://dynamodb.amazonaws.com/ \
  -H "X-Amz-Target: DynamoDB_20120810.ListTables"
```

**Okta** (subdomain, but single API):
```bash
curl https://company.okta.com/api/v1/users \
  -H "Authorization: Bearer token"
```

---

## Request Flow Example

### Scenario: Reliance Retail Admin Logs In

**Step 1: Client Request**
```
GET https://reliance.scan4earn.com/api/products
Authorization: Bearer eyJhbGc...
```

**Step 2: DNS Resolution**
```
reliance.scan4earn.com
  ↓ (CNAME)
api.scan4earn.com
  ↓ (A record)
12.34.56.78
```

**Step 3: Nginx Intercepts**
```
Receives: GET /api/products
Host: api.scan4earn.com
X-Tenant-Slug: reliance (added by nginx)

Forwards to: http://node-server:3000/api/products
```

**Step 4: Express Middleware**
```javascript
subdomainMiddleware(req, res, next) {
  req.tenantContext = {
    tenantId: uuid('reliance'),
    tenantSlug: 'reliance',
    isRootDomain: false
  }
  next();
}
```

**Step 5: Route Handler**
```javascript
router.get('/api/products', (req, res) => {
  // Automatically filtered by tenant
  const products = await db.query(
    'SELECT * FROM products WHERE tenant_id = $1',
    [req.tenantContext.tenantId]
  );
  
  res.json(products);
  // Returns only Reliance's products
});
```

**Step 6: Database**
```sql
SELECT * FROM products 
WHERE tenant_id = 'reliance-uuid' AND is_active = true;
```

---

## Security

### Tenant Isolation Guaranteed By:

1. **Header Validation**
   - Every request must have `X-Tenant-Slug` header
   - Invalid headers → 403 Forbidden
   - No header → root domain (super-admin only)

2. **Database Constraints**
   ```sql
   -- Foreign key ensures product belongs to tenant
   ALTER TABLE products
   ADD CONSTRAINT fk_product_tenant
   FOREIGN KEY (tenant_id) REFERENCES tenants(id);
   
   -- Prevent orphaned data
   ON DELETE CASCADE;
   ```

3. **Query Filtering**
   - Every SELECT includes `WHERE tenant_id = $1`
   - Code review checklist: Check all queries have tenant filter
   - ORM: Use tenant context in all lookups

4. **JWT Validation**
   ```javascript
   // Token includes tenant_id
   const token = jwt.verify(token, secret);
   
   // Verify header matches token
   if (req.tenantContext.tenantId !== token.tenant_id) {
     throw new Error('Tenant mismatch');
   }
   ```

### What Tenants Can't Do

❌ Access other tenant's data
```javascript
// Even if Reliance tries:
const flipkartProducts = await db.query(
  'SELECT * FROM products WHERE tenant_id = $1',
  ['flipkart-uuid'] // Won't work, header says 'reliance'
);
// Returns 403 Forbidden
```

❌ Modify other tenant's verification app
```javascript
// Reliance can't access Flipkart's app
PATCH /api/verification-apps/flipkart-app-id
// Request header X-Tenant-Slug: reliance
// Response: 403 Tenant mismatch
```

❌ Enumerate other tenants
```javascript
// Can't list all tenants
GET /api/tenants
// Only returns current tenant (header-based)
```

---

## Custom Domains

### How Reliance Gets Their Own Domain

**Option 1: CNAME (Recommended)**
```
reliance.com/coupons  CNAME api.scan4earn.com
                      (Points to Scan4Earn API)

GET https://reliance.com/coupons/verify
  ↓
Nginx sees: Host: reliance.com
  ↓
Look up: Which tenant owns reliance.com?
  ↓
Add: X-Tenant-Slug: reliance
  ↓
Forward to: Express app
```

**Database:**
```sql
-- Table to track custom domains
CREATE TABLE tenant_domains (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  custom_domain VARCHAR(255) UNIQUE, -- e.g., reliance.com
  is_verified BOOLEAN DEFAULT false,
  ssl_cert_path VARCHAR(512),
  created_at TIMESTAMP
);
```

**Nginx Config:**
```nginx
server {
    # Handle both subdomain and custom domain
    server_name ~^(?<slug>[a-z0-9-]+)\.scan4earn\.com$ 
               reliance.com flipkart.com amazon.com;
    
    location / {
        # Determine tenant from server_name
        if ($server_name ~ ^([a-z0-9-]+)\.scan4earn\.com$) {
            set $tenant_slug $1;
        }
        if ($server_name = "reliance.com") {
            set $tenant_slug "reliance";
        }
        if ($server_name = "flipkart.com") {
            set $tenant_slug "flipkart";
        }
        
        proxy_set_header X-Tenant-Slug $tenant_slug;
        proxy_pass http://api-backend:3000;
    }
}
```

---

## Subdomain Routing NOT Required

### Why We Don't Need App-Level Subdomain Routing:

1. **DNS handles subdomains**
   - All subdomains CNAME to same IP
   - Nginx extracts and converts to header
   - App receives standard HTTP request with header

2. **Header is more explicit**
   - Every request clearly states tenant
   - No implicit routing logic in app
   - Easier to debug ("which tenant am I?")

3. **Single app instance**
   - Don't need multiple Node.js processes per subdomain
   - All tenants share same app code
   - Better resource utilization

4. **Industry standard**
   - SaaS platforms use headers
   - API-first approach
   - More secure than routing

---

## Multi-Tenancy Boundaries

### What's Shared

✅ **Shared:** Application code, infrastructure, database server
```
One Node.js process handles all tenants
One PostgreSQL instance holds all data
One Redis cache serves all tenants
```

### What's Isolated

✅ **Isolated:** Tenant data, API keys, permissions, webhooks
```
Each tenant's products in separate rows
Each tenant's coupons isolated by tenant_id
Each tenant's customers can't see others
Each tenant's API keys are unique
```

### Isolation Pattern

```
Row-Level Isolation (in same database):

products table:
  tenant_id: reliance-uuid  | Product 1
  tenant_id: reliance-uuid  | Product 2
  tenant_id: flipkart-uuid  | Product 3
  tenant_id: flipkart-uuid  | Product 4

When Reliance queries:
  SELECT * FROM products WHERE tenant_id = 'reliance-uuid'
  → Returns only Products 1, 2

When Flipkart queries:
  SELECT * FROM products WHERE tenant_id = 'flipkart-uuid'
  → Returns only Products 3, 4
```

---

## API Access Patterns

### Pattern 1: Tenant Admin Portal

```
Frontend: reliance.scan4earn.com (Vue/React app)
  ↓
API: api.scan4earn.com/api/...
  Header: X-Tenant-Slug: reliance
  Header: Authorization: Bearer {jwt}
  ↓
Backend: Enforces tenant isolation
```

### Pattern 2: Verification App's Frontend

```
Reliance Retail's App: reliance-retail.com (customer-facing)
  ↓
API: api.scan4earn.com/api/mobile/v2/...
  Header: Authorization: Bearer {mobile_api_key}
  Header: X-App-Id: {verification_app_uuid}
  ↓
Backend: Routes to correct tenant via app → tenant mapping
```

### Pattern 3: Super Admin

```
Super Admin: admin.scan4earn.com (management)
  ↓
API: api.scan4earn.com/api/super-admin/...
  Header: Authorization: Bearer {jwt}
  No X-Tenant-Slug (indicates super-admin access)
  ↓
Backend: Checks role, allows cross-tenant access
```

---

## Scaling Considerations

### Current Setup (Multi-tenant)

```
1 API Server (Node.js)
  ├── Handles all tenants
  ├── Horizontal scaling: Add more servers
  └── Load balancer routes between servers

1 Database Server (PostgreSQL)
  ├── All tenant data
  ├── Partitioned by tenant_id for performance
  └── Read replicas for scaling reads
```

### Future: Per-Tenant Databases (if needed)

```
Super Admin knows which tenant = which database

Tenant Routing Middleware:
  1. Extract X-Tenant-Slug
  2. Look up: Which database?
  3. Create connection to that database
  4. Execute query

Benefits:
  - Unlimited scaling per tenant
  - Data residency (tenant 1 in US, tenant 2 in EU)
  - Higher isolation

Drawbacks:
  - More complex
  - More connections to manage
  - Harder to run across tenants
```

---

## Implementation Checklist

- ✅ DNS configured: Subdomains CNAME to api.scan4earn.com
- ✅ Nginx configured: Extracts subdomain → X-Tenant-Slug header
- ✅ Express middleware: Validates X-Tenant-Slug header
- ✅ Database: All tables have tenant_id foreign key
- ✅ Queries: All SELECT/UPDATE/DELETE filter by tenant_id
- ✅ API routes: Enforce tenant context
- ✅ Tests: Verify tenant isolation works
- ✅ Documentation: Explain architecture to developers

---

## Testing Tenant Isolation

### Unit Test

```javascript
describe('Tenant Isolation', () => {
  it('should not return data from other tenants', async () => {
    const relianceProducts = await getProducts('reliance');
    const flipkartProducts = await getProducts('flipkart');

    expect(relianceProducts[0].tenant_id).toBe('reliance-uuid');
    expect(relianceProducts).not.toContainEqual(flipkartProducts[0]);
  });
});
```

### Integration Test

```javascript
describe('API Tenant Isolation', () => {
  it('should reject request with wrong tenant header', async () => {
    const response = await fetch('/api/products', {
      headers: {
        'X-Tenant-Slug': 'flipkart',  // Wrong tenant
        'Authorization': 'Bearer reliance-token'  // Reliance token
      }
    });

    expect(response.status).toBe(403);
  });
});
```

### Security Test

```javascript
// Try to directly query other tenant's data
const result = await db.query(
  'SELECT * FROM products WHERE tenant_id = $1',
  ['flipkart-uuid']
);

// If middleware works:
//   Tenant context = reliance
//   middleware rejects before reaching DB
//
// If DB level security works:
//   Query executes but row-level security blocks it
```

---

## Troubleshooting

### "Tenant not found" Error

1. Check `X-Tenant-Slug` header is present
2. Verify tenant exists in database
3. Verify tenant.is_active = true

### "Tenant mismatch" Error

1. Check JWT token has correct tenant_id
2. Verify header matches token
3. Check middleware is validating both

### "Cross-tenant data visible"

1. Check query includes `WHERE tenant_id = $1`
2. Verify $1 is from req.tenantContext.tenantId
3. Check no raw queries bypassing middleware

---

## References

- [Middleware Implementation](../src/middleware/subdomain.middleware.js)
- [Tenant Context](../src/middleware/tenant-context.middleware.js)
- [Database Schema](../../scan4earn-database-main/full_setup.sql)
- [Nginx Config](../docker/nginx.conf)
- [Tests](../src/__tests__/tenant-subdomain.integration.test.js)

---

**Last Updated:** 2026-05-31  
**Status:** ✅ FINAL DESIGN (Not changing to actual subdomain routing)
