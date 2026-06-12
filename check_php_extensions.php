<?php
/**
 * PHP Extensions Checker for Excel Import Feature
 * 
 * This script checks if required PHP extensions are enabled
 * Run this file in your browser: http://localhost/ManagementSystem/check_php_extensions.php
 */

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <title>PHP Extensions Checker</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }
        .extension {
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
            border-left: 4px solid;
        }
        .enabled {
            background: #d4edda;
            border-color: #28a745;
            color: #155724;
        }
        .disabled {
            background: #f8d7da;
            border-color: #dc3545;
            color: #721c24;
        }
        .status {
            font-weight: bold;
            font-size: 18px;
        }
        .instructions {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
        }
        .instructions h3 {
            margin-top: 0;
            color: #856404;
        }
        .instructions ol {
            line-height: 1.8;
        }
        .phpinfo-link {
            display: inline-block;
            margin-top: 20px;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
        }
        .phpinfo-link:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 PHP Extensions Checker</h1>
        <p>This tool checks if required PHP extensions are enabled for Excel import functionality.</p>
        
        <?php
        $required = [
            'zip' => 'Required for reading Excel files (.xlsx)',
            'xml' => 'Required for PhpSpreadsheet',
            'gd' => 'Optional but recommended for image processing'
        ];
        
        $allEnabled = true;
        
        foreach ($required as $ext => $description) {
            $enabled = extension_loaded($ext);
            if (!$enabled && $ext === 'zip') {
                $allEnabled = false;
            }
            ?>
            <div class="extension <?php echo $enabled ? 'enabled' : 'disabled'; ?>">
                <div class="status">
                    <?php echo $enabled ? '✓ ENABLED' : '✗ DISABLED'; ?>: 
                    <strong><?php echo strtoupper($ext); ?></strong>
                </div>
                <div style="margin-top: 5px; font-size: 14px;">
                    <?php echo $description; ?>
                </div>
            </div>
            <?php
        }
        ?>
        
        <?php if (!$allEnabled): ?>
        <div class="instructions">
            <h3>⚠️ Action Required: Enable Zip Extension</h3>
            <p>The <strong>zip</strong> extension is required for Excel import. Follow these steps:</p>
            <ol>
                <li><strong>Open php.ini file:</strong><br>
                    Location: <code><?php echo php_ini_loaded_file(); ?></code><br>
                    Or use XAMPP Control Panel → Apache → Config → PHP (php.ini)
                </li>
                <li><strong>Find the zip extension line:</strong><br>
                    Search for: <code>extension=zip</code> (press Ctrl+F)
                </li>
                <li><strong>Uncomment the line:</strong><br>
                    Change: <code>;extension=zip</code><br>
                    To: <code>extension=zip</code><br>
                    (Remove the semicolon at the beginning)
                </li>
                <li><strong>Save the file</strong> (Ctrl+S)</li>
                <li><strong>Restart Apache:</strong><br>
                    In XAMPP Control Panel, click <strong>Stop</strong> then <strong>Start</strong> for Apache
                </li>
                <li><strong>Refresh this page</strong> to verify the extension is now enabled</li>
            </ol>
            
            <p><strong>Note:</strong> If you can't find <code>extension=zip</code> in php.ini, you may need to add it manually. Add this line in the extensions section:</p>
            <code style="background: #f0f0f0; padding: 5px 10px; display: block; margin-top: 10px;">
                extension=zip
            </code>
        </div>
        <?php else: ?>
        <div class="extension enabled">
            <div class="status">✅ All Required Extensions Are Enabled!</div>
            <p style="margin-top: 10px;">Your PHP configuration is ready for Excel import functionality.</p>
        </div>
        <?php endif; ?>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <h3>Additional Information</h3>
            <p><strong>PHP Version:</strong> <?php echo PHP_VERSION; ?></p>
            <p><strong>Active PHP Configuration File:</strong> <code><?php echo php_ini_loaded_file(); ?></code></p>
            <p style="background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 10px;">
                <strong>⚠️ Important:</strong> This is the file you should edit!<br>
                Don't edit <code>php.ini-development</code> or <code>php.ini-production</code> - those are just templates.
            </p>
            <p><strong>Additional .ini files:</strong> <?php echo php_ini_scanned_files() ?: 'None'; ?></p>
            
            <a href="?phpinfo=1" class="phpinfo-link">View Full PHP Info</a>
        </div>
        
        <?php if (isset($_GET['phpinfo'])): ?>
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 5px;">
            <h3>Full PHP Configuration:</h3>
            <?php phpinfo(); ?>
        </div>
        <?php endif; ?>
    </div>
</body>
</html>

