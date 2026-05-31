# Frequently Asked Questions (FAQ)

Quick answers to common questions.

## General Questions

### What is Scan4Earn?

Scan4Earn is a multi-tenant loyalty and rewards platform that enables businesses to:
- Create QR codes with embedded coupons and rewards
- Distribute to customers via mobile app
- Track earning and redemption of points/cashback
- Integrate with e-commerce platforms

### Who should use Scan4Earn?

- **Retailers & Brands:** Create loyalty programs and customer engagement
- **E-commerce Platforms:** Add rewards functionality to your marketplace
- **Developers:** Build on top of the Scan4Earn API
- **Operations Teams:** Manage campaigns and customer rewards

### How does it work?

1. Tenant creates QR codes with embedded coupons
2. Customers scan QR codes using mobile app
3. Customers earn points/cashback
4. Customers redeem rewards for discounts/products
5. E-commerce platforms track customer transactions

## Technical Questions

### What tech stack is used?

- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL
- **Authentication:** JWT + API Keys
- **Deployment:** Docker + Google Cloud Run
- **Testing:** Jest + Supertest

### How do I get started?

1. Follow [Quick Start Guide](01-QUICK-START.md)
2. Complete [Project Setup](02-PROJECT-SETUP.md)
3. Review [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)
4. Read [API Overview](../api/01-API-OVERVIEW.md)

### How is data isolated between tenants?

- Each tenant has a unique subdomain
- Subdomain is extracted from request URL/header
- All queries filtered by tenant_id
- Database-level constraints ensure isolation

### Can I run this locally?

Yes! The entire stack runs locally:

```bash
npm install
npm run dev
# Server runs at http://localhost:8080
```

See [Project Setup](02-PROJECT-SETUP.md) for details.

### What database do I need?

PostgreSQL 12+. You can:
- Install locally: `brew install postgresql`
- Use Docker: `docker run -d -e POSTGRES_PASSWORD=password postgres`
- Use managed service: Google Cloud SQL, AWS RDS

## Integration Questions

### How do I integrate mobile app?

See [Mobile App Integration Guide](04-MOBILE-APP-INTEGRATION.md)

Quick summary:
1. Register/login users via `/api/auth/login`
2. Get JWT access token
3. Include token in `Authorization: Bearer {token}` header
4. Call mobile API endpoints (`/api/mobile/v1/*`)

### How do I integrate e-commerce platform?

See [E-Commerce Integration Guide](05-ECOMMERCE-INTEGRATION.md)

Quick summary:
1. Request API credentials (app_id + api_key)
2. Verify customer phone via `/api/ecommerce/v1/customers/verify`
3. Award rewards after purchase: `/api/ecommerce/v1/rewards/award`
4. Apply coupons at checkout: `/api/ecommerce/v1/checkout/apply-coupon`

### Can I use webhooks?

Yes! Configure webhooks in admin portal:

```
POST /api/webhooks
Body: {
  "url": "https://your-platform.com/webhooks/scan4earn",
  "events": ["coupon.scanned", "reward.redeemed"]
}
```

See [Webhook Integration Guide](06-WEBHOOK-INTEGRATION.md)

### What's the API rate limit?

- Global: 100 requests/min per IP
- Per user: 1000 requests/min
- Per API key: 1000 requests/min

If you exceed limits, retry with exponential backoff.

## Authentication Questions

### What's the difference between JWT and API Keys?

| Aspect | JWT | API Key |
|--------|-----|---------|
| **Use Case** | User auth (web/mobile) | App-to-app auth |
| **Expiry** | 15 min (access), 7 days (refresh) | 90 days |
| **Header** | `Authorization: Bearer {token}` | `Authorization: Bearer {key}` |
| **Rotation** | Automatic via refresh | Manual or auto-rotate |

### How do I refresh an expired token?

```javascript
POST /api/auth/refresh
Body: { "refreshToken": "..." }

Response:
{
  "accessToken": "new_short_lived_token",
  "refreshToken": "new_long_lived_token"
}
```

### Can I use API key for customer authentication?

No. API keys are for backend integrations only.

**Proper auth flow:**
- **Web/Mobile Customers:** JWT (via /api/auth/login)
- **E-Commerce Platforms:** API Key
- **External Apps:** API Key

### What if I lose my API key?

Generate a new one:

```
POST /api/verification-apps/{id}/regenerate-mobile-key
Headers: Authorization: Bearer {admin_token}

Response: New key (old key invalidated immediately)
```

## Data & Privacy Questions

### How long is data retained?

Configurable, but defaults:
- Transaction history: 7 years (compliance)
- Audit logs: 1 year
- Analytics: 90 days
- Coupons after expiry: 90 days

### Is data encrypted?

