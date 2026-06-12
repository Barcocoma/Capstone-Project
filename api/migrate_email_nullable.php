<?php
/**
 * Migration script to make email column nullable
 * Run this once to update existing database schema
 */
require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

try {
    // Check if email column exists and is NOT NULL
    $check_sql = "SELECT IS_NULLABLE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
                  WHERE TABLE_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'users' 
                  AND COLUMN_NAME = 'email'";
    
    $result = $pdo->query($check_sql);
    $column_info = $result->fetch(PDO::FETCH_ASSOC);
    
    if (!$column_info) {
        echo json_encode([
            'success' => false,
            'message' => 'Email column not found in users table'
        ]);
        exit;
    }
    
    // If email is already nullable, no migration needed
    if ($column_info['IS_NULLABLE'] === 'YES') {
        echo json_encode([
            'success' => true,
            'message' => 'Email column is already nullable. No migration needed.'
        ]);
        exit;
    }
    
    // Drop the unique constraint first (if it exists as a named constraint)
    // Note: In MySQL, UNIQUE constraints on columns are part of the column definition
    // We need to modify the column to allow NULL and keep UNIQUE
    try {
        // For MySQL, we modify the column to allow NULL while keeping UNIQUE
        // Multiple NULL values are allowed in UNIQUE columns in MySQL
        $alter_sql = "ALTER TABLE users MODIFY COLUMN email VARCHAR(100) NULL";
        $pdo->exec($alter_sql);
        
        // Re-add unique constraint (MySQL allows multiple NULLs in UNIQUE columns)
        // The UNIQUE constraint will remain but allow NULL values
        $unique_check = "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = 'users' 
                        AND CONSTRAINT_TYPE = 'UNIQUE' 
                        AND CONSTRAINT_NAME LIKE '%email%'";
        $unique_result = $pdo->query($unique_check);
        $unique_exists = $unique_result->fetch(PDO::FETCH_ASSOC);
        
        if (!$unique_exists) {
            // Add unique constraint if it doesn't exist
            $pdo->exec("ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)");
        }
        
        echo json_encode([
            'success' => true,
            'message' => 'Email column successfully updated to allow NULL values'
        ]);
    } catch (PDOException $e) {
        // If the error is about the constraint already existing, that's okay
        if (strpos($e->getMessage(), 'Duplicate key name') !== false) {
            echo json_encode([
                'success' => true,
                'message' => 'Email column updated. Unique constraint already exists.'
            ]);
        } else {
            throw $e;
        }
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>


