# External APIs

## Purpose
Three distinct external API systems for different integration scenarios: External App API (third-party apps with API keys), Mobile Scan API (authenticated mobile apps with JWT), and Public Scan API (anonymous web scanning with OTP).

---

## Requirements

### Requirement: External App API with API Key Authentication
The system SHALL provide a RESTful JSON API for third-party applications using API key authentication.

#### Scenario: Authenticate with API key
- **WHEN** an external app sends request with header `Authorization: Bearer <api_key>`
- **THEN** the system SHALL:
  - Hash the API key
  - Lookup verification app by hashed key
  - Validate app is active
  - Inject app and tenant context into request
  - Proceed with request processing

#### Scenario: Get products list
- **WHEN** external app requests GET `/api/app/:appCode/products`
- **THEN** the system SHALL return:
  - Products associated with that verification app
  - Product details (name, attributes, variants)
  - Paginated response

#### Scenario: Get user credit balance
- **WHEN** external app requests GET `/api/app/:appCode/users/:userId/credits`
- **THEN** the system SHALL return:
  - User's current credit/points balance
  - Last updated timestamp

#### Scenario: Get user credit transactions
- **WHEN** external app requests GET `/api/app/:appCode/users/:userId/credit-transactions`
- **THEN** the system SHALL return:
  - Paginated list of credit transactions
  - Type (CREDIT/DEBIT), amount, timestamp, description

#### Scenario: Record coupon scan
- **WHEN** external app sends POST `/api/app/:appCode/scans` with coupon code and user ID
- **THEN** the system SHALL:
  - Validate coupon
  - Process scan
  - Award points to user
  - Return scan result with points awarded

#### Scenario: Redeem product
- **WHEN** external app sends POST `/api/app/:appCode/redeem` with product and user details
- **THEN** the system SHALL:
  - Validate user has sufficient credits
  - Deduct credits
  - Create redemption record
  - Return success with new balance

---

### Requirement: Mobile Scan API with JWT Authentication
The system SHALL provide a mobile-optimized API for MScan mobile applications using JWT token authentication.

#### Scenario: Authenticate mobile user
- **WHEN** mobile app sends request with JWT token in Authorization header
- **THEN** the system SHALL:
  - Verify JWT signature
  - Extract user claims (userId, tenantId, permissions)
  - Validate token not expired
  - Proceed with request

#### Scenario: Scan coupon via mobile
- **WHEN** mobile app sends POST `/api/mobile/v1/scan/` with coupon code
- **THEN** the system SHALL:
  - Validate and process scan (same logic as External App API)
  - Track device and location info (if provided)
  - Return scan result

#### Scenario: View scan history
- **WHEN** mobile user requests GET `/api/mobile/v1/scan/history`
- **THEN** the system SHALL return:
  - User's scan history
  - Include: coupon code, product name, points, timestamp
  - Paginated results (default 20 per page)

#### Scenario: Get scan details
- **WHEN** mobile user requests GET `/api/mobile/v1/scan/:id`
- **THEN** the system SHALL return:
  - Detailed scan information
  - Product details
  - Points awarded
  - Timestamp and location (if available)

#### Scenario: Get scan statistics summary
- **WHEN** mobile user requests GET `/api/mobile/v1/scan/stats/summary`
- **THEN** the system SHALL return:
  - Total scans count
  - Total points earned
  - Scans this month
  - Favorite products (most scanned)

---

### Requirement: Public Scan API for Anonymous Web Scanning
The system SHALL provide a session-based API for public web scanning without authentication.

#### Scenario: Start public scan session
- **WHEN** public user accesses coupon landing page and sends POST `/api/public-scan/start` with coupon code
- **THEN** the system SHALL:
  - Validate coupon exists
  - Create scan session with unique session_id
  - Return session_id and coupon details (for display)
  - Session expires in 10 minutes

#### Scenario: Submit mobile number for OTP
- **WHEN** user sends POST `/api/public-scan/:sessionId/mobile` with mobile number
- **THEN** the system SHALL:
  - Validate session exists and not expired
  - Generate 6-digit OTP
  - Send OTP via SMS (or email)
  - OTP valid for 5 minutes
  - Return success message

#### Scenario: Verify OTP and complete scan
- **WHEN** user sends POST `/api/public-scan/:sessionId/verify-otp` with OTP code
- **THEN** the system SHALL:
  - Validate OTP matches and not expired
  - Process coupon scan
  - Create or lookup user by mobile number
  - Award points to user
  - Mark session as completed
  - Return success with points awarded

#### Scenario: Session expiry handling
- **WHEN** attempting to use an expired session (> 10 minutes old)
- **THEN** the system SHALL reject with error "Session expired. Please start again."

---

### Requirement: RESTful JSON API Standards
All external APIs SHALL follow RESTful conventions and return JSON responses.

#### Scenario: Consistent response format
- **WHEN** any API request succeeds
- **THEN** the response SHALL follow format:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

#### Scenario: Consistent error format
- **WHEN** any API request fails
- **THEN** the response SHALL follow format:
```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE",
  "data": {}
}
```

