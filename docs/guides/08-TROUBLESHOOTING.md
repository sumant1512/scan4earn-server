# Troubleshooting Guide

Solutions to common issues and problems.

## Getting Help

### Steps to Take

1. **Check this guide** - Most issues have solutions here
2. **Review logs** - Check server logs and database logs
3. **Check status** - Verify service health endpoints
4. **Verify config** - Review environment variables
5. **Search documentation** - Check [FAQ](09-FAQ.md) and related docs
6. **Test with curl/Postman** - Isolate the issue
7. **Contact support** - If unresolved

### Gathering Diagnostics

Before reaching out to support:

```bash
# Server logs
npm run dev 2>&1 | tee debug.log

# Database status
psql -h localhost -U postgres -d scan4earn_db -c "\dt"

# Network connectivity
curl -v http://localhost:8080/health

# Environment check
env | grep "DB_\|JWT_\|NODE_ENV"

# npm info
npm list --depth=0
node --version
npm --version
```

## Common Issues & Solutions

### Database Connection Issues

#### Error: `connect ECONNREFUSED 127.0.0.1:5432`

**Cause:** PostgreSQL not running

**Solution:**

```bash
# Check if PostgreSQL is running
brew services list | grep postgresql
# or
sudo systemctl status postgresql

# Start PostgreSQL
brew services start postgresql@15
# or
sudo systemctl start postgresql

# Verify connection
psql -h localhost -U postgres -c "SELECT 1"
```

#### Error: `password authentication failed`

**Cause:** Wrong database credentials

**Solution:**

```bash
# Check .env file
cat .env | grep DB_

# Test connection with psql
psql -h localhost -U postgres -c "SELECT 1"

# Reset password
psql -h localhost -U postgres -c "ALTER USER postgres WITH PASSWORD 'new_password';"

# Update .env
nano .env  # Change DB_PASSWORD=new_password

# Restart server
npm run dev
```

#### Error: `FATAL:  database "scan4earn_db" does not exist`

**Cause:** Database not created

**Solution:**

```bash
# Create database
createdb -U postgres scan4earn_db

# Or with psql
psql -U postgres -c "CREATE DATABASE scan4earn_db;"

# Verify
psql -U postgres -l | grep scan4earn_db

# Run migrations
psql -h localhost -U postgres -d scan4earn_db -f migrations/001_initial_schema.sql
```

### Authentication Issues

#### Error: `Invalid token`

**Cause:** 
- Token expired
- Invalid JWT secret
- Token malformed

**Solution:**

```bash
# Check token expiry
node -e "
  const jwt = require('jsonwebtoken');
  const token = 'your_token_here';
  try {
    const decoded = jwt.decode(token, { complete: true });
    console.log('Payload:', decoded.payload);
    console.log('Expires at:', new Date(decoded.payload.exp * 1000));
  } catch (e) {
    console.error('Invalid token:', e.message);
  }
"

# Regenerate JWT secrets in .env
JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Update .env and restart
npm run dev
```

#### Error: `No token provided`

**Cause:** Missing Authorization header

**Solution:**

```bash
# Include Authorization header
curl -X GET http://localhost:8080/api/users \
  -H "Authorization: Bearer YOUR_TOKEN"

# Or in code
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};

fetch('/api/users', { headers })
```

#### Error: `INVALID_CREDENTIALS`

**Cause:** Wrong email/password

**Solution:**

```bash
# Verify user exists
psql -h localhost -U postgres -d scan4earn_db -c "SELECT id, email, role FROM users LIMIT 5;"

# Check password is correct
# Passwords are hashed, so can't compare directly

# Reset user password (in dev/testing only)
psql -h localhost -U postgres -d scan4earn_db << EOF
-- First, get a bcrypted password hash
-- Use Node.js to generate:
-- const bcrypt = require('bcrypt');
-- bcrypt.hash('newpassword', 10).then(console.log);

UPDATE users SET password_hash = 'YOUR_BCRYPT_HASH' WHERE email = 'user@example.com';
EOF

# Then login with new password
```

### Server & Port Issues

#### Error: `Error: listen EADDRINUSE :::8080`

**Cause:** Port 8080 already in use

