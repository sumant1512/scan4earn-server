# Design: Expand E-commerce API

## Context

The existing ecommerce API serves as a **product data bridge** — external platforms pull product catalogs from MScan or push updates into it. This design extends it into a **headless commerce backend** that external apps can use to power full shopping experiences.

---

## Architecture Decisions

### 1. Customer Identity via `X-Customer-Ref`

**Decision**: External apps pass an opaque customer identifier in the `X-Customer-Ref` header. MScan does not create customer accounts.

**Rationale**: Consuming apps already have their own user management. An opaque ref keeps MScan agnostic to the consuming app's identity system (email, UUID, phone, etc.). Scoping by `(tenant_id, verification_app_id, customer_ref)` provides complete isolation between tenants and between apps within a tenant.

**Trade-off**: MScan cannot validate that a `customer_ref` corresponds to a real user in the consuming app. Auth is the consuming app's responsibility; the ecommerce API key already gates access.

---

### 2. Cart Pricing: Live from Product Catalog

**Decision**: `GET /cart` always reads the current `products.price`. No price is stored on cart items — only `product_id` and `quantity`.

**Rationale**: Eliminates stale pricing issues. Consuming apps see the same price in the cart as on the product listing. Simpler schema (no `unit_price` column on cart items).

**Trade-off**: Price can change between "add to cart" and "checkout." The consuming app should re-confirm the total at order placement. At `POST /orders`, prices are snapshotted from the live catalog into order items — that becomes the locked price of record.

---

### 3. Orders: Full Status Lifecycle, Strict Progression

**Decision**: `PATCH /orders/:id/status` allows the consuming app to drive orders through a strict lifecycle.

**Allowed transitions:**
```
pending     → confirmed
confirmed   → processing
processing  → shipped
shipped     → delivered
delivered   → returned
returned    → refunded
pending     → cancelled
cancelled   → refunded
```

Any other transition (e.g. `pending → shipped`, `delivered → pending`) returns HTTP 400.

**Rationale**: Strict progression prevents data integrity issues (e.g. a shipped order being moved back to pending). Maps to real-world fulfillment stages.

---

### 4. No Discounts in This Phase

**Decision**: `POST /orders` accepts no discount or coupon fields. Total = subtotal + tax.

**Rationale**: MScan's existing coupon system is for cashback/rewards via QR scan — a different concept from checkout discounts. A discount code system requires its own proposal (code management, usage limits, expiry, types). Adding it here would significantly expand scope.

**MScan coupons remain unchanged**: cashback/rewards triggered by product scan, not by ecommerce checkout.

---

### 5. Orders: MScan as Order Record Store, Not Payment Processor

**Decision**: Orders are created with status `pending`. The consuming app handles payment externally and then drives the status forward via `PATCH /orders/:id/status`.

**Rationale**: Payment processing is domain-specific (Stripe, Razorpay, COD, etc.) and out of scope. Keeping MScan as the order record store gives consuming apps a single source of truth for order history.

---

### 6. Order Placement: From Cart or Direct Items

**Decision**: `POST /orders` accepts either `from_cart: true` (builds order from current cart) or an explicit `items[]` array.

**Rationale**: Some consuming apps (kiosks, quick-buy) bypass cart entirely. Supporting both avoids forcing an unnecessary cart step.

---

### 7. Cart Expiry: 30-Day Inactivity Purge

**Decision**: Carts with no item updates for 30+ days are automatically deleted.

**Rationale**: Abandoned carts accumulate indefinitely without cleanup. 30 days is a reasonable commerce standard.

**Implementation**: A cleanup function runs at server startup and then every 24 hours via `setInterval`. It deletes `ecommerce_cart_items` for stale carts, then orphaned `ecommerce_carts`.

---

### 8. Feature Flag Hierarchy: Sub-flags per Endpoint Group

**Decision**: Each endpoint group gets its own sub-feature flag as a child of the parent `ecommerce-commerce` flag. Tenants can enable the full commerce suite or only specific capabilities.

