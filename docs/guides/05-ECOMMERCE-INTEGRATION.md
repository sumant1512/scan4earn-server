# E-Commerce Integration Guide

Complete guide for integrating Scan4Earn rewards into your e-commerce platform.

## Overview

Enable your e-commerce customers to earn and redeem rewards without leaving your platform. Scan4Earn provides:

- Coupon management and distribution
- Points/cashback tracking per customer
- Real-time reward verification
- Redemption handling
- Transaction reporting

## Getting Started

### 1. Create Integration Request

Contact your Scan4Earn account manager to:
- Create a **Verification App** in your tenant dashboard
- Assign your e-commerce platform as an **External App**
- Generate API credentials (app_id + api_key)

### 2. Store Credentials Securely

```bash
# In your backend .env file
SCAN4EARN_APP_ID=your-app-uuid-here
SCAN4EARN_API_KEY=your-generated-api-key-here
SCAN4EARN_API_BASE=https://api.sumukham.scan4earn.com
SCAN4EARN_TENANT_SLUG=sumukham
```

### 3. Add to Your Backend

```javascript
// ecommerce-api-client.js
const axios = require('axios');

const scanEarnClient = axios.create({
  baseURL: process.env.SCAN4EARN_API_BASE,
  timeout: 10000
});

// Add authentication interceptor
scanEarnClient.interceptors.request.use((config) => {
  config.headers['Authorization'] = `Bearer ${process.env.SCAN4EARN_API_KEY}`;
  config.headers['X-App-Id'] = process.env.SCAN4EARN_APP_ID;
  config.headers['X-Tenant-Slug'] = process.env.SCAN4EARN_TENANT_SLUG;
  return config;
});

module.exports = scanEarnClient;
```

## API Reference

### Authentication

All requests require:

```
Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  X-Tenant-Slug: {tenant_slug}
  Content-Type: application/json
```

**Note:** No customer authentication needed - requests are app-to-app.

### 1. Product Catalog

#### Get Products

```javascript
GET /api/mobile/v2/products

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  X-Tenant-Slug: sumukham

Query Parameters:
  ?page=1              // Pagination
  &limit=50            // Items per page
  &category_id=uuid    // Filter by category
  &search=text         // Search products

Response (200 OK):
{
  "status": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Product Name",
        "description": "Product description",
        "category": {
          "id": "uuid",
          "name": "Category Name"
        },
        "reward_type": "points",  // points | cashback | both
        "reward_value": 100,
        "price": 1000,           // in rupees
        "stock": 50,
        "image_url": "https://...",
        "attributes": {
          "color": "red",
          "size": "M"
        }
      }
    ],
    "pagination": {
      "total": 500,
      "page": 1,
      "limit": 50
    }
  }
}
```

#### Get Product Details

```javascript
GET /api/mobile/v2/products/{productId}

Response:
{
  "status": true,
  "data": {
    "id": "uuid",
    "name": "T-Shirt",
    "description": "Cotton T-Shirt",
    "category": {
      "id": "uuid",
      "name": "Clothing"
    },
    "reward": {
      "type": "points",
      "value": 100,
      "description": "Earn 100 points on purchase"
    },
    "pricing": {
      "base_price": 500,
      "discount_percent": 10,
      "final_price": 450,
      "currency": "INR"
    },
    "stock": 50,
    "images": ["https://...", "https://..."],
    "attributes": {
      "colors": ["red", "blue", "green"],
      "sizes": ["S", "M", "L", "XL"]
    },
    "tags": ["summer", "casual"],
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

### 2. Customer Verification

Before awarding rewards, verify customer and check balance:

#### Verify Customer Phone

```javascript
POST /api/ecommerce/v1/customers/verify

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "phone_e164": "+919876543210",  // E.164 format (required)
  "email": "customer@example.com",  // Optional
  "name": "John Doe"               // Optional
}

Response (200 OK):
{
  "status": true,
  "customer": {
    "id": "uuid",
    "phone_e164": "+919876543210",
    "email": "customer@example.com",
    "name": "John Doe",
    "exists": true,
    "verified": true
  }
}

