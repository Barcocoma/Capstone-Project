@echo on
echo ========================================
echo Enable PHP Zip Extension Helper
echo ========================================
echo.
echo This script will help you enable the zip extension in php.ini
echo.
echo Step 1: Opening php.ini file...
echo.

set PHP_INI=C:\xampp\php\php.ini

if not exist "%PHP_INI%" (
    echo ERROR: php.ini not found at %PHP_INI%
    echo.
    echo Please locate your php.ini file manually.
    echo You can find it by running: php --ini
    echo.
    pause
    exit /b 1
)

echo Found php.ini at: %PHP_INI%
echo.
echo IMPORTANT: This is the ACTIVE php.ini file that PHP uses.
echo (NOT php.ini-development or php.ini-production - those are just templates)
echo.
echo Step 2: Opening php.ini in Notepad...
echo.
echo INSTRUCTIONS:
echo 1. In Notepad, press Ctrl+F to search
echo 2. Search for: extension=zip
echo 3. Find the line that says: ;extension=zip
echo 4. Remove the semicolon (;) at the beginning
echo 5. Change it to: extension=zip
echo 6. Save the file (Ctrl+S)
echo 7. Close Notepad
echo 8. Restart Apache in XAMPP Control Panel
echo.
echo Press any key to open php.ini in Notepad...
pause >nul

notepad "%PHP_INI%"

echo.
echo ========================================
echo After editing php.ini:
echo ========================================
echo 1. Make sure you removed the semicolon from ;extension=zip
echo 2. Save the file (Ctrl+S) and close Notepad
echo 3. Go to XAMPP Control Panel
echo 4. Click STOP for Apache
echo 5. Wait 3 seconds
echo 6. Click START for Apache
echo 7. Run check_php_extensions.php in your browser to verify
echo.
echo Press any key to exit...
pause >nul

