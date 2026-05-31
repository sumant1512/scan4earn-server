# Mobile App Integration Guide

Complete guide for integrating the Scan4Earn mobile app with the backend.

## Overview

The Scan4Earn mobile app communicates with the backend using **RESTful APIs** with JWT authentication. The app supports:

- Customer user registration and login
- Scanning QR codes for coupons
- Viewing earned rewards and cashback
- Redeeming points and rewards
- Dealer scanning on behalf of customers
- Offline capability (data sync on connection)

## Authentication

### 1. User Registration & Login

#### Register New User

```javascript
POST /api/auth/register

Headers:
  Content-Type: application/json
  X-Tenant-Slug: sumukham

Body:
{
  "email": "customer@example.com",
  "phone": "+919876543210",  // E.164 format
  "password": "SecurePass123",
  "name": "John Doe"
}

Response (201 Created):
{
  "status": true,
  "message": "User created successfully",
  "data": {
    "userId": "uuid",
    "email": "customer@example.com",
    "phone": "+919876543210",
    "role": "CUSTOMER"
  }
}
```

#### Login User

```javascript
POST /api/auth/login

Headers:
  Content-Type: application/json
  X-Tenant-Slug: sumukham

Body:
{
  "phone": "+919876543210",
  "password": "SecurePass123"
}

Response (200 OK):
{
  "status": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGc...",        // 15 min expiry
    "refreshToken": "eyJhbGc...",       // 7 day expiry
    "expiresIn": 900,                   // seconds
    "user": {
      "id": "uuid",
      "email": "customer@example.com",
      "phone": "+919876543210",
      "role": "CUSTOMER",
      "permissions": ["scan_qr", "view_rewards"]
    }
  }
}
```

### 2. Token Management

Store tokens securely in mobile app:

```javascript
// React Native / Flutter example
import AsyncStorage from '@react-native-async-storage/async-storage';

// After login
await AsyncStorage.multiSet([
  ['accessToken', response.data.accessToken],
  ['refreshToken', response.data.refreshToken],
  ['tokenExpiry', Date.now() + 900000] // 15 min
]);

// For all API requests
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'X-Tenant-Slug': 'sumukham',
  'Content-Type': 'application/json'
};

// Refresh token before expiry
const refreshToken = async () => {
  const response = await fetch('http://api.sumukham.scan4earn.com/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  // Update stored tokens
};
```

### 3. Logout

```javascript
POST /api/auth/logout

Headers:
  Authorization: Bearer {accessToken}
  X-Tenant-Slug: sumukham

Response:
{
  "status": true,
  "message": "Logout successful"
}
```

## Core Features

### Scan QR Code (Coupon)

#### Step 1: Extract coupon_code from QR

```javascript
// QR code URL format:
// https://api.sumukham.scan4earn.com/scan/COUP123456

// Extract the coupon_code: "COUP123456"
const couponCode = url.split('/scan/')[1];
```

#### Step 2: Validate & Get Coupon Details

```javascript
GET /api/public/scan/{couponCode}

Headers:
  X-Tenant-Slug: sumukham
  Content-Type: application/json

Response (200 OK):
{
  "status": true,
  "coupon": {
    "id": "uuid",
    "coupon_code": "COUP123456",
    "reward_type": "points",      // points | cashback | product
    "reward_value": 100,          // points or rupees or product_id
    "description": "Earn 100 points",
    "expiry_date": "2026-12-31",
    "status": "active",
    "terms": "Valid for one-time use"
  }
}
```

#### Step 3: Redeem Coupon (Authenticated)

```javascript
POST /api/mobile/v1/scan/{couponCode}/redeem

Headers:
  Authorization: Bearer {accessToken}
  X-Tenant-Slug: sumukham
  X-App-Id: {app_uuid}  // Optional, for multi-app scenarios
  Content-Type: application/json

Body:
{
  "retailer_location": "Mumbai Main Store",  // Optional context
  "notes": "Additional info"                 // Optional
}

Response (201 Created):
{
  "status": true,
  "message": "Coupon redeemed successfully",
  "reward": {
    "id": "uuid",
    "type": "points",
    "value": 100,
    "earned_at": "2026-05-31T10:30:00Z",
    "balance": 1500  // Updated balance
  }
}
```

### View Earned Rewards

```javascript
GET /api/mobile/v1/rewards

Headers:
  Authorization: Bearer {accessToken}
  X-Tenant-Slug: sumukham
  Content-Type: application/json

Query Parameters:
  ?page=1                 // Pagination
  &limit=20              // Items per page
  &status=active|redeemed // Filter

Response (200 OK):
{
  "status": true,
  "data": {
    "rewards": [
      {
        "id": "uuid",
        "type": "points",      // points | cashback | product
        "value": 100,
        "description": "Earned from QR scan",
        "earned_at": "2026-05-30T15:45:00Z",
        "status": "active",    // active | redeemed | expired
        "expiry_date": "2026-06-30"
      },
      {
        "id": "uuid",
        "type": "cashback",
        "value": 50,           // in rupees
        "description": "Welcome bonus",
        "earned_at": "2026-05-31T10:30:00Z",
        "status": "active",
        "expiry_date": null
      }
    ],
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 20,
      "pages": 3
    },
    "summary": {
      "active_points": 500,
      "active_cashback": 200,
      "total_redeemed": 1500
    }
  }
}
```

