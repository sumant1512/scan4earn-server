# Implementation Tasks: expand-ecommerce-api

## Decisions Summary
- Cart prices: **live from products table** (no unit_price on cart items)
- Order status: **strict progression**, full lifecycle including `returned` and `refunded`
- Discounts: **none in this phase**
- Feature flag: **`ecommerce-commerce`** sub-flag hierarchy gates all new endpoints
- Cart expiry: **auto-purge after 30 days inactivity**
- SKUs: **single `product_sku` column on products table** — one SKU per product; variant-level stock is consuming app's responsibility

## Pre-existing Gaps Found During Analysis (must fix before new endpoints work)

1. **`product_sku` missing from products table** — column only exists on `coupons`. Existing sync endpoint already broken. Fix in migration.
2. **`ecommerce_api_key`, `ecommerce_api_enabled`, `api_rate_limits` missing from `verification_apps`** — middleware queries these columns but no migration adds them. The entire ecommerce API auth fails without them.
3. **Categories `verification_app_id` is nullable** — tenant-wide categories (NULL app) are silently excluded by `WHERE verification_app_id = $2`. All category queries must use `AND (verification_app_id = $2 OR verification_app_id IS NULL)`.

## Dependencies
- Existing ecommerce API key middleware (`ecommerceApiKey.middleware.js`) ← requires gap fix #2 first
- Existing `products`, `categories`, `product_categories` tables ← requires gap fixes #1 and #3
- Existing feature flag system — `APPLY_FEATURE_FLAGS_SCHEMA.sql` must have been run (`npm run db:apply-feature-flags`) for `parent_id` hierarchy to work
- `asyncHandler`, `sendSuccess`, `NotFoundError`, `ValidationError`, `executeTransaction` from common modules ← reuse as-is

---

## Phase 1 — Database Migration

### 1.0 Fix pre-existing schema gaps (must run before anything else)
- [x] Add to `mscan-server/database/ecommerce-schema.sql`:
  ```sql
  -- Gap fix #1: product_sku on products
  ALTER TABLE products ADD COLUMN IF NOT EXISTS product_sku VARCHAR(100);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku
    ON products(tenant_id, product_sku) WHERE product_sku IS NOT NULL;

  -- Gap fix #2: ecommerce API columns on verification_apps
  ALTER TABLE verification_apps ADD COLUMN IF NOT EXISTS ecommerce_api_key VARCHAR(255) UNIQUE;
  ALTER TABLE verification_apps ADD COLUMN IF NOT EXISTS ecommerce_api_enabled BOOLEAN DEFAULT false;
  ALTER TABLE verification_apps ADD COLUMN IF NOT EXISTS api_rate_limits JSONB DEFAULT '{"ecommerce_rpm": 120}'::jsonb;
  ```
- [x] Verify `APPLY_FEATURE_FLAGS_SCHEMA.sql` has been run (`npm run db:apply-feature-flags`) — required for `parent_id` hierarchy on features table

**Validation**: `\d products` shows `product_sku`; `\d verification_apps` shows `ecommerce_api_key`, `ecommerce_api_enabled`, `api_rate_limits`.

### 1.1 Finalise ecommerce schema migration
- [x] Updated `mscan-server/database/ecommerce-schema.sql`:
  - `ecommerce_cart_items` has NO `unit_price` column (live pricing — not stored)
  - `ecommerce_orders` status CHECK constraint includes all 8 values including `returned`
  - All FK references verified correct
- [x] Create `mscan-server/database/apply-ecommerce-schema.js` runner script
- [x] Add npm script to `package.json`: `"db:apply-ecommerce": "node database/apply-ecommerce-schema.js"`

**Validation**: `\dt ecommerce_*` shows 5 tables; inserting invalid status returns constraint error.

### 1.2 Seed feature flag hierarchy
- [x] Insert parent flag into `features` table: `{ code: 'ecommerce-commerce', name: 'E-commerce Commerce API' }`
- [x] Insert 5 child flags with `parent_id` pointing to the parent record:
  - `ecommerce-categories` — Categories browsing
  - `ecommerce-cart` — Cart management
  - `ecommerce-orders` — Order placement and history
  - `ecommerce-wishlist` — Wishlist
  - `ecommerce-inventory` — Stock status endpoint
- [x] All inserts use `INSERT ... ON CONFLICT (code) DO NOTHING` so migration is idempotent
- [x] Seed step added to `database/apply-ecommerce-schema.js`

---

## Phase 2 — Middleware

### 2.1 Add `requireEcommerceFeature` to `ecommerceApiKey.middleware.js`
- [x] Add `requireEcommerceFeature(featureCode)` middleware — reads `req.apiAuth.tenantId` (NOT `req.user`) and calls `featureService.isFeatureEnabledForTenant`
- [x] Return 403 if feature disabled for tenant
- [x] Do NOT modify the existing `requireFeature` in `feature.middleware.js` — it is only for JWT routes

### 2.2 Add `requireCustomerRef` to `ecommerceApiKey.middleware.js`
- [x] Read `req.headers['x-customer-ref']`
- [x] Return 400 if missing or empty string
- [x] Attach to `req.customerRef`

---

## Phase 3 — Routes

### 3.1 Update `ecommerceApi.routes.js`
- [x] Import `requireEcommerceFeature`, `requireCustomerRef` from `ecommerceApiKey.middleware.js`
- [x] Add category routes (with `requireEcommerceFeature('ecommerce-categories')`):
  - `GET /categories`
  - `GET /categories/:id/products`
- [x] Add cart routes (with `requireEcommerceFeature('ecommerce-cart')` + `requireCustomerRef`):
  - `GET /cart`
  - `POST /cart/items`
  - `PUT /cart/items/:productId`
  - `DELETE /cart/items/:productId`
  - `DELETE /cart`
