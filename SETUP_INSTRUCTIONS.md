# Complete Setup Instructions - Backup & Recovery System

## 🚨 IMPORTANT: Complete Fix Applied

All the issues you mentioned have been fixed:
- ✅ Deleted accounts cannot login anymore
- ✅ Username/email can be reused after deletion
- ✅ Deleted records don't appear in any dropdowns
- ✅ Lots are freed up (available) when ownership is deleted
- ✅ Payment monitoring excludes deleted accounts/lots
- ✅ All related data is properly backed up
- ✅ Backup & Recovery tab now works correctly

## 📋 Prerequisites

- XAMPP installed and running
- MySQL running on port 3306
- Node.js installed
- Project located at: `C:\xampp\htdocs\ManagementSystem\`

## 🔧 Step-by-Step Setup

### Step 1: Start XAMPP
1. Open **XAMPP Control Panel**
2. Start **Apache**
3. Start **MySQL**

### Step 2: Database Setup

**Choose ONE of these options:**

#### Option A: Fresh Installation (Recommended)
If you're starting fresh or want to reset everything:

1. Open browser: `http://localhost/phpmyadmin`
2. Click **SQL** tab
3. Copy and paste the ENTIRE content of `Cemetery Management System Database.sql`
4. Click **Go**
5. Wait for completion

#### Option B: Migration (If you have existing data)
If you already have data and want to add soft delete support:

1. **BACKUP YOUR DATABASE FIRST!**
   ```sql
   -- In phpMyAdmin, select your database and click "Export"
   -- Or run this in command line:
   -- mysqldump -u root cemetery_management > backup.sql
   ```

2. Open browser: `http://localhost/phpmyadmin`
3. Select `cemetery_management` database
4. Click **SQL** tab
5. Copy and paste the ENTIRE content of `MIGRATION_SOFT_DELETE.sql`
6. Click **Go**
7. Wait for completion

### Step 3: Verify Database

1. Go to `http://localhost/phpmyadmin`
2. Select `cemetery_management` database
3. Verify these tables exist:
   - ✅ `users` (should have `deleted_at` and `deleted_by` columns)
   - ✅ `deleted_records_backup` (NEW)
   - ✅ `recovery_history` (NEW)
   - ✅ `system_settings` (NEW)

4. Click on `users` table → Structure
5. Verify:
   - ❌ NO UNIQUE constraint on `username`
   - ❌ NO UNIQUE constraint on `email`
   - ✅ INDEX on `username`
   - ✅ INDEX on `email`
   - ✅ `deleted_at` column exists
   - ✅ `deleted_by` column exists

### Step 4: Check API Configuration

1. Open `api/config.php`
2. Verify database connection:
   ```php
   $host = 'localhost';
   $dbname = 'cemetery_management';
   $username = 'root';
   $password = ''; // or 'root' on some systems
   ```

3. Test backend API:
   - Open browser: `http://localhost/ManagementSystem/api/get_retention_settings.php`
   - You should see JSON response (might say "Unauthorized" - that's okay)
   - If you see a blank page or error, check your Apache error logs

### Step 5: Install Frontend Dependencies

1. Open Command Prompt or PowerShell
2. Navigate to project:
   ```bash
   cd C:\xampp\htdocs\ManagementSystem
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
   Wait for completion (may take a few minutes)

### Step 6: Start Development Server

```bash
npm run dev
```

You should see:
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

### Step 7: Test the System

1. Open browser: `http://localhost:5173`
2. Login with:
   - **Username**: `admin`
   - **Password**: `password`
3. You should see the dashboard
4. Look for **"Backup & Recovery"** in the left sidebar
5. Click on it

## ✅ Testing the Fixes

### Test 1: Delete a User Account
1. Go to **Account Management**
2. Create a test customer (e.g., username: `testuser`, email: `test@test.com`)
3. Add a lot to this customer in **Ownership Management**
4. Go back to **Account Management**
5. Delete the test customer
6. **Verify**:
   - ✅ User appears in **Backup & Recovery** → **Users** tab
   - ✅ Lot shows as available in **Ownership Management**
   - ✅ User cannot login anymore
   - ✅ Payment monitoring doesn't show this user

### Test 2: Reuse Username/Email
1. After deleting `testuser` above
2. Try to create a NEW user with:
   - Username: `testuser`
   - Email: `test@test.com`
3. **Verify**:
   - ✅ No error about username/email already exists
   - ✅ New account created successfully

### Test 3: Delete Lot Ownership
1. Create a customer and assign a lot
2. Go to **Ownership Management**
3. Delete the lot ownership
4. **Verify**:
   - ✅ Lot appears in **Backup & Recovery** → **Lot Ownership** tab
   - ✅ Lot is now available for new assignment
   - ✅ Payment monitoring doesn't show this lot anymore
   - ✅ When adding new ownership, the lot shows as available

### Test 4: Restore Deleted Record
1. Go to **Backup & Recovery**
2. Find a deleted record
3. Click the restore icon (↻)
4. Confirm restoration
5. **Verify**:
   - ✅ Record is restored
   - ✅ All related data is restored
   - ✅ Appears in original location

## 🐛 Troubleshooting

### Issue: "Table doesn't exist"
**Solution**: You need to run the SQL file. Go to Step 2.

### Issue: "Column deleted_at doesn't exist"
**Solution**: Run `MIGRATION_SOFT_DELETE.sql` to add the columns.

### Issue: "Duplicate entry for key 'username'"
**Solution**: The UNIQUE constraint wasn't removed. Run this in phpMyAdmin:
```sql
ALTER TABLE users DROP INDEX IF EXISTS username;
ALTER TABLE users DROP INDEX IF EXISTS email;
ALTER TABLE users ADD INDEX idx_username (username);
ALTER TABLE users ADD INDEX idx_email (email);
```

### Issue: "Backup & Recovery shows 401 Unauthorized"
**Solution**: This is a credentials issue. Make sure:
1. You're logged in as admin
2. Session is active
3. Check browser console for actual API URL being called
4. It should be: `http://localhost/ManagementSystem/api/...`

### Issue: "Cannot connect to database"
**Solution**:
1. Make sure MySQL is running in XAMPP
2. Check `api/config.php` has correct credentials
3. Try accessing phpMyAdmin - if it doesn't work, MySQL isn't running

### Issue: "Deleted user still appears in dropdowns"
**Solution**: Clear browser cache, then:
1. Verify the deleted user has `deleted_at` value in database
2. Check API query includes `WHERE deleted_at IS NULL`
3. Refresh the page (hard refresh: Ctrl+F5)

### Issue: "Lot not available after deleting ownership"
**Solution**: Check in database:
```sql
SELECT id, lot_number, status, customer_id, deleted_at 
FROM lots 
WHERE id = YOUR_LOT_ID;
```
- `status` should be 'available'
- `customer_id` should be NULL
- `deleted_at` should be NULL

### Issue: "Frontend shows blank page"
**Solution**:
1. Open browser console (F12)
2. Check for errors
3. Most common: API_BASE_URL is wrong
4. Open `src/configs/api.js` and verify:
   ```javascript
   export const API_BASE_URL = 'http://localhost/ManagementSystem/api';
   ```

## 📊 What Each File Does

### Database Files
- `Cemetery Management System Database.sql` - Complete fresh database setup
- `MIGRATION_SOFT_DELETE.sql` - Adds soft delete to existing database

### Backend API Files (Updated)
- `api/delete_user.php` - Soft deletes users with backup
- `api/delete_ownership.php` - Removes ownership, frees up lot
- `api/delete_deceased_record.php` - Soft deletes deceased records
- `api/delete_payment_record.php` - Soft deletes payments
- `api/login.php` - Blocks deleted users from logging in
- `api/create_user.php` - Allows reusing deleted usernames/emails
- `api/get_*.php` - All updated to exclude deleted records

### New Backend API Files
- `api/soft_delete.php` - Comprehensive soft delete handler
- `api/get_deleted_records.php` - Retrieves deleted records
- `api/restore_deleted_record.php` - Restores with conflict resolution
- `api/get_alternative_lots.php` - Gets alternative lots (same type)
- `api/get_retention_settings.php` - Gets backup settings
- `api/update_retention_settings.php` - Updates retention policy
- `api/cleanup_expired_backups.php` - Removes expired backups

### Frontend Files
- `src/pages/admin-dashboard/BackupRecovery.jsx` - Main recovery UI
- `src/routes.jsx` - Added Backup & Recovery route

## 🎯 Key Features Explained

### 1. Soft Delete
When you delete a record:
- Record is marked with `deleted_at` timestamp
- Record is NOT physically removed from database
- Backup snapshot created in `deleted_records_backup` table
- All related data is also soft-deleted
- Record becomes invisible to normal operations

### 2. Login Prevention
- Login query checks `WHERE deleted_at IS NULL`
- Deleted users cannot login
- Even if they have correct credentials

### 3. Username/Email Reuse
- UNIQUE constraints removed from database
- Uniqueness checked at application level
- Check only considers non-deleted users: `WHERE deleted_at IS NULL`
- Allows creating new account with same username/email after deletion

### 4. Lot Availability
- When ownership deleted: lot's `customer_id` set to NULL, `status` set to 'available'
- Lot itself is NOT soft-deleted (no `deleted_at` set on lot)
- Lot immediately available for new assignment
- Related payments/plans are soft-deleted

### 5. Hidden from Everywhere
All `get_*` APIs updated with `WHERE deleted_at IS NULL`:
- Account Management
- Ownership Management
- Deceased Records
- Payment Monitoring
- Customer dropdowns
- Reports

### 6. Recovery System
- View all deleted records in one place
- Restore with intelligent conflict resolution
- Account conflicts: migrate data to existing account
- Lot conflicts: select alternative lot (same type)
- Complete data restoration including payment history

## 📞 Support

If you encounter any issues:
1. Check this guide first
2. Verify each step was completed
3. Check browser console (F12) for errors
4. Check Apache error logs in XAMPP
5. Verify database structure in phpMyAdmin

## 🎉 Success Indicators

You know it's working when:
- ✅ Deleted users don't appear anywhere except Backup & Recovery
- ✅ Cannot login with deleted account
- ✅ Can create new account with same username as deleted account
- ✅ Deleted lots show as available
- ✅ Payment monitoring doesn't show deleted records
- ✅ Backup & Recovery tab loads without errors
- ✅ Can restore deleted records successfully
- ✅ Restored records appear in their original locations

---

**Last Updated**: November 2025
**Version**: 1.0 - Complete Fix

