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
    
    $id = isset($data['id']) ? (int)$data['id'] : 0; // lot id
    $customer_id = isset($data['customer_id']) ? (int)$data['customer_id'] : 0; // new owner user id
    $confirm_with_deceased = isset($data['confirm_with_deceased']) ? (bool)$data['confirm_with_deceased'] : false;
    if ($id <= 0 || $customer_id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Missing required fields']);
        exit;
    }

    // Disallow transferring to the same current owner
    $cur = $pdo->prepare("SELECT customer_id FROM lots WHERE id = ?");
    $cur->execute([$id]);
    $currentOwner = (int)($cur->fetchColumn() ?: 0);
    if ($currentOwner === $customer_id) {
        echo json_encode(['success' => false, 'message' => 'Cannot transfer to the same customer']);
        exit;
    }

    // If there are deceased buried, require explicit confirmation
    $hasBuried = $pdo->prepare("SELECT d.name FROM deceased_records d WHERE d.lot_id = ? AND d.status = 'BURIED' AND d.deleted_at IS NULL LIMIT 1");
    $hasBuried->execute([$id]);
    $buriedName = $hasBuried->fetchColumn();
    if ($buriedName) {
        echo json_encode(['success' => false, 'blocked' => true, 'message' => "🚫 TRANSFER BLOCKED: Cannot transfer lot with buried deceased: " . ($buriedName ?: 'Unknown'). ". Ownership transfer is prohibited when there is a buried person in this lot."]);
        exit;
    }

    // Keep current lot data; only transfer ownership to new customer
    $purchaseDate = date('Y-m-d');
    $stmt = $pdo->prepare("UPDATE lots SET customer_id = ?, purchase_date = ? WHERE id = ?");
    $ok = $stmt->execute([$customer_id, $purchaseDate, $id]);

    if ($ok) {
        // Reassign all related records to the new owner so payment plan, status and history carry over
        try {
            // Move payment plan ownership (if any)
            $updPlan = $pdo->prepare("UPDATE payment_plans SET customer_id = ? WHERE lot_id = ?");
            $updPlan->execute([$customer_id, $id]);
        } catch (Throwable $e) {}
        try {
            // Update any pending/recorded payment sessions to the new owner
            $updSessions = $pdo->prepare("UPDATE payment_sessions SET customer_id = ? WHERE lot_id = ?");
            $updSessions->execute([$customer_id, $id]);
        } catch (Throwable $e) {}
        // NOTE: Do NOT delete payment_records; they are linked by lot_id and should follow the lot

        // Record activity
        $actorId = get_actor_user_id();
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Updated',
            'Ownership',
            "Ownership transferred for lot ID '$id' to user ID $customer_id",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        echo json_encode(['success' => true, 'message' => 'Ownership updated successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update ownership']);
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