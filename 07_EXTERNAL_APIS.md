# MScan External & Scanning APIs

## Table of Contents
1. [Overview](#overview)
2. [API Types](#api-types)
3. [External App API](#external-app-api)
4. [Mobile Scan API](#mobile-scan-api)
5. [Public Scan API](#public-scan-api)
6. [QR Code Structure](#qr-code-structure)
7. [Authentication Methods](#authentication-methods)
8. [Error Handling](#error-handling)
9. [Rate Limiting](#rate-limiting)
10. [Integration Examples](#integration-examples)
11. [Best Practices](#best-practices)

---

## Overview

MScan provides three types of external APIs for different use cases:

1. **External App API** - For third-party applications (mobile apps, kiosks, POS systems)
2. **Mobile Scan API** - For authenticated mobile applications within the MScan ecosystem
3. **Public Scan API** - For anonymous coupon redemption via public web pages

All APIs are RESTful and return JSON responses.

---

## API Types

### Comparison Matrix

| Feature | External App API | Mobile Scan API | Public Scan API |
|---------|-----------------|-----------------|-----------------|
| **Authentication** | API Key | JWT Token | None |
| **Use Case** | Third-party apps | MScan mobile apps | Public web redemption |
| **User Context** | App-managed users | MScan users | Anonymous users |
| **Rate Limiting** | Per API key | Per user | Aggressive (IP-based) |
| **Access Scope** | Tenant products/coupons | Tenant data | Specific coupon only |
| **Setup Required** | Verification App + API Key | User login | None |

---

## External App API

### Purpose
Enable third-party applications (mobile apps, kiosks, web apps, POS systems) to integrate with MScan using API key authentication.

### Base URL
```
Production: https://{tenant-subdomain}.mscan.com/api
Development: http://localhost:8080/api
```

### Authentication
All endpoints require an API key in the Authorization header:

```http
Authorization: Bearer <your_api_key>
```

**Getting Your API Key:**
1. Login to MScan tenant dashboard
2. Navigate to Verification Apps
3. Create or select a verification app
4. Copy the API key
5. Keep it secure (never expose in client-side code)

**Security Notes:**
- Each verification app has a unique API key
- API keys are scoped to the tenant
- Inactive apps receive 403 Forbidden responses
- Keys can be regenerated if compromised

---

### Endpoints

#### 1. Get Categories

Retrieve all product categories for your app.

**Endpoint:**
```
GET /app/:appCode/categories
```

**Path Parameters:**
- `appCode` - Your application code (from verification app configuration)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "category_id": 1,
      "category_name": "Electronics",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    },
    {
      "category_id": 2,
      "category_name": "Clothing",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 2
}
```

**Use Case:** Display category filters in your app

---

#### 2. Get Products

Retrieve all products for your app, optionally filtered by category.

**Endpoint:**
```
GET /app/:appCode/products?category_id=123
```

**Path Parameters:**
- `appCode` - Your application code

**Query Parameters:**
- `category_id` (optional) - Filter products by category

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "product_id": 1,
      "product_name": "Wireless Headphones",
      "points": 500,
      "stock_quantity": 50,
      "category_id": 1,
      "category_name": "Electronics",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Use Case:** Display product catalog for redemption

---

#### 3. Get User Credits

Retrieve a user's current credit balance.

**Endpoint:**
```
GET /app/:appCode/users/:userId/credits
```

**Path Parameters:**
- `appCode` - Your application code
- `userId` - User ID (your app's user identifier)

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": 123,
    "balance": 1500,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Note:** If the user has no credit account, one is automatically created with balance 0.

**Use Case:** Display user's available points before redemption

---

#### 4. Get Credit Transactions

Retrieve a user's credit transaction history.

**Endpoint:**
```
GET /app/:appCode/users/:userId/credit-transactions?limit=50&offset=0
```

**Path Parameters:**
- `appCode` - Your application code
- `userId` - User ID

**Query Parameters:**
- `limit` (optional) - Records per page (default: 50, max: 100)
- `offset` (optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "transaction_id": 1,
      "transaction_type": "earn",
      "amount": 100,
      "balance_after": 1500,
      "description": "Earned 100 points from scanning coupon ABC123",
      "verification_app_id": 1,
      "created_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "transaction_id": 2,
      "transaction_type": "spend",
      "amount": -500,
      "balance_after": 1000,
      "description": "Redeemed Wireless Headphones",
      "verification_app_id": 1,
      "created_at": "2024-01-16T14:20:00.000Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**Transaction Types:**
- `earn` - Credits earned from coupon scans
- `spend` - Credits spent on product redemptions
- `adjust` - Manual adjustment by admin

**Use Case:** Display transaction history in user profile

---

#### 5. Record Scan

Record a coupon scan and award credits to the user.

**Endpoint:**
```
POST /app/:appCode/scans
```

**Path Parameters:**
- `appCode` - Your application code

**Request Body:**
```json
{
  "user_id": 123,
  "coupon_code": "ABC123XYZ",
  "points": 100
}
```

**Request Fields:**
- `user_id` (required) - Your app's user identifier
- `coupon_code` (required) - Coupon code from QR scan
- `points` (required) - Points to award (from QR code data)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Scan recorded successfully",
  "data": {
    "transaction_id": 1,
    "user_id": 123,
    "points_earned": 100,
    "new_balance": 1500,
    "coupon_code": "ABC123XYZ",
    "scanned_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses:**

**400 - Coupon Already Scanned:**
```json
{
  "success": false,
  "message": "Coupon has already been scanned"
}
```

**400 - Coupon Expired:**
```json
{
  "success": false,
  "message": "Coupon has expired"
}
```

**403 - Wrong App:**
```json
{
  "success": false,
  "message": "Coupon belongs to a different verification app"
}
```

**404 - Not Found:**
```json
{
  "success": false,
  "message": "Coupon not found"
}
```

**Use Case:** Scan QR codes and award points to users

---

#### 6. Redeem Product

Redeem user credits for a product.

**Endpoint:**
```
POST /app/:appCode/redeem
```

**Path Parameters:**
- `appCode` - Your application code

**Request Body:**
```json
{
  "user_id": 123,
  "product_id": 5
}
```

**Request Fields:**
- `user_id` (required) - Your app's user identifier
- `product_id` (required) - Product ID to redeem

**Success Response (200):**
```json
{
  "success": true,
  "message": "Product redeemed successfully",
  "data": {
    "transaction_id": 2,
    "user_id": 123,
    "product_id": 5,
    "product_name": "Wireless Headphones",
    "points_spent": 500,
    "new_balance": 1000,
    "redeemed_at": "2024-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

**400 - Insufficient Credits:**
```json
{
  "success": false,
  "message": "Insufficient credits",
  "data": {
    "required": 500,
    "available": 300,
    "shortfall": 200
  }
}
```

**400 - Out of Stock:**
```json
{
  "success": false,
  "message": "Product is out of stock"
}
```

**403 - Wrong App:**
```json
{
  "success": false,
  "message": "Product belongs to a different verification app"
}
```

**404 - Not Found:**
```json
{
  "success": false,
  "message": "Product not found"
}
```

**Use Case:** Allow users to redeem rewards

---

### External App API Integration Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. Setup (One-time)                                    │
│  - Create Verification App in MScan dashboard           │
│  - Copy API Key                                         │
│  - Store securely in your backend                       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  2. User Scans QR Code                                  │
│  - User opens camera/scanner in your app                │
│  - Scans MScan QR code                                  │
│  - App parses JSON data from QR code                    │
│  - Extracts: couponCode, couponPoints                   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  3. Record Scan                                         │
│  POST /app/:appCode/scans                               │
│  {                                                      │
│    user_id: currentUserId,                             │
│    coupon_code: scannedCode,                           │
│    points: scannedPoints                               │
│  }                                                      │
│  Authorization: Bearer <API_KEY>                        │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  4. Update User Balance                                 │
│  - MScan validates coupon                               │
│  - Awards points to user                                │
│  - Returns new balance                                  │
│  - Your app shows success message                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  5. Redemption Flow                                     │
│  - User browses products (GET /app/:appCode/products)   │
│  - User checks balance (GET /app/:appCode/users/:id/credits) │
│  - User redeems product (POST /app/:appCode/redeem)     │
│  - Points deducted, product delivered                   │
└─────────────────────────────────────────────────────────┘
```

---

## Mobile Scan API

### Purpose
Authenticated API for MScan mobile applications where users log in with their MScan accounts.

### Base URL
```
Production: https://{tenant-subdomain}.mscan.com/api/mobile/v1/scan
Development: http://localhost:8080/api/mobile/v1/scan
```

### Authentication
Requires JWT token obtained via MScan authentication:

```http
Authorization: Bearer <jwt_access_token>
```

**Getting JWT Token:**
1. User requests OTP: `POST /api/auth/request-otp`
2. User verifies OTP: `POST /api/auth/verify-otp`
3. Receive `accessToken` and `refreshToken`
4. Use `accessToken` in Authorization header

---

### Endpoints

#### 1. Scan Coupon

Scan and verify a coupon for the authenticated user.

**Endpoint:**
```
POST /api/mobile/v1/scan
```

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "coupon_code": "ABC123XYZ",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "device_info": {
    "platform": "iOS",
    "version": "15.0",
    "model": "iPhone 13"
  }
}
```

**Request Fields:**
- `coupon_code` (required) - Scanned coupon code
- `location` (optional) - GPS coordinates
- `device_info` (optional) - Device information

**Success Response (200):**
```json
{
  "success": true,
  "message": "Coupon scanned successfully",
  "data": {
    "scan_id": "uuid-1234",
    "coupon_code": "ABC123XYZ",
    "product_name": "Premium Coffee",
    "points_earned": 100,
    "new_balance": 1500,
    "scanned_at": "2024-01-15T10:30:00.000Z",
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194
    }
  }
}
```

**Error Responses:**
- `400` - Invalid coupon, already scanned, or expired
- `401` - Unauthorized (invalid/expired token)
- `404` - Coupon not found

---

#### 2. Get Scan History

Retrieve the authenticated user's scan history.

**Endpoint:**
```
GET /api/mobile/v1/scan/history?limit=20&offset=0
```

**Authentication:** Required (JWT)

**Query Parameters:**
- `limit` (optional) - Records per page (default: 20)
- `offset` (optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "scan_id": "uuid-1234",
      "coupon_code": "ABC123XYZ",
      "product_name": "Premium Coffee",
      "points_earned": 100,
      "balance_after": 1500,
      "scanned_at": "2024-01-15T10:30:00.000Z",
      "location": {
        "latitude": 37.7749,
        "longitude": -122.4194
      }
    }
  ],
  "pagination": {
    "total": 50,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

#### 3. Get Scan Details

Retrieve details of a specific scan transaction.

**Endpoint:**
```
GET /api/mobile/v1/scan/:id
```

**Authentication:** Required (JWT)

**Path Parameters:**
- `id` - Scan transaction ID

**Response:**
```json
{
  "success": true,
  "data": {
    "scan_id": "uuid-1234",
    "coupon_code": "ABC123XYZ",
    "product": {
      "id": "prod-123",
      "name": "Premium Coffee",
      "category": "Food & Beverage",
      "image_url": "https://..."
    },
    "points_earned": 100,
    "balance_after": 1500,
    "scanned_at": "2024-01-15T10:30:00.000Z",
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194
    },
    "device_info": {
      "platform": "iOS",
      "version": "15.0",
      "model": "iPhone 13"
    }
  }
}
```

---

#### 4. Get Scan Statistics

Retrieve scan statistics for the authenticated user.

**Endpoint:**
```
GET /api/mobile/v1/scan/stats/summary
```

**Authentication:** Required (JWT)

**Response:**
```json
{
  "success": true,
  "data": {
    "total_scans": 150,
    "total_points_earned": 15000,
    "scans_this_month": 25,
    "points_this_month": 2500,
    "favorite_products": [
      {
        "product_name": "Premium Coffee",
        "scan_count": 30
      },
      {
        "product_name": "Burger Combo",
        "scan_count": 20
      }
    ],
    "scans_by_day": [
      { "date": "2024-01-15", "count": 5 },
      { "date": "2024-01-16", "count": 3 }
    ]
  }
}
```

---

## Public Scan API

### Purpose
Enable anonymous coupon redemption via public web pages without requiring user accounts.

### Base URL
```
Production: https://{tenant-subdomain}.mscan.com/api/public-scan
Development: http://localhost:8080/api/public-scan
```

### Authentication
None required - uses session-based flow with OTP verification.

### Flow Overview

```
1. User scans QR code → Redirected to public page
2. Public page extracts coupon code from URL
3. Frontend calls /start to initiate session
4. User enters mobile number
5. Frontend calls /:sessionId/mobile to send OTP
6. User enters OTP
7. Frontend calls /:sessionId/verify-otp to complete scan
8. Points awarded, success message displayed
```

---

### Endpoints

#### 1. Start Session

Initiate a public scan session.

**Endpoint:**
```
POST /api/public-scan/start
```

**Request Body:**
```json
{
  "coupon_code": "ABC123XYZ",
  "device_id": "browser-fingerprint-123",
  "referrer": "https://example.com/qr-landing"
}
```

**Request Fields:**
- `coupon_code` (required) - Coupon code from QR scan
- `device_id` (optional) - Browser fingerprint or device identifier
- `referrer` (optional) - Source URL

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "session_id": "sess-uuid-1234",
    "coupon": {
      "code": "ABC123XYZ",
      "product_name": "Premium Coffee",
      "points": 100,
      "expires_at": "2024-12-31T23:59:59.000Z"
    },
    "status": "mobile_required",
    "expires_at": "2024-01-15T11:00:00.000Z"
  }
}
```

**Session Status Values:**
- `mobile_required` - Need to collect mobile number
- `otp_sent` - OTP sent, waiting for verification
- `verified` - OTP verified, scan complete

**Rate Limiting:**
- 120 requests per minute per IP
- 60 session starts per coupon/device/IP per 10 minutes

---

#### 2. Collect Mobile Number

Collect user's mobile number and send OTP.

**Endpoint:**
```
POST /api/public-scan/:sessionId/mobile
```

**Path Parameters:**
- `sessionId` - Session ID from start endpoint

**Request Body:**
```json
{
  "mobile_e164": "+1234567890",
  "country_code": "US"
}
```

**Request Fields:**
- `mobile_e164` (required) - Mobile number in E.164 format (+1234567890)
- `country_code` (optional) - ISO country code

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent to +1234567890",
  "data": {
    "session_id": "sess-uuid-1234",
    "status": "otp_sent",
    "mobile_masked": "+1***-***-7890",
    "otp_expires_at": "2024-01-15T10:35:00.000Z"
  }
}
```

**Rate Limiting:**
- 10 OTP sends per mobile number per 24 hours

---

#### 3. Verify OTP

Verify OTP and complete the scan.

**Endpoint:**
```
POST /api/public-scan/:sessionId/verify-otp
```

**Path Parameters:**
- `sessionId` - Session ID from start endpoint

**Request Body:**
```json
{
  "otp": "123456"
}
```

**Request Fields:**
- `otp` (required) - 6-digit OTP sent to mobile

**Success Response (200):**
```json
{
  "success": true,
  "message": "Coupon scanned successfully!",
  "data": {
    "session_id": "sess-uuid-1234",
    "status": "verified",
    "scan": {
      "scan_id": "uuid-5678",
      "coupon_code": "ABC123XYZ",
      "product_name": "Premium Coffee",
      "points_earned": 100,
      "scanned_at": "2024-01-15T10:32:00.000Z"
    },
    "user": {
      "mobile_e164": "+1234567890",
      "total_points": 1500
    }
  }
}
```

**Error Responses:**

**400 - Invalid OTP:**
```json
{
  "success": false,
  "message": "Invalid or expired OTP",
  "attempts_remaining": 2
}
```

**400 - OTP Expired:**
```json
{
  "success": false,
  "message": "OTP has expired. Please request a new one."
}
```

**400 - Coupon Already Scanned:**
```json
{
  "success": false,
  "message": "This coupon has already been scanned"
}
```

**Rate Limiting:**
- 20 verification attempts per session per 10 minutes

---

### Public Scan Integration Example

**HTML/JavaScript:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Scan Coupon</title>
</head>
<body>
  <div id="scan-container">
    <h2>Claim Your Reward</h2>
    <div id="step-1">
      <p>Enter your mobile number to continue</p>
      <input type="tel" id="mobile" placeholder="+1234567890" />
      <button onclick="sendOTP()">Send OTP</button>
    </div>
    <div id="step-2" style="display:none;">
      <p>Enter the OTP sent to <span id="mobile-display"></span></p>
      <input type="text" id="otp" placeholder="123456" maxlength="6" />
      <button onclick="verifyOTP()">Verify</button>
    </div>
    <div id="success" style="display:none;">
      <h3>Success!</h3>
      <p>You earned <span id="points"></span> points!</p>
      <p>Total Balance: <span id="balance"></span> points</p>
    </div>
  </div>

  <script>
    const API_BASE = 'https://tenant.mscan.com/api/public-scan';
    const COUPON_CODE = new URLSearchParams(window.location.search).get('code');
    let sessionId = null;

    // Start session on page load
    window.onload = async () => {
      const response = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_code: COUPON_CODE })
      });
      const data = await response.json();
      if (data.success) {
        sessionId = data.data.session_id;
        document.querySelector('h2').textContent =
          `Claim ${data.data.coupon.points} points for ${data.data.coupon.product_name}!`;
      } else {
        alert(data.message);
      }
    };

    async function sendOTP() {
      const mobile = document.getElementById('mobile').value;
      const response = await fetch(`${API_BASE}/${sessionId}/mobile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_e164: mobile })
      });
      const data = await response.json();
      if (data.success) {
        document.getElementById('step-1').style.display = 'none';
        document.getElementById('step-2').style.display = 'block';
        document.getElementById('mobile-display').textContent = data.data.mobile_masked;
      } else {
        alert(data.message);
      }
    }

    async function verifyOTP() {
      const otp = document.getElementById('otp').value;
      const response = await fetch(`${API_BASE}/${sessionId}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp })
      });
      const data = await response.json();
      if (data.success) {
        document.getElementById('step-2').style.display = 'none';
        document.getElementById('success').style.display = 'block';
        document.getElementById('points').textContent = data.data.scan.points_earned;
        document.getElementById('balance').textContent = data.data.user.total_points;
      } else {
        alert(data.message);
      }
    }
  </script>
</body>
</html>
```

---

## QR Code Structure

### QR Code Data Format

MScan QR codes contain JSON data with all necessary information for processing the scan.

**Example QR Code JSON:**
```json
{
  "couponCode": "ABC123XYZ",
  "tenantId": 1,
  "verifyUrl": "https://tenant.mscan.com/scan/ABC123XYZ",
  "discountType": "FIXED_AMOUNT",
  "discountValue": 100,
  "couponPoints": 50,
  "expiryDate": "2024-12-31T23:59:59.000Z"
}
```

**Field Descriptions:**

| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `couponCode` | string | Unique coupon identifier | Use for scan recording |
| `tenantId` | number | Tenant ID | Verification |
| `verifyUrl` | string | Public scan landing page URL | Deep link for web flow |
| `discountType` | string | Type of discount | Display information |
| `discountValue` | number | Discount amount/percentage | Display information |
| `couponPoints` | number | Points to award | Use in scan API call |
| `expiryDate` | string (ISO 8601) | Expiration date | Validation |

**Discount Types:**
- `FIXED_AMOUNT` - Fixed dollar/currency amount off
- `PERCENTAGE` - Percentage discount
- `BUY_X_GET_Y` - Buy X get Y free
- `FREE_SHIPPING` - Free shipping offer

### QR Code Scanning Flow

**For External Apps:**
```javascript
// 1. Scan QR code
const qrData = JSON.parse(scannedQRCodeText);

// 2. Extract necessary fields
const couponCode = qrData.couponCode;
const points = qrData.couponPoints;

// 3. Call scan API
const response = await fetch(`${API_BASE}/app/${APP_CODE}/scans`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    user_id: currentUserId,
    coupon_code: couponCode,
    points: points
  })
});

