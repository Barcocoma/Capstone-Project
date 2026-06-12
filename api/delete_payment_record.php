<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    exit;
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = $data['id'] ?? 0;
    
    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Missing payment record ID']);
        exit;
    }
    
    $actorId = get_actor_user_id();

    // Get payment info before deletion for activity log and backup
    $get_payment_sql = "SELECT * FROM payment_records WHERE id = ? AND deleted_at IS NULL";
    $get_payment_stmt = $pdo->prepare($get_payment_sql);
    $get_payment_stmt->execute([$id]);
    $payment_data = $get_payment_stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$payment_data) {
        echo json_encode(['success' => false, 'message' => 'Payment record not found or already deleted']);
        exit;
    }
    
    $lot_id = $payment_data['lot_id'] ?? 'Unknown';
    $owner_name = $payment_data['owner_name'] ?? 'Unknown';
    $payment_amount = $payment_data['payment_amount'] ?? 0;
    
    // Create backup
    require_once 'config.php';
    if (isset($conn)) {
        $snapshot_data = json_encode($payment_data);
        $backup_stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('payment', ?, ?, NULL, ?)");
        $backup_stmt->bind_param("isi", $id, $snapshot_data, $actorId);
        $backup_stmt->execute();
    }
    
    // Use soft delete instead of hard delete
    $now = date('Y-m-d H:i:s');
    $sql = "UPDATE payment_records SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$now, $actorId, $id]);
    
    if ($stmt->rowCount() > 0) {
        // Record activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Deleted',
            'Payment',
            "Payment record soft deleted for lot '$lot_id' - Owner: $owner_name - Amount: $payment_amount (can be restored from Backup & Recovery)",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
        
        echo json_encode(['success' => true, 'message' => 'Payment record deleted successfully (can be restored from Backup & Recovery)']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Payment record not found or already deleted']);
    }
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
