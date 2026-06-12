<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

try {
    global $pdo;
    
    echo "Fixing old payment activity logs...\n";
    
    // Update old payment actions to "Pay"
    $update_actions = [
        "UPDATE activity_log SET action = 'Pay' WHERE action IN ('F2F Payment Processed', 'Payment Processed', 'Payment Completed', 'Payment', 'Monthly Payment Initiated') AND details LIKE '%payment%'",
        "UPDATE activity_log SET action = 'Pay' WHERE action = 'Payment'",
        "UPDATE activity_log SET action = 'Pay' WHERE action = 'Created' AND (details LIKE '%payment%' OR details LIKE '%Payment%' OR type = 'Payment Monitoring')",
    ];
    
    foreach ($update_actions as $sql) {
        $affected = $pdo->exec($sql);
        echo "✓ Updated {$affected} records for action\n";
    }
    
    // Update old payment types to "Payment Monitoring"
    $update_types = [
        "UPDATE activity_log SET type = 'Payment Monitoring' WHERE type = 'Payment' AND details LIKE '%payment%'",
        "UPDATE activity_log SET type = 'Payment Monitoring' WHERE details LIKE '%payment%' AND type IN ('System', 'Unknown')",
    ];
    
    foreach ($update_types as $sql) {
        $affected = $pdo->exec($sql);
        echo "✓ Updated {$affected} records for type\n";
    }
    
    // Fix records that have blank or NULL values that weren't caught before
    $fix_blank = "UPDATE activity_log SET action = COALESCE(NULLIF(action, ''), 'Created'), type = COALESCE(NULLIF(type, ''), 'System') WHERE action = '' OR type = '' OR action IS NULL OR type IS NULL";
    $affected = $pdo->exec($fix_blank);
    echo "✓ Fixed {$affected} records with blank values\n";
    
    // Count remaining problematic records
    $check_problem = "SELECT COUNT(*) as cnt FROM activity_log WHERE action = '' OR type = '' OR action IS NULL OR type IS NULL";
    $problem_count = $pdo->query($check_problem)->fetch(PDO::FETCH_ASSOC)['cnt'];
    
    echo "\nCleanup completed!\n";
    echo "Remaining problematic records: {$problem_count}\n";
    
    // Show sample of current payment logs
    $sample_sql = "SELECT action, type, details FROM activity_log WHERE details LIKE '%payment%' ORDER BY created_at DESC LIMIT 5";
    $sample = $pdo->query($sample_sql)->fetchAll(PDO::FETCH_ASSOC);
    
    echo "\nSample payment logs:\n";
    foreach ($sample as $row) {
        echo "  - Action: {$row['action']}, Type: {$row['type']}\n";
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Old payment logs fixed successfully',
        'remaining_problems' => $problem_count,
        'samples' => $sample
    ]);
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    echo json_encode([
        'success' => false,
        'message' => 'Fix failed: ' . $e->getMessage()
    ]);
}
?>

