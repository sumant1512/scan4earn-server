# MScan System Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Technology Stack](#technology-stack)
4. [Multi-Tenant Architecture](#multi-tenant-architecture)
5. [Authentication & Authorization](#authentication--authorization)
6. [Frontend Architecture](#frontend-architecture)
7. [Backend Architecture](#backend-architecture)
8. [Database Architecture](#database-architecture)
9. [API Design](#api-design)
10. [Security Architecture](#security-architecture)
11. [State Management](#state-management)
12. [Data Flow](#data-flow)
13. [Scalability & Performance](#scalability--performance)
14. [Deployment Architecture](#deployment-architecture)

---

## System Overview

MScan is a multi-tenant SaaS platform for product catalog management, coupon generation, and QR code-based verification. The system supports two primary user roles: **Super Admins** (platform administrators) and **Tenant Admins** (business owners).

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Web App    │  │  Mobile App  │  │ External Apps │      │
│  │ (Angular 21) │  │   (APIs)     │  │  (API Keys)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘      │
└─────────┼──────────────────┼─────────────────┼──────────────┘
          │                  │                 │
          └──────────────────┼─────────────────┘
                             │ HTTPS/REST
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway / Load Balancer              │
│                     (Nginx/Reverse Proxy)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend API Server                         │
│                   (Express.js/Node.js)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Middleware Layer                                     │  │
│  │  - Authentication (JWT)                               │  │
│  │  - Authorization (Permissions)                        │  │
│  │  - Rate Limiting                                      │  │
│  │  - CORS                                               │  │
│  │  - Security Headers (Helmet)                          │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│  ┌──────────────────┴───────────────────────────────────┐  │
│  │  Route Handlers (23 route modules)                   │  │
│  │  - Auth, Tenants, Products, Coupons, Credits, etc.  │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│  ┌──────────────────┴───────────────────────────────────┐  │
│  │  Controllers (27 controllers)                        │  │
│  │  - Request validation                                │  │
│  │  - Response formatting                               │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                        │
│  ┌──────────────────┴───────────────────────────────────┐  │
│  │  Services (Business Logic)                           │  │
│  │  - Product management                                │  │
│  │  - Coupon generation                                 │  │
│  │  - Credit management                                 │  │
│  │  - Email service                                     │  │
│  │  - QR code generation                                │  │
│  └──────────────────┬───────────────────────────────────┘  │
└───────────────────┬─┴───────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                        │
│  - 30+ tables                                                │
│  - Multi-tenant data isolation                               │
│  - JSONB for flexible schemas                                │
│  - Triggers for automation                                   │
│  - Comprehensive indexes                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
│  - Email Service (SMTP/Nodemailer)                          │
│  - File Storage (Local/S3)                                   │
│  - Webhooks (Outbound notifications)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Patterns

### 1. **Layered Architecture**

The application follows a strict layered architecture:

```
┌─────────────────────────────────┐
│     Presentation Layer          │  ← Angular Components, Services
│     (Frontend)                  │
└─────────────┬───────────────────┘
              │ HTTP/REST
┌─────────────▼───────────────────┐
│     API Layer                   │  ← Express Routes, Controllers
│     (Request/Response)          │
└─────────────┬───────────────────┘
              │
┌─────────────▼───────────────────┐
│     Business Logic Layer        │  ← Services, Domain Logic
│     (Services)                  │
└─────────────┬───────────────────┘
              │
┌─────────────▼───────────────────┐
│     Data Access Layer           │  ← Database Queries, ORM
│     (PostgreSQL)                │
└─────────────────────────────────┘
```

**Benefits:**
- Clear separation of concerns
- Easy to test each layer independently
- Maintainable and scalable code
- Reusable business logic

### 2. **MVC Pattern (Backend)**

- **Model**: Database schema and data structures
- **View**: JSON responses
- **Controller**: Request handlers and response formatting

### 3. **Component-Based Architecture (Frontend)**

- Standalone Angular components (Angular 21+)
- Reusable UI components
- Smart containers and dumb presentational components
- Single responsibility principle

### 4. **Repository Pattern**

Services act as repositories abstracting database operations:

```javascript
// Service layer abstracts database complexity
const productService = {
  async getProducts(tenantId, filters) {
    // Complex database query logic hidden here
    const query = buildQuery(filters);
    return await db.query(query, [tenantId]);
  }
};
```

### 5. **Middleware Pattern**

Request processing pipeline with composable middleware:

```javascript
router.post('/products',
  authenticate,           // JWT verification
  checkPermission('CREATE_PRODUCTS'),  // Permission check
  validateRequest(schema),  // Input validation
  controller.createProduct  // Business logic
);
```

---

## Technology Stack

### Backend Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 20.x | JavaScript runtime |
| **Express.js** | 4.18.2 | Web framework |
| **PostgreSQL** | 16.x | Relational database |
| **pg** | 8.11.3 | PostgreSQL client |
| **jsonwebtoken** | 9.0.2 | JWT authentication |
| **bcryptjs** | 2.4.3 | Password hashing |
| **nodemailer** | 6.9.7 | Email delivery |
| **qrcode** | 1.5.3 | QR code generation |
| **helmet** | 7.1.0 | Security headers |
| **cors** | 2.8.5 | CORS middleware |
| **express-rate-limit** | 7.1.5 | Rate limiting |
| **dotenv** | 16.3.1 | Environment variables |

### Frontend Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Angular** | 21.0.0 | Frontend framework |
| **TypeScript** | 5.9.2 | Type-safe JavaScript |
| **NgRx** | 21.0.1 | State management |
| **RxJS** | 7.8.0 | Reactive programming |
| **Tailwind CSS** | 4.1.12 | Utility-first CSS |
| **Chart.js** | Latest | Analytics charts |
| **QRCode** | Latest | QR code display |

### Testing Stack

| Technology | Purpose |
|-----------|---------|
| **Jest** | Backend unit tests |
| **Jasmine/Karma** | Frontend unit tests |
| **Playwright** | E2E testing |

### Development Tools

| Tool | Purpose |
|------|---------|
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **Nodemon** | Auto-reload (dev) |
| **Angular CLI** | Frontend tooling |
| **Git** | Version control |

---

## Multi-Tenant Architecture

### Tenant Isolation Strategy

MScan uses **row-level multi-tenancy** with tenant_id foreign keys:

```sql
-- Every tenant-specific table has tenant_id
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  -- ... other columns
);

-- Queries always filter by tenant_id
SELECT * FROM products WHERE tenant_id = $1;
```

### Subdomain-Based Tenant Identification

```
┌────────────────────────────────────────┐
│  https://acme.mscan.com/products       │
│         ^^^^                           │
│      subdomain → identifies tenant     │
└────────────────────────────────────────┘
```

**Flow:**
1. User accesses `acme.mscan.com`
2. Backend extracts subdomain from request
3. Looks up tenant: `SELECT * FROM tenants WHERE subdomain = 'acme'`
4. All subsequent queries filtered by `tenant_id`

**JWT Token includes tenant context:**
```json
{
  "userId": "uuid",
  "email": "user@acme.com",
  "userType": "TENANT_ADMIN",
  "tenantId": "tenant-uuid",
  "subdomain": "acme"
}
```

### Data Isolation

**Database Level:**
- Each tenant's data logically separated by `tenant_id`
- Foreign key constraints prevent cross-tenant access
- No shared data between tenants (except reference tables)

**Application Level:**
```javascript
// Auth middleware sets user context
const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;  // User context with tenant_id
  next();
};

// Tenant context middleware enforces isolation
const tenantContextMiddleware = (req, res, next) => {
  const user = req.user;
  let tenantId = null;

  if (user.role === 'SUPER_ADMIN') {
    // Super admin can specify tenant_id for cross-tenant access
    tenantId = req.query.tenant_id || req.body.tenant_id || null;
  } else {
    // Tenant admin MUST use their own tenant
    tenantId = user.tenant_id;

    // SECURITY: Prevent tenant admin from accessing other tenants
    const requestedTenantId = req.query.tenant_id || req.body.tenant_id;
    if (requestedTenantId && requestedTenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  // Attach tenant context
  req.tenantContext = {
    tenantId,
    isSuperAdmin: user.role === 'SUPER_ADMIN',
    userId: user.id,
    userRole: user.role
  };

  next();
};

// Services use tenant context for automatic filtering
const getProducts = async (req, res) => {
  const { tenantId, isSuperAdmin } = req.tenantContext;

  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  // Apply tenant filter (unless super admin querying all)
  if (tenantId) {
    query += ' AND tenant_id = $1';
    params.push(tenantId);
  }

  const products = await db.query(query, params);
  res.json({ products });
};
```

### Super Admin Access

Super Admins can access all tenants:

```javascript
// Super Admin can query across tenants
if (req.user.userType === 'SUPER_ADMIN') {
  // Can query any tenant_id
  const allTenants = await db.query('SELECT * FROM tenants');
} else {
  // Regular users limited to their tenant
  const myTenant = await db.query(
    'SELECT * FROM tenants WHERE id = $1',
    [req.tenantId]
  );
}
```

---

## Authentication & Authorization

### Authentication Flow (OTP-Based)

```
┌──────────┐                 ┌──────────┐                 ┌──────────┐
│  Client  │                 │  Server  │                 │ Database │
└────┬─────┘                 └────┬─────┘                 └────┬─────┘
     │                            │                            │
     │ 1. Request OTP             │                            │
     │ POST /api/auth/request-otp │                            │
     │ { email, userType }        │                            │
     ├───────────────────────────>│                            │
     │                            │ 2. Check user exists       │
     │                            ├───────────────────────────>│
     │                            │ SELECT FROM users          │
     │                            │<───────────────────────────┤
     │                            │                            │
     │                            │ 3. Generate OTP (6 digits) │
     │                            │ 4. Store in otps table     │
     │                            ├───────────────────────────>│
     │                            │ INSERT INTO otps           │
     │                            │<───────────────────────────┤
     │                            │                            │
     │                            │ 5. Send OTP via email      │
     │                            │ (Nodemailer)               │
     │ 6. "OTP sent"              │                            │
     │<───────────────────────────┤                            │
     │                            │                            │
     │ 7. Verify OTP              │                            │
     │ POST /api/auth/verify-otp  │                            │
     │ { email, otp }             │                            │
     ├───────────────────────────>│                            │
     │                            │ 8. Validate OTP            │
     │                            ├───────────────────────────>│
     │                            │ SELECT FROM otps           │
     │                            │ WHERE otp AND not expired  │
     │                            │<───────────────────────────┤
     │                            │                            │
     │                            │ 9. Generate JWT tokens     │
     │                            │ - Access token (1h)        │
     │                            │ - Refresh token (7d)       │
     │                            │                            │
     │                            │ 10. Mark OTP as used       │
     │                            ├───────────────────────────>│
     │                            │ UPDATE otps SET is_used    │
     │                            │<───────────────────────────┤
     │                            │                            │
     │ 11. Return tokens          │                            │
     │ { accessToken, refreshToken│                            │
     │   userType, subdomain }    │                            │
     │<───────────────────────────┤                            │
     │                            │                            │
     │ 12. Store tokens           │                            │
     │ (localStorage)             │                            │
     │                            │                            │
```

### JWT Token Structure

**Access Token** (Short-lived, 1 hour):
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@acme.com",
  "userType": "TENANT_ADMIN",
  "tenantId": "tenant-uuid",
  "subdomain": "acme",
  "permissions": ["VIEW_PRODUCTS", "CREATE_COUPONS", "MANAGE_USERS"],
  "iat": 1706234567,
  "exp": 1706238167
}
```

**Refresh Token** (Long-lived, 7 days):
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tokenId": "unique-token-id",
  "iat": 1706234567,
  "exp": 1706839367
}
```

### Authorization (Permission-Based)

**Permission Model:**

```sql
-- User has many permissions through user_permissions
CREATE TABLE user_permissions (
  user_id UUID REFERENCES users(id),
  permission_code VARCHAR(50) NOT NULL,
  granted_at TIMESTAMP DEFAULT NOW()
);

-- Permission codes:
-- VIEW_PRODUCTS, CREATE_PRODUCTS, EDIT_PRODUCTS, DELETE_PRODUCTS
-- VIEW_COUPONS, CREATE_COUPONS, ACTIVATE_COUPONS, DELETE_COUPONS
-- MANAGE_USERS, MANAGE_CREDITS, VIEW_ANALYTICS, etc.
```

**Middleware Authorization:**
```javascript
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    // Super Admin has all permissions
    if (req.user.userType === 'SUPER_ADMIN') {
      return next();
    }

    // Check if user has required permission
    const hasPermission = req.user.permissions.includes(requiredPermission);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }

    next();
  };
};

// Usage in routes
router.post('/products',
  authenticate,
  checkPermission('CREATE_PRODUCTS'),
  productController.createProduct
);
```

### Role-Based Access Control (RBAC)

**User Types:**

1. **SUPER_ADMIN**
   - Platform-level access
   - Manage all tenants
   - Approve credit requests
   - System-wide analytics
   - Full permissions

2. **TENANT_ADMIN**
   - Tenant-level access
   - Manage products, coupons, users
   - View analytics for their tenant
   - Configurable permissions

3. **TENANT_USER**
   - Limited access within tenant
   - Permissions assigned by Tenant Admin
   - Typically view-only or specific task access

**Permission Hierarchy:**
```
SUPER_ADMIN
  └─> All permissions automatically

TENANT_ADMIN
  ├─> Default permissions
  └─> Additional custom permissions

TENANT_USER
  └─> Explicit permissions only
```

---

## Frontend Architecture

### Component Structure

```
src/app/
├── components/
│   ├── super-admin/           # Super Admin features
│   │   ├── super-admin-dashboard.component.ts
│   │   ├── tenant-management.component.ts
│   │   └── credit-approval.component.ts
│   │
│   ├── tenant-dashboard/      # Tenant Admin features
│   │   ├── tenant-dashboard.component.ts
│   │   └── analytics.component.ts
│   │
│   ├── products/              # Product management
│   │   ├── product-list.component.ts
│   │   ├── product-form.component.ts
│   │   └── product-detail.component.ts
│   │
│   ├── coupons/               # Coupon management
│   │   ├── coupon-list.component.ts
│   │   ├── coupon-create.component.ts
│   │   └── batch-activation.component.ts
│   │
│   ├── categories/            # Category management
│   ├── rewards/               # Rewards management
│   ├── credit-management/     # Credit management
│   ├── tenant-users/          # User management
│   ├── verification-app/      # Verification app config
│   ├── scans/                 # Scan history
│   ├── shared-header/         # Shared header component
│   ├── side-nav/              # Navigation component
│   └── app-selector/          # Multi-app selector
│
├── services/
│   ├── auth.service.ts        # Authentication
│   ├── tenant.service.ts      # Tenant API
│   ├── products.service.ts    # Products API
│   ├── rewards.service.ts     # Coupons API
│   ├── credit.service.ts      # Credits API
│   ├── analytics.service.ts   # Analytics API
│   ├── permissions.service.ts # Permissions API
│   └── app-context.service.ts # App context management
│
├── guards/
│   ├── auth.guard.ts          # Route authentication
│   └── permission.guard.ts    # Route authorization
│
├── store/                     # NgRx state management
│   ├── actions/
│   ├── reducers/
│   ├── effects/
│   ├── selectors/
│   └── facades/
│
├── models/
│   ├── tenant.model.ts
│   ├── product.model.ts
│   ├── coupon.model.ts
│   ├── user.model.ts
│   └── permissions.model.ts
│
└── app.routes.ts              # Route configuration
```

### Component Types

**1. Smart Components (Containers)**
- Connect to NgRx store
- Handle business logic
- Dispatch actions
- Subscribe to state changes

```typescript
@Component({
  selector: 'app-product-list',
  standalone: true,
  template: `
    <app-product-table
      [products]="products$ | async"
      (delete)="onDelete($event)"
    ></app-product-table>
  `
})
export class ProductListComponent {
  products$ = this.productFacade.products$;

  constructor(private productFacade: ProductFacade) {}

  onDelete(id: string) {
    this.productFacade.deleteProduct(id);
  }
}
```

**2. Dumb Components (Presentational)**
- No direct store access
- Receive data via @Input()
- Emit events via @Output()
- Reusable and testable

```typescript
@Component({
  selector: 'app-product-table',
  standalone: true,
  template: `
    <table>
      <tr *ngFor="let product of products">
        <td>{{ product.name }}</td>
        <button (click)="delete.emit(product.id)">Delete</button>
      </tr>
    </table>
  `
})
export class ProductTableComponent {
  @Input() products: Product[] = [];
  @Output() delete = new EventEmitter<string>();
}
```

### Routing Strategy

```typescript
// app.routes.ts
export const routes: Routes = [
  // Public routes
  { path: 'login', component: LoginComponent },

  // Super Admin routes
  {
    path: 'super-admin',
    canActivate: [AuthGuard],
    data: { requiredRole: 'SUPER_ADMIN' },
    children: [
      { path: 'dashboard', component: SuperAdminDashboardComponent },
      { path: 'tenants', component: TenantManagementComponent },
      { path: 'credit-approval', component: CreditApprovalComponent }
    ]
  },

  // Tenant Admin routes
  {
    path: 'tenant',
    canActivate: [AuthGuard, PermissionGuard],
    children: [
      { path: 'dashboard', component: TenantDashboardComponent },
      {
        path: 'products',
        canActivate: [PermissionGuard],
        data: { permission: 'VIEW_PRODUCTS' },
        component: ProductListComponent
      },
      {
        path: 'coupons',
        canActivate: [PermissionGuard],
        data: { permission: 'VIEW_COUPONS' },
        component: CouponListComponent
      }
    ]
  },

  // Default redirect
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', component: NotFoundComponent }
];
```

### HTTP Interceptors

```typescript
// JWT Interceptor
@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const token = localStorage.getItem('accessToken');

    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(req).pipe(
      catchError(error => {
        if (error.status === 401) {
          // Token expired, try refresh
          return this.authService.refreshToken().pipe(
            switchMap(newToken => {
              // Retry original request
              req = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` }
              });
              return next.handle(req);
            })
          );
        }
        return throwError(error);
      })
    );
  }
}
```

---

## Backend Architecture

### Folder Structure

```
mscan-server/
├── src/
│   ├── controllers/           # Request handlers
│   │   ├── auth.controller.js
│   │   ├── tenant.controller.js
│   │   ├── products.controller.js
│   │   ├── rewards.controller.js
│   │   ├── credit.controller.js
│   │   └── ... (27 total)
│   │
│   ├── routes/                # Route definitions
│   │   ├── auth.routes.js
│   │   ├── tenant.routes.js
│   │   ├── products.routes.js
│   │   └── ... (23 total)
│   │
│   ├── services/              # Business logic
│   │   ├── coupon-generator.service.js
│   │   ├── email.service.js
│   │   ├── token.service.js
│   │   ├── permission.service.js
│   │   └── ... (16 total)
│   │
│   ├── middleware/            # Request middleware
│   │   ├── auth.middleware.js
│   │   ├── permission.middleware.js
│   │   ├── rateLimiter.middleware.js
│   │   ├── appApiKey.middleware.js
│   │   └── validation.middleware.js
│   │
│   ├── config/                # Configuration
│   │   ├── database.js
│   │   └── email.js
│   │
│   └── server.js              # App entry point
│
├── database/
│   ├── full_setup.sql         # Complete schema
│   ├── migrations/            # Migration files
│   └── run-migrations.js      # Migration runner
│
├── uploads/                   # File uploads
├── .env                       # Environment variables
└── package.json
```

### Request Flow

```
HTTP Request
    │
    ▼
