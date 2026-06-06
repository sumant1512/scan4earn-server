# MScan Complete Setup Guide

This comprehensive guide will help you set up and run the MScan project from scratch.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Installation](#installation)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Running the Application](#running-the-application)
7. [Initial Configuration](#initial-configuration)
8. [Testing Setup](#testing-setup)
9. [Development Workflow](#development-workflow)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

1. **Node.js** - Version 20.x or higher
   ```bash
   node --version  # Should show v20.x.x or higher
   ```
   Download from: https://nodejs.org/

2. **PostgreSQL** - Version 16.x
   ```bash
   psql --version  # Should show PostgreSQL 16.x
   ```
   Download from: https://www.postgresql.org/download/

3. **npm** - Version 10.x or higher (comes with Node.js)
   ```bash
   npm --version  # Should show 10.x.x or higher
   ```

4. **Git** - Latest version
   ```bash
   git --version
   ```

### Optional Tools

- **pgAdmin 4** - GUI tool for PostgreSQL database management
- **Postman** - For API testing
- **VS Code** - Recommended IDE with Angular and PostgreSQL extensions

---

## Project Structure

The MScan project consists of three main directories:

```
mscan/
├── mscan-server/          # Backend API (Express.js + PostgreSQL)
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Auth, validation, rate limiting
│   │   └── server.js      # Entry point
│   ├── database/
│   │   ├── full_setup.sql # Complete database schema
│   │   └── migrations/    # Database migrations
│   └── package.json
│
├── mscan-client/          # Frontend (Angular 21)
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/    # UI components
│   │   │   ├── services/      # API services
│   │   │   ├── guards/        # Route guards
│   │   │   ├── store/         # NgRx state management
│   │   │   └── models/        # TypeScript interfaces
│   │   └── main.ts
│   └── package.json
│
└── mscan-e2e/             # End-to-End tests (Playwright)
    ├── tests/
    └── playwright.config.ts
```

---

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd mscan
```

### 2. Install Backend Dependencies

```bash
cd mscan-server
npm install
```

**Key Backend Dependencies:**
- `express` (4.18.2) - Web framework
- `pg` (8.11.3) - PostgreSQL client
- `jsonwebtoken` (9.0.2) - JWT authentication
- `nodemailer` (6.9.7) - Email service
- `cors` (2.8.5) - CORS middleware
- `helmet` (7.1.0) - Security headers
- `bcryptjs` (2.4.3) - Password hashing
- `dotenv` (16.3.1) - Environment variables
- `qrcode` (1.5.3) - QR code generation
- `express-rate-limit` (7.1.5) - Rate limiting

### 3. Install Frontend Dependencies

```bash
cd ../mscan-client
npm install
```

**Key Frontend Dependencies:**
- `@angular/core` (21.0.0) - Angular framework
- `@ngrx/store` (21.0.1) - State management
- `@ngrx/effects` (21.0.1) - Side effects
- `tailwindcss` (4.1.12) - CSS framework
- `typescript` (5.9.2) - TypeScript compiler
- `rxjs` (7.8.0) - Reactive programming
- `chart.js` - Analytics charts
- `qrcode` - QR code display

### 4. Install E2E Test Dependencies (Optional)

```bash
cd ../mscan-e2e
npm install
npx playwright install  # Install browser binaries
```

---

## Environment Configuration

### Backend Environment Variables

Create `.env` file in `mscan-server/` directory:

```env
# Server Configuration
PORT=8080
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mscan_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRY=1h
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key
REFRESH_TOKEN_EXPIRY=7d

# Email Configuration (for OTP delivery)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=MScan <noreply@mscan.com>

# Application URLs
CLIENT_URL=http://localhost:4200
SERVER_URL=http://localhost:8080

# OTP Configuration
OTP_EXPIRY_MINUTES=5
OTP_LENGTH=6

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_DIR=./uploads

# Coupon Configuration
COUPON_CODE_LENGTH=8
QR_CODE_SIZE=300

# Webhook Configuration (optional)
WEBHOOK_SECRET=your-webhook-secret-key
```

### Frontend Environment Configuration

Create `mscan-client/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api',
  serverUrl: 'http://localhost:8080',
  defaultSubdomain: 'localhost',
  enableDebugMode: true
};
```

Create `mscan-client/src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.yourdomain.com/api',
  serverUrl: 'https://api.yourdomain.com',
  defaultSubdomain: 'app',
  enableDebugMode: false
};
```

---

## Database Setup

### 1. Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE mscan_db;

# Connect to the database
\c mscan_db

# Exit psql
\q
```

### 2. Run Database Setup Script

The project includes a complete database setup script that creates all tables, indexes, triggers, and initial data.

```bash
cd mscan-server

# Run the full setup script
psql -U postgres -d mscan_db -f database/full_setup.sql
```

This script creates:
- **30+ tables** including tenants, users, products, coupons, transactions, etc.
- **Indexes** for optimal query performance
- **Foreign key constraints** for data integrity
- **Trigger functions** for automation (e.g., audit logs)
- **Check constraints** for business logic
- **Initial reference data** (roles, permissions)

### 3. Verify Database Setup

```bash
# Connect to database
psql -U postgres -d mscan_db

# List all tables
\dt

# Verify core tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

# Check table counts
SELECT
  'tenants' as table_name, COUNT(*) as count FROM tenants
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'coupons', COUNT(*) FROM coupons;
```

### 4. Database Migration System (Optional)

For incremental changes after initial setup:

```bash
cd mscan-server

# Run pending migrations
npm run migrate

# Or manually run migration files
node database/run-migrations.js migrate
```

---

## Running the Application

### 1. Start Backend Server

```bash
cd mscan-server

# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:8080`

**Verify Backend:**
```bash
curl http://localhost:8080/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### 2. Start Frontend Application

```bash
cd mscan-client

# Development server
ng serve
# or
npm start

# The app will be available at http://localhost:4200
```

**Build for Production:**
```bash
ng build --configuration production
# Output: dist/mscan-client/
```

### 3. Run Both Concurrently

You can use `concurrently` to run both servers:

```bash
# Install concurrently globally
npm install -g concurrently

# From project root
concurrently "cd mscan-server && npm run dev" "cd mscan-client && ng serve"
```

---

## Initial Configuration

### 1. Create Super Admin User

After starting the application, you need to create the first Super Admin user.

**Method 1: Via API**

```bash
curl -X POST http://localhost:8080/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sumantmishra511@gmail.com",
    "userType": "SUPER_ADMIN"
  }'

# Check your email for OTP (or check database otps table)
# Then verify OTP:

curl -X POST http://localhost:8080/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sumantmishra511@gmail.com",
    "otp": "123456"
  }'
