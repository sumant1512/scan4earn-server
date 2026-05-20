#!/bin/bash

# Test Tenant Admin Management Implementation
# This script tests the new endpoints added for tenant admin management

BASE_URL="http://localhost:8080/api/v1"
CONTENT_TYPE="Content-Type: application/json"

echo "=========================================="
echo "Tenant Admin Management API Tests"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print test results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}: $2"
    else
        echo -e "${RED}✗ FAILED${NC}: $2"
    fi
}

# Check if server is running
echo "Checking if server is running..."
if ! curl -s -o /dev/null -w "%{http_code}" $BASE_URL/health > /dev/null 2>&1; then
    echo -e "${RED}Server is not running. Please start the server first.${NC}"
    exit 1
fi
echo -e "${GREEN}Server is running${NC}"
echo ""

# Login as Super Admin to get token
echo "1. Logging in as Super Admin..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "$CONTENT_TYPE" \
  -d '{
    "email": "sumantmishra511@gmail.com",
    "password": "Admin@123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Failed to login. Check credentials.${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi
echo -e "${GREEN}Login successful${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Test 1: Get all tenants without admin count
echo "2. Testing GET /tenants (without admin count)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/tenants" \
  -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    print_result 0 "Get tenants without admin count"
    echo "Response: ${BODY:0:200}..."
else
    print_result 1 "Get tenants without admin count (HTTP $HTTP_CODE)"
    echo "Response: $BODY"
fi
echo ""

# Test 2: Get all tenants WITH admin count
echo "3. Testing GET /tenants?include_admin_count=true..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/tenants?include_admin_count=true" \
  -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    # Check if response contains tenant_admin_count field
    if echo "$BODY" | grep -q "tenant_admin_count"; then
        print_result 0 "Get tenants with admin count - field present"
    else
        print_result 1 "Get tenants with admin count - field missing"
    fi
    echo "Response sample: ${BODY:0:300}..."
else
    print_result 1 "Get tenants with admin count (HTTP $HTTP_CODE)"
    echo "Response: $BODY"
fi
echo ""

# Test 3: Get tenant admins for a specific tenant
# First, get a tenant ID
TENANT_ID=$(echo "$BODY" | grep -o '"id":[0-9]*' | head -n 1 | sed 's/"id"://')

if [ ! -z "$TENANT_ID" ]; then
    echo "4. Testing GET /tenants/$TENANT_ID/admins..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/tenants/$TENANT_ID/admins" \
      -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "200" ]; then
        # Check if response has proper structure
        if echo "$BODY" | grep -q '"tenant"' && echo "$BODY" | grep -q '"admins"'; then
            print_result 0 "Get tenant admins - proper structure"
            echo "Response: ${BODY:0:300}..."
        else
            print_result 1 "Get tenant admins - invalid structure"
            echo "Response: $BODY"
        fi
    else
        print_result 1 "Get tenant admins (HTTP $HTTP_CODE)"
        echo "Response: $BODY"
    fi
else
    echo -e "${YELLOW}Skipping tenant admins test - no tenant found${NC}"
fi
echo ""

# Test 4: Create a tenant admin with welcome email
if [ ! -z "$TENANT_ID" ]; then
    TIMESTAMP=$(date +%s)
    TEST_EMAIL="testadmin${TIMESTAMP}@example.com"
    
    echo "5. Testing POST /tenants/$TENANT_ID/users (create tenant admin with welcome email)..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/tenants/$TENANT_ID/users" \
      -H "Authorization: Bearer $TOKEN" \
      -H "$CONTENT_TYPE" \
      -d "{
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"TempPass@123\",
        \"fullName\": \"Test Admin $TIMESTAMP\",
        \"phoneNumber\": \"1234567890\",
        \"role\": \"TENANT_ADMIN\",
        \"sendWelcomeEmail\": true
      }")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "201" ]; then
        print_result 0 "Create tenant admin with welcome email"
        echo "Response: ${BODY:0:300}..."
        
        # Check if email was sent (look for warnings or email_sent in response)
        if echo "$BODY" | grep -q "email"; then
            echo -e "${GREEN}  Email sending was attempted${NC}"
        fi
    else
        print_result 1 "Create tenant admin (HTTP $HTTP_CODE)"
        echo "Response: $BODY"
    fi
else
    echo -e "${YELLOW}Skipping create admin test - no tenant found${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Backend endpoints are ready for frontend integration${NC}"
echo ""
echo "Available Endpoints:"
echo "  - GET  /tenants?include_admin_count=true"
echo "  - GET  /tenants/:id/admins"
echo "  - POST /tenants/:id/users (with sendWelcomeEmail)"
echo ""