┌───────────────────────────────┐
│  1. Express Middleware Stack  │
│  - CORS                       │
│  - Helmet (Security Headers)  │
│  - Body Parser (JSON)         │
│  - Rate Limiter               │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  2. Route Matching            │
│  app.use('/api/products',     │
│          productRoutes)       │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  3. Route-Specific Middleware │
│  - authenticate()             │
│  - checkPermission()          │
│  - validateRequest()          │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  4. Controller                │
│  - Validate input             │
│  - Call service               │
│  - Format response            │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  5. Service Layer             │
│  - Business logic             │
│  - Database queries           │
│  - External API calls         │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  6. Database                  │
│  - Execute query              │
│  - Return results             │
└───────────┬───────────────────┘
            │
            ▼
        Response
```

### Service Layer Design

```javascript
// coupon-generator.service.js
const couponGenerator = {
  /**
   * Generate single coupon
   */
  async generateSingle(tenantId, productId, options) {
    // 1. Validate credits
    await this.validateCredits(tenantId, 1);

    // 2. Generate unique code
    const code = this.generateUniqueCode();

    // 3. Generate QR code
    const qrCode = await this.generateQRCode(code);

    // 4. Create coupon record
    const coupon = await db.query(
      `INSERT INTO coupons (tenant_id, product_id, code, qr_code, status)
       VALUES ($1, $2, $3, $4, 'DRAFT')
       RETURNING *`,
      [tenantId, productId, code, qrCode]
    );

    // 5. Deduct credit
    await this.deductCredit(tenantId, 1);

    // 6. Audit log
    await auditService.log('COUPON_CREATED', { couponId: coupon.id });

    return coupon;
  },

  /**
   * Generate batch of coupons
   */
  async generateBatch(tenantId, productId, quantity, options) {
    // 1. Validate credits for batch
    await this.validateCredits(tenantId, quantity);

    // 2. Generate codes in batch
    const codes = await this.generateBatchCodes(quantity);

    // 3. Generate QR codes in parallel
    const qrCodes = await Promise.all(
      codes.map(code => this.generateQRCode(code))
    );

    // 4. Bulk insert coupons
    const coupons = await db.query(
      `INSERT INTO coupons (tenant_id, product_id, code, qr_code, status)
       SELECT $1, $2, unnest($3::text[]), unnest($4::text[]), 'DRAFT'
       RETURNING *`,
      [tenantId, productId, codes, qrCodes]
    );

    // 5. Deduct credits
    await this.deductCredit(tenantId, quantity);

    return coupons;
  }
};
```

---

## Database Architecture

### Schema Design Principles

1. **Multi-tenant with row-level isolation**
   - Every tenant-specific table has `tenant_id`
   - Foreign keys enforce referential integrity

2. **UUID Primary Keys**
   - Prevents ID enumeration attacks
   - Distributed system friendly
   - No sequence conflicts

3. **JSONB for Flexibility**
   - Product attributes (dynamic per tenant)
   - Settings and configuration
   - Metadata storage

4. **Comprehensive Indexing**
   - Foreign keys indexed
   - Frequently queried columns indexed
   - Composite indexes for complex queries

5. **Audit Trail**
   - `created_at`, `updated_at` timestamps
   - Separate `audit_logs` table for critical actions

### Core Tables

**tenants** - Tenant accounts
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  credit_balance NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**users** - All user accounts
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL for SUPER_ADMIN
  email VARCHAR(255) UNIQUE NOT NULL,
  user_type VARCHAR(50) NOT NULL,  -- SUPER_ADMIN, TENANT_ADMIN, TENANT_USER
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**products** - Product catalog
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  base_price NUMERIC(10,2),
  attributes JSONB,  -- Flexible product attributes
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**coupons** - Generated coupons
```sql
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID REFERENCES products(id),
  code VARCHAR(50) UNIQUE NOT NULL,
  qr_code TEXT,
  status VARCHAR(50) DEFAULT 'DRAFT',  -- DRAFT, PRINTED, ACTIVE, USED, EXPIRED
  points INTEGER,
  expires_at TIMESTAMP,
  used_at TIMESTAMP,
  used_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Indexing Strategy