// 4. Handle response
const result = await response.json();
if (result.success) {
  showSuccess(`Earned ${result.data.points_earned} points!`);
  updateBalance(result.data.new_balance);
} else {
  showError(result.message);
}
```

**For Public Web:**
```javascript
// 1. Extract from URL (QR code redirects to web page)
const params = new URLSearchParams(window.location.search);
const couponCode = params.get('code');

// 2. Start session
// 3. Collect mobile and send OTP
// 4. Verify OTP to complete scan
// (See Public Scan Integration Example above)
```

---

## Authentication Methods

### 1. API Key Authentication (External App API)

**Format:**
```http
Authorization: Bearer <api_key>
```

**Obtaining API Key:**
1. Login to MScan tenant dashboard
2. Navigate to Verification Apps
3. Create new app or select existing
4. Copy API key from configuration page

**Validation:**
- API key is validated on every request
- Must belong to an active verification app
- Scoped to the tenant
- Can be regenerated if compromised

**Backend Middleware:**
```javascript
const authenticateAppApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing API key' });
  }

  const apiKey = authHeader.substring(7);
  // Validate API key against database
  const app = await getVerificationAppByApiKey(apiKey);

  if (!app || !app.is_active) {
    return res.status(403).json({ success: false, message: 'Invalid or inactive API key' });
  }

  req.app = app;
  req.tenantId = app.tenant_id;
  next();
};
```

---

### 2. JWT Authentication (Mobile Scan API)

**Format:**
```http
Authorization: Bearer <jwt_access_token>
```

**Obtaining JWT:**

**Step 1: Request OTP**
```http
POST /api/auth/request-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "userType": "TENANT_USER"
}
```

**Step 2: Verify OTP**
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "userType": "TENANT_USER",
    "subdomain": "acme"
  }
}
```