**Flag tree:**
```
ecommerce-commerce          ← parent, required for all new endpoints
├── ecommerce-categories    ← gates GET /categories and GET /categories/:id/products
├── ecommerce-cart          ← gates all /cart/* endpoints
├── ecommerce-orders        ← gates all /orders/* endpoints
├── ecommerce-wishlist      ← gates all /wishlist/* endpoints
└── ecommerce-inventory     ← gates GET /products/:id/stock
```

**Hierarchy behaviour** (existing system): Enabling a child flag automatically enables all its ancestors. Disabling the parent `ecommerce-commerce` effectively disables all children regardless of their individual state.

**Rationale**: Tenants may want cart and orders without wishlist, or categories without inventory. Sub-flags give super-admin fine-grained control per tenant without waiting for a full rollout.

**The auth context mismatch**: The existing `requireFeature` middleware reads tenant ID from `req.user?.tenant_id`. Ecommerce API key routes have no `req.user` — the auth context is on `req.apiAuth.tenantId`. Using `requireFeature` directly would always fail with "Tenant context required".

**Implementation**: A dedicated `requireEcommerceFeature(featureCode)` middleware is added to `ecommerceApiKey.middleware.js`. It calls the same underlying `featureService.isFeatureEnabledForTenant` but reads from `req.apiAuth.tenantId`:

```javascript
const requireEcommerceFeature = (featureCode) => async (req, res, next) => {
  const tenantId = req.apiAuth?.tenantId;
  const isEnabled = await featureService.isFeatureEnabledForTenant(featureCode, tenantId);
  if (!isEnabled) return res.status(403).json({
    status: false,
    error: 'forbidden',
    message: `Feature '${featureCode}' is not enabled for this tenant`
  });
  next();
};
```

Each route group uses its specific sub-flag:
```javascript
router.use('/categories', requireEcommerceFeature('ecommerce-categories'), ...);
router.use('/cart',       requireEcommerceFeature('ecommerce-cart'), ...);
router.use('/orders',     requireEcommerceFeature('ecommerce-orders'), ...);
router.use('/wishlist',   requireEcommerceFeature('ecommerce-wishlist'), ...);
// inventory endpoint:
router.get('/products/:id/stock', requireEcommerceFeature('ecommerce-inventory'), ...);
```

The existing `requireFeature` in `feature.middleware.js` is **not modified**.

---

### 9. `product_sku` — Single Column on Products Table

**Decision**: Add `product_sku VARCHAR(100)` to the `products` table. One SKU per product. Variant-level stock tracking is the consuming app's responsibility.

**Rationale**: The existing variant system stores variants as JSONB inside `attributes`. A separate SKUs table would create two sources of truth for variant data. Single-column SKU keeps queries simple and unambiguous. Variant-level stock via JSONB is possible but puts DB constraint limitations in play — deferred to a future proposal if needed.

**Unique constraint**: `UNIQUE (tenant_id, product_sku) WHERE product_sku IS NOT NULL` — allows NULL SKUs (products without a SKU) while preventing duplicates within a tenant.

---

### 10. Categories Tenant + App Scoping

**Decision**: All category queries use `WHERE tenant_id = $1 AND (verification_app_id = $2 OR verification_app_id IS NULL)`.

**Rationale**: The `categories.verification_app_id` column is nullable. A category may be tenant-wide (NULL app) or app-specific. Querying only by `verification_app_id = $2` silently excludes tenant-wide categories, creating invisible data gaps for consumers. The combined condition ensures both scopes are always returned.

---

### 11. New Tables Stay Separate from Core MScan Tables

**Decision**: All new tables are prefixed `ecommerce_` and do not modify existing tables (except the two pre-existing gap fixes: `product_sku` on products and ecommerce API columns on verification_apps).

**Rationale**: Zero impact on existing MScan workflows. Clean rollback path — dropping `ecommerce_*` tables removes the feature entirely.

---

## Data Model

