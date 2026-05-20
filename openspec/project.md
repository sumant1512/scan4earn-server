# Project Context

## Purpose
MScan is an enterprise-grade, multi-tenant platform for managing product verification, coupon campaigns, and customer rewards. The system enables businesses to:

- **Product Authentication**: Prevent counterfeiting with unique QR code verification
- **Promotional Campaigns**: Create and manage coupon distributions with batch generation
- **Loyalty Programs**: Track customer engagement through scan history and rewards
- **Multi-Brand Operations**: Support multiple tenants with complete data isolation via subdomain routing
- **Dealer Management**: Track product distribution via batch assignment and serial numbers

**Target Users**: Manufacturers, retailers, brands, and enterprises running multi-brand operations from a single platform.

---

## Tech Stack

### Backend
- **Runtime**: Node.js 20.x
- **Framework**: Express.js 4.x
- **Database**: PostgreSQL 16.x (with JSONB for flexible schemas)
- **Authentication**: JWT (jsonwebtoken) with OTP-based passwordless login
- **Email**: Nodemailer (Gmail integration)
- **Validation**: Joi
- **Security**: Helmet, CORS, Express Rate Limiting, bcrypt
- **Testing**: Jest, Supertest

### Frontend
- **Framework**: Angular 21.x (Standalone Components architecture)
- **State Management**: NgRx 21.x (Redux pattern with effects, entities, selectors)
- **Styling**: Tailwind CSS 4.x
- **HTTP**: Angular HTTP Client with custom interceptors
- **Forms**: Reactive Forms with validation
- **Routing**: Angular Router with role-based guards
- **Testing**: Jest, Playwright (E2E)

### Database
- **RDBMS**: PostgreSQL 16.x
- **Features Used**: JSONB columns, triggers, views, row-level security concepts
- **Migration System**: Custom Node.js migration runner with version tracking

### DevOps & Tools
- **Version Control**: Git
- **Package Manager**: npm 10.x
- **E2E Testing**: Playwright
- **Linting**: ESLint (configured for both Angular and Node.js)
- **Environment Management**: dotenv

---

## Project Conventions

### Code Style

#### TypeScript/JavaScript
- **Naming Conventions**:
  - **PascalCase**: Classes, components, interfaces, types (`TenantListComponent`, `AuthService`)
  - **camelCase**: Variables, functions, methods (`getTenantById`, `isAuthenticated`)
  - **UPPER_SNAKE_CASE**: Constants, environment variables (`JWT_ACCESS_SECRET`, `SUPER_ADMIN`)
  - **kebab-case**: File names (`tenant-list.component.ts`, `auth.service.ts`)

- **Code Organization**:
  - Services contain business logic and API calls
  - Controllers handle HTTP request/response (thin layer)
  - Components focus on UI rendering and user interaction
  - Models/interfaces define TypeScript types
  - Guards protect routes based on authentication/authorization

- **Formatting**:
  - Prettier configured (100 char line width, single quotes)
  - Consistent indentation (2 spaces)
  - Angular-specific HTML parser for templates

#### File Structure Patterns
```
feature-name/
├── feature-name.component.ts       # Component logic
├── feature-name.component.html     # Template
├── feature-name.component.css      # Styles (scoped)
└── feature-name.component.spec.ts  # Tests (if applicable)
```

### Architecture Patterns

#### Backend (Node.js/Express)
1. **Layered Architecture**:
   ```
   Routes → Controllers → Services → Database
   ```
   - **Routes**: Define endpoints and apply middleware
   - **Controllers**: Handle request/response, validation
   - **Services**: Business logic, database queries
   - **Database**: PostgreSQL via `pg` library (connection pooling)

2. **Middleware Pattern**:
   - Authentication middleware (`auth.middleware.js`)
   - Permission middleware (role/permission-based access)
   - Subdomain middleware (multi-tenant routing)
   - Error handling middleware (centralized error responses)
   - Rate limiting middleware (DDoS protection)

3. **Repository Pattern** (implicit):
   - Services encapsulate database queries
   - No direct SQL in controllers
   - Parameterized queries to prevent SQL injection

#### Frontend (Angular)
1. **Redux Pattern (NgRx)**:
   ```
   Component → Action → Effect → Reducer → Selector → Component
   ```
   - **State Stores**: Auth, Dashboard, Tenants, Verification Apps, Credit Requests
   - **Effects**: Handle async operations (API calls)
   - **Selectors**: Derive computed state
   - **Entities**: Normalized state management with @ngrx/entity

2. **Service-Oriented Architecture**:
   - Services handle all HTTP communication
   - Components subscribe to observables
   - RxJS operators for data transformation
   - HTTP interceptors for token injection and error handling