**Token Expiry:**
- Access Token: 1 hour
- Refresh Token: 7 days

**Refreshing Token:**
```http
POST /api/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 3. Session-Based (Public Scan API)

**No authentication required** - Uses session IDs for stateless flow.

**Session Creation:**
```http
POST /api/public-scan/start
```

**Session ID:** Returned in response, used for subsequent requests

**Session Expiry:** 30 minutes from creation

---

## Error Handling

### Standard Error Response Format

All APIs use consistent error response structure:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Technical error details (development only)",
  "code": "ERROR_CODE"
}
```

### HTTP Status Codes

| Status | Meaning | Use Case |
|--------|---------|----------|
| **200** | Success | Request completed successfully |
| **201** | Created | Resource created |
| **400** | Bad Request | Invalid input, validation errors |
| **401** | Unauthorized | Missing or invalid authentication |
| **403** | Forbidden | Valid auth but insufficient permissions |
| **404** | Not Found | Resource doesn't exist |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server-side error |

### Common Error Codes

**Authentication Errors:**
```json
// 401 - Missing API Key
{
  "success": false,
  "message": "Missing API key",
  "code": "MISSING_API_KEY"
}

// 401 - Invalid JWT
{
  "success": false,
  "message": "Invalid or expired token",
  "code": "INVALID_TOKEN"
}

// 403 - Inactive App
{
  "success": false,
  "message": "Verification app is inactive",
  "code": "INACTIVE_APP"
}
```