```sql
-- Tenant isolation indexes
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_coupons_tenant ON coupons(tenant_id);

-- Status and filtering indexes
CREATE INDEX idx_coupons_status ON coupons(status);
CREATE INDEX idx_coupons_code ON coupons(code);  -- For QR scans

-- Composite indexes for common queries
CREATE INDEX idx_coupons_tenant_status ON coupons(tenant_id, status);
CREATE INDEX idx_products_tenant_category ON products(tenant_id, category_id);

-- JSONB indexes for attribute queries
CREATE INDEX idx_products_attributes ON products USING GIN (attributes);
CREATE INDEX idx_tenants_settings ON tenants USING GIN (settings);
```

### Database Triggers

```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Audit log trigger for critical tables
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    NEW.id,
    TG_OP,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## API Design

### RESTful Principles

1. **Resource-based URLs**
   - `/api/products` - Products collection
   - `/api/products/:id` - Single product
   - `/api/tenants/:id/users` - Nested resources

2. **HTTP Methods**
   - `GET` - Retrieve resource(s)
   - `POST` - Create resource
   - `PUT` - Update resource (full)
   - `PATCH` - Update resource (partial)
   - `DELETE` - Delete resource

3. **Status Codes**
   - `200` - Success
   - `201` - Created
   - `400` - Bad Request
   - `401` - Unauthorized
   - `403` - Forbidden
   - `404` - Not Found
   - `500` - Server Error

### Response Format

**Success Response:**
```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "products": [...],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 20,
      "pages": 5
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

