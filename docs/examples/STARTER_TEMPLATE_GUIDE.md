# Scan4Earn Starter Template Guide

> Jump-start your verification app integration with pre-built templates

---

## Available Templates

### 1. Next.js Full-Stack App (RECOMMENDED)

**Best for:** Modern web applications, SEO needs, server-side rendering

**GitHub:** https://github.com/scan4earn/starter-nextjs  
**Demo:** https://starter.demo.scan4earn.com

**What's included:**
- ✅ Setup authentication with Scan4Earn SDK
- ✅ Product catalog page
- ✅ QR code scanner
- ✅ Coupon redemption form
- ✅ Rewards dashboard
- ✅ TypeScript support
- ✅ API integration examples
- ✅ Unit & E2E tests
- ✅ Docker setup

**Time to launch:** 15 minutes

---

### 2. React SPA App

**Best for:** Single-page applications, mobile-first design

**GitHub:** https://github.com/scan4earn/starter-react  
**Demo:** https://react-starter.demo.scan4earn.com

**What's included:**
- ✅ React 18 + Vite
- ✅ Redux state management
- ✅ QR scanner component
- ✅ Coupon form
- ✅ Error handling
- ✅ Loading states
- ✅ Jest tests

**Time to launch:** 10 minutes

---

### 3. React Native Mobile App

**Best for:** iOS/Android native applications

**GitHub:** https://github.com/scan4earn/starter-react-native  
**Demo:** Download from Play Store / App Store

**What's included:**
- ✅ React Native setup
- ✅ QR code scanner (react-native-qrcode-scanner)
- ✅ Camera permissions handling
- ✅ Coupon redemption flow
- ✅ Offline support
- ✅ Push notifications

**Time to launch:** 20 minutes (after setting up React Native)

---

### 4. Vue 3 App

**Best for:** Vue.js developers

**GitHub:** https://github.com/scan4earn/starter-vue3  
**Demo:** https://vue-starter.demo.scan4earn.com

**What's included:**
- ✅ Vue 3 Composition API
- ✅ Pinia state management
- ✅ QR scanner component
- ✅ Coupon form with validation
- ✅ Vitest tests

**Time to launch:** 10 minutes

---

## Quick Start: Next.js Template

### Step 1: Clone the Repository

```bash
git clone https://github.com/scan4earn/starter-nextjs.git my-app
cd my-app
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Environment

Create `.env.local`:

```bash
# Copy from template
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Get these from your admin portal
NEXT_PUBLIC_APP_ID=your-app-id-here
NEXT_PUBLIC_API_KEY=your-mobile-api-key-here

# Use sandbox for development
NEXT_PUBLIC_ENVIRONMENT=sandbox

# API Configuration
NEXT_PUBLIC_API_BASE_URL=https://api.scan4earn.com
NEXT_PUBLIC_API_VERSION=v2
```

### Step 4: Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

### Step 5: Start Building

The app includes these pages out of the box:

```
src/app/
├── page.tsx              # Home page
├── products/
│   └── page.tsx         # Product catalog
├── scan/
│   └── page.tsx         # QR code scanner
├── redeem/
│   └── page.tsx         # Coupon redemption form
└── rewards/
    └── page.tsx         # Customer rewards dashboard
```

---

## Project Structure

```
starter-nextjs/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── products/
│   │   ├── scan/
│   │   ├── redeem/
│   │   └── rewards/
│   ├── components/             # Reusable components
│   │   ├── QRScanner.tsx
│   │   ├── ProductCard.tsx
│   │   ├── RedemptionForm.tsx
│   │   └── RewardsChart.tsx
│   ├── lib/                    # Utilities
│   │   ├── scan4earn.ts       # SDK client setup
│   │   ├── validation.ts      # Form validation
│   │   └── formatters.ts      # Number/date formatting
│   ├── hooks/                  # Custom React hooks
│   │   ├── useCoupon.ts
│   │   ├── useProducts.ts
│   │   └── useRewards.ts
│   ├── store/                  # Redux store
│   │   ├── slices/
│   │   │   ├── coupon.ts
│   │   │   ├── products.ts
│   │   │   └── rewards.ts
│   │   └── index.ts
│   └── styles/                 # CSS modules
│       ├── globals.css
│       └── components/
├── __tests__/                  # Test files
│   ├── components/
│   ├── pages/
│   └── lib/
├── docker/
│   └── Dockerfile
├── .env.example
├── next.config.js
├── package.json
├── tsconfig.json
└── README.md
```

---

## Key Components

### QR Scanner Component

```typescript
// src/components/QRScanner.tsx
import { QRScanner } from '@scan4earn/sdk';

export function ScanCoupon() {
  const handleScan = async (code: string) => {
    // API call happens automatically
    // Component handles loading/error states
  };

  return <QRScanner onScan={handleScan} />;
}
```

### Redemption Form

```typescript
// src/components/RedemptionForm.tsx
import { RedeemCoupon } from '@/lib/scan4earn';

export function RedemptionForm() {
  const [phone, setPhone] = useState('');
  const [coupon, setCoupon] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await RedeemCoupon({
      couponCode: coupon,
      customerPhone: phone
    });
    // Handle response
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input value={coupon} onChange={(e) => setCoupon(e.target.value)} />
      <button type="submit">Redeem</button>
    </form>
  );
}
```

---

## Customization

### Add a New Page

```typescript
// src/app/custom-page/page.tsx
import { Scan4EarnClient } from '@scan4earn/sdk';

