<?php
require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    // Add Maya payment columns to payment_records table
    $migrationQueries = [
        // Add checkout_id column for Maya checkout session ID
        "ALTER TABLE payment_records ADD COLUMN checkout_id VARCHAR(255) NULL AFTER payment_method",
        
        // Add request_reference_number for Maya transaction reference
        "ALTER TABLE payment_records ADD COLUMN request_reference_number VARCHAR(255) NULL AFTER checkout_id",
        
        // Add payment_gateway column to track which gateway was used
        "ALTER TABLE payment_records ADD COLUMN payment_gateway ENUM('cash', 'gcash', 'maya', 'paypal', 'other') DEFAULT 'cash' AFTER request_reference_number",
        
        // Add transaction_id for external payment gateway transaction ID
        "ALTER TABLE payment_records ADD COLUMN transaction_id VARCHAR(255) NULL AFTER payment_gateway",
        
        // Add webhook_data column to store payment gateway webhook responses
        "ALTER TABLE payment_records ADD COLUMN webhook_data TEXT NULL AFTER transaction_id",
        
        // Add index for better performance on checkout_id lookups
        "CREATE INDEX idx_checkout_id ON payment_records(checkout_id)",
        
        // Add index for request_reference_number lookups
        "CREATE INDEX idx_request_reference ON payment_records(request_reference_number)"
    ];

    $results = [];
    $success = true;

    foreach ($migrationQueries as $query) {
        try {
            $pdo->exec($query);
            $results[] = [
                'query' => $query,
                'status' => 'success',
                'message' => 'Executed successfully'
            ];
        } catch (PDOException $e) {
            // Check if it's a "duplicate column" error (column already exists)
            if (strpos($e->getMessage(), 'Duplicate column name') !== false || 
                strpos($e->getMessage(), 'already exists') !== false) {
                $results[] = [
                    'query' => $query,
                    'status' => 'skipped',
                    'message' => 'Column/index already exists'
                ];
            } else {
                $results[] = [
                    'query' => $query,
                    'status' => 'error',
                    'message' => $e->getMessage()
                ];
                $success = false;
            }
        }
    }

    // Verify the table structure
    $tableInfo = $pdo->query("DESCRIBE payment_records")->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => $success,
        'message' => $success ? 'Maya payment migration completed successfully' : 'Migration completed with some errors',
        'migration_results' => $results,
        'table_structure' => $tableInfo
    ]);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Migration failed: ' . $e->getMessage()
    ]);
}
?>
