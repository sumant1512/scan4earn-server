#!/bin/bash

# Test script to verify permission-based authorization
# This script tests TENANT_ADMIN vs TENANT_USER permissions

BASE_URL="http://localhost:8080/api/v1"
echo "Testing Permission-Based Authorization"
echo "======================================="
echo ""

# Get a tenant for testing
TENANT_EMAIL=$(psql -d mscan_db -t -c "SELECT email FROM tenants WHERE is_active = true LIMIT 1" | xargs)
TENANT_ID=$(psql -d mscan_db -t -c "SELECT id FROM tenants WHERE email = '$TENANT_EMAIL' LIMIT 1" | xargs)
TENANT_SUBDOMAIN=$(psql -d mscan_db -t -c "SELECT subdomain_slug FROM tenants WHERE id = '$TENANT_ID'" | xargs)

if [ -z "$TENANT_EMAIL" ]; then
  echo "❌ No active tenant found. Please create a tenant first."
  exit 1
fi

echo "📋 Using tenant: $TENANT_EMAIL (subdomain: $TENANT_SUBDOMAIN)"
echo ""

# Create TENANT_USER if doesn't exist
TENANT_USER_EMAIL="test-user-$(date +%s)@example.com"
echo "👤 Creating TENANT_USER: $TENANT_USER_EMAIL"
TENANT_USER_ID=$(psql -d mscan_db -t -c "
  INSERT INTO users (email, full_name, role, tenant_id, is_active)
  VALUES ('$TENANT_USER_EMAIL', 'Test User', 'TENANT_USER', '$TENANT_ID', true)
  RETURNING id
" | xargs)

if [ -z "$TENANT_USER_ID" ]; then
  echo "❌ Failed to create TENANT_USER"
  exit 1
fi

echo "✅ TENANT_USER created: $TENANT_USER_ID"
echo ""

# Get TENANT_ADMIN user
TENANT_ADMIN_ID=$(psql -d mscan_db -t -c "SELECT id FROM users WHERE tenant_id = '$TENANT_ID' AND role = 'TENANT_ADMIN' AND is_active = true LIMIT 1" | xargs)

if [ -z "$TENANT_ADMIN_ID" ]; then
  echo "❌ No TENANT_ADMIN found for this tenant"
  exit 1
fi

echo "👑 TENANT_ADMIN ID: $TENANT_ADMIN_ID"
echo ""

# Generate tokens using Node.js
echo "🔑 Generating tokens..."
ADMIN_TOKEN=$(node -e "
const tokenService = require('./mscan-server/src/services/token.service');
const adminPermissions = ['create_app', 'edit_app', 'delete_app', 'view_apps', 'create_coupon', 'edit_coupon', 'delete_coupon', 'view_coupons', 'create_product', 'edit_product', 'delete_product', 'view_products'];
const tokens = tokenService.generateTokens('$TENANT_ADMIN_ID', 'TENANT_ADMIN', '$TENANT_ID', '$TENANT_SUBDOMAIN', adminPermissions);
console.log(tokens.accessToken);
")

USER_TOKEN=$(node -e "
const tokenService = require('./mscan-server/src/services/token.service');
const userPermissions = ['view_apps', 'view_coupons', 'view_products', 'view_categories'];
const tokens = tokenService.generateTokens('$TENANT_USER_ID', 'TENANT_USER', '$TENANT_ID', '$TENANT_SUBDOMAIN', userPermissions);
console.log(tokens.accessToken);
")

echo "✅ Tokens generated"
echo ""

# Test 1: TENANT_ADMIN can create verification app
echo "Test 1: TENANT_ADMIN creates verification app"
echo "----------------------------------------------"
ADMIN_CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/rewards/verification-apps" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "Permission Test App",
    "description": "Test app",
    "welcome_message": "Welcome!",
    "scan_success_message": "Success!",
    "scan_failure_message": "Failed!"
  }')

if echo "$ADMIN_CREATE_RESPONSE" | grep -q '"success":true'; then
  echo "✅ TENANT_ADMIN can create verification app"
  APP_ID=$(echo "$ADMIN_CREATE_RESPONSE" | grep -o '"verification_app_id":"[^"]*"' | cut -d'"' -f4)
  echo "   Created app ID: $APP_ID"
else
  echo "❌ TENANT_ADMIN failed to create verification app"
  echo "   Response: $ADMIN_CREATE_RESPONSE"
fi
echo ""

# Test 2: TENANT_USER cannot create verification app (should get 403)
echo "Test 2: TENANT_USER tries to create verification app"
echo "----------------------------------------------------"
USER_CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/rewards/verification-apps" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "Unauthorized App",
    "description": "Should fail",
    "welcome_message": "Welcome!",
    "scan_success_message": "Success!",
    "scan_failure_message": "Failed!"
  }')

if echo "$USER_CREATE_RESPONSE" | grep -q '"code":"PERMISSION_DENIED"'; then
  echo "✅ TENANT_USER correctly denied (403) - PERMISSION_DENIED"
else
  echo "❌ TENANT_USER was not properly denied"
  echo "   Response: $USER_CREATE_RESPONSE"
fi
echo ""

# Test 3: TENANT_USER can view verification apps
echo "Test 3: TENANT_USER views verification apps"
echo "-------------------------------------------"
USER_VIEW_RESPONSE=$(curl -s -X GET "$BASE_URL/rewards/verification-apps" \
  -H "Authorization: Bearer $USER_TOKEN")

if echo "$USER_VIEW_RESPONSE" | grep -q '"success":true'; then
  echo "✅ TENANT_USER can view verification apps"
else
  echo "❌ TENANT_USER failed to view verification apps"
  echo "   Response: $USER_VIEW_RESPONSE"
fi
echo ""

# Test 4: Check audit logs for unauthorized attempt
echo "Test 4: Verify audit logging for unauthorized attempt"
echo "-----------------------------------------------------"
AUDIT_COUNT=$(psql -d mscan_db -t -c "
  SELECT COUNT(*) FROM audit_logs
  WHERE user_id = '$TENANT_USER_ID'
  AND action = 'UNAUTHORIZED_ACCESS_ATTEMPT'
  AND created_at > NOW() - INTERVAL '1 minute'
" | xargs)

if [ "$AUDIT_COUNT" -gt 0 ]; then
  echo "✅ Unauthorized attempt logged ($AUDIT_COUNT entries)"
  echo "   Latest audit log entry:"
  psql -d mscan_db -c "
    SELECT action, metadata->>'required_permissions' as required_permissions,
           metadata->>'endpoint' as endpoint
    FROM audit_logs
    WHERE user_id = '$TENANT_USER_ID'
    AND action = 'UNAUTHORIZED_ACCESS_ATTEMPT'
    ORDER BY created_at DESC LIMIT 1
  "
else
  echo "⚠️  No audit log found (may take a moment to write)"
fi
echo ""

# Cleanup
echo "🧹 Cleaning up test data..."
if [ ! -z "$APP_ID" ]; then
  psql -d mscan_db -c "DELETE FROM verification_apps WHERE verification_app_id = '$APP_ID'" > /dev/null 2>&1
fi
psql -d mscan_db -c "DELETE FROM users WHERE id = '$TENANT_USER_ID'" > /dev/null 2>&1
echo "✅ Cleanup complete"
echo ""

echo "======================================="
echo "Permission Testing Complete!"
echo "======================================="