- [x] Add order routes (with `requireEcommerceFeature('ecommerce-orders')` + `requireCustomerRef`):
  - `POST /orders`
  - `GET /orders`
  - `GET /orders/:id`
  - `PATCH /orders/:id/status`
- [x] Add wishlist routes (with `requireEcommerceFeature('ecommerce-wishlist')` + `requireCustomerRef`):
  - `GET /wishlist`
  - `POST /wishlist`
  - `DELETE /wishlist/:productId`
- [x] Add inventory route (with `requireEcommerceFeature('ecommerce-inventory')`):
  - `GET /products/:id/stock`
- [x] `POST /products/sync` stays before `GET /products/:id` to avoid route capture conflict

---

## Phase 4 — Controller Handlers

All handlers in `mscan-server/src/controllers/ecommerceApi.controller.js`.

### 4.1 Categories
- [x] `getCategories` — query `categories` filtered by `tenant_id` AND `(verification_app_id = $2 OR verification_app_id IS NULL)` AND `is_active = true`; include `product_count` via subquery; ordered by name
- [x] `getCategoryProducts` — validate category belongs to tenant/app using same nullable check; join `product_categories` → `products`; paginate; 404 if category not found

### 4.2 Inventory
- [x] `getProductStock` — fetch `stock_quantity`, `stock_status`, `low_stock_threshold`, `track_inventory` from `products` for `(id, tenant_id, verification_app_id)`; 404 if not found

### 4.3 Cart (live pricing — no stored price on items)
- [x] `getCart` — fetch cart items joined to `products` for live `price`; compute `line_total = quantity × product.price`; sum to `subtotal`; return empty cart shape if no record
- [x] `addCartItem` — validate product (active, tenant-scoped, stock check if `track_inventory`); upsert cart; upsert cart_item (`ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`); touch cart `updated_at`; return updated cart
- [x] `updateCartItem` — validate item exists for customer's cart; update quantity; touch cart `updated_at`; return updated cart; 404 if item not found
- [x] `removeCartItem` — delete cart_item by `(cart_id, product_id)`; touch cart `updated_at`; return updated cart; 404 if item not found
- [x] `clearCart` — delete all items for customer's cart (idempotent); return empty cart

### 4.4 Orders
- [x] `placeOrder` — resolves from cart or explicit items; fetches live prices; validates active + stock; snapshots line items; computes totals; generates order_number (ORD-YYYYMMDD-NNNNN); inserts in transaction; clears cart if from_cart; returns order
- [x] `getOrders` — list orders for `(tenant, app, customer_ref)`, optional `status` filter, paginate by `placed_at DESC`
- [x] `getOrder` — fetch order + items scoped to customer_ref; 404 if not found or wrong customer
- [x] `updateOrderStatus` — validates new status, checks allowed transitions map, returns 400 on invalid transition or terminal status

### 4.5 Wishlist
- [x] `getWishlist` — join `ecommerce_wishlists` → `products`, return product snapshot + `added_at`, ordered by `added_at DESC`
- [x] `addToWishlist` — validate product belongs to tenant/app; `INSERT ... ON CONFLICT DO NOTHING`; return 201 (new) or 200 (already exists)
- [x] `removeFromWishlist` — delete by `(tenant, app, customer_ref, product_id)`; always return 200 (idempotent)

---

## Phase 5 — Cart Cleanup Job

### 5.1 Add `purgeAbandonedCarts` to server startup
- [x] `purgeAbandonedCarts()` async function added to `server.js`:
  ```sql
  DELETE FROM ecommerce_cart_items WHERE cart_id IN (SELECT id FROM ecommerce_carts WHERE updated_at < NOW() - INTERVAL '30 days');
  DELETE FROM ecommerce_carts WHERE updated_at < NOW() - INTERVAL '30 days';
  ```
- [x] Called once at startup (after DB connection confirmed)
- [x] Scheduled to repeat every 24 hours via `setInterval`
- [x] Logs count of purged carts

---

## Phase 6 — Testing

### 6.1 Unit tests (`ecommerceApi.controller.test.js`)
- [x] Categories: returns list; 404 on missing category; tenant isolation verified via WHERE clause assertion
- [x] Cart: add item; inactive product rejected; insufficient stock rejected; clear is idempotent
- [x] Orders: empty cart rejected; inactive product rejected; order number format; status transition happy path; invalid transition returns 400; terminal status locked
- [x] Wishlist: add (201); idempotent add (200); remove; idempotent remove; empty wishlist

### 6.2 Feature flag tests
- [x] `requireEcommerceFeature` returns 403 when feature disabled
- [x] `requireEcommerceFeature` calls next() when feature enabled
- [x] `requireEcommerceFeature` returns 401 when tenantId is missing
- [x] `requireCustomerRef` returns 400 when header is missing or empty
- [x] `requireCustomerRef` attaches header value to `req.customerRef`

### 6.3 Manual smoke tests (curl / Postman)
- [ ] Full cart flow: add → update qty → get (verify live price) → remove one → clear
- [ ] Full order flow: fill cart → POST /orders → verify cart cleared → PATCH status through full lifecycle
- [ ] Invalid transition: attempt `pending → shipped` → verify 400
- [ ] Wishlist: add → get → remove → get empty

---

## Parallelisable Work
- Phase 3 (routes) and Phase 4 (controller stubs) can be drafted in parallel once Phase 2 is done
- Phase 5 (cleanup job) is independent of Phase 4 and can be written alongside it
- Phase 6 tests can be written alongside controller handlers (TDD style)

## Not In Scope (Phase 2)
- Discount / promo code system
- Stock deduction on order placement
- Order confirmation emails or webhooks
- Cursor-based pagination for order history
- Cart merge on guest → authenticated login
