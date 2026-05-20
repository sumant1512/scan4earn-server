# Change: Add Coupon Print Preview and Batch Printing

## Why
Tenant admins need the ability to print physical coupons for distribution. The coupon list already has checkbox selection and a "Mark as Printed" button, but clicking it currently just updates the status without showing a print preview. We need to add a print preview modal that displays the selected coupons in a print-friendly format before updating the status.

## Preview
![Coupon UI](<Screenshot 2026-02-02 at 10.45.57 AM.png>)

## What Changes
- **Use existing** checkbox selection and "Mark as Printed" button on coupon list
- **Add** print preview modal that opens when "Mark as Printed" button is clicked
- **Add** print-friendly layout showing selected coupons with QR codes
- **Add** print functionality that triggers browser print dialog
- **Keep** automatic status transition from DRAFT to PRINTED after printing
- **Add** print-specific CSS styles and layout optimization

## Impact
- Affected specs: `coupon-management`
- Affected code:
  - Frontend: `mscan-client/src/app/components/rewards/coupon-list.component.ts` (modify click handler)
  - Frontend: `mscan-client/src/app/components/rewards/coupon-list.component.html` (connect modal)
  - Backend: `mscan-server/src/controllers/rewards.controller.js` (keep existing endpoint)
  - Backend: `mscan-server/src/routes/rewards.routes.js` (keep existing route)
- New components: `CouponPrintPreviewComponent` (modal)
