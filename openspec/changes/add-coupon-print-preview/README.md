# Coupon Print Preview - Change Proposal

## Overview
This OpenSpec change proposal adds a print preview modal and batch printing functionality to the coupon management system.

## Change ID
`add-coupon-print-preview`

## Status
✅ **Validated** - Ready for review and approval

## Quick Links
- [Proposal](./proposal.md) - Why this change is needed
- [Tasks](./tasks.md) - Implementation checklist (23 tasks)
- [Spec Delta](./specs/coupon-management/spec.md) - Requirements and scenarios

## What This Adds

### Uses Existing Features
1. **Multi-Selection on Coupon List** ✅ Already exists
   - Checkboxes for each coupon
   - "Select All" functionality
   - Selection counter
   - "Mark as Printed" button

### New Features
1. **Print Preview Modal**
   - Shows selected coupons in print-friendly layout
   - Displays QR codes and coupon details
   - Optimized for A4/Letter paper (2x2 grid)

3. **Print Functionality**
   - Triggers browser print dialog
   - Applies print-specific CSS styles
   - Hides non-essential UI elements

4. **Status Management**
   - Automatically transitions DRAFT → PRINTED after printing
   - Atomic batch status updates
   - Records `printed_at` timestamp

### Backend Endpoint
Uses existing (or creates if needed):
```
POST /api/coupons/batch-mark-printed
Body: { "couponIds": [1, 2, 3] }
```

### New Component
- `CouponPrintPreviewComponent` - Modal with print preview and print button

## Requirements Added
This change adds **3 new requirements** to the `coupon-management` spec:

1. **Print Preview Modal** (3 scenarios)
   - Open print preview
   - Print preview layout optimization
   - Non-DRAFT coupon prevention

2. **Print Functionality** (4 scenarios)
   - Trigger browser print
   - Status update after printing
   - Handle print cancellation
   - Atomic batch status update

3. **Print Layout Styles** (3 scenarios)
   - Print media queries
   - Coupon card print dimensions
   - Page break handling

## Validation
```bash
openspec validate add-coupon-print-preview --strict
# Result: ✅ Change 'add-coupon-print-preview' is valid
```

## Implementation Checklist

### Backend (4 tasks)
- [ ] Verify/create batch status update endpoint
- [ ] Ensure validation for DRAFT coupons only
- [ ] Verify transaction support
- [ ] Add audit logging (if needed)

### Frontend - Update Existing Button (3 tasks)
- [ ] Modify "Mark as Printed" button click handler
- [ ] Pass selected coupons to modal
- [ ] Verify existing checkbox selection works

### Frontend - Print Modal (6 tasks)
- [ ] Create modal component
- [ ] Design print layout
- [ ] Add print media queries
- [ ] Display coupons in grid
- [ ] Add Print button
- [ ] Add Cancel button

### Frontend - Print Logic (5 tasks)
- [ ] Implement `window.print()`
- [ ] Handle cancellation
- [ ] Call status update API
- [ ] Refresh list
- [ ] Show notifications

### Print Layout (5 tasks)
- [ ] Design coupon card layout
- [ ] Include QR code and details
- [ ] Optimize for paper sizes
- [ ] Add print-specific CSS
- [ ] Support multi-coupon grid

### Testing (8 tasks)
- [ ] Test selection
- [ ] Test modal
- [ ] Test print preview
- [ ] Test status updates
- [ ] Test error handling
- [ ] Test print layout
- [ ] Test large batches

### Documentation (3 tasks)
- [ ] Update API docs
- [ ] Update user guide
- [ ] Add screenshots

**Total: 34 tasks** (reduced from 36 - leveraging existing selection UI)

## Business Rules

1. **Print Eligibility**: Only DRAFT coupons can be marked as PRINTED
2. **Batch Updates**: All updates are atomic (all succeed or all fail)
3. **Print Layout**: 2x2 grid (4 coupons per page)
4. **QR Code Size**: Minimum 100x100mm for reliable scanning
5. **Status Flow**: DRAFT → PRINTED → ACTIVE → USED

## User Flow

```
1. User navigates to Coupon List
2. User selects multiple DRAFT coupons via EXISTING checkboxes
3. User clicks EXISTING "Mark as Printed" button
4. System validates all selected coupons are DRAFT
5. System opens NEW Print Preview Modal (instead of directly updating)
6. Modal displays coupons in print layout with QR codes
7. User clicks "Print" button in modal
8. Browser print dialog opens
9. User confirms print
10. System calls POST /api/coupons/batch-mark-printed (existing or new)
11. All selected coupons transition to PRINTED status
12. Modal closes, list refreshes
13. Success notification shows: "X coupons marked as printed"
```

## Next Steps

1. **Review** - Stakeholders review this proposal
2. **Approve** - Get approval to proceed with implementation
3. **Implement** - Complete tasks in `tasks.md`
4. **Test** - Verify all scenarios work correctly
5. **Deploy** - Release to production
6. **Archive** - Run `openspec archive add-coupon-print-preview`

## Questions or Feedback?

Review the proposal files and provide feedback before implementation begins.
