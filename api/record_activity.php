<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
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
    
    // Validate required fields
    $action = trim($data['action'] ?? '');
    $type = trim($data['type'] ?? '');
    $details = trim($data['details'] ?? '');
    $performed_by = $data['performed_by'] ?? null;
    $ip_address = $_SERVER['REMOTE_ADDR'] ?? '';
    $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    
    // Validate required fields - action and type must not be empty
    if (empty($action)) {
        echo json_encode([
            'success' => false,
            'message' => 'Action is required'
        ]);
        exit;
    }
    
    if (empty($type)) {
        echo json_encode([
            'success' => false,
            'message' => 'Type is required'
        ]);
        exit;
    }
    
    if (empty($details)) {
        echo json_encode([
            'success' => false,
            'message' => 'Details are required'
        ]);
        exit;
    }
    
    $sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$action, $type, $details, $performed_by, $ip_address, $user_agent]);
    
    echo json_encode([
        'success' => true,
        'message' => 'Activity recorded successfully'
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
