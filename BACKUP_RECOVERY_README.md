# Backup & Recovery System Documentation

## Overview

The Cemetery Management System now includes a comprehensive Backup & Recovery system that implements soft delete functionality. This means when you delete records, they are not permanently removed from the database immediately. Instead, they are marked as deleted and can be restored later.

## Features

### 1. **Soft Delete**
- Records are marked as deleted but remain in the database
- All related data is preserved
- Can be restored at any time within the retention period

### 2. **Complete Data Preservation**
When a record is deleted, the system automatically preserves:
- **User Accounts**: Profile information, customer details
- **Lot Ownership**: All lots owned by the user
- **Deceased Records**: All deceased records associated with the user
- **Payment Records**: Complete payment history
- **Payment Plans**: Installment plan information

### 3. **Intelligent Conflict Resolution**
When restoring records, the system handles conflicts intelligently:

#### Account Conflicts
If a user with the same username or email already exists:
- **Option 1: Migrate to Existing Account**
  - Transfer all data (lots, deceased records, payments) to the existing account
  - Select which items to migrate
  
- **Option 2: Skip Restoration**
  - Keep the existing account
  - Optionally restore only specific data

#### Lot Availability Conflicts
If the original lot is no longer available:
- System shows alternative lots of the same type (Standard/Premium/Deluxe)
- Maintains lot type to preserve pricing integrity
- Allows selection from any garden/sector with same lot type
- Automatically migrates payment history to new lot

### 4. **Retention Policy**
Administrators can configure how long deleted records are kept:
- **1 Week**: Records older than 7 days are permanently deleted
- **1 Month**: Records older than 30 days are permanently deleted (default)
- **1 Year**: Records older than 365 days are permanently deleted
- **3 Years**: Records older than 1095 days are permanently deleted
- **Keep Forever**: Records are never automatically deleted

### 5. **Auto Cleanup**
- Can be enabled or disabled
- Automatically removes expired backups based on retention policy
- Manual cleanup option available anytime

## How to Use

### For Administrators

#### Accessing Backup & Recovery
1. Log in as Administrator
2. Navigate to **Dashboard** > **Backup & Recovery**
3. The page displays four tabs:
   - **Users**: Deleted user accounts
   - **Lot Ownership**: Deleted lot ownership records
   - **Deceased Records**: Deleted deceased records
   - **Payment Records**: Deleted payment records

#### Viewing Deleted Records
- Each tab shows a table of deleted records
- Information includes:
  - What was deleted
  - When it was deleted
  - Who deleted it
  - Related data counts
  - Current restore status

#### Restoring a Record

**Simple Restoration (No Conflicts):**
1. Click the restore icon next to the record
2. Confirm restoration
3. All related data is automatically restored

**Restoration with Account Conflict:**
1. Click restore on a user account
2. If username/email already exists, you'll see conflict options
3. Choose:
   - **Migrate to Existing**: Transfer all data to existing account
   - **Cancel**: Keep existing account unchanged

**Restoration with Lot Conflict:**
1. Click restore on a lot ownership
2. If lot is no longer available, you'll see alternative lots
3. Select a new lot from the dropdown (same type only)
4. System automatically:
   - Assigns new lot to user
   - Migrates payment history
   - Updates deceased records
   - Preserves payment status

#### Configuring Settings
1. Click **Settings** button
2. Configure:
   - **Retention Period**: How long to keep deleted records
   - **Auto Cleanup**: Enable/disable automatic cleanup
3. Changes take effect immediately

#### Manual Cleanup
1. View the "Expired Backups" count on the dashboard
2. Click **Cleanup Now** button
3. Confirm permanent deletion
4. Expired records are permanently removed

## Technical Details

### Database Changes

#### Soft Delete Columns Added
All main tables now include:
- `deleted_at` (TIMESTAMP NULL): When the record was deleted
- `deleted_by` (INT NULL): ID of user who deleted the record

#### New Tables

**`deleted_records_backup`**
Stores complete snapshots of deleted records:
- `id`: Backup ID
- `record_type`: Type of record (user, lot, deceased, payment)
- `record_id`: Original record ID
- `snapshot_data`: JSON snapshot of the record
- `related_data`: JSON snapshot of related records
- `deleted_by`: Who deleted it
- `deleted_at`: When it was deleted
- `can_restore`: Whether restoration is possible
- `restore_notes`: Notes about restoration status

**`recovery_history`**
Tracks all restoration attempts:
- `id`: History ID
- `backup_id`: Reference to backup
- `record_type`: Type of record restored
- `original_record_id`: Original record ID
- `restored_record_id`: New record ID (if different)
- `recovery_status`: Status (success, partial, failed, migrated)
- `recovery_details`: JSON details about restoration
- `performed_by`: Who performed the restoration