### API Versioning

```javascript
// Version in URL path
app.use('/api/v1/products', productRoutesV1);
app.use('/api/v2/products', productRoutesV2);

// Or version in header
app.use('/api/products', (req, res, next) => {
  const version = req.headers['api-version'] || '1';
  if (version === '2') {
    return productRoutesV2(req, res, next);
  }
  return productRoutesV1(req, res, next);
});
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // 100 requests per window
  message: 'Too many requests, please try again later'
});

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,  // 5 requests per window
  skipSuccessfulRequests: true
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
```

---

## Security Architecture

### Security Layers

```
┌─────────────────────────────────────┐
│  1. Network Security               │
│  - HTTPS/TLS encryption            │
│  - Firewall rules                  │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  2. API Gateway Security           │
│  - Rate limiting                   │
│  - DDoS protection                 │
│  - IP whitelisting                 │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  3. Application Security           │
│  - JWT authentication              │
│  - Permission-based authorization  │
│  - Input validation                │
│  - SQL injection prevention        │
│  - XSS protection                  │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│  4. Database Security              │
│  - Parameterized queries           │
│  - Row-level security              │
│  - Encrypted connections           │
│  - Regular backups                 │
└─────────────────────────────────────┘
```

### Security Best Practices Implemented

1. **Helmet.js Security Headers**
```javascript
const helmet = require('helmet');
app.use(helmet());
// Adds:
// - X-Content-Type-Options: nosniff
// - X-Frame-Options: DENY
// - X-XSS-Protection: 1; mode=block
// - Strict-Transport-Security
```

