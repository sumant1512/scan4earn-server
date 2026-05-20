# Implementation Tasks

## 1. Backend Implementation (Optional - if endpoint doesn't exist)
- [x] 1.1 Verify batch status update endpoint exists (`POST /api/rewards/coupons/bulk-print`) ✅ EXISTS
- [x] 1.2 Ensure validation exists for DRAFT-to-PRINTED transitions only ✅ VERIFIED
- [x] 1.3 Verify transaction support for atomic batch status updates ✅ VERIFIED
- [ ] 1.4 Add audit logging for print operations (if not already present)

## 2. Frontend - Update Existing "Mark as Printed" Button
- [x] 2.1 Modify button click handler to open print preview modal (instead of directly updating status)
- [x] 2.2 Pass selected coupons data to modal component
- [x] 2.3 Verify existing checkbox selection and counter work correctly

## 3. Frontend - Print Preview Modal
- [x] 3.1 Create `CouponPrintPreviewComponent` modal component
- [x] 3.2 Design print-friendly layout with QR codes and coupon details
- [x] 3.3 Add CSS for print media queries (`@media print`)
- [x] 3.4 Display selected coupons in grid/card format
- [x] 3.5 Add "Print" button in modal footer
- [x] 3.6 Add "Cancel" button to close modal

## 4. Frontend - Print Functionality
- [x] 4.1 Implement browser print trigger using `window.print()`
- [x] 4.2 Handle print dialog cancellation (triggers after delay)
- [x] 4.3 Call backend API to mark coupons as PRINTED after print dialog
- [x] 4.4 Refresh coupon list after successful status update
- [x] 4.5 Show success/error notifications

## 5. Print Layout Design
- [x] 5.1 Design printable coupon card layout
- [x] 5.2 Include QR code, coupon code, discount details, expiry date
- [x] 5.3 Optimize for standard paper sizes (A4, Letter)
- [x] 5.4 Add print-specific CSS (hide modal header/footer, remove shadows)
- [x] 5.5 Support multiple coupons per page (2x2 grid)

## 6. Testing
- [ ] 6.1 Test checkbox selection/deselection
- [ ] 6.2 Test "Select All" functionality
- [ ] 6.3 Test modal open/close
- [ ] 6.4 Test print preview rendering
- [ ] 6.5 Test status update from DRAFT to PRINTED
- [ ] 6.6 Test error handling (invalid status transitions)
- [ ] 6.7 Test print layout on different paper sizes
- [ ] 6.8 Test with large batch selections (100+ coupons)

## 7. Documentation
- [ ] 7.1 Update API documentation with new endpoint
- [ ] 7.2 Update user guide with print instructions
- [ ] 7.3 Add screenshots of print preview modal
