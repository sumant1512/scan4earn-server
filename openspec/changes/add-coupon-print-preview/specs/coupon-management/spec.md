# Coupon Management - Print Preview Delta

## ADDED Requirements

### Requirement: Print Preview Modal
The system SHALL provide a print preview modal displaying selected coupons in a print-friendly format when using the existing "Mark as Printed" button.

#### Scenario: Open print preview
- **WHEN** a TENANT_ADMIN selects 5 DRAFT coupons using existing checkboxes
- **AND** clicks the existing "Mark as Printed" button
- **THEN** a modal SHALL open
- **AND** display all 5 selected coupons in print layout
- **AND** show each coupon with:
  - QR code image
  - Coupon code (large, readable font)
  - Discount details (type, value)
  - Expiry date (if set)
  - Product name
- **AND** display a "Print" button in modal footer
- **AND** display a "Cancel" button in modal footer

#### Scenario: Print preview layout optimization
- **WHEN** the print preview modal is displayed
- **THEN** coupons SHALL be arranged in a grid layout
- **AND** be optimized for standard paper sizes (A4, Letter)
- **AND** use 2x2 or 3x2 grid depending on coupon count
- **AND** include page breaks between groups if many coupons

#### Scenario: Non-DRAFT coupon prevention
- **WHEN** a user selects coupons with mixed statuses (DRAFT, ACTIVE, USED)
- **AND** clicks "Mark as Printed"
- **THEN** the system SHALL show an error message
- **AND** error SHALL state: "Only DRAFT coupons can be marked as printed"
- **AND** list the invalid coupon codes
- **AND** NOT open the print preview modal

---

### Requirement: Print Functionality
The system SHALL trigger browser print dialog and update coupon status to PRINTED after printing.

#### Scenario: Trigger browser print
- **WHEN** a user clicks the "Print" button in the print preview modal
- **THEN** the browser print dialog SHALL open
- **AND** only the coupon cards SHALL be visible in print preview (modal header/footer hidden)
- **AND** print styles SHALL remove shadows, borders, and background colors
- **AND** use black and white for optimal printing

#### Scenario: Status update after printing
- **WHEN** a user confirms printing in the browser dialog
- **THEN** the system SHALL call `POST /api/coupons/batch-mark-printed`
- **AND** send array of selected coupon IDs in request body
- **WHEN** the API request succeeds
- **THEN** all selected coupons SHALL transition from DRAFT to PRINTED
- **AND** `printed_at` timestamp SHALL be recorded
- **AND** the modal SHALL close
- **AND** the coupon list SHALL refresh
- **AND** a success notification SHALL display: "5 coupons marked as printed"

#### Scenario: Handle print cancellation
- **WHEN** a user opens the print dialog but cancels it
- **THEN** no status update SHALL occur
- **AND** the modal SHALL remain open
- **AND** the user can try printing again or close the modal

#### Scenario: Atomic batch status update
- **WHEN** marking 100 coupons as PRINTED
- **THEN** all status updates SHALL occur in a single database transaction
- **AND** if any coupon update fails, all updates SHALL be rolled back
- **AND** return error message with failed coupon codes
- **AND** NOT partially update coupon statuses

---

### Requirement: Print Layout Styles
The system SHALL apply print-specific CSS styles to optimize coupon printing.

#### Scenario: Print media queries
- **WHEN** the print dialog is triggered
- **THEN** the following styles SHALL be applied via `@media print`:
  - Hide modal header, footer, and background overlay
  - Hide "Print" and "Cancel" buttons
  - Remove box shadows and rounded corners
  - Set white background for all elements
  - Use black text color for readability
  - Set page margins to 10mm

#### Scenario: Coupon card print dimensions
- **WHEN** printing coupons
- **THEN** each coupon card SHALL be:
  - Fixed width and height for consistency
  - Contain QR code sized at 100x100mm
  - Include adequate padding (5mm) around content
  - Use readable font sizes (minimum 12pt for body text)
  - Display coupon code in bold, large font (18pt)

#### Scenario: Page break handling
- **WHEN** printing more than 4 coupons
- **THEN** the system SHALL insert page breaks after every 4 coupons (2x2 grid)
- **AND** prevent coupon cards from being split across pages
- **AND** ensure each page starts with a complete coupon card

---

## API Endpoints (Additional)

| Method | Endpoint | Description | Permission | Request Body |
|--------|----------|-------------|------------|--------------|
| POST | `/api/coupons/batch-mark-printed` | Mark multiple coupons as PRINTED | `EDIT_COUPONS` | `{ "couponIds": [1, 2, 3] }` |

**Response:**
```json
{
  "success": true,
  "message": "5 coupons marked as printed",
  "updated": 5,
  "failed": [],
  "coupons": [
    {
      "id": 1,
      "code": "ABC123XYZ",
      "status": "PRINTED",
      "printed_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Error Response (partial failure):**
```json
{
  "success": false,
  "message": "Some coupons could not be marked as printed",
  "updated": 3,
  "failed": [
    {
      "id": 4,
      "code": "DEF456UVW",
      "reason": "Coupon is already ACTIVE, cannot transition to PRINTED"
    }
  ]
}
```

---

## UI Components (Additional)

- `CouponPrintPreviewComponent` - Modal displaying selected coupons in print layout
  - Inputs: `selectedCoupons` (array of coupon objects)
  - Outputs: `onPrintComplete` (emits updated coupon IDs), `onCancel` (emits close event)
  - Features: Print button, cancel button, responsive grid layout, print media queries

---

## Business Rules (Additional)

1. **Print Eligibility**: Only coupons with status DRAFT can be marked as PRINTED
2. **Batch Print Limit**: No hard limit on number of coupons to print (UX may suggest batches of 50-100)
3. **Status Transition**: DRAFT → PRINTED is a valid transition; updates are atomic
4. **Print Layout**: Optimize for 2x2 grid (4 coupons per page) on A4/Letter paper
5. **QR Code Size**: QR codes in print preview should be at least 100x100mm for reliable scanning
6. **Timestamp Recording**: `printed_at` timestamp is recorded when status changes to PRINTED
