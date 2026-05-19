#!/usr/bin/env node

/**
 * Test Database Health Check
 *
 * This script tests the database health check feature without starting the server.
 */

require('dotenv').config();
const db = require('./src/config/database');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const log = (msg, color = 'reset') => console.log(`${colors[color]}${msg}${colors.reset}`);

async function testHealthCheck() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║         Database Health Check - Test Script          ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  log('🔍 Running database health check...', 'cyan');

  const health = await db.checkHealth();

  console.log('\n📊 Health Check Results:\n');

  if (health.success) {
    log('✅ STATUS: HEALTHY\n', 'green');
    log('Details:', 'bold');
    log(`  • Database: ${health.database}`, 'green');
    log(`  • Timestamp: ${health.timestamp}`, 'cyan');
    log(`  • Response Time: ${health.responseTime}`, 'cyan');
    log(`  • Status: ${health.status}`, 'green');

    log('\nConfiguration:', 'bold');
    log(`  • Host: ${health.config.host}`, 'cyan');
    log(`  • Port: ${health.config.port}`, 'cyan');
    log(`  • Database: ${health.config.database}`, 'cyan');
    log(`  • User: ${health.config.user}`, 'cyan');

    log('\n✅ Server can start safely!\n', 'green');
    process.exit(0);

  } else {
    log('❌ STATUS: UNHEALTHY\n', 'red');
    log('Error Details:', 'bold');
    log(`  • Message: ${health.error}`, 'red');
    log(`  • Code: ${health.code || 'N/A'}`, 'red');
    log(`  • Response Time: ${health.responseTime}`, 'yellow');

    log('\nConfiguration:', 'bold');
    log(`  • Host: ${health.config.host}`, 'yellow');
    log(`  • Port: ${health.config.port}`, 'yellow');
    log(`  • Database: ${health.config.database}`, 'yellow');
    log(`  • User: ${health.config.user}`, 'yellow');

    log('\n💡 Troubleshooting:', 'yellow');
    log('  1. Check if PostgreSQL is running:', 'yellow');
    log('     brew services list | grep postgresql', 'cyan');
    log('  2. Start PostgreSQL if needed:', 'yellow');
    log('     brew services start postgresql@17', 'cyan');
    log('  3. Setup database if not exists:', 'yellow');
    log('     npm run db:setup', 'cyan');
    log('  4. Test direct connection:', 'yellow');
    log(`     psql -h ${health.config.host} -p ${health.config.port} -U ${health.config.user} -d ${health.config.database}`, 'cyan');

    log('\n❌ Server WILL NOT start in this state!\n', 'red');
    process.exit(1);
  }
}

// Run test
testHealthCheck().catch(error => {
  log('\n❌ Test failed with error:', 'red');
  console.error(error);
  process.exit(1);
}).finally(() => {
  // Close database pool
  db.pool.end();
});
