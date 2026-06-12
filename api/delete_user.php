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
        echo json_encode(['success' => false, 'message' => 'Missing user ID']);
        exit;
    }
    
    $actorId = get_actor_user_id();

    // Get user info before deletion for activity log
    $get_user_sql = "SELECT username, email FROM users WHERE id = ?";
    $get_user_stmt = $pdo->prepare($get_user_sql);
    $get_user_stmt->execute([$id]);
    $user_info = $get_user_stmt->fetch(PDO::FETCH_ASSOC);
    $username = $user_info ? $user_info['username'] : 'Unknown';
    $email = $user_info ? ($user_info['email'] ?? '') : '';

    // Protect master admin account from deletion
    if (strtolower($username) === 'admin' || strtolower($email) === 'admin@cemetery.com') {
        echo json_encode(['success' => false, 'message' => 'Cannot delete the master admin account.']);
        exit;
    }
    
    // Get complete user data before deletion for backup
    $user_stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL");
    $user_stmt->execute([$id]);
    $user_data = $user_stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user_data) {
        echo json_encode(['success' => false, 'message' => 'User not found or already deleted']);
        exit;
    }
    
    // Get customer data
    $customer_stmt = $pdo->prepare("SELECT * FROM customers WHERE user_id = ? AND deleted_at IS NULL");
    $customer_stmt->execute([$id]);
    $customer_data = $customer_stmt->fetch(PDO::FETCH_ASSOC);
    
    // Get related lots
    $lots_stmt = $pdo->prepare("SELECT * FROM lots WHERE customer_id = ? AND deleted_at IS NULL");
    $lots_stmt->execute([$id]);
    $lots = [];
    while ($lot = $lots_stmt->fetch(PDO::FETCH_ASSOC)) {
        $lots[] = $lot;
    }
    
    // Get related deceased records
    $deceased_stmt = $pdo->prepare("SELECT * FROM deceased_records WHERE customer_id = ? AND deleted_at IS NULL");
    $deceased_stmt->execute([$id]);
    $deceased = [];
    while ($dec = $deceased_stmt->fetch(PDO::FETCH_ASSOC)) {
        $deceased[] = $dec;
    }
    
    // Get related payment records
    $payment_records = [];
    foreach ($lots as $lot) {
        $pr_stmt = $pdo->prepare("SELECT * FROM payment_records WHERE lot_id = ? AND deleted_at IS NULL");
        $pr_stmt->execute([$lot['id']]);
        while ($pr = $pr_stmt->fetch(PDO::FETCH_ASSOC)) {
            $payment_records[] = $pr;
        }
    }
    
    // Get payment plans
    $payment_plans = [];
    foreach ($lots as $lot) {
        $pp_stmt = $pdo->prepare("SELECT * FROM payment_plans WHERE lot_id = ? AND deleted_at IS NULL");
        $pp_stmt->execute([$lot['id']]);
        while ($pp = $pp_stmt->fetch(PDO::FETCH_ASSOC)) {
            $payment_plans[] = $pp;
        }
    }
    
    // Create backup
    if (isset($conn)) {
        $snapshot_data = json_encode([
            'user' => $user_data,
            'customer' => $customer_data
        ]);
        $related_data = json_encode([
            'lots' => $lots,
            'deceased' => $deceased,
            'payment_records' => $payment_records,
            'payment_plans' => $payment_plans
        ]);
        
        $backup_stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('user', ?, ?, ?, ?)");
        $backup_stmt->bind_param("issi", $id, $snapshot_data, $related_data, $actorId);
        $backup_stmt->execute();
    }
    
    // Use soft delete instead of hard delete
    $now = date('Y-m-d H:i:s');
    
    // Soft delete user
    $sql = "UPDATE users SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$now, $actorId, $id]);
    
    if ($stmt->rowCount() > 0) {
        // Soft delete associated customer record
        $customer_sql = "UPDATE customers SET deleted_at = ?, deleted_by = ? WHERE user_id = ? AND deleted_at IS NULL";
        $customer_stmt = $pdo->prepare($customer_sql);
        $customer_stmt->execute([$now, $actorId, $id]);
        
        // Soft delete related lots (just mark as deleted, they stay in system)
        foreach ($lots as $lot) {
            $lot_sql = "UPDATE lots SET deleted_at = ?, deleted_by = ?, status = 'available', customer_id = NULL WHERE id = ?";
            $lot_stmt = $pdo->prepare($lot_sql);
            $lot_stmt->execute([$now, $actorId, $lot['id']]);
        }
        
        // Soft delete related deceased records
        foreach ($deceased as $dec) {
            $dec_sql = "UPDATE deceased_records SET deleted_at = ?, deleted_by = ? WHERE id = ?";
            $dec_stmt = $pdo->prepare($dec_sql);
            $dec_stmt->execute([$now, $actorId, $dec['id']]);
        }
        
        // Soft delete related payment records
        foreach ($payment_records as $pr) {
            $pr_sql = "UPDATE payment_records SET deleted_at = ?, deleted_by = ? WHERE id = ?";
            $pr_stmt = $pdo->prepare($pr_sql);
            $pr_stmt->execute([$now, $actorId, $pr['id']]);
        }
        
        // Soft delete related payment plans
        foreach ($payment_plans as $pp) {
            $pp_sql = "UPDATE payment_plans SET deleted_at = ?, deleted_by = ? WHERE id = ?";
            $pp_stmt = $pdo->prepare($pp_sql);
            $pp_stmt->execute([$now, $actorId, $pp['id']]);
        }
        
        // Record activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Deleted',
            'User',
            "User '$username' and all related data soft deleted (can be restored from Backup & Recovery)",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
        
        echo json_encode(['success' => true, 'message' => 'User and all related data deleted successfully (can be restored from Backup & Recovery)']);
    } else {
        echo json_encode(['success' => false, 'message' => 'User not found or already deleted']);
    }
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?> 