**Solution:**

```bash
# Find process using port
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use different port
PORT=8081 npm run dev
```

#### Error: `Cannot find module 'express'`

**Cause:** Dependencies not installed

**Solution:**

```bash
# Install dependencies
npm install

# Clear cache if issues persist
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### Server starts but doesn't respond

**Cause:**
- Port not bound correctly
- Process crashed silently
- Database connection stuck

**Solution:**

```bash
# Run with verbose logging
DEBUG=* npm run dev

# Check if process is running
ps aux | grep node

# Check port binding
netstat -tlnp | grep 8080

# Run in foreground to see errors
node src/server.js
```

### API Errors

#### Error: `Route not found` (404)

**Cause:** Wrong endpoint path

**Solution:**

```bash
# List all available routes
grep "app.use\|router.get\|router.post\|router.patch\|router.delete" src/routes/*.js

# Check X-Tenant-Slug header
curl -X GET http://localhost:8080/api/users \
  -H "Authorization: Bearer TOKEN" \
  -H "X-Tenant-Slug: sumukham"

# Verify path syntax
# Correct: /api/users
# Wrong: /api//users or /api/users/
```

#### Error: `Validation error` (400)

**Cause:** Invalid request body

**Solution:**

```bash
# Check request format
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: sumukham" \
  -d '{
    "phone": "+919876543210",
    "password": "password123"
  }'

# Verify required fields
# Review endpoint documentation

# Check field data types
# Example: phone must be E.164 format (+COUNTRY_CODE + digits)
```

#### Error: `Insufficient permissions` (403)

**Cause:** User role doesn't have permission

**Solution:**

```bash
# Check user role
psql -h localhost -U postgres -d scan4earn_db -c "SELECT id, email, role FROM users WHERE email = 'user@example.com';"

# Check required permissions
grep "requireRole\|checkPermission" src/routes/your-endpoint.js

# If role is wrong, update user
UPDATE users SET role = 'TENANT_ADMIN' WHERE email = 'user@example.com';

# Logout and login again for token to refresh
```

#### Error: `Too many requests` (429)

**Cause:** Rate limit exceeded

**Solution:**

```bash
# Check rate limit headers
curl -v http://localhost:8080/health

# Look for headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 50
# X-RateLimit-Reset: 1234567890

# Wait for rate limit to reset
sleep 60

# Or adjust rate limits in .env
RATE_LIMIT_GLOBAL_MAX_REQUESTS=10000

# Restart server
npm run dev
```

### Testing Issues

#### Error: `Timeout: database operations not completing`

**Cause:** 
- Slow database queries
- Connection pool exhausted
- Lock contention

**Solution:**

```bash
# Check slow queries
psql -h localhost -U postgres -d scan4earn_db << EOF
-- Find slow queries
SELECT query, calls, mean_time 
FROM pg_stat_statements 
WHERE mean_time > 100  -- ms
ORDER BY mean_time DESC
LIMIT 10;
EOF

# Increase timeouts in .env
DB_STATEMENT_TIMEOUT=60000  # 60 seconds

# Restart server
npm run dev

# Or optimize queries
# Check indexes on frequently queried columns
psql -h localhost -U postgres -d scan4earn_db -c "\d users"  # Show indexes
```

#### Error: `Test fails with 'connection pool drained'`

**Cause:** Database connections not released

**Solution:**

```bash
# Increase pool size for tests
TEST_DB_POOL_MAX=10

# Or close connections properly in tests
afterAll(async () => {
  await db.pool.end();
});

// Run tests sequentially
jest --runInBand
```

### Integration Issues

#### Mobile App Can't Connect

**Cause:**
- Wrong server URL
- CORS issues
- SSL/TLS certificate problems

**Solution:**

```javascript
// Debug connection
fetch('http://localhost:8080/health')
  .then(r => r.json())
  .then(console.log)
  .catch(err => {
    console.error('Connection failed:', err);
    console.error('Check:');
    console.error('1. Server is running: npm run dev');
    console.error('2. URL is correct: http://localhost:8080');
    console.error('3. Device can reach server (not behind firewall)');
    console.error('4. CORS is enabled in .env');
  });
```

#### E-Commerce Integration Fails

**Cause:**
- Wrong API credentials
- Missing X-App-Id header
- Rate limiting

**Solution:**

```javascript
// Debug E-Commerce API call
const client = axios.create({
  baseURL: 'http://localhost:8080'
});

client.interceptors.request.use(config => {
  console.log('Request:', config.method.toUpperCase(), config.url);
  console.log('Headers:', config.headers);
  return config;
});

client.interceptors.response.use(
  res => {
    console.log('Response:', res.status, res.data);
    return res;
  },
  err => {
    console.error('Error:', err.response?.status, err.response?.data);
    return Promise.reject(err);
  }
);

// Test credentials
const response = await client.get('/api/ecommerce/v1/products', {
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'X-App-Id': APP_ID,
    'X-Tenant-Slug': TENANT_SLUG
  }
});
```

### Performance Issues

#### Server responds slowly

**Cause:**
- Slow database queries
- N+1 query problem
- Missing indexes
- Insufficient memory

**Solution:**

```bash
# Profile queries
psql -h localhost -U postgres -d scan4earn_db << EOF
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries > 1 second
SELECT pg_reload_conf();

-- Check slow query log
SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
EOF

# Monitor server memory
watch -n 1 'ps aux | grep node'

# Increase memory if needed
NODE_OPTIONS="--max-old-space-size=4096" npm run dev

# Check for N+1 queries
# Use query logs to identify repeated similar queries
# Solution: Use joins or batch queries
```

#### High CPU usage

**Cause:**
- Infinite loops
- Unoptimized algorithms
- High concurrency without rate limiting

**Solution:**

```bash
# Profile CPU usage
node --prof src/server.js

# Generate profile report
node --prof-process isolate-*.log > profile.txt
cat profile.txt | head -50

# Look for:
# - Functions taking > 10% of CPU
# - Unexpected function calls

# Fix by:
# - Optimizing algorithms
# - Adding caching
# - Increasing rate limiting
```

## Debug Mode

Enable debug logging:

```bash
# Node.js debug
DEBUG=* npm run dev

# Specific module
DEBUG=scan4earn:* npm run dev

# With verbosity
DEBUG=* NODE_ENV=development npm run dev 2>&1 | tee debug.log
```

## System Health Check

```bash
#!/bin/bash
# health-check.sh

echo "=== System Health Check ==="

echo "✓ Node.js"
node --version

echo "✓ npm"
npm --version

echo "✓ PostgreSQL"
psql --version

echo "✓ Database Connection"
psql -h localhost -U postgres -c "SELECT 'OK'" 2>/dev/null && echo "✓ Connected" || echo "✗ Failed"

echo "✓ Server Health"
curl -s http://localhost:8080/health | jq . 2>/dev/null && echo "✓ Running" || echo "✗ Not responding"

echo "✓ Memory Usage"
ps aux | grep "node src/server.js" | grep -v grep | awk '{print $6 " KB"}' || echo "✗ Not running"

echo "=== End Health Check ==="
```

## Getting Help

### Enable Debug Logs

```bash
# Comprehensive debugging
DEBUG=scan4earn:* \
DB_STATEMENT_TIMEOUT=60000 \
npm run dev 2>&1 | tee debug.log
```

### Prepare Support Request

Include:

1. **Error message** (exact text)
2. **Steps to reproduce**
3. **Environment info:**
   ```bash
   node --version
   npm --version
   psql --version
   cat .env | grep -v PASSWORD
   ```
4. **Logs** (relevant portions)
5. **Request/Response examples** (if API issue)

### Common Support Queries

- **"Server won't start"** → See [Server & Port Issues](#server--port-issues)
- **"Can't login"** → See [Authentication Issues](#authentication-issues)
- **"API returns 404"** → See [API Errors](#api-errors)
- **"Database error"** → See [Database Connection Issues](#database-connection-issues)
- **"Performance slow"** → See [Performance Issues](#performance-issues)

---

**Last Updated:** 2026-05-31  
**Version:** 2.0

See also: [FAQ](09-FAQ.md) | [Configuration Guide](03-CONFIGURATION.md) | [API Overview](../api/01-API-OVERVIEW.md)