**Validation Errors:**
```json
// 400 - Missing Fields
{
  "success": false,
  "message": "Missing required fields",
  "code": "VALIDATION_ERROR",
  "fields": ["user_id", "coupon_code"]
}

// 400 - Invalid Format
{
  "success": false,
  "message": "Invalid mobile number format",
  "code": "INVALID_FORMAT"
}
```

**Business Logic Errors:**
```json
// 400 - Coupon Already Scanned
{
  "success": false,
  "message": "Coupon has already been scanned",
  "code": "COUPON_ALREADY_USED",
  "data": {
    "scanned_at": "2024-01-15T10:30:00.000Z",
    "scanned_by": 123
  }
}

// 400 - Insufficient Credits
{
  "success": false,
  "message": "Insufficient credits",
  "code": "INSUFFICIENT_CREDITS",
  "data": {
    "required": 500,
    "available": 300,
    "shortfall": 200
  }
}

// 404 - Not Found
{
  "success": false,
  "message": "Coupon not found",
  "code": "COUPON_NOT_FOUND"
}
```

**Rate Limiting Errors:**
```json
// 429 - Rate Limit Exceeded
{
  "success": false,
  "message": "Too many requests",
  "code": "RATE_LIMITED",
  "retry_after": 1705320000000
}
```