```

**Method 2: Direct Database Insert**

```sql
-- Connect to database
psql -U postgres -d mscan_db

-- Insert Super Admin user
INSERT INTO users (
  id,
  email,
  user_type,
  is_active,
  email_verified,
  created_at
) VALUES (
  gen_random_uuid(),
  'sumantmishra511@gmail.com',
  'SUPER_ADMIN',
  true,
  true,
  NOW()
) RETURNING id;

-- Create OTP for login (expires in 5 minutes)
INSERT INTO otps (user_id, otp, expires_at)
SELECT
  id,
  '123456',
  NOW() + INTERVAL '5 minutes'
FROM users
WHERE email = 'sumantmishra511@gmail.com';
```

### 2. Create First Tenant

Super Admin can create tenants via the UI or API:

```bash
curl -X POST http://localhost:8080/api/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -d '{
    "tenant_name": "Demo Company",
    "subdomain": "demo",
    "admin_email": "admin@demo.com",
    "contact_email": "contact@demo.com",
    "contact_phone": "+1234567890",
    "initial_credits": 1000,
    "is_active": true,
    "settings": {
      "allow_public_scan": true,
      "require_email_verification": true,
      "max_products": 1000,
      "max_coupons_per_batch": 10000
    }
  }'
```

### 3. Super Admin Features Available

After login as Super Admin, you can:

1. **Tenant Management**
   - Create/edit/delete tenants
   - View all tenants and their statistics
   - Manage tenant credits and settings
   - Activate/deactivate tenants

2. **Credit Approval System**
   - View all credit requests from tenants
   - Approve/reject credit requests
   - View credit transaction history
   - Set credit limits

3. **System Analytics**
   - View system-wide statistics
   - Monitor tenant activity
   - Track coupon usage across all tenants
   - Generate reports

4. **User Management**
   - View all users across tenants
   - Manage user roles and permissions
   - Deactivate/activate users

### 4. Tenant Admin Features Available

After creating a tenant, the Tenant Admin can:

1. **Product Catalog Management**
   - Create product templates with variants
   - Define custom attributes (JSONB)
   - Manage categories and tags
   - Import/export products

2. **Coupon Management**
   - Create coupons (single or batch)
   - Generate QR codes
   - Manage coupon lifecycle (draft → printed → active → used)
   - Track coupon redemption

3. **Credit Management**
   - Request credits from Super Admin
   - View credit balance and transaction history
   - Monitor credit usage

4. **User Management**
   - Create tenant users with specific permissions
   - Assign roles (TENANT_ADMIN, TENANT_USER)
   - Manage user permissions (VIEW_PRODUCTS, CREATE_COUPONS, etc.)

5. **Verification Apps**
   - Configure multiple verification applications
   - Generate API keys for external apps
   - Monitor app usage

6. **Analytics Dashboard**
   - View tenant-specific analytics
   - Track coupon redemption rates
   - Monitor product performance
   - Generate custom reports

---

## Testing Setup

### 1. Backend Unit Tests

```bash
cd mscan-server

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/__tests__/catalogue.test.js
```

**Key Test Files:**
- `src/__tests__/catalogue.test.js` - Product catalog tests
- `src/__tests__/batch-coupons.test.js` - Batch coupon creation tests
- `src/__tests__/public-scan.test.js` - Public scanning API tests
- `src/services/__tests__/coupon-generator.service.test.js` - Coupon generation tests

### 2. Frontend Unit Tests

```bash
cd mscan-client

