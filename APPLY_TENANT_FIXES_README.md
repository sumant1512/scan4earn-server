# How to Apply Tenant Schema Fixes

## 🎯 Problem
You're seeing these issues in your API responses:
```json
{
  "contact_name": null,           // ❌ Should not exist
  "created_by": null,             // ❌ Should be super admin UUID
  "created_by_name": null,        // ❌ Should be super admin name
  "created_by_email": null        // ❌ Should be super admin email
}
```

## ✅ Solution
You have **TWO OPTIONS** to fix this:

---

## Option 1: Apply Migration (RECOMMENDED - Preserves Data)

Use this if you have existing data (tenants, users, coupons, etc.) that you want to keep.

### Steps:

1. **Stop your server** (if running)
   ```bash
   # Press Ctrl+C to stop the server
   ```

2. **Navigate to server directory**
   ```bash
   cd mscan-server
   ```

3. **Run the fix script**
   ```bash
   npm run db:fix-tenants
   ```

4. **Verify the output**
   You should see:
   ```
   ✅ SUCCESS: contact_name column has been removed
   ✅ SUCCESS: All tenants have created_by populated
   🎉 All done! You can now restart your server.
   ```

5. **Restart your server**
   ```bash
   npm start
   ```

6. **Test the API**
   ```bash
   curl http://localhost:8080/api/tenants/YOUR_TENANT_ID
   ```

   You should now see:
   ```json
   {
     "contact_person": "Hemant Mishra",  // ✅ Only contact_person
     "created_by": "uuid-of-super-admin", // ✅ Populated
     "created_by_name": "Super Admin",    // ✅ Populated
     "created_by_email": "sumantmishra511@gmail.com" // ✅ Populated
   }
   ```

---

## Option 2: Reset Database (EASY - Loses Data)

Use this if you don't have important data and want a fresh start.

### Steps:

1. **Stop your server** (if running)
   ```bash
   # Press Ctrl+C to stop the server
   ```

2. **Navigate to server directory**
   ```bash
   cd mscan-server
   ```

3. **Reset the database**
   ```bash
   npm run db:reset
   ```

   This will:
   - Drop all tables
   - Recreate everything from `full_setup.sql` (which includes the fixes)
   - You'll need to recreate your super admin, tenants, etc.

4. **Restart your server**
   ```bash
   npm start
   ```

---

## 🔍 What the Migration Does

The migration script (`database/APPLY_TENANT_SCHEMA_FIXES.sql`) performs these changes:

### 1. **Removes duplicate column**
```sql
ALTER TABLE tenants DROP COLUMN contact_name;
```

### 2. **Adds foreign key constraint**
```sql
ALTER TABLE tenants ADD CONSTRAINT fk_tenants_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
```

### 3. **Updates existing tenants**
```sql
UPDATE tenants
SET created_by = (SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1)
WHERE created_by IS NULL;
```

### 4. **Adds index for performance**
```sql
CREATE INDEX idx_tenants_created_by ON tenants(created_by);
```

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `database/APPLY_TENANT_SCHEMA_FIXES.sql` | SQL migration script |
| `database/apply-tenant-fixes.js` | Node.js script to run migration |
| `package.json` | Updated with `db:fix-tenants` script |

---

## ⚠️ Important Notes

### For Existing Databases:
- ✅ All existing tenants will be assigned to the first available super admin
- ✅ All data is preserved (tenants, users, coupons, etc.)
- ✅ The migration is idempotent (safe to run multiple times)

### For Fresh Installations:
- ✅ No migration needed
- ✅ Just run `npm run db:setup` and the fixes are already included
- ✅ `full_setup.sql` has been updated with all fixes

---

## 🐛 Troubleshooting

### Problem: "No super admin found"
**Solution:** Create a super admin user first, then run the migration again.

### Problem: Migration fails with "column does not exist"
**Solution:** The column may have already been removed. Check the verification output.

### Problem: Still seeing `contact_name` in API response
**Solutions:**
1. Restart your server after running the migration
2. Clear your API response cache (if any)
3. Check if the column was actually removed:
   ```bash
   psql -d mscan -c "\d tenants"
   ```

### Problem: `created_by_name` is still null
**Solutions:**
1. Check if `created_by` is populated:
   ```sql
   SELECT id, tenant_name, created_by FROM tenants;
   ```
2. Verify the JOIN in the API query is correct
3. Restart the server

---

## ✅ Verification Checklist

After running the migration, verify:

- [ ] `contact_name` column no longer appears in API responses
- [ ] `created_by` field shows a UUID (not null)
- [ ] `created_by_name` shows the super admin's name
- [ ] `created_by_email` shows the super admin's email
- [ ] No errors in server logs
- [ ] Tenant creation still works
- [ ] Existing tenants can be retrieved

---

## 📊 Before vs After

### Before Migration ❌
```json
{
  "tenant_name": "hemant",
  "contact_name": null,          // ❌ Duplicate field
  "contact_person": "Hemant Mishra",
  "created_by": null,            // ❌ Not tracked
  "created_by_name": null,       // ❌ Not available
  "created_by_email": null       // ❌ Not available
}
```

### After Migration ✅
```json
{
  "tenant_name": "hemant",
  "contact_person": "Hemant Mishra",  // ✅ Single field
  "created_by": "abc-123-uuid",       // ✅ Super admin UUID
  "created_by_name": "Admin Name",    // ✅ Super admin name
  "created_by_email": "sumantmishra511@gmail.com" // ✅ Super admin email
}
```

---

## 🚀 Quick Start (TL;DR)

**If you want to keep your data:**
```bash
cd mscan-server
npm run db:fix-tenants
# Restart server
```

**If you want a fresh start:**
```bash
cd mscan-server
npm run db:reset
# Restart server
```

---

## 📞 Need Help?

If you encounter any issues:
1. Check the server logs for errors
2. Verify database connection settings in `.env`
3. Make sure PostgreSQL is running
4. Check if you have the necessary database permissions

---

## 🎉 Success!

Once complete, your tenant API responses will:
- ✅ Only show `contact_person` (no duplicate `contact_name`)
- ✅ Show who created each tenant (`created_by` UUID)
- ✅ Display the creator's name and email
- ✅ Provide complete audit trail

**All changes are now part of `full_setup.sql` for future fresh installations!**
