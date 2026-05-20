# Credit Management System

## Purpose
Credits are the currency for coupon generation in MScan. Tenants request credits, Super Admins approve/reject requests, and credits are deducted when coupons are generated. 1 credit = 1 coupon.

---

## Requirements

### Requirement: Credit Request Submission
The system SHALL allow TENANT_ADMIN users to request credits with justification.

#### Scenario: Submit credit request
- **WHEN** a TENANT_ADMIN requests 1000 credits with justification "Q1 2024 campaign"
- **THEN** the system SHALL create a credit request with status PENDING
- **AND** record the requested amount, justification, and timestamp
- **AND** the request SHALL appear in Super Admin's approval queue

#### Scenario: Validation of credit request
- **WHEN** a TENANT_ADMIN submits a credit request
- **THEN** the system SHALL validate:
  - Amount is a positive integer
  - Amount does not exceed 100,000 credits per request
  - Justification is provided (min 10 characters)

---

### Requirement: Credit Request Approval
The system SHALL allow SUPER_ADMIN users to approve or reject credit requests.

#### Scenario: Approve credit request
- **WHEN** a SUPER_ADMIN approves a credit request for 1000 credits
- **THEN** the system SHALL:
  - Update request status to APPROVED
  - Add 1000 credits to tenant's credit_balance
  - Create a CREDIT transaction record
  - Send notification email to tenant admin
  - Record approval timestamp and admin ID

#### Scenario: Reject credit request
- **WHEN** a SUPER_ADMIN rejects a credit request with reason "Insufficient business case"
- **THEN** the system SHALL:
  - Update request status to REJECTED
  - Store rejection reason
  - NOT modify tenant's credit balance
  - Send notification email to tenant admin with rejection reason

#### Scenario: View tenant credit history before approval
- **WHEN** a SUPER_ADMIN reviews a pending credit request
- **THEN** the system SHALL display:
  - Current credit balance
  - Previous credit requests (approved/rejected)
  - Recent credit usage (coupon generation history)
  - Tenant activity metrics

---

### Requirement: Credit Deduction on Coupon Generation
The system SHALL automatically deduct credits when coupons are generated.

#### Scenario: Sufficient credits for generation
- **WHEN** a tenant with 500 credits generates 100 coupons
- **THEN** the system SHALL:
  - Validate credit balance (500 >= 100)
  - Generate 100 coupons
  - Deduct 100 credits (new balance: 400)
  - Create a DEBIT transaction record

#### Scenario: Insufficient credits prevention
- **WHEN** a tenant with 50 credits attempts to generate 100 coupons
- **THEN** the system SHALL reject with error "Insufficient credits. You have 50 credits but need 100."
- **AND** NOT generate any coupons
- **AND** suggest requesting additional credits

#### Scenario: Prevent overdraft
- **WHEN** processing credit deduction
- **THEN** the system SHALL use database transaction isolation
- **AND** ensure credit_balance never becomes negative
- **AND** rollback coupon generation if deduction fails

---

### Requirement: Credit Transaction History
The system SHALL maintain a complete audit trail of all credit transactions.

#### Scenario: View transaction history
- **WHEN** a TENANT_ADMIN views their credit transaction history
- **THEN** the system SHALL display:
  - Transaction type (CREDIT, DEBIT, PENDING)
  - Amount (+/- credits)
  - Timestamp
  - Description (e.g., "Generated 100 coupons", "Approved request #123")
  - Running balance after transaction

#### Scenario: Filter transactions by date range
- **WHEN** a user applies date range filter (Jan 1 - Jan 31, 2024)
- **THEN** the system SHALL return only transactions within that range
- **AND** display summary: Total credits added, Total credits used, Net change

---

### Requirement: Credit Balance Display
The system SHALL prominently display current credit balance to TENANT_ADMIN users.

#### Scenario: Dashboard credit balance widget
- **WHEN** a TENANT_ADMIN views their dashboard
- **THEN** the system SHALL display:
  - Current credit balance (large, prominent)
  - Credits used this month
  - Credits remaining for planned campaigns
  - "Request Credits" button if balance is low

#### Scenario: Low credit warning
- **WHEN** a tenant's credit balance drops below 50
- **THEN** the system SHALL display a warning banner
- **AND** suggest requesting additional credits

---

## Database Schema

**Tables:**
- `tenants.credit_balance` (INTEGER) - Current credit balance
- `credit_requests` - Credit request records
  - `id`, `tenant_id`, `amount`, `justification`, `status` (PENDING/APPROVED/REJECTED), `created_at`, `processed_at`, `processed_by`
- `credit_transactions` - Complete transaction history
  - `id`, `tenant_id`, `type` (CREDIT/DEBIT/PENDING), `amount`, `description`, `created_at`, `balance_after`

---

## API Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/credits/request` | Submit credit request | TENANT_ADMIN |
| GET | `/api/credits/pending` | List pending requests | SUPER_ADMIN |
| POST | `/api/credits/approve/:id` | Approve request | SUPER_ADMIN |
| POST | `/api/credits/reject/:id` | Reject request | SUPER_ADMIN |
| GET | `/api/credits/transactions` | View transaction history | TENANT_ADMIN, SUPER_ADMIN |
| GET | `/api/credits/balance` | Get current balance | TENANT_ADMIN |

---

## UI Components

- `CreditRequestFormComponent` - Submit credit requests (TENANT_ADMIN)
- `CreditApprovalListComponent` - Approve/reject requests (SUPER_ADMIN)
- `CreditTransactionHistoryComponent` - View transaction history
- `CreditDashboardComponent` - Credit balance widget

---

## Business Rules

1. **Exchange Rate**: 1 credit = 1 coupon (fixed)
2. **Minimum Request**: 10 credits
3. **Maximum Request**: 100,000 credits per request
4. **Initial Balance**: New tenants receive 100 credits
5. **Negative Balance**: NEVER allowed (enforced by database constraints)
6. **Pending Requests**: Tenants can have max 5 pending requests at a time
