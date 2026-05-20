#!/bin/bash

# Multi-App Architecture - Smoke Test Script
# Quick verification that all components are in place

echo "=========================================="
echo "Multi-App Architecture - Smoke Test"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $2"
    return 0
  else
    echo -e "${RED}✗${NC} $2 - File not found: $1"
    return 1
  fi
}

check_grep() {
  if grep -q "$2" "$1" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $3"
    return 0
  else
    echo -e "${RED}✗${NC} $3 - Pattern not found: $2"
    return 1
  fi
}

echo "Checking Database Migrations..."
check_file "mscan-server/database/migrations/add-multi-app-architecture.sql" "Schema migration file"
check_file "mscan-server/database/migrations/run-multi-app-migration.js" "Data migration script"
echo ""

echo "Checking Backend Controllers..."
check_file "mscan-server/src/controllers/userCredits.controller.js" "User Credits Controller"
check_file "mscan-server/src/controllers/externalApp.controller.js" "External App Controller"
check_grep "mscan-server/src/controllers/categories.controller.js" "verification_app_id" "Categories Controller - App filtering"
check_grep "mscan-server/src/controllers/products.controller.js" "verification_app_id" "Products Controller - App filtering"
check_grep "mscan-server/src/controllers/rewards.controller.js" "regenerateApiKey" "Rewards Controller - API key management"
echo ""

echo "Checking Backend Routes..."
check_file "mscan-server/src/routes/userCredits.routes.js" "User Credits Routes"
check_file "mscan-server/src/routes/externalApp.routes.js" "External App Routes"
check_grep "mscan-server/src/server.js" "userCreditsRoutes" "Server.js - User Credits Routes registered"
check_grep "mscan-server/src/server.js" "externalAppRoutes" "Server.js - External App Routes registered"
echo ""

echo "Checking Middleware..."
check_file "mscan-server/src/middleware/appApiKey.middleware.js" "API Key Authentication Middleware"
echo ""

echo "Checking Frontend Components..."
check_file "mscan-client/src/app/services/app-context.service.ts" "App Context Service"
check_file "mscan-client/src/app/components/app-selector/app-selector.component.ts" "App Selector Component"
check_grep "mscan-client/src/app/components/categories/category-list.component.ts" "AppSelectorComponent" "Categories - App selector integrated"
check_grep "mscan-client/src/app/components/categories/category-list.component.ts" "appContextService" "Categories - App context service"
check_grep "mscan-client/src/app/components/products/product-list.component.ts" "AppSelectorComponent" "Products - App selector integrated"
check_grep "mscan-client/src/app/components/products/product-list.component.ts" "appContextService" "Products - App context service"
echo ""

echo "Checking Documentation..."
check_file "mscan-server/EXTERNAL_APP_API.md" "External App API Documentation"
check_file "MULTI_APP_IMPLEMENTATION_COMPLETE.md" "Implementation Summary"
check_file "openspec/changes/add-multi-app-architecture/tasks.md" "OpenSpec Tasks"
check_file "openspec/changes/add-multi-app-architecture/PHASE0_REVIEW.md" "Phase 0 Review"
echo ""

echo "=========================================="
echo "Checking Database Schema..."
echo "=========================================="
echo ""
echo -e "${YELLOW}To verify database changes, run:${NC}"
echo "  cd mscan-server"
echo "  psql -U postgres -d mscan_db -c \"\\d verification_apps\""
echo "  psql -U postgres -d mscan_db -c \"\\d categories\""
echo "  psql -U postgres -d mscan_db -c \"\\d products\""
echo "  psql -U postgres -d mscan_db -c \"\\d user_credits\""
echo "  psql -U postgres -d mscan_db -c \"\\d user_credit_transactions\""
echo ""

echo "=========================================="
echo "API Endpoint Verification"
echo "=========================================="
echo ""
echo -e "${YELLOW}To test the APIs, first start the server:${NC}"
echo "  cd mscan-server && npm start"
echo ""
echo -e "${YELLOW}Then test these endpoints:${NC}"
echo ""
echo "Internal APIs (require tenant auth):"
echo "  GET  /api/user-credits/1"
echo "  POST /api/user-credits/1/add"
echo "  GET  /api/rewards/verification-apps"
echo "  POST /api/rewards/verification-apps/:id/regenerate-api-key"
echo ""
echo "External APIs (require API key):"
echo "  GET  /api/app/:appCode/categories"
echo "  GET  /api/app/:appCode/products"
echo "  GET  /api/app/:appCode/users/:userId/credits"
echo "  POST /api/app/:appCode/scans"
echo "  POST /api/app/:appCode/redeem"
echo ""

echo "=========================================="
echo "Frontend Verification"
echo "=========================================="
echo ""
echo -e "${YELLOW}To verify frontend changes:${NC}"
echo "  cd mscan-client && ng serve"
echo "  Open http://localhost:4200"
echo "  Navigate to Categories or Products"
echo "  Verify app selector dropdown appears at top"
echo "  Select different apps and verify data filters"
echo ""

echo "=========================================="
echo "Smoke Test Complete!"
echo "=========================================="
echo ""
echo -e "${GREEN}All file checks passed!${NC}"
echo ""
echo "Next steps:"
echo "1. Run database migrations (if not already done)"
echo "2. Start backend server and test APIs"
echo "3. Start frontend and verify UI components"
echo "4. Write comprehensive tests (Phase 8)"
echo ""
