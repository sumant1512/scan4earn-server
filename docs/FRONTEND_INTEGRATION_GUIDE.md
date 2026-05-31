# Scan4Earn Frontend Integration Guide

> **For:** Verification App Developers (Building websites/mobile apps for coupon verification)

Welcome! This guide explains how to integrate Scan4Earn APIs into your own frontend applications (website, mobile app, etc.).

---

## 📋 Quick Start (5 minutes)

### 1. Get Your API Credentials

Contact your Tenant Admin to get:
- **App ID** (UUID): Identifies your verification app
- **Mobile API Key** (256-bit): Secret key for API authentication
- **Sandbox API Key** (for testing): Use during development

### 2. Install the SDK

```bash
npm install @scan4earn/sdk
```

### 3. Initialize the Client

```javascript
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: 'your-app-id',
  apiKey: 'your-api-key',
  environment: 'production' // or 'sandbox' for testing
});
```

### 4. Fetch Products

```javascript
const products = await client.products.list();
console.log(products);
// [
//   {
//     id: 'prod-123',
//     name: 'Reliance Paint - Premium White',
//     category: 'Paint',
//     price: 500
//   }
// ]
```

### 5. Scan & Redeem Coupon

```javascript
// When user scans QR code
const coupon = await client.coupons.scan({
  couponCode: 'ABC-123-XYZ',
  timestamp: new Date()
});

// Redeem the coupon
const result = await client.coupons.redeem({
  couponCode: 'ABC-123-XYZ',
  customerPhone: '+919876543210'
});

console.log(result);
// {
//   success: true,
//   points: 50,
//   cashback: 100,
//   message: 'Coupon redeemed successfully'
// }
```

---

## 📚 Complete API Reference

### Authentication

All API requests require two headers:

```
Authorization: Bearer {mobile_api_key}
X-App-Id: {app_id}
```

**Example:**
```bash
curl -X GET "https://api.scan4earn.com/api/mobile/v2/products" \
  -H "Authorization: Bearer mobile_key_123..." \
  -H "X-App-Id: app-uuid-456..."
```

---

### Products API

#### List All Products

**Endpoint:** `GET /api/mobile/v2/products`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "prod-123",
      "name": "Premium Paint - White",
      "category": "Paint",
      "price": 500,
      "image_url": "https://...",
      "attributes": {
        "color": "White",
        "volume": "1L",
        "finish": "Matte"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50
  }
}
```

**Query Parameters:**
- `limit`: Number of products (default: 50, max: 1000)
- `offset`: Pagination offset (default: 0)
- `category`: Filter by category
- `search`: Search by product name

**Example:**
```javascript
const products = await client.products.list({
  limit: 100,
  category: 'Paint',
  search: 'Premium'
});
```

---

#### Get Single Product

**Endpoint:** `GET /api/mobile/v2/products/{id}`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "prod-123",
    "name": "Premium Paint - White",
    "category": "Paint",
    "price": 500,
    "description": "High-quality interior paint",
    "image_url": "https://...",
    "attributes": {
      "color": "White",
      "volume": "1L",
      "finish": "Matte"
    },
    "inventory": {
      "in_stock": 450,
      "low_stock_threshold": 50
    }
  }
}
```

**Example:**
```javascript
const product = await client.products.get('prod-123');
```

---

### Coupons API

#### Scan Coupon

**Endpoint:** `POST /api/mobile/v2/coupons/scan`

**Request Body:**
```json
{
  "coupon_code": "ABC-123-XYZ",
  "timestamp": "2026-05-31T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "coupon_id": "coupon-456",
    "coupon_code": "ABC-123-XYZ",
    "status": "scanned",
    "product_name": "Premium Paint - White",
    "scan_timestamp": "2026-05-31T10:30:00Z"
  }
}
```

**Error Responses:**
- `400`: Invalid coupon code format
- `404`: Coupon not found
- `410`: Coupon expired
- `409`: Coupon already redeemed

