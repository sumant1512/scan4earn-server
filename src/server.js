/**
 * Main Server Application
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./config/database');
// Import routes
const authRoutes = require('./routes/auth.routes');
const appAuthRoutes = require('./routes/appAuth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const rewardsRoutes = require('./routes/rewards.routes');
const batchRoutes = require('./routes/batchRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const productsRoutes = require('./routes/products.routes');
const publicScanRoutes = require('./routes/publicScan.routes');
const mobileAuthRoutes = require('./routes/mobileAuth.routes');
const userCreditsRoutes = require('./routes/userCredits.routes');
const externalAppRoutes = require('./routes/externalApp.routes');
const permissionsRoutes = require('./routes/permissions.routes');
const tenantUsersRoutes = require('./routes/tenantUsers.routes');
const tagRoutes = require('./routes/tag.routes'); // Tag system
const apiConfigRoutes = require('./routes/apiConfig.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const webhooksRoutes = require('./routes/webhooks.routes');
const mobileApiV2Routes = require('./routes/mobileApiV2.routes');
const ecommerceApiRoutes = require('./routes/ecommerceApi.routes');
const featureRoutes = require('./routes/feature.routes');
const dealerRoutes = require('./routes/dealer.routes');
const dealerMobileRoutes = require('./routes/dealerMobile.routes');
const cashbackMobileRoutes = require('./routes/cashbackMobile.routes');
const publicCashbackRoutes = require('./routes/publicCashback.routes');
const cashbackAdminRoutes = require('./routes/cashbackAdmin.routes');
const ecommerceMobileRoutes = require('./routes/ecommerceMobile.routes');
const mobilePointsRoutes = require('./routes/mobilePoints.routes');
const mobileTransactionsRoutes = require('./routes/mobileTransactions.routes');
const redemptionAdminRoutes = require('./routes/redemptionAdmin.routes');
// Import middleware
const errorHandler = require('./middleware/error.middleware');
const { subdomainMiddleware } = require('./middleware/subdomain.middleware');

// Import new common interceptors and error handling
const { errorHandler: globalErrorHandler } = require('./modules/common/middleware/errorHandler.middleware');
const { requestLogger, requestValidator, sanitizeBody } = require('./modules/common/interceptors/request.interceptor');
const { securityHeaders, compressionHints } = require('./modules/common/interceptors/response.interceptor');

// Import new modular routes
const superAdminRoutes = require('./modules/super-admin/routes/index');
const tenantAdminRoutes = require('./modules/tenant-admin/routes/index');

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================
// Middleware
// ============================================
app.use(helmet());

// CORS Configuration - Support wildcard subdomains
const baseDomain = process.env.DOMAIN_BASE || 'scan4earn.com';
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      `http://localhost:4200`,
      `http://localhost:8081`,
      `http://localhost:8080`,
      `http://localhost:62373`, // ✅ add this for local testing with dynamic ports
      `http://${baseDomain}`,
      `https://${baseDomain}`,
      'https://scan4earn.com',   // ✅ add this
      'https://sumukham.com',   // ✅ add this
      'https://palspaint.com',   // ✅ add this
      'https://www.sumukham.com', // ✅ add this
      'https://www.palspaint.com', // ✅ add this
      'https://www.scan4earn.com' // ✅ optional but recommended
    ];

    const isAllowed =
      // Exact match
      allowedOrigins.includes(origin) ||

      // Allow subdomains of localhost
      /^https?:\/\/[a-z0-9-]+\.localhost(:\d+)?$/.test(origin) ||

      // Allow subdomains of your base domain (single-level)
      new RegExp(`^https?://[a-z0-9-]+\\.${baseDomain.replace('.', '\\.')}$`).test(origin) ||

      // ✅ Allow ALL Google Cloud Run URLs
      /^https:\/\/[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.run\.app$/.test(origin);

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'X-Customer-Ref', 'X-Verification-App-Id']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply common interceptors
app.use(securityHeaders);
app.use(compressionHints);
app.use(requestLogger);
app.use(sanitizeBody);

// Subdomain detection middleware (must be before routes)
app.use(subdomainMiddleware);

// Request logging
app.use((req, res, next) => {
  const subdomain = req.subdomain || 'root';
  const tenant = req.tenant ? req.tenant.tenant_name : 'N/A';
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} [${subdomain}] [${tenant}]`);
  next();
});

// ============================================
// Health Check (returns current status without blocking)
// ============================================
app.get('/health', (req, res) => {
  // Return current dbStatus without blocking on a new health check
  // This allows Cloud Run to get a response quickly
  if (dbStatus.success) {
    res.json({
      status: 'healthy',
      server: 'running',
      database: dbStatus.status,
      timestamp: dbStatus.timestamp,
      responseTime: dbStatus.responseTime
    });
  } else {
    // Server is running but DB is not ready yet
    res.status(503).json({
      status: 'unhealthy',
      server: 'running',
      database: dbStatus.status,
      error: dbStatus.error,
      timestamp: new Date().toISOString(),
      responseTime: dbStatus.responseTime
    });
  }
});

// ============================================
// API Routes
// ============================================

// Core routes (refactored with modular structure)
app.use('/api/auth', authRoutes);
app.use('/api/app/auth', appAuthRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Super Admin routes (from modules/super-admin but same URLs)
const superAdminTenantRoutes = require('./modules/super-admin/routes/tenant.routes');
const creditsRoutes = require('./routes/credits.routes'); // Unified credits router (routes by role)
app.use('/api/tenants', superAdminTenantRoutes);
app.use('/api/credits', creditsRoutes);

// Tenant Admin routes (from modules/tenant-admin but same URLs)
const tenantAdminTemplateRoutes = require('./modules/tenant-admin/routes/template.routes');
app.use('/api/templates', tenantAdminTemplateRoutes);

// Other routes
app.use('/api/rewards', rewardsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/tenant/batches', batchRoutes);
app.use('/api/tenant/rewards/campaigns', campaignRoutes);
app.use('/api/public/scan', publicScanRoutes);
app.use('/api/mobile/v1/auth', mobileAuthRoutes);
app.use('/api/mobile/v1/scan', require('./routes/mobileScan.routes'));
app.use('/api/mobile/v2', mobileApiV2Routes);
app.use('/api/ecommerce/v1', ecommerceApiRoutes);
app.use('/api/v1/permissions', permissionsRoutes);
app.use('/api/v1/tenants', tenantUsersRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/verification-apps', apiConfigRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', webhooksRoutes);
app.use('/api', userCreditsRoutes);
app.use('/api/features', featureRoutes);
app.use('/api/app', externalAppRoutes); // External app routes - scoped to /api/app/* to prevent intercepting other routes

// New: Dealer management (Tenant Admin)
app.use('/api/v1/tenants/:tenantId/dealers', dealerRoutes);

// New: Dealer mobile API
app.use('/api/mobile/v1/dealer', dealerMobileRoutes);

// New: Customer cashback mobile API
app.use('/api/mobile/v1/cashback', cashbackMobileRoutes);

// New: Public cashback (no app required)
app.use('/api/public/cashback', publicCashbackRoutes);

// New: Cashback admin API (tenant admin view)
app.use('/api/cashback', cashbackAdminRoutes);

// New: Ecommerce mobile API (customer catalog + profile)
app.use('/api/mobile/v1/ecommerce', ecommerceMobileRoutes);

// New: Customer loyalty points (transactions + redemption requests)
app.use('/api/mobile/v1/points', mobilePointsRoutes);

// New: Unified transaction history (scan + redeem) for CUSTOMER and DEALER
app.use('/api/mobile/v1/transactions', mobileTransactionsRoutes);

// Tenant admin: redemption request management (app-scoped)
app.use('/api/redemptions', redemptionAdminRoutes);

// ============================================
// Error Handling
// ============================================
// Use new global error handler (handles AppError instances)
app.use(globalErrorHandler);
// Fallback to legacy error handler for backward compatibility
app.use(errorHandler);

// ============================================
// 404 Handler
// ============================================

// Public QR landing route — handles scans from external QR scanners (Google Camera, etc.)
// Mobile app scans extract the coupon_code from the URL and call the API directly.
app.get('/scan/:coupon_code', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';

  try {
    const { coupon_code } = req.params;
    const tenantId = req.tenant ? req.tenant.id : null;
    const result = await db.query(
      'SELECT id, tenant_id, coupon_code, status FROM coupons WHERE coupon_code = $1 AND ($2::uuid IS NULL OR tenant_id = $2::uuid) LIMIT 1',
      [coupon_code, tenantId]
    );

    if (result.rows.length === 0 || result.rows[0].status !== 'active') {
      const errorMsg = result.rows.length === 0 ? 'Invalid coupon' : 'Coupon is not active';
      res.set('Cache-Control', 'no-store');
      return res.status(400).send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invalid Coupon</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <h2>Coupon Unavailable</h2>
  <p>${errorMsg}. Please contact support.</p>
</body>
</html>`);
    }

    // Redirect to the frontend login page with coupon_code as a query param.
    // After login, the app can read ?coupon_code= and trigger the scan flow.
    res.set('Cache-Control', 'no-store');
    return res.redirect(`${frontendUrl}/login?coupon_code=${encodeURIComponent(coupon_code)}`);
  } catch (err) {
    console.error('Landing route error:', err);
    return res.status(500).send('Server error. Please try again.');
  }
});

// 404 Handler (must be after all routes)
app.use('*', (req, res) => {
  res.status(404).json({
    status: false,
    message: 'Route not found'
  });
});


// ============================================
// Start Server
// ============================================
// Public QR landing route
app.get('/scan/:coupon_code', async (req, res) => {
  try {
    const { coupon_code } = req.params;
    const tenantId = req.tenant ? req.tenant.id : null;
    const result = await db.query(
      'SELECT id, tenant_id, coupon_code, status FROM coupons WHERE coupon_code = $1 AND ($2::uuid IS NULL OR tenant_id = $2::uuid) LIMIT 1',
      [coupon_code, tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_or_redeemed_coupon',
        message: 'Invalid or redeemed coupon. Please contact support.'
      });
    }
    const coupon = result.rows[0];
    if (coupon.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'invalid_or_redeemed_coupon',
        message: 'Coupon is not active.'
      });
    }
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      message: 'Login to get award',
      coupon_code,
      status: 'pending-verification'
    });
  } catch (err) {
    console.error('Landing route error:', err);
    return res.status(500).json({ status: false, error: 'server_error' });
  }
});

// ============================================
// Database Status (for background checking)
// ============================================
let dbStatus = {
  success: false,
  status: 'disconnected',
  database: null,
  error: null,
  timestamp: null,
  responseTime: null,
  config: null
};

/**
 * Retry database connection with fixed 5-second intervals
 * @param {number} maxAttempts - Maximum number of attempts (default: 3)
 * @returns {Promise<Object>} Health check result
 */
