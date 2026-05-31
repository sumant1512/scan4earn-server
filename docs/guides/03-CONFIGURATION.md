# Configuration Guide

Complete reference for all environment variables and configuration options.

## Environment Files

```bash
.env                  # Development (git-ignored)
.env.example          # Template for required variables
.env.staging          # Staging environment
.env.production       # Production environment (secrets manager)
```

## Database Configuration

```bash
# Connection
DB_HOST=localhost              # PostgreSQL host
DB_PORT=5432                   # PostgreSQL port
DB_NAME=scan4earn_db           # Database name
DB_USER=postgres               # Database user
DB_PASSWORD=secure_password    # Database password

# Connection Pool
DB_POOL_MIN=2                  # Minimum connections
DB_POOL_MAX=20                 # Maximum connections
DB_POOL_IDLE_TIMEOUT=30000     # Idle timeout (ms)
DB_STATEMENT_TIMEOUT=30000     # Query timeout (ms)
```

### Database Connection String

Alternative to individual settings:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/scan4earn_db
```

## JWT Configuration

```bash
# Access Token
JWT_ACCESS_SECRET=long_random_string_32_chars_min      # Must be 32+ chars
JWT_ACCESS_EXPIRY=15m                                   # 15 minutes
JWT_REFRESH_SECRET=different_long_random_string_32_chars
JWT_REFRESH_EXPIRY=7d                                   # 7 days

# Token Blacklist
JWT_TOKEN_BLACKLIST_ENABLED=true
JWT_BLACKLIST_CLEANUP_INTERVAL=3600000                 # 1 hour
```

### Generating Secure Secrets

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Server Configuration

```bash
# Basic
PORT=8080                      # Server port
NODE_ENV=development           # development | staging | production
DOMAIN_BASE=localhost:8080     # Domain for multi-tenancy

# Timeouts
REQUEST_TIMEOUT=30000          # Request timeout (ms)
KEEP_ALIVE_TIMEOUT=65000       # Socket keep-alive (ms)

# Body Size Limits
BODY_SIZE_LIMIT=10mb           # JSON payload limit
URL_ENCODED_LIMIT=1mb          # Form data limit

# CORS
CORS_ORIGIN=*                  # CORS origin (* or specific domain)
CORS_CREDENTIALS=true          # Allow credentials

# Security
HELMET_ENABLED=true            # Enable security headers
HELMET_STRICT_TRANSPORT_SECURITY_MAX_AGE=31536000
```

## Logging Configuration

```bash
# Log Level
LOG_LEVEL=info                 # debug | info | warn | error
LOG_FORMAT=json                # json | text | pretty

# Cloud Logging (GCP)
GOOGLE_CLOUD_PROJECT_ID=project_id_here
GOOGLE_CLOUD_LOGGING_ENABLED=true

# Local Logging
LOG_FILE_PATH=./logs           # Log file directory
LOG_FILE_MAX_SIZE=100m         # Max file size before rotation
LOG_FILE_MAX_FILES=10          # Number of backup files
```

## Email Configuration

```bash
# SMTP Server
SMTP_HOST=smtp.gmail.com       # Email service host
SMTP_PORT=587                  # SMTP port
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_specific_password  # Not account password!
SMTP_FROM_EMAIL=noreply@scan4earn.com
SMTP_FROM_NAME=Scan4Earn

# Email Template
EMAIL_VERIFICATION_ENABLED=true
EMAIL_TEMPLATE_PATH=./templates/email
```

### Gmail Setup

1. Enable 2-Factor Authentication
2. Generate App Password:
   - Google Account → Security → App Passwords
   - Select "Mail" and "Windows Computer"
   - Copy generated password
   - Use as SMTP_PASSWORD

## API Key Configuration

```bash
# Key Expiration
API_KEY_EXPIRY_DAYS=90         # Key validity period
API_KEY_GRACE_PERIOD_DAYS=14   # Warning period before expiry
API_KEY_LENGTH=32              # Bytes (256-bit = 32 bytes)

# Key Rotation
API_KEY_ROTATION_ENABLED=true
API_KEY_ALLOW_CONCURRENT_KEYS=2  # Allow multiple active keys

# Audit Logging
API_KEY_AUDIT_LOG_ENABLED=true
API_KEY_AUDIT_LOG_RETENTION_DAYS=365
```

## Rate Limiting

```bash
# Global Rate Limits
RATE_LIMIT_GLOBAL_WINDOW_MS=60000     # 1 minute
RATE_LIMIT_GLOBAL_MAX_REQUESTS=100    # 100 requests/minute
RATE_LIMIT_GLOBAL_KEY_PREFIX=global