---

## Rate Limiting

### External App API

**Limits:**
- To be implemented: 1000 requests per hour per API key
- Burst: 100 requests per minute

**Headers:**
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1705320000
```

---

### Mobile Scan API

**Limits:**
- Per user: 100 requests per minute
- Per user: 5000 requests per day

**Response when limited:**
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "success": false,
  "message": "Rate limit exceeded",
  "retry_after": 60
}
```

---

### Public Scan API

**Aggressive rate limiting to prevent abuse:**

**IP-Based Limiter:**
- 120 requests per minute per IP

**Session Start Limiter:**
- 60 session starts per coupon/device/IP per 10 minutes

**Mobile Collection Limiter:**
- 10 OTP sends per mobile number per 24 hours

**OTP Verification Limiter:**
- 20 verification attempts per session per 10 minutes

**Response when limited:**
```http
HTTP/1.1 429 Too Many Requests

{
  "success": false,
  "error": "rate_limited",
  "retry_after": 1705320000000
}
```

---

## Integration Examples

### Example 1: Mobile App with External App API

**Scenario:** Retail mobile app with user accounts

**Setup:**
1. Create verification app in MScan dashboard
2. Copy API key
3. Store API key securely in backend

**Scan Flow:**

```typescript
// Mobile App (TypeScript/React Native)
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY = await AsyncStorage.getItem('MSCAN_API_KEY');
const APP_CODE = 'retail-mobile-app';
const API_BASE = 'https://acme.mscan.com/api';

// 1. Scan QR Code
const handleQRScan = async (qrData: string) => {
  try {
    const data = JSON.parse(qrData);
    const { couponCode, couponPoints } = data;

    // 2. Get current user ID from your auth system
    const userId = await getCurrentUserId();

    // 3. Record scan
    const response = await fetch(`${API_BASE}/app/${APP_CODE}/scans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        coupon_code: couponCode,
        points: couponPoints
      })
    });

    const result = await response.json();

    if (result.success) {
      // 4. Show success
      showSuccessMessage(`You earned ${result.data.points_earned} points!`);
      updateUserBalance(result.data.new_balance);
    } else {
      showError(result.message);
    }
  } catch (error) {
    showError('Failed to scan coupon');
  }
};

