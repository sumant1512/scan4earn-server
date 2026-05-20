# User Management

## Purpose
Tenant Admins can create and manage users within their tenant with three user types (SUPER_ADMIN, TENANT_ADMIN, TENANT_USER) and granular permission controls for TENANT_USER role.

---

## Requirements

### Requirement: Tenant User Creation
The system SHALL allow TENANT_ADMIN users to create new users within their tenant with specific roles.

#### Scenario: Create Tenant Admin user
- **WHEN** a TENANT_ADMIN creates a new user with role TENANT_ADMIN
- **THEN** the system SHALL:
  - Create user account with email and tenant association
  - Set user_type to TENANT_ADMIN
  - Generate OTP invitation
  - Send invitation email
  - NOT require permission assignment (TENANT_ADMIN has full access)

#### Scenario: Create Tenant User with permissions
- **WHEN** a TENANT_ADMIN creates a new user with role TENANT_USER
- **THEN** the system SHALL:
  - Create user account
  - Set user_type to TENANT_USER
  - Prompt for initial permission selection
  - Create permission assignments in `user_permissions` table
  - Send invitation email with login instructions

#### Scenario: Email uniqueness validation
- **WHEN** creating a user with email already in use
- **THEN** the system SHALL reject with error "Email already exists"
- **AND** suggest using a different email

---

### Requirement: Granular Permission Assignment
The system SHALL support assigning and revoking individual permissions for TENANT_USER roles.

#### Scenario: Assign permission to user
- **WHEN** a TENANT_ADMIN assigns permission `CREATE_PRODUCTS` to a TENANT_USER
- **THEN** the system SHALL:
  - Insert record in `user_permissions` table
  - Validate permission code exists
  - Update user's permission cache
  - The user SHALL immediately gain access to create products

#### Scenario: Revoke permission from user
- **WHEN** a TENANT_ADMIN revokes permission `DELETE_COUPONS` from a TENANT_USER
- **THEN** the system SHALL:
  - Delete record from `user_permissions` table
  - Update user's permission cache
  - Frontend SHALL hide delete buttons
  - API SHALL reject delete requests with 403 Forbidden

#### Scenario: Bulk permission assignment
- **WHEN** a TENANT_ADMIN selects multiple permissions ["VIEW_PRODUCTS", "CREATE_PRODUCTS", "EDIT_PRODUCTS"]
- **THEN** the system SHALL assign all permissions in a single operation
- **AND** return updated permission list

---

### Requirement: Permission-Based UI Rendering
The system SHALL dynamically show/hide UI elements based on user permissions.

#### Scenario: Hide features without permission
- **WHEN** a TENANT_USER without `DELETE_PRODUCTS` permission views product list
- **THEN** the frontend SHALL:
  - Hide delete buttons
  - Disable delete action in dropdown menus
  - Show view/edit buttons if those permissions exist

#### Scenario: Show all features for TENANT_ADMIN
- **WHEN** a TENANT_ADMIN views any page
- **THEN** the frontend SHALL show all features
- **AND** NOT check individual permissions

---

### Requirement: User Status Management
The system SHALL allow activating and deactivating users without deletion.

#### Scenario: Deactivate user
- **WHEN** a TENANT_ADMIN deactivates a TENANT_USER
- **THEN** the system SHALL:
  - Set is_active = false
  - Revoke all refresh tokens
  - Prevent login with error "Account deactivated"
  - Preserve user data and permission assignments

#### Scenario: Reactivate user
- **WHEN** a TENANT_ADMIN reactivates a previously inactive user
- **THEN** the system SHALL:
  - Set is_active = true
  - Allow user to login again
  - Restore previous permissions

---

### Requirement: Multiple Tenant Admins Support
The system SHALL allow multiple TENANT_ADMIN users per tenant.

#### Scenario: Multiple admins collaboration
- **WHEN** a tenant has 3 TENANT_ADMIN users
- **THEN** each admin SHALL have:
  - Full access to all tenant features
  - Ability to manage other tenant users
  - Ability to create/edit products, coupons, etc.
  - Visibility of actions by other admins (via audit logs)

---

### Requirement: View User Activity and Permissions
The system SHALL provide visibility into user permissions and recent activity.

