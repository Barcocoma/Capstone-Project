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
    
    // Accept any data without strict validation
    $id = $data['id'] ?? 0;
    $lot_id = $data['lotNumber'] ?? '';
    $owner_name = $data['ownerName'] ?? '';
    $contact = $data['contact'] ?? '';
    $section = $data['section'] ?? '';
    $payment_amount = $data['paymentAmount'] ?? 0;
    $payment_method = $data['paymentMethod'] ?? 'Cash';
    $payment_due_date = $data['paymentDue'] ?? '';
    $last_payment_date = $data['lastPayment'] ?? '';
    $status = $data['status'] ?? 'Pending';
    $payment_date = $data['paymentDate'] ?? '';
    $notes = $data['notes'] ?? '';
    
    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Missing payment record ID']);
        exit;
    }

    $sql = "UPDATE payment_records SET lot_id = ?, owner_name = ?, contact = ?, section = ?, 
            payment_amount = ?, payment_method = ?, payment_due_date = ?, last_payment_date = ?, 
            status = ?, payment_date = ?, notes = ? WHERE id = ?";
    
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute([
        $lot_id, $owner_name, $contact, $section, $payment_amount, 
        $payment_method, $payment_due_date, $last_payment_date, $status, $payment_date, $notes, $id
    ]);

    if ($result) {
        // Record activity
        $actorId = get_actor_user_id();
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Updated',
            'Payment',
            "Payment record updated for lot '$lot_id' - Owner: $owner_name - Amount: $payment_amount",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
        
        echo json_encode(['success' => true, 'message' => 'Payment record updated successfully']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to update payment record']);
    }
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
