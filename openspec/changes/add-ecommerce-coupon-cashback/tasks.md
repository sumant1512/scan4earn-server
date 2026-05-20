## 1. Database Schema Changes (in full_setup.sql)
- [ ] 1.1 Extend `users.role` CHECK constraint to include DEALER and CUSTOMER
- [ ] 1.2 Add `phone_e164` column to `users` table with UNIQUE(phone_e164, tenant_id)
- [ ] 1.3 Create `dealers` table (user_id, tenant_id, dealer_code, shop_name, address, pincode, city, state, is_active, metadata)
- [ ] 1.4 Create `dealer_points` table (dealer_id, tenant_id, balance)
- [ ] 1.5 Create `dealer_point_transactions` table (dealer_id, amount, type, reason, reference)
- [ ] 1.6 Create `customer_upi_details` table (customer_id, tenant_id, upi_id, is_verified, is_primary)
- [ ] 1.7 Create `cashback_transactions` table (customer_id, tenant_id, amount, upi_id, status, payout_reference)
- [ ] 1.8 Add indexes on new tables (tenant_id, dealer_id, customer_id, status)
- [ ] 1.9 Seed feature flag entries: ecommerce, coupon_cashback, coupon_cashback.dealer_scanning, coupon_cashback.open_scanning

## 2. Auth System Extensions
- [ ] 2.1 Update `auth.middleware.js` — ensure DEALER and CUSTOMER roles are recognized in `authorize()`
- [ ] 2.2 Update `auth.controller.js` — add DEALER and CUSTOMER to `getPermissionsByRole()`
- [ ] 2.3 Update `token.service.js` — document support for new roles (no code change needed, already generic)
- [ ] 2.4 Create `mobileAuth.controller.js` — unified mobile OTP for CUSTOMER auto-registration and DEALER login
- [ ] 2.5 Create `mobileAuth.routes.js` — POST request-otp, POST verify-otp, POST dealer/request-otp, POST dealer/verify-otp, GET me, POST refresh, POST logout

## 3. Dealer Management (Tenant Admin)
- [ ] 3.1 Create `dealer.service.js` — CRUD operations for dealers (required fields: full_name, email, shop_name, address, pincode, city, state, phone_e164)
- [ ] 3.2 Create `dealer.controller.js` — HTTP handlers for dealer management
- [ ] 3.3 Create `dealer.routes.js` — POST/GET/PUT/PATCH endpoints under /api/v1/tenants/:tenantId/dealers
- [ ] 3.4 Create `dealerPoints.service.js` — point balance, transactions, credit/debit operations
- [ ] 3.5 Wire routes in `server.js`

## 4. Dealer Mobile API
- [ ] 4.1 Create `dealerScan.controller.js` — dealer QR scan logic (validate dealer, validate coupon, award points)
- [ ] 4.2 Create `dealerMobile.routes.js` — POST /scan, GET /points, GET /points/history, GET /profile
- [ ] 4.3 Wire routes under `/api/mobile/v1/dealer/` in `server.js`
- [ ] 4.4 Add feature flag check middleware: `requireFeature('coupon_cashback.dealer_scanning')`

## 5. Customer Cashback (Mobile App)
- [ ] 5.1 Create `cashback.service.js` — scan processing, cashback calculation, UPI payout tracking
- [ ] 5.2 Create `cashbackMobile.controller.js` — scan, UPI management, claim, history endpoints
- [ ] 5.3 Create `cashbackMobile.routes.js` — endpoints under /api/mobile/v1/cashback/
- [ ] 5.4 Add feature flag check middleware: `requireFeature('coupon_cashback')`
- [ ] 5.5 Wire routes in `server.js`

## 6. Customer Cashback (Public - No App)
- [ ] 6.1 Create `publicCashback.controller.js` — session start, mobile OTP, UPI collection, confirm flow
- [ ] 6.2 Create `publicCashback.routes.js` — endpoints under /api/public/cashback/
- [ ] 6.3 Add rate limiting middleware for public cashback endpoints
- [ ] 6.4 Add feature flag check: `requireFeature('coupon_cashback.open_scanning')`
- [ ] 6.5 Wire routes in `server.js`

## 7. Ecommerce Module (Mobile — Profile & Catalog Only)
- [ ] 7.1 Create `ecommerce.service.js` — product catalog browsing, customer profile management
- [ ] 7.2 Create `ecommerceMobile.controller.js` — products and profile endpoints (no orders)
- [ ] 7.3 Create `ecommerceMobile.routes.js` — endpoints under /api/mobile/v1/ecommerce/
- [ ] 7.4 Add feature flag check: `requireFeature('ecommerce')`
- [ ] 7.5 Wire routes in `server.js`

## 8. Mobile Auth v1 (Unified)
- [ ] 8.1 Create `mobileAuthV1.controller.js` — unified OTP flow supporting CUSTOMER auto-registration (mobile number only) and DEALER pre-registered login
- [ ] 8.2 Create `mobileAuthV1.routes.js` — /api/mobile/v1/auth/* endpoints
- [ ] 8.3 Implement auto-registration: create users (role=CUSTOMER, phone_e164 only) + customers records on first OTP verify
- [ ] 8.4 Implement GET /me endpoint returning role-specific profile
- [ ] 8.5 Wire routes in `server.js`

## 9. Integration & Testing
- [ ] 9.1 Write unit tests for dealer.service.js
- [ ] 9.2 Write unit tests for cashback.service.js
- [ ] 9.3 Write unit tests for ecommerce.service.js
- [ ] 9.4 Write unit tests for mobileAuthV1.controller.js
- [ ] 9.5 Write integration tests for dealer scan flow
- [ ] 9.6 Write integration tests for customer cashback flow
- [ ] 9.7 Write integration tests for public cashback flow
- [ ] 9.8 Update E2E tests for new roles

## 10. Documentation
- [ ] 10.1 Update API documentation with new endpoints
- [ ] 10.2 Document feature flag configuration guide
- [ ] 10.3 Document dealer onboarding workflow
- [ ] 10.4 Document customer self-registration flow