#### Scenario: View user profile with permissions
- **WHEN** a TENANT_ADMIN views a TENANT_USER's profile
- **THEN** the system SHALL display:
  - User details (email, name, role, status)
  - List of assigned permissions (grouped by category)
  - Last login timestamp
  - Recent activity (last 10 actions)

#### Scenario: Permission summary by category
- **WHEN** viewing user permissions
- **THEN** the system SHALL group permissions by resource:
  - Products: VIEW_PRODUCTS, CREATE_PRODUCTS, EDIT_PRODUCTS
  - Coupons: VIEW_COUPONS, CREATE_COUPONS, ACTIVATE_COUPONS
  - Users: VIEW_TENANT_USERS, MANAGE_TENANT_USERS
  - Analytics: VIEW_ANALYTICS, EXPORT_REPORTS

---

### Requirement: User Deletion Safeguards
The system SHALL prevent deletion of users with activity history.

#### Scenario: Delete user without activity
- **WHEN** deleting a TENANT_USER who has never logged in or performed actions
- **THEN** the system SHALL delete the user record
- **AND** remove all permission assignments

#### Scenario: Prevent deletion of user with activity
- **WHEN** attempting to delete a user with login history or created coupons
- **THEN** the system SHALL reject with error "Cannot delete user with activity history"
- **AND** suggest deactivation instead

---

## User Type Hierarchy

1. **SUPER_ADMIN** (Platform-level)
   - Manages all tenants
   - All permissions automatically granted
   - Cannot be restricted

2. **TENANT_ADMIN** (Tenant-level)
   - Full access within tenant
   - Can manage tenant users
   - Cannot be restricted by permissions

3. **TENANT_USER** (Restricted)
   - Limited access within tenant
   - Explicit permission assignment required
   - Permissions control feature access

---

## Database Schema

**Tables:**
- `users` - User accounts
  - `id`, `tenant_id`, `email`, `name`, `user_type` (ENUM), `is_active`, `last_login`, `created_at`, `updated_at`
- `user_permissions` - Permission assignments
  - `user_id`, `permission_code`, `assigned_at`, `assigned_by`

**User Type Enum:** `SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_USER`

---

## API Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/api/tenant-users` | Create user | `MANAGE_TENANT_USERS` |
| GET | `/api/tenant-users` | List users | `VIEW_TENANT_USERS` |
| GET | `/api/tenant-users/:id` | Get user details | `VIEW_TENANT_USERS` |
| PUT | `/api/tenant-users/:id` | Update user | `MANAGE_TENANT_USERS` |
| POST | `/api/tenant-users/:id/permissions` | Assign permission | `ASSIGN_PERMISSIONS` |
| DELETE | `/api/tenant-users/:id/permissions/:code` | Revoke permission | `ASSIGN_PERMISSIONS` |
| POST | `/api/tenant-users/:id/deactivate` | Deactivate user | `MANAGE_TENANT_USERS` |
| DELETE | `/api/tenant-users/:id` | Delete user | `MANAGE_TENANT_USERS` |

---

## UI Components

- `TenantUsersListComponent` - List all tenant users with filters
- `TenantUserFormComponent` - Create/edit user form
- `UserPermissionsComponent` - Manage permissions with grouped checkboxes
- `UserActivityComponent` - View user activity log

---

## Permission Categories

| Category | Permissions |
|----------|-------------|
| Products | `VIEW_PRODUCTS`, `CREATE_PRODUCTS`, `EDIT_PRODUCTS`, `DELETE_PRODUCTS` |
| Coupons | `VIEW_COUPONS`, `CREATE_COUPONS`, `ACTIVATE_COUPONS`, `DELETE_COUPONS` |
| Users | `VIEW_TENANT_USERS`, `MANAGE_TENANT_USERS`, `ASSIGN_PERMISSIONS` |
| Analytics | `VIEW_ANALYTICS`, `EXPORT_REPORTS` |
| Apps | `VIEW_APPS`, `MANAGE_APPS` |
| Credits | `VIEW_CREDITS`, `REQUEST_CREDITS` |

---

## Validation Rules

1. **Email Format**: Valid email address required
2. **Email Uniqueness**: Email must be unique across all users
3. **User Type**: Must be TENANT_ADMIN or TENANT_USER (SUPER_ADMIN only created by system)
4. **Permission Codes**: Must exist in defined permissions list
5. **Deactivation**: Cannot deactivate self
