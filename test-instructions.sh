#!/bin/bash

# Quick script to get an auth token for testing
# This helps bypass the complex OTP flow for manual testing

echo "🔐 Testing Auto Coupon References Feature"
echo "=========================================="
echo ""
echo "Since the e2e login is complex with OTP, let's test the API directly."
echo ""
echo "Please run these commands manually to test:"
echo ""
echo "1. First, login to http://harsh.localhost:4200 in your browser"
echo "2. Open Developer Tools → Console"
echo "3. Run: localStorage.getItem('tms_access_token') || localStorage.getItem('auth_token')"
echo "4. Copy the token (without quotes)"
echo "5. Then run:"
echo ""
echo "   TEST_AUTH_TOKEN=\"your-token-here\" node test-coupon-references.js"
echo ""
echo "Or test via curl:"
echo ""
echo "   # Create coupons"
echo "   curl -X POST http://localhost:8080/api/rewards/coupons \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -H \"Authorization: Bearer YOUR_TOKEN\" \\"
echo "     -d '{\"verification_app_id\": \"YOUR_APP_ID\", \"description\": \"Test\", \"discount_value\": 10, \"quantity\": 3, \"expiry_date\": \"2027-01-01T00:00:00.000Z\"}'"
echo ""