3. **Guard Pattern**:
   - Route guards check authentication state
   - Role-based guards restrict access by user role
   - Permission guards verify granular permissions

4. **Standalone Components** (Angular 19+):
   - No NgModule declarations
   - Direct imports in component metadata
   - Simplified dependency graph
   - Better tree-shaking and lazy loading

#### Database Patterns
1. **Multi-Tenancy**:
   - `tenant_id` foreign key in all tenant-scoped tables
   - Subdomain-based tenant resolution
   - Complete data isolation per tenant
   - Shared schema with tenant partitioning

2. **JSONB for Flexibility**:
   - Product templates use JSONB for custom fields
   - Product variants stored as JSONB
   - API configurations in JSONB format
   - Query with `->`, `->>`, `@>` operators

3. **Audit Trail**:
   - `created_at`, `updated_at` timestamps
   - Audit service logs critical actions
   - Transaction history tracking

### Testing Strategy

#### Unit Tests (Jest)
- **Backend**: Service layer tests (`__tests__/*.test.js`)
- **Frontend**: Component and service tests (`*.spec.ts`)
- **Coverage**: Aim for critical business logic coverage
- **Mocking**: Mock database/HTTP for isolated tests

#### Integration Tests
- **Backend**: Controller integration tests with supertest
- **Database**: Test migrations and data integrity
- **Permissions**: Verify middleware behavior

#### E2E Tests (Playwright)
- **Location**: `mscan-e2e/tests/`
- **Structure**:
  - `super-admin/`: Super admin workflows (tenant management, credit approval)
  - `tenant-admin/`: Tenant admin workflows (products, coupons, batch activation)
- **Database Helpers**: Utility to query PostgreSQL for test assertions
- **Scripts**: Separate test scripts for super-admin and tenant-admin

#### Test Commands
```bash
# Backend unit tests
cd mscan-server && npm test

# Frontend unit tests
cd mscan-client && npm test

# E2E tests
cd mscan-e2e && npm test
cd mscan-e2e && npm run test:super-admin
cd mscan-e2e && npm run test:tenant-admin
```

### Git Workflow

