# Scanning System

## Purpose
Three distinct coupon scanning APIs: External App API (third-party apps with API keys), Mobile Scan API (MScan mobile apps with JWT), and Public Scan API (web-based anonymous scanning with OTP).

---

## Requirements

### Requirement: External App API for Third-Party Integration
The system SHALL provide a RESTful API for third-party apps to record coupon scans using API key authentication.

#### Scenario: Record scan via External App API
- **WHEN** an external app sends POST `/app/:appCode/scans` with API key and coupon code
- **THEN** the system SHALL:
  - Authenticate via API key
  - Validate coupon exists and is ACTIVE
  - Validate coupon not expired
  - Validate coupon not already USED
  - Award points/credits to user
  - Update coupon status to USED
  - Record scan in scan_history with app_id
  - Return success with coupon details

#### Scenario: External app retrieves user credits
- **WHEN** an external app requests GET `/app/:appCode/users/:userId/credits`
- **THEN** the system SHALL return user's current credit balance
- **AND** recent credit transactions

---

### Requirement: Mobile Scan API for MScan Mobile Apps
The system SHALL provide a mobile-optimized API for MScan's official mobile applications using JWT authentication.

#### Scenario: Scan coupon via Mobile API
- **WHEN** a mobile app user scans a coupon QR code
- **THEN** the mobile app SHALL send POST `/api/mobile/v1/scan` with JWT token
- **AND** the system SHALL:
  - Authenticate via JWT
  - Extract user_id and tenant_id from token
  - Validate and process scan
  - Track location and device info (if provided)
  - Return scan result with points awarded

#### Scenario: View scan history on mobile
- **WHEN** a mobile user requests GET `/api/mobile/v1/scan/history`
- **THEN** the system SHALL return user's scan history
- **AND** include: coupon code, product name, points, timestamp, status
- **AND** paginate results (default 20 per page)

#### Scenario: View scan statistics
- **WHEN** a mobile user requests GET `/api/mobile/v1/scan/stats/summary`
- **THEN** the system SHALL return:
  - Total scans
  - Total points earned
  - Scans this month
  - Favorite products (most scanned)

---

### Requirement: Public Scan API for Anonymous Web Scanning
The system SHALL provide a public web API for anonymous coupon scanning with OTP verification.

#### Scenario: Three-step public scan flow
- **STEP 1 - Start Session:**
  - **WHEN** user scans QR code on public web page
  - **THEN** POST `/api/public-scan/start` with coupon code
  - **THEN** the system SHALL create a scan session with unique session_id
  - **AND** return session_id and coupon details (for display)

- **STEP 2 - Send OTP:**
  - **WHEN** user submits mobile number
  - **THEN** POST `/api/public-scan/:sessionId/mobile` with mobile number
  - **THEN** the system SHALL generate 6-digit OTP
  - **AND** send OTP via SMS (or email if configured)
  - **AND** OTP valid for 5 minutes

- **STEP 3 - Verify OTP and Complete Scan:**
  - **WHEN** user submits OTP
  - **THEN** POST `/api/public-scan/:sessionId/verify-otp` with OTP
  - **THEN** the system SHALL validate OTP
  - **AND** process coupon scan
  - **AND** award points to user (create user if needed)
  - **AND** mark session as completed
  - **AND** return success with points awarded

#### Scenario: Public scan session timeout
- **WHEN** a public scan session is inactive for 10 minutes
- **THEN** the system SHALL expire the session
- **AND** reject further OTP submissions with error "Session expired"

---

### Requirement: Scan Validation Rules
The system SHALL enforce validation rules before processing any scan.

#### Scenario: Comprehensive scan validation
- **WHEN** processing a scan request
- **THEN** the system SHALL validate:
  1. Coupon exists in database
  2. Coupon status is ACTIVE
  3. Coupon not expired (check expiry_date)
  4. Coupon not already USED
  5. Coupon belongs to correct verification app (if app-scoped)
  6. Scan cooldown period respected (if configured)
  7. User hasn't exceeded daily scan limit (if configured)
