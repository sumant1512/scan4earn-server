# Ecommerce Orders API

## Purpose
Order placement and full lifecycle management for external consuming applications. MScan stores orders as records and enforces strict status progression. Payment processing is the consuming app's responsibility. No discounts in this phase.

---

## ADDED Requirements

### Requirement: Feature Flag Gate
Order endpoints SHALL be gated behind the `ecommerce-orders` sub-flag (child of `ecommerce-commerce`).

#### Scenario: Sub-flag disabled
- **GIVEN** `ecommerce-orders` is disabled for a tenant (even if `ecommerce-commerce` is enabled)
- **WHEN** any order endpoint is called
- **THEN** the system SHALL return HTTP 403 with `error: "Feature 'ecommerce-orders' is not enabled for this tenant"`

---

### Requirement: Place an Order
The ecommerce API SHALL allow placing an order from the customer's current cart or an explicit items list. Prices are snapshotted from the live product catalog at the moment of order placement.

#### Scenario: Place order from cart
- **GIVEN** Customer A has 2 items in cart (P1 qty=1 current price ₹100, P2 qty=2 current price ₹150)
- **WHEN** `POST /api/ecommerce/v1/orders` is called with:
  ```json
  {
    "from_cart": true,
    "customer_name": "Alice",
    "customer_email": "alice@example.com",
    "shipping_address": { "city": "Mumbai", "pincode": "400001" }
  }
  ```
- **THEN** the system SHALL:
  - Fetch live prices for all cart products
  - Snapshot line items into order (product_name, product_sku, attributes, live unit_price)
  - Compute `subtotal = 400.00` (1×100 + 2×150)
  - Compute `total_amount = subtotal + tax_amount`
  - Generate unique `order_number` (format: `ORD-YYYYMMDD-NNNNN`)
  - Create order with `status = 'pending'`
  - Clear the cart (delete all cart items)
  - Return full order object
  - HTTP 201

#### Scenario: Place order from explicit items (bypass cart)
- **WHEN** `POST /api/ecommerce/v1/orders` is called with:
  ```json
  {
    "from_cart": false,
    "items": [{ "product_id": 10, "quantity": 2 }],
    "customer_name": "Bob"
  }
  ```
- **THEN** the system SHALL fetch live prices, snapshot, and create the order without touching the cart
- **AND** return HTTP 201

#### Scenario: Place order from empty cart
- **GIVEN** Customer A's cart is empty
- **WHEN** `POST /api/ecommerce/v1/orders` is called with `from_cart: true`
- **THEN** the system SHALL return HTTP 400 with `error: "Cart is empty"`

#### Scenario: Order contains inactive product
- **GIVEN** Product P1 has `is_active = false`
- **WHEN** placing an order containing P1
- **THEN** the system SHALL return HTTP 400 with `error: "One or more products are no longer available"` listing unavailable SKUs

#### Scenario: Order contains out-of-stock product (backorder disabled)
- **GIVEN** Product P1 has `stock_status = 'out_of_stock'`, `allow_backorder = false`, `track_inventory = true`
- **WHEN** placing an order containing P1
- **THEN** the system SHALL return HTTP 400 with `error: "Product '{name}' is out of stock"`

#### Scenario: No discount fields accepted
- **WHEN** `POST /api/ecommerce/v1/orders` is called with any discount or coupon fields
- **THEN** the system SHALL ignore those fields silently
- **AND** compute total as `subtotal + tax_amount` only

#### Scenario: Order number uniqueness
- **WHEN** two orders are placed simultaneously for the same tenant
- **THEN** each SHALL receive a distinct `order_number`

---

### Requirement: List Order History
The ecommerce API SHALL return paginated order history for a customer.

#### Scenario: List orders for customer with history
- **GIVEN** Customer A has placed 3 orders
- **WHEN** `GET /api/ecommerce/v1/orders` is called with `X-Customer-Ref: customer-a`
- **THEN** the system SHALL return:
  - Orders sorted by `placed_at DESC`
  - Each order: `id`, `order_number`, `status`, `total_amount`, `currency`, `item_count`, `placed_at`
  - Paginated (`page`, `limit` params; default `limit=20`)
  - HTTP 200

