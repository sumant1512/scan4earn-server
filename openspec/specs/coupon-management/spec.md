# Coupon Generation & Management

## Purpose
Generate single or batch coupons (up to 10,000) with unique codes and QR codes. Manage coupon lifecycle from DRAFT through ACTIVE to USED/EXPIRED with credit-based generation.

---

## Requirements

### Requirement: Batch Coupon Generation
The system SHALL support generating single coupons or batches of up to 10,000 coupons in a single operation.

#### Scenario: Generate batch of coupons
- **WHEN** a TENANT_ADMIN generates 1000 coupons for product "Summer Sale"
- **THEN** the system SHALL:
  - Validate credit balance (1000 credits required)
  - Generate 1000 unique coupon codes
  - Generate QR codes with embedded JSON data
  - Deduct 1000 credits from tenant balance
  - Create 1000 database records
  - Return batch ID and summary

#### Scenario: Unique coupon code generation
- **WHEN** generating coupon codes
- **THEN** each code SHALL be globally unique
- **AND** follow format: 8-12 alphanumeric characters (uppercase)
- **AND** exclude ambiguous characters (0, O, I, 1, etc.)
- **AND** validate uniqueness before database insertion

---

### Requirement: QR Code Generation with Embedded Data
The system SHALL generate QR codes containing coupon verification data in JSON format.

#### Scenario: QR code data structure
- **WHEN** generating a QR code for coupon "ABC123XYZ"
- **THEN** the QR code SHALL embed JSON:
```json
{
  "couponCode": "ABC123XYZ",
  "couponPoints": 100,
  "discountType": "FIXED_AMOUNT",
  "discountValue": 50,
  "expiryDate": "2024-12-31",
  "verifyUrl": "https://tenant.mscan.com/scan/ABC123XYZ"
}
```
- **AND** the QR code image SHALL be generated as PNG/SVG
- **AND** stored as base64 or URL reference

#### Scenario: QR code scanning verification
- **WHEN** a QR code is scanned
- **THEN** the scanning app SHALL decode the JSON data
- **AND** make verification request to `verifyUrl`
- **AND** validate coupon status server-side

---

### Requirement: Coupon Lifecycle Management
The system SHALL enforce strict status transitions for coupons: DRAFT → PRINTED → ACTIVE → USED (or EXPIRED).

#### Scenario: Coupon status transitions
- **WHEN** a coupon is created
- **THEN** initial status SHALL be DRAFT
- **WHEN** marked as printed
- **THEN** status SHALL transition to PRINTED
- **WHEN** activated via batch activation
- **THEN** status SHALL transition to ACTIVE
- **WHEN** scanned and redeemed
- **THEN** status SHALL transition to USED
- **WHEN** expiry date passes
- **THEN** status SHALL automatically transition to EXPIRED

#### Scenario: Invalid status transition prevention
- **WHEN** attempting to transition coupon directly from DRAFT to USED
- **THEN** the system SHALL reject with error "Invalid status transition"
- **AND** enforce proper sequence (DRAFT → ACTIVE → USED)

---

### Requirement: Batch Activation
The system SHALL support activating multiple coupons in a single operation.

#### Scenario: Batch activation of coupons
- **WHEN** a TENANT_ADMIN selects 500 coupons and activates them
- **THEN** the system SHALL:
  - Validate all coupons are in DRAFT or PRINTED status
  - Update all coupon statuses to ACTIVE atomically
  - Record activation timestamp
  - Send confirmation notification
  - Return success count and any failures

#### Scenario: Partial batch activation failure
- **WHEN** activating a batch where some coupons are already USED
- **THEN** the system SHALL:
  - Activate only valid coupons
  - Return list of failures with reasons
  - NOT rollback successful activations

---

### Requirement: Coupon Expiration
The system SHALL support optional expiry dates and automatic expiration.

