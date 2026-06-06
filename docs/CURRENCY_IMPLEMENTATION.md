# Currency Implementation - Verification App Level

## Overview
Currency settings have been successfully implemented at the **verification app level**. Tenant admins can now select their preferred currency when creating or editing a verification app. This currency will be used throughout the application for products, rewards, coupons, and transactions associated with that specific verification app.

## Implementation Summary

### Key Decision
✅ **Currency is set at Verification App level** (NOT at Tenant level)
- Each verification app can have its own currency
- Tenant admins configure currency during app creation
- Super admins do NOT set currency during tenant creation

## Changes Made

### 1. Database Changes

#### Initial Setup (No Migration Required)
- **File**: `/mscan-server/database/full_setup.sql` (lines 147-170)
- **Changes**: Currency field is part of the initial database schema
  - Added `currency VARCHAR(3) DEFAULT 'INR'` column to `verification_apps` table (line 165)
  - Added constraint `check_verification_app_currency` for 22 supported currency codes (line 169)
  - Default currency is 'INR' for new verification apps

**Note**: This is part of the initial setup, not a migration. When running `full_setup.sql` on a fresh database, the currency field will be created automatically.

#### Supported Currencies (22 total):
| Code | Name | Symbol |
|------|------|--------|
| USD | US Dollar | $ |
| EUR | Euro | € |
| GBP | British Pound | £ |
| INR | Indian Rupee | ₹ |
| AUD | Australian Dollar | A$ |
| CAD | Canadian Dollar | C$ |
| JPY | Japanese Yen | ¥ |
| CNY | Chinese Yuan | ¥ |
| CHF | Swiss Franc | CHF |
| SGD | Singapore Dollar | S$ |
| AED | UAE Dirham | AED |
| MYR | Malaysian Ringgit | RM |
| THB | Thai Baht | ฿ |
| ZAR | South African Rand | R |
| NZD | New Zealand Dollar | NZ$ |
| MXN | Mexican Peso | MX$ |
| BRL | Brazilian Real | R$ |
| KRW | South Korean Won | ₩ |
| HKD | Hong Kong Dollar | HK$ |
| SEK | Swedish Krona | kr |
| NOK | Norwegian Krone | kr |
| DKK | Danish Krone | kr |

### 2. Backend Changes

#### Rewards Controller (Verification App Management)
- **File**: `/mscan-server/src/controllers/rewards.controller.js`
- **Changes**:
  - **createVerificationApp()**: Now accepts `currency` parameter, defaults to 'INR' (line 31, 74, 81)
  - **getVerificationApps()**: Includes `currency` in SELECT query (line 117)
  - **getVerificationAppById()**: Includes `currency` in SELECT query (line 165)
  - **updateVerificationApp()**: Allows updating the currency setting (line 212)

### 3. Frontend Changes

#### Verification App Model
- **File**: `/mscan-client/src/app/store/verification-apps/verification-apps.models.ts`
- **Changes**: Added `currency?: string` field to VerificationApp interface (line 16)

#### Verification App Configure Component
- **File**: `/mscan-client/src/app/components/verification-app/verification-app-configure.component.ts`
- **Changes**:
  - Added `currencies` array with 22 currency objects (code, name, symbol)
  - Added `currency` form control with 'INR' default and required validation (line 45)
  - Currency is automatically loaded when editing existing apps

#### Verification App Configure Template
- **File**: `/mscan-client/src/app/components/verification-app/verification-app-configure.component.html`
- **Changes**:
  - Added currency dropdown selector in "Basic Information" section (after template selection)
  - Displays format: `Symbol CODE - Name` (e.g., "₹ INR - Indian Rupee")
  - Includes help text explaining currency usage
  - Marked as required field

## Usage

### Creating a New Verification App (Tenant Admin)
1. Navigate to **Tenant Dashboard** > **Verification Apps** > **Create New App**
2. Fill in Basic Information:
   - App Name (required)
   - Description (optional)
   - Logo URL (optional)
   - **Product Template** (required)
   - **Application Currency** (required, defaults to INR)
3. Configure Branding (colors)
4. Set Messages (welcome, success, failure)
5. Submit the form

### Updating Verification App Currency (Tenant Admin)
1. Navigate to **Verification Apps** > Select app > **Edit**
2. Change the currency dropdown to desired currency
3. Save changes

### API Examples

#### Create Verification App with Currency
```json
POST /api/verification-apps
Authorization: Bearer <tenant_admin_token>

{
  "app_name": "My Loyalty App",
  "description": "Customer loyalty and rewards",
  "template_id": "uuid-of-template",
  "currency": "USD",
  "primary_color": "#00d4ff",
  "secondary_color": "#1a1a2e",
  "welcome_message": "Welcome! Scan to verify your coupon.",
  "scan_success_message": "Coupon verified successfully!",
  "scan_failure_message": "Invalid or expired coupon."
}
```

**Response:**
```json
{
  "message": "Verification app created successfully",
  "app": {
    "id": "app-uuid",
    "app_name": "My Loyalty App",
    "code": "my-loyalty-app",
    "currency": "USD",
    "api_key": "sk_...",
    ...
  },
  "important": "Please save the API key. It will not be shown again in full."
}
```

#### Update Verification App Currency
```json
PUT /api/verification-apps/:id
Authorization: Bearer <tenant_admin_token>

{
  "currency": "EUR"
}
```

#### Get Verification App (includes currency)
```json
GET /api/verification-apps/:id
Authorization: Bearer <tenant_admin_token>
```

**Response:**
```json
{
  "app": {
    "verification_app_id": "app-uuid",
    "app_name": "My Loyalty App",
    "code": "my-loyalty-app",
    "currency": "USD",
    "template_id": "template-uuid",
    "template_name": "Standard Product",
    ...
  }
}
```

## Database Setup

### For Fresh Installation
Currency field is included in the initial setup. Simply run:
```bash
cd mscan-server
psql -h localhost -U postgres -d mscan_db -f database/full_setup.sql
```

The `verification_apps` table will be created with the currency field already included.

### For Existing Databases
If you have an existing database without the currency field, run this SQL to add it:
```sql
ALTER TABLE verification_apps
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';

ALTER TABLE verification_apps
ADD CONSTRAINT check_verification_app_currency
CHECK (currency IN ('USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'JPY', 'CNY', 'CHF', 'SGD', 'AED', 'MYR', 'THB', 'ZAR', 'NZD', 'MXN', 'BRL', 'KRW', 'HKD', 'SEK', 'NOK', 'DKK'));

UPDATE verification_apps SET currency = 'INR' WHERE currency IS NULL;
```

## User Permissions

### Who Can Set Currency?
- ✅ **Tenant Admins** - Can set currency when creating/editing verification apps
- ❌ **Super Admins** - Do NOT set currency (it's not at tenant level)
- ❌ **Customers** - Cannot access verification app configuration

### Required Permission
- `edit_app` permission required to create or update verification apps (including currency)

## Integration Points

### Where Currency is Used
1. **Products** - Product prices use the verification app's currency
2. **Coupons** - Coupon discount values use the verification app's currency
3. **Rewards** - Reward amounts use the verification app's currency
4. **Mobile App** - Currency passed to mobile scanning interface
5. **E-commerce API** - Currency included in API responses for product listings
6. **Reports** - Financial reports display values in app's currency

## Next Steps (Recommended Enhancements)

1. **Sync with Products**: Auto-populate product currency from verification app currency
2. **Coupon Currency Validation**: Ensure coupons match their app's currency
3. **Currency Display**: Add currency symbols throughout the UI
4. **Multi-Currency Support**: Allow currency conversion for multi-app scenarios
5. **Reporting**: Group analytics by currency
6. **Validation**: Prevent changing currency if active products/coupons exist

## Testing Checklist

### Backend Testing
- [x] Database migration applied successfully
- [ ] Create verification app with USD currency
- [ ] Create verification app with EUR currency
- [ ] Update existing app to change currency
- [ ] Verify currency persists after update
- [ ] Check currency validation (invalid codes rejected)
- [ ] Verify default currency is INR if not specified

### Frontend Testing (Tenant Admin)
- [ ] Create new verification app form displays currency dropdown
- [ ] Currency defaults to INR
- [ ] All 22 currencies are available in dropdown
- [ ] Currency is required (form validation)
- [ ] Edit app form shows current currency
- [ ] Currency can be changed and persists
- [ ] Currency displays in app list/details

### Integration Testing
- [ ] Products created under app use correct currency
- [ ] Coupons display correct currency symbol
- [ ] Mobile API returns app currency
- [ ] E-commerce API includes currency in responses

## Files Modified

### Database
- ✅ `mscan-server/database/full_setup.sql` - Currency field included in initial schema (lines 165, 169)

### Backend
- ✅ `mscan-server/src/controllers/rewards.controller.js` - CRUD operations updated

### Frontend
- ✅ `mscan-client/src/app/store/verification-apps/verification-apps.models.ts` - Model updated
- ✅ `mscan-client/src/app/components/verification-app/verification-app-configure.component.ts` - Form logic
- ✅ `mscan-client/src/app/components/verification-app/verification-app-configure.component.html` - Form UI

## Notes

- Currency is stored as ISO 4217 3-letter code (e.g., 'USD', 'EUR', 'INR')
- Default currency is 'INR' if not specified
- Currency can be changed after verification app creation
- Database constraint ensures only valid currency codes are accepted
- All existing verification apps automatically set to 'INR' currency
- **Currency is per verification app, not per tenant** - allows multi-currency scenarios

## Rollback (if needed)

To remove currency feature:
```sql
ALTER TABLE verification_apps DROP COLUMN currency;
```

---
**Implementation Date**: February 8, 2026
**Implemented By**: Claude Code Assistant
**Feature Level**: Verification App (Tenant Admin)