#### Scenario: HTTP status codes
- **THEN** the system SHALL use appropriate HTTP status codes:
  - 200: Success
  - 201: Created
  - 400: Bad Request (validation error)
  - 401: Unauthorized (missing/invalid auth)
  - 403: Forbidden (insufficient permissions)
  - 404: Not Found
  - 429: Too Many Requests (rate limit exceeded)
  - 500: Internal Server Error

---

### Requirement: Comprehensive Error Handling
The system SHALL provide detailed, actionable error messages.

#### Scenario: Validation error response
- **WHEN** request has invalid data (e.g., missing required field)
- **THEN** the system SHALL return:
  - HTTP 400
  - Error message specifying which field is invalid
  - Code: `VALIDATION_ERROR`

#### Scenario: Authentication error response
- **WHEN** request has invalid API key or JWT
- **THEN** the system SHALL return:
  - HTTP 401
  - Message: "Invalid authentication credentials"
  - Code: `AUTH_ERROR`

#### Scenario: Resource not found error
- **WHEN** requesting a non-existent coupon or user
- **THEN** the system SHALL return:
  - HTTP 404
  - Message: "Coupon not found"
  - Code: `NOT_FOUND`

---

### Requirement: Rate Limiting
The system SHALL enforce rate limits to prevent API abuse.

#### Scenario: External App API rate limit
- **WHEN** an external app exceeds 1000 requests/hour
- **THEN** the system SHALL:
  - Return HTTP 429
  - Message: "Rate limit exceeded. Try again later."
  - Include `Retry-After` header with seconds to wait

#### Scenario: Public Scan API rate limits
- **WHEN** a single IP makes more than:
  - 120 requests/minute (general limit)
  - 60 session starts per coupon per 10 minutes
  - 10 OTP sends per mobile per 24 hours
  - 20 OTP verifications per session per 10 minutes
- **THEN** the system SHALL reject with HTTP 429 and specific rate limit message

#### Scenario: Burst allowance
- **WHEN** an external app makes 100 requests in 1 minute (burst)
- **THEN** the system SHALL allow the burst
- **AND** count toward hourly limit

---

### Requirement: API Documentation
The system SHALL provide comprehensive API documentation.

#### Scenario: Documentation completeness
- **WHEN** a developer accesses API documentation
- **THEN** the documentation SHALL include:
  - Authentication methods (API key, JWT)
  - All endpoint paths and HTTP methods
  - Request/response examples for each endpoint
  - Error codes and meanings
  - Rate limits per endpoint
  - Integration examples (JavaScript, Python, cURL)

#### Scenario: Interactive API explorer
- **WHEN** viewing API documentation
- **THEN** the system SHOULD provide:
  - Try-it-out functionality (Swagger/Postman)
  - Sample API keys for testing
  - Code snippet generator

---

## API Endpoints Summary

### External App API (`/api/app/:appCode/`)
- `GET /products` - List products
- `GET /users/:userId/credits` - Get user balance
- `GET /users/:userId/credit-transactions` - Transaction history
- `POST /scans` - Record scan
- `POST /redeem` - Redeem product

### Mobile Scan API (`/api/mobile/v1/scan/`)
- `POST /` - Scan coupon
- `GET /history` - Scan history
- `GET /:id` - Scan details
- `GET /stats/summary` - Statistics

### Public Scan API (`/api/public-scan/`)
- `POST /start` - Start session
- `POST /:sessionId/mobile` - Send OTP
- `POST /:sessionId/verify-otp` - Verify and complete

---

## Rate Limits

| API | Limit | Window |
|-----|-------|--------|
| External App API | 1000 requests | 1 hour |
| External App API (burst) | 100 requests | 1 minute |
| Public Scan API (general) | 120 requests | 1 minute |
| Public Scan API (session start) | 60 per coupon/device/IP | 10 minutes |
| Public Scan API (OTP send) | 10 per mobile | 24 hours |
| Public Scan API (OTP verify) | 20 per session | 10 minutes |

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `AUTH_ERROR` | 401 | Invalid credentials |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `COUPON_EXPIRED` | 400 | Coupon past expiry date |
| `COUPON_USED` | 400 | Coupon already scanned |
| `INSUFFICIENT_CREDITS` | 400 | Not enough credits |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

---

## Integration Examples

### cURL Example
```bash
# External App API - Record Scan
curl -X POST https://api.mscan.com/app/ABC123/scans \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"couponCode": "XYZ789", "userId": "user-123"}'
```

### JavaScript Example
```javascript
// Mobile Scan API - Scan Coupon
const response = await fetch('https://api.mscan.com/api/mobile/v1/scan/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ couponCode: 'XYZ789' })
});
const result = await response.json();
```

### Python Example
```python
# Public Scan API - Start Session
import requests

response = requests.post(
    'https://api.mscan.com/api/public-scan/start',
    json={'couponCode': 'XYZ789'}
)
session_id = response.json()['data']['sessionId']
```

---

## Security Considerations

1. **HTTPS Only**: All API requests MUST be over HTTPS
2. **API Key Storage**: External apps MUST securely store API keys
3. **JWT Expiry**: Mobile apps MUST handle token refresh
4. **OTP Security**: Public scan OTPs MUST expire after 5 minutes
5. **Rate Limiting**: Protect against abuse with strict rate limits
6. **Input Validation**: Validate and sanitize all input data
7. **CORS**: Configure proper CORS headers for web clients