**`system_settings`**
Stores system configuration:
- `setting_key`: Setting name
- `setting_value`: Setting value
- `description`: Setting description

### API Endpoints

#### Soft Delete
- `POST /api/soft_delete.php`
- Parameters: `record_type`, `record_id`
- Creates backup and marks record as deleted

#### Get Deleted Records
- `GET /api/get_deleted_records.php?record_type={type}`
- Returns all deleted records of specified type
- Use `record_type=all` for all types

#### Restore Record
- `POST /api/restore_deleted_record.php`
- Parameters: `backup_id`, optional conflict resolution data
- Restores deleted record with conflict handling

#### Get Alternative Lots
- `GET /api/get_alternative_lots.php?original_lot_id={id}`
- Returns available lots of same type
- Used when original lot is occupied

#### Get/Update Settings
- `GET /api/get_retention_settings.php`
- `POST /api/update_retention_settings.php`
- Manage retention policy and auto-cleanup

#### Cleanup Expired Backups
- `POST /api/cleanup_expired_backups.php`
- Permanently deletes expired backups

### Existing APIs Updated

All `get_*` APIs now exclude soft-deleted records:
- `get_users.php`: Only returns active users
- `get_ownerships.php`: Only returns active lot ownerships
- `get_deceased_records.php`: Only returns active deceased records
- `get_payment_records.php`: Only returns active payment records

All `delete_*` APIs now use soft delete:
- `delete_user.php`: Soft deletes user and related data
- `delete_ownership.php`: Soft deletes lot ownership
- `delete_deceased_record.php`: Soft deletes deceased record
- `delete_payment_record.php`: Soft deletes payment record

## Best Practices

### For Daily Operations
1. Delete records normally as before - they're automatically backed up
2. Review deleted records weekly
3. Restore accidentally deleted records immediately
4. Let auto-cleanup handle old backups

### For Data Management
1. Set appropriate retention period based on your needs
2. Review expired backups before running cleanup
3. Download important data before permanent deletion
4. Test restoration process regularly

### For Conflict Resolution
1. When account conflicts occur, verify user identity before migrating
2. For lot conflicts, ensure alternative lot meets requirements
3. Communicate with customers about lot changes
4. Document all migrations in activity log

## Security Considerations

1. **Access Control**: Only administrators can:
   - View deleted records
   - Restore records
   - Configure retention settings
   - Run manual cleanup

2. **Audit Trail**: All deletions and restorations are logged with:
   - Who performed the action
   - When it was performed
   - What was affected

3. **Data Integrity**: The system ensures:
   - No orphaned records
   - Referential integrity maintained
   - Payment history preserved
   - Customer data protected

## Troubleshooting

### Record Won't Restore
**Problem**: Restore button is disabled
**Solution**: Check `restore_notes` field for reason. May be due to:
- Related records no longer exist
- Data corruption in backup
- System constraints violated

### Conflict Resolution Fails
**Problem**: Migration to existing account fails
**Solution**: 
- Verify target account exists and is active
- Check for database constraints
- Review system logs for error details

### Alternative Lot Not Available
**Problem**: No alternative lots shown
**Solution**:
- Verify lots of same type exist in system
- Check if all lots are currently occupied
- May need to manually assign lot

### Cleanup Doesn't Work
**Problem**: Expired backups not deleted
**Solution**:
- Verify auto-cleanup is enabled
- Check retention period setting
- Run manual cleanup
- Check database permissions

## Migration Instructions

### Applying to Existing System

1. **Backup Current Database**
   ```bash
   mysqldump -u username -p cemetery_management > backup_before_migration.sql
   ```

2. **Run the Updated Schema**
   ```bash
   mysql -u username -p cemetery_management < "Cemetery Management System Database.sql"
   ```

3. **Verify Changes**
   - Check that soft delete columns exist
   - Verify new tables created
   - Confirm default settings inserted

4. **Test the System**
   - Delete a test record
   - Verify it appears in Backup & Recovery
   - Restore the test record
   - Verify restoration successful

## Support

For issues or questions:
1. Check this documentation
2. Review system activity logs
3. Contact system administrator
4. Check database error logs

## Future Enhancements

Potential improvements for future versions:
- Export deleted records to external backup
- Scheduled automatic backups to external storage
- Advanced search and filtering in recovery interface
- Bulk restoration operations
- Email notifications for expiring backups
- Restore preview before committing
- Version history for edited records