async function checkDatabaseWithRetry(maxAttempts = 3) {
  let lastError = null;

  const RETRY_INTERVAL = 5000;

  const dbConfig = {
    host: process.env.DB_HOST?.trim(),
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME?.trim(),
    user: process.env.DB_USER?.trim(),
    passwordExists: !!process.env.DB_PASSWORD
  };

  console.log('\n📦 DATABASE CONFIG');
  console.log(dbConfig);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`\n🔄 Database connection attempt ${attempt}/${maxAttempts}...`);
      const health = await db.checkHealth();

      if (health.success) {
        console.log(`✅ Connected on attempt ${attempt}!`);
        return health;
      }
      lastError = health;

      console.error('❌ HEALTH CHECK FAILED');
      console.error(health);

    } catch (err) {
      console.error('\n❌ DATABASE ERROR');
      console.error({
        message: err.message,
        code: err.code,
        stack: err.stack
      });

      lastError = {
        success: false,
        status: 'error',
        error: err.message,
        code: err.code
      };
    }

    // Wait before retry (fixed 5-second interval)
    if (attempt < maxAttempts) {
      console.log(`⏳ Waiting ${RETRY_INTERVAL / 1000}s before retry...`);
      await new Promise(resolve =>
        setTimeout(resolve, RETRY_INTERVAL)
      );
    }
  }

  console.error(`\n⚠️ All ${maxAttempts} attempts failed`);
  return lastError || {
    success: false,
    status: 'disconnected',
    error: 'Unknown database error'
  };
}

