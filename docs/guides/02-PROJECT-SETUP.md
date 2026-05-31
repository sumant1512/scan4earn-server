# Complete Project Setup Guide

Comprehensive setup guide for developers.

## System Requirements

### Minimum Requirements
- **CPU:** 2 cores
- **RAM:** 4GB
- **Storage:** 10GB free disk space
- **OS:** macOS 10.14+, Linux (Ubuntu 20.04+), or Windows 10+

### Recommended Requirements
- **CPU:** 4+ cores
- **RAM:** 8GB+
- **Storage:** 20GB+ free disk space
- **OS:** macOS 12+ or Ubuntu 22.04+

## Prerequisites Installation

### 1. Node.js & npm

**macOS (Using Homebrew):**
```bash
brew install node@22
node --version  # Should show v22.22.0
npm --version   # Should show 10.9.4+
```

**Ubuntu/Debian:**
```bash
curl -sL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
Download and install from [nodejs.org](https://nodejs.org/)

Verify installation:
```bash
node --version
npm --version
```

### 2. PostgreSQL Database

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15

# Verify
psql --version
psql -U postgres -c "SELECT version();"
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

# Verify
psql --version
sudo systemctl status postgresql
```

**Windows:**
Download installer from [postgresql.org](https://www.postgresql.org/download/windows/)

### 3. Git

```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt-get install git

# Windows - Download from git-scm.com
```

Verify:
```bash
git --version
```

### 4. Optional: Docker (For containerized development)

```bash
# macOS & Windows - Download Docker Desktop
# Ubuntu/Debian
sudo apt-get install docker.io docker-compose
```

## Project Setup Steps

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/scan4earn-server.git
cd scan4earn-server

# Verify you're on the correct branch
git branch -v
git log -1 --oneline
```

### Step 2: Install Dependencies

```bash
# Install npm packages
npm install

# Verify installation
npm list | head -20
ls node_modules | wc -l  # Should show many modules
```

### Step 3: Database Setup

#### Create Database

```bash
# Create database
createdb -U postgres scan4earn_db

# Or using psql
psql -U postgres -c "CREATE DATABASE scan4earn_db;"

# Verify
psql -U postgres -l | grep scan4earn
```

#### Run Migrations

```bash
# Find migrations directory
ls ../scan4earn-database-main/migrations/

# Run migrations (in order)
psql -h localhost -U postgres -d scan4earn_db -f ../scan4earn-database-main/migrations/001_initial_schema.sql
psql -h localhost -U postgres -d scan4earn_db -f ../scan4earn-database-main/migrations/002_auth_extensions.sql
# Continue for remaining migrations...

# Verify tables created
psql -h localhost -U postgres -d scan4earn_db -c "\dt"
```

### Step 4: Environment Configuration

```bash
# Copy example .env
cp .env.example .env

# Edit .env with your settings
nano .env  # or vim, code, etc.
```

Minimum required settings:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scan4earn_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# JWT Secrets (generate strong random strings)
JWT_ACCESS_SECRET=your_long_random_secret_key_for_access_token_min_32_chars
JWT_REFRESH_SECRET=your_long_random_secret_key_for_refresh_token_min_32_chars

# Server Config
PORT=8080
NODE_ENV=development
DOMAIN_BASE=localhost:8080

# Email (optional for initial setup)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

**Generate secure JWT secrets:**

```bash
# Using openssl
openssl rand -base64 32

# Or using node
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 5: Verify Database Connection

```bash
# Test database connection
node -e "
const db = require('./src/config/database');
db.query('SELECT NOW()').then(res => {
  console.log('✅ Database connected:', res.rows[0].now);
  process.exit(0);
}).catch(err => {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
});
"
```

### Step 6: Start Development Server

```bash
# Development mode with auto-reload
npm run dev

# Expected output:
# ✨ HTTP server is listening!
# 📡 Server: http://0.0.0.0:8080
# 🏥 Health: http://0.0.0.0:8080/health
```

### Step 7: Verify Server is Running

In a new terminal:

```bash
# Check health endpoint
curl http://localhost:8080/health

# Expected response:
# {"status":"healthy","server":"running","database":"connected"}
```

## IDE Configuration

### VS Code Setup

**Recommended Extensions:**
```json
{
  "extensions": [
    "dbaeumer.vscode-eslint",
    "ms-vscode.makefile-tools",
    "eamodio.gitlens",
    "ms-nodejs.vscode-node-debug-2",
    "ms-vscode.rest-client",
    "cweijan.vscode-postgres"
  ]
}
```

**Install:**
```bash
# Copy recommended extensions
code --install-extension dbaeumer.vscode-eslint
code --install-extension eamodio.gitlens
# etc...
```

**VS Code settings (`.vscode/settings.json`):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "dbaeumer.vscode-eslint",
  "[javascript]": {
    "editor.defaultFormatter": "dbaeumer.vscode-eslint"
  },
  "eslint.validate": ["javascript"],
  "files.exclude": {
    "**/node_modules": true,
    ".git": true
  },
  "debug.console.fontSize": 13,
  "terminal.integrated.fontSize": 13
}
```

**Debug Configuration (`.vscode/launch.json`):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Server",
      "program": "${workspaceFolder}/src/server.js",
      "restart": true,
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### WebStorm/IntelliJ Setup

1. Open project in WebStorm
2. Configure Node interpreter:
   - Preferences → Languages & Frameworks → Node.js and npm
   - Set Node to v22.22.0
   - Set npm version to 10.9.4+
3. Configure database:
   - View → Tool Windows → Database
   - Click "+" → PostgreSQL
   - Set connection parameters

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/__tests__/auth.integration.test.js

# Watch mode (re-run on file change)
npm run test:watch

# With coverage report
npm test -- --coverage

# E2E tests (requires E2E_TESTS_ENABLED=true)
npm run test:e2e

# Specific E2E suite
npm run test:e2e:auth
```

