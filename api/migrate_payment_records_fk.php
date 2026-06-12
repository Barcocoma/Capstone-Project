<?php
require_once 'config.php';

try {
    global $pdo;

    // Check if foreign key constraint already exists
    $check_sql = "SELECT COUNT(*) as cnt 
                  FROM information_schema.KEY_COLUMN_USAGE 
                  WHERE TABLE_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'payment_records' 
                  AND COLUMN_NAME = 'lot_id' 
                  AND REFERENCED_TABLE_NAME = 'lots'";
    $check_result = $pdo->query($check_sql)->fetch(PDO::FETCH_ASSOC);
    
    if ($check_result['cnt'] > 0) {
        echo "Foreign key constraint on payment_records.lot_id already exists. Migration skipped.\n";
        exit(0);
    }

    // Add foreign key constraint
    $sql = "ALTER TABLE payment_records 
            ADD CONSTRAINT fk_payment_records_lot 
            FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE";
    $pdo->exec($sql);

    echo "Migration 'add_foreign_key_to_payment_records' completed successfully.\n";

} catch (PDOException $e) {
    if ($e->getCode() == '23000' || str_contains($e->getMessage(), 'foreign key constraint')) {
        echo "Foreign key constraint already exists or there are orphaned records. Migration skipped.\n";
        echo "Note: If you have orphaned payment_records with invalid lot_id values, please clean them up first.\n";
    } else {
        echo "Migration failed: " . $e->getMessage() . "\n";
        exit(1);
    }
} catch (Exception $e) {
    echo "An unexpected error occurred: " . $e->getMessage() . "\n";
    exit(1);
}
?>

