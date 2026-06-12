# PowerShell Script to Create Distribution ZIP
# This script excludes node_modules, vendor, and other unnecessary folders

Write-Host "Creating distribution ZIP file..." -ForegroundColor Green
Write-Host ""

# Get current directory
$projectPath = Get-Location
$zipName = "ManagementSystem.zip"

# Remove existing zip if it exists
if (Test-Path $zipName) {
    Write-Host "Removing existing $zipName..." -ForegroundColor Yellow
    Remove-Item $zipName -Force
}

# Folders and files to exclude
$excludeItems = @(
    'node_modules',
    'vendor',
    'dist',
    'dist-ssr',
    '.git',
    '*.log',
    '.DS_Store',
    '.vscode',
    '.idea'
)

Write-Host "Excluding the following items:" -ForegroundColor Cyan
foreach ($item in $excludeItems) {
    Write-Host "  - $item" -ForegroundColor Gray
}
Write-Host ""

# Get all items except excluded ones
$itemsToZip = Get-ChildItem -Path $projectPath -Exclude $excludeItems | Where-Object {
    $shouldInclude = $true
    foreach ($exclude in $excludeItems) {
        if ($_.Name -like $exclude -or $_.FullName -like "*\$exclude\*") {
            $shouldInclude = $false
            break
        }
    }
    return $shouldInclude
}

# Create the zip file
Write-Host "Compressing files..." -ForegroundColor Yellow
$itemsToZip | Compress-Archive -DestinationPath $zipName -Force

# Get file size
$zipSize = (Get-Item $zipName).Length / 1MB
$zipSizeFormatted = "{0:N2}" -f $zipSize

Write-Host ""
Write-Host "✓ ZIP file created successfully!" -ForegroundColor Green
Write-Host "  File: $zipName" -ForegroundColor White
Write-Host "  Size: $zipSizeFormatted MB" -ForegroundColor White
Write-Host ""

if ($zipSize -gt 100) {
    Write-Host "⚠ Warning: ZIP file is larger than 100MB." -ForegroundColor Yellow
    Write-Host "  You may want to check if node_modules or vendor are still included." -ForegroundColor Yellow
} else {
    Write-Host "✓ ZIP size looks good!" -ForegroundColor Green
}

Write-Host ""
Write-Host "You can now upload this ZIP file to Google Drive." -ForegroundColor Cyan

