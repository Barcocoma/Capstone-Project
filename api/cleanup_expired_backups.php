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

// Only admin can cleanup
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
    $conn->begin_transaction();
    
    // Get retention settings
    $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'backup_retention_days'");
    $stmt->execute();
    $result = $stmt->get_result();
    $setting = $result->fetch_assoc();
    
    $retentionDays = intval($setting['setting_value'] ?? 30);
    
    // If retention is 0 (keep forever), don't delete anything
    if ($retentionDays === 0) {
        echo json_encode([
            'success' => true,
            'message' => 'Retention is set to keep all backups forever. No cleanup performed.',
            'deleted_count' => 0
        ]);
        exit;
    }
    
    $cutoffDate = date('Y-m-d H:i:s', strtotime("-{$retentionDays} days"));
    
    // Get expired backups
    $stmt = $conn->prepare("
        SELECT id, record_type, record_id 
        FROM deleted_records_backup 
        WHERE deleted_at < ? AND can_restore = 1
    ");
    $stmt->bind_param("s", $cutoffDate);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $expiredBackups = [];
    while ($row = $result->fetch_assoc()) {
        $expiredBackups[] = $row;
    }
    
    if (empty($expiredBackups)) {
        $conn->commit();
        echo json_encode([
            'success' => true,
            'message' => 'No expired backups found',
            'deleted_count' => 0
        ]);
        exit;
    }
    
    // Permanently delete expired records
    foreach ($expiredBackups as $backup) {
        $recordType = $backup['record_type'];
        $recordId = $backup['record_id'];
        
        switch ($recordType) {
            case 'user':
                // Permanently delete user and related records
                $stmt = $conn->prepare("DELETE FROM customers WHERE user_id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                
                $stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                break;
                
            case 'lot':
                // Permanently delete lot and related records
                $stmt = $conn->prepare("DELETE FROM deceased_records WHERE lot_id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                
                $stmt = $conn->prepare("DELETE FROM payment_records WHERE lot_id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                
                $stmt = $conn->prepare("DELETE FROM payment_plans WHERE lot_id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                
                $stmt = $conn->prepare("DELETE FROM lots WHERE id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                break;
                
            case 'deceased':
                $stmt = $conn->prepare("DELETE FROM deceased_records WHERE id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                break;
                
            case 'payment':
                $stmt = $conn->prepare("DELETE FROM payment_records WHERE id = ?");
                $stmt->bind_param("i", $recordId);
                $stmt->execute();
                break;
        }
        
        // Delete backup entry
        $stmt = $conn->prepare("DELETE FROM deleted_records_backup WHERE id = ?");
        $stmt->bind_param("i", $backup['id']);
        $stmt->execute();
    }
    
    $conn->commit();
    
    echo json_encode([
        'success' => true,
        'message' => 'Expired backups cleaned up successfully',
        'deleted_count' => count($expiredBackups),
        'cutoff_date' => $cutoffDate
    ]);
    
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
?>