**Example:**
```javascript
try {
  const coupon = await client.coupons.scan({
    couponCode: 'ABC-123-XYZ'
  });
  console.log('Coupon found:', coupon);
} catch (error) {
  if (error.code === 'COUPON_EXPIRED') {
    alert('This coupon has expired');
  } else if (error.code === 'COUPON_NOT_FOUND') {
    alert('Invalid coupon code');
  }
}
```

---

#### Redeem Coupon

**Endpoint:** `POST /api/mobile/v2/coupons/redeem`

**Request Body:**
```json
{
  "coupon_code": "ABC-123-XYZ",
  "customer_phone": "+919876543210",
  "customer_email": "customer@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "coupon_code": "ABC-123-XYZ",
    "status": "redeemed",
    "redemption_timestamp": "2026-05-31T10:35:00Z",
    "rewards": {
      "points_awarded": 50,
      "cashback_amount": 100,
      "points_total": 250
    }
  }
}
```

**Error Responses:**
- `400`: Missing required fields
- `404`: Coupon not found
- `410`: Coupon expired
- `409`: Coupon already redeemed or invalid status
- `429`: Rate limit exceeded

**Example:**
```javascript
const result = await client.coupons.redeem({
  couponCode: 'ABC-123-XYZ',
  customerPhone: '+919876543210',
  customerEmail: 'customer@example.com'
});

if (result.success) {
  alert(`Coupon redeemed! You earned ${result.data.rewards.points_awarded} points`);
}
```

---

### Templates API

#### List Templates

**Endpoint:** `GET /api/mobile/v2/templates`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "template-paint",
      "name": "Paint Product Template",
      "industry": "paint",
      "attributes": [
        {
          "key": "color",
          "name": "Color",
          "type": "string"
        },
        {
          "key": "volume",
          "name": "Volume",
          "type": "number"
        }
      ]
    }
  ]
}
```

---

#### Get Template Attributes

**Endpoint:** `GET /api/mobile/v2/templates/{id}/attributes`

**Response:**
```json
{
  "success": true,
  "data": {
    "template_id": "template-paint",
    "attributes": [
      {
        "key": "color",
        "name": "Color",
        "type": "string",
        "required": true,
        "validation": {
          "min_length": 2,
          "max_length": 50
        }
      },
      {
        "key": "volume",
        "name": "Volume (Liters)",
        "type": "number",
        "required": true,
        "validation": {
          "min": 0.5,
          "max": 20
        }
      }
    ]
  }
}
```

---

## 🔐 Error Handling

### Standard Error Format

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "COUPON_EXPIRED",
    "message": "This coupon expired on 2026-05-25",
    "statusCode": 410,
    "timestamp": "2026-05-31T10:30:00Z",
    "requestId": "req-abc-123"
  }
}
```

### Common Error Codes

| Code | Status | Meaning | Action |
|------|--------|---------|--------|
| `INVALID_CREDENTIALS` | 401 | Bad API key or App ID | Check credentials |
| `COUPON_NOT_FOUND` | 404 | Coupon code doesn't exist | Show error to user |
| `COUPON_EXPIRED` | 410 | Coupon past expiry date | Show expiry message |
| `COUPON_ALREADY_REDEEMED` | 409 | Coupon already used | Suggest new coupon |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Retry after delay |
| `INVALID_REQUEST` | 400 | Missing/invalid fields | Check request format |
| `SERVER_ERROR` | 500 | Server error | Retry or contact support |

### Error Handling Example

```javascript
async function redeemCoupon(code) {
  try {
    const result = await client.coupons.redeem({
      couponCode: code,
      customerPhone: '+919876543210'
    });
    return result;
  } catch (error) {
    switch (error.code) {
      case 'COUPON_NOT_FOUND':
        console.error('Invalid coupon code');
        break;
      case 'COUPON_EXPIRED':
        console.error('Coupon expired:', error.message);
        break;
      case 'COUPON_ALREADY_REDEEMED':
        console.error('Coupon already redeemed');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        console.error('Too many requests, please wait');
        break;
      default:
        console.error('Unknown error:', error.message);
    }
    throw error;
  }
}
```

