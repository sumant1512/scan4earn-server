# Ecommerce Module

## Purpose
The ecommerce module enables CUSTOMER users to browse the product catalog and manage their profiles through the mobile app. Self-registration via mobile OTP ensures zero-friction onboarding. This phase covers customer profile and catalog browsing only — no order management.

---

## ADDED Requirements

### Requirement: Customer Self-Registration for Ecommerce
The system SHALL allow users to self-register as CUSTOMER via mobile OTP and immediately access ecommerce features.

#### Scenario: New user self-registration flow
- **WHEN** an unregistered mobile number completes OTP verification
- **THEN** the system SHALL:
  - Create a `users` record with role=CUSTOMER, phone_e164 only (no name or email required)
  - Create a `customers` record with phone_verified=true
  - Issue JWT tokens with role=CUSTOMER
  - Grant access to ecommerce endpoints
  - NOT require any admin intervention

#### Scenario: Returning customer login
- **WHEN** a previously registered CUSTOMER completes OTP verification
- **THEN** the system SHALL issue new JWT tokens
- **AND** return the existing customer profile

### Requirement: Product Catalog Browsing
The system SHALL provide CUSTOMER users with read-only access to the tenant's product catalog.

#### Scenario: List products
- **WHEN** a CUSTOMER sends GET `/api/mobile/v1/ecommerce/products`
- **THEN** the system SHALL return paginated product list with:
  - id, name, description, price, images, category, stock_status
  - Support for search, category filter, and sorting (price, name, newest)
  - Only products with is_active=true and belonging to the customer's tenant

#### Scenario: Get product details
- **WHEN** a CUSTOMER sends GET `/api/mobile/v1/ecommerce/products/:id`
- **THEN** the system SHALL return full product details including:
  - id, name, description, price, images, category, tags
  - variants (from JSONB attributes)
  - stock_status, template information
- **AND** the product MUST belong to the customer's tenant

#### Scenario: Product not found
- **WHEN** a CUSTOMER requests a product that doesn't exist or belongs to another tenant
- **THEN** the system SHALL return 404 Not Found

### Requirement: Customer Profile Management
The system SHALL allow CUSTOMER users to view and update their profile.

#### Scenario: Get customer profile
- **WHEN** a CUSTOMER sends GET `/api/mobile/v1/ecommerce/profile`
- **THEN** the system SHALL return:
  - id, full_name, email, phone_e164, phone_verified, email_verified
  - tenant: { id, name, subdomain }
  - profile_complete: true (if full_name and email are set) or false

#### Scenario: Update customer profile
- **WHEN** a CUSTOMER sends PUT `/api/mobile/v1/ecommerce/profile` with `{ full_name, email }`
- **THEN** the system SHALL update the customer's profile
- **AND** update both `users` and `customers` records
- **AND** return the updated profile

#### Scenario: Email verification on profile update
- **WHEN** a CUSTOMER updates their email address
- **THEN** the system SHALL:
  - Set email_verified=false on the customers record
  - Optionally trigger email verification flow
  - Return `{ profile_updated: true, email_verification_required: true }`

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/mobile/v1/ecommerce/products` | JWT (CUSTOMER) | Browse catalog |
| GET | `/api/mobile/v1/ecommerce/products/:id` | JWT (CUSTOMER) | Product details |
| GET | `/api/mobile/v1/ecommerce/profile` | JWT (CUSTOMER) | Get profile |
| PUT | `/api/mobile/v1/ecommerce/profile` | JWT (CUSTOMER) | Update profile |

---

## Feature Flags

| Flag Code | Description | Default |
|-----------|-------------|---------|
| `ecommerce` | Enable ecommerce module for tenant | disabled |

---

## Security Considerations

1. **Tenant Isolation**: Product queries MUST be filtered by tenant_id
2. **Profile Ownership**: Customers MUST only access/update their own profile
3. **Rate Limiting**: Catalog browsing SHOULD be rate-limited to prevent abuse