2. **SQL Injection Prevention**
```javascript
// GOOD: Parameterized queries
db.query('SELECT * FROM products WHERE id = $1', [productId]);

// BAD: String concatenation (vulnerable)
// db.query(`SELECT * FROM products WHERE id = '${productId}'`);
```

3. **XSS Protection**
```javascript
// Input sanitization
const sanitize = require('sanitize-html');
const cleanInput = sanitize(userInput, {
  allowedTags: [],
  allowedAttributes: {}
});
```

4. **CORS Configuration**
```javascript
const cors = require('cors');
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

5. **Environment Variables**
```javascript
// Never commit .env file
// Use strong secrets in production
JWT_SECRET=use-a-strong-random-secret-here
REFRESH_TOKEN_SECRET=another-strong-secret
```

---

## State Management

### NgRx Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Component                           │
│  - Dispatches actions                                    │
│  - Subscribes to selectors                               │
└──────────────┬────────────────────────────┬──────────────┘
               │                            │
          dispatch                      subscribe
               │                            │
               ▼                            │
┌──────────────────────────┐               │
│         Actions          │               │
│  - loadProducts()        │               │
│  - loadProductsSuccess() │               │
│  - loadProductsFailure() │               │
└──────────┬───────────────┘               │
           │                                │
           │ triggers                       │
           ▼                                │
┌──────────────────────────┐               │
│         Effects          │               │
│  - HTTP API calls        │               │
│  - Side effects          │               │
│  - Error handling        │               │
└──────────┬───────────────┘               │
           │                                │
           │ dispatches success/failure     │
           ▼                                │
┌──────────────────────────┐               │
│        Reducers          │               │
│  - Pure functions        │               │
│  - Update state          │               │
│  - Immutable updates     │               │
└──────────┬───────────────┘               │
           │                                │
           │ updates                        │
           ▼                                │
┌──────────────────────────┐               │
│          Store           │               │
│  - Single source of truth│───────────────┘
│  - Immutable state tree  │
└──────────┬───────────────┘
           │
           │ selects
           ▼
┌──────────────────────────┐
│        Selectors         │
│  - Memoized computations │
│  - Derived state         │
└──────────────────────────┘
```

