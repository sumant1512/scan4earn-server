# Multi-Tenant Architecture

## Purpose
MScan uses a row-level multi-tenant architecture where each tenant (business) has isolated data while sharing the same database and application infrastructure.

---

## Requirements

### Requirement: Tenant Data Isolation
The system SHALL ensure complete data isolation between tenants through row-level security with `tenant_id` foreign keys.

#### Scenario: Tenant queries only own data
- **WHEN** a tenant user makes an API request
- **THEN** all database queries SHALL be automatically filtered by the tenant's `tenant_id`
- **AND** the user SHALL NOT have access to other tenants' data

#### Scenario: Cross-tenant data leakage prevention
- **WHEN** a malicious user attempts to access another tenant's data
- **THEN** the system SHALL reject the request with a 403 Forbidden error
- **AND** the security violation SHALL be logged

---

### Requirement: Subdomain Routing
The system SHALL provide unique subdomain routing for each tenant (e.g., `acme.mscan.com`).

#### Scenario: Tenant resolution by subdomain
- **WHEN** a request arrives at `acme.mscan.com`
- **THEN** the system SHALL extract the subdomain `acme`
- **AND** lookup the tenant in the database WHERE subdomain = 'acme'
- **AND** inject the tenant context into the request

#### Scenario: Reserved subdomain validation
- **WHEN** creating a new tenant with subdomain `admin`
- **THEN** the system SHALL reject the request
- **AND** return error message "Subdomain 'admin' is reserved"

---

### Requirement: JWT Token Tenant Context
The system SHALL embed tenant context in JWT tokens for authentication.

#### Scenario: JWT token contains tenant information
- **WHEN** a user successfully authenticates
- **THEN** the JWT token SHALL include `tenantId`, `subdomain`, and `userType` claims
- **AND** subsequent requests SHALL use this token for tenant resolution

---

### Requirement: Multi-Tenant Scalability
The system SHALL support at least 1000 concurrent tenants with efficient query performance.

#### Scenario: Query performance with proper indexing
- **WHEN** querying tenant-scoped data with 1000+ tenants
- **THEN** database indexes on `tenant_id` columns SHALL ensure query response time < 100ms
- **AND** connection pooling SHALL prevent database exhaustion

---

## Database Schema

**Key Tables:**
- `tenants` - Tenant accounts (id, subdomain, name, settings, created_at)
- `users` - Users with `tenant_id` foreign key
- `products` - Products with `tenant_id` foreign key
- `coupons` - Coupons with `tenant_id` foreign key

**Indexes:**
- `tenants(subdomain)` - Unique index for fast lookup
- All tenant-scoped tables have index on `tenant_id`

---

## API Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/tenants` | List all tenants | SUPER_ADMIN |
| POST | `/api/tenants` | Create tenant | SUPER_ADMIN |
| GET | `/api/tenants/:id` | Get tenant details | SUPER_ADMIN, TENANT_ADMIN (own) |
| PUT | `/api/tenants/:id` | Update tenant | SUPER_ADMIN, TENANT_ADMIN (own) |
| DELETE | `/api/tenants/:id` | Delete tenant | SUPER_ADMIN |

---

## UI Components

- `TenantListComponent` - Super Admin tenant list (src/app/components/tenant-management/)
- `TenantFormComponent` - Create/edit tenant form
- `TenantDetailComponent` - View tenant details
- `SharedHeaderComponent` - Shows current tenant branding

---

## Security Considerations

1. **Tenant ID Validation**: Every API request MUST validate tenant context
2. **Middleware Enforcement**: `subdomainMiddleware` MUST run on all tenant-scoped routes
3. **Database Constraints**: Foreign key constraints MUST prevent cross-tenant references
4. **Subdomain Uniqueness**: Database unique constraint on `tenants.subdomain`
5. **Reserved Subdomains**: System MUST reject reserved subdomains (www, api, admin, etc.)