// If customer doesn't exist:
Response (201 Created):
{
  "status": true,
  "message": "New customer created",
  "customer": {
    "id": "uuid",
    "phone_e164": "+919876543210",
    "exists": false,
    "created": true
  }
}
```

#### Get Customer Balance

```javascript
GET /api/ecommerce/v1/customers/{customerId}/balance

OR using phone:

GET /api/ecommerce/v1/customers/phone/{phone_e164}/balance

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}

Response (200 OK):
{
  "status": true,
  "data": {
    "customer_id": "uuid",
    "phone_e164": "+919876543210",
    "balance": {
      "points": {
        "total": 5000,
        "active": 3500,
        "redeemed": 1500,
        "expired": 0
      },
      "cashback": {
        "total": 500.00,    // rupees
        "active": 250.00,
        "redeemed": 200.00,
        "pending": 50.00
      }
    },
    "last_transaction": "2026-05-30T15:45:00Z"
  }
}
```

### 3. Award Rewards

Award points/cashback when customer makes a purchase:

#### Award Points

```javascript
POST /api/ecommerce/v1/rewards/award

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "customer_phone": "+919876543210",
  "reward_type": "points",
  "reward_value": 100,
  "order_id": "ORD123456",      // Your order reference
  "product_id": "uuid",          // Optional: which product earned this
  "description": "Purchase reward",
  "metadata": {
    "product_name": "T-Shirt",
    "amount": 500,
    "discount_applied": true
  }
}

Response (201 Created):
{
  "status": true,
  "message": "Reward awarded successfully",
  "reward": {
    "id": "uuid",
    "customer_phone": "+919876543210",
    "type": "points",
    "value": 100,
    "status": "active",
    "order_id": "ORD123456",
    "awarded_at": "2026-05-31T10:30:00Z",
    "expiry_date": "2026-08-31",
    "new_balance": 3600
  }
}
```

#### Award Cashback

```javascript
POST /api/ecommerce/v1/rewards/cashback

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "customer_phone": "+919876543210",
  "cashback_amount": 50.00,      // in rupees
  "order_id": "ORD123456",
  "order_amount": 500,           // original purchase amount
  "cashback_percentage": 10,
  "description": "10% cashback on purchase"
}

Response (201 Created):
{
  "status": true,
  "message": "Cashback awarded",
  "reward": {
    "id": "uuid",
    "type": "cashback",
    "amount": 50.00,
    "currency": "INR",
    "status": "active",
    "order_id": "ORD123456",
    "awarded_at": "2026-05-31T10:30:00Z",
    "new_balance": 300.00
  }
}
```

### 4. Create Coupons

Generate and distribute coupons to customers:

#### Create Coupon

```javascript
POST /api/ecommerce/v1/coupons

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "coupon_code": "SUMMER2026",          // Unique code
  "description": "Summer Sale Offer",
  "reward_type": "points",              // points | cashback | product
  "reward_value": 100,
  "expiry_date": "2026-06-30T23:59:59Z",
  "usage_limit": 100,                   // How many times can be used
  "batch_size": 50,                     // For batch generation
  "terms": "Valid for existing customers",
  "metadata": {
    "campaign": "summer_sale_2026",
    "channel": "ecommerce"
  }
}

Response (201 Created):
{
  "status": true,
  "message": "Coupon created successfully",
  "coupon": {
    "id": "uuid",
    "coupon_code": "SUMMER2026",
    "reward_type": "points",
    "reward_value": 100,
    "expiry_date": "2026-06-30T23:59:59Z",
    "status": "active",
    "total_available": 50,
    "total_redeemed": 0,
    "created_at": "2026-05-31T10:30:00Z"
  }
}
```

#### Batch Create Coupons

```javascript
POST /api/ecommerce/v1/coupons/batch

Body:
{
  "batch_name": "Summer Campaign 2026",
  "coupon_template": {
    "description": "Summer Sale",
    "reward_type": "points",
    "reward_value": 100,
    "expiry_date": "2026-06-30T23:59:59Z"
  },
  "count": 1000,  // Generate 1000 unique codes
  "prefix": "SUMMER"  // SUMMER001, SUMMER002, etc.
}