### State Structure

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    loading: boolean;
    error: string | null;
  };
  tenants: {
    entities: { [id: string]: Tenant };
    ids: string[];
    selectedId: string | null;
    loading: boolean;
    error: string | null;
  };
  products: {
    entities: { [id: string]: Product };
    ids: string[];
    selectedId: string | null;
    filters: ProductFilters;
    pagination: Pagination;
    loading: boolean;
    error: string | null;
  };
  coupons: {
    entities: { [id: string]: Coupon };
    ids: string[];
    selectedId: string | null;
    loading: boolean;
    error: string | null;
  };
  // ... other feature states
}
```

### Facade Pattern

Facades provide a simple API to interact with the store:

```typescript
@Injectable({ providedIn: 'root' })
export class ProductFacade {
  // Selectors
  products$ = this.store.select(selectAllProducts);
  loading$ = this.store.select(selectProductsLoading);
  error$ = this.store.select(selectProductsError);
  selectedProduct$ = this.store.select(selectSelectedProduct);

  constructor(private store: Store) {}

  // Actions
  loadProducts(filters?: ProductFilters) {
    this.store.dispatch(loadProducts({ filters }));
  }

  selectProduct(id: string) {
    this.store.dispatch(selectProduct({ id }));
  }

  createProduct(product: CreateProductDto) {
    this.store.dispatch(createProduct({ product }));
  }

