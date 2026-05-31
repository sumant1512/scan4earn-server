# Tenant Provisioning & Onboarding Guide

> **For:** Super Admins managing multi-tenant Scan4Earn platform

This document explains the automated tenant provisioning system that handles onboarding of new enterprise customers.

---

## Overview

When you create a new tenant (e.g., Reliance Industries), the provisioning system automatically:

1. ✅ Creates admin user account
2. ✅ Generates temporary password & sends credentials email
3. ✅ Creates default verification app
4. ✅ Generates sandbox API keys for testing
5. ✅ Seeds sandbox environment with demo products/coupons
6. ✅ Sends comprehensive onboarding email
7. ✅ Tracks each step in audit log

---

## Quick Start

### Step 1: Create Tenant in Database

```sql
INSERT INTO tenants (id, tenant_name, subdomain_slug, email, is_active)
VALUES (
  gen_random_uuid(),
  'Reliance Industries',
  'reliance',
  'admin@reliance.com',
  true
);
```

Or via API:
```bash
curl -X POST https://api.scan4earn.com/api/super-admin/tenants \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name": "Reliance Industries",
    "subdomain_slug": "reliance",
    "email": "admin@reliance.com"
  }'
```

### Step 2: Trigger Provisioning

```bash
curl -X POST https://api.scan4earn.com/api/super-admin/tenants/{tenant_id}/provision \
  -H "Authorization: Bearer {jwt_token}"
```

### Step 3: Check Status

```bash
curl -X GET https://api.scan4earn.com/api/super-admin/tenants/{tenant_id}/provisioning-status \
  -H "Authorization: Bearer {jwt_token}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": "uuid-123",
    "tenantName": "Reliance Industries",
    "status": "completed",
    "startedAt": "2026-05-31T10:00:00Z",
    "completedAt": "2026-05-31T10:05:00Z",
    "steps": [
      {
        "step": "admin_user_created",
        "status": "success",
        "created_at": "2026-05-31T10:00:30Z"
      },
      {
        "step": "verification_app_created",
        "status": "success",
        "created_at": "2026-05-31T10:01:00Z"
      },
      {
        "step": "sandbox_keys_generated",
        "status": "success",
        "created_at": "2026-05-31T10:01:30Z"
      },
      {
        "step": "sandbox_data_seeded",
        "status": "success",
        "created_at": "2026-05-31T10:02:00Z"
      },
      {
        "step": "onboarding_email_sent",
        "status": "success",
        "created_at": "2026-05-31T10:02:30Z"
      }
    ]
  }
}
```

---

## Provisioning Steps Explained

### Step 1: Admin User Created

**What happens:**
- New user account created for tenant admin
- Role: `TENANT_ADMIN`
- Temporary password generated (12 characters, mixed case + numbers + special chars)
- Password not set to allow first-login flow

**Database:**
```sql
INSERT INTO users (
  id, tenant_id, email, password_hash,
  role, is_active
)
```

**User receives:**
- Temporary password in onboarding email
- Must change password on first login

---

### Step 2: Default Verification App Created

**What happens:**
- Creates primary verification app for the tenant
- This app is where the tenant's businesses are created
- Named "Primary App" by default (configurable)
- Status: Active and ready to use

**Example:**
- Tenant: Reliance Industries
- Verification App: Primary App
- Sub-apps: Reliance Retail, Reliance Fresh, Reliance Digital

**Database:**
```sql
INSERT INTO verification_apps (
  id, tenant_id, app_name, code,
  is_active
)
```

---

### Step 3: Sandbox API Keys Generated

**What happens:**
- Two API keys created for the verification app:
  - **Mobile API Key** (for mobile app integration)
  - **Ecommerce API Key** (for e-commerce integration)
- Keys set to expire in 90 days
- Rate limits configured:
  - Mobile: 60 requests/minute
  - Ecommerce: 120 requests/minute

**Sandbox vs Production:**
```
Sandbox:  For testing during development
  └─ No rate limits
  └─ Auto-resets every 24 hours
  └─ Demo data included

Production:  For live customer traffic
  └─ Rate limits enforced
  └─ Real data only
  └─ Full SLA guarantees
```

**Keys are returned in:**
- Onboarding email
- Admin dashboard (Settings → API Keys)

---

### Step 4: Sandbox Data Seeded

**What happens:**
- Demo product template created
- Demo product created ("Demo Product - Test Item")
- Demo coupon batch created with 3 test coupons:
  - `SANDBOX-TEST-001`
  - `SANDBOX-TEST-002`
  - `SANDBOX-TEST-003`

**Purpose:**
- Let tenant admins test immediately
- No need to create products first
- Can scan & redeem test coupons

**Example Usage:**
```javascript
// Test QR scanning
const coupon = await client.coupons.scan({
  couponCode: 'SANDBOX-TEST-001'
});

// Test redemption
const result = await client.coupons.redeem({
  couponCode: 'SANDBOX-TEST-001',
  customerPhone: '+919876543210'
});
```

