<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

try {
    global $pdo;
    
    echo "Starting activity_log migration...\n";
    
    // First, check current structure
    $check_sql = "SHOW COLUMNS FROM activity_log WHERE Field = 'action'";
    $check_stmt = $pdo->query($check_sql);
    $action_col = $check_stmt->fetch(PDO::FETCH_ASSOC);
    
    $check_sql2 = "SHOW COLUMNS FROM activity_log WHERE Field = 'type'";
    $check_stmt2 = $pdo->query($check_sql2);
    $type_col = $check_stmt2->fetch(PDO::FETCH_ASSOC);
    
    echo "Current action column type: " . ($action_col['Type'] ?? 'N/A') . "\n";
    echo "Current type column type: " . ($type_col['Type'] ?? 'N/A') . "\n";
    
    // Change action column from ENUM to VARCHAR to allow any values
    $alter_action_sql = "ALTER TABLE activity_log MODIFY COLUMN action VARCHAR(50) NOT NULL";
    $pdo->exec($alter_action_sql);
    echo "✓ Changed action column to VARCHAR(50)\n";
    
    // Change type column from ENUM to VARCHAR to allow any values
    $alter_type_sql = "ALTER TABLE activity_log MODIFY COLUMN type VARCHAR(50) NOT NULL";
    $pdo->exec($alter_type_sql);
    echo "✓ Changed type column to VARCHAR(50)\n";
    
    // Update any NULL or empty values to meaningful defaults
    $update_blank_action = "UPDATE activity_log SET action = 'Created' WHERE action IS NULL OR action = ''";
    $stmt1 = $pdo->exec($update_blank_action);
    echo "✓ Updated {$stmt1} blank action records\n";
    
    $update_blank_type = "UPDATE activity_log SET type = 'System' WHERE type IS NULL OR type = ''";
    $stmt2 = $pdo->exec($update_blank_type);
    echo "✓ Updated {$stmt2} blank type records\n";
    
    // Verify the changes
    $verify_sql = "SHOW COLUMNS FROM activity_log WHERE Field IN ('action', 'type')";
    $verify_stmt = $pdo->query($verify_sql);
    $columns = $verify_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "\nMigration completed successfully!\n";
    echo "Updated columns:\n";
    foreach ($columns as $col) {
        echo "  - {$col['Field']}: {$col['Type']}\n";
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Activity log table migrated successfully',
        'columns' => $columns
    ]);
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    echo json_encode([
        'success' => false,
        'message' => 'Migration failed: ' . $e->getMessage()
    ]);
}
?>

