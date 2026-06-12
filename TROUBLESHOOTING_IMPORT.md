# Troubleshooting "Failed to Fetch" Error

## Common Causes and Solutions

### 1. **PHP Zip Extension Not Enabled**
**Error:** "Class ZipArchive not found" or "PHP zip extension is not enabled"

**Solution:**
- Enable zip extension in `php.ini`
- See `ENABLE_ZIP_EXTENSION.md` for detailed instructions
- Restart Apache after enabling

---

### 2. **File Upload Size Limit**
**Error:** File upload error or "Failed to fetch"

**Check PHP Settings:**
```ini
upload_max_filesize = 10M
post_max_size = 10M
```

**Location:** `C:\xampp\php\php.ini`

**Solution:**
1. Open `php.ini`
2. Find `upload_max_filesize` and `post_max_size`
3. Set both to at least `10M`
4. Restart Apache

---

### 3. **Network/CORS Issues**
**Error:** "Failed to fetch" in browser console

**Check:**
- Is Apache running?
- Is the API endpoint correct?
- Check browser console (F12) for detailed error
- Check Network tab to see the actual request/response

**Solution:**
- Verify API URL is correct
- Check if Apache is running
- Try accessing the API directly: `http://localhost/ManagementSystem/api/import_users.php`

---

### 4. **Excel File Format Issues**
**Error:** "Excel file must have at least a header row and one data row"

**Solution:**
- Make sure Row 1 has column headers
- Make sure Row 2+ has data
- See `EXCEL_IMPORT_EXAMPLE.md` for format examples

---

### 5. **Missing Required Columns**
**Error:** "Missing required column: ..."

**Required Columns:**
- `first_name` (or `full_name`/`name`)
- `last_name` (or parsed from `full_name`)
- `email`
- `contact_number`
- `gender` or `sex_at_birth`

**Solution:**
- Check your Excel file has these column names in Row 1
- Column names are case-insensitive

---

### 6. **PHP Error Logs**
**Check Error Logs:**
- PHP Error Log: `C:\xampp\php\logs\php_error_log`
- Apache Error Log: `C:\xampp\apache\logs\error.log`

**How to Check:**
1. Open the log files
2. Look for recent errors
3. Share the error message for help

---

## Quick Debugging Steps

1. **Check Browser Console (F12)**
   - Open Developer Tools
   - Go to Console tab
   - Look for error messages
   - Go to Network tab to see the request

2. **Check PHP Error Log**
   ```bash
   # View last 20 lines of PHP error log
   tail -n 20 C:\xampp\php\logs\php_error_log
   ```

3. **Test API Directly**
   - Try accessing: `http://localhost/ManagementSystem/api/import_users.php`
   - Should see JSON error (not PHP error)

4. **Verify File Format**
   - Open Excel file
   - Check Row 1 has headers
   - Check Row 2+ has data
   - Save as `.xlsx` format

5. **Check File Size**
   - Make sure file is not too large
   - Try with a small file (2-3 rows) first

---

## Example Excel File Format

### Minimum Required Format:

| first_name | last_name | email | contact_number | gender |
|------------|-----------|-------|----------------|--------|
| Juan | Dela Cruz | juan@email.com | 09171234567 | Male |
| Maria | Reyes | maria@email.com | 09281234567 | Female |

**Save as:** `.xlsx` or `.xls`

---

## Still Having Issues?

1. Check browser console (F12) for exact error
2. Check PHP error log
3. Try with a simple 2-row Excel file first
4. Verify all required columns are present
5. Make sure email format is valid (must end with .com)

---

## Test Checklist

- [ ] Apache is running
- [ ] Zip extension is enabled
- [ ] Excel file has header row (Row 1)
- [ ] Excel file has at least 1 data row (Row 2+)
- [ ] All required columns are present
- [ ] Email addresses end with .com
- [ ] Contact numbers are valid
- [ ] File size is reasonable (< 10MB)
- [ ] File is saved as .xlsx or .xls

