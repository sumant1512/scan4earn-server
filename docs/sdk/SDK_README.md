# Scan4Earn JavaScript SDK

Official JavaScript/TypeScript SDK for integrating Scan4Earn APIs into your frontend applications.

**NPM:** https://www.npmjs.com/package/@scan4earn/sdk  
**GitHub:** https://github.com/scan4earn/sdk-javascript

---

## Installation

```bash
npm install @scan4earn/sdk
```

or with yarn:

```bash
yarn add @scan4earn/sdk
```

---

## Quick Start

### 1. Initialize Client

```javascript
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: 'your-app-id',
  apiKey: 'your-mobile-api-key',
  environment: 'production'
});
```

### 2. Get Your Credentials

Login to your tenant admin portal at `https://your-tenant.scan4earn.com`:

1. Go to **Verification Apps**
2. Click on your app
3. Find **API Credentials** section
4. Copy:
   - **App ID** (UUID format)
   - **Mobile API Key** (starts with `mobile_`)
   - **Sandbox API Key** (starts with `sandbox_`)

### 3. Start Using

```javascript
// List products
const products = await client.products.list();

// Scan coupon
const coupon = await client.coupons.scan({
  couponCode: 'ABC-123-XYZ'
});

// Redeem coupon
const result = await client.coupons.redeem({
  couponCode: 'ABC-123-XYZ',
  customerPhone: '+919876543210'
});
```

---

## Configuration

### Basic Configuration

```javascript
const client = new Scan4EarnClient({
  appId: 'app-uuid',
  apiKey: 'mobile_key_xxx',
  environment: 'production' // or 'sandbox'
});
```

### Advanced Configuration

```javascript
const client = new Scan4EarnClient({
  appId: 'app-uuid',
  apiKey: 'mobile_key_xxx',
  environment: 'production',
  
  // Optional: Custom API base URL
  baseUrl: 'https://api.scan4earn.com',
  
  // Optional: Request timeout (ms)
  timeout: 30000,
  
  // Optional: Retry failed requests
  retries: 3,
  retryDelay: 1000,
  
  // Optional: Custom headers
  headers: {
    'X-Custom-Header': 'value'
  },
  
  // Optional: Request interceptor
  onBeforeRequest: (config) => {
    console.log('Request:', config);
    return config;
  },
  
  // Optional: Response interceptor
  onAfterResponse: (response) => {
    console.log('Response:', response);
    return response;
  }
});
```

---

## API Methods

### Products

#### `list(options?)`

List all products.

```javascript
const products = await client.products.list({
  limit: 50,
  offset: 0,
  category: 'Paint',
  search: 'Premium'
});

// Returns:
// {
//   success: true,
//   data: [
//     {
//       id: 'prod-123',
//       name: 'Premium Paint - White',
//       category: 'Paint',
//       price: 500,
//       image_url: '...',
//       attributes: { color: 'White', volume: '1L' }
//     }
//   ],
//   pagination: { total: 150, page: 1, limit: 50 }
// }
```

**Options:**
- `limit` (number): Results per page (default: 50, max: 1000)
- `offset` (number): Pagination offset (default: 0)
- `category` (string): Filter by category
- `search` (string): Search by product name

---

#### `get(productId)`

Get a single product by ID.

```javascript
const product = await client.products.get('prod-123');

// Returns:
// {
//   success: true,
//   data: {
//     id: 'prod-123',
//     name: 'Premium Paint - White',
//     category: 'Paint',
//     price: 500,
//     description: 'High-quality interior paint',
//     image_url: '...',
//     attributes: { ... },
//     inventory: { in_stock: 450, low_stock_threshold: 50 }
//   }
// }
```

**Parameters:**
- `productId` (string): Product ID

---

### Coupons

#### `scan(options)`

Scan a coupon code.

```javascript
const coupon = await client.coupons.scan({
  couponCode: 'ABC-123-XYZ',
  timestamp: new Date() // optional
});

// Returns:
// {
//   success: true,
//   data: {
//     coupon_id: 'coupon-456',
//     coupon_code: 'ABC-123-XYZ',
//     status: 'scanned',
//     product_name: 'Premium Paint - White',
//     scan_timestamp: '2026-05-31T10:30:00Z'
//   }
// }
```

**Parameters:**
- `couponCode` (string): Coupon code to scan (required)
- `timestamp` (Date): Scan timestamp (optional, defaults to now)

**Throws:**
- `CouponNotFoundError`: Coupon doesn't exist
- `CouponExpiredError`: Coupon past expiry date
- `InvalidCouponFormatError`: Invalid coupon code format

---

#### `redeem(options)`

Redeem a coupon for a customer.

```javascript
const result = await client.coupons.redeem({
  couponCode: 'ABC-123-XYZ',
  customerPhone: '+919876543210',
  customerEmail: 'customer@example.com' // optional
});

// Returns:
// {
//   success: true,
//   data: {
//     coupon_code: 'ABC-123-XYZ',
//     status: 'redeemed',
//     redemption_timestamp: '2026-05-31T10:35:00Z',
//     rewards: {
//       points_awarded: 50,
//       cashback_amount: 100,
//       points_total: 250
//     }
//   }
// }
```