# Run all tests
ng test

# Run with coverage
ng test --code-coverage

# Run specific component test
ng test --include='**/product-list.component.spec.ts'
```

### 3. E2E Tests (Playwright)

```bash
cd mscan-e2e

# Run all E2E tests
npm test

# Run in headed mode (see browser)
npm test -- --headed

# Run specific test suite
npm test -- tests/super-admin/tenant-admin-management.spec.ts

# Run with UI mode
npm test -- --ui

# Generate HTML report
npx playwright show-report
```

**E2E Test Coverage:**

**Super Admin Tests:**
- `tests/super-admin/tenant-admin-management.spec.ts` - Tenant admin management
- `tests/super-admin/credit-approval.spec.ts` - Credit approval workflow
- `tests/super-admin/user-management.spec.ts` - User management

**Tenant Admin Tests:**
- `tests/tenant-admin/batch-activation.spec.ts` - Batch coupon activation
- `tests/tenant-admin/coupon-status-transitions.spec.ts` - Coupon lifecycle
- `tests/tenant-admin/credit-management.spec.ts` - Credit management
- `tests/tenant-admin/permission-enforcement.spec.ts` - Permission testing
- `tests/tenant-admin/verification-app-complete.spec.ts` - Verification app setup
- `tests/tenant-admin/multi-app-architecture.spec.ts` - Multi-app testing
- `tests/tenant-admin/integration-workflows.spec.ts` - Integration workflows
- `tests/tenant-admin/search-filter-pagination.spec.ts` - Search and filters
- `tests/tenant-admin/user-profile.spec.ts` - User profile management

### 4. API Testing with Postman

Import the Postman collection (if available) or create your own:

**Sample Collection Structure:**
```
MScan API/
├── Authentication/
│   ├── Request OTP
│   ├── Verify OTP
│   └── Refresh Token
├── Tenants/
│   ├── Create Tenant
│   ├── List Tenants
│   └── Update Tenant
├── Products/
├── Coupons/
├── Credits/
└── Analytics/
```

---

## Development Workflow

### Backend Development

1. **Code Structure:**
   ```
   src/
   ├── controllers/    # Handle HTTP requests/responses
   ├── services/       # Business logic
   ├── routes/         # Route definitions
   ├── middleware/     # Auth, validation, rate limiting
   └── server.js       # Express app setup
   ```

2. **Adding New API Endpoint:**
   ```javascript
   // 1. Create service (src/services/myFeature.service.js)
   const myFeatureService = {
     async getData() {
       // Business logic
     }
   };

   // 2. Create controller (src/controllers/myFeature.controller.js)
   const myFeatureController = {
     async getData(req, res) {
       const data = await myFeatureService.getData();
       res.json({ success: true, data });
     }
   };

   // 3. Create routes (src/routes/myFeature.routes.js)
   const express = require('express');
   const router = express.Router();
   const { authenticate } = require('../middleware/auth.middleware');

   router.get('/', authenticate, myFeatureController.getData);

   module.exports = router;

   // 4. Register in server.js
   app.use('/api/my-feature', require('./routes/myFeature.routes'));
   ```

3. **Database Changes:**
   - Create migration file in `database/migrations/`
   - Run migration: `npm run migrate`
   - Update `full_setup.sql` for fresh installs

### Frontend Development

1. **Code Structure:**
   ```
   src/app/
   ├── components/     # UI components (standalone)
   ├── services/       # HTTP services
   ├── guards/         # Route guards
   ├── store/          # NgRx state management
   │   ├── actions/
   │   ├── reducers/
   │   ├── effects/
   │   ├── selectors/
   │   └── facades/
   └── models/         # TypeScript interfaces
   ```

2. **Creating New Component:**
   ```bash
   # Generate standalone component
   ng generate component components/my-feature --standalone

   # Generate with service
   ng generate component components/my-feature --standalone
   ng generate service services/my-feature
   ```

3. **NgRx State Management:**
   ```typescript
   // 1. Define actions (store/actions/my-feature.actions.ts)
   export const loadData = createAction('[MyFeature] Load Data');
   export const loadDataSuccess = createAction(
     '[MyFeature] Load Data Success',
     props<{ data: MyData[] }>()
   );

   // 2. Create reducer (store/reducers/my-feature.reducer.ts)
   export const reducer = createReducer(
     initialState,
     on(loadDataSuccess, (state, { data }) => ({ ...state, data }))
   );

   // 3. Create effects (store/effects/my-feature.effects.ts)
   loadData$ = createEffect(() =>
     this.actions$.pipe(
       ofType(loadData),
       switchMap(() =>
         this.service.getData().pipe(
           map(data => loadDataSuccess({ data }))
         )
       )
     )
   );

   // 4. Create selectors (store/selectors/my-feature.selectors.ts)
   export const selectData = createSelector(
     selectFeatureState,
     state => state.data
   );

   // 5. Create facade (store/facades/my-feature.facade.ts)
   export class MyFeatureFacade {
     data$ = this.store.select(selectData);
     loadData() {
       this.store.dispatch(loadData());
     }
   }
   ```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-new-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push to remote
git push origin feature/my-new-feature

# Create pull request
# After review and approval, merge to main
```