// Redemption Flow
const redeemProduct = async (productId: number) => {
  const userId = await getCurrentUserId();

  const response = await fetch(`${API_BASE}/app/${APP_CODE}/redeem`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: userId,
      product_id: productId
    })
  });

  const result = await response.json();

  if (result.success) {
    showSuccess(`Redeemed ${result.data.product_name}!`);
    updateUserBalance(result.data.new_balance);
  } else {
    if (result.data?.shortfall) {
      showError(`Need ${result.data.shortfall} more points`);
    } else {
      showError(result.message);
    }
  }
};
```

---

### Example 2: Kiosk with Public Scan API

**Scenario:** In-store kiosk for anonymous coupon redemption

**HTML/JavaScript Implementation:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Store Kiosk - Scan Coupon</title>
  <style>
    .step { display: none; }
    .step.active { display: block; }
    .success { color: green; font-size: 24px; }
    .error { color: red; }
  </style>
</head>
<body>
  <div id="kiosk">
    <!-- Step 1: Scan QR or Enter Code -->
    <div id="step-scan" class="step active">
      <h2>Scan Your Coupon</h2>
      <input type="text" id="coupon-code" placeholder="Or enter code manually" />
      <button onclick="startScan()">Continue</button>
    </div>

    <!-- Step 2: Enter Mobile -->
    <div id="step-mobile" class="step">
      <h2>Enter Your Mobile Number</h2>
      <p id="product-info"></p>
      <input type="tel" id="mobile" placeholder="+1234567890" />
      <button onclick="sendOTP()">Send Code</button>
      <button onclick="goBack('step-scan')">Back</button>
    </div>

    <!-- Step 3: Enter OTP -->
    <div id="step-otp" class="step">
      <h2>Enter Verification Code</h2>
      <p>Code sent to <span id="mobile-display"></span></p>
      <input type="text" id="otp" placeholder="123456" maxlength="6" />
      <button onclick="verifyOTP()">Submit</button>
      <button onclick="sendOTP()">Resend Code</button>
      <button onclick="goBack('step-mobile')">Back</button>
    </div>

    <!-- Step 4: Success -->
    <div id="step-success" class="step">
      <h2 class="success">✓ Success!</h2>
      <p id="success-message"></p>
      <button onclick="reset()">Scan Another Coupon</button>
    </div>

    <div id="error" class="error"></div>
  </div>

  <script>
    const API_BASE = 'https://acme.mscan.com/api/public-scan';
    let sessionId = null;
    let currentStep = 'step-scan';

    function showStep(stepId) {
      document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
      document.getElementById(stepId).classList.add('active');
      currentStep = stepId;
    }

    function goBack(stepId) {
      showStep(stepId);
    }

    function showError(message) {
      document.getElementById('error').textContent = message;
      setTimeout(() => {
        document.getElementById('error').textContent = '';
      }, 5000);
    }

    async function startScan() {
      const couponCode = document.getElementById('coupon-code').value;
      if (!couponCode) {
        showError('Please enter a coupon code');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coupon_code: couponCode })
        });

        const data = await response.json();

        if (data.success) {
          sessionId = data.data.session_id;
          document.getElementById('product-info').textContent =
            `Earn ${data.data.coupon.points} points for ${data.data.coupon.product_name}`;
          showStep('step-mobile');
        } else {
          showError(data.message);
        }
      } catch (error) {
        showError('Network error. Please try again.');
      }
    }

    async function sendOTP() {
      const mobile = document.getElementById('mobile').value;
      if (!mobile) {
        showError('Please enter your mobile number');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/${sessionId}/mobile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile_e164: mobile })
        });

        const data = await response.json();

        if (data.success) {
          document.getElementById('mobile-display').textContent = data.data.mobile_masked;
          showStep('step-otp');
        } else {
          showError(data.message);
        }
      } catch (error) {
        showError('Network error. Please try again.');
      }
    }

    async function verifyOTP() {
      const otp = document.getElementById('otp').value;
      if (!otp || otp.length !== 6) {
        showError('Please enter the 6-digit code');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/${sessionId}/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp })
        });

        const data = await response.json();

        if (data.success) {
          document.getElementById('success-message').innerHTML = `
            <p>You earned <strong>${data.data.scan.points_earned}</strong> points!</p>
            <p>Your total balance: <strong>${data.data.user.total_points}</strong> points</p>
          `;
          showStep('step-success');
        } else {
          showError(data.message);
        }
      } catch (error) {
        showError('Network error. Please try again.');
      }
    }

    function reset() {
      document.getElementById('coupon-code').value = '';
      document.getElementById('mobile').value = '';
      document.getElementById('otp').value = '';
      sessionId = null;
      showStep('step-scan');
    }
  </script>
</body>
</html>
```