  updateProduct(id: string, changes: Partial<Product>) {
    this.store.dispatch(updateProduct({ id, changes }));
  }

  deleteProduct(id: string) {
    this.store.dispatch(deleteProduct({ id }));
  }
}
```

---

## Data Flow

### Complete Request/Response Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User Action: Click "Create Product"                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Component: Dispatch createProduct(data)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  NgRx Store: Action dispatched                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  NgRx Effect: Intercept createProduct action                │
│  - Call ProductService.createProduct(data)                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│  HTTP Interceptor: Add JWT token                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend: POST /api/products                                │
│  1. CORS middleware                                         │
│  2. Body parser                                             │
│  3. Rate limiter                                            │
│  4. authenticate() - Verify JWT                             │
│  5. checkPermission('CREATE_PRODUCTS')                      │
│  6. validateRequest(productSchema)                          │
│  7. productController.createProduct()                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Controller: Validate and delegate to service               │
│  - Extract tenant_id from req.user                          │
│  - Call productService.createProduct(tenantId, data)        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Service: Business logic                                    │
│  - Validate product data                                    │
│  - Check category exists                                    │
│  - Insert into products table                               │
│  - Audit log                                                │
│  - Return created product                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Database: Execute INSERT                                   │
│  INSERT INTO products (tenant_id, name, ...) VALUES (...)   │
│  RETURNING *;                                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Service: Return result to controller                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Controller: Format response                                │
│  res.status(201).json({                                     │
│    success: true,                                           │
│    message: 'Product created',                              │
│    data: { product }                                        │
│  })                                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ HTTP Response
┌─────────────────────────────────────────────────────────────┐
│  NgRx Effect: Receive response                              │
│  - Dispatch createProductSuccess({ product })               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  NgRx Reducer: Update state                                 │
│  - Add product to entities                                  │
│  - Add product.id to ids array                              │
│  - Set loading = false                                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Selector: Notify subscribers                               │
│  - products$ emits new array                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Component: Receive updated products                        │
│  - products$ | async in template                            │
│  - UI updates automatically                                 │
│  - Show success message                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Scalability & Performance

### Database Optimization

1. **Connection Pooling**
```javascript
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,  // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

2. **Query Optimization**
- Use indexes for frequently queried columns
- Avoid N+1 queries with JOINs
- Use LIMIT for pagination
- Analyze slow queries with EXPLAIN

