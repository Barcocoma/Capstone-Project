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
    $actorId = get_actor_user_id();
    $data = json_decode(file_get_contents('php://input'), true);
    $user_id = (int)($data['user_id'] ?? 0);
    $new_password = (string)($data['new_password'] ?? '');
    $confirm_password = (string)($data['confirm_password'] ?? '');

    if ($user_id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid user ID']);
        exit;
    }

    if (empty($new_password)) {
        echo json_encode(['success' => false, 'message' => 'New password is required']);
        exit;
    }

    if ($new_password !== $confirm_password) {
        echo json_encode(['success' => false, 'message' => 'Passwords do not match']);
        exit;
    }

    // Password complexity check
    $isComplex = function($pwd) {
        if (strlen($pwd) < 8) return false;
        if (!preg_match('/[A-Z]/', $pwd)) return false;
        if (!preg_match('/[0-9]/', $pwd)) return false;
        if (!preg_match('/[^a-zA-Z0-9]/', $pwd)) return false;
        return true;
    };

    if (!$isComplex($new_password)) {
        echo json_encode(['success' => false, 'message' => 'Password must be at least 8 chars with uppercase, number, and special character']);
        exit;
    }

    // Get user information
    $user_sql = "SELECT id, username, password, using_default FROM users WHERE id = ? AND deleted_at IS NULL";
    $user_stmt = $pdo->prepare($user_sql);
    $user_stmt->execute([$user_id]);
    $user = $user_stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    // Check if user is changing their own password or has permission
    if ($actorId && $actorId !== $user_id) {
        $actor_stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
        $actor_stmt->execute([$actorId]);
        $actor_role = strtolower($actor_stmt->fetchColumn() ?: '');
        if ($actor_role !== 'admin' && $actor_role !== 'staff') {
            echo json_encode(['success' => false, 'message' => 'Not authorized']);
            exit;
        }
    }

    // Hash and update password
    $hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
    $update_sql = "UPDATE users SET password = ?, using_default = 0 WHERE id = ?";
    $update_stmt = $pdo->prepare($update_sql);
    $update_stmt->execute([$hashed_password, $user_id]);

    // Record activity
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'User',
        "Password changed for user '{$user['username']}'",
        $actorId ?: $user_id,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'Password changed successfully'
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}
?>