export default async function CustomPage() {
  const client = new Scan4EarnClient({
    appId: process.env.NEXT_PUBLIC_APP_ID!,
    apiKey: process.env.NEXT_PUBLIC_API_KEY!
  });

  const products = await client.products.list();

  return (
    <div>
      <h1>Custom Page</h1>
      {products.data.map((p) => (
        <div key={p.id}>{p.name}</div>
      ))}
    </div>
  );
}
```

### Add Branding

Edit `src/app/layout.tsx`:

```typescript
export const metadata = {
  title: 'Your Company - Coupon Verification',
  description: 'Scan QR codes to verify and redeem coupons'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <header>
          <img src="/your-logo.png" alt="Your Company" />
        </header>
        {children}
      </body>
    </html>
  );
}
```

### Add Custom Styles

The template uses Tailwind CSS. Customize in `tailwind.config.js`:

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#FF6B35', // Your brand color
        secondary: '#004E89'
      }
    }
  }
};
```

---

## Testing

### Run Tests

```bash
npm test
```

### Write a Test

```typescript
// __tests__/components/RedemptionForm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { RedemptionForm } from '@/components/RedemptionForm';

describe('RedemptionForm', () => {
  it('submits coupon code', async () => {
    render(<RedemptionForm />);
    
    const phoneInput = screen.getByPlaceholderText(/phone/i);
    const couponInput = screen.getByPlaceholderText(/coupon/i);
    const submitButton = screen.getByRole('button', { name: /redeem/i });

    fireEvent.change(phoneInput, { target: { value: '+919876543210' } });
    fireEvent.change(couponInput, { target: { value: 'ABC-123' } });
    fireEvent.click(submitButton);

    await screen.findByText(/success/i);
  });
});
```

---

## Deployment

### Deploy to Vercel (Easiest)

```bash
npm install -g vercel
vercel
```

Follow prompts. Your app is live in minutes!

### Deploy to Docker

```bash
# Build
docker build -f docker/Dockerfile -t my-app .

# Run
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_APP_ID=xxx \
  -e NEXT_PUBLIC_API_KEY=xxx \
  my-app
```

### Deploy to AWS/GCP/Azure

See deployment guides in the template README.

---

## API Integration Examples

### Fetch Products

```typescript
// src/lib/examples/fetch-products.ts
import { Scan4EarnClient } from '@scan4earn/sdk';

const client = new Scan4EarnClient({
  appId: process.env.NEXT_PUBLIC_APP_ID!,
  apiKey: process.env.NEXT_PUBLIC_API_KEY!,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT as 'production' | 'sandbox'
});

export async function getProducts(category?: string) {
  return client.products.list({
    category,
    limit: 50
  });
}
```

### Scan & Redeem Flow

```typescript
// src/lib/examples/coupon-flow.ts
export async function redeemCoupon(
  couponCode: string,
  customerPhone: string
) {
  // Step 1: Scan coupon
  const scanned = await client.coupons.scan({
    couponCode
  });

  if (!scanned.success) {
    throw new Error('Invalid coupon');
  }

  // Step 2: Validate customer
  if (!isValidPhone(customerPhone)) {
    throw new Error('Invalid phone number');
  }

  // Step 3: Redeem
  const result = await client.coupons.redeem({
    couponCode,
    customerPhone
  });

  return result.data;
}
```

---

## Common Customizations

### Use Your Own QR Scanner Library

```typescript
// Instead of built-in QRScanner
import QrReader from 'react-qr-reader';

export function CustomScanner() {
  const handleScan = async (data: string) => {
    const result = await client.coupons.scan({ couponCode: data });
    // Handle result
  };

  return <QrReader onResult={handleScan} />;
}
```

### Add Database Integration

```typescript
// src/lib/db.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function saveRedemption(couponCode: string, customerId: string) {
  const { data, error } = await supabase
    .from('redemptions')
    .insert([{ coupon_code: couponCode, customer_id: customerId }]);
  
  return data;
}
```

### Add Authentication

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ]
};

export const handler = NextAuth(authOptions);
```

---

## Troubleshooting

### "Invalid credentials" Error

1. Check `.env.local` has correct App ID and API Key
2. Ensure they're not swapped
3. Try sandbox API Key first

### QR Scanner Not Working

1. Check camera permissions are granted
2. Ensure HTTPS in production (not HTTP)
3. Test with sandbox coupons first: `SANDBOX-TEST-001`

### Build Failing

1. Run `npm install` again
2. Clear `.next` folder: `rm -rf .next`
3. Restart dev server: `npm run dev`

### Deployment Failing

1. Check all env variables are set
2. Verify API key is still valid
3. Check logs: `vercel logs`

---

## Next Steps

1. ✅ Clone template
2. ✅ Set environment variables
3. ✅ Run `npm run dev`
4. ✅ Test with sandbox API
5. ✅ Customize branding
6. ✅ Add your own features
7. ✅ Deploy to production

---

## Support

- **Template Issues:** https://github.com/scan4earn/starter-nextjs/issues
- **General Help:** https://docs.scan4earn.com
- **Email:** support@scan4earn.com

---

**Last Updated:** 2026-05-31
