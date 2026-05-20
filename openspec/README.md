# MScan OpenSpec Documentation

This directory contains the complete OpenSpec documentation for the MScan project, following the spec-driven development workflow.

---

## 📁 Directory Structure

```
openspec/
├── AGENTS.md              # Instructions for AI agents (OpenSpec workflow)
├── project.md             # Project context, tech stack, conventions
├── README.md              # This file
├── specs/                 # Current specifications (what IS built)
│   ├── authentication/
│   ├── coupon-management/
│   ├── credit-system/
│   ├── external-apis/
│   ├── multi-tenant/
│   ├── product-catalog/
│   ├── scanning-system/
│   ├── tenant-management/
│   ├── user-management/
│   └── verification-apps/
└── changes/               # Proposals for future changes
    └── archive/           # Completed changes
```

---

## 📋 Available Specifications

### Core Platform
1. **multi-tenant** (4 requirements)
   - Tenant data isolation
   - Subdomain routing
   - JWT token tenant context
   - Multi-tenant scalability

2. **authentication** (5 requirements)
   - OTP-based authentication
   - JWT token management
   - Role-based access control (SUPER_ADMIN, TENANT_ADMIN, TENANT_USER)
   - Fine-grained permissions
   - Logout and token revocation

### Tenant Management
3. **tenant-management** (6 requirements)
   - Tenant creation
   - Tenant admin auto-creation
   - Settings configuration (JSONB)
   - Activation/deactivation
   - Statistics and monitoring
   - Initial credit allocation

4. **credit-system** (5 requirements)
   - Credit request submission
   - Credit request approval/rejection
   - Credit deduction on coupon generation
   - Transaction history
   - Credit balance display

5. **user-management** (7 requirements)
   - Tenant user creation
   - Granular permission assignment
   - Permission-based UI rendering
   - User status management
   - Multiple tenant admins support
   - User activity visibility
   - User deletion safeguards

### Product & Coupon Management
6. **product-catalog** (6 requirements)
   - Product template system
   - Dynamic attributes (JSONB)
   - Product variants
   - Tagging and categorization
   - Structured descriptions
   - CRUD operations

7. **coupon-management** (7 requirements)
   - Batch coupon generation (up to 10,000)
   - QR code generation with embedded data
   - Lifecycle management (DRAFT → ACTIVE → USED → EXPIRED)
   - Batch activation
   - Expiration handling
   - Export capabilities (CSV/PDF)
   - Credit deduction

### Verification & Scanning
8. **verification-apps** (7 requirements)
   - Multiple apps per tenant
   - API key authentication
   - App-specific configuration (JSONB)
   - App types (MOBILE, WEB, KIOSK, POS)
   - App-scoped product access
   - Activation/deactivation
   - Deletion safeguards

9. **scanning-system** (6 requirements)
   - External App API (third-party with API keys)
   - Mobile Scan API (JWT authentication)
   - Public Scan API (OTP verification)
   - Scan validation rules
   - Points/credits award
   - Scan history tracking

### External APIs
10. **external-apis** (7 requirements)
    - External App API with API key auth
    - Mobile Scan API with JWT auth
    - Public Scan API with OTP
    - RESTful JSON standards
    - Comprehensive error handling
    - Rate limiting
    - API documentation

---

## 📊 Validation Status

All specifications have been validated and are passing:

```bash
✓ spec/authentication     (5 requirements)
✓ spec/coupon-management  (7 requirements)
✓ spec/credit-system      (5 requirements)
✓ spec/external-apis      (7 requirements)
✓ spec/multi-tenant       (4 requirements)
✓ spec/product-catalog    (6 requirements)
✓ spec/scanning-system    (6 requirements)
✓ spec/tenant-management  (6 requirements)
✓ spec/user-management    (7 requirements)
✓ spec/verification-apps  (7 requirements)

Total: 10 specs, 60 requirements
```

---

## 🔧 Common Commands

```bash
# List all specs
openspec list --specs

# Show a specific spec
openspec show <spec-name> --type spec

# Validate all specs
openspec validate --specs

# List active changes
openspec list

# Create a new change proposal
# (Follow the workflow in AGENTS.md)
```

---

## 📖 For AI Assistants

When working on this project:

1. **Read First**: Check `project.md` for conventions and tech stack
2. **Understand Workflow**: Read `AGENTS.md` for the 3-stage workflow
3. **Check Specs**: Review relevant specs in `specs/` before coding
4. **Create Proposals**: Use OpenSpec workflow for new features/changes
5. **Validate**: Always run `openspec validate --strict` before approval

---

## ✅ Spec Format

Each spec follows this structure:

```markdown
# Capability Name

## Purpose
Brief description of what this capability does.

## Requirements

### Requirement: Clear Requirement Statement
The system SHALL provide [feature].

#### Scenario: Descriptive scenario name
- **WHEN** user performs action
- **THEN** expected result occurs
- **AND** additional expected result
```

---

## 🚀 Next Steps

- All implemented features are now documented in proper OpenSpec format
- Use `openspec` CLI to manage specifications
- Follow the proposal workflow for new features
- Keep specs in sync with code changes

---

## Documentation Navigation

For additional comprehensive documentation, see:
- **API Reference**: `docs/API_REFERENCE.md`
- **Database Design**: `docs/DATABASE_DESIGN.md`
- **Setup Guide**: `docs/SETUP.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Components Guide**: `docs/COMPONENTS_GUIDE.md`

---

**Last Updated**: February 1, 2026
**OpenSpec Version**: Latest
**Total Specs**: 10
**Total Requirements**: 60