```
ecommerce_carts
  id (UUID PK)
  tenant_id → tenants.id
  verification_app_id → verification_apps.id
  customer_ref VARCHAR(255)
  updated_at TIMESTAMP  ← used for 30-day expiry check
  UNIQUE (tenant_id, verification_app_id, customer_ref)

ecommerce_cart_items
  id SERIAL PK
  cart_id → ecommerce_carts.id
  product_id → products.id
  quantity INTEGER
  -- NO unit_price: price is always read live from products.price
  UNIQUE (cart_id, product_id)

ecommerce_orders
  id UUID PK
  order_number VARCHAR UNIQUE  ← format: ORD-YYYYMMDD-NNNNN
  tenant_id → tenants.id
  verification_app_id → verification_apps.id
  customer_ref VARCHAR(255)
  customer_name, customer_email, customer_phone
  status VARCHAR  ← pending|confirmed|processing|shipped|delivered|returned|cancelled|refunded
  subtotal DECIMAL
  tax_amount DECIMAL
  total_amount DECIMAL  ← subtotal + tax_amount (no discount in phase 1)
  currency VARCHAR(3)
  shipping_address JSONB
  notes TEXT
  metadata JSONB
  placed_at TIMESTAMP
  updated_at TIMESTAMP

ecommerce_order_items
  id SERIAL PK
  order_id → ecommerce_orders.id
  product_id → products.id (nullable, SET NULL on product delete)
  product_sku, product_name  ← snapshotted at order time
  quantity INTEGER
  unit_price DECIMAL  ← snapshotted from live price at order placement
  total_price DECIMAL
  attributes JSONB  ← product attributes snapshotted at order time

ecommerce_wishlists
  id SERIAL PK
  tenant_id → tenants.id
  verification_app_id → verification_apps.id
  customer_ref VARCHAR(255)
  product_id → products.id
  UNIQUE (tenant_id, verification_app_id, customer_ref, product_id)
```

---

## Sequence: Place Order from Cart

```
POST /orders  { from_cart: true, customer_name, customer_email, ... }
  1. Resolve customer_ref from X-Customer-Ref header
  2. Fetch cart + items for (tenant, app, customer_ref) — 400 if cart empty
  3. Fetch live prices for all product_ids from products table
  4. Validate all products are active; check stock if track_inventory = true
  5. Snapshot line items (product_name, product_sku, attributes, live unit_price)
  6. Compute subtotal = Σ(quantity × live_price)
  7. total_amount = subtotal + tax_amount
  8. Generate order_number (ORD-YYYYMMDD-NNNNN, sequential per tenant per day)
  9. INSERT ecommerce_orders + ecommerce_order_items in transaction
  10. DELETE cart items (clear cart)
  11. Log API usage
  12. Return order object
```

---

## Order Status Transition Map

```javascript
const ALLOWED_TRANSITIONS = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['processing'],
  processing: ['shipped'],
  shipped:    ['delivered'],
  delivered:  ['returned'],
  returned:   ['refunded'],
  cancelled:  ['refunded'],
  refunded:   [],  // terminal
};
```

---

## Cart Cleanup Schedule

```javascript
// Runs at startup + every 24h
async function purgeAbandonedCarts() {
  await db.query(`
    DELETE FROM ecommerce_cart_items
    WHERE cart_id IN (
      SELECT id FROM ecommerce_carts
      WHERE updated_at < NOW() - INTERVAL '30 days'
    )
  `);
  await db.query(`
    DELETE FROM ecommerce_carts
    WHERE updated_at < NOW() - INTERVAL '30 days'
  `);
}
```

---

## Rate Limiting

Inherits existing ecommerce API rate limit (120 rpm per `verification_app_id`). No separate limits per endpoint in phase 1.

---

## Phase 2 Considerations (Out of Scope)

- Discount/promo code system (separate proposal)
- Stock deduction on order placement with payment confirmation
- Order notifications (email/webhook to consuming app)
- Cursor-based pagination for order history
- Cart merge on login (if consuming app supports guest → authenticated flow)