Response (201 Created):
{
  "status": true,
  "message": "Batch created",
  "batch": {
    "id": "uuid",
    "name": "Summer Campaign 2026",
    "coupons_count": 1000,
    "status": "generated",
    "download_url": "https://api.../coupons/batch/uuid/download",
    "created_at": "2026-05-31T10:30:00Z"
  }
}
```

### 5. Redemption & Checkout Integration

#### Apply Coupon at Checkout

```javascript
POST /api/ecommerce/v1/checkout/apply-coupon

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "coupon_code": "SUMMER2026",
  "customer_phone": "+919876543210",
  "order_total": 5000  // in rupees
}

Response (200 OK):
{
  "status": true,
  "coupon": {
    "id": "uuid",
    "coupon_code": "SUMMER2026",
    "reward_type": "points",
    "reward_value": 100,
    "applicable": true,
    "reason": null
  },
  "checkout": {
    "order_total": 5000,
    "reward_applied": 100,
    "final_total": 5000  // Points don't reduce total, just awarded
  }
}
```

#### Apply Points/Cashback at Checkout

```javascript
POST /api/ecommerce/v1/checkout/redeem-points

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "customer_phone": "+919876543210",
  "redemption_type": "points",    // points | cashback
  "amount": 500,                   // points or rupees
  "order_id": "ORD123456"
}

Response (200 OK):
{
  "status": true,
  "message": "Redemption applied",
  "redemption": {
    "id": "uuid",
    "type": "points",
    "amount": 500,
    "discount_amount": 50,        // 500 points = ₹50 (1 point = ₹0.1)
    "order_id": "ORD123456"
  },
  "checkout": {
    "order_total": 5000,
    "discount": 50,
    "final_total": 4950
  }
}
```

### 6. Order Fulfillment Webhooks

Notify Scan4Earn when order is completed/cancelled:

#### Mark Order as Completed

```javascript
POST /api/ecommerce/v1/orders/complete

Headers:
  Authorization: Bearer {api_key}
  X-App-Id: {app_uuid}
  Content-Type: application/json

Body:
{
  "order_id": "ORD123456",
  "customer_phone": "+919876543210",
  "order_amount": 5000,
  "items": [
    {
      "product_id": "uuid",
      "name": "T-Shirt",
      "quantity": 2,
      "price": 450
    }
  ],
  "rewards_to_award": [
    {
      "type": "points",
      "value": 100
    },
    {
      "type": "cashback",
      "value": 50
    }
  ],
  "completed_at": "2026-05-31T10:30:00Z"
}

Response (200 OK):
{
  "status": true,
  "message": "Order marked as complete",
  "order": {
    "id": "uuid",
    "order_id": "ORD123456",
    "status": "completed",
    "rewards_awarded": [
      {
        "type": "points",
        "value": 100
      }
    ],
    "completed_at": "2026-05-31T10:30:00Z"
  }
}
```

#### Mark Order as Cancelled

```javascript
POST /api/ecommerce/v1/orders/cancel

Body:
{
  "order_id": "ORD123456",
  "customer_phone": "+919876543210",
  "reason": "Customer requested cancellation",
  "reverse_rewards": true
}

Response (200 OK):
{
  "status": true,
  "message": "Order cancelled",
  "order": {
    "order_id": "ORD123456",
    "status": "cancelled",
    "rewards_reversed": [
      {
        "type": "points",
        "value": 100,
        "reason": "Order cancelled"
      }
    ]
  }
}
```

## Integration Workflow

### Standard Purchase Flow

```
1. Customer adds product to cart
   ↓
2. At checkout, fetch customer balance
   GET /api/ecommerce/v1/customers/phone/{phone}/balance
   ↓
3. Show available rewards
   - Points: 3500 available
   - Cashback: ₹250 available
   ↓
4. Customer enters coupon code (optional)
   POST /api/ecommerce/v1/checkout/apply-coupon
   ↓
5. Customer chooses to redeem points/cashback (optional)
   POST /api/ecommerce/v1/checkout/redeem-points
   ↓
6. Calculate final order total with reductions
   ↓
7. Process payment
   ↓
8. On successful payment, award rewards
   POST /api/ecommerce/v1/rewards/award
   ↓
9. Mark order as complete
   POST /api/ecommerce/v1/orders/complete
```

## Code Example

```javascript
// ecommerce-checkout.js
const scanEarnClient = require('./ecommerce-api-client');

