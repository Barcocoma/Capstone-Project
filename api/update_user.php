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
     $actorId = get_actor_user_id();
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Accept any data without strict validation as requested
    $id = $data['id'] ?? 0;
    $username = $data['username'] ?? '';
    $user_type = $data['user_type'] ?? '';
    $email = $data['email'] ?? '';
    $password = $data['password'] ?? '';
    $first_name = sanitize_name($data['first_name'] ?? '');
    $middle_name = sanitize_name($data['middle_name'] ?? '');
    $last_name = sanitize_name($data['last_name'] ?? '');
    $contact_number = $data['contact_number'] ?? '';
    $sex_at_birth = $data['sex_at_birth'] ?? '';
    
    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Missing user ID']);
        exit;
    }
    
    // Check if username already exists for other users
    $check_username = $pdo->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
    $check_username->execute([$username, $id]);
    if ($check_username->rowCount() > 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Username already exists'
        ]);
        exit;
    }
    
    // Check if email already exists for other users - only if email is provided
    if ($email !== '') {
        $check_email = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL");
        $check_email->execute([$email, $id]);
        if ($check_email->rowCount() > 0) {
            echo json_encode([
                'success' => false,
                'message' => 'Email already exists'
            ]);
            exit;
        }
    }
    
    // Build update query based on provided fields
    $update_fields = [];
    $params = [];
    
    if (!empty($username)) {
        $update_fields[] = "username = ?";
        $params[] = $username;
    }
    
    // Handle email update - allow setting to NULL if empty, or validate if provided
    if (isset($data['email'])) {
        if ($email === '') {
            // Allow clearing email (set to NULL)
            $update_fields[] = "email = ?";
            $params[] = null;
        } else {
            // Validate email format only if provided
            if (!is_valid_email($email)) {
                echo json_encode(['success' => false, 'message' => 'Email must be a valid .com address (e.g. name@gmail.com)']);
                exit;
            }
            $update_fields[] = "email = ?";
            $params[] = $email;
        }
    }
    
    if (!empty($user_type)) {
        // Prevent changing a customer with owned lots to non-customer role
        $currentRoleStmt = $pdo->prepare("SELECT account_type FROM users WHERE id = ?");
        $currentRoleStmt->execute([$id]);
        $currentRole = strtolower($currentRoleStmt->fetchColumn() ?: '');
        if ($currentRole === 'customer' && strtolower($user_type) !== 'customer') {
            // Check if this user owns any lots
            $lotCheck = $pdo->prepare("SELECT COUNT(*) FROM lots WHERE customer_id = ?");
            $lotCheck->execute([$id]);
            $ownedCount = (int)$lotCheck->fetchColumn();
            if ($ownedCount > 0) {
                echo json_encode(['success' => false, 'message' => "Cannot change role: user owns ${ownedCount} lot(s). Transfer or release lots first."]);
                exit;
            }
        }
        $update_fields[] = "account_type = ?"; $params[] = $user_type;
    }
    if (!empty($first_name)) { $update_fields[] = "first_name = ?"; $params[] = $first_name; }
    if (!empty($middle_name)) { $update_fields[] = "middle_name = ?"; $params[] = $middle_name; }
    if (!empty($last_name)) { $update_fields[] = "last_name = ?"; $params[] = $last_name; }
    if (!empty($contact_number)) { $update_fields[] = "contact_number = ?"; $params[] = $contact_number; }
    if (!empty($sex_at_birth)) { $update_fields[] = "sex_at_birth = ?"; $params[] = $sex_at_birth; }
    
    if (!empty($password)) {
        $update_fields[] = "password = ?";
        $params[] = password_hash($password, PASSWORD_DEFAULT);
    }
    
    // status removed
    
    if (empty($update_fields)) {
        echo json_encode(['success' => false, 'message' => 'No fields to update']);
        exit;
    }
    
    $params[] = $id;
    $sql = "UPDATE users SET " . implode(', ', $update_fields) . " WHERE id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    
     // Record activity
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'User',
        "User '$username' information updated",
         $actorId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
    
    echo json_encode(['success' => true, 'message' => 'User updated successfully']);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?> 