#### Branching Strategy
- **main**: Production-ready code
- **feature/***: New features or enhancements
- **bugfix/***: Bug fixes
- **hotfix/***: Urgent production fixes

#### Commit Conventions
Standard commit message format:
```
<type>: <short description>

[optional body]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `docs`: Documentation changes
- `test`: Add/update tests
- `chore`: Tooling, dependencies, config

**Examples**:
```
feat: add multi-batch coupon creation
fix: resolve credit transaction history filter issue
refactor: migrate to standalone Angular components
docs: update API reference for template endpoints
```

---

## Domain Context

### Core Entities

1. **Tenant**: An organization using the platform
   - Has unique subdomain (e.g., `acme.mscan.com`)
   - Owns products, coupons, templates, users
   - Has credit balance for coupon generation
   - Custom branding (logo, colors)

2. **User Roles**:
   - **SUPER_ADMIN**: Platform administrator (manage tenants, approve credits)
   - **TENANT_ADMIN**: Tenant administrator (full access to tenant features)
   - **TENANT_USER**: Limited tenant user (specific permissions)

3. **Verification App**: Branded QR scanning interface
   - Each tenant can have multiple apps
   - Custom welcome message, branding
   - Associated product templates
   - API key for external integrations

4. **Product Template**: Reusable product schema
   - JSONB structure for custom fields
   - Defines variants (size, color, weight, etc.)
   - Attached to verification apps

5. **Product**: Actual product instance
   - Based on a template or standalone
   - Has custom attributes (JSONB)
   - Can have variants
   - Tagged for categorization

6. **Coupon Batch**: Group of coupons for a campaign
   - Belongs to a tenant
   - Has expiry date, terms, reward details
   - Status: draft → code_assigned → activated

7. **Coupon**: Individual coupon code
   - Unique code + QR image
   - Lifecycle: draft → activated → scanned → expired
   - Optional serial number for inventory tracking
   - Linked to products/batches

8. **Permissions**: Granular access control
   - Pattern: `{action}_{resource}` (e.g., `create_coupon`, `view_analytics`)
   - Assigned to roles or individual users
   - Enforced via middleware on API routes

### Business Workflows

1. **Tenant Onboarding**:
   - Super admin creates tenant with subdomain
   - Tenant admin receives login credentials
   - Credit allocation for coupon generation
   - Verification app configuration

2. **Coupon Campaign**:
   - Create batch (define reward, expiry, terms)
   - Generate coupon codes (bulk generation)
   - Activate batch (makes coupons scannable)
   - Track scans and redemptions
   - Expire unused coupons

3. **Product Verification**:
   - Customer scans QR code
   - System validates coupon and product
   - Records scan event
   - Awards rewards/points
   - Updates coupon status

### Data Isolation
- All tenant data segregated by `tenant_id`
- Subdomain middleware resolves tenant from hostname
- API queries always filtered by tenant context
- No cross-tenant data access

---

## Important Constraints

### Technical Constraints
- **Node.js**: Must use v20.x or higher (for ES2023 features)
- **PostgreSQL**: v16.x required (for JSONB improvements)
- **Angular**: v21.x with standalone components (no NgModule)
- **JWT Tokens**: Access tokens expire in 30 minutes, refresh in 7 days
- **JSONB Fields**: Product templates, variants, API configs must be valid JSON

### Security Constraints
- **Authentication**: OTP-based passwordless login only
- **Authorization**: JWT tokens required for all protected routes
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Strict origin validation with subdomain support
- **SQL Injection**: Parameterized queries mandatory
- **XSS Protection**: Helmet.js middleware, Angular sanitization

### Business Constraints
- **Multi-Tenancy**: Complete data isolation between tenants
- **Subdomain Routing**: Reserved subdomains list must be respected
- **Credit System**: Tenants cannot create coupons without credits
- **Coupon Lifecycle**: Strict state transitions (no skipping states)
- **Audit Trail**: All critical actions must be logged

### Performance Constraints
- **Database Pooling**: Connection pool limits to prevent exhaustion
- **Pagination**: Large lists must be paginated (default 10-50 items)
- **Batch Operations**: Coupon generation optimized for 1000+ codes
- **JSONB Indexing**: GIN indexes on JSONB fields for query performance

### Deployment Constraints
- **Environment Variables**: All config via `.env` file
- **Database Migrations**: Use migration system (no manual schema changes)
- **No Downtime**: Migrations must be backward-compatible
- **HTTPS**: Production must use HTTPS for all traffic

---

## External Dependencies

### Email Service
- **Provider**: Gmail (via Nodemailer)
- **Purpose**: OTP delivery, notifications
- **Configuration**: `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASSWORD` in `.env`
- **Fallback**: Configure alternate SMTP if Gmail unavailable

### QR Code Generation
- **Library**: (Implicit in coupon generation service)
- **Format**: PNG images stored as base64 or URLs
- **Usage**: Each coupon has a unique QR code

### Frontend Libraries
- **Angular Material**: UI components (buttons, dialogs, forms)
- **Tailwind CSS**: Utility-first styling
- **RxJS**: Reactive programming (observables, operators)

### Backend Libraries
- **Express.js**: HTTP server framework
- **pg**: PostgreSQL client (connection pooling)
- **bcrypt**: Password hashing (if passwords added later)
- **uuid**: Unique ID generation
- **exceljs**: Excel export functionality

### Development Tools
- **Playwright**: E2E test automation
- **Jest**: Unit testing framework
- **Nodemon**: Auto-restart server on changes
- **ESLint**: Code linting
- **Prettier**: Code formatting

### Optional Integrations
- **Webhooks**: Outbound webhooks for external systems
- **E-commerce APIs**: Product catalog integration
- **Mobile App APIs**: V2 API for mobile applications
- **External Verification Apps**: API key-based access

---

## Notes for AI Assistants

### Code Generation Guidelines
- Always use standalone components for Angular (no `@NgModule`)
- Backend controllers should be thin (delegate to services)
- Use NgRx for complex state management (auth, dashboards, entity lists)
- Parameterize all SQL queries (never string concatenation)
- Apply tenant context middleware to all tenant-scoped routes
- Follow existing naming conventions (kebab-case files, camelCase variables)

### Common Pitfalls
- **Tenant Isolation**: Never forget to filter by `tenant_id`
- **Subdomain Routing**: Check subdomain middleware is applied
- **Permission Checks**: Verify permission middleware on protected routes
- **JSONB Validation**: Ensure JSONB fields have proper structure
- **State Mutations**: Never mutate state directly in NgRx reducers
- **Observable Subscriptions**: Always unsubscribe to prevent memory leaks

### Debugging Hints
- Check `mscan-server/src/server.js` for route registrations
- Review `mscan-client/src/app/app.routes.ts` for frontend routes
- Inspect NgRx DevTools for state issues
- Use `database/cleanup-all-tenant-data.js` to reset test data
- E2E tests in `mscan-e2e/tests/` demonstrate expected workflows

### Key Files to Reference
- **Database Schema**: `mscan-server/database/full_setup.sql`
- **API Routes**: `mscan-server/src/server.js` (route imports)
- **State Stores**: `mscan-client/src/app/store/*`
- **Middleware**: `mscan-server/src/middleware/*`
- **Services**: `mscan-server/src/services/*`, `mscan-client/src/app/services/*`