**Parameters:**
- `couponCode` (string): Coupon code to redeem (required)
- `customerPhone` (string): Customer phone in E.164 format (required)
- `customerEmail` (string): Customer email (optional)

**Throws:**
- `CouponNotFoundError`: Coupon doesn't exist
- `CouponExpiredError`: Coupon expired
- `CouponAlreadyRedeemedError`: Coupon already redeemed
- `InvalidPhoneFormatError`: Invalid phone number format

---

### Templates

#### `listTemplates()`

List all product templates.

```javascript
const templates = await client.templates.list();

// Returns:
// {
//   success: true,
//   data: [
//     {
//       id: 'template-paint',
//       name: 'Paint Product Template',
//       industry: 'paint',
//       attributes: [ ... ]
//     }
//   ]
// }
```

---

#### `getTemplateAttributes(templateId)`

Get attributes for a template.

```javascript
const attributes = await client.templates.getAttributes('template-paint');

// Returns:
// {
//   success: true,
//   data: {
//     template_id: 'template-paint',
//     attributes: [
//       {
//         key: 'color',
//         name: 'Color',
//         type: 'string',
//         required: true,
//         validation: { min_length: 2, max_length: 50 }
//       },
//       {
//         key: 'volume',
//         name: 'Volume (Liters)',
//         type: 'number',
//         required: true,
//         validation: { min: 0.5, max: 20 }
//       }
//     ]
//   }
// }
```

---

## Error Handling

### Error Types

The SDK throws typed errors:

```javascript
import {
  Scan4EarnError,
  CouponNotFoundError,
  CouponExpiredError,
  CouponAlreadyRedeemedError,
  InvalidPhoneFormatError,
  RateLimitError,
  AuthenticationError,
  ValidationError
} from '@scan4earn/sdk';
```

### Handling Errors

```javascript
import { CouponNotFoundError, CouponExpiredError } from '@scan4earn/sdk';

async function redeemCoupon(code) {
  try {
    const result = await client.coupons.redeem({
      couponCode: code,
      customerPhone: '+919876543210'
    });
    console.log('Redeemed!', result);
  } catch (error) {
    if (error instanceof CouponNotFoundError) {
      console.error('Invalid coupon code');
    } else if (error instanceof CouponExpiredError) {
      console.error('Coupon expired:', error.message);
    } else if (error instanceof CouponAlreadyRedeemedError) {
      console.error('Coupon already redeemed');
    } else {
      console.error('Unknown error:', error.message);
    }
  }
}
```

### Error Properties

```javascript
try {
  await client.coupons.redeem(options);
} catch (error) {
  console.log(error.code);        // 'COUPON_NOT_FOUND'
  console.log(error.message);     // 'Coupon not found'
  console.log(error.statusCode);  // 404
  console.log(error.details);     // Additional error details
}
```

---

## TypeScript Support

The SDK is fully typed:

```typescript
import { Scan4EarnClient, CouponRedeemResponse } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: 'app-uuid',
  apiKey: 'api-key'
});

// Fully typed response
const result: CouponRedeemResponse = await client.coupons.redeem({
  couponCode: 'ABC-123',
  customerPhone: '+919876543210'
});

// Access properties with type safety
const points: number = result.data.rewards.points_awarded;
```

---

## Framework Examples

### React

```typescript
import { useCallback, useState } from 'react';
import { Scan4EarnClient, CouponNotFoundError } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.REACT_APP_APP_ID!,
  apiKey: process.env.REACT_APP_API_KEY!
});

export function CouponScanner() {
  const [coupon, setCoupon] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.coupons.scan({ couponCode: code });
      setCoupon(result.data);
    } catch (err) {
      if (err instanceof CouponNotFoundError) {
        setError('Invalid coupon code');
      } else {
        setError('An error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <input
        type="text"
        placeholder="Scan coupon"
        onKeyPress={(e) => {
          if (e.key === 'Enter' && e.currentTarget.value) {
            handleScan(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
      />
      {loading && <p>Scanning...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {coupon && <p>Found: {coupon.product_name}</p>}
    </div>
  );
}
```

### Next.js (App Router)

```typescript
'use client';

import { Scan4EarnClient } from '@scan4earn/sdk';
import { useCallback, useState } from 'react';

const client = new Scan4EarnClient({
  appId: process.env.NEXT_PUBLIC_APP_ID!,
  apiKey: process.env.NEXT_PUBLIC_API_KEY!,
  environment: 'production'
});

export function CouponForm() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async (formData: FormData) => {
    setIsLoading(true);
    try {
      const phone = formData.get('phone') as string;
      const code = formData.get('code') as string;

      const result = await client.coupons.redeem({
        couponCode: code,
        customerPhone: phone
      });

      if (result.success) {
        alert(`Success! Points earned: ${result.data.rewards.points_awarded}`);
      }
    } catch (error) {
      alert('Error: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <form action={handleSubmit}>
      <input name="code" placeholder="Coupon code" required />
      <input name="phone" placeholder="+919876543210" required />
      <button disabled={isLoading}>{isLoading ? 'Redeeming...' : 'Redeem'}</button>
    </form>
  );
}
```

