# Scan4Earn Integration Examples

Complete working examples for common use cases.

---

## Example 1: Simple QR Code Scanner (React)

**Use Case:** Scan coupon codes at checkout

```typescript
import { useState } from 'react';
import QrScanner from 'qr-scanner';
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.REACT_APP_APP_ID!,
  apiKey: process.env.REACT_APP_API_KEY!
});

export function CheckoutScanner() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleScan = async (code: string) => {
    setScanning(true);
    setError(null);

    try {
      // Step 1: Scan coupon to verify
      const scanned = await client.coupons.scan({
        couponCode: code
      });

      if (!scanned.success) {
        setError('Coupon not found');
        return;
      }

      setResult(scanned.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="scanner-container">
      <QrScanner
        onDecode={(result) => handleScan(result.getText())}
        onError={(error) => setError(error.message)}
        constraints={{ facingMode: 'environment' }}
      />

      {scanning && <p>Verifying...</p>}
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="success">
          <h3>{result.product_name}</h3>
          <p>Code: {result.coupon_code}</p>
          <p>Status: {result.status}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Example 2: Coupon Redemption Form (Next.js)

**Use Case:** Redeem coupon for customer

```typescript
// app/redeem/page.tsx
'use client';

import { FormEvent, useState } from 'react';
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.NEXT_PUBLIC_APP_ID!,
  apiKey: process.env.NEXT_PUBLIC_API_KEY!
});

