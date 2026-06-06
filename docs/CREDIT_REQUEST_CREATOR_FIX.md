# Credit Request Creator Name Fix

## Date: 2026-02-13

## 🐛 Problem Identified

In credit request responses (pending, approved, rejected), the `created_by_name` field was showing the **Super Admin** who approved/rejected the request instead of the **Tenant Admin** who originally requested the credits.

### Root Causes:

1. **In Approved Requests:** When creating the credit transaction, `created_by` was set to `approvedBy` (super admin) instead of `request.requested_by` (tenant admin who requested)

2. **In Rejected Requests:** The transaction history query joined with `processed_by` instead of `requested_by`, showing the rejector instead of the requester

3. **Missing Fields:** Transaction responses didn't include both requester AND processor information

---

## ✅ Solution Implemented

### **Fix 1: Approved Credit Transactions**

**File:** `mscan-server/src/controllers/credit.controller.js` (Line 179-194)

**Before:**
```javascript
await client.query(
  `INSERT INTO credit_transactions ... created_by)
   VALUES ($1, 'CREDIT', $2, $3, $4, $5, 'CREDIT_APPROVAL', $6, $7)`,
  [
    request.tenant_id,
    request.requested_amount,
    currentBalance,
    newBalance,
    id,
    `Credit approval for request #${id}`,
    approvedBy,  // ❌ WRONG - This is the super admin who approved
  ],
);
```

**After:**
```javascript
await client.query(
  `INSERT INTO credit_transactions ... created_by)
   VALUES ($1, 'CREDIT', $2, $3, $4, $5, 'CREDIT_APPROVAL', $6, $7)`,
  [
    request.tenant_id,
    request.requested_amount,
    currentBalance,
    newBalance,
    id,
    `Credit approval for request #${id}`,
    request.requested_by,  // ✅ CORRECT - Tenant admin who requested
  ],
);
```

**Impact:** Now approved credit transactions show the requester's name in `created_by_name`

---

### **Fix 2: Rejected Credit Requests in Transaction History**

**File:** `mscan-server/src/services/credit.service.js` (Line 175-197)

**Before:**
```javascript
let rejectedQuery = `
  SELECT
    cr.id,
    ...
    cr.processed_by as created_by,  // ❌ WRONG
    t.tenant_name,
    u.full_name as created_by_name,  // ❌ Shows rejector
    cr.justification,
    cr.rejection_reason
  FROM credit_requests cr
  JOIN tenants t ON cr.tenant_id = t.id
  LEFT JOIN users u ON cr.processed_by = u.id  // ❌ Joins with processor
  WHERE cr.status = 'rejected'
`;
```

**After:**
```javascript
let rejectedQuery = `
  SELECT
    cr.id,
    ...
    cr.requested_by as created_by,  // ✅ CORRECT
    t.tenant_name,
    u_req.full_name as created_by_name,  // ✅ Shows requester
    u_req.email as created_by_email,
    u_proc.full_name as processed_by_name,  // ✅ Also shows who rejected
    cr.justification,
    cr.rejection_reason
  FROM credit_requests cr
  JOIN tenants t ON cr.tenant_id = t.id
  LEFT JOIN users u_req ON cr.requested_by = u_req.id  // ✅ Requester
  LEFT JOIN users u_proc ON cr.processed_by = u_proc.id  // ✅ Processor
  WHERE cr.status = 'rejected'
`;
```

**Impact:** Rejected requests now show BOTH requester and rejector names

---

### **Fix 3: Enhanced Regular Transactions to Show Approver**

**File:** `mscan-server/src/services/credit.service.js` (Line 149-173)

**Before:**
```javascript
let transactionsQuery = `
  SELECT DISTINCT
    ...
    ct.created_by,
    t.tenant_name,
    u.full_name as created_by_name,  // Only requester
    NULL as justification,
    NULL as rejection_reason
  FROM credit_transactions ct
  JOIN tenants t ON ct.tenant_id = t.id
  LEFT JOIN users u ON ct.created_by = u.id
  WHERE 1=1
`;
```

**After:**
```javascript
let transactionsQuery = `
  SELECT DISTINCT
    ...
    ct.created_by,
    t.tenant_name,
    u.full_name as created_by_name,  // ✅ Requester
    u.email as created_by_email,
    u_proc.full_name as processed_by_name,  // ✅ Approver
    NULL as justification,
    NULL as rejection_reason
  FROM credit_transactions ct
  JOIN tenants t ON ct.tenant_id = t.id
  LEFT JOIN users u ON ct.created_by = u.id
  LEFT JOIN credit_requests cr_ref ON ct.reference_id = cr_ref.id
    AND ct.reference_type = 'CREDIT_APPROVAL'
  LEFT JOIN users u_proc ON cr_ref.processed_by = u_proc.id
  WHERE 1=1
`;
```

**Impact:** Approved transactions now show BOTH requester and approver names

---

### **Fix 4: Updated Frontend TypeScript Interfaces**

**File:** `mscan-client/src/app/models/rewards.model.ts`

#### Enhanced CreditRequest Interface:
```typescript
export interface CreditRequest {
  id: number;
  tenant_id: string;
  requested_by?: number; // ✅ User ID who requested
  requested_by_name?: string; // ✅ Name of tenant admin who requested
  requested_by_email?: string; // ✅ Email of requester
  requested_amount: number;
  justification?: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  processed_at?: string;
  processed_by?: number; // ✅ User ID who approved/rejected
  processed_by_name?: string; // ✅ Name of super admin who approved/rejected
  rejection_reason?: string;
  tenant_name?: string;
  contact_email?: string;
  created_at?: string;
  updated_at?: string;
}
```

#### Enhanced CreditTransaction Interface:
```typescript
export interface CreditTransaction {
  id: number;
  tenant_id: string;
  transaction_type: 'CREDIT' | 'DEBIT' | 'REJECTED' | 'REFUND'; // ✅ Added types
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_id?: number;
  reference_type?: string;
  description?: string;
  created_at: string;
  created_by?: number;
  created_by_name?: string; // ✅ Name of person who requested
  created_by_email?: string; // ✅ Email of requester
  processed_by_name?: string; // ✅ Name of super admin who approved/rejected
  justification?: string; // ✅ For rejected requests
  rejection_reason?: string; // ✅ For rejected requests
  tenant_name?: string;
}
```

---

## 📊 API Response Examples

### **Credit Request (Pending)**

```json
{
  "id": "abc123",
  "tenant_id": "tenant-uuid",
  "requested_by": "tenant-admin-uuid",
  "requested_by_name": "John Doe", // ✅ Tenant admin who requested
  "requested_by_email": "john@company.com",
  "requested_amount": 5000,
  "status": "pending",
  "justification": "Need credits for new campaign",
  "requested_at": "2026-02-13T10:00:00Z"
}
```

### **Credit Request (Approved)**

```json
{
  "id": "abc123",
  "tenant_id": "tenant-uuid",
  "requested_by": "tenant-admin-uuid",
  "requested_by_name": "John Doe", // ✅ Tenant admin who requested
  "requested_by_email": "john@company.com",
  "requested_amount": 5000,
  "status": "approved",
  "processed_by": "super-admin-uuid",
  "processed_by_name": "Super Admin Sarah", // ✅ Super admin who approved
  "processed_at": "2026-02-13T11:00:00Z"
}
```

### **Credit Request (Rejected)**

```json
{
  "id": "abc123",
  "tenant_id": "tenant-uuid",
  "requested_by": "tenant-admin-uuid",
  "requested_by_name": "John Doe", // ✅ Tenant admin who requested
  "requested_by_email": "john@company.com",
  "requested_amount": 5000,
  "status": "rejected",
  "processed_by": "super-admin-uuid",
  "processed_by_name": "Super Admin Sarah", // ✅ Super admin who rejected
  "rejection_reason": "Insufficient business justification",
  "processed_at": "2026-02-13T11:00:00Z"
}
```

### **Credit Transaction (Approved Credit)**

```json
{
  "id": "trans123",
  "transaction_type": "CREDIT",
  "amount": 5000,
  "created_by": "tenant-admin-uuid",
  "created_by_name": "John Doe", // ✅ Tenant admin who requested
  "created_by_email": "john@company.com",
  "processed_by_name": "Super Admin Sarah", // ✅ Super admin who approved
  "reference_type": "CREDIT_APPROVAL",
  "description": "Credit approval for request #abc123",
  "created_at": "2026-02-13T11:00:00Z"
}
```

### **Credit Transaction (Rejected - in history)**

```json
{
  "id": "reject123",
  "transaction_type": "REJECTED",
  "amount": 5000,
  "created_by": "tenant-admin-uuid",
  "created_by_name": "John Doe", // ✅ Tenant admin who requested
  "created_by_email": "john@company.com",
  "processed_by_name": "Super Admin Sarah", // ✅ Super admin who rejected
  "justification": "Need credits for new campaign",
  "rejection_reason": "Insufficient business justification",
  "created_at": "2026-02-13T11:00:00Z"
}
```

---

## 🎯 Summary of Changes

| Issue | Before | After |
|-------|--------|-------|
| **Approved Credit Transaction** | `created_by` = approver (super admin) ❌ | `created_by` = requester (tenant admin) ✅ |
| **Rejected Transaction History** | Only shows rejector name ❌ | Shows both requester AND rejector ✅ |
| **Approved Transaction History** | Only shows requester name | Shows both requester AND approver ✅ |
| **TypeScript Interfaces** | Missing fields | Complete with all fields ✅ |

---

## ✅ Verification Checklist

- [x] Approved credit transactions show requester's name
- [x] Rejected credit requests show requester's name
- [x] API responses include `processed_by_name` for approved requests
- [x] API responses include `processed_by_name` for rejected requests
- [x] Frontend interfaces updated with all fields
- [x] Transaction type includes 'REJECTED' and 'REFUND'
- [x] Both requester and processor information available in responses

---

## 🔐 Data Integrity

### Database Schema (No changes needed):
The `credit_requests` table already has the correct structure:
```sql
CREATE TABLE credit_requests (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  requested_by UUID REFERENCES users(id),  -- ✅ The requester
  requested_amount INTEGER,
  status VARCHAR(20),
  justification TEXT,
  processed_by UUID REFERENCES users(id),  -- ✅ The approver/rejector
  processed_at TIMESTAMP,
  rejection_reason TEXT,
  requested_at TIMESTAMP
);
```

The issue was **only in the application logic**, not the database schema.

---

## 📝 Files Modified

| File | Purpose | Lines Changed |
|------|---------|---------------|
| `mscan-server/src/controllers/credit.controller.js` | Fix approved transaction creator | ~5 lines |
| `mscan-server/src/services/credit.service.js` | Fix rejected query + enhance transactions | ~20 lines |
| `mscan-client/src/app/models/rewards.model.ts` | Update TypeScript interfaces | ~15 lines |
| **TOTAL** | **3 files** | **~40 lines** |

---

## 🚀 Testing Recommendations

1. **Create a credit request** (as tenant admin)
   - Verify `requested_by_name` shows tenant admin's name

2. **View pending requests** (as super admin)
   - Verify requester name is shown correctly

3. **Approve a request** (as super admin)
   - Check transaction history shows:
     - `created_by_name`: Tenant admin (requester)
     - `processed_by_name`: Super admin (approver)

4. **Reject a request** (as super admin)
   - Check transaction history shows:
     - `created_by_name`: Tenant admin (requester)
     - `processed_by_name`: Super admin (rejector)

5. **View credit requests list**
   - Pending: Shows requester name
   - Approved: Shows both requester and approver names
   - Rejected: Shows both requester and rejector names

---

## 💡 Key Concepts

### created_by vs processed_by

For **Credit Requests**:
- `requested_by` = The tenant admin who requested credits
- `processed_by` = The super admin who approved or rejected

For **Credit Transactions**:
- `created_by` = The person who initiated the transaction (requester for credit approvals)
- `processed_by` = Not a direct field, but retrieved via JOIN from credit_requests

### Why this matters:

1. **Audit Trail:** Know who requested AND who approved/rejected
2. **Accountability:** Track tenant admin spending requests
3. **Reporting:** Analyze which admins request most credits
4. **Transparency:** Both parties visible in transaction history

---

## ✨ Final Result

Now all credit request responses (pending, approved, rejected) correctly show:

✅ **Requester Information:**
- `requested_by_name`: Name of tenant admin who requested
- `requested_by_email`: Email of requester

✅ **Processor Information (when applicable):**
- `processed_by_name`: Name of super admin who approved/rejected

✅ **Complete Audit Trail:**
- Who requested → Tenant Admin
- Who approved/rejected → Super Admin
- When it happened → Timestamps
- Why (if rejected) → Rejection reason

**Status:** ✅ Complete and ready for testing