### Vue 3

```typescript
<script setup lang="ts">
import { ref } from 'vue';
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: import.meta.env.VITE_APP_ID,
  apiKey: import.meta.env.VITE_API_KEY
});

const code = ref('');
const loading = ref(false);
const coupon = ref(null);

const handleScan = async () => {
  loading.value = true;
  try {
    const result = await client.coupons.scan({ couponCode: code.value });
    coupon.value = result.data;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div>
    <input v-model="code" @keyup.enter="handleScan" />
    <button @click="handleScan" :disabled="loading">
      {{ loading ? 'Scanning...' : 'Scan' }}
    </button>
    <div v-if="coupon">Found: {{ coupon.product_name }}</div>
  </div>
</template>
```

---

## Caching

The SDK has built-in caching for frequently accessed data:

```javascript
const client = new Scan4EarnClient({
  appId: 'app-uuid',
  apiKey: 'api-key',
  
  // Cache configuration
  cache: {
    products: 300, // Cache products for 5 minutes
    templates: 3600, // Cache templates for 1 hour
    enabled: true
  }
});

// Clear specific cache
client.cache.clear('products');

// Clear all cache
client.cache.clear();

// Get cache stats
console.log(client.cache.stats());
```

---

## Rate Limiting

The SDK handles rate limiting automatically:

```javascript
const client = new Scan4EarnClient({
  appId: 'app-uuid',
  apiKey: 'api-key',
  
  // Auto-retry on rate limit
  autoRetryOnRateLimit: true,
  maxRetries: 3
});

// Listen to rate limit events
client.on('rateLimited', (event) => {
  console.log(`Rate limited. Retry after ${event.retryAfter}s`);
});
```

---

## Logging

Enable debug logging:

```javascript
const client = new Scan4EarnClient({
  appId: 'app-uuid',
  apiKey: 'api-key',
  debug: true // Enable verbose logging
});

// Or configure logging level
client.setLogLevel('debug'); // 'debug', 'info', 'warn', 'error'
```

---

## Testing

### Unit Tests (Jest)

```typescript
import { Scan4EarnClient } from '@scan4earn/sdk';

describe('CouponScanner', () => {
  let client: Scan4EarnClient;

  beforeEach(() => {
    client = new Scan4EarnClient({
      appId: 'test-app',
      apiKey: 'test-key',
      environment: 'sandbox'
    });
  });

  it('should scan coupon', async () => {
    const result = await client.coupons.scan({
      couponCode: 'SANDBOX-TEST-001'
    });
    expect(result.success).toBe(true);
    expect(result.data.coupon_code).toBe('SANDBOX-TEST-001');
  });

  it('should throw on invalid coupon', async () => {
    await expect(
      client.coupons.scan({ couponCode: 'INVALID' })
    ).rejects.toThrow('Coupon not found');
  });
});
```

---

## Best Practices

1. **Store credentials securely** — Use environment variables, never hardcode
   ```javascript
   const client = new Scan4EarnClient({
     appId: process.env.REACT_APP_APP_ID,
     apiKey: process.env.REACT_APP_API_KEY
   });
   ```

2. **Use TypeScript** — Catches errors at compile time
   ```typescript
   const result: CouponRedeemResponse = await client.coupons.redeem(...);
   ```

3. **Handle errors gracefully** — Always use try-catch
   ```javascript
   try {
     await client.coupons.redeem(options);
   } catch (error) {
     // Handle error
   }
   ```

4. **Cache when appropriate** — Reduce API calls
   ```javascript
   const products = await client.products.list(); // Cached
   ```

5. **Monitor rate limits** — Implement backoff
   ```javascript
   client.on('rateLimited', handleRateLimit);
   ```

---

## Troubleshooting

### "Invalid credentials" error

- Verify App ID and API Key are correct
- Ensure API Key hasn't expired
- Check if API is enabled in admin portal

### "Rate limit exceeded" error

- Wait for the suggested retry duration
- Reduce request frequency
- Consider upgrading your plan

### "Coupon not found" error

- Verify coupon code spelling
- Check if coupon is active (not expired/pending)
- Ensure coupon belongs to your verification app

### Requests timing out

- Increase timeout in config: `timeout: 60000`
- Check network connectivity
- Try again in a few moments

---

## Support

- **Documentation:** https://docs.scan4earn.com
- **Issues:** https://github.com/scan4earn/sdk-javascript/issues
- **Email:** support@scan4earn.com
- **Discord:** https://discord.gg/scan4earn

---

**Last Updated:** 2026-05-31  
**SDK Version:** 1.0.0  
**API Version:** 2.0