export default function RedeemPage() {
  const [formData, setFormData] = useState({
    code: '',
    phone: '',
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const result = await client.coupons.redeem({
        couponCode: formData.code,
        customerPhone: formData.phone,
        customerEmail: formData.email
      });

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Redeemed! You earned ${result.data.rewards.points_awarded} points`
        });
        setFormData({ code: '', phone: '', email: '' });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Redeem Coupon</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Coupon Code"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          required
        />
        <input
          type="tel"
          placeholder="+919876543210"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          required
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          {loading ? 'Redeeming...' : 'Redeem'}
        </button>
      </form>

      {message && (
        <div
          className={`mt-4 p-4 rounded ${
            message.type === 'success' ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
```

---

## Example 3: Product Catalog with Search (Vue 3)

**Use Case:** Display products and search

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: import.meta.env.VITE_APP_ID,
  apiKey: import.meta.env.VITE_API_KEY
});

const products = ref([]);
const searchQuery = ref('');
const loading = ref(true);

const filtered = computed(() => {
  if (!searchQuery.value) return products.value;
  return products.value.filter((p: any) =>
    p.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

const loadProducts = async () => {
  try {
    const result = await client.products.list({
      limit: 100
    });
    products.value = result.data;
  } finally {
    loading.value = false;
  }
};

loadProducts();
</script>

<template>
  <div>
    <h1>Product Catalog</h1>

    <input
      v-model="searchQuery"
      type="search"
      placeholder="Search products..."
      class="mb-4"
    />

    <div v-if="loading" class="text-center">
      <p>Loading products...</p>
    </div>

    <div v-else class="grid grid-cols-3 gap-4">
      <div
        v-for="product in filtered"
        :key="product.id"
        class="border rounded p-4"
      >
        <img v-if="product.image_url" :src="product.image_url" />
        <h3>{{ product.name }}</h3>
        <p class="text-gray-600">{{ product.category }}</p>
        <p class="text-xl font-bold">₹{{ product.price }}</p>
      </div>
    </div>

    <p v-if="filtered.length === 0" class="text-center text-gray-500">
      No products found
    </p>
  </div>
</template>
```

---

## Example 4: Rewards Dashboard (React with Redux)

**Use Case:** Show customer rewards and points

```typescript
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Scan4EarnClient } from '@scan4earn/sdk';
import { setRewards } from '@/store/slices/rewards';

const client = new Scan4EarnClient({
  appId: process.env.REACT_APP_APP_ID!,
  apiKey: process.env.REACT_APP_API_KEY!
});

export function RewardsDashboard({ customerId }: { customerId: string }) {
  const dispatch = useDispatch();
  const rewards = useSelector((state: any) => state.rewards);

  useEffect(() => {
    const loadRewards = async () => {
      try {
        // In a real app, you'd have an endpoint to fetch customer rewards
        const result = await client.rewards.getByCustomer(customerId);
        dispatch(setRewards(result.data));
      } catch (error) {
        console.error('Failed to load rewards', error);
      }
    };

    loadRewards();
  }, [customerId, dispatch]);

  return (
    <div className="rewards-dashboard">
      <h1>Your Rewards</h1>

      <div className="stats">
        <div className="stat">
          <p className="label">Total Points</p>
          <p className="value">{rewards.totalPoints}</p>
        </div>

        <div className="stat">
          <p className="label">Cashback Balance</p>
          <p className="value">₹{rewards.cashbackBalance}</p>
        </div>

        <div className="stat">
          <p className="label">Redemptions</p>
          <p className="value">{rewards.redemptionCount}</p>
        </div>
      </div>

      <h2>Recent Transactions</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Product</th>
          </tr>
        </thead>
        <tbody>
          {rewards.transactions?.map((tx: any) => (
            <tr key={tx.id}>
              <td>{new Date(tx.date).toLocaleDateString()}</td>
              <td>{tx.type}</td>
              <td>{tx.type === 'points' ? `${tx.amount} pts` : `₹${tx.amount}`}</td>
              <td>{tx.productName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Example 5: Server-Side Coupon Verification (Next.js API Route)

**Use Case:** Verify coupon on backend before processing payment

```typescript
// pages/api/verify-coupon.ts
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.SCAN4EARN_APP_ID!,
  apiKey: process.env.SCAN4EARN_API_KEY!,
  environment: 'production'
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { couponCode, customerId } = req.body;

  try {
    // Verify coupon exists and is valid
    const coupon = await client.coupons.scan({
      couponCode
    });

    if (!coupon.success) {
      return res.status(400).json({ error: 'Invalid coupon' });
    }

    // Save to database for audit trail
    await db.auditLog.create({
      action: 'COUPON_VERIFIED',
      couponCode,
      customerId,
      timestamp: new Date()
    });

    return res.status(200).json({
      success: true,
      coupon: coupon.data
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to verify coupon',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
```

---

## Example 6: Batch Coupon Processing

**Use Case:** Process multiple coupons in bulk

```typescript
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.SCAN4EARN_APP_ID!,
  apiKey: process.env.SCAN4EARN_API_KEY!
});

export async function processCouponBatch(
  coupons: Array<{ code: string; phone: string }>
) {
  const results = [];

  for (const coupon of coupons) {
    try {
      const result = await client.coupons.redeem({
        couponCode: coupon.code,
        customerPhone: coupon.phone
      });

      results.push({
        code: coupon.code,
        status: 'success',
        points: result.data.rewards.points_awarded
      });
    } catch (error) {
      results.push({
        code: coupon.code,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Rate limit protection - wait between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

// Usage
const results = await processCouponBatch([
  { code: 'ABC-001', phone: '+919876543210' },
  { code: 'ABC-002', phone: '+919876543211' },
  { code: 'ABC-003', phone: '+919876543212' }
]);

console.log(results);
// [
//   { code: 'ABC-001', status: 'success', points: 50 },
//   { code: 'ABC-002', status: 'success', points: 50 },
//   { code: 'ABC-003', status: 'failed', error: 'Coupon expired' }
// ]
```

---

## Example 7: Error Handling Best Practices

**Use Case:** Proper error handling for production apps

```typescript
import {
  Scan4EarnClient,
  CouponNotFoundError,
  CouponExpiredError,
  CouponAlreadyRedeemedError,
  RateLimitError,
  AuthenticationError
} from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.REACT_APP_APP_ID!,
  apiKey: process.env.REACT_APP_API_KEY!
});

export async function redeemCouponWithErrorHandling(
  code: string,
  phone: string
) {
  try {
    return await client.coupons.redeem({
      couponCode: code,
      customerPhone: phone
    });
  } catch (error) {
    // Handle specific error types
    if (error instanceof CouponNotFoundError) {
      return {
        success: false,
        userMessage: 'This coupon code doesn\'t exist',
        code: 'INVALID_CODE'
      };
    }

    if (error instanceof CouponExpiredError) {
      return {
        success: false,
        userMessage: 'This coupon has expired',
        code: 'EXPIRED',
        expiredDate: error.details?.expiredDate
      };
    }

    if (error instanceof CouponAlreadyRedeemedError) {
      return {
        success: false,
        userMessage: 'This coupon has already been used',
        code: 'ALREADY_REDEEMED'
      };
    }

    if (error instanceof RateLimitError) {
      return {
        success: false,
        userMessage: 'Too many requests. Please try again later',
        code: 'RATE_LIMITED',
        retryAfter: error.retryAfter
      };
    }

    if (error instanceof AuthenticationError) {
      // Log this - indicates configuration issue
      console.error('Authentication failed', error);
      return {
        success: false,
        userMessage: 'Service temporarily unavailable',
        code: 'SERVICE_ERROR'
      };
    }

    // Generic error
    return {
      success: false,
      userMessage: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      details: error instanceof Error ? error.message : 'Unknown'
    };
  }
}
```

---

## Example 8: Caching for Better Performance

**Use Case:** Cache frequently accessed data

```typescript
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.REACT_APP_APP_ID!,
  apiKey: process.env.REACT_APP_API_KEY!,
  cache: {
    products: 300, // Cache products for 5 minutes
    templates: 3600 // Cache templates for 1 hour
  }
});

// First call - hits API
const products1 = await client.products.list();

// Second call within 5 minutes - served from cache
const products2 = await client.products.list();

// Manual cache clearing
client.cache.clear('products');

// Get cache statistics
console.log(client.cache.stats());
// { hits: 10, misses: 2, size: '1.2MB' }
```

---

## Example 9: Webhook Integration

**Use Case:** Handle webhook events from Scan4Earn

```typescript
// pages/api/webhooks/coupon.ts
import { verify } from '@scan4earn/sdk/verify';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['x-webhook-signature'] as string;
  const body = JSON.stringify(req.body);
  const secret = process.env.SCAN4EARN_WEBHOOK_SECRET!;

  // Verify webhook authenticity
  if (!verify(body, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, data } = req.body;

  try {
    switch (event) {
      case 'coupon.scanned':
        await handleCouponScanned(data);
        break;

      case 'coupon.redeemed':
        await handleCouponRedeemed(data);
        break;

      case 'reward.awarded':
        await handleRewardAwarded(data);
        break;

      default:
        console.log('Unknown event:', event);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing failed', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
}

async function handleCouponScanned(data: any) {
  // Log the scan
  await db.scans.create({
    couponCode: data.coupon_code,
    scannedAt: new Date(data.timestamp)
  });
}

async function handleCouponRedeemed(data: any) {
  // Update order status
  await db.orders.update(
    { couponCode: data.coupon_code },
    { status: 'REDEEMED', redeemedAt: new Date() }
  );
}

async function handleRewardAwarded(data: any) {
  // Send notification
  await notify.email({
    to: data.customer_email,
    subject: 'You earned points!',
    body: `You earned ${data.points} points`
  });
}
```

---

## More Examples

- **Mobile App (React Native):** https://github.com/scan4earn/example-react-native
- **E-Commerce Integration (WooCommerce):** https://github.com/scan4earn/plugin-woocommerce
- **Admin Dashboard (Vue):** https://github.com/scan4earn/example-admin-dashboard
- **CLI Tool:** https://github.com/scan4earn/cli-tool

---

**Last Updated:** 2026-05-31
