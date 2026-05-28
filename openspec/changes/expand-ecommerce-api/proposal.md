# Change: Expand E-commerce API with Cart, Orders, Wishlist, and Categories

## Why

The current E-commerce API (`/api/ecommerce/v1/`) is limited to **product catalog sync** — it lets external platforms push/pull product data into MScan. It does not support any consumer-facing commerce flows.

External applications consuming the MScan ecommerce API currently have no way to:
- Let their customers browse products by category
- Manage a shopping cart per customer
- Place and track orders
- Save products to a wishlist
- Check real-time inventory/stock status

This expansion makes the ecommerce API a **full commerce backend** that any external application (web store, mobile app, kiosk) can consume on a per-tenant basis using the existing API key mechanism.

---

## Decisions (finalised in review)

| Topic | Decision |
|---|---|
| Order status updates | Full lifecycle via `PATCH /orders/:id/status`, **strict progression enforced** |
| Order status values | `pending → confirmed → processing → shipped → delivered → returned → refunded` and `pending → cancelled → refunded` |
| Discounts at checkout | **Removed from this proposal** — separate proposal later |
| MScan coupons | Cashback/rewards only (existing scan system), not used in ecommerce orders |
| Cart pricing | **Live price** — `GET /cart` always reflects current `products.price` |
| Cart expiry | **Auto-purge** carts with no activity for 30+ days |
| Feature flag | All **new** endpoints gated behind `ecommerce-commerce` feature flag per tenant |

---

## What Changes

### New Capabilities

1. **Categories** — Browse the tenant's product category tree and list products per category.
2. **Cart Management** — Per-customer cart with add/update/remove/clear; prices are always live from the product catalog.
3. **Order Management** — Place orders from cart; track and update orders through a strict status lifecycle; cancel or return orders.
4. **Wishlist** — Per-customer saved-product list; add/remove.
5. **Inventory (read)** — Fetch real-time stock status for a single product.

### What Does NOT Change

- Authentication mechanism (existing `Bearer ecommerce_xxxxx` API key)
- Existing product endpoints (`GET /products`, `GET /products/:id`, `POST /products/sync`, `PUT /products/:id`, `GET /templates`) — no feature flag applied to these
- Product data model and schema
- Existing MScan coupon system (cashback/rewards via QR scan)
- Rate limiting and logging infrastructure
- Any frontend (Angular) code — backend only

### Customer Identity

External apps identify their customers via the `X-Customer-Ref` request header. This is an opaque string (e.g. email, UUID, external user ID) owned by the consuming app. MScan stores it as-is and uses it to scope cart, order, and wishlist data. MScan does **not** create or manage customer accounts.

### Feature Flag Hierarchy

Each endpoint group has its own sub-flag, all children of the parent `ecommerce-commerce` flag:

```
ecommerce-commerce
├── ecommerce-categories
├── ecommerce-cart
├── ecommerce-orders
├── ecommerce-wishlist
└── ecommerce-inventory
```

Super-admin can enable the full suite by enabling the parent, or enable only specific capabilities per tenant (e.g. categories + inventory but not cart/orders). Enabling a child automatically enables the parent. The existing product/template endpoints are unaffected and require no feature flag.

### Orders and Payment

Orders are created with status `pending`. MScan does not process payments. The consuming app drives order status through the full lifecycle via `PATCH /orders/:id/status`. No discount or coupon fields on orders in this phase.

---

## Impact

- **Affected specs**: `external-apis`, `product-catalog`
- **New specs**: `ecommerce-categories`, `ecommerce-cart`, `ecommerce-orders`, `ecommerce-wishlist`
- **Database**:
  - 5 new tables: `ecommerce_carts`, `ecommerce_cart_items`, `ecommerce_orders`, `ecommerce_order_items`, `ecommerce_wishlists`
  - New feature flag record: `ecommerce-commerce`
- **Backend**:
  - `mscan-server/database/ecommerce-schema.sql` ← migration (draft exists)
  - `mscan-server/src/routes/ecommerceApi.routes.js` ← new route declarations with feature flag middleware
  - `mscan-server/src/controllers/ecommerceApi.controller.js` ← new handlers
  - `mscan-server/src/middleware/ecommerceApiKey.middleware.js` ← add `requireCustomerRef`
  - `mscan-server/database/apply-ecommerce-schema.js` ← migration runner script
- **Frontend**: None
- **Tests**: Jest unit tests for new controller handlers

---

## New Endpoints Summary

### Categories *(feature flagged)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ecommerce/v1/categories` | List all active categories for the tenant/app |
| GET | `/api/ecommerce/v1/categories/:id/products` | List products under a category |

### Cart *(feature flagged, requires `X-Customer-Ref`)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ecommerce/v1/cart` | Get current cart with live prices and totals |
| POST | `/api/ecommerce/v1/cart/items` | Add product to cart |
| PUT | `/api/ecommerce/v1/cart/items/:productId` | Update quantity of a cart item |
| DELETE | `/api/ecommerce/v1/cart/items/:productId` | Remove a single item from cart |
| DELETE | `/api/ecommerce/v1/cart` | Clear entire cart |

### Orders *(feature flagged, requires `X-Customer-Ref`)*
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ecommerce/v1/orders` | Place an order from cart or explicit items |
| GET | `/api/ecommerce/v1/orders` | List order history for the customer |
| GET | `/api/ecommerce/v1/orders/:id` | Get a single order with line items |
| PATCH | `/api/ecommerce/v1/orders/:id/status` | Update order status (strict progression) |

### Wishlist *(feature flagged, requires `X-Customer-Ref`)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ecommerce/v1/wishlist` | List saved products |
| POST | `/api/ecommerce/v1/wishlist` | Add a product to wishlist |
| DELETE | `/api/ecommerce/v1/wishlist/:productId` | Remove a product from wishlist |

### Inventory *(feature flagged)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ecommerce/v1/products/:id/stock` | Get stock status and quantity for a product |
