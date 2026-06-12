# How to Create a Distribution ZIP File

## Why Google Drive Can't Preview Your ZIP

Google Drive **cannot preview ZIP files** - this is normal behavior. ZIP files must be downloaded and extracted to view their contents. The "file too large to preview" message appears because:
1. ZIP files are not natively previewable in Google Drive
2. Large files (>100MB) cannot be previewed even if they were supported
3. Your ZIP likely includes unnecessary large folders

## What Should NOT Be Included in Distribution ZIP

When creating a ZIP for distribution, **exclude** these folders/files (they can be regenerated):

### ❌ Exclude These:
- `node_modules/` - Can be regenerated with `npm install` (very large, ~100-500MB)
- `vendor/` - Can be regenerated with `composer install` (large, ~50-200MB)
- `dist/` - Build output, can be regenerated with `npm run build`
- `.git/` - Git repository folder (if present)
- `*.log` - Log files
- `.DS_Store` - macOS system files
- `.vscode/` - VS Code settings (optional)

### ✅ Include These:
- All source code (`src/`, `api/`, `public/`)
- Configuration files (`package.json`, `composer.json`, `vite.config.js`, etc.)
- Database file (`Cemetery Management System Database.sql`)
- Documentation files (`.md` files)
- All other project files

## How to Create a Proper Distribution ZIP

### Method 1: Using Windows File Explorer (Manual)

1. **Navigate to your project folder** (e.g., `C:\xampp\htdocs\ManagementSystem`)

2. **Select all files and folders EXCEPT:**
   - `node_modules` folder
   - `vendor` folder
   - `dist` folder (if it exists)
   - `.git` folder (if present)

3. **Right-click** → **Send to** → **Compressed (zipped) folder**

4. **Name it** `ManagementSystem.zip`

### Method 2: Using PowerShell (Recommended - Automated)

1. **Open PowerShell** in your project folder:
   ```powershell
   cd C:\xampp\htdocs\ManagementSystem
   ```

2. **Run this command** to create a zip excluding unnecessary folders:
   ```powershell
   Compress-Archive -Path * -DestinationPath ManagementSystem.zip -Exclude node_modules,vendor,dist,.git
   ```

   Or more comprehensive exclusion:
   ```powershell
   $exclude = @('node_modules', 'vendor', 'dist', '.git', '*.log', '.DS_Store')
   Get-ChildItem -Path . -Exclude $exclude | Compress-Archive -DestinationPath ManagementSystem.zip
   ```

### Method 3: Using 7-Zip or WinRAR (If Installed)

1. **Select all files** in your project folder
2. **Right-click** → **7-Zip** → **Add to archive**
3. **In the exclusion list**, add:
   - `node_modules\*`
   - `vendor\*`
   - `dist\*`
   - `.git\*`
4. Click **OK**

## Expected ZIP Size

After excluding `node_modules` and `vendor`, your ZIP should be:
- **Before**: 500MB - 2GB+ (with node_modules and vendor)
- **After**: 10MB - 50MB (source code only)

## What Recipients Need to Do

After downloading your ZIP, recipients should:

1. **Extract the ZIP** to their desired location
2. **Install dependencies**:
   ```bash
   npm install          # Installs node_modules
   composer install     # Installs vendor (if needed)
   ```
3. **Follow the setup instructions** in README.md

## Quick Check: Verify Your ZIP Size

- ✅ **Good**: 10-50MB (source code only)
- ⚠️ **Too large**: 100MB+ (likely includes node_modules or vendor)
- ❌ **Very large**: 500MB+ (definitely includes unnecessary folders)

## Summary

**Why Google Drive can't preview**: ZIP files are not previewable in Google Drive - this is normal.

**Solution**: Create a smaller ZIP by excluding `node_modules/` and `vendor/` folders. Recipients can regenerate these with `npm install` and `composer install`.

