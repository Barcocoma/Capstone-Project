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
    exit;
}

// Check if user is authenticated
$actorId = get_actor_user_id();
if (!$actorId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// Only admin can update settings
$stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
$stmt->execute([$actorId]);
$actorRole = strtolower($stmt->fetchColumn() ?: '');

if ($actorRole !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden: Admin access required']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['setting_key']) || !isset($data['setting_value'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$settingKey = $data['setting_key'];
$settingValue = $data['setting_value'];
$userId = $actorId;

// Validate settings
if ($settingKey === 'backup_retention_days') {
    $validValues = [7, 30, 365, 1095, 0]; // 1 week, 1 month, 1 year, 3 years, forever
    if (!in_array(intval($settingValue), $validValues)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid retention days value']);
        exit;
    }
} else if ($settingKey === 'auto_cleanup_enabled') {
    if (!in_array($settingValue, ['0', '1'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid auto cleanup value']);
        exit;
    }
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid setting key']);
    exit;
}

// Check if MySQLi connection is available
if (!isset($conn) || $conn === null) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection error. Please check server configuration.']);
    exit;
}

try {
    $stmt = $conn->prepare("
        UPDATE system_settings 
        SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE setting_key = ?
    ");
    $stmt->bind_param("sis", $settingValue, $userId, $settingKey);
    $stmt->execute();
    
    echo json_encode([
        'success' => true,
        'message' => 'Setting updated successfully',
        'setting_key' => $settingKey,
        'setting_value' => $settingValue
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
?>

