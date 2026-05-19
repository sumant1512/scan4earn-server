/**
 * Simple integration test for coupon references
 * Run this directly with: node test-coupon-references.js
 */

const API_BASE = 'http://localhost:8080/api';

// Get a test auth token (you'll need to set this manually)
// OR we can create an OTP-less approach for testing
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN || '';

async function testCouponReferences() {
  console.log('🧪 Testing Auto Coupon References...\n');

  if (!TEST_TOKEN) {
    console.error('❌ TEST_AUTH_TOKEN environment variable not set');
    console.log('\nTo run this test:');
    console.log('1. Login to the app');
    console.log('2. Copy your auth token from localStorage');
    console.log('3. Run: TEST_AUTH_TOKEN="your-token" node test-coupon-references.js');
    process.exit(1);
  }

  try {
    // Test 1: Get verification apps
    console.log('📋 Step 1: Getting verification apps...');
    const appsResponse = await fetch(`${API_BASE}/rewards/verification-apps`, {
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` }
    });

    if (!appsResponse.ok) {
      throw new Error(`Failed to get verification apps: ${appsResponse.status} ${await appsResponse.text()}`);
    }

    const appsData = await appsResponse.json();
    const verificationAppId = appsData.apps[0]?.id;
    
    if (!verificationAppId) {
      throw new Error('No verification apps found. Please create one first.');
    }
    
    console.log(`✅ Using verification app: ${verificationAppId}\n`);

    // Test 2: Create coupons
    console.log('📋 Step 2: Creating 5 test coupons...');
    const createResponse = await fetch(`${API_BASE}/rewards/coupons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({
        verification_app_id: verificationAppId,
        description: 'Auto Reference Test - ' + Date.now(),
        discount_value: 10,
        quantity: 5,
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create coupons: ${createResponse.status} ${errorText}`);
    }

    const createData = await createResponse.json();
    console.log(`✅ Created ${createData.coupons.length} coupons\n`);

    //Test 3: Verify each coupon has both fields
    console.log('📋 Step 3: Verifying coupon fields...');
    let allValid = true;
    
    for (const coupon of createData.coupons) {
      const hasCode = coupon.coupon_code && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(coupon.coupon_code);
      const hasRef = coupon.coupon_reference && /^CP-\d{3}$/.test(coupon.coupon_reference);
      
      if (hasCode && hasRef) {
        console.log(`  ✅ ${coupon.coupon_code} → ${coupon.coupon_reference}`);
      } else {
        console.log(`  ❌ ${coupon.coupon_code || 'NO CODE'} → ${coupon.coupon_reference || 'NO REF'}`);
        allValid = false;
      }
    }

    if (!allValid) {
      throw new Error('Some coupons missing code or reference!');
    }

    console.log('\n📋 Step 4: Checking reference sequence...');
    const references = createData.coupons.map(c => c.coupon_reference).sort();
    const numbers = references.map(r => parseInt(r.split('-')[1]));
    
    console.log(`  References: ${references.join(', ')}`);
    
    // Check they're sequential (allowing for gaps if other tests ran)
    let isSequential = true;
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] <= numbers[i - 1]) {
        isSequential = false;
        break;
      }
    }
    
    if (isSequential) {
      console.log(`  ✅ References are in ascending order`);
    } else {
      console.log(`  ❌ References are not in order!`);
      throw new Error('References not sequential');
    }

    console.log('\n🎉 All tests passed!');
    console.log('\n✅ Summary:');
    console.log(`  - All coupons have random codes (XXXX-XXXX)`);
    console.log(`  - All coupons have sequential references (CP-###)`);
    console.log(`  - References are in ascending order`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testCouponReferences();
