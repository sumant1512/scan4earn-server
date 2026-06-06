# Complete Testing Guide - MScan Application

## 📋 Overview

MScan has **two types of E2E tests**:

1. **Backend API E2E Tests** (Jest + Supertest) - Tests API endpoints directly
2. **Frontend UI E2E Tests** (Playwright) - Tests browser UI with headless/headed modes

---

## 🎯 Test Types Explained

### **1. Backend API E2E Tests**
**Location**: `mscan-server/src/__tests__/*-e2e.test.js`
**Tool**: Jest + Supertest
**What it tests**: API endpoints, database operations, business logic
**Browser required**: ❌ No (API tests only)
**Headless/Headed modes**: ❌ Not applicable (no browser)

#### Files:
```
mscan-server/src/__tests__/
├── e2e.test.js                     (Auth & OTP - 11 tests)
├── tenant-admin-e2e.test.js        (Tenants & Credits - 41 tests)
├── template-e2e.test.js            (Templates - 35+ tests)
├── verification-app-e2e.test.js    (Apps - 40+ tests)
├── product-e2e.test.js             (Products - 70+ tests)
└── category-e2e.test.js            (Categories - 50+ tests)
```

---

### **2. Frontend UI E2E Tests**
**Location**: `mscan-e2e/tests/`
**Tool**: Playwright
**What it tests**: User interface, user flows, browser interactions
**Browser required**: ✅ Yes (Chromium/Firefox/Safari)
**Headless/Headed modes**: ✅ Yes (can run with or without visible browser)

#### Structure:
```
mscan-e2e/
├── playwright.config.ts
├── tests/
│   ├── auth/
│   ├── super-admin/
│   └── tenant-admin/
└── package.json
```

---

## 🚀 Running Tests

### **Backend API E2E Tests** (No headless/headed - API only)

```bash
cd mscan-server

# Run all backend E2E tests
npm run test:e2e:all

# Run specific test files
npm run test:e2e:auth          # Auth & OTP tests
npm run test:e2e:tenants       # Tenant & credit tests
npm run test:e2e:templates     # Template tests
npm run test:e2e:apps          # Verification app tests
npm run test:e2e:products      # Product tests
npm run test:e2e:categories    # Category tests

# Run with verbose output
npm run test:e2e:verbose

# Run with coverage
npm run test:e2e:coverage

# Watch mode (re-run on changes)
npm run test:e2e:watch
```

---

### **Frontend UI E2E Tests** (With headless/headed modes)

```bash
cd mscan-e2e

# === HEADLESS MODE (no visible browser) ===
npm run test                        # Run all tests headless
npm run test:headless               # Same as above
npm run test:all:headless           # All tests headless

# Specific modules headless
npm run test:super-admin:headless
npm run test:tenant-admin:headless
npm run test:auth:headless

# === HEADED MODE (visible browser) ===
npm run test:headed                 # Run all tests with visible browser
npm run test:all:headed             # Same as above

# Specific modules headed
npm run test:super-admin            # Headed mode
npm run test:tenant-admin           # Headed mode
npm run test:auth                   # Headed mode

# === DEBUG & UI MODES ===
npm run test:debug                  # Debug mode (step through tests)
npm run test:ui                     # Interactive UI mode

# === BROWSER-SPECIFIC ===
npm run test:chrome:headless        # Chrome only, headless
npm run test:chrome:headed          # Chrome only, headed

# === REPORTS ===
npm run report                      # Show test report
npm run test:verbose                # Verbose output
npm run test:verbose:headed         # Verbose + headed
```

---

## 📊 Quick Reference

| Task | Backend API | Frontend UI |
|------|-------------|-------------|
| **Test API endpoints** | ✅ `npm run test:e2e:all` | ❌ Not applicable |
| **Test UI flows** | ❌ Not applicable | ✅ `npm run test:headed` |
| **No browser needed** | ✅ Yes | ❌ Requires browser |
| **Headless mode** | N/A | ✅ `npm run test:headless` |
| **Headed mode** | N/A | ✅ `npm run test:headed` |
| **Debug mode** | `npm run test:e2e:watch` | ✅ `npm run test:debug` |
| **Location** | `mscan-server/src/__tests__/` | `mscan-e2e/tests/` |

---

## 🎨 When to Use Each

### **Use Backend API E2E Tests when:**
- ✅ Testing API endpoints
- ✅ Testing database operations
- ✅ Testing business logic
- ✅ Testing authentication/authorization
- ✅ Testing data validation
- ✅ Testing CRUD operations
- ✅ Fast execution required
- ✅ No UI needed

### **Use Frontend UI E2E Tests when:**
- ✅ Testing user workflows
- ✅ Testing UI components
- ✅ Testing form submissions
- ✅ Testing navigation
- ✅ Testing visual elements
- ✅ Testing responsive design
- ✅ Need to see browser interaction
- ✅ Testing JavaScript/Angular behavior

---

## 🔧 Setup Requirements

