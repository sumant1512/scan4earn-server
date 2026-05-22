/**
 * Database Connection Pool
 */
const { Pool } = require('pg');

// ============================================
// Database Config Debug
// ============================================
const dbConfig = {
  host: process.env.DB_HOST?.trim(),
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME?.trim(),
  user: process.env.DB_USER?.trim(),
  passwordExists: !!process.env.DB_PASSWORD
};

// Track database connection status
let dbConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000; // 5 seconds

// ============================================
// PostgreSQL Pool
// ============================================
const pool = new Pool({
  host: process.env.DB_HOST?.trim(),
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME?.trim(),
  user: process.env.DB_USER?.trim(),
  password: process.env.DB_PASSWORD?.trim(),
  ssl: false, // IMPORTANT FOR EXTERNAL POSTGRES
  max: 5, // Smaller pool for Cloud Run debugging

  // Faster timeout debugging
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true
});

// Test connection
pool.on('connect', () => {
  console.log('📦 Database pool connection established');
  dbConnected = true;
  reconnectAttempts = 0;
});

pool.on('error', (err) => {
  // Handle database errors gracefully instead of exiting
  console.error('⚠️  Database pool error (FATAL):', err?.code, err?.message);

  if (err?.code === '57P01') {
    // Connection terminated by administrator
    console.error('❌ Database connection terminated by administrator');
    console.error('⏳ Attempting to reconnect...');
  } else if (err?.code === 'ECONNREFUSED') {
    console.error('❌ Cannot connect to database (connection refused)');
    console.error('⏳ Waiting before retry...');
  } else {
    console.error('❌ Unexpected database error:', err?.message);
  }

  dbConnected = false;

  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(`\n🔄 Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_INTERVAL / 1000}s...`);

    setTimeout(() => {
      console.log('🔍 Retrying database connection...');

      checkDatabaseHealth().catch((e) => {
        console.error('Reconnect attempt failed:', e.message);
      });
    }, RECONNECT_INTERVAL);
  } else {
    console.error('\n❌ Max reconnection attempts reached. Database unavailable.');
    console.error('⚠️  Server will continue running but database operations will fail.');
    console.error('💡 Restart the database service to restore connectivity.');
  }
});

/**
 * Database Health Check
 * Tests database connection with a simple query
 * @returns {Promise<Object>} Health check result with status and details
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();

  try {
    // Try to connect and run a simple query
    const result = await pool.query('SELECT NOW() as current_time, current_database() as database');
    const responseTime = Date.now() - startTime;

    dbConnected = true;
    reconnectAttempts = 0;

    return {
      success: true,
      status: 'healthy',
      database: result.rows[0].database,
      timestamp: result.rows[0].current_time,
      responseTime: `${responseTime}ms`,
      config: dbConfig
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    console.error('\n❌ DATABASE HEALTH CHECK FAILED');

    console.error({
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    dbConnected = false;

    return {
      success: false,
      status: 'unhealthy',
      error: error.message,
      code: error.code,
      responseTime: `${responseTime}ms`,
      config: dbConfig
    };
  }
}

// ============================================
// Exports
// ============================================
module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
  checkHealth: checkDatabaseHealth,
  isConnected: () => dbConnected,
  getReconnectStatus: () => ({
    connected: dbConnected,
    reconnectAttempts,
    maxAttempts: MAX_RECONNECT_ATTEMPTS
  })
};