# User-Specific Rate Limits
RATE_LIMIT_USER_WINDOW_MS=60000       # 1 minute
RATE_LIMIT_USER_MAX_REQUESTS=1000     # 1000 requests/minute

# API Key Rate Limits
RATE_LIMIT_API_KEY_WINDOW_MS=60000
RATE_LIMIT_API_KEY_MAX_REQUESTS=1000

# Burst Protection
RATE_LIMIT_BURST_WINDOW_MS=1000       # 1 second
RATE_LIMIT_BURST_MAX_REQUESTS=10      # 10 requests/second

# Skip rate limit for specific IPs
RATE_LIMIT_SKIP_IPS=127.0.0.1,::1
```

## Cache Configuration (Optional)

```bash
# Redis Cache
REDIS_ENABLED=false            # Enable Redis caching
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_CACHE_TTL=300            # 5 minutes

# Cache Keys
REDIS_KEY_PRODUCTS=products
REDIS_KEY_CATEGORIES=categories
REDIS_KEY_API_KEYS=api_keys

# In-Memory Cache (if Redis disabled)
MEMORY_CACHE_ENABLED=true
MEMORY_CACHE_TTL=300           # 5 minutes
```

## Google Cloud Configuration

```bash
# Google Cloud Run
GOOGLE_CLOUD_RUN_ENABLED=true
CLOUD_RUN_MEMORY=512Mi         # Memory allocation
CLOUD_RUN_CPU=1                # CPU allocation
CLOUD_RUN_CONCURRENCY=100      # Max concurrent requests

# Google Sheets Integration
GOOGLE_SHEETS_API_ENABLED=false
GOOGLE_SHEETS_SPREADSHEET_ID=your_sheet_id
GOOGLE_SHEETS_API_KEY=your_api_key

# Cloud Logging
CLOUD_LOGGING_ENABLED=true
CLOUD_LOGGING_RESOURCE_TYPE=cloud_run_revision
```

## Multi-Tenancy Configuration

```bash
# Subdomain Settings
SUBDOMAIN_ENABLED=true
SUBDOMAIN_SEPARATOR=.          # Separator character
SUBDOMAIN_ALLOW_ROOT=true      # Allow requests to root domain

# Tenant Context
TENANT_CONTEXT_ISOLATION=strict
TENANT_CACHE_ENABLED=true
TENANT_CACHE_TTL=3600          # 1 hour

# Data Isolation
TENANT_DATA_ENCRYPTION=false   # Enable field-level encryption
TENANT_AUDIT_LOG_ENABLED=true
```

## Feature Flags

```bash
# Mobile App Features
FEATURE_MOBILE_API_V2=true
FEATURE_OFFLINE_MODE=true
FEATURE_QR_SCANNING=true

# Admin Portal
FEATURE_ADMIN_DASHBOARD=true
FEATURE_BULK_OPERATIONS=true
FEATURE_EXPORT_REPORTS=true

# Customer Features
FEATURE_LOYALTY_POINTS=true
FEATURE_CASHBACK=true
FEATURE_REDEMPTION=true
FEATURE_REFERRAL_PROGRAM=false

# Developer Features
FEATURE_WEBHOOK_EVENTS=true
FEATURE_API_ANALYTICS=true
FEATURE_SANDBOX_MODE=true
```

## Testing Configuration

```bash
# E2E Testing
E2E_TESTS_ENABLED=false        # Set to true to run E2E tests
E2E_TEST_TIMEOUT=30000         # Test timeout (ms)
E2E_TEST_DATABASE=scan4earn_db_test
E2E_TEST_SEED_DATA=true        # Seed test data

# Test Database
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_NAME=scan4earn_db_test
TEST_DB_USER=postgres
TEST_DB_PASSWORD=postgres

# Mocking
MOCK_EXTERNAL_SERVICES=false
MOCK_EMAIL_SERVICE=false
MOCK_GOOGLE_SHEETS=false
```

## Third-Party Services

```bash
# Analytics (Optional)
ANALYTICS_ENABLED=false
ANALYTICS_PROVIDER=google      # google | mixpanel | amplitude
ANALYTICS_KEY=your_key

# Error Tracking (Optional)
ERROR_TRACKING_ENABLED=false
SENTRY_DSN=https://key@sentry.io/project
SENTRY_ENVIRONMENT=development

# Payment Processing (Future)
PAYMENT_GATEWAY=stripe         # stripe | razorpay
STRIPE_PUBLIC_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

## Security Settings