### **Backend API E2E Tests:**
```bash
cd mscan-server

# Install dependencies
npm install

# Setup database
npm run db:setup

# Set environment variable
export E2E_TESTS_ENABLED=true

# Run tests
npm run test:e2e:all
```

### **Frontend UI E2E Tests:**
```bash
cd mscan-e2e

# Install dependencies
npm install

# Install browsers (first time only)
npm run install:browsers

# Ensure backend is running
cd ../mscan-server && npm start

# Ensure frontend is running
cd ../mscan-client && npm start

# Run tests (in mscan-e2e folder)
npm run test:headed  # or test:headless
```

---

## 📁 Project Structure

```
mscan/
├── mscan-server/              # Backend
│   ├── src/
│   │   └── __tests__/         # ✅ Backend API E2E tests (NEW)
│   │       ├── e2e.test.js
│   │       ├── tenant-admin-e2e.test.js
│   │       ├── template-e2e.test.js         # ✅ NEW
│   │       ├── verification-app-e2e.test.js # ✅ NEW
│   │       ├── product-e2e.test.js          # ✅ NEW
│   │       └── category-e2e.test.js         # ✅ NEW
│   └── package.json           # Backend test scripts
│
├── mscan-e2e/                 # Frontend UI E2E tests
│   ├── tests/                 # ✅ Playwright UI tests
│   │   ├── auth/
│   │   ├── super-admin/
│   │   └── tenant-admin/
│   ├── playwright.config.ts
│   └── package.json           # Frontend test scripts (headless/headed)
│
└── mscan-client/              # Frontend
    └── src/
```

---

## ✅ Headless vs Headed Mode (Frontend Only)

### **Headless Mode:**
```bash
npm run test:headless
# or
npm run test:all:headless
```
- ✅ Faster execution
- ✅ No browser window visible
- ✅ Ideal for CI/CD
- ✅ Lower resource usage
- ❌ Can't see what's happening

### **Headed Mode:**
```bash
npm run test:headed
# or
npm run test:all:headed
```
- ✅ Browser window visible
- ✅ See test execution in real-time
- ✅ Easier debugging
- ✅ See visual feedback
- ❌ Slower execution
- ❌ Higher resource usage

---

## 🐛 Debugging

### **Backend API Tests:**
```bash
# Run single test
npm run test:e2e:templates -- -t "Should create template"

# Run with verbose output
npm run test:e2e:verbose

# Watch mode
npm run test:e2e:watch
```

### **Frontend UI Tests:**
```bash
# Debug mode (step through)
npm run test:debug

# UI mode (interactive)
npm run test:ui

# Headed mode (see browser)
npm run test:headed

# Single test headed
npx playwright test tests/auth/login.spec.ts --headed
```

---

## 📊 Test Coverage Summary

### **Backend API E2E Tests:**
| Module | Tests | File |
|--------|-------|------|
| Auth & OTP | 11 | `e2e.test.js` |
| Tenants & Credits | 41 | `tenant-admin-e2e.test.js` |
| Templates | 35+ | `template-e2e.test.js` |
| Verification Apps | 40+ | `verification-app-e2e.test.js` |
| Products | 70+ | `product-e2e.test.js` |
| Categories | 50+ | `category-e2e.test.js` |
| **TOTAL** | **247+** | **6 files** |

### **Frontend UI E2E Tests:**
| Module | Location |
|--------|----------|
| Authentication | `tests/auth/` |
| Super Admin | `tests/super-admin/` |
| Tenant Admin | `tests/tenant-admin/` |

---

## 🎯 CI/CD Integration

### **Backend API Tests (CI):**
```yaml
- name: Run Backend E2E Tests
  run: cd mscan-server && npm run test:e2e:all
  env:
    E2E_TESTS_ENABLED: true
    DB_HOST: localhost
    DB_NAME: mscan_test
```

### **Frontend UI Tests (CI - Headless):**
```yaml
- name: Run Frontend E2E Tests
  run: cd mscan-e2e && npm run test:headless
```

---

## 🎉 Summary

**You now have TWO types of E2E tests:**

1. **Backend API E2E** (`mscan-server/src/__tests__/`)
   - 247+ scenarios
   - API endpoints
   - Database operations
   - No browser required
   - ❌ No headless/headed modes (API only)

2. **Frontend UI E2E** (`mscan-e2e/tests/`)
   - Playwright tests
   - UI workflows
   - Browser required
   - ✅ **Headless/Headed modes available**

**Both are important and test different layers of your application!**

---

## 📚 Related Documentation

- `NEW_E2E_TESTS_SUMMARY.md` - Backend API E2E tests summary
- `RUN_E2E_TESTS.md` - Quick run guide for backend tests
- `CURRENT_E2E_TEST_COVERAGE.md` - Complete coverage details
- `mscan-e2e/README.md` - Frontend Playwright tests guide

---

**Last Updated**: 2026-02-13
**Backend API Tests**: 247+ scenarios
**Frontend UI Tests**: Playwright with headless/headed modes
