# How to Enable PHP Zip Extension for Excel Import

## Problem
The Excel import feature requires the PHP `zip` extension to be enabled. If you see the error:
```
Class "ZipArchive" not found
```

## Solution for XAMPP (Windows)

### Step 1: Open php.ini
1. Open XAMPP Control Panel
2. Click **Config** button next to Apache
3. Select **PHP (php.ini)**

OR manually open:
```
C:\xampp\php\php.ini
```

### Step 2: Enable zip extension
1. Press `Ctrl + F` to search
2. Search for: `extension=zip`
3. Find the line that says: `;extension=zip`
4. Remove the semicolon (`;`) at the beginning to make it: `extension=zip`
5. Save the file (Ctrl + S)

### Step 3: Restart Apache
1. Go back to XAMPP Control Panel
2. Click **Stop** for Apache
3. Wait a few seconds
4. Click **Start** for Apache

### Step 4: Verify
1. Open a browser and go to: `http://localhost/dashboard/phpinfo.php`
2. Search for "zip" (Ctrl + F)
3. You should see "zip" in the list of loaded extensions

OR run this command in terminal:
```bash
php -m | findstr zip
```

If you see "zip" in the output, it's enabled!

## Alternative: Check via PHP
Create a test file `test_zip.php`:
```php
<?php
if (extension_loaded('zip')) {
    echo "Zip extension is ENABLED ✓";
} else {
    echo "Zip extension is DISABLED ✗";
}
?>
```

## Notes
- The zip extension is usually already included with XAMPP, just needs to be enabled
- After enabling, you MUST restart Apache for changes to take effect
- If you still have issues, make sure you're editing the correct php.ini file (check with `php --ini`)