```bash
# Password Policy
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL_CHARS=true
PASSWORD_EXPIRY_DAYS=90        # Force change after 90 days
PASSWORD_HISTORY_COUNT=5       # Can't reuse last 5 passwords

# Session Security
SESSION_TIMEOUT_MINUTES=30     # Inactivity timeout
SESSION_SAME_SITE=Strict       # CSRF protection
SESSION_SECURE=true            # HTTPS only (production)

# HTTPS/TLS
TLS_ENABLED=true
TLS_CERT_PATH=./certs/cert.pem
TLS_KEY_PATH=./certs/key.pem
TLS_VERSION=TLSv1.2            # Minimum TLS version
```

## Data Retention Policies

```bash
# Coupon Management
COUPON_EXPIRY_DEFAULT_DAYS=30
COUPON_RETENTION_AFTER_EXPIRY_DAYS=90
COUPON_ARCHIVE_ENABLED=true

# Audit Logs
AUDIT_LOG_RETENTION_DAYS=365
AUDIT_LOG_CLEANUP_INTERVAL=2592000000  # 30 days

# User Data
USER_INACTIVE_CLEANUP_DAYS=730         # 2 years
USER_DATA_DELETION_GRACE_PERIOD=30     # Days after deletion request

# Analytics Data
ANALYTICS_DATA_RETENTION_DAYS=90
TRANSACTION_LOG_RETENTION_DAYS=2555    # 7 years for compliance
```

## Environment-Specific Examples

### Development

```bash
NODE_ENV=development
PORT=8080
DB_HOST=localhost
DB_NAME=scan4earn_db
LOG_LEVEL=debug
RATE_LIMIT_GLOBAL_MAX_REQUESTS=10000
FEATURE_SANDBOX_MODE=true
E2E_TESTS_ENABLED=true
```

### Staging

```bash
NODE_ENV=staging
PORT=8080
DB_HOST=postgres.staging.internal
DB_NAME=scan4earn_staging
LOG_LEVEL=info
CORS_ORIGIN=https://staging.scan4earn.com
RATE_LIMIT_GLOBAL_MAX_REQUESTS=1000
```

### Production

```bash
NODE_ENV=production
PORT=8080
DB_HOST=cloudsql.prod.internal
DB_NAME=scan4earn_prod
LOG_LEVEL=warn
CORS_ORIGIN=https://api.scan4earn.com
RATE_LIMIT_GLOBAL_MAX_REQUESTS=100
SESSION_SECURE=true
TLS_ENABLED=true
SENTRY_DSN=https://...
```

## Configuration Validation

The server validates configuration on startup:

```javascript
// config/validator.js
Validates:
  - Required environment variables present
  - Database connectivity
  - JWT secrets meet security requirements
  - Port is available
  - File paths are accessible
```

Startup will fail if configuration is invalid.

## Secrets Management

### Development

```bash
# Store in .env (git-ignored)
.env
.env.local
.env.*.local
```

### Production

**Use a secrets manager:**

```bash
# Google Cloud Secret Manager
gcloud secrets create db-password --data-file=-

# AWS Secrets Manager
aws secretsmanager create-secret --name prod/db-password

# HashiCorp Vault
vault kv put secret/scan4earn/prod db_password=...
```

**Never commit secrets to git:**

```bash
# Pre-commit hook to prevent secrets
#!/bin/bash
if git diff --cached | grep -E "SECRET|PASSWORD|TOKEN|KEY" | grep -v "\.example"; then
  echo "Error: Secrets detected in commit"
  exit 1
fi
```

## Configuration Loading Order

1. System environment variables
2. `.env` file (development)
3. `.env.{NODE_ENV}` file
4. Hard-coded defaults
5. Validation & error handling

## Reloading Configuration

To reload config without restarting:

```bash
# Send SIGHUP signal
kill -HUP <pid>

# Or use admin API (requires super-admin)
POST /api/admin/config/reload
Authorization: Bearer {super_admin_token}
```

## Common Configuration Issues

### Database Connection Fails

```bash
# Check config
DB_HOST=localhost
DB_PORT=5432

# Verify PostgreSQL is running
psql -h localhost -U postgres -c "SELECT 1"

# Test connection in Node
node -e "
require('pg').Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password'
}).query('SELECT NOW()', (err, res) => {
  console.log(err || res.rows[0]);
});
"
```

### Invalid JWT Secret

```bash
# Secrets must be:
# - Minimum 32 characters
# - Randomly generated
# - Different for access and refresh tokens

# Generate valid secret
node -e "
  console.log('Access Secret:', require('crypto').randomBytes(32).toString('hex'));
  console.log('Refresh Secret:', require('crypto').randomBytes(32).toString('hex'));
"
```

## See Also

- [Quick Start Guide](01-QUICK-START.md)
- [Project Setup](02-PROJECT-SETUP.md)
- [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)

---

**Last Updated:** 2026-05-31  
**Version:** 2.0