### View Points & Cashback Balance

```javascript
GET /api/mobile/v1/points

Headers:
  Authorization: Bearer {accessToken}
  X-Tenant-Slug: sumukham

Response (200 OK):
{
  "status": true,
  "data": {
    "points": {
      "total": 5000,
      "active": 3500,
      "redeemed": 1500,
      "expired": 0
    },
    "cashback": {
      "total": 500.00,      // in rupees
      "active": 250.00,
      "redeemed": 200.00,
      "pending": 50.00
    },
    "last_updated": "2026-05-31T10:30:00Z"
  }
}
```

### Redeem Points/Cashback

#### Step 1: Get Available Redemption Options

```javascript
GET /api/mobile/v1/redemptions/options

Headers:
  Authorization: Bearer {accessToken}
  X-Tenant-Slug: sumukham

Query Parameters:
  ?type=points|cashback  // Filter by type

Response (200 OK):
{
  "status": true,
  "redemptions": [
    {
      "id": "uuid",
      "name": "₹100 Amazon Voucher",
      "type": "points",
      "cost": 1000,         // points required
      "description": "Redeem 1000 points for Amazon voucher",
      "stock": 50,
      "available": true
    },
    {
      "id": "uuid",
      "name": "Instant Cashback",
      "type": "cashback",
      "min_amount": 50,     // minimum ₹50
      "max_amount": 5000,   // maximum ₹5000
      "processing_time": "1-2 hours"
    }
  ]
}
```

#### Step 2: Create Redemption Request

```javascript
POST /api/mobile/v1/redemptions

Headers:
  Authorization: Bearer {accessToken}
  X-Tenant-Slug: sumukham
  Content-Type: application/json

Body:
{
  "redemption_option_id": "uuid",
  "amount": null,                    // For cashback: amount in rupees
  "bank_account_id": "uuid",         // For bank transfer redemptions
  "upi_id": "user@upi"              // For UPI cashback
}

Response (201 Created):
{
  "status": true,
  "message": "Redemption request created",
  "redemption": {
    "id": "uuid",
    "type": "points",
    "status": "pending",
    "cost": 1000,
    "created_at": "2026-05-31T10:30:00Z",
    "expected_delivery": "2026-06-02T00:00:00Z",
    "reference_number": "RED123456"
  }
}
```

### View Transaction History

```javascript
GET /api/mobile/v1/transactions

Headers:
  Authorization: Bearer {accessToken}
  X-Tenant-Slug: sumukham

Query Parameters:
  ?type=scan|redeem|earn    // Filter transaction type
  &page=1
  &limit=20

Response (200 OK):
{
  "status": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "type": "scan",
        "description": "Scanned QR code - Earned 100 points",
        "amount": 100,
        "timestamp": "2026-05-30T15:45:00Z",
        "coupon_code": "COUP123456",
        "status": "completed"
      },
      {
        "id": "uuid",
        "type": "redeem",
        "description": "Redeemed for Amazon Voucher",
        "amount": -1000,
        "timestamp": "2026-05-31T10:30:00Z",
        "status": "completed",
        "reference": "RED123456"
      }
    ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20
    }
  }
}
```

## Dealer Features

### Dealer Login

```javascript
POST /api/auth/login

Headers:
  Content-Type: application/json
  X-Tenant-Slug: sumukham

Body:
{
  "phone": "+919876543210",
  "password": "DealerPassword123",
  "role": "DEALER"  // Optional, helps server route correctly
}

Response:
{
  "status": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "id": "uuid",
      "role": "DEALER",
      "apps": [          // Dealer may have access to multiple apps
        {
          "id": "app_uuid",
          "name": "Sumukham Main",
          "verification_app_id": "uuid"
        }
      ]
    }
  }
}
```

### Dealer Scan (On Behalf of Customer)

```javascript
POST /api/mobile/v1/dealer/scan

Headers:
  Authorization: Bearer {dealerAccessToken}
  X-Tenant-Slug: sumukham
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "coupon_code": "COUP123456",
  "customer_phone": "+919876543210",  // Phone of customer
  "notes": "Scanned at store"
}

Response (201 Created):
{
  "status": true,
  "message": "Coupon redeemed for customer",
  "transaction": {
    "id": "uuid",
    "coupon_code": "COUP123456",
    "customer_phone": "+919876543210",
    "reward_earned": 100,
    "dealer_commission": 10,
    "timestamp": "2026-05-31T11:00:00Z"
  }
}
```

### Dealer Dashboard

```javascript
GET /api/mobile/v1/dealer/dashboard

Headers:
  Authorization: Bearer {dealerAccessToken}
  X-Tenant-Slug: sumukham

Response (200 OK):
{
  "status": true,
  "data": {
    "earnings": {
      "today": 500.00,
      "this_week": 3000.00,
      "this_month": 12000.00,
      "total": 45000.00,
      "currency": "INR"
    },
    "scans": {
      "today": 5,
      "this_week": 35,
      "this_month": 150,
      "total": 450
    },
    "last_transactions": [
      {
        "id": "uuid",
        "customer_phone": "+919876543210",
        "amount_earned": 100,
        "timestamp": "2026-05-31T11:00:00Z"
      }
    ]
  }
}
```

## Offline Support

Mobile app should implement local caching for offline functionality:

```javascript
// Offline data structure (SQLite/Realm)
{
  "coupons": [
    {
      "id": "uuid",
      "code": "COUP123456",
      "reward_type": "points",
      "reward_value": 100,
      "synced": true,
      "local_only": false
    }
  ],
  "pending_scans": [
    {
      "id": "local_uuid",
      "coupon_code": "COUP789",
      "timestamp": "2026-05-31T10:30:00Z",
      "synced": false,
      "retry_count": 0
    }
  ]
}

// Sync strategy
- Cache product list locally on first load
- Cache coupons scanned by this device
- Queue scans when offline
- Retry queued scans on next connection
- Clear cache if user logs out
```

## Rate Limiting

Mobile app requests are rate-limited:

```
Global: 100 requests/minute per IP
Per User: 1000 requests/minute per access token
Burst: 10 requests/second

Response Headers:
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1622467200

If exceeded (429 Too Many Requests):
{
  "status": false,
  "message": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60  // seconds
}
```

## Error Handling

```javascript
// Standard error response format
{
  "status": false,
  "message": "Human readable error message",
  "code": "ERROR_CODE",
  "details": {
    // Additional context if applicable
  }
}

// Common error codes:
// INVALID_CREDENTIALS - Login failed
// TOKEN_EXPIRED - Access token expired, use refresh token
// COUPON_NOT_FOUND - Coupon doesn't exist
// COUPON_ALREADY_REDEEMED - Can't redeem same coupon twice
// INSUFFICIENT_BALANCE - Not enough points to redeem
// INVALID_PHONE - Phone number format invalid
// RATE_LIMIT_EXCEEDED - Too many requests
```

## Best Practices

### 1. Token Management

```javascript
// Always include Authorization header
const apiCall = async (endpoint, options = {}) => {
  const token = await AsyncStorage.getItem('accessToken');
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Slug': 'sumukham'
  };
  
  let response = await fetch(endpoint, { ...options, headers });
  
  // If 401, refresh token and retry
  if (response.status === 401) {
    await refreshAccessToken();
    const newToken = await AsyncStorage.getItem('accessToken');
    headers['Authorization'] = `Bearer ${newToken}`;
    response = await fetch(endpoint, { ...options, headers });
  }
  
  return response;
};
```

### 2. Error Handling

```javascript
// Implement proper error handling
try {
  const response = await apiCall('/api/mobile/v1/scan/COUP123/redeem', {
    method: 'POST'
  });
  
  if (!response.ok) {
    const error = await response.json();
    handleError(error.code, error.message);
    return;
  }
  
  const data = await response.json();
  updateUIWithReward(data.reward);
} catch (networkError) {
  // Handle network errors - save for offline sync
  queueForRetry({ endpoint, data });
  showOfflineMessage();
}
```

### 3. Performance

```javascript
// Use pagination
const loadMoreRewards = async (page = 1) => {
  const response = await apiCall(`/api/mobile/v1/rewards?page=${page}&limit=20`);
  return response.json();
};

// Implement caching
const getCachedRewards = async () => {
  const cached = await AsyncStorage.getItem('rewards_cache');
  const lastFetch = await AsyncStorage.getItem('rewards_fetch_time');
  
  // Refresh if older than 5 minutes
  if (Date.now() - lastFetch > 5 * 60 * 1000) {
    return fetchFreshRewards();
  }
  
  return JSON.parse(cached);
};

// Batch operations
const redeemMultiple = async (redemptionIds) => {
  const response = await apiCall('/api/mobile/v1/redemptions/batch', {
    method: 'POST',
    body: JSON.stringify({ redemption_ids: redemptionIds })
  });
  return response.json();
};
```

## Code Examples

See the [Code Examples](../examples/mobile/) directory for:
- React Native implementation
- Flutter implementation
- Complete authentication flow
- Offline sync implementation
- Error handling utilities

## Troubleshooting

**Token Expired Error?**
- The access token expires every 15 minutes
- Use refresh token to get new access token
- Check device clock synchronization

**Coupon Already Redeemed?**
- Each coupon can only be scanned once per customer
- Check transaction history to confirm
- Contact support for duplicate redemptions

**Offline Scan Not Syncing?**
- Check network connection
- Verify authentication tokens are still valid
- Try manual sync
- Clear cache and re-login if persistent

See [Troubleshooting Guide](08-TROUBLESHOOTING.md) for more help.

## Support Resources

- [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)
- [API Overview](../api/01-API-OVERVIEW.md)
- [Mobile App API Reference](../api/04-MOBILE-APP-API.md)
- [Code Examples](../examples/)
- [Troubleshooting Guide](08-TROUBLESHOOTING.md)
