# Product Catalog Management

## Purpose
Flexible product catalog system with reusable templates, dynamic JSONB attributes, product variants, categorization via tags, and structured descriptions.

---

## Requirements

### Requirement: Product Template System
The system SHALL provide reusable product templates that define structure, attributes, and variants for products.

#### Scenario: Create product template
- **WHEN** a TENANT_ADMIN creates a template "Restaurant Menu Item"
- **THEN** the system SHALL allow defining:
  - Custom attributes (e.g., cuisine: select, spice_level: number)
  - Variant definitions (e.g., size: Regular/Large)
  - Structured description fields
  - Template name and category

#### Scenario: Template-based product creation
- **WHEN** a user creates a product using template "Restaurant Menu Item"
- **THEN** the system SHALL pre-populate the form with template fields
- **AND** enforce attribute types (text, number, select, etc.)
- **AND** provide variant options from template

**Example Template Definition:**
```json
{
  "name": "Restaurant Menu Item",
  "attributes": [
    {"name": "cuisine", "type": "select", "options": ["Italian", "Chinese", "Indian"]},
    {"name": "spice_level", "type": "number", "min": 1, "max": 5},
    {"name": "ingredients", "type": "text"}
  ],
  "variant_definitions": [
    {"name": "size", "options": ["Regular", "Large", "Family"]}
  ]
}
```

---

### Requirement: Dynamic Product Attributes (JSONB)
The system SHALL support flexible product attributes stored as JSONB for extensibility.

#### Scenario: Create product with custom attributes
- **WHEN** a user creates product "Margherita Pizza" with attributes `{cuisine: "Italian", spice_level: 2, ingredients: "tomato, mozzarella, basil"}`
- **THEN** the system SHALL store attributes in JSONB column
- **AND** allow querying by attribute values
- **AND** display attributes dynamically in UI

#### Scenario: Query products by JSONB attributes
- **WHEN** a user searches for products where `attributes->>'cuisine' = 'Italian'`
- **THEN** the system SHALL return all products with cuisine=Italian
- **AND** use GIN index on JSONB column for performance

---

### Requirement: Product Variants
The system SHALL support product variants (e.g., size, color, flavor) with separate SKUs or embedded variants.

#### Scenario: Create product with variants
- **WHEN** a user creates product "T-Shirt" with variants [Size: S/M/L, Color: Red/Blue]
- **THEN** the system SHALL allow creating multiple variant combinations
- **AND** each variant can have unique pricing, SKU, and stock
- **AND** variants SHALL be linked to parent product

#### Scenario: Variant selection in coupon generation
- **WHEN** generating coupons for a product with variants
- **THEN** the system SHALL allow selecting specific variants
- **OR** selecting "All variants"

---

### Requirement: Product Tagging and Categorization
The system SHALL support flexible product categorization using tags (many-to-many relationship).

#### Scenario: Assign tags to product
- **WHEN** a user creates product "Burger" and assigns tags ["fast-food", "lunch", "bestseller"]
- **THEN** the system SHALL create tag associations in `product_tags` junction table
- **AND** allow filtering products by tags

#### Scenario: Tag-based product filtering
- **WHEN** a user filters products by tag "bestseller"
- **THEN** the system SHALL return all products with that tag
- **AND** support multiple tag filters (AND/OR logic)

---

### Requirement: Structured Product Descriptions
The system SHALL support multi-field structured descriptions beyond simple text.

#### Scenario: Create product with structured description
- **WHEN** a user creates a product with description fields: `short_desc`, `long_desc`, `usage_instructions`
- **THEN** the system SHALL store structured description in JSONB
- **AND** render each field appropriately in UI

---

### Requirement: Product Management Operations
The system SHALL provide full CRUD operations for products with proper permissions.

#### Scenario: Create product
- **WHEN** a user with `CREATE_PRODUCTS` permission creates a product
- **THEN** the system SHALL validate required fields (name, template/attributes)
- **AND** create the product record
- **AND** return product ID and details

#### Scenario: Update product
- **WHEN** a user with `EDIT_PRODUCTS` permission updates a product
- **THEN** the system SHALL allow modifying attributes, variants, tags
- **AND** maintain version history (updated_at timestamp)

#### Scenario: Delete product with active coupons
- **WHEN** a user attempts to delete a product linked to active coupons
- **THEN** the system SHALL prevent deletion
- **AND** return error "Cannot delete product with active coupons"

#### Scenario: Search products
- **WHEN** a user searches for "pizza"
- **THEN** the system SHALL search in product name, description, and attributes
- **AND** return paginated results
- **AND** support filters (tags, template, date range)

---

## Database Schema

**Tables:**
- `templates` - Product templates
  - `id`, `tenant_id`, `name`, `structure` (JSONB), `created_at`
- `products` - Product catalog
  - `id`, `tenant_id`, `template_id` (nullable), `name`, `attributes` (JSONB), `variants` (JSONB), `description` (JSONB), `created_at`, `updated_at`
- `tags` - Product tags
  - `id`, `tenant_id`, `name`, `color` (optional)
- `product_tags` - Many-to-many relationship
  - `product_id`, `tag_id`

**Indexes:**
- GIN index on `products.attributes` for JSONB queries
- Index on `products.tenant_id` and `tags.tenant_id`
- Index on `product_tags(product_id, tag_id)`

---

## API Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/api/products` | Create product | `CREATE_PRODUCTS` |
| GET | `/api/products` | List/search products | `VIEW_PRODUCTS` |
| GET | `/api/products/:id` | Get product details | `VIEW_PRODUCTS` |
| PUT | `/api/products/:id` | Update product | `EDIT_PRODUCTS` |
| DELETE | `/api/products/:id` | Delete product | `DELETE_PRODUCTS` |
| POST | `/api/templates` | Create template | TENANT_ADMIN |
| GET | `/api/templates` | List templates | `VIEW_PRODUCTS` |
| POST | `/api/tags` | Create tag | TENANT_ADMIN |
| GET | `/api/tags` | List tags | `VIEW_PRODUCTS` |

---

## UI Components

- `ProductListComponent` - Product listing with search/filter
- `ProductFormComponent` - Create/edit product form
- `TemplateProductFormComponent` - Template-based product creation
- `TemplateListComponent` - Manage templates
- `TagListComponent` - Manage tags
- `VariantListEditorComponent` - Variant management UI

---

## Validation Rules

1. **Product Name**: Required, 2-200 characters, unique per tenant
2. **Template or Attributes**: Either template_id OR custom attributes MUST be provided
3. **JSONB Validation**: Attributes MUST be valid JSON
4. **Variant Structure**: Variants MUST follow defined schema
5. **Tag Limit**: Maximum 20 tags per product