3. **Caching Strategy**
```javascript
const cache = new Map();

const getCachedData = async (key, fetcher, ttl = 300) => {
  if (cache.has(key)) {
    const { data, expiry } = cache.get(key);
    if (Date.now() < expiry) {
      return data;
    }
  }

  const data = await fetcher();
  cache.set(key, {
    data,
    expiry: Date.now() + (ttl * 1000)
  });
  return data;
};

// Usage
const categories = await getCachedData(
  `categories:${tenantId}`,
  () => db.query('SELECT * FROM categories WHERE tenant_id = $1', [tenantId]),
  600  // 10 minutes
);
```

### Frontend Performance

1. **Lazy Loading**
```typescript
// app.routes.ts
const routes: Routes = [
  {
    path: 'products',
    loadComponent: () => import('./components/products/product-list.component')
      .then(m => m.ProductListComponent)
  }
];
```

2. **OnPush Change Detection**
```typescript
@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`
})
export class ProductListComponent {}
```

3. **Virtual Scrolling**
```typescript
<cdk-virtual-scroll-viewport itemSize="50" class="list-container">
  <div *cdkVirtualFor="let product of products">
    {{ product.name }}
  </div>
</cdk-virtual-scroll-viewport>
```

### Horizontal Scaling

```
┌─────────────────────────────────────────────┐
│            Load Balancer (Nginx)            │
└──────┬─────────┬─────────┬──────────────────┘
       │         │         │
       ▼         ▼         ▼
   ┌─────┐   ┌─────┐   ┌─────┐
   │ API │   │ API │   │ API │
   │  1  │   │  2  │   │  3  │  ← Stateless servers
   └──┬──┘   └──┬──┘   └──┬──┘
      │         │         │
      └─────────┼─────────┘
                ▼
         ┌─────────────┐
         │  PostgreSQL │  ← Shared database
         │  (Primary)  │
         └──────┬──────┘
                │
         ┌──────┴──────┐
         ▼             ▼
    ┌────────┐   ┌────────┐
    │ Replica│   │ Replica│  ← Read replicas
    │   1    │   │   2    │
    └────────┘   └────────┘
```

---

## Deployment Architecture

### Production Deployment

```
┌─────────────────────────────────────────────────────────┐
│                    CDN (CloudFlare)                     │
│  - Static assets (Angular build)                        │
│  - Images, CSS, JS                                      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Load Balancer (AWS ALB/Nginx)              │
│  - SSL termination                                      │
│  - Health checks                                        │
│  - Request routing                                      │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  API Server  │ │  API Server  │ │  API Server  │
│  (Node.js)   │ │  (Node.js)   │ │  (Node.js)   │
│  + PM2       │ │  + PM2       │ │  + PM2       │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│          PostgreSQL (AWS RDS/Managed)                   │
│  - Primary + Read Replicas                              │
│  - Automated backups                                    │
│  - SSL connections                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   External Services                     │
│  - Email (SendGrid/AWS SES)                             │
│  - File Storage (AWS S3)                                │
│  - Monitoring (Datadog/New Relic)                       │
│  - Logging (CloudWatch/ELK)                             │
└─────────────────────────────────────────────────────────┘
```

### Environment Configuration

**Development:**
- Local PostgreSQL
- Hot reload (nodemon, ng serve)
- Debug logging enabled
- Test email service

**Staging:**
- Managed database
- Production-like setup
- Integration tests
- UAT environment

**Production:**
- High availability setup
- Multiple server instances
- Database replicas
- Automated backups
- Monitoring and alerts
- HTTPS enforced
- Environment secrets in vault

---

## Key Design Decisions

### 1. Why OTP-Based Authentication?

**Reasons:**
- Better UX (no passwords to remember)
- More secure (time-limited OTPs)
- Reduces password reset flows
- Prevents brute force attacks

### 2. Why PostgreSQL over MongoDB?

**Reasons:**
- Strong ACID compliance needed for financial data (credits)
- Complex relational data (tenants, users, products, coupons)
- JSONB provides NoSQL flexibility where needed
- Better support for transactions and constraints
- Mature ecosystem

### 3. Why NgRx for State Management?

**Reasons:**
- Predictable state updates
- Time-travel debugging
- Easy to test
- Scales well with large applications
- Reactive programming with RxJS

### 4. Why Multi-Tenant (Row-Level) vs Schema-Per-Tenant?

**Reasons:**
- Easier to manage single database
- Better resource utilization
- Simpler backups and migrations
- Cost-effective
- Query performance with proper indexing

### 5. Why JWT over Session-Based Auth?

**Reasons:**
- Stateless (scales horizontally)
- Works across multiple domains
- Mobile-friendly
- Easier microservices integration
- Built-in expiration

---

**Document Version:** 1.0
**Last Updated:** 2026-01-26
**Maintained By:** MScan Development Team