- **AND** reject with specific error message if any validation fails

#### Scenario: Duplicate scan prevention
- **WHEN** attempting to scan the same coupon twice
- **THEN** the system SHALL reject with error "Coupon already used"
- **AND** return timestamp of previous scan

#### Scenario: Scan cooldown enforcement
- **WHEN** app configuration has `scan_cooldown_seconds: 60`
- **AND** user scanned a coupon 30 seconds ago
- **THEN** the system SHALL reject with error "Please wait 30 seconds before next scan"

---

### Requirement: Points and Credits Award on Scan
The system SHALL award points or credits to users upon successful coupon scan.

#### Scenario: Award points on successful scan
- **WHEN** a user successfully scans a coupon worth 100 points
- **THEN** the system SHALL:
  - Add 100 to user's points balance
  - Create credit transaction record (type: CREDIT, amount: 100)
  - Return new balance in response

#### Scenario: Points calculation from coupon
- **WHEN** coupon has `discount_type: "PERCENTAGE"` and `discount_value: 20`
- **THEN** the system SHALL calculate points based on business rules
- **OR** use predefined `coupon_points` field

---

### Requirement: Scan History Tracking
The system SHALL maintain comprehensive scan history for analytics and auditing.

#### Scenario: Record scan event
- **WHEN** a coupon is scanned
- **THEN** the system SHALL create scan_history record with:
  - coupon_id, user_id, app_id, tenant_id
  - scan_timestamp
  - location (lat/lon if provided)
  - device_info (if provided)
  - points_awarded
  - scan_status (SUCCESS or reason for failure)

#### Scenario: Query scan history with filters
- **WHEN** a TENANT_ADMIN views scan history
- **THEN** the system SHALL support filters:
  - Date range
  - Product
  - Verification app
  - User
  - Status (success/failed)
- **AND** return paginated results with sorting

---

## Database Schema

**Tables:**
- `scan_history` - All scan records
  - `id`, `tenant_id`, `coupon_id`, `user_id`, `app_id`, `scan_timestamp`, `location` (JSONB), `device_info` (JSONB), `points_awarded`, `status`
- `public_scan_sessions` - Public scan sessions
  - `id`, `session_id` (UUID), `coupon_id`, `mobile_number`, `status`, `created_at`, `expires_at`
- `otps` - OTP codes for public scans
  - `id`, `session_id`, `code`, `expires_at`, `is_used`

---

## API Endpoints

### External App API
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/app/:appCode/scans` | API Key | Record scan |
| GET | `/app/:appCode/products` | API Key | Get products |
| GET | `/app/:appCode/users/:userId/credits` | API Key | Get user credits |

### Mobile Scan API
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mobile/v1/scan` | JWT | Scan coupon |
| GET | `/api/mobile/v1/scan/history` | JWT | Scan history |
| GET | `/api/mobile/v1/scan/:id` | JWT | Scan details |
| GET | `/api/mobile/v1/scan/stats/summary` | JWT | Scan statistics |

### Public Scan API
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/public-scan/start` | None | Start session |
| POST | `/api/public-scan/:sessionId/mobile` | None | Send OTP |
| POST | `/api/public-scan/:sessionId/verify-otp` | None | Verify OTP & scan |

---

## UI Components

- `ScanHistoryComponent` - View scan history with filters
- Public scan landing page (standalone HTML with QR scanner)

---

## Rate Limiting

**External App API:**
- 1000 requests/hour per API key
- 100 requests/minute burst

**Public Scan API:**
- 120 requests/minute per IP
- 60 session starts per coupon per 10 minutes
- 10 OTP sends per mobile per 24 hours
- 20 OTP verifications per session per 10 minutes

---

## Security Considerations

1. **API Key Protection**: External apps MUST use HTTPS for all requests
2. **OTP Security**: Public scan OTPs MUST expire after 5 minutes
3. **Session Expiry**: Public scan sessions MUST expire after 10 minutes
4. **Duplicate Prevention**: Enforce coupon single-use constraint
5. **Rate Limiting**: Protect against abuse with strict rate limits
