# Ecommerce Wishlist API

## Purpose
Per-customer saved product list scoped to a tenant and verification app. Allows consuming applications to let their users bookmark products for later.

---

## ADDED Requirements

### Requirement: Feature Flag Gate
Wishlist endpoints SHALL be gated behind the `ecommerce-wishlist` sub-flag (child of `ecommerce-commerce`).

#### Scenario: Sub-flag disabled
- **GIVEN** `ecommerce-wishlist` is disabled for a tenant (even if `ecommerce-commerce` is enabled)
- **WHEN** any wishlist endpoint is called
- **THEN** the system SHALL return HTTP 403 with `error: "Feature 'ecommerce-wishlist' is not enabled for this tenant"`

---

### Requirement: Get Wishlist
The ecommerce API SHALL return all saved products for a customer.

#### Scenario: Get populated wishlist
- **GIVEN** Customer A has saved Products P1 and P2 to wishlist
- **WHEN** `GET /api/ecommerce/v1/wishlist` is called with `X-Customer-Ref: customer-a`
- **THEN** the system SHALL return:
  - `items[]` each with: `product_id`, `product_name`, `product_sku`, `price`, `currency`, `image_url`, `stock_status`, `is_active`, `added_at`
  - Items ordered by `added_at DESC`
  - HTTP 200

#### Scenario: Get empty wishlist
- **GIVEN** Customer A has no saved products
- **WHEN** `GET /api/ecommerce/v1/wishlist` is called
- **THEN** the system SHALL return HTTP 200 with `items: []`

#### Scenario: Wishlist isolated between customers
- **GIVEN** Customer A and Customer B each have different wishlisted products
- **WHEN** Customer A requests their wishlist
- **THEN** Customer B's saved products SHALL NOT appear

---

### Requirement: Add to Wishlist
The ecommerce API SHALL allow a customer to save a product to their wishlist.

#### Scenario: Add a product to wishlist
- **GIVEN** Product P1 is active and belongs to this tenant/app
- **WHEN** `POST /api/ecommerce/v1/wishlist` is called with `{ "product_id": P1 }`
- **THEN** the system SHALL insert a wishlist record
- **AND** return HTTP 201 with `{ product_id, product_name, added_at }`

#### Scenario: Add already-wishlisted product (idempotent)
- **GIVEN** Product P1 is already in Customer A's wishlist
- **WHEN** `POST /api/ecommerce/v1/wishlist` is called again with `{ "product_id": P1 }`
- **THEN** the system SHALL return HTTP 200 (no duplicate inserted, no error)

#### Scenario: Add product not belonging to this tenant/app
- **GIVEN** Product P1 belongs to Tenant B
- **WHEN** an API key for Tenant A calls `POST /api/ecommerce/v1/wishlist` with `{ "product_id": P1 }`
- **THEN** the system SHALL return HTTP 404 with `error: "Product not found"`

---

### Requirement: Remove from Wishlist
The ecommerce API SHALL allow a customer to remove a specific product from their wishlist.

#### Scenario: Remove an existing wishlist item
- **GIVEN** Product P1 is in Customer A's wishlist
- **WHEN** `DELETE /api/ecommerce/v1/wishlist/P1` is called
- **THEN** the system SHALL delete the wishlist record
- **AND** return HTTP 200

#### Scenario: Remove a product not in wishlist (idempotent)
- **GIVEN** Product P1 is NOT in Customer A's wishlist
- **WHEN** `DELETE /api/ecommerce/v1/wishlist/P1` is called
- **THEN** the system SHALL return HTTP 200 (no error, idempotent delete)

---

## Cross-references
- Related spec: `product-catalog` (product data returned in wishlist items)
- Related spec: `external-apis` (authentication, rate limiting, response format)
- Related spec: `ecommerce-cart` (same `X-Customer-Ref` pattern)
