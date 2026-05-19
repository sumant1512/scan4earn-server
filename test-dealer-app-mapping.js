/**
 * End-to-end verification test for dealer-app mapping features.
 * Run from scan4earn-server directory: node test-dealer-app-mapping.js
 */
require('dotenv').config();

const http = require('http');
const db = require('./src/config/database');
const tokenService = require('./src/services/token.service');

const BASE = 'http://palspaint.localhost:8080';
const TENANT_ID = 'd43c4bd3-f372-4be7-83f5-450f3f8084f8';
const ADMIN_USER_ID = 'e0034739-bc97-4e0a-a388-2db195b85d03';

// ─── tiny http helper ────────────────────────────────────────────────────────
function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'palspaint.localhost',
      port: 8080,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    };
    const r = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let passed = 0, failed = 0;
function pass(msg) { console.log('  ✅', msg); passed++; }
function fail(msg) { console.log('  ❌', msg); failed++; }
function section(title) {
  const pad = Math.max(0, 60 - title.length);
  console.log('\n─── ' + title + ' ' + '─'.repeat(pad));
}

async function run() {
  // ── 0. Fresh admin JWT ───────────────────────────────────────────────────
  const { accessToken: ADMIN_TOKEN } = tokenService.generateTokens(
    ADMIN_USER_ID, 'TENANT_ADMIN', TENANT_ID, 'palspaint'
  );
  const auth = { Authorization: `Bearer ${ADMIN_TOKEN}` };

  // ── Cleanup from previous runs ───────────────────────────────────────────
  await db.query(`DELETE FROM dealer_point_transactions WHERE dealer_id IN (SELECT id FROM dealers WHERE tenant_id = $1)`, [TENANT_ID]);
  await db.query(`DELETE FROM dealer_points WHERE dealer_id IN (SELECT id FROM dealers WHERE tenant_id = $1)`, [TENANT_ID]);
  await db.query(`DELETE FROM dealers WHERE tenant_id = $1`, [TENANT_ID]);
  await db.query(`DELETE FROM users WHERE tenant_id = $1 AND role = 'DEALER'`, [TENANT_ID]);
  await db.query(`DELETE FROM verification_apps WHERE tenant_id = $1 AND app_name LIKE 'Test App%'`, [TENANT_ID]);
  console.log('Cleanup done.\n');

  // ══════════════════════════════════════════════════════════════════════════
  section('SETUP — Create two verification apps via DB');
  // ══════════════════════════════════════════════════════════════════════════
  // Use direct DB inserts because the API requires template_id (a separate concern)
  const appAlpha = await db.query(
    `INSERT INTO verification_apps (tenant_id, app_name, currency, is_active)
     VALUES ($1, 'Test App Alpha', 'INR', true) RETURNING id`,
    [TENANT_ID]
  );
  const app1Id = appAlpha.rows[0].id;
  const appBeta = await db.query(
    `INSERT INTO verification_apps (tenant_id, app_name, currency, is_active)
     VALUES ($1, 'Test App Beta', 'INR', true) RETURNING id`,
    [TENANT_ID]
  );
  const app2Id = appBeta.rows[0].id;
  pass(`App Alpha → ${app1Id}`);
  pass(`App Beta  → ${app2Id}`);

  // ══════════════════════════════════════════════════════════════════════════
  section('FEATURE 1 — Dealer must be registered WITH an app');
  // ══════════════════════════════════════════════════════════════════════════

  // Attempt to create dealer WITHOUT verification_app_id → 400
  const noApp = await req('POST', `/api/v1/tenants/${TENANT_ID}/dealers`, {
    full_name: 'Test Dealer', phone_e164: '+919111222333',
    shop_name: 'Test Shop', address: '123 Main St',
    pincode: '400001', city: 'Mumbai', state: 'Maharashtra'
  }, auth);
  if (noApp.status === 400) pass(`No app_id → 400 (required field enforced)`);
  else fail(`Expected 400, got ${noApp.status}: ${JSON.stringify(noApp.body).substring(0,120)}`);

  // With invalid UUID for verification_app_id → 400
  const badUUID = await req('POST', `/api/v1/tenants/${TENANT_ID}/dealers`, {
    verification_app_id: 'not-a-uuid',
    full_name: 'Test Dealer', phone_e164: '+919111222333',
    shop_name: 'Test Shop', address: '123 Main St',
    pincode: '400001', city: 'Mumbai', state: 'Maharashtra'
  }, auth);
  if (badUUID.status === 400) pass(`Invalid UUID app_id → 400`);
  else fail(`Expected 400, got ${badUUID.status}`);

  // With app_id that doesn't belong to this tenant → 400
  const wrongApp = await req('POST', `/api/v1/tenants/${TENANT_ID}/dealers`, {
    verification_app_id: '00000000-0000-0000-0000-000000000000',
    full_name: 'Test Dealer', phone_e164: '+919111222333',
    shop_name: 'Test Shop', address: '123 Main St',
    pincode: '400001', city: 'Mumbai', state: 'Maharashtra'
  }, auth);
  if (wrongApp.status === 400) pass(`App not belonging to tenant → 400`);
  else fail(`Expected 400, got ${wrongApp.status}: ${JSON.stringify(wrongApp.body).substring(0,120)}`);

  // Create dealer for App Alpha (success)
  const d1 = await req('POST', `/api/v1/tenants/${TENANT_ID}/dealers`, {
    verification_app_id: app1Id,
    full_name: 'Ravi Kumar', phone_e164: '+919811223344',
    shop_name: 'Ravi Paints Alpha', address: '10 Bandra West',
    pincode: '400050', city: 'Mumbai', state: 'Maharashtra'
  }, auth);
  const dealer1Id = d1.body.data?.id;
  if (d1.status === 201 && dealer1Id) pass(`Registered for App Alpha → dealer_id=${dealer1Id}`);
  else { fail(`Alpha registration failed: ${d1.status} ${JSON.stringify(d1.body).substring(0,150)}`); process.exit(1); }

  // Verify DB row has correct verification_app_id
  const dbRow = await db.query('SELECT verification_app_id FROM dealers WHERE id = $1', [dealer1Id]);
  if (dbRow.rows[0].verification_app_id === app1Id) pass(`DB: verification_app_id stored correctly`);
  else fail(`DB: verification_app_id mismatch`);

  // ══════════════════════════════════════════════════════════════════════════
  section('FEATURE 2 — Points isolated per app (same dealer, two apps)');
  // ══════════════════════════════════════════════════════════════════════════

  // Register SAME phone for App Beta → should succeed (different app profile)
  const d2 = await req('POST', `/api/v1/tenants/${TENANT_ID}/dealers`, {
    verification_app_id: app2Id,
    full_name: 'Ravi Kumar', phone_e164: '+919811223344',
    shop_name: 'Ravi Paints Beta', address: '10 Bandra West',
    pincode: '400050', city: 'Mumbai', state: 'Maharashtra'
  }, auth);
  const dealer2Id = d2.body.data?.id;
  if (d2.status === 201 && dealer2Id) pass(`Same phone registered for App Beta → dealer_id=${dealer2Id}`);
  else { fail(`Beta registration failed: ${d2.status} ${JSON.stringify(d2.body).substring(0,150)}`); process.exit(1); }

  if (dealer1Id !== dealer2Id) pass(`Two distinct dealer rows (${dealer1Id.substring(0,8)}... vs ${dealer2Id.substring(0,8)}...)`);
  else fail(`Same dealer_id for both apps — isolation broken`);

  // Both dealer_points rows must exist independently
  const pts = await db.query(
    'SELECT dealer_id, balance FROM dealer_points WHERE dealer_id IN ($1,$2) ORDER BY dealer_id',
    [dealer1Id, dealer2Id]
  );
  if (pts.rows.length === 2) pass(`Two separate dealer_points rows (one per app)`);
  else fail(`Expected 2 dealer_points rows, got ${pts.rows.length}`);

  // Manually credit App Alpha bucket only
  await db.query('UPDATE dealer_points SET balance = 75 WHERE dealer_id = $1', [dealer1Id]);
  const [pAlpha, pBeta] = await Promise.all([
    db.query('SELECT balance FROM dealer_points WHERE dealer_id = $1', [dealer1Id]),
    db.query('SELECT balance FROM dealer_points WHERE dealer_id = $1', [dealer2Id])
  ]);
  const balAlpha = pAlpha.rows[0].balance;
  const balBeta  = pBeta.rows[0].balance;
  if (balAlpha === 75 && balBeta === 0)
    pass(`Points isolated: App Alpha=${balAlpha}, App Beta=${balBeta}`);
  else
    fail(`Points bleed! Alpha=${balAlpha}, Beta=${balBeta}`);
  // Reset
  await db.query('UPDATE dealer_points SET balance = 0 WHERE dealer_id = $1', [dealer1Id]);

  // Re-register same phone + same app → 409
  const dup = await req('POST', `/api/v1/tenants/${TENANT_ID}/dealers`, {
    verification_app_id: app1Id,
    full_name: 'Ravi Kumar', phone_e164: '+919811223344',
    shop_name: 'Duplicate Shop', address: 'Addr', pincode: '400001', city: 'Mumbai', state: 'MH'
  }, auth);
  if (dup.status === 409) pass(`Duplicate registration (same phone + same app) → 409`);
  else fail(`Expected 409, got ${dup.status}: ${JSON.stringify(dup.body).substring(0,120)}`);

  // Register non-DEALER role phone → 422 role_conflict
  await db.query(`INSERT INTO users (tenant_id, full_name, phone_e164, role, is_active) VALUES ($1,'NoDealer','+919999888877','TENANT_USER',true)`, [TENANT_ID]);
  const roleConflict = await req('POST', `/api/v1/tenants/${TENANT_ID}/dealers`, {
    verification_app_id: app1Id,
    full_name: 'NoDealer', phone_e164: '+919999888877',
    shop_name: 'X', address: 'X', pincode: '400001', city: 'Mumbai', state: 'MH'
  }, auth);
  await db.query(`DELETE FROM users WHERE phone_e164 = '+919999888877' AND tenant_id = $1`, [TENANT_ID]);
  if (roleConflict.status === 422) pass(`Non-DEALER phone → 422 role_conflict`);
  else fail(`Expected 422, got ${roleConflict.status}: ${JSON.stringify(roleConflict.body).substring(0,120)}`);

  // Enable the dealer_scanning feature flag for this tenant so mobile endpoints work
  const featureRow = await db.query(
    `SELECT id FROM features WHERE code = 'coupon_cashback.dealer_scanning'`
  );
  if (featureRow.rows.length > 0) {
    const featureId = featureRow.rows[0].id;
    await db.query(
      `INSERT INTO tenant_features (tenant_id, feature_id, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (tenant_id, feature_id) DO UPDATE SET enabled = true`,
      [TENANT_ID, featureId]
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('FEATURE 3 — Full data isolation (scan resolves by app)');
  // ══════════════════════════════════════════════════════════════════════════

  // Generate dealer JWT (user_id only, no dealer_id)
  const dealerUserRes = await db.query(
    'SELECT id FROM users WHERE phone_e164 = $1 AND tenant_id = $2',
    ['+919811223344', TENANT_ID]
  );
  const dealerUserId = dealerUserRes.rows[0].id;
  const { accessToken: DEALER_TOKEN } = tokenService.generateTokens(dealerUserId, 'DEALER', TENANT_ID, 'palspaint');
  const dealerAuth = { Authorization: `Bearer ${DEALER_TOKEN}` };

  // GET /me should NOT include a specific dealer_id (user-level response only)
  const meRes = await req('GET', '/api/mobile/v1/auth/me', null, dealerAuth);
  const meDealerId = meRes.body.data?.dealer?.id;
  if (meRes.status === 200 && !meDealerId)
    pass(`GET /me → user-level only (no dealer_id in response)`);
  else fail(`GET /me: status=${meRes.status} dealer.id=${meDealerId}`);

  // Without X-App-Id header → 400
  const noHdr = await req('GET', '/api/mobile/v1/dealer/points', null, dealerAuth);
  if (noHdr.status === 400) pass(`GET /points without X-App-Id → 400`);
  else fail(`Expected 400, got ${noHdr.status}`);

  // GET /points with App Alpha X-App-Id → 200
  const ptAlpha = await req('GET', '/api/mobile/v1/dealer/points', null, { ...dealerAuth, 'x-app-id': app1Id });
  if (ptAlpha.status === 200 && ptAlpha.body.data?.balance !== undefined)
    pass(`GET /points App Alpha → balance=${ptAlpha.body.data.balance}`);
  else fail(`Points Alpha: ${ptAlpha.status} ${JSON.stringify(ptAlpha.body).substring(0,120)}`);

  // GET /points with App Beta X-App-Id → 200 (separate bucket)
  const ptBeta2 = await req('GET', '/api/mobile/v1/dealer/points', null, { ...dealerAuth, 'x-app-id': app2Id });
  if (ptBeta2.status === 200 && ptBeta2.body.data?.balance !== undefined)
    pass(`GET /points App Beta  → balance=${ptBeta2.body.data.balance}`);
  else fail(`Points Beta: ${ptBeta2.status} ${JSON.stringify(ptBeta2.body).substring(0,120)}`);

  // GET /profile App Alpha → shows Alpha-specific shop name
  const profAlpha = await req('GET', '/api/mobile/v1/dealer/profile', null, { ...dealerAuth, 'x-app-id': app1Id });
  if (profAlpha.status === 200 && profAlpha.body.data?.dealer?.verification_app_id === app1Id)
    pass(`GET /profile App Alpha → shop="${profAlpha.body.data.dealer.shop_name}", app_id matches`);
  else fail(`Profile Alpha: ${profAlpha.status} ${JSON.stringify(profAlpha.body).substring(0,150)}`);

  // GET /profile App Beta → shows Beta-specific shop name
  const profBeta = await req('GET', '/api/mobile/v1/dealer/profile', null, { ...dealerAuth, 'x-app-id': app2Id });
  if (profBeta.status === 200 && profBeta.body.data?.dealer?.verification_app_id === app2Id)
    pass(`GET /profile App Beta  → shop="${profBeta.body.data.dealer.shop_name}", app_id matches`);
  else fail(`Profile Beta: ${profBeta.status} ${JSON.stringify(profBeta.body).substring(0,150)}`);

  const profAlphaDealerId = profAlpha.body.data?.dealer?.id;
  const profBetaDealerId  = profBeta.body.data?.dealer?.id;
  if (profAlphaDealerId && profBetaDealerId && profAlphaDealerId !== profBetaDealerId)
    pass(`Profiles return distinct dealer rows (fully isolated)`);
  else fail(`Both apps returned same dealer row — isolation broken`);

  // GET /profile with non-existent app → 403
  const noProfRes = await req('GET', '/api/mobile/v1/dealer/profile', null, {
    ...dealerAuth, 'x-app-id': '00000000-0000-0000-0000-000000000000'
  });
  if (noProfRes.status === 403) pass(`Unknown app_id → 403 "no profile for this app"`);
  else fail(`Expected 403, got ${noProfRes.status}`);

  // Scan test — create a test coupon
  // First delete any leftover test coupon from a previous run
  await db.query(`DELETE FROM coupons WHERE coupon_code = 'DEALTEST001' AND tenant_id = $1`, [TENANT_ID]);

  const batchRes = await db.query('SELECT id FROM coupon_batches WHERE tenant_id = $1 LIMIT 1', [TENANT_ID]);
  let couponCode = null;
  let batchId;
  if (batchRes.rows.length > 0) {
    batchId = batchRes.rows[0].id;
  } else {
    console.log('  ⚠️  No batch — inserting minimal batch for scan test');
    const bInsert = await db.query(
      `INSERT INTO coupon_batches (tenant_id, batch_name, batch_status, total_coupons)
       VALUES ($1, 'Test Batch', 'live', 1) RETURNING id`,
      [TENANT_ID]
    );
    batchId = bInsert.rows[0].id;
  }

  const insertCpn = await db.query(
    `INSERT INTO coupons
       (tenant_id, batch_id, coupon_code, status, coupon_points, discount_type, discount_value, expiry_date, credit_cost)
     VALUES ($1, $2, 'DEALTEST001', 'active', 10, 'FIXED_AMOUNT', 10, NOW() + INTERVAL '1 day', 1)
     RETURNING coupon_code`,
    [TENANT_ID, batchId]
  );
  couponCode = insertCpn.rows[0].coupon_code;
  pass(`Test coupon created: ${couponCode}`);

  if (couponCode) {
    // Scan with App Alpha
    const scanAlpha = await req('POST', '/api/mobile/v1/dealer/scan',
      { coupon_code: couponCode },
      { ...dealerAuth, 'x-app-id': app1Id }
    );
    if (scanAlpha.status === 200 && scanAlpha.body.data?.points_awarded === 10)
      pass(`SCAN App Alpha → ${scanAlpha.body.data.points_awarded} pts, balance=${scanAlpha.body.data.dealer_balance}`);
    else fail(`Scan Alpha: ${scanAlpha.status} ${JSON.stringify(scanAlpha.body).substring(0,150)}`);

    // App Beta balance should still be 0 (isolated)
    const betaBalAfter = await db.query('SELECT balance FROM dealer_points WHERE dealer_id = $1', [dealer2Id]);
    if (betaBalAfter.rows[0].balance === 0)
      pass(`App Beta balance=0 after Alpha scan (points isolated by app)`);
    else fail(`Points leaked to Beta: balance=${betaBalAfter.rows[0].balance}`);

    // App Alpha balance = 10
    const alphaBalAfter = await db.query('SELECT balance FROM dealer_points WHERE dealer_id = $1', [dealer1Id]);
    if (alphaBalAfter.rows[0].balance === 10)
      pass(`App Alpha balance=10 (correct)`);
    else fail(`Alpha balance=${alphaBalAfter.rows[0].balance} (expected 10)`);

    // Re-scan same coupon (now 'used') → 409 regardless of which app
    const reScan = await req('POST', '/api/mobile/v1/dealer/scan',
      { coupon_code: couponCode },
      { ...dealerAuth, 'x-app-id': app2Id }
    );
    if (reScan.status === 409) pass(`Re-scan used coupon → 409`);
    else fail(`Expected 409, got ${reScan.status}`);

    // Transaction history isolated: Alpha has 1, Beta has 0
    const histAlpha = await req('GET', '/api/mobile/v1/dealer/points/history', null, { ...dealerAuth, 'x-app-id': app1Id });
    const histBeta  = await req('GET', '/api/mobile/v1/dealer/points/history', null, { ...dealerAuth, 'x-app-id': app2Id });
    const alphaCount = histAlpha.body.data?.transactions?.length;
    const betaCount  = histBeta.body.data?.transactions?.length;
    if (histAlpha.status === 200 && alphaCount === 1)
      pass(`Transaction history App Alpha → ${alphaCount} tx`);
    else fail(`Alpha history: ${histAlpha.status} count=${alphaCount}`);
    if (histBeta.status === 200 && betaCount === 0)
      pass(`Transaction history App Beta  → ${betaCount} tx (isolated)`);
    else fail(`Beta history: ${histBeta.status} count=${betaCount}`);

    // Cleanup test coupon
    await db.query(`DELETE FROM dealer_point_transactions WHERE dealer_id = $1`, [dealer1Id]);
    await db.query(`UPDATE dealer_points SET balance = 0 WHERE dealer_id = $1`, [dealer1Id]);
    await db.query(`DELETE FROM coupons WHERE coupon_code = 'DEALTEST001'`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('FEATURE 4 — API separation by app (X-App-Id)');
  // ══════════════════════════════════════════════════════════════════════════

  // Admin list with ?app_id filter
  const listAlpha = await req('GET', `/api/v1/tenants/${TENANT_ID}/dealers?app_id=${app1Id}`, null, auth);
  const listBeta  = await req('GET', `/api/v1/tenants/${TENANT_ID}/dealers?app_id=${app2Id}`, null, auth);
  const listAll   = await req('GET', `/api/v1/tenants/${TENANT_ID}/dealers`, null, auth);

  const alphaList = listAlpha.body.data?.dealers;
  if (listAlpha.status === 200 && alphaList?.length === 1 && alphaList[0].verification_app_id === app1Id)
    pass(`List ?app_id=Alpha → 1 dealer, correct verification_app_id`);
  else fail(`Alpha list: ${listAlpha.status} count=${alphaList?.length} ${JSON.stringify(alphaList?.[0])?.substring(0,80)}`);

  const betaList = listBeta.body.data?.dealers;
  if (listBeta.status === 200 && betaList?.length === 1 && betaList[0].verification_app_id === app2Id)
    pass(`List ?app_id=Beta  → 1 dealer, correct verification_app_id`);
  else fail(`Beta list: ${listBeta.status} count=${betaList?.length}`);

  const allList = listAll.body.data?.dealers;
  if (listAll.status === 200 && allList?.length === 2)
    pass(`List (no filter)   → 2 dealers (both apps visible to admin)`);
  else fail(`All list: ${listAll.status} count=${allList?.length}`);

  // PATCH verification_app_id → 422 (immutable)
  const patchBad = await req('PUT', `/api/v1/tenants/${TENANT_ID}/dealers/${dealer1Id}`, {
    verification_app_id: app2Id, shop_name: 'Some Name'
  }, auth);
  if (patchBad.status === 422) pass(`PATCH verification_app_id → 422 (immutable after creation)`);
  else fail(`Expected 422, got ${patchBad.status}: ${JSON.stringify(patchBad.body).substring(0,100)}`);

  // PATCH shop_name only → 200 (allowed dealer-level field)
  const patchGood = await req('PUT', `/api/v1/tenants/${TENANT_ID}/dealers/${dealer1Id}`, {
    shop_name: 'Ravi Paints Alpha Updated'
  }, auth);
  if (patchGood.status === 200 && patchGood.body.data?.shop_name === 'Ravi Paints Alpha Updated')
    pass(`PATCH shop_name → 200 (dealer-level fields allowed)`);
  else fail(`PATCH shop_name: ${patchGood.status} ${JSON.stringify(patchGood.body).substring(0,100)}`);

  // Deactivate App Alpha profile → dealer1
  const deact = await req('PATCH', `/api/v1/tenants/${TENANT_ID}/dealers/${dealer1Id}/status`, { is_active: false }, auth);
  if (deact.status === 200) pass(`Deactivate App Alpha profile → 200`);
  else fail(`Deactivate: ${deact.status}`);

  // App Alpha access → 403 (deactivated for that app)
  const alphaAfterDeact = await req('GET', '/api/mobile/v1/dealer/points', null, { ...dealerAuth, 'x-app-id': app1Id });
  if (alphaAfterDeact.status === 403)
    pass(`Deactivated App Alpha → 403 for that app's endpoints`);
  else fail(`Expected 403 on Alpha, got ${alphaAfterDeact.status}`);

  // App Beta still → 200 (separate profile, still active)
  const betaAfterDeact = await req('GET', '/api/mobile/v1/dealer/points', null, { ...dealerAuth, 'x-app-id': app2Id });
  if (betaAfterDeact.status === 200)
    pass(`App Beta still active after Alpha deactivated → 200`);
  else fail(`Expected 200 on Beta, got ${betaAfterDeact.status}: ${JSON.stringify(betaAfterDeact.body).substring(0,100)}`);

  // ──────────────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n' + '═'.repeat(62));
  console.log(`  RESULT: ${passed}/${total} passed  |  ${failed} failed`);
  console.log('═'.repeat(62));
  if (failed > 0) process.exitCode = 1;

  await db.pool.end();
}

run().catch(err => {
  console.error('\n❌ FATAL:', err.message, err.stack?.split('\n')[1] || '');
  db.pool.end();
  process.exit(1);
});
