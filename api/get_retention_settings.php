<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

// Only admin can view settings
$stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
$stmt->execute([$actorId]);
$actorRole = strtolower($stmt->fetchColumn() ?: '');

if ($actorRole !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden: Admin access required']);
    exit;
}

// Check if MySQLi connection is available
if (!isset($conn) || $conn === null) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection error. Please check server configuration.']);
    exit;
}

try {
    // Get retention settings
    $stmt = $conn->prepare("SELECT * FROM system_settings WHERE setting_key IN ('backup_retention_days', 'auto_cleanup_enabled')");
    $stmt->execute();
    $result = $stmt->get_result();
    
    $settings = [];
    while ($row = $result->fetch_assoc()) {
        $settings[$row['setting_key']] = [
            'value' => $row['setting_value'],
            'description' => $row['description'],
            'updated_at' => $row['updated_at']
        ];
    }
    
    // Get count of expired backups
    $retentionDays = intval($settings['backup_retention_days']['value'] ?? 30);
    $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$retentionDays} days"));
    
    $stmt = $conn->prepare("SELECT COUNT(*) as count FROM deleted_records_backup WHERE deleted_at < ? AND can_restore = 1");
    $stmt->bind_param("s", $cutoffDate);
    $stmt->execute();
    $result = $stmt->get_result();
    $expiredCount = $result->fetch_assoc()['count'];
    
    // Get total backup count
    $stmt = $conn->prepare("SELECT COUNT(*) as count FROM deleted_records_backup");
    $stmt->execute();
    $result = $stmt->get_result();
    $totalCount = $result->fetch_assoc()['count'];
    
    echo json_encode([
        'success' => true,
        'settings' => $settings,
        'stats' => [
            'total_backups' => $totalCount,
            'expired_backups' => $expiredCount,
            'retention_days' => $retentionDays,
            'cutoff_date' => $cutoffDate
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
?>

