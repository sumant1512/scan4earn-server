# Ecommerce Cart Management API

## Purpose
Per-customer shopping cart scoped to a tenant and verification app. Prices are always live from the product catalog. Abandoned carts are purged after 30 days of inactivity.

---

## ADDED Requirements

### Requirement: Feature Flag Gate
Cart endpoints SHALL be gated behind the `ecommerce-cart` sub-flag (child of `ecommerce-commerce`).

#### Scenario: Sub-flag disabled
- **GIVEN** `ecommerce-cart` is disabled for a tenant (even if `ecommerce-commerce` is enabled)
- **WHEN** any cart endpoint is called
- **THEN** the system SHALL return HTTP 403 with `error: "Feature 'ecommerce-cart' is not enabled for this tenant"`

---

### Requirement: Customer Identification via Header
All cart endpoints SHALL require an `X-Customer-Ref` header identifying the customer.

#### Scenario: Missing X-Customer-Ref header
- **WHEN** a cart endpoint is called without the `X-Customer-Ref` header
- **THEN** the system SHALL return HTTP 400 with `error: "X-Customer-Ref header is required"`

#### Scenario: Cart scoped per customer per app
- **GIVEN** Customer A and Customer B both use the same API key (App X, Tenant T)
- **WHEN** each customer adds different products to their cart
- **THEN** `GET /cart` for Customer A SHALL NOT include Customer B's items, and vice versa

---

### Requirement: Get Cart with Live Prices
The ecommerce API SHALL return the current cart contents with prices read live from the product catalog.

#### Scenario: Get populated cart
- **GIVEN** Customer A has 2 items in cart (Product P1 qty=2, Product P2 qty=1)
- **AND** current prices are P1=₹100, P2=₹250
- **WHEN** `GET /api/ecommerce/v1/cart` is called
- **THEN** the system SHALL return:
  - `items[]` each with: `product_id`, `product_name`, `product_sku`, `image_url`, `quantity`, `unit_price` (live), `line_total`
  - `summary.item_count` = 3
  - `summary.subtotal` = 450.00
  - `summary.currency` from the product records
  - HTTP 200

#### Scenario: Live price reflected on cart read
- **GIVEN** Product P1 is in cart with quantity 1
- **AND** P1's price changes from ₹100 to ₹120 after being added
- **WHEN** `GET /api/ecommerce/v1/cart` is called
- **THEN** `unit_price` SHALL be 120.00 and `line_total` SHALL be 120.00

#### Scenario: Get empty cart
- **GIVEN** Customer A has no items in cart
- **WHEN** `GET /api/ecommerce/v1/cart` is called
- **THEN** the system SHALL return HTTP 200 with `items: []` and `summary.subtotal: 0`

---

### Requirement: Add Item to Cart
The ecommerce API SHALL add a product to the customer's cart.

#### Scenario: Add new product to cart
- **GIVEN** Product P1 is active
- **WHEN** `POST /api/ecommerce/v1/cart/items` is called with `{ product_id: P1, quantity: 2 }`
- **THEN** the system SHALL:
  - Create or reuse the cart record for this customer/app
  - Insert a cart item storing only `product_id` and `quantity` (no price stored)
  - Update cart `updated_at` timestamp
  - Return updated cart with live prices
  - HTTP 201

#### Scenario: Add product already in cart increases quantity
- **GIVEN** Product P1 is in cart with quantity 1
- **WHEN** `POST /api/ecommerce/v1/cart/items` is called with `{ product_id: P1, quantity: 3 }`
- **THEN** the system SHALL update the existing item's quantity to 4
- **AND** NOT create a duplicate cart item row

#### Scenario: Add inactive product rejected
- **GIVEN** Product P1 has `is_active = false`
- **WHEN** `POST /api/ecommerce/v1/cart/items` is called with `{ product_id: P1 }`
- **THEN** the system SHALL return HTTP 400 with `error: "Product is not available"`

#### Scenario: Add out-of-stock product when backorder disabled
- **GIVEN** Product P1 has `stock_status = 'out_of_stock'`, `allow_backorder = false`, `track_inventory = true`
- **WHEN** `POST /api/ecommerce/v1/cart/items` is called
- **THEN** the system SHALL return HTTP 400 with `error: "Product is out of stock"`

#### Scenario: Add product from different tenant rejected
- **GIVEN** Product P1 belongs to Tenant B but API key authenticates Tenant A
- **WHEN** `POST /api/ecommerce/v1/cart/items` is called
- **THEN** the system SHALL return HTTP 404 with `error: "Product not found"`

#### Scenario: Invalid quantity
- **WHEN** `POST /api/ecommerce/v1/cart/items` is called with `quantity: 0` or negative
- **THEN** the system SHALL return HTTP 400 with `error: "Quantity must be at least 1"`

---

### Requirement: Update Cart Item Quantity
The ecommerce API SHALL allow updating the quantity of an existing cart item.

#### Scenario: Update quantity to valid positive number
- **GIVEN** Product P1 is in cart with quantity 2
- **WHEN** `PUT /api/ecommerce/v1/cart/items/:productId` is called with `{ quantity: 5 }`
- **THEN** the system SHALL update the quantity to 5
- **AND** update cart `updated_at` timestamp
- **AND** return updated cart with live prices

#### Scenario: Update item not in cart
- **GIVEN** Product P1 is NOT in the customer's cart
- **WHEN** `PUT /api/ecommerce/v1/cart/items/P1` is called
- **THEN** the system SHALL return HTTP 404 with `error: "Item not found in cart"`

---

### Requirement: Remove Item from Cart
The ecommerce API SHALL allow removing a single product from the customer's cart.

#### Scenario: Remove existing item
- **GIVEN** Product P1 is in cart
- **WHEN** `DELETE /api/ecommerce/v1/cart/items/:productId` is called
- **THEN** the system SHALL delete the cart item
- **AND** update cart `updated_at` timestamp
- **AND** return HTTP 200 with updated cart

#### Scenario: Remove item not in cart
- **GIVEN** Product P1 is NOT in the customer's cart
- **WHEN** `DELETE /api/ecommerce/v1/cart/items/P1` is called
- **THEN** the system SHALL return HTTP 404 with `error: "Item not found in cart"`

---

### Requirement: Clear Cart
The ecommerce API SHALL allow removing all items from a customer's cart at once.

#### Scenario: Clear cart with items
- **GIVEN** Customer A has 3 items in cart
- **WHEN** `DELETE /api/ecommerce/v1/cart` is called
- **THEN** the system SHALL delete all cart items and return HTTP 200 with `items: []`

#### Scenario: Clear already-empty cart (idempotent)
- **GIVEN** Customer A has no items in cart
- **WHEN** `DELETE /api/ecommerce/v1/cart` is called
- **THEN** the system SHALL return HTTP 200 with `items: []`

---

### Requirement: Abandoned Cart Cleanup
The system SHALL automatically purge carts that have had no activity for 30 or more days.

#### Scenario: Cart inactive for 30+ days is purged
- **GIVEN** a cart's `updated_at` is more than 30 days in the past
- **WHEN** the scheduled cleanup runs (at server startup and every 24 hours)
- **THEN** the system SHALL delete all items for that cart and the cart record itself

#### Scenario: Active cart is not purged
- **GIVEN** a cart has had item updates within the last 30 days
- **WHEN** the cleanup runs
- **THEN** the cart SHALL be retained

---

## Cross-references
- Related spec: `product-catalog` (product availability, stock fields, live price)
- Related spec: `external-apis` (authentication, rate limiting, response format)
- Related spec: `ecommerce-orders` (cart is consumed on order placement)