#### Scenario: Set expiry date during creation
- **WHEN** creating coupons with expiry date "2024-12-31"
- **THEN** the coupons SHALL be marked with expiry_date
- **AND** SHALL NOT be scannable after that date

#### Scenario: Automatic expiration check
- **WHEN** scanning a coupon after its expiry date
- **THEN** the system SHALL reject with error "Coupon expired"
- **AND** optionally transition status to EXPIRED

#### Scenario: No expiry date (perpetual coupons)
- **WHEN** creating coupons without expiry date
- **THEN** the coupons SHALL remain valid indefinitely
- **AND** expiry_date column SHALL be NULL

---

### Requirement: Coupon Export Capabilities
The system SHALL support exporting coupon data in CSV and PDF formats.

#### Scenario: Export coupons to CSV
- **WHEN** a user exports coupons to CSV
- **THEN** the system SHALL generate a CSV file with columns:
  - Coupon Code, Status, Points, Expiry Date, QR Code URL, Created At
- **AND** include only coupons matching current filters
- **AND** download file as `coupons_export_YYYYMMDD.csv`

#### Scenario: Export coupons to PDF with QR codes
- **WHEN** a user exports coupons to PDF
- **THEN** the system SHALL generate a printable PDF
- **AND** include QR code images for each coupon
- **AND** format for printing (e.g., 4x6 labels)

---

### Requirement: Credit Deduction on Generation
The system SHALL deduct 1 credit per coupon generated.

#### Scenario: Credit validation before generation
- **WHEN** attempting to generate 100 coupons
- **THEN** the system SHALL verify credit_balance >= 100
- **AND** proceed only if sufficient credits exist
- **AND** reject with "Insufficient credits" otherwise

#### Scenario: Atomic credit deduction
- **WHEN** generating coupons
- **THEN** credit deduction and coupon creation SHALL occur in a database transaction
- **AND** rollback both operations if either fails
- **AND** prevent partial generation

---

## Database Schema

**Tables:**
- `coupons` - Coupon records
  - `id`, `tenant_id`, `product_id`, `code` (VARCHAR, unique), `qr_code` (TEXT), `status` (ENUM), `points`, `discount_type`, `discount_value`, `expiry_date` (nullable), `serial_number` (optional), `created_at`, `updated_at`, `activated_at`, `scanned_at`

**Status Enum:** `DRAFT`, `PRINTED`, `ACTIVE`, `USED`, `EXPIRED`

**Indexes:**
- Unique index on `code`
- Index on `tenant_id` and `status`
- Index on `product_id`
- Index on `expiry_date` for expiration checks

---

## API Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/api/coupons/generate` | Generate coupons (single/batch) | `CREATE_COUPONS` |
| GET | `/api/coupons` | List coupons with filters | `VIEW_COUPONS` |
| GET | `/api/coupons/:id` | Get coupon details | `VIEW_COUPONS` |
| POST | `/api/coupons/batch-activate` | Activate multiple coupons | `ACTIVATE_COUPONS` |
| PUT | `/api/coupons/:id` | Update coupon status | `EDIT_COUPONS` |
| GET | `/api/coupons/export` | Export to CSV/PDF | `VIEW_COUPONS` |
| DELETE | `/api/coupons/:id` | Delete coupon (DRAFT only) | `DELETE_COUPONS` |

---

## UI Components

- `CouponListComponent` - List coupons with filters (status, product, date range)
- `CouponCreateComponent` - Generate single/batch coupons
- `BatchActivationWizardComponent` - Multi-step batch activation
- `CouponExportComponent` - Export options (CSV/PDF)

---

## Business Rules

1. **Generation Limit**: Maximum 10,000 coupons per batch
2. **Code Format**: 8-12 alphanumeric uppercase characters
3. **Credit Rate**: 1 credit = 1 coupon (fixed)
4. **Deletion**: Only DRAFT coupons can be deleted
5. **Status Transition**: Enforce proper lifecycle sequence
6. **Expiry Check**: Run daily job to expire coupons past expiry_date
