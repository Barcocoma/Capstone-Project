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
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Accept any data without strict validation
    $id = $data['id'] ?? '';

    $actorId = get_actor_user_id();

    // Block deletion if there are buried deceased in this lot
    $chk = $pdo->prepare("SELECT COUNT(*) FROM deceased_records WHERE lot_id = ? AND status = 'BURIED' AND deleted_at IS NULL");
    $chk->execute([$id]);
    $buriedCount = (int)$chk->fetchColumn();
    if ($buriedCount > 0) {
        echo json_encode(['success' => false, 'message' => 'Cannot delete ownership: there are buried deceased in this lot.']);
        exit;
    }

    // For ownership deletion: we don't soft-delete the lot itself, just remove the ownership and backup the relationship
    $now = date('Y-m-d H:i:s');
    
    // Get current lot details before deletion for backup (include username + email for smarter restore)
    $lot_stmt = $pdo->prepare("SELECT l.*, u.username, u.email, u.first_name, u.last_name FROM lots l LEFT JOIN users u ON l.customer_id = u.id WHERE l.id = ? AND l.customer_id IS NOT NULL");
    $lot_stmt->execute([$id]);
    $lot_data = $lot_stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$lot_data) {
        echo json_encode(['success' => false, 'message' => 'Lot ownership not found or lot is not owned']);
        exit;
    }
    
    // Get related data
    $payment_records = [];
    $payment_plans = [];
    $deceased_records = [];
    
    $pr_stmt = $pdo->prepare("SELECT * FROM payment_records WHERE lot_id = ? AND deleted_at IS NULL");
    $pr_stmt->execute([$id]);
    while ($pr = $pr_stmt->fetch(PDO::FETCH_ASSOC)) {
        $payment_records[] = $pr;
    }
    
    $pp_stmt = $pdo->prepare("SELECT * FROM payment_plans WHERE lot_id = ? AND deleted_at IS NULL");
    $pp_stmt->execute([$id]);
    while ($pp = $pp_stmt->fetch(PDO::FETCH_ASSOC)) {
        $payment_plans[] = $pp;
    }
    
    $dr_stmt = $pdo->prepare("SELECT * FROM deceased_records WHERE lot_id = ? AND deleted_at IS NULL");
    $dr_stmt->execute([$id]);
    while ($dr = $dr_stmt->fetch(PDO::FETCH_ASSOC)) {
        $deceased_records[] = $dr;
    }
    
    // Create backup
    require_once 'config.php';
    if (isset($conn)) {
        $snapshot_data = json_encode($lot_data);
        $related_data = json_encode([
            'payment_records' => $payment_records,
            'payment_plans' => $payment_plans,
            'deceased' => $deceased_records
        ]);
        
        $backup_stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('lot', ?, ?, ?, ?)");
        $backup_stmt->bind_param("issi", $id, $snapshot_data, $related_data, $actorId);
        $backup_stmt->execute();
    }
    
    // 1) Soft delete payment plans and payment records for this lot
    $pdo->prepare("UPDATE payment_plans SET deleted_at = ?, deleted_by = ? WHERE lot_id = ? AND deleted_at IS NULL")->execute([$now, $actorId, $id]);
    $pdo->prepare("UPDATE payment_records SET deleted_at = ?, deleted_by = ? WHERE lot_id = ? AND deleted_at IS NULL")->execute([$now, $actorId, $id]);

    // 2) Clear ownership (DON'T soft delete the lot - keep it available for new ownership)
    $sql = "UPDATE lots SET status='available', customer_id=NULL, purchase_date=NULL WHERE id = ?";
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute([$id]);

    if ($result && $stmt->rowCount() > 0) {
        // Record activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Deleted',
            'Ownership',
            "Ownership for lot ID '$id' removed (can be restored from Backup & Recovery). Lot is now available.",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        echo json_encode(['success' => true, 'message' => 'Ownership deleted successfully. Lot is now available. Can be restored from Backup & Recovery.']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to delete ownership']);
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
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}
?> 