### Code Quality

```bash
# Linting
npm run lint

# Fix linting errors
npm run lint -- --fix

# Format code
npm run format

# Type checking (if using TypeScript)
npm run typecheck
```

### Database Tools

```bash
# Access PostgreSQL CLI
psql -h localhost -U postgres -d scan4earn_db

# Common queries
psql> \dt                    # List tables
psql> \d users               # Describe table
psql> SELECT COUNT(*) FROM users;
psql> SELECT * FROM users LIMIT 5;

# Exit
psql> \q
```

## Docker Development

### Build Docker Image

```bash
docker build -t scan4earn-server:latest .

# Verify
docker images | grep scan4earn
```

### Run with Docker Compose

```bash
# Start services (app + database)
docker-compose up -d

# View logs
docker-compose logs -f scan4earn-server

# Stop services
docker-compose down

# Remove volumes (clean database)
docker-compose down -v
```

### Access Docker PostgreSQL

```bash
docker-compose exec postgres psql -U postgres -d scan4earn_db
```

## Troubleshooting Setup

### Port 8080 Already in Use

```bash
# Find process using port 8080
lsof -i :8080

# Kill process
kill -9 <PID>

# Or use different port
PORT=8081 npm run dev
```

### PostgreSQL Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Or on macOS
brew services list | grep postgresql

# Check if database exists
psql -U postgres -l | grep scan4earn_db

# Check connection parameters in .env
cat .env | grep DB_
```

### Permission Denied Errors

```bash
# On macOS/Linux
chmod +x scripts/*.sh

# Ensure correct PostgreSQL user
psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'new_password';"
```

### node_modules Installation Issues

```bash
# Clear cache
npm cache clean --force

# Remove and reinstall
rm -rf node_modules package-lock.json
npm install

# Use specific registry if npm.js is slow
npm install --registry https://registry.npmmirror.com
```

## Development Tips

### Hot Reload
```bash
npm run dev  # Uses nodemon for automatic restart on file changes
```

### Debug Mode
```bash
# Run with debug logging
DEBUG=scan4earn:* npm run dev

# Or in Node debugger
node --inspect src/server.js
```

### API Testing

```bash
# Using curl
curl -X GET http://localhost:8080/health

# Using REST Client in VS Code (.rest files)
# Or using Postman (import API collection)

# Using httpie
http GET http://localhost:8080/health
```

### Database Migrations

```bash
# Create new migration
cat > migrations/xxx_description.sql << 'EOF'
-- Migration SQL here
EOF

# Run migration
psql -h localhost -U postgres -d scan4earn_db -f migrations/xxx_description.sql

# Check migration history
psql -h localhost -U postgres -d scan4earn_db -c "SELECT * FROM migrations;"
```

### Environment-Specific Setup

```bash
# Development (.env)
NODE_ENV=development
DEBUG=*

# Staging (.env.staging)
NODE_ENV=staging
DEBUG=app:*

# Production (.env.production)
NODE_ENV=production
DEBUG=none
```

## Next Steps

1. **Read Documentation:**
   - [Quick Start Guide](01-QUICK-START.md)
   - [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)

2. **Explore Code:**
   - Check `src/server.js` for main entry point
   - Review `src/routes/` for API structure
   - Check `src/__tests__/` for test patterns

3. **Try API Endpoints:**
   ```bash
   # Health check
   curl http://localhost:8080/health
   
   # List of available endpoints in server.js
   grep "app.use" src/server.js
   ```

4. **Create Test User:**
   ```bash
   # Use admin portal or API to create test account
   curl -X POST http://localhost:8080/api/auth/register \
     -H "Content-Type: application/json" \
     -H "X-Tenant-Slug: sandbox" \
     -d '{
       "phone": "+919876543210",
       "email": "test@example.com",
       "password": "TestPass123",
       "name": "Test User"
     }'
   ```

5. **Run Tests:**
   ```bash
   npm test
   npm run test:e2e
   ```

## Getting Help

- Check [Troubleshooting Guide](08-TROUBLESHOOTING.md)
- Review test files for usage patterns
- Check [FAQ](09-FAQ.md)
- Consult [System Architecture](../architecture/01-SYSTEM-ARCHITECTURE.md)

---

**Last Updated:** 2026-05-31  
**Status:** Production Ready
