<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

try {
    global $pdo;
    
    // Check for problematic records
    $problem_check = "SELECT COUNT(*) as cnt FROM activity_log WHERE action = '' OR type = '' OR action IS NULL OR type IS NULL OR type = 'Unknown'";
    $problem_count = $pdo->query($problem_check)->fetch(PDO::FETCH_ASSOC)['cnt'];
    
    echo "Records with blank/Unknown issues: {$problem_count}\n\n";
    
    if ($problem_count > 0) {
        $samples = $pdo->query("SELECT id, action, type, details FROM activity_log WHERE action = '' OR type = '' OR action IS NULL OR type IS NULL OR type = 'Unknown' LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
        echo "Sample problematic records:\n";
        foreach ($samples as $row) {
            echo "  ID: {$row['id']}, Action: " . ($row['action'] ?: 'NULL/EMPTY') . ", Type: " . ($row['type'] ?: 'NULL/EMPTY') . "\n";
        }
    }
    
    // Count payment-related records
    $payment_count = $pdo->query("SELECT COUNT(*) as cnt FROM activity_log WHERE type = 'Payment Monitoring'")->fetch(PDO::FETCH_ASSOC)['cnt'];
    echo "\nTotal Payment Monitoring records: {$payment_count}\n";
    
    $pay_action_count = $pdo->query("SELECT COUNT(*) as cnt FROM activity_log WHERE action = 'Pay'")->fetch(PDO::FETCH_ASSOC)['cnt'];
    echo "Total 'Pay' action records: {$pay_action_count}\n";
    
    echo json_encode([
        'success' => true,
        'problematic_records' => $problem_count,
        'payment_monitoring_count' => $payment_count,
        'pay_action_count' => $pay_action_count
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>

