# Ecommerce Categories API

## Purpose
Expose the tenant's product category tree to external consuming applications via the ecommerce API key, enabling category-based product browsing.

---

## ADDED Requirements

### Requirement: Feature Flag Gate
Category endpoints SHALL be gated behind the `ecommerce-categories` sub-flag (child of `ecommerce-commerce`).

#### Scenario: Sub-flag disabled
- **GIVEN** `ecommerce-categories` is disabled for a tenant (even if `ecommerce-commerce` is enabled)
- **WHEN** any category endpoint is called
- **THEN** the system SHALL return HTTP 403 with `error: "Feature 'ecommerce-categories' is not enabled for this tenant"`

---

### Requirement: List Categories
The ecommerce API SHALL expose all active categories for the authenticated tenant and verification app.

#### Scenario: List categories with valid API key
- **GIVEN** a valid ecommerce API key for Tenant A / App X
- **WHEN** `GET /api/ecommerce/v1/categories` is called
- **THEN** the system SHALL return:
  - All categories where `tenant_id = A` AND `(verification_app_id = X OR verification_app_id IS NULL)` AND `is_active = true`
  - Both app-specific categories AND tenant-wide categories (NULL app) are included
  - Each category includes: `id`, `name`, `description`, `icon`, `product_count`
  - Response is ordered by `name` ascending
  - HTTP 200

#### Scenario: Tenant-wide categories included
- **GIVEN** Tenant A has a category with `verification_app_id = NULL` (tenant-wide) and another with `verification_app_id = X` (app-specific)
- **WHEN** `GET /api/ecommerce/v1/categories` is called with API key for App X
- **THEN** both categories SHALL appear in the response

#### Scenario: Empty category list
- **GIVEN** a tenant with no active categories configured
- **WHEN** `GET /api/ecommerce/v1/categories` is called
- **THEN** the system SHALL return HTTP 200 with `categories: []`

#### Scenario: Tenant isolation enforced
- **GIVEN** API key belongs to Tenant A / App X
- **WHEN** `GET /api/ecommerce/v1/categories` is called
- **THEN** the system SHALL NOT return categories belonging to Tenant B or to a different app under Tenant A (unless they are tenant-wide)

---

### Requirement: List Products by Category
The ecommerce API SHALL return paginated products scoped to a specific category.

#### Scenario: Get products for a valid category
- **GIVEN** category ID `42` belongs to Tenant A / App X and has active products
- **WHEN** `GET /api/ecommerce/v1/categories/42/products` is called
- **THEN** the system SHALL return:
  - Products joined via `product_categories` where `category_id = 42`
  - Filtered to active products only (`is_active = true`)
  - Includes: `id`, `product_name`, `product_sku`, `price`, `currency`, `image_url`, `stock_status`, `attributes`
  - Paginated with `page`, `limit`, `total`, `totalPages`
  - HTTP 200

#### Scenario: Category not found
- **GIVEN** category ID `999` does not exist for this tenant (either app-specific or tenant-wide)
- **WHEN** `GET /api/ecommerce/v1/categories/999/products` is called
- **THEN** the system SHALL return HTTP 404 with `error: "Category not found"`

#### Scenario: Category with no products
- **GIVEN** a valid category with zero active products
- **WHEN** `GET /api/ecommerce/v1/categories/:id/products` is called
- **THEN** the system SHALL return HTTP 200 with `products: []` and `total: 0`

#### Scenario: Pagination parameters respected
- **GIVEN** a category with 75 products
- **WHEN** `GET /api/ecommerce/v1/categories/42/products?page=2&limit=25` is called
- **THEN** the system SHALL return products 26–50 with correct pagination metadata

---

## Cross-references
- Related spec: `product-catalog` (products data model)
- Related spec: `external-apis` (authentication, response format, rate limiting)
