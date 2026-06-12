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
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $lot_id = intval($data['lot_id'] ?? 0);
    $owner_id = $data['owner_id'] ?? null;

    if (!$lot_id) {
        echo json_encode(['success' => false, 'message' => 'Missing lot_id']);
        exit;
    }

    if ($owner_id !== null && $owner_id !== '') {
        $sql = "UPDATE lots SET owner_id = ? WHERE id = ?";
        $params = [$owner_id, $lot_id];
    } else {
        $sql = "UPDATE lots SET owner_id = NULL WHERE id = ?";
        $params = [$lot_id];
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Record activity
    $actorId = get_actor_user_id();
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'Lot',
        "Lot owner updated for lot ID '$lot_id'",
        $actorId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);

    echo json_encode(['success' => true, 'message' => 'Lot owner updated successfully']);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?> 