---

## Best Practices

### 1. Security

**API Key Management:**
- ✅ Store API keys in environment variables
- ✅ Use backend proxies for mobile apps (don't expose keys in client code)
- ✅ Rotate keys periodically
- ✅ Use HTTPS for all requests
- ❌ Never commit API keys to version control
- ❌ Never expose keys in client-side JavaScript

**JWT Token Management:**
- ✅ Store tokens securely (secure storage on mobile, httpOnly cookies on web)
- ✅ Implement token refresh before expiry
- ✅ Clear tokens on logout
- ❌ Never store tokens in localStorage (XSS vulnerable)

**Data Validation:**
- ✅ Validate all user input before sending to API
- ✅ Sanitize QR code data before parsing
- ✅ Verify coupon expiry dates client-side
- ✅ Handle all error responses gracefully

---

### 2. Performance

**Caching:**
- ✅ Cache categories and products locally
- ✅ Implement cache invalidation strategy
- ✅ Use ETags for conditional requests (if supported)

**Pagination:**
- ✅ Use pagination for transaction history
- ✅ Implement infinite scroll or load more pattern
- ✅ Cache paginated results

**Network Optimization:**
- ✅ Implement request debouncing for search
- ✅ Batch operations when possible
- ✅ Use compression (gzip)
- ✅ Implement retry logic with exponential backoff

---

### 3. User Experience

**Feedback:**
- ✅ Show loading states during API calls
- ✅ Display clear error messages
- ✅ Confirm successful actions visually
- ✅ Show balance updates immediately

**Offline Support:**
- ✅ Queue scans when offline
- ✅ Sync when connection restored
- ✅ Show offline indicator

**Validation:**
- ✅ Check credit balance before redemption
- ✅ Show shortfall amount if insufficient
- ✅ Verify coupon hasn't expired before scanning
- ✅ Validate mobile number format before OTP

---

### 4. Error Handling

**Always Check Success Field:**
```javascript
const response = await fetch(endpoint);
const data = await response.json();

if (!data.success) {
  // Handle error
  handleError(data.message, data.code);
  return;
}

// Process success
handleSuccess(data.data);
```

**Implement Retry Logic:**
```javascript
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return await response.json();
      }
      if (response.status >= 400 && response.status < 500) {
        // Client error, don't retry
        throw new Error(await response.text());
      }
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}
```

**Handle Rate Limiting:**
```javascript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After');
  const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

  showMessage(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);

  setTimeout(() => {
    retryRequest();
  }, waitTime);
}
```

---

### 5. Data Isolation

**Understanding Scope:**
- Each verification app only sees its own data
- Products and categories are app-specific
- Coupons belong to specific apps
- User credits are shared across all apps in the tenant
- Transaction history is filtered per app

**Best Practices:**
- Don't assume data across apps
- Filter by app in UI
- Handle "not found" errors gracefully
- Verify app context before operations

---

## Support

For API support and questions:
- Contact your tenant administrator
- Email: support@mscan.com
- Documentation: https://docs.mscan.com

---

**Document Version:** 1.0
**Last Updated:** 2026-01-26
**Maintained By:** MScan Development Team
