<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $id = $_GET['id'] ?? '';
    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Missing record ID']);
        exit;
    }
    // Get lot_id before deletion
    $lotId = null;
    try {
        $g = $pdo->prepare("SELECT lot_id FROM deceased_records WHERE id = ?");
        $g->execute([$id]);
        $lotId = $g->fetchColumn();
    } catch (Throwable $e) {}
    
    $actorId = get_actor_user_id();

    // Get deceased record data before deletion for backup
    $deceased_stmt = $pdo->prepare("SELECT * FROM deceased_records WHERE id = ? AND deleted_at IS NULL");
    $deceased_stmt->execute([$id]);
    $deceased_data = $deceased_stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$deceased_data) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Deceased record not found or already deleted']);
        exit;
    }
    
    // Create backup
    require_once 'config.php';
    if (isset($conn)) {
        $snapshot_data = json_encode($deceased_data);
        $backup_stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('deceased', ?, ?, NULL, ?)");
        $backup_stmt->bind_param("isi", $id, $snapshot_data, $actorId);
        $backup_stmt->execute();
    }

    // Use soft delete instead of hard delete
    $now = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare("UPDATE deceased_records SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL");
    $result = $stmt->execute([$now, $actorId, $id]);

    if ($result && $stmt->rowCount() > 0) {
        // Recalculate vault counters based on remaining deceased records
        try {
            if ($lotId) {
                // Check how many active deceased records remain
                $c = $pdo->prepare("SELECT COUNT(*) FROM deceased_records WHERE lot_id = ? AND deleted_at IS NULL AND status = 'BURIED'");
                $c->execute([$lotId]);
                $remaining = (int)($c->fetchColumn() ?: 0);
                
                if ($remaining === 0) {
                    // No more deceased in this lot - reset vault and update status
                    // Check if lot has owner to determine status
                    $lotCheck = $pdo->prepare("SELECT customer_id FROM lots WHERE id = ?");
                    $lotCheck->execute([$lotId]);
                    $customerId = $lotCheck->fetchColumn();
                    $newStatus = $customerId ? 'reserved' : 'available';
                    
                    $pdo->prepare("UPDATE lots SET vault_option = NULL, lower_body = 0, upper_body = 0, lower_bone = 0, upper_bone = 0, status = ? WHERE id = ?")
                        ->execute([$newStatus, $lotId]);
                } else {
                    // Still have deceased records - recalculate counters from scratch
                    // This ensures accuracy after deletion
                    $recalc = $pdo->prepare("
                        SELECT vault_option FROM lots WHERE id = ?
                    ");
                    $recalc->execute([$lotId]);
                    $vaultOpt = $recalc->fetchColumn();
                    
                    if ($vaultOpt) {
                        // Reset counters and recalculate based on vault option and remaining count
                        $newLB = 0;
                        $newUB = 0;
                        $newLBN = 0;
                        $newUBN = 0;
                        
                        // Auto-calculate based on vault option
                        if ($vaultOpt === 'option1') {
                            // Option 1: 2 bodies first, then up to 4 bones
                            if ($remaining >= 1) { $newLB = 1; }
                            if ($remaining >= 2) { $newUB = 1; }
                            $bones = max(0, $remaining - 2);
                            $newLBN = min($bones, 4);
                            $newUBN = max(0, min($bones - 4, 4));
                        } else if ($vaultOpt === 'option2') {
                            // Option 2: 1 body (lower), then up to 5 bones (upper)
                            if ($remaining >= 1) { $newLB = 1; }
                            $bones = max(0, $remaining - 1);
                            $newUBN = min($bones, 5);
                        } else if ($vaultOpt === 'option3') {
                            // Option 3: Bones only - 3 lower, 3 upper
                            $newLBN = min($remaining, 3);
                            $newUBN = min(max(0, $remaining - 3), 3);
                        }
                        
                        $pdo->prepare("UPDATE lots SET lower_body = ?, upper_body = ?, lower_bone = ?, upper_bone = ? WHERE id = ?")
                            ->execute([$newLB, $newUB, $newLBN, $newUBN, $lotId]);
                    }
                }
            }
        } catch (Throwable $e) {}

        // Record activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Deleted',
            'Deceased',
            "Deceased record with ID '$id' soft deleted (can be restored from Backup & Recovery)",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Deceased record deleted successfully (can be restored from Backup & Recovery)',
            'deleted_id' => $id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to delete deceased record or already deleted']);
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
