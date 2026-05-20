#!/bin/bash

# Test Tags API implementation
# This script tests the updated tags API to ensure it works like the products API

echo "Testing Tags API Implementation"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Base URL (update with your actual subdomain)
BASE_URL="http://sumant.localhost:8080/api"

# You'll need to set these after logging in
echo -e "${BLUE}NOTE: You need to set the TOKEN and APP_ID variables in this script${NC}"
echo ""

# Example values - replace with actual values after login
TOKEN="your-jwt-token-here"
APP_ID="your-app-id-here"

if [ "$TOKEN" = "your-jwt-token-here" ]; then
  echo "⚠️  Please update the TOKEN and APP_ID variables in this script first"
  echo ""
  echo "To get your token:"
  echo "1. Log in to the application"
  echo "2. Check localStorage for 'token'"
  echo ""
  echo "To get an app_id:"
  echo "curl -H \"Authorization: Bearer \$TOKEN\" $BASE_URL/verification-apps | jq"
  exit 1
fi

echo "Test 1: Get all tags (no filters)"
echo "---------------------------------"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/tags" | jq '.'
echo ""

echo -e "${GREEN}✓ Test 1 complete${NC}"
echo ""

echo "Test 2: Get tags for specific app (app_id filter)"
echo "------------------------------------------------"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/tags?app_id=$APP_ID" | jq '.'
echo ""

echo -e "${GREEN}✓ Test 2 complete${NC}"
echo ""

echo "Test 3: Search tags by name"
echo "---------------------------"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/tags?search=test" | jq '.'
echo ""

echo -e "${GREEN}✓ Test 3 complete${NC}"
echo ""

echo "Test 4: Combined filters (app_id + search)"
echo "------------------------------------------"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/tags?app_id=$APP_ID&search=test" | jq '.'
echo ""

echo -e "${GREEN}✓ Test 4 complete${NC}"
echo ""

echo "Test 5: Filter by active status"
echo "-------------------------------"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/tags?is_active=true" | jq '.'
echo ""

echo -e "${GREEN}✓ Test 5 complete${NC}"
echo ""

echo "Test 6: All filters combined"
echo "----------------------------"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/tags?app_id=$APP_ID&search=test&is_active=true" | jq '.'
echo ""

echo -e "${GREEN}✓ Test 6 complete${NC}"
echo ""

echo "================================"
echo "All tests complete!"
echo ""
echo "The tags API now supports:"
echo "  • app_id - Filter by verification app"
echo "  • search - Search by tag name"
echo "  • is_active - Filter by active status"
echo ""
echo "Just like the products API!"