class CheckoutService {
  async getCustomerBalance(phone) {
    try {
      const response = await scanEarnClient.get(
        `/api/ecommerce/v1/customers/phone/${phone}/balance`
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return null;
    }
  }

  async applyCoupon(coupon_code, phone, order_total) {
    try {
      const response = await scanEarnClient.post(
        '/api/ecommerce/v1/checkout/apply-coupon',
        {
          coupon_code,
          customer_phone: phone,
          order_total
        }
      );
      return response.data;
    } catch (error) {
      return { status: false, error: error.response?.data?.message };
    }
  }

  async redeemPoints(phone, amount, order_id) {
    try {
      const response = await scanEarnClient.post(
        '/api/ecommerce/v1/checkout/redeem-points',
        {
          customer_phone: phone,
          redemption_type: 'points',
          amount,
          order_id
        }
      );
      return response.data;
    } catch (error) {
      return { status: false, error: error.response?.data?.message };
    }
  }

  async completeOrder(order) {
    try {
      const response = await scanEarnClient.post(
        '/api/ecommerce/v1/orders/complete',
        {
          order_id: order.id,
          customer_phone: order.customer_phone,
          order_amount: order.total,
          items: order.items,
          rewards_to_award: order.rewards,
          completed_at: new Date().toISOString()
        }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to complete order:', error);
      // Store for retry
      return { status: false, error: error.message };
    }
  }

  async awardReward(phone, reward_type, value, order_id) {
    try {
      const response = await scanEarnClient.post(
        '/api/ecommerce/v1/rewards/award',
        {
          customer_phone: phone,
          reward_type,
          reward_value: value,
          order_id,
          description: `${reward_type} award on order ${order_id}`
        }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to award reward:', error);
      throw error;
    }
  }
}

module.exports = new CheckoutService();
```

## Error Handling

```javascript
// Common error scenarios
const handleEcommerceError = (error) => {
  if (error.response?.status === 400) {
    // Validation error
    return {
      user_message: "Invalid input",
      code: error.response.data.code
    };
  }
  
  if (error.response?.status === 401) {
    // Auth error - check credentials
    return {
      user_message: "Integration issue - contact support",
      code: "INTEGRATION_ERROR"
    };
  }
  
  if (error.response?.status === 404) {
    // Customer/coupon not found
    return {
      user_message: "Coupon invalid or customer not found",
      code: "NOT_FOUND"
    };
  }
  
  if (error.response?.status === 429) {
    // Rate limited
    return {
      user_message: "Too many requests - please try again",
      code: "RATE_LIMIT"
    };
  }
  
  // Network error
  return {
    user_message: "Network error - rewards temporarily unavailable",
    code: "NETWORK_ERROR"
  };
};
```

## Webhook Events

Scan4Earn can notify your platform of important events:

```javascript
// POST /your-platform/webhooks/scan4earn

// Event: Customer redeemed reward
{
  "event": "reward.redeemed",
  "timestamp": "2026-05-31T10:30:00Z",
  "data": {
    "customer_phone": "+919876543210",
    "reward_id": "uuid",
    "type": "points",
    "value": 1000,
    "reason": "Redeemed for cashback",
    "balance_remaining": 2500
  }
}

// Event: Coupon scanned
{
  "event": "coupon.scanned",
  "timestamp": "2026-05-31T10:30:00Z",
  "data": {
    "coupon_code": "SUMMER2026",
    "customer_phone": "+919876543210",
    "reward_awarded": {
      "type": "points",
      "value": 100
    }
  }
}
```

## Best Practices

1. **Validate Credentials:** Always verify API key and app_id before making calls
2. **Handle Network Failures:** Implement retry logic with exponential backoff
3. **Cache Data:** Cache customer balance for 5 minutes to reduce API calls
4. **Monitor Rate Limits:** Check X-RateLimit headers and back off if needed
5. **Log Transactions:** Keep detailed logs of all reward awards for reconciliation
6. **Test Integration:** Use sandbox credentials before going live
7. **Customer Communication:** Clearly show reward earn/redeem in your UI

## Support

- [API Reference](../api/05-ECOMMERCE-API.md)
- [Troubleshooting](08-TROUBLESHOOTING.md)
- [FAQ](09-FAQ.md)
- Contact: integration-support@scan4earn.com