#### Scenario: Filter by status
- **WHEN** `GET /api/ecommerce/v1/orders?status=cancelled` is called
- **THEN** the system SHALL return only orders with `status = 'cancelled'`

#### Scenario: Customer with no orders
- **WHEN** `GET /api/ecommerce/v1/orders` is called for a customer with no history
- **THEN** the system SHALL return HTTP 200 with `orders: []` and `total: 0`

#### Scenario: Order history isolated between customers
- **GIVEN** Customer A and Customer B both have orders for the same app
- **WHEN** Customer A requests order history
- **THEN** Customer B's orders SHALL NOT appear

---

### Requirement: Get Single Order
The ecommerce API SHALL return full details of a single order including all line items.

#### Scenario: Get existing order
- **GIVEN** Order `ORD-20260503-00001` belongs to Customer A
- **WHEN** `GET /api/ecommerce/v1/orders/ORD-20260503-00001` is called
- **THEN** the system SHALL return:
  - Full order header (all fields including shipping_address, notes, metadata)
  - `items[]` each with: `product_id`, `product_name`, `product_sku`, `quantity`, `unit_price`, `total_price`, `attributes`
  - HTTP 200

#### Scenario: Access another customer's order
- **GIVEN** Order belongs to Customer B
- **WHEN** Customer A calls `GET /orders/:id` with that order's ID
- **THEN** the system SHALL return HTTP 404 (no information leak)

---

### Requirement: Update Order Status (Strict Progression)
The ecommerce API SHALL allow the consuming app to advance an order through a strict status lifecycle.

**Allowed transitions:**
```
pending     → confirmed | cancelled
confirmed   → processing
processing  → shipped
shipped     → delivered
delivered   → returned
returned    → refunded
cancelled   → refunded
refunded    → (terminal, no further transitions)
```

#### Scenario: Valid status transition
- **GIVEN** Order has `status = 'pending'`
- **WHEN** `PATCH /api/ecommerce/v1/orders/:id/status` is called with `{ "status": "confirmed" }`
- **THEN** the system SHALL update status to `confirmed` and return the updated order
- **AND** HTTP 200

#### Scenario: Invalid status transition rejected
- **GIVEN** Order has `status = 'confirmed'`
- **WHEN** `PATCH /orders/:id/status` is called with `{ "status": "delivered" }` (skipping steps)
- **THEN** the system SHALL return HTTP 400 with:
  `error: "Invalid status transition from confirmed to delivered"`

#### Scenario: Transition from terminal status rejected
- **GIVEN** Order has `status = 'refunded'`
- **WHEN** `PATCH /orders/:id/status` is called with any status
- **THEN** the system SHALL return HTTP 400 with `error: "Order is in a terminal status and cannot be updated"`

#### Scenario: Update another customer's order
- **GIVEN** Order belongs to Customer B
- **WHEN** Customer A calls `PATCH /orders/:id/status`
- **THEN** the system SHALL return HTTP 404

---

## Order Status Lifecycle

```
         ┌─────────────┐
         │   pending   │────────────────────┐
         └──────┬──────┘                    │
                │                           ▼
         ┌──────▼──────┐             ┌────────────┐
         │  confirmed  │             │ cancelled  │
         └──────┬──────┘             └──────┬─────┘
                │                           │
         ┌──────▼──────┐                    │
         │ processing  │                    │
         └──────┬──────┘                    │
                │                           │
         ┌──────▼──────┐                    │
         │   shipped   │                    │
         └──────┬──────┘                    │
                │                           │
         ┌──────▼──────┐                    │
         │  delivered  │                    │
         └──────┬──────┘                    │
                │                           │
         ┌──────▼──────┐                    │
         │  returned   │                    │
         └──────┬──────┘                    │
                │                           │
         ┌──────▼──────────────────────────▼┐
         │            refunded              │
         └──────────────────────────────────┘
                   (terminal)
```

---

## Cross-references
- Related spec: `ecommerce-cart` (cart is consumed on order placement)
- Related spec: `product-catalog` (live price fetch and availability check at order time)
- Related spec: `external-apis` (authentication, rate limiting, response format)