// ============================================
// Start Server (Cloud Run compatible)
// ============================================
async function startServer() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║            Scan4Earn Server - Starting Up                 ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Step 1: Start HTTP Server FIRST (required for Cloud Run)
    // Bind explicitly to 0.0.0.0 for Cloud Run compatibility
    console.log('🚀 Starting HTTP server...');
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n╔═══════════════════════════════════════════════════════╗');
      console.log('║            Scan4Earn Server - Listening!                  ║');
      console.log('╚═══════════════════════════════════════════════════════╝');
      console.log(`\n📡 Server: http://0.0.0.0:${PORT}`);
      console.log(`📝 API: http://0.0.0.0:${PORT}/api`);
      console.log(`🏥 Health: http://0.0.0.0:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('\n✨ HTTP server is listening!\n');
    });

    // Step 2: Check Database Connection in Background with Retries (non-blocking)
    console.log('🔍 Checking database connection in background (up to 3 retries)...');
    checkDatabaseWithRetry(3)
      .then((health) => {
        dbStatus = health;
        if (health.success) {
          console.log('✅ Database connection successful!');
          console.log(`  • Database: ${health.database}`);
          console.log(`  • Response Time: ${health.responseTime}`);
          console.log(`  • Status: ${health.status}`);
          console.log('\n📊 Server is fully operational!\n');
        } else {
          console.error('⚠️  Database connection failed after all retries:');
          console.error(`  • Message: ${health.error}`);
          console.error(`  • Code: ${health.code || 'N/A'}`);
          console.error('\n💡 Troubleshooting:');
          console.error('  1. Check if PostgreSQL is running');
          console.error('  2. Verify database exists: npm run db:setup');
          console.error('  3. Check .env configuration');
          console.error('  4. Test connection: psql -h localhost -U postgres -d scan4earn_db');
          console.error('\n⚠️  Server is running but will report unhealthy until DB connects.\n');
        }
      })
      .catch((err) => {
        console.error('⚠️  Database health check error:', err.message);
        dbStatus.success = false;
        dbStatus.status = 'error';
        dbStatus.error = err.message;
      });

    // Graceful Shutdown
    process.on('SIGTERM', () => {
      console.log('\n⚠️  SIGTERM signal received: closing HTTP server');
      server.close(() => {
        console.log('✅ HTTP server closed');
        db.pool.end(() => {
          console.log('✅ Database pool closed');
          process.exit(0);
        });
      });
    });

    process.on('SIGINT', () => {
      console.log('\n\n⚠️  SIGINT signal received: closing HTTP server');
      server.close(() => {
        console.log('✅ HTTP server closed');
        db.pool.end(() => {
          console.log('✅ Database pool closed');
          process.exit(0);
        });
      });
    });

    return server;

  } catch (error) {
    console.error('\n❌ FATAL ERROR during startup!');
    console.error(error);
    console.error('\n🛑 Server startup aborted.\n');
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;