**Cleanup:**
- Test data auto-expires after X days (configurable, default: 7 days)
- Can be manually deleted from admin portal

---

### Step 5: Onboarding Email Sent

**What happens:**
- Email sent to tenant admin with:
  - Login credentials (temporary password)
  - Verification app details
  - Sandbox API keys
  - Links to documentation
  - Next steps guide
  - Support contact information

**Email Contents:**
- Admin portal login URL
- Temporary password (marked for change)
- Primary app name & code
- Mobile API Key (for testing)
- Ecommerce API Key (for testing)
- Key expiry dates
- Step-by-step onboarding checklist
- Links to docs, SDK, starter templates
- Support email, chat, phone

**Example:**
```
From: support@scan4earn.com
To: admin@reliance.com
Subject: 🚀 Welcome to Scan4Earn! Your Account is Ready

Your Scan4Earn account has been successfully created!

Login: https://admin.scan4earn.com/login
Email: admin@reliance.com
Password: Tmp@Pass123

API Keys (for testing):
Mobile Key: mobile_xxxxx
Ecommerce Key: ecommerce_xxxxx

Next Steps:
1. Login to admin portal
2. Change your password
3. Create products
4. Create coupons
5. Test with SDK
6. Go live!

Documentation: https://docs.scan4earn.com
Support: support@scan4earn.com
```

---

## Configuration

### Provisioning Settings

Control what happens during provisioning:

```bash
curl -X GET https://api.scan4earn.com/api/super-admin/provisioning-settings \
  -H "Authorization: Bearer {jwt_token}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "auto_create_admin_user": {
      "value": "true",
      "description": "Automatically create admin user"
    },
    "auto_create_verification_app": {
      "value": "true",
      "description": "Automatically create default verification app"
    },
    "auto_generate_sandbox_keys": {
      "value": "true",
      "description": "Generate sandbox API keys"
    },
    "send_onboarding_email": {
      "value": "true",
      "description": "Send onboarding email to admin"
    },
    "seed_sandbox_data": {
      "value": "true",
      "description": "Seed sandbox with demo products/coupons"
    },
    "default_verification_app_name": {
      "value": "Primary App",
      "description": "Name of default verification app"
    },
    "sandbox_data_retention_days": {
      "value": "7",
      "description": "Delete test data after X days"
    }
  }
}
```

### Update Settings

```bash
curl -X PUT https://api.scan4earn.com/api/super-admin/provisioning-settings \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "auto_create_admin_user": "true",
      "send_onboarding_email": "false",
      "sandbox_data_retention_days": "14"
    }
  }'
```

---

## Provisioning Lifecycle

### Status Flow

```
PENDING → IN_PROGRESS → COMPLETED
         ↘ (error)    ↗
           FAILED
```

### Tracking Status

Each step is tracked with:
- Step name (e.g., `admin_user_created`)
- Status (`success`, `failed`, `skipped`)
- Timestamp
- Error message (if failed)

### Audit Trail

View complete provisioning history:

```sql
SELECT * FROM tenant_provisioning_logs
WHERE tenant_id = 'tenant-uuid'
ORDER BY created_at ASC;
```

**Output:**
```
id     | tenant_id | step                    | status  | message | created_at
-------|-----------|------------------------|---------|---------|-------------------
uuid1  | tenant123 | admin_user_created      | success | null    | 2026-05-31 10:00:30
uuid2  | tenant123 | verification_app_created| success | null    | 2026-05-31 10:01:00
uuid3  | tenant123 | sandbox_keys_generated  | success | null    | 2026-05-31 10:01:30
uuid4  | tenant123 | sandbox_data_seeded     | success | null    | 2026-05-31 10:02:00
uuid5  | tenant123 | onboarding_email_sent   | success | null    | 2026-05-31 10:02:30
```

---

## Error Handling

### If Provisioning Fails

**What to check:**

1. **Admin user creation failed**
   - Check email is valid
   - Check tenant_id is correct
   - Verify database connection

2. **Verification app creation failed**
   - Check tenant exists
   - Check app name is unique
   - Verify table permissions

3. **Email sending failed**
   - Check email service is configured
   - Verify email address is valid
   - Check mail queue

**Recovery:**

```bash
# Retry provisioning
curl -X POST https://api.scan4earn.com/api/super-admin/tenants/{id}/retry-provision \
  -H "Authorization: Bearer {jwt_token}"
```

**Manual Steps:**

If automatic provisioning fails, manually execute these steps:

```sql
-- 1. Create admin user
INSERT INTO users (id, tenant_id, email, password_hash, role, is_active)
VALUES (uuid1, tenant_id, 'admin@company.com', hash('temp'), 'TENANT_ADMIN', true);

-- 2. Create verification app
INSERT INTO verification_apps (id, tenant_id, app_name, code, is_active)
VALUES (uuid2, tenant_id, 'Primary App', 'primary', true);

-- 3. Generate keys
UPDATE verification_apps
SET mobile_api_key = hash('key'), ecommerce_api_key = hash('key')
WHERE id = uuid2;
```

---

## Monitoring

### Check Provisioning Queue

```sql
SELECT
  id, tenant_name, provisioning_status,
  provisioning_started_at, provisioning_completed_at,
  EXTRACT(EPOCH FROM (provisioning_completed_at - provisioning_started_at)) as duration_seconds
FROM tenants
WHERE provisioning_status IN ('pending', 'in_progress', 'failed')
ORDER BY provisioning_started_at DESC;
```

### Success Rate

```sql
SELECT
  provisioning_status,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM tenants
WHERE provisioning_started_at IS NOT NULL
GROUP BY provisioning_status;
```

### Average Provisioning Time

```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (provisioning_completed_at - provisioning_started_at)))::int as avg_seconds,
  MIN(EXTRACT(EPOCH FROM (provisioning_completed_at - provisioning_started_at)))::int as min_seconds,
  MAX(EXTRACT(EPOCH FROM (provisioning_completed_at - provisioning_started_at)))::int as max_seconds
FROM tenants
WHERE provisioning_status = 'completed';
```

---

## Best Practices

### For Onboarding Teams

1. **Create tenant first** → Wait a few seconds → Trigger provisioning
2. **Monitor provisioning status** → Check if all steps succeeded
3. **Send follow-up email** if provisioning fails
4. **Verify email was received** → Check spam folder
5. **Walk through first login** → Help admin change password

### For Automations

1. **Don't retry immediately** → Wait 30 seconds between retries
2. **Log all provisioning events** → Build your audit trail
3. **Alert on failures** → Notify ops team
4. **Validate email delivery** → Track bounce rates
5. **Track time-to-value** → When does tenant first scan a coupon?

### For Scaling

1. **Test with 100+ tenants** → Before production
2. **Monitor database load** → Provisioning creates many records
3. **Set email rate limits** → Avoid spam filter
4. **Archive old logs** → Clean up after 90 days
5. **Use async provisioning** → Queue jobs, don't block requests

---

## API Reference

### POST /api/super-admin/tenants/{id}/provision

Trigger provisioning for a tenant.

**Authentication:** JWT token, SUPER_ADMIN role required

**Parameters:**
- `id` (path): Tenant UUID

**Response:**
```json
{
  "success": true,
  "message": "Tenant provisioned successfully",
  "data": {
    "tenantId": "...",
    "adminUser": {
      "id": "...",
      "email": "...",
      "temporaryPassword": "..."
    },
    "verificationApp": {
      "id": "...",
      "name": "...",
      "code": "..."
    },
    "sandboxKeys": {
      "mobileApiKey": "...",
      "ecommerceApiKey": "..."
    }
  }
}
```

---

### GET /api/super-admin/tenants/{id}/provisioning-status

Get provisioning status and history.

**Authentication:** JWT token, SUPER_ADMIN role required

**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": "...",
    "status": "completed",
    "startedAt": "...",
    "completedAt": "...",
    "steps": [ ... ]
  }
}
```

---

### POST /api/super-admin/tenants/{id}/retry-provision

Retry failed provisioning.

**Authentication:** JWT token, SUPER_ADMIN role required

**Conditions:**
- Status must be `failed`

**Response:** Same as `/provision` endpoint

---

### GET /api/super-admin/provisioning-settings

Get provisioning configuration.

**Authentication:** JWT token, SUPER_ADMIN role required

---

### PUT /api/super-admin/provisioning-settings

Update provisioning configuration.

**Authentication:** JWT token, SUPER_ADMIN role required

**Request:**
```json
{
  "settings": {
    "auto_create_admin_user": "true",
    "send_onboarding_email": "false"
  }
}
```

---

## Troubleshooting

### Email not received

1. Check spam folder
2. Verify email address is correct
3. Check email service is configured
4. View email logs: `SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 10;`

### Wrong temporary password

1. Check database: `SELECT password_hash FROM users WHERE id = 'user-id';`
2. Password is hashed, can't be retrieved
3. Admin must use password reset flow

### Keys not generated

1. Check verification app exists
2. Verify database permissions
3. Check API key helper service

### Sandbox data missing

1. Check if seeding was disabled in settings
2. Manually create test coupon: `SANDBOX-TEST-001`
3. Seed from script: `npm run seed:sandbox`

---

## Next Steps

1. **[Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)** — Help customers build apps
2. **[API Reference](./api/openapi.json)** — Full API specification
3. **[SDK Documentation](./sdk/SDK_README.md)** — JavaScript SDK guide
4. **[Security Best Practices](../COMPREHENSIVE_AUDIT.md#section-6)** — Protect tenant data

---

**Last Updated:** 2026-05-31