- **In Transit:** HTTPS/TLS everywhere
- **At Rest:** Planned (encrypted field support)
- **Database:** Column-level encryption available
- **Passwords:** bcrypt with salt (can't be reversed)

### Can I export customer data?

Yes, through admin portal:
```
GET /api/dashboard/export?format=csv&type=customers
```

### Can I delete customer data?

Yes, via GDPR-compliant deletion:
```
DELETE /api/users/{userId}
# Data deleted after 30-day grace period
```

## Deployment Questions

### How do I deploy to production?

See [Deployment Guide](../deployment/01-DEPLOYMENT-GUIDE.md)

Quick summary:
1. Build Docker image: `docker build -t scan4earn:latest .`
2. Push to registry: `docker push ...`
3. Deploy to Cloud Run: `gcloud run deploy ...`
4. Run migrations: Migration job
5. Configure environment: Secrets manager

### Can I use other cloud providers?

Yes! The app is cloud-agnostic:
- **Google Cloud:** Cloud Run + Cloud SQL (documented)
- **AWS:** Elastic Container Service + RDS
- **Azure:** Container Instances + Database
- **On-Premises:** Docker on any Linux server

### How do I set up backups?

Automatic daily backups recommended:

```bash
# Google Cloud SQL
gcloud sql backups create ... --instance=...

# Manual backup before deployment
gcloud sql backups create backup-$(date +%Y%m%d) --instance=...
```

### How do I monitor the system?

Use Cloud Logging and Monitoring:

```bash
# View logs
gcloud run services logs read scan4earn-server --limit 100

# Set up alerts
gcloud monitoring policies create --display-name="Error rate alert"
```

Or check [Monitoring & Logging Guide](../deployment/04-MONITORING-LOGGING.md)

## Performance Questions

### How many concurrent users can it support?

Depends on deployment size:
- **Development:** 10 users locally
- **Small deployment (512Mi/1CPU):** ~100 concurrent
- **Medium deployment (1Gi/2CPU):** ~500 concurrent
- **Large deployment (2Gi/4CPU):** ~1000+ concurrent

Can scale horizontally with load balancer.

### How fast are API responses?

Typical latencies:
- **Health check:** <10ms
- **Simple lookup:** 50-100ms
- **List with filtering:** 100-500ms
- **Complex aggregation:** 500-2000ms

### Should I use caching?

Optional Redis caching for:
- Product catalog (invalidate on update)
- API key validation (5 min TTL)
- User sessions (auto-invalidated on logout)

### How do I optimize queries?

```sql
-- Add indexes on frequently queried columns
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_coupons_coupon_code ON coupons(coupon_code);

-- Check index usage
SELECT * FROM pg_stat_user_indexes;
```

## Troubleshooting Questions

### Server won't start

Check:
1. Database running: `psql -h localhost -U postgres`
2. .env configured: `cat .env`
3. Logs: `npm run dev 2>&1`
4. Port available: `lsof -i :8080`

See [Troubleshooting Guide](08-TROUBLESHOOTING.md)

### Can't connect to database

Common causes:
- PostgreSQL not running
- Wrong credentials in .env
- Database doesn't exist
- Network connectivity

See [Database Connection Issues](08-TROUBLESHOOTING.md#database-connection-issues)

### API returns 401 Unauthorized

Check:
1. Authorization header present
2. Token not expired
3. Correct token value
4. Token secret in .env matches

See [Authentication Issues](08-TROUBLESHOOTING.md#authentication-issues)

### Tests are failing

Run with verbose output:

```bash
npm test -- --verbose --runInBand

# Check for:
# - Database not initialized
# - Timeout issues
# - Missing test setup
```

## Security Questions

### How are API keys secured?

- 256-bit random generation
- SHA-256 hashing in database
- Automatic expiry every 90 days
- Audit log of all rotations
- Rate limiting per key

### Is the API safe for production?

Yes, with proper security practices:
- Use HTTPS/TLS (required)
- Store secrets in Secret Manager (not .env)
- Enable rate limiting
- Monitor for suspicious activity
- Keep Node.js and dependencies updated

### What about SQL injection?

Not possible:
- All queries use parameterized statements
- Input validation on all endpoints
- Database constraints enforce data integrity

### Are passwords secure?

Yes:
- bcrypt with salt rounds = 10
- Hashed passwords can't be reversed
- Password history prevents reuse
- Account lockout after failed attempts

## Feature Questions

### Do you support subscriptions/billing?

Not yet (planned for v3). Currently:
- Flat tenant pricing
- Per-transaction fees
- Rewards based on configuration

### Can I customize the mobile app?

The backend is fully customizable via API. For mobile app:
- **White-label mobile app:** Custom build needed
- **Web integration:** Full API available
- **Branding:** Configurable via admin portal

### Do you have offline support?

Mobile app can queue scans while offline:
1. Store transaction locally
2. Retry when connection restored
3. Server handles deduplication

### Can I integrate with my POS system?

Yes! Via REST API:

```javascript
// Check if customer has rewards
GET /api/ecommerce/v1/customers/phone/{phone}/balance
Headers: Authorization: Bearer {api_key}

// Apply reward at checkout
POST /api/ecommerce/v1/checkout/apply-coupon
```

## Getting More Help

### I still have questions

- **Technical:** See [Troubleshooting Guide](08-TROUBLESHOOTING.md)
- **Setup:** See [Project Setup](02-PROJECT-SETUP.md)
- **API:** See [API Overview](../api/01-API-OVERVIEW.md)
- **Integration:** See [Integration Guides](04-MOBILE-APP-INTEGRATION.md)
- **Architecture:** See [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)

### How do I report a bug?

1. Reproduce with minimal steps
2. Gather logs and diagnostics
3. Share error message
4. Provide environment details
5. Contact: support@scan4earn.com

### How do I request a feature?

1. Check if already planned
2. Describe use case
3. Share implementation ideas
4. Submit via: features@scan4earn.com

---

**Last Updated:** 2026-05-31  
**Version:** 2.0

Still have questions? Check [Documentation Index](../README.md) or contact support.