### Code Style

**Backend (JavaScript):**
- Use ES6+ features
- Async/await for asynchronous operations
- Destructuring for cleaner code
- Meaningful variable names
- JSDoc comments for complex functions

**Frontend (TypeScript):**
- Strict TypeScript configuration
- RxJS operators for reactive programming
- OnPush change detection for performance
- Standalone components (Angular 21+)
- Tailwind CSS for styling

---

## Troubleshooting

### Database Connection Issues

**Problem:** Cannot connect to PostgreSQL
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql  # Linux
brew services list | grep postgresql  # macOS

# Start PostgreSQL
sudo systemctl start postgresql  # Linux
brew services start postgresql  # macOS

# Verify connection
psql -U postgres -d mscan_db -c "SELECT NOW();"
```

### Port Already in Use

**Problem:** Port 8080 or 4200 already in use

**Solution:**
```bash
# Find process using port
lsof -i :8080  # macOS/Linux
netstat -ano | findstr :8080  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Or change port in .env or angular.json
```

### Email/OTP Not Working

**Problem:** OTP emails not being sent

**Solution:**
1. Check email configuration in `.env`
2. For Gmail, use App-Specific Password:
   - Go to Google Account → Security → 2-Step Verification → App Passwords
   - Generate new app password
   - Use this password in `EMAIL_PASSWORD`

3. For development, check OTP directly in database:
   ```sql
   SELECT * FROM otps
   WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com')
   ORDER BY created_at DESC LIMIT 1;
   ```

### JWT Token Issues

**Problem:** "Invalid token" or "Token expired"

**Solution:**
1. Clear browser local storage
2. Request new OTP and login again
3. Check JWT_SECRET matches in `.env`
4. Verify token expiry settings

### CORS Errors

**Problem:** Frontend cannot access backend API

**Solution:**
1. Verify `CLIENT_URL` in backend `.env`:
   ```env
   CLIENT_URL=http://localhost:4200
   ```

2. Check CORS configuration in `server.js`:
   ```javascript
   app.use(cors({
     origin: process.env.CLIENT_URL,
     credentials: true
   }));
   ```

### Database Migration Errors

**Problem:** Migration fails with constraint errors

**Solution:**
```bash
# Rollback migrations
node database/run-migrations.js rollback

# Or fresh setup
psql -U postgres -c "DROP DATABASE mscan_db;"
psql -U postgres -c "CREATE DATABASE mscan_db;"
psql -U postgres -d mscan_db -f database/full_setup.sql
```

### Angular Build Errors

**Problem:** Build fails with type errors

**Solution:**
```bash
# Clear Angular cache
rm -rf .angular/cache

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript version
npm list typescript
# Should be ~5.9.2
```

### Playwright Test Failures

**Problem:** E2E tests failing

**Solution:**
```bash
# Update browser binaries
npx playwright install

# Run in headed mode to see what's happening
npx playwright test --headed

