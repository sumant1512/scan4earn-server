# MScan Features Guide

## Table of Contents

1. [Overview](#overview)
2. [User Roles](#user-roles)
3. [Super Admin Features](#super-admin-features)
4. [Tenant Admin Features](#tenant-admin-features)
5. [Tenant User Features](#tenant-user-features)
6. [Feature Comparison Matrix](#feature-comparison-matrix)
7. [Workflows](#workflows)
8. [Permission System](#permission-system)

---

## Overview

MScan is a multi-tenant SaaS platform that provides different feature sets based on user roles. The platform has three main user types: **Super Admins** (platform administrators), **Tenant Admins** (business owners), and **Tenant Users** (employees with limited access).

### Platform Purpose

MScan enables businesses to:

- Manage product catalogs with flexible templates
- Generate and distribute QR code coupons
- Track coupon redemption through multiple verification apps
- Manage credits for coupon generation
- Monitor analytics and performance
- Control user access with granular permissions

---

## User Roles

### 1. Super Admin

**Platform Administrator**

- Manages the entire MScan platform
- Creates and manages tenants (business accounts)
- Approves credit requests from tenants
- Monitors system-wide analytics
- No tenant affiliation

**Access Level:** Full platform access

---

### 2. Tenant Admin

**Business Owner/Manager**

- Manages their own tenant account
- Creates and manages products, coupons, and users
- Requests credits for coupon generation
- Views tenant-specific analytics
- Configures verification applications

**Access Level:** Full access within their tenant

---

### 3. Tenant User

**Employee with Limited Access**

- Limited access within their tenant
- Permissions assigned by Tenant Admin
- Typically view-only or specific task access
- Cannot manage users or settings

**Access Level:** Permission-based access within their tenant

---

## Super Admin Features

Super Admins have platform-level access to manage the MScan system.

### 1. Tenant Management

**Create New Tenants**

- **What:** Onboard new business accounts to the platform
- **How:**
  - Navigate to Super Admin > Tenants > Create New
  - Fill in tenant details:
    - Tenant name
    - Subdomain (unique identifier, e.g., `acme.mscan.com`)
    - Admin email (for the primary Tenant Admin)
    - Contact information
    - Initial credits
    - Settings (max products, coupons per batch, etc.)
  - Submit to create tenant and send invitation email

**View All Tenants**

- **What:** See list of all business accounts
- **Features:**
  - Search by tenant name or subdomain
  - Filter by status (Active, Inactive, Suspended)
  - View tenant statistics (products, coupons, users, credits)
  - Pagination for large tenant lists

**Edit Tenant Details**

- **What:** Modify tenant information and settings
- **Capabilities:**
  - Update tenant name and contact information
  - Adjust credit balance
  - Modify settings (product limits, feature flags)
  - Change subdomain (requires system migration)

**View Tenant Details**

- **What:** Detailed view of a specific tenant
- **Information Displayed:**
  - Tenant profile information
  - Current credit balance and transaction history
  - Total products and coupons
  - Active users and their roles
  - Recent activity log
  - Verification apps configured
  - Analytics summary

**Activate/Deactivate Tenants**

- **What:** Control tenant access to the platform
- **Use Cases:**
  - Suspend accounts for non-payment
  - Temporarily disable accounts
  - Reactivate after issue resolution

**Delete Tenants**

- **What:** Permanently remove tenant accounts
- **Warnings:** Cannot be undone, all tenant data is deleted
- **Prerequisites:** Tenant must have no active coupons or pending transactions

---

### 2. Tenant Admin Management

**Create Tenant Admins**

- **What:** Add admin users to existing tenants
- **Process:**
  - Select tenant from dropdown
  - Enter admin email address
  - System creates user with TENANT_ADMIN role
  - Sends OTP invitation email automatically

**View Tenant Admins**

- **What:** List all Tenant Admin users
- **Filters:**
  - Filter by tenant
  - Search by email
  - View last login and activity status

**View Tenant Admin Details**

- **What:** Detailed information about a Tenant Admin
- **Information:**
  - Admin profile
  - Associated tenant details
  - Permissions list
  - Activity log
  - Last login timestamp

**Deactivate/Activate Tenant Admins**

- **What:** Control Tenant Admin access
- **Use Cases:**
  - Temporary suspension
  - Account security issues
  - User role changes

---

### 3. Credit Management System

**View All Credit Requests**

- **What:** See pending credit requests from all tenants
- **Display:**
  - Request amount
  - Requesting tenant
  - Justification provided
  - Request date
  - Current tenant credit balance

**Filter Credit Requests**

- **What:** Filter pending requests by tenant
- **Purpose:** Focus on specific tenant's requests

**Approve Credit Requests**

- **What:** Grant credits to requesting tenants
- **Process:**
  - Review request details and justification
  - Click "Approve" button
  - Credits added to tenant's balance immediately
  - Tenant notified via email
  - Transaction recorded in audit log

**Reject Credit Requests**

- **What:** Deny credit requests with reason
- **Process:**
  - Click "Reject" button
  - Provide rejection reason
  - Tenant notified with reason
  - Request archived with status "REJECTED"

**View Credit Transaction History**

- **What:** Complete audit trail of all credit transactions
- **Information:**
  - Transaction type (CREDIT, DEBIT, PENDING)
  - Amount
  - Tenant
  - Description/reason
  - Approved/created by
  - Timestamp
- **Filters:**
  - Filter by tenant
  - Filter by transaction type
  - Date range filter

---

### 4. System Analytics

**System-Wide Statistics**

- **What:** High-level metrics across all tenants
- **Metrics:**
  - Total tenants (active/inactive)
  - Total coupons generated across platform
  - Total scans performed
  - Total credits in circulation
  - Total products in system
  - Platform revenue metrics

**Tenant Performance Comparison**

- **What:** Compare tenant activity and usage
- **Metrics:**
  - Coupons generated per tenant
  - Scan rates by tenant
  - Credit usage patterns
  - Most active tenants

**System Health Monitoring**

- **What:** Monitor platform performance
- **Metrics:**
  - API response times
  - Database performance
  - Error rates
  - Active user sessions

---

### 5. User Management

**View All Users**

- **What:** Platform-wide user list
- **Capabilities:**
  - Filter by tenant
  - Filter by user type (SUPER_ADMIN, TENANT_ADMIN, TENANT_USER)
  - Search by email
  - View user activity

**User Activity Monitoring**

- **What:** Track user actions across the platform
- **Information:**
  - Last login timestamps
  - Action logs
  - Failed login attempts
  - Security alerts

---

### Super Admin Dashboard

**Key Metrics Displayed:**

- Total Tenants
- Active Tenants
- Pending Credit Requests
- Total Coupons Generated (Platform-Wide)
- Total Scans Today
- Recent Activity Feed

**Quick Actions:**

- Create New Tenant
- View Pending Credit Requests
- View All Tenants
- View System Analytics

### 6. Feature Management

**Overview**

- **What:** Control feature availability across tenants for phased rollouts and premium features
- **Purpose:** Enable controlled release of new functionality, manage premium features, and customize tenant experiences
- **Access:** Super Admin only

**Create New Features**

- **What:** Define globally available features that can be enabled per tenant
- **Process:**
  1. Navigate to Super Admin > Features > Create Feature
  2. Enter feature details:
     - **Feature Code**: Unique identifier (e.g., `advanced-reporting`, `bulk-operations`)
     - **Name**: Human-readable name (e.g., "Advanced Reporting")
     - **Description**: Detailed explanation of what the feature provides
     - **Default Enabled**: Whether new tenants automatically get this feature
  3. Save to create the feature definition

**Manage Feature List**

- **What:** View and manage all defined features
- **Capabilities:**
  - Search features by code or name
  - Filter by status (Active/Inactive)
  - Edit feature details (name, description, default enabled status)
  - Activate/deactivate features globally
  - View which tenants have each feature enabled

**Enable Features for Tenants**

- **What:** Grant specific tenants access to features
- **Process:**
  1. Navigate to Super Admin > Features > Tenant Assignment
  2. Select a tenant from the list
  3. View all available features with current status
  4. Toggle features on/off for the selected tenant
  5. Changes apply immediately

**Bulk Feature Operations**

- **What:** Enable/disable features for multiple tenants at once
- **Use Cases:**
  - Roll out new features to beta tenants
  - Enable premium features for paying customers
  - Disable features during maintenance
  - Gradual feature rollout across tenant base

**Feature Analytics**

- **What:** Monitor feature adoption and usage
- **Metrics:**
  - Number of tenants with each feature enabled
  - Feature enablement over time
  - Most/least used features
  - Feature request patterns

**Best Practices**

- **Phased Rollouts**: Enable new features for power users first, then gradually expand
- **Premium Features**: Set `default_enabled: false` and manually enable for subscribers
- **Testing**: Always test features in disabled state to ensure graceful degradation
- **Communication**: Notify tenants when new features become available
- **Monitoring**: Watch for issues after feature enablement

---

## Tenant Admin Features

Tenant Admins manage their business account including products, coupons, users, and settings.

### 1. Product Catalog Management

**Create Products**

- **What:** Add new products to the catalog
- **Process:**
  1. Select product template (defines structure)
  2. Fill in product information:
     - Product name
     - Description (plain text and structured)
     - Category
     - Tags
     - Base price
     - Template-specific attributes (dynamic based on template)
  3. Define variants (optional):
     - Size, color, flavor, etc.
     - Variant-specific pricing
     - SKU and stock information
  4. Upload product images
  5. Set active status
  6. Save product

**View Products**

- **What:** List all products in the catalog
- **Features:**
  - Search by product name
  - Filter by category
  - Filter by template
  - Filter by status (active/inactive)
  - Filter by verification app
  - Pagination (20 items per page)
  - Quick actions (Edit, Delete, View Details)

**Edit Products**

- **What:** Modify existing products
- **Capabilities:**
  - Update product information
  - Change template (migrate attributes)
  - Add/remove variants
  - Update pricing
  - Change category/tags

**Delete Products**

- **What:** Remove products from catalog
- **Restrictions:** Cannot delete if product has:
  - Active coupons
  - Pending orders
  - Used coupons
- **Warning:** Deletion cannot be undone

**Product Templates**

- **What:** Define reusable product structures
- **Purpose:** Standardize product creation with predefined attributes
- **Components:**
  - Template name and description
  - Custom attributes (text, number, select, checkbox, textarea)
  - Variant definitions (e.g., Size: Small, Medium, Large)
  - Structured description fields
- **Use Case Example:**
  - "Restaurant Menu Item" template with attributes: Cuisine Type, Spice Level, Dietary Restrictions, Cooking Time
  - "Retail Product" template with attributes: Brand, Material, Dimensions, Weight

**Manage Categories**

- **What:** Organize products into categories
- **Features:**
  - Create/edit/delete categories
  - Assign products to categories
  - Nested categories (subcategories)

**Manage Tags**

- **What:** Label products with tags for organization
- **Features:**
  - Create/edit/delete tags
  - Assign multiple tags to products
  - Filter products by tags
  - Tag icons and colors

---

### 2. Coupon Generation & Management

**Generate Single Coupon**

- **What:** Create one coupon for a product
- **Process:**
  1. Select product
  2. Set points value
  3. Set expiration date (optional)
  4. Generate coupon
  5. System creates:
     - Unique coupon code
     - QR code image
     - Database record with status "DRAFT"
  6. Deducts 1 credit from tenant balance

**Generate Batch Coupons**

- **What:** Create multiple coupons at once (up to 10,000)
- **Process:**
  1. Select product(s)
  2. Set quantity (1-10,000)
  3. Set points value
  4. Set expiration date (optional)
  5. Preview credit cost
  6. Generate batch
  7. Option to activate immediately or leave as DRAFT

**Credit Cost:** 1 credit = 1 coupon

**View All Coupons**

- **What:** List all generated coupons
- **Features:**
  - Search by coupon code
  - Filter by status (DRAFT, PRINTED, ACTIVE, USED, EXPIRED)
  - Filter by product
  - Filter by verification app
  - Filter by date range
  - Pagination
  - Bulk selection for batch operations

**Coupon Status Management**

- **Statuses:**
  - **DRAFT** - Generated but not yet distributed
  - **PRINTED** - Marked as printed/distributed
  - **ACTIVE** - Activated and ready to scan
  - **USED** - Scanned and redeemed
  - **EXPIRED** - Past expiration date

- **Status Transitions:**
  - DRAFT → PRINTED (manual action)
  - PRINTED → ACTIVE (manual activation or batch activation)
  - ACTIVE → USED (when scanned)
  - ACTIVE → EXPIRED (automatic when past expiration date)

**Batch Activate Coupons**

- **What:** Activate multiple coupons at once
- **Process:**
  1. Filter coupons by status (DRAFT or PRINTED)
  2. Select coupons (checkbox selection)
  3. Click "Activate Selected"
  4. Coupons transition to ACTIVE status
  5. Ready for scanning

**Export Coupons**

- **What:** Export coupon list to CSV or PDF
- **Formats:**
  - **CSV** - Spreadsheet with coupon data
  - **PDF** - Printable format with QR codes
- **Filters Applied:** Export respects current search/filter criteria

**Preview QR Codes**

- **What:** View coupon QR codes
- **Use Cases:**
  - Verify QR code generation
  - Download individual QR codes
  - Print QR codes

---

### 3. Verification App Management

**What are Verification Apps?**

- Separate application instances that scan coupons
- Examples: Mobile app, kiosk system, POS terminal, website
- Each app has its own API key and configuration
- Allows tracking of scans by source

**Create Verification App**

- **Process:**
  1. Navigate to Verification Apps > Configure New
  2. Fill in app details:
     - App name (e.g., "Mobile App", "Store Kiosk")
     - App type (Mobile, Web, Kiosk, POS)
     - Description
     - Webhook URL (for scan notifications)
  3. Configure settings:
     - Allow duplicate scans (same coupon, same user)
     - Require user authentication
     - Scan cooldown period
     - Max scans per day
  4. Save configuration
  5. System generates unique API key

**View Verification Apps**

- **What:** List all configured verification apps
- **Display:**
  - App name and type
  - API key (masked, click to reveal)
  - Status (active/inactive)
  - Total scans
  - Last scan timestamp
  - Actions (Edit, View API Config, Regenerate Key, Delete)

**Edit Verification App**

- **What:** Modify app configuration
- **Capabilities:**
  - Update app name and description
  - Change settings
  - Update webhook URL
  - Activate/deactivate app

**View API Configuration**

- **What:** Get integration details for developers
- **Information Provided:**
  - API base URL
  - API key
  - Authentication method
  - Scan endpoint documentation
  - Code examples (cURL, JavaScript, Python)
  - Webhook payload format

**Regenerate API Key**

- **What:** Generate new API key for security
- **Process:**
  - Click "Regenerate API Key"
  - Confirm action (warns existing key will be invalidated)
  - New key generated and displayed
  - Update external applications with new key

**Delete Verification App**

- **What:** Remove verification app
- **Restrictions:** Cannot delete if app has:
  - Active scans in progress
  - Associated coupons that haven't been scanned elsewhere
- **Warning:** Scan history will be preserved but app cannot perform new scans

---

### 4. Credit Management

**View Credit Balance**

- **What:** See current available credits
- **Display:** Credit balance prominently shown in header and dashboard

**Request Credits**

- **What:** Submit request to Super Admin for more credits
- **Process:**
  1. Navigate to Credits > Request Credits
  2. Enter requested amount
  3. Provide justification (required):
     - Explain business need
     - Expected coupon generation volume
     - Campaign details
  4. Submit request
  5. Request goes to Super Admin for approval
  6. Receive email notification when approved/rejected

**View Credit Transaction History**

- **What:** Audit trail of credit usage
- **Transaction Types:**
  - **CREDIT** - Credits added (approved requests)
  - **DEBIT** - Credits used (coupon generation)
  - **PENDING** - Pending approval requests
- **Information Displayed:**
  - Transaction date
  - Type
  - Amount
  - Balance before/after
  - Description/reason
  - Created by (for debits)
- **Filters:**
  - Filter by type
  - Date range filter

**Credit Usage Tracking**

- **What:** Monitor credit consumption
- **Insights:**
  - Credits used this month
  - Average daily usage
  - Projected usage
  - Low credit warnings

---

### 5. User Management

**Create Tenant Users**

- **What:** Add employees to the tenant account
- **Process:**
  1. Navigate to Users > Create User
  2. Enter user email
  3. Select role:
     - TENANT_ADMIN (full access)
     - TENANT_USER (limited access)
  4. Assign initial permissions (for TENANT_USER)
  5. Save user
  6. System sends OTP invitation email

**View Tenant Users**

- **What:** List all users in the tenant
- **Features:**
  - Search by email
  - Filter by role
  - Filter by status (active/inactive)
  - View permissions summary
  - View last login

**Edit Tenant Users**

- **What:** Modify user details
- **Capabilities:**
  - Change user role
  - Update permissions
  - Activate/deactivate user
  - Reset authentication (send new OTP)

**Manage User Permissions**

- **What:** Grant or revoke specific permissions
- **Permission Categories:**
  - **Products:** VIEW_PRODUCTS, CREATE_PRODUCTS, EDIT_PRODUCTS, DELETE_PRODUCTS
  - **Coupons:** VIEW_COUPONS, CREATE_COUPONS, ACTIVATE_COUPONS, DELETE_COUPONS
  - **Users:** VIEW_TENANT_USERS, MANAGE_TENANT_USERS, ASSIGN_PERMISSIONS
  - **Analytics:** VIEW_ANALYTICS, EXPORT_REPORTS
  - **Verification Apps:** VIEW_APPS, MANAGE_APPS
  - **Credits:** VIEW_CREDITS, REQUEST_CREDITS
- **Interface:**
  - Grouped checkboxes by category
  - Select/deselect individual permissions
  - Bulk assign/revoke by category
  - Permission descriptions
- **Real-time Updates:** Changes take effect immediately

**Delete Tenant Users**

- **What:** Remove users from the tenant
- **Restrictions:** Cannot delete:
  - Your own account (must be done by another admin)
  - Last remaining Tenant Admin
- **Warning:** Cannot be undone, user loses access immediately

**User Roles:**

- **TENANT_ADMIN:** Full access to all tenant features, cannot be restricted by permissions
- **TENANT_USER:** Limited access, permissions explicitly granted

---

### 6. Analytics & Reporting

**Tenant Analytics Dashboard**

- **Key Metrics:**
  - Total Products
  - Total Coupons Generated
  - Total Scans (all-time and today)
  - Active Coupons
  - Redemption Rate (scans / active coupons)
  - Credit Balance and Usage Trend

**Coupon Performance Analytics**

- **Charts:**
  - Coupons generated over time (line chart)
  - Scans per day (bar chart)
  - Redemption rate by product (pie chart)
  - Top performing products (table)

**Product Analytics**

- **Metrics:**
  - Most popular products (by coupons generated)
  - Products with highest redemption rates
  - Products with lowest redemption rates
  - Product category breakdown

**Scan Analytics**

- **Metrics:**
  - Scans by verification app
  - Scans by time of day
  - Scans by day of week
  - Geographic distribution (if available)

**Date Range Selection**

- **What:** Filter analytics by time period
- **Options:**
  - Last 7 days
  - Last 30 days
  - Last 90 days
  - This year
  - Custom date range

**Export Reports**

- **What:** Download analytics data
- **Formats:**
  - CSV (raw data)
  - PDF (formatted report)
- **Report Types:**
  - Coupon generation report
  - Scan activity report
  - Product performance report
  - Credit usage report

---

### 7. Scan History

**View All Scans**

- **What:** List of all coupon scans
- **Information:**
  - Scan timestamp
  - Coupon code
  - Product name
  - Points awarded
  - Scanned by (verification app)
  - User who scanned (if applicable)
  - Location (if available)
- **Filters:**
  - Filter by verification app
  - Filter by product
  - Date range filter
  - Search by coupon code

**Scan Details**

- **What:** Detailed information about a specific scan
- **Information:**
  - Full scan record
  - Product details
  - Coupon details
  - User information
  - Metadata (device, IP address, etc.)

---

### 8. Profile & Settings

**Update Profile**

- **What:** Manage personal account settings
- **Editable Fields:**
  - Full name
  - Email (requires verification)
  - Phone number
  - Notification preferences

**Tenant Settings**

- **What:** Configure tenant-level settings
- **Settings Available:**
  - Tenant name
  - Contact information
  - Logo upload
  - Branding colors
  - Default coupon expiration period
  - Email notification preferences

**Change Password** _(Not applicable - OTP-based auth)_

- MScan uses OTP-based authentication, no passwords required

**Notification Preferences**

- **What:** Control email notifications
- **Options:**
  - Credit balance low warning
  - New credit request approved/rejected
  - New user added
  - Daily scan summary
  - Weekly analytics summary

---

### Tenant Admin Dashboard

**Key Metrics Displayed:**

- Credit Balance
- Total Products
- Total Coupons Generated
- Active Coupons
- Scans Today
- Scans This Month
- Active Verification Apps

**Quick Actions:**

- Create Product
- Generate Coupons
- Request Credits
- View Analytics
- Manage Users

**Recent Activity:**

- Latest scans
- Recent coupon activations
- New users added
- Credit transactions

---

## Tenant User Features

Tenant Users have restricted access based on permissions granted by Tenant Admin.

### Permission-Based Access

**Typical Tenant User Roles:**

**1. Product Manager**

- **Permissions:**
  - VIEW_PRODUCTS
  - CREATE_PRODUCTS
  - EDIT_PRODUCTS
- **Capabilities:**
  - View product catalog
  - Create new products
  - Edit existing products
  - Cannot delete products or manage users

**2. Coupon Coordinator**

- **Permissions:**
  - VIEW_COUPONS
  - CREATE_COUPONS
  - ACTIVATE_COUPONS
- **Capabilities:**
  - View coupon list
  - Generate new coupons
  - Activate draft coupons
  - Cannot delete coupons or modify users

**3. Analyst**

- **Permissions:**
  - VIEW_ANALYTICS
  - EXPORT_REPORTS
  - VIEW_PRODUCTS
  - VIEW_COUPONS
- **Capabilities:**
  - View all analytics dashboards
  - Export reports
  - View products and coupons (read-only)
  - Cannot create or modify anything

**4. Store Manager**

- **Permissions:**
  - VIEW_PRODUCTS
  - VIEW_COUPONS
  - VIEW_APPS
- **Capabilities:**
  - View products
  - View coupon status
  - View verification app information
  - Read-only access for operational purposes

### Common Tenant User Actions

**View Products** _(with VIEW_PRODUCTS permission)_

- Access product list
- Search and filter products
- View product details
- Cannot create, edit, or delete

**View Coupons** _(with VIEW_COUPONS permission)_

- Access coupon list
- Search and filter coupons
- View coupon details and QR codes
- Cannot generate or activate coupons

**View Analytics** _(with VIEW_ANALYTICS permission)_

- Access analytics dashboard
- View metrics and charts
- Cannot export reports (unless EXPORT_REPORTS granted)

**Request Credits** _(with REQUEST_CREDITS permission)_

- Submit credit requests
- View request status
- Cannot approve requests

---

## Feature Comparison Matrix

| Feature                 | Super Admin | Tenant Admin | Tenant User      |
| ----------------------- | ----------- | ------------ | ---------------- |
| **Tenant Management**   |
| Create Tenants          | ✅          | ❌           | ❌               |
| Edit Tenants            | ✅          | Own Only     | ❌               |
| View All Tenants        | ✅          | Own Only     | ❌               |
| Delete Tenants          | ✅          | ❌           | ❌               |
| **Credit Management**   |
| Approve Credit Requests | ✅          | ❌           | ❌               |
| Request Credits         | ❌          | ✅           | Permission-Based |
| View Credit History     | All Tenants | Own Only     | Permission-Based |
| **Product Management**  |
| Create Products         | ❌          | ✅           | Permission-Based |
| Edit Products           | ❌          | ✅           | Permission-Based |
| Delete Products         | ❌          | ✅           | ❌               |
| View Products           | ❌          | ✅           | Permission-Based |
| Manage Templates        | ❌          | ✅           | Permission-Based |
| Manage Categories       | ❌          | ✅           | Permission-Based |
| **Coupon Management**   |
| Generate Coupons        | ❌          | ✅           | Permission-Based |
| Activate Coupons        | ❌          | ✅           | Permission-Based |
| Delete Coupons          | ❌          | ✅           | ❌               |
| View Coupons            | ❌          | ✅           | Permission-Based |
| Export Coupons          | ❌          | ✅           | Permission-Based |
| **User Management**     |
| Create Tenant Admins    | ✅          | ❌           | ❌               |
| Create Tenant Users     | ❌          | ✅           | Permission-Based |
| Assign Permissions      | ❌          | ✅           | ❌               |
| Deactivate Users        | ✅          | Own Tenant   | ❌               |
| **Verification Apps**   |
| Create Apps             | ❌          | ✅           | Permission-Based |
| Generate API Keys       | ❌          | ✅           | ❌               |
| View Apps               | ❌          | ✅           | Permission-Based |
| **Analytics**           |
| System-Wide Analytics   | ✅          | ❌           | ❌               |
| Tenant Analytics        | All Tenants | Own Only     | Permission-Based |
| Export Reports          | ✅          | ✅           | Permission-Based |
| **Scan History**        |
| View All Scans          | All Tenants | Own Only     | Permission-Based |

**Legend:**

- ✅ Full Access
- ❌ No Access
- Permission-Based: Access controlled by Tenant Admin via permission assignments
- Own Only: Access limited to their own tenant data
- All Tenants: Access to all tenant data

---

## Workflows

### Workflow 1: Tenant Onboarding (Super Admin)

1. **Create Tenant Account**
   - Super Admin navigates to Tenants > Create New
   - Fills in tenant details and subdomain
   - Assigns initial credits
   - Saves tenant

2. **Create Tenant Admin**
   - System automatically creates Tenant Admin user
   - OTP invitation email sent to admin email

3. **Tenant Admin First Login**
   - Tenant Admin receives email
   - Clicks link and enters OTP
   - Redirected to tenant dashboard

4. **Initial Configuration**
   - Tenant Admin sets up profile
   - Creates verification apps
   - Creates product categories and templates

---

### Workflow 2: Product Creation & Coupon Generation (Tenant Admin)

1. **Create Product Template** (One-time setup)
   - Navigate to Templates > Create New
   - Define template name (e.g., "Restaurant Menu Item")
   - Add custom attributes (Cuisine, Spice Level, etc.)
   - Define variant dimensions (Size, Options, etc.)
   - Save template

2. **Create Product**
   - Navigate to Products > Create New
   - Select template
   - Fill in product details
   - Add variants (if applicable)
   - Upload images
   - Save product

3. **Generate Coupons**
   - Navigate to Coupons > Create New
   - Select product(s)
   - Choose quantity (single or batch)
   - Set points value
   - Set expiration date
   - Verify credit cost
   - Generate coupons
   - Coupons created in DRAFT status

4. **Activate Coupons**
   - Navigate to Coupons list
   - Filter by status = DRAFT
   - Select coupons to activate
   - Click "Activate Selected"
   - Coupons now ACTIVE and ready to scan

---

### Workflow 3: Credit Request & Approval

1. **Tenant Admin Requests Credits**
   - Navigate to Credits > Request Credits
   - Enter amount (e.g., 10,000)
   - Provide justification (e.g., "Q1 marketing campaign, expect 10K coupons")
   - Submit request
   - Request status: PENDING

2. **Super Admin Reviews Request**
   - Super Admin sees notification of new request
   - Navigates to Credits > Pending Requests
   - Reviews request details:
     - Tenant name
     - Requested amount
     - Justification
     - Current balance
     - Request history

3. **Super Admin Approves Request**
   - Clicks "Approve" button
   - Credits immediately added to tenant balance
   - Transaction recorded in history
   - Tenant Admin receives email notification

4. **Tenant Admin Receives Credits**
   - Email notification received
   - Credit balance updated in dashboard
   - Can now generate coupons

**Alternative: Rejection**

- Super Admin clicks "Reject"
- Provides rejection reason
- Tenant Admin receives email with reason
- Can submit new request with clarification

---

### Workflow 4: Coupon Scanning (External App Integration)

1. **Setup Verification App**
   - Tenant Admin creates verification app
   - Configures settings (app type, webhook, etc.)
   - Receives API key

2. **Integrate API**
   - Developer integrates MScan API into mobile app/kiosk
   - Uses API key for authentication
   - Implements scan endpoint

3. **End User Scans Coupon**
   - User presents QR code coupon
   - Verification app scans QR code
   - App sends scan request to MScan API with:
     - Coupon code
     - API key
     - User identifier (optional)
     - Metadata (location, device, etc.)

4. **MScan Validates & Records**
   - API validates:
     - Coupon exists and is ACTIVE
     - Not already used
     - Not expired
     - Belongs to this tenant
   - If valid:
     - Updates coupon status to USED
     - Records scan in scan_history
     - Returns success with points value
     - Sends webhook notification (if configured)
   - If invalid:
     - Returns error with reason
     - Does not record scan

5. **Verification App Displays Result**
   - Shows success message with points awarded
   - Or shows error message (already used, expired, etc.)

---

### Workflow 5: User Management with Permissions (Tenant Admin)

1. **Create Tenant User**
   - Navigate to Users > Create User
   - Enter email: `employee@acme.com`
   - Select role: TENANT_USER
   - Save user
   - OTP invitation sent

2. **Assign Permissions**
   - Navigate to Users > List
   - Click "Manage Permissions" on user
   - View grouped permissions
   - Select permissions:
     - ☑ VIEW_PRODUCTS
     - ☑ CREATE_PRODUCTS
     - ☑ EDIT_PRODUCTS
     - ☐ DELETE_PRODUCTS
   - Save permissions

3. **User Logs In**
   - User receives email invitation
   - Enters OTP to verify
   - Redirected to dashboard

4. **User Accesses Features**
   - Sees Products menu (VIEW_PRODUCTS granted)
   - Can create new products (CREATE_PRODUCTS granted)
   - Can edit products (EDIT_PRODUCTS granted)
   - Cannot see Delete button (DELETE_PRODUCTS not granted)
   - Cannot see Users menu (VIEW_TENANT_USERS not granted)

---

## Permission System

### Permission Model

**Permission-Based Authorization** controls what Tenant Users can access.

**Key Concepts:**

- **Super Admins** have all permissions automatically
- **Tenant Admins** have all permissions within their tenant
- **Tenant Users** must be explicitly granted permissions
- Permissions are assigned per user
- Permissions take effect immediately

### Available Permissions

**Product Management:**

```
VIEW_PRODUCTS          - View product list and details
CREATE_PRODUCTS        - Create new products
EDIT_PRODUCTS          - Modify existing products
DELETE_PRODUCTS        - Delete products
```

**Template Management:**

```
VIEW_TEMPLATES         - View template list
CREATE_TEMPLATES       - Create new templates
EDIT_TEMPLATES         - Modify templates
DELETE_TEMPLATES       - Delete templates
```

**Category & Tag Management:**

```
MANAGE_CATEGORIES      - Create/edit/delete categories
MANAGE_TAGS            - Create/edit/delete tags
```

**Coupon Management:**

```
VIEW_COUPONS           - View coupon list and details
CREATE_COUPONS         - Generate coupons
ACTIVATE_COUPONS       - Activate draft coupons
DELETE_COUPONS         - Delete coupons
EXPORT_COUPONS         - Export coupon data
```

**Verification Apps:**

```
VIEW_APPS              - View verification app list
MANAGE_APPS            - Create/edit/delete apps
REGENERATE_API_KEYS    - Regenerate API keys
```

**User Management:**

```
VIEW_TENANT_USERS      - View user list
MANAGE_TENANT_USERS    - Create/edit/delete users
ASSIGN_PERMISSIONS     - Assign/revoke permissions
```

**Credit Management:**

```
VIEW_CREDITS           - View credit balance and history
REQUEST_CREDITS        - Submit credit requests
```

**Analytics:**

```
VIEW_ANALYTICS         - View analytics dashboard
EXPORT_REPORTS         - Export analytics reports
```

**Scan History:**

```
VIEW_SCANS             - View scan history
EXPORT_SCANS           - Export scan data
```

### Permission Enforcement

**Frontend Enforcement:**

- Menu items hidden if user lacks permission
- Action buttons disabled/hidden
- Route guards prevent unauthorized access
- Components check permissions before rendering features

**Backend Enforcement:**

- Middleware validates permissions before processing requests
- API returns 403 Forbidden if permission missing
- Database queries filtered by user permissions
- Audit logs track permission-based access

**Example Permission Check:**

```typescript
// Frontend (Component)
hasCreatePermission(): boolean {
  return this.authService.hasPermission('CREATE_PRODUCTS');
}

// Template
<button *ngIf="hasCreatePermission()" (click)="createProduct()">
  Create Product
</button>

// Backend (Middleware)
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    if (req.user.userType === 'SUPER_ADMIN') {
      return next(); // Super Admin bypasses
    }

    const hasPermission = req.user.permissions.includes(requiredPermission);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }

    next();
  };
};

// Route
router.post('/products',
  authenticate,
  checkPermission('CREATE_PRODUCTS'),
  productController.createProduct
);
```

---

## Summary

### Super Admin: Platform Management

- Onboard and manage tenants
- Approve credit requests
- Monitor system-wide activity
- Create tenant admins

### Tenant Admin: Business Management

- Manage product catalog with templates
- Generate and distribute coupons
- Configure verification apps
- Manage tenant users and permissions
- Request credits
- View analytics

### Tenant User: Task-Specific Access

- Permission-based access to features
- Typically view-only or specific tasks
- Cannot manage users or settings
- Controlled by Tenant Admin

---

**Document Version:** 1.0
**Last Updated:** 2026-01-26
**Maintained By:** MScan Development Team
