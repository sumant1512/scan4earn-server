#!/usr/bin/env node
/**
 * Test Mobile Scanning APIs
 * Tests the new POST /api/mobile/v1/scan and GET /api/mobile/v1/scan/history endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://tenant1.localhost:8080';
const API_BASE = `${BASE_URL}/api/mobile/v1`;

let accessToken = '';
let customerId = '';
let scanId = '';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function test1_RequestOTP() {
  log('\n📱 Test 1: Request OTP', 'blue');
  try {
    const response = await axios.post(`${API_BASE}/auth/request-otp`, {
      phone_e164: '+919876543210'
    });
    log(`✅ OTP requested successfully: ${JSON.stringify(response.data)}`, 'green');
    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function test2_VerifyOTP() {
  log('\n🔐 Test 2: Verify OTP and Login', 'blue');
  try {
    const response = await axios.post(`${API_BASE}/auth/verify-otp`, {
      phone_e164: '+919876543210',
      otp: '000000' // Dev mode OTP
    });
    log(`✅ Login successful`, 'green');
    accessToken = response.data.data.accessToken;
    log(`   Access Token: ${accessToken.substring(0, 50)}...`, 'yellow');
    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function test3_GetProfile() {
  log('\n👤 Test 3: Get Customer Profile', 'blue');
  try {
    const response = await axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    log(`✅ Profile retrieved`, 'green');
    customerId = response.data.customer.id;
    log(`   Customer ID: ${customerId}`, 'yellow');
    log(`   Phone: ${response.data.customer.phone_e164}`, 'yellow');
    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function test4_ScanCoupon() {
  log('\n🎫 Test 4: Scan Coupon (Mobile API)', 'blue');
  try {
    const response = await axios.post(`${API_BASE}/scan`, {
      coupon_code: 'TEST-COUPON-001',
      app_code: 'app1',
      location: {
        lat: 28.7041,
        lng: 77.1025
      },
      scanned_at: new Date().toISOString(),
      device_info: {
        model: 'iPhone 14 Pro',
        os_version: '17.2'
      }
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (response.data.success) {
      log(`✅ Coupon scanned successfully!`, 'green');
      scanId = response.data.scan_id;
      log(`   Scan ID: ${scanId}`, 'yellow');
      log(`   Coupon: ${response.data.coupon.code}`, 'yellow');
      log(`   Discount: ${response.data.coupon.discount_currency} ${response.data.coupon.discount_value}`, 'yellow');
      log(`   Credits Earned: ${response.data.reward.credits_earned}`, 'yellow');
      log(`   Credits Balance: ${response.data.reward.credits_balance}`, 'yellow');
    } else {
      log(`⚠️  Scan failed: ${response.data.message}`, 'yellow');
      log(`   Error: ${response.data.error}`, 'yellow');
    }
    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.message || error.message}`, 'red');
    if (error.response?.data) {
      log(`   Error Code: ${error.response.data.error}`, 'red');
    }
    return false;
  }
}

async function test5_GetScanHistory() {
  log('\n📋 Test 5: Get Scan Transaction History', 'blue');
  try {
    const response = await axios.get(`${API_BASE}/scan/history?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    log(`✅ Scan history retrieved`, 'green');
    log(`   Total Scans: ${response.data.pagination.total}`, 'yellow');
    log(`   Successful: ${response.data.summary.successful_scans}`, 'yellow');
    log(`   Failed: ${response.data.summary.failed_scans}`, 'yellow');
    log(`   Total Credits: ${response.data.summary.total_credits_earned}`, 'yellow');
    log(`   Total Savings: ${response.data.summary.total_discount_value}`, 'yellow');
    
    if (response.data.data.length > 0) {
      log(`\n   Recent Scans:`, 'yellow');
      response.data.data.slice(0, 3).forEach((scan, i) => {
        log(`   ${i + 1}. ${scan.coupon_code} - ${scan.status} (${scan.scanned_at})`, 'yellow');
      });
    }
    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function test6_GetScanDetails() {
  log('\n🔍 Test 6: Get Specific Scan Details', 'blue');
  if (!scanId) {
    log(`⚠️  Skipped: No scan ID available`, 'yellow');
    return true;
  }
  
  try {
    const response = await axios.get(`${API_BASE}/scan/${scanId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    log(`✅ Scan details retrieved`, 'green');
    log(`   Coupon: ${response.data.data.coupon_code}`, 'yellow');
    log(`   Status: ${response.data.data.status}`, 'yellow');
    log(`   App: ${response.data.data.app.name}`, 'yellow');
    log(`   Location: ${response.data.data.location ? 'Yes' : 'No'}`, 'yellow');
    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function test7_GetScanStats() {
  log('\n📊 Test 7: Get Scan Statistics', 'blue');
  try {
    const response = await axios.get(`${API_BASE}/scan/stats/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    log(`✅ Statistics retrieved`, 'green');
    log(`   Total Scans: ${response.data.data.total_scans}`, 'yellow');
    log(`   Successful: ${response.data.data.successful_scans}`, 'yellow');
    log(`   Credits Balance: ${response.data.data.credits_balance}`, 'yellow');
    log(`   Total Savings: ${response.data.data.total_savings}`, 'yellow');
    
    if (response.data.data.top_apps.length > 0) {
      log(`\n   Top Apps:`, 'yellow');
      response.data.data.top_apps.forEach((app, i) => {
        log(`   ${i + 1}. ${app.app_name} (${app.scan_count} scans)`, 'yellow');
      });
    }
    return true;
  } catch (error) {
    log(`❌ Failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  log('\n╔══════════════════════════════════════════╗', 'blue');
  log('║   Mobile Scanning API Test Suite        ║', 'blue');
  log('╚══════════════════════════════════════════╝', 'blue');
  
  const tests = [
    test1_RequestOTP,
    test2_VerifyOTP,
    test3_GetProfile,
    test4_ScanCoupon,
    test5_GetScanHistory,
    test6_GetScanDetails,
    test7_GetScanStats
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await test();
    if (result) passed++;
    else failed++;
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
  }
  
  log('\n╔══════════════════════════════════════════╗', 'blue');
  log(`║   Test Results: ${passed}/${tests.length} passed             ║`, passed === tests.length ? 'green' : 'yellow');
  log('╚══════════════════════════════════════════╝', 'blue');
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Test suite failed: ${error.message}`, 'red');
  process.exit(1);
});