# Check if backend and frontend are running
curl http://localhost:8080/api/health
curl http://localhost:4200

# Check test database is set up correctly
```

### Performance Issues

**Problem:** Slow API responses or frontend lag

**Backend Solutions:**
1. Add database indexes:
   ```sql
   CREATE INDEX idx_coupons_tenant ON coupons(tenant_id);
   CREATE INDEX idx_products_tenant ON products(tenant_id);
   ```

2. Enable query logging to find slow queries:
   ```javascript
   // In database connection
   const client = new Client({
     // ...
     log: console.log
   });
   ```

3. Implement caching for frequently accessed data

**Frontend Solutions:**
1. Use OnPush change detection
2. Implement virtual scrolling for large lists
3. Lazy load modules/components
4. Optimize NgRx selectors with memoization

### Common Error Messages

**"Tenant not found"**
- Verify subdomain in request or token
- Check tenant is active: `SELECT * FROM tenants WHERE subdomain = 'your-subdomain';`

**"Insufficient credits"**
- Check tenant credit balance: `SELECT credit_balance FROM tenants WHERE id = 'tenant-id';`
- Request credits via credit approval system

**"Permission denied"**
- Verify user has required permission
- Check user_permissions table
- Ensure JWT token includes correct user_type and tenant_id

**"Coupon already used"**
- Coupon status is 'USED' or 'EXPIRED'
- Check: `SELECT status FROM coupons WHERE code = 'coupon-code';`

---

## Production Deployment

### Environment Preparation

1. **Update environment variables for production:**
   ```env
   NODE_ENV=production
   DB_HOST=your-production-db-host
   JWT_SECRET=use-strong-random-secret
   CLIENT_URL=https://app.yourdomain.com
   ```

2. **Build frontend:**
   ```bash
   cd mscan-client
   ng build --configuration production
   ```

3. **Database setup:**
   - Use managed PostgreSQL service (AWS RDS, DigitalOcean, etc.)
   - Enable SSL connections
   - Set up automated backups
   - Configure connection pooling

4. **Backend deployment:**
   - Use PM2 or similar process manager
   - Set up reverse proxy (Nginx)
   - Enable HTTPS with SSL certificate
   - Configure environment variables
   - Set up logging and monitoring

5. **Security checklist:**
   - [ ] Change all default secrets
   - [ ] Enable HTTPS
   - [ ] Configure rate limiting
   - [ ] Set up firewall rules
   - [ ] Enable database SSL
   - [ ] Configure CORS properly
   - [ ] Set secure cookie flags
   - [ ] Enable Helmet.js security headers
   - [ ] Set up monitoring and alerts
   - [ ] Configure backup strategy

---

## Support and Resources

### Documentation
- API Reference: `doc_new/01_API_REFERENCE.md`
- Database Design: `doc_new/02_DATABASE_DESIGN.md`
- Architecture: `doc_new/04_ARCHITECTURE.md`
- Frontend Components: `doc_new/05_FRONTEND_COMPONENTS.md`
- Features Guide: `doc_new/06_FEATURES.md`
- External APIs: `doc_new/07_EXTERNAL_APIS.md`

### Useful Commands Reference

```bash
# Backend
npm run dev              # Start development server
npm test                 # Run tests
npm run migrate          # Run database migrations

# Frontend
ng serve                 # Start development server
ng build --prod          # Production build
ng test                  # Run unit tests
ng generate component X  # Generate component

# Database
psql -U postgres -d mscan_db                    # Connect to database
psql -U postgres -d mscan_db -f script.sql      # Run SQL script
pg_dump -U postgres mscan_db > backup.sql       # Backup database
psql -U postgres mscan_db < backup.sql          # Restore database

# E2E Tests
npx playwright test                             # Run all tests
npx playwright test --headed                    # Run with browser visible
npx playwright test --ui                        # Run in UI mode
npx playwright show-report                      # View test report
```

---

## Next Steps

After completing the setup:

1. **Explore the application:**
   - Login as Super Admin
   - Create a test tenant
   - Create products and coupons
   - Test the scanning functionality

2. **Read additional documentation:**
   - Review API Reference for available endpoints
   - Study Database Design for data structure
   - Check Features Guide for detailed feature documentation

3. **Start development:**
   - Choose a feature to work on
   - Follow the development workflow
   - Write tests for new features
   - Submit pull requests

4. **Join the team:**
   - Set up your development environment
   - Review coding standards
   - Participate in code reviews
   - Contribute to documentation

---

**Document Version:** 1.0
**Last Updated:** 2026-01-26
**Maintained By:** MScan Development Team
