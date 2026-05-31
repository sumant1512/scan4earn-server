# Quick Start Guide

Get the Scan4Earn server running in under 5 minutes.

## Prerequisites

- **Node.js:** 22.22.0 or higher
- **npm:** 10.9.4 or higher
- **PostgreSQL:** 12+
- **Git:** Latest version

Check your versions:
```bash
node --version   # Should be v22.22.0+
npm --version    # Should be 10.9.4+
psql --version   # Should be 12+
```

## 1. Clone & Setup (2 minutes)

```bash
# Clone the repository
git clone https://github.com/your-org/scan4earn-server.git
cd scan4earn-server

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env
```

## 2. Configure Environment (2 minutes)

Edit `.env` with your settings:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scan4earn_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_ACCESS_SECRET=your_secret_key_here
JWT_REFRESH_SECRET=your_refresh_secret_key_here

# Server
PORT=8080
NODE_ENV=development
DOMAIN_BASE=localhost:8080

# Email (optional for initial setup)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

See [Configuration Guide](03-CONFIGURATION.md) for all options.

## 3. Database Setup (1 minute)

```bash
# Create database (if not exists)
createdb scan4earn_db

# Run migrations
psql -h localhost -U postgres -d scan4earn_db -f ../scan4earn-database-main/migrations/001_initial_schema.sql
```

## 4. Start the Server (< 1 minute)

```bash
# Development mode with auto-reload
npm run dev

# Or production mode
npm start
```

You should see:
```
✨ HTTP server is listening!
📡 Server: http://0.0.0.0:8080
🏥 Health: http://0.0.0.0:8080/health
```

## 5. Verify Installation

```bash
# Health check
curl http://localhost:8080/health

# Expected response:
{
  "status": "healthy",
  "server": "running",
  "database": "connected"
}
```

## Common Issues

**"Connection refused" on database:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Or on macOS
brew services list
```

**Port 8080 already in use:**
```bash
# Use different port
PORT=8081 npm run dev
```

**Module not found errors:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

See [Troubleshooting Guide](08-TROUBLESHOOTING.md) for more help.

## Next Steps

1. **Understand the Architecture:** Read [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)
2. **Explore the API:** See [API Overview](../api/01-API-OVERVIEW.md)
3. **Run Tests:** `npm test`
4. **Create API Key:** Use the dashboard to enable Mobile API
5. **Integrate Mobile App:** Follow [Mobile Integration Guide](04-MOBILE-APP-INTEGRATION.md)

## Development Commands

```bash
# Development server with auto-reload
npm run dev

# Run all tests
npm test

# Run specific test suite
npm test -- --testNamePattern="auth"

# Run E2E tests
npm run test:e2e

# View test coverage
npm test -- --coverage
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              Scan4Earn Server                       │
├──────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Mobile     │  │  E-Commerce  │  │   Admin    │ │
│  │     APIs     │  │     APIs     │  │   Portal   │ │
│  └──────┬───────┘  └──────┬───────┘  └────┬───────┘ │
│         │                 │               │          │
│  ┌──────▼────────────────▼───────────────▼───────┐  │
│  │         Express.js Routes & Controllers        │  │
│  └──────┬────────────────────────────────────┬───┘  │
│         │                                    │       │
│  ┌──────▼──────────────┐        ┌───────────▼──────┐│
│  │  Authentication     │        │  Business Logic  ││
│  │  JWT + API Keys     │        │  Services        ││
│  └─────┬──────────────┘        └────────┬──────────┘│
│        │                                │            │
│  ┌─────▼────────────────────────────────▼──────────┐ │
│  │        PostgreSQL Database                       │ │
│  │  (Tenants, Users, Products, Coupons, Rewards) │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

## Key Concepts

- **Tenant:** A business account (company, retailer, etc.)
- **User:** Person with a role (Super Admin, Tenant Admin, Customer, Dealer)
- **Verification App:** Mobile app instance for scanning
- **Coupon:** QR code with rewards
- **Reward:** Points, cashback, or product earned by customer
- **API Key:** Credential for third-party integrations

## File Structure

```
scan4earn-server/
├── src/
│   ├── server.js              # Main entry point
│   ├── config/                # Configuration files
│   ├── middleware/            # Request middleware
│   ├── routes/                # API route definitions
│   ├── controllers/           # Route handlers
│   ├── services/              # Business logic
│   ├── modules/               # Feature modules (super-admin, tenant-admin, etc.)
│   └── __tests__/             # Test files
├── docs/                      # Documentation (you are here)
├── .env.example               # Environment template
├── package.json               # Dependencies
└── README.md                  # Project README
```

Ready to go deeper? Check out:
- [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)
- [Project Setup](02-PROJECT-SETUP.md)
- [API Overview](../api/01-API-OVERVIEW.md)
