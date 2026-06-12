# 📦 Backup & Recovery System Guide

## Overview
The Backup & Recovery system provides a safety net for deleted records in your Cemetery Management System. Instead of permanently deleting data, it uses **soft deletion** to allow restoration if needed.

---

## ✅ What I Fixed

### 1. **Frontend Improvements**
- ✅ Removed "Payment Records" tab (payment records don't have delete functionality)
- ✅ Fixed tab switching - now properly highlights active tab
- ✅ Replaced `alert()` with beautiful **Toast notifications** (green for success, red for error)
- ✅ Added **Account Type** column showing admin/staff/cashier/customer badges
- ✅ Shows "No related records" for non-customer accounts (admin, staff, cashier)

### 2. **Backend Improvements**
- ✅ **Deleted backups are removed after successful restoration**
- ✅ **Activity logs are created** for all recovery actions (visible in Activity Log tab)
- ✅ Activity log type: "Recovery" with description of what was restored

### 3. **Account Type Handling**
- ✅ Only **customer accounts** show related lots, deceased, and payment records
- ✅ **Admin, Staff, Cashier accounts** show "No related records" badge

---

## 🔄 How It Works

### When You Delete Something:

1. **User Account Deletion:**
   - Account is marked as deleted (soft delete)
   - Can no longer log in
   - Username/email become available for reuse
   - Associated lots become "available"
   - A backup snapshot is created with ALL related data:
     - User info
     - Customer info
     - All assigned lots
     - All deceased records
     - All payment records & plans

2. **Lot Ownership Deletion:**
   - Ownership is removed
   - Lot becomes "available" for new assignment
   - Payment records & plans are soft-deleted
   - Backup snapshot created with:
     - Lot location info
     - Owner name
     - All deceased in that lot
     - All payment records & plans

3. **Deceased Record Deletion:**
   - Record is marked as deleted
   - Backup snapshot created with deceased info

---

## ♻️ How Restoration Works

### Restoring a User Account:

**Case 1: No Conflicts**
- User account is restored
- All related data (lots, deceased, payments) are restored
- Account can log in again
- Backup record is **deleted** from the backup table

**Case 2: Username/Email Already Exists**
- System detects conflict
- Shows dialog with options:
  - **Migrate to Existing**: Move old lots/deceased/payments to the existing account
  - **Cancel**: Don't restore

**Case 3: Lot No Longer Available**
- System shows available lots of the same type (Standard/Premium/Deluxe)
- You select an alternative lot
- All payment history and deceased records are moved to the new lot

### Restoring Lot Ownership:
- Ownership is reassigned
- Payment records & plans are restored
- Deceased records are linked back
- Backup record is **deleted**

### Restoring Deceased Record:
- Record is unmarked as deleted
- Backup record is **deleted**

---

## ⏰ Expired Backups - HOW IT WORKS

### What is "Expired"?
An expired backup is a deleted record that has passed its **retention period**. The retention period is how long you want to keep deleted data before permanently removing it.

### Retention Period Options:
- **1 Week** (7 days)
- **1 Month** (30 days) - Default
- **1 Year** (365 days)
- **3 Years** (1095 days)
- **Keep Forever** (0 days) - Never expires

### Example:
- You set retention to "1 Month"
- You delete a user account on January 1st
- The backup expires on February 1st (30 days later)
- On February 1st:
  - If **Auto Cleanup = Enabled**: The backup is **automatically permanently deleted**
  - If **Auto Cleanup = Disabled**: The backup stays but shows as "expired" in statistics

### How to Manage Expired Backups:

1. **View Stats:**
   - Open **Backup & Recovery** tab
   - See "Expired Backups" count at the top

2. **Manual Cleanup:**
   - Click **"Cleanup Now"** button (appears when there are expired backups)
   - Confirms before permanently deleting
   - Shows how many records were deleted

3. **Auto Cleanup:**
   - Go to **Settings** (gear icon)
   - Toggle "Auto Cleanup"
     - **Enabled**: System automatically deletes expired backups
     - **Disabled**: You must manually cleanup

### ⚠️ Important Notes:
- **Permanent deletion cannot be undone**
- Expired backups can still be restored BEFORE cleanup
- You'll see a count of how many backups are expired
- Auto cleanup runs automatically (you don't need to trigger it)

---

## 🎯 Testing the System

### Test Scenario 1: Simple Restore
1. Delete a customer account
2. Go to **Backup & Recovery**
3. Click **Restore** button
4. See green toast notification: "User and related records restored successfully"
5. Check **Activity Log** - should show "Recovery" action
6. The deleted account disappears from Backup & Recovery (because it's restored)

### Test Scenario 2: Username Conflict
1. Delete user "john@example.com"
2. Create a new user with email "john@example.com"
3. Try to restore the old "john@example.com"
4. Dialog appears asking to **migrate data** or cancel
5. Choose "Migrate to Existing"
6. Old lots/deceased/payments move to new account

### Test Scenario 3: Expired Backups
1. Set retention to "1 Week"
2. Delete some test records
3. Wait 7 days (or manually change `deleted_at` date in database to 8 days ago)
4. Go to Backup & Recovery
5. See "Expired Backups: X" in stats
6. Click "Cleanup Now"
7. Expired backups are permanently deleted

---

## 🛠️ Troubleshooting

### Issue: Deleted lot doesn't show in Backup & Recovery
**Solution**: The lot ownership is deleted, not the lot itself. Check the "Lot Ownership" tab, not looking for a lot ID.

### Issue: Can't restore - says "already exists"
**Solution**: Another account has the same username/email. Use the conflict resolution dialog to migrate data.

### Issue: Expired backups won't cleanup
**Solution**: Make sure Auto Cleanup is enabled in Settings, or click "Cleanup Now" manually.

---

## 📊 Activity Log Integration

All restore actions are logged in the **Activity Log** tab:
- **Activity Type**: Recovery
- **Description**: "Restored User record" or custom message
- **IP Address** & **User Agent**: Tracked for audit
- **Timestamp**: When restoration happened

---

## 🎨 UI Features

### Toast Notifications:
- **Green** = Success
- **Red** = Error
- Auto-dismiss after 3 seconds
- Click to dismiss immediately

### Tab Highlighting:
- Active tab is highlighted
- Click any tab to switch views

### Account Type Badges:
- 🔴 **Admin** = Red badge
- 🔵 **Staff** = Blue badge
- 🟢 **Cashier** = Green badge
- ⚪ **Customer** = Gray badge

---

## 💡 Best Practices

1. **Set appropriate retention period** based on your needs
2. **Enable Auto Cleanup** to prevent database bloat
3. **Check Activity Logs** regularly for audit trail
4. **Test restoration** in development first
5. **Backup your database** before mass cleanup operations

---

## 🚀 Summary

✅ Soft delete instead of hard delete
✅ Full data restoration with all relationships
✅ Conflict resolution for duplicate accounts
✅ Expired backups management
✅ Activity logging for accountability
✅ Beautiful UI with toast notifications
✅ Account type awareness (admin, staff, cashier, customer)

**The system is now fully functional and logical!** 🎉

