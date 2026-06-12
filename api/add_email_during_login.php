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
    $user_id = (int)($data['user_id'] ?? 0);
    $email = trim((string)($data['email'] ?? ''));

    if ($user_id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid user ID']);
        exit;
    }

    // Allow skip option - if email is empty, just return success without updating
    if (empty($email)) {
        echo json_encode([
            'success' => true,
            'skipped' => true,
            'message' => 'Email skipped. You can add it later from your profile.'
        ]);
        exit;
    }

    // Validate email format
    if (!is_valid_email($email)) {
        echo json_encode(['success' => false, 'message' => 'Email must be a valid .com address (e.g. name@gmail.com)']);
        exit;
    }

    // Check if user exists and is a customer
    $user_sql = "SELECT id, account_type, email FROM users WHERE id = ? AND deleted_at IS NULL";
    $user_stmt = $pdo->prepare($user_sql);
    $user_stmt->execute([$user_id]);
    $user = $user_stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    if ($user['account_type'] !== 'customer') {
        echo json_encode(['success' => false, 'message' => 'This endpoint is only for customer accounts']);
        exit;
    }

    // Allow updating email if user already has one (for change email functionality)
    // No need to check if email exists - allow update

    // Check if email is already used by another account
    $check_email = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL");
    $check_email->execute([$email, $user_id]);
    if ($check_email->rowCount() > 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Email already exists'
        ]);
        exit;
    }

    // Save email immediately
    $update_sql = "UPDATE users SET email = ? WHERE id = ?";
    $update_stmt = $pdo->prepare($update_sql);
    $update_stmt->execute([$email, $user_id]);

    // Record activity
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'User',
        "Email address added during login for user ID $user_id",
        $user_id,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'Email saved successfully'
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