---

## 🛠️ Using the SDK

### Installation

```bash
npm install @scan4earn/sdk
```

### Basic Usage

```javascript
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.REACT_APP_SCAN4EARN_APP_ID,
  apiKey: process.env.REACT_APP_SCAN4EARN_API_KEY,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
});

export default client;
```

### With React

```javascript
import { useCallback, useState } from 'react';
import client from './scan4earn-client';

export function CouponScanner() {
  const [coupon, setCoupon] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleScan = useCallback(async (couponCode) => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.coupons.scan({ couponCode });
      setCoupon(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <input
        type="text"
        placeholder="Enter coupon code"
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            handleScan(e.target.value);
          }
        }}
      />
      {loading && <p>Scanning...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {coupon && <p>Coupon found: {coupon.product_name}</p>}
    </div>
  );
}
```

### With Next.js

```typescript
// pages/coupons/[code].tsx
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.NEXT_PUBLIC_APP_ID!,
  apiKey: process.env.NEXT_PUBLIC_API_KEY!
});

export async function getServerSideProps(context) {
  const { code } = context.params;

  try {
    const coupon = await client.coupons.scan({ couponCode: code });
    return { props: { coupon: coupon.data } };
  } catch (error) {
    return { notFound: true };
  }
}

export default function CouponPage({ coupon }) {
  return (
    <div>
      <h1>{coupon.product_name}</h1>
      <p>Code: {coupon.coupon_code}</p>
      <p>Status: {coupon.status}</p>
    </div>
  );
}
```

---

## 📊 Rate Limiting

Your API key has rate limits:

- **Mobile API:** 60 requests/minute (default)
- **Ecommerce API:** 120 requests/minute (default)

When you hit the limit, you'll get:

```
HTTP 429 Too Many Requests

X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1622505600
```

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Max 60 requests per minute",
    "retryAfter": 45
  }
}
```

### Handling Rate Limits

```javascript
async function apiCall(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      const waitSeconds = error.retryAfter || 60;
      console.log(`Rate limited. Waiting ${waitSeconds}s...`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      return apiCall(fn); // Retry
    }
    throw error;
  }
}

// Usage
const products = await apiCall(() => client.products.list());
```

---

## 🧪 Testing & Sandbox

### Development Environment

Use sandbox credentials to test without affecting production:

```javascript
const client = new Scan4EarnClient({
  appId: 'sandbox-app-id',
  apiKey: 'sandbox-api-key',
  environment: 'sandbox'
});
```

**Sandbox Features:**
- Test data (fake coupons, products, customers)
- No rate limits (unlimited requests)
- Automatic data cleanup (resets every 24 hours)
- Webhook testing endpoints

### Test Coupons in Sandbox

```
Code: SANDBOX-TEST-001
Status: Valid, ready to scan

Code: SANDBOX-EXPIRED-001
Status: Expired (for testing expiry handling)

Code: SANDBOX-REDEEMED-001
Status: Already redeemed (for testing duplicate handling)
```

---

## 📖 Next Steps

1. **[View Full API Spec](./api/openapi.json)** — OpenAPI specification
2. **[SDK Documentation](./sdk/SDK_README.md)** — Detailed SDK reference
3. **[Starter Template](./examples/starter-template-nextjs/)** — Example Next.js app
4. **[Integration Examples](./examples/)** — React, Vue, vanilla JS examples
5. **[Postman Collection](./postman/)** — Import into Postman for testing

---

## 💬 Support

- **Documentation:** https://docs.scan4earn.com
- **Email:** support@scan4earn.com
- **Status Page:** https://status.scan4earn.com

---

**Last Updated:** 2026-05-31  
**API Version:** 2.0
