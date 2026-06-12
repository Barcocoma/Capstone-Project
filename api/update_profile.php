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
    $id = intval($data['id'] ?? 0);
    $username = $data['username'] ?? '';
    $email = $data['email'] ?? '';
    $password = $data['password'] ?? '';
    $current_password = $data['current_password'] ?? '';
    $first_name = $data['first_name'] ?? '';
    $middle_name = $data['middle_name'] ?? '';
    $last_name = $data['last_name'] ?? '';
    $contact_number = $data['contact_number'] ?? '';
    $sex_at_birth = $data['sex_at_birth'] ?? '';
    // Customer optional details
    $street_address = $data['street_address'] ?? '';
    $city = $data['city'] ?? '';
    $province = $data['province'] ?? '';
    $postal_code = $data['postal_code'] ?? '';
    $country = $data['country'] ?? '';
    $emergency_contact_name = $data['emergency_contact_name'] ?? '';
    $emergency_contact_phone = $data['emergency_contact_phone'] ?? '';
    $emergency_contact_relationship = $data['emergency_contact_relationship'] ?? '';
    $occupation = $data['occupation'] ?? '';
    $employer = $data['employer'] ?? '';
    $monthly_income = $data['monthly_income'] ?? null;
    $source_of_funds = $data['source_of_funds'] ?? '';
    $notes = $data['notes'] ?? '';

    if (!$id || !$username || !$email) {
        echo json_encode(['success' => false, 'message' => 'Missing required fields']);
        exit;
    }
    if (!is_valid_email($email)) {
        echo json_encode(['success' => false, 'message' => 'Email must be a valid .com address (e.g. name@gmail.com)']);
        exit;
    }

    // Check email not used by other accounts
    $emailCheck = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
    $emailCheck->execute([$email, $id]);
    if ($emailCheck->fetchColumn()) {
        echo json_encode(['success' => false, 'message' => 'Email already exists']);
        exit;
    }

    // Load current user record for comparisons/verification
    $curStmt = $pdo->prepare('SELECT username, password FROM users WHERE id = ?');
    $curStmt->execute([$id]);
    $currentRow = $curStmt->fetch(PDO::FETCH_ASSOC);
    if (!$currentRow) {
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    $updateFields = ['username = ?', 'email = ?'];
    $params = [$username, $email];
    if (!empty($first_name)) { $updateFields[] = 'first_name = ?'; $params[] = $first_name; }
    if (!empty($middle_name)) { $updateFields[] = 'middle_name = ?'; $params[] = $middle_name; }
    if (!empty($last_name)) { $updateFields[] = 'last_name = ?'; $params[] = $last_name; }
    if (!empty($contact_number)) { $updateFields[] = 'contact_number = ?'; $params[] = $contact_number; }
    if (!empty($sex_at_birth)) { $updateFields[] = 'sex_at_birth = ?'; $params[] = $sex_at_birth; }
    // If username is being changed, require correct current password
    if ($username !== ($currentRow['username'] ?? '')) {
        if (empty($current_password) || !password_verify($current_password, $currentRow['password'])) {
            echo json_encode(['success' => false, 'message' => 'Current password is incorrect']);
            exit;
        }
    }

    if (!empty($password)) {
        // Password complexity: 8+, uppercase, number, special
        if (strlen($password) < 8 || !preg_match('/[A-Z]/',$password) || !preg_match('/[0-9]/',$password) || !preg_match('/[^a-zA-Z0-9]/',$password)) {
            echo json_encode(['success' => false, 'message' => 'Password must be at least 8 chars with uppercase, number, and special character']);
            exit;
        }
        // Validate current password
        if (empty($current_password) || !password_verify($current_password, $currentRow['password'])) {
            echo json_encode(['success' => false, 'message' => 'Current password is incorrect']);
            exit;
        }
        $updateFields[] = 'password = ?';
        $params[] = password_hash($password, PASSWORD_DEFAULT);
        // Mark as not using default anymore
        $updateFields[] = 'using_default = 0';
    }
    $params[] = $id;

    $sql = 'UPDATE users SET ' . implode(', ', $updateFields) . ' WHERE id = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // If this is a customer, upsert their customer details
    try {
        $roleStmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
        $roleStmt->execute([$id]);
        $role = strtolower($roleStmt->fetchColumn() ?: '');
        if ($role === 'customer') {
            // Check if row exists
            $existsStmt = $pdo->prepare('SELECT COUNT(*) FROM customers WHERE user_id = ?');
            $existsStmt->execute([$id]);
            $exists = (int)$existsStmt->fetchColumn() > 0;
            if ($exists) {
                $csql = 'UPDATE customers SET street_address = ?, city = ?, province = ?, postal_code = ?, country = COALESCE(NULLIF(?,\'\'), country), emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact_relationship = ?, occupation = ?, employer = ?, monthly_income = ?, source_of_funds = ?, notes = ? WHERE user_id = ?';
                $cstmt = $pdo->prepare($csql);
                $cstmt->execute([$street_address, $city, $province, $postal_code, $country, $emergency_contact_name, $emergency_contact_phone, $emergency_contact_relationship, $occupation, $employer, $monthly_income, $source_of_funds, $notes, $id]);
            } else {
                $csql = 'INSERT INTO customers (user_id, street_address, city, province, postal_code, country, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, occupation, employer, monthly_income, source_of_funds, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $cstmt = $pdo->prepare($csql);
                $cstmt->execute([$id, $street_address, $city, $province, $postal_code, $country ?: 'Philippines', $emergency_contact_name, $emergency_contact_phone, $emergency_contact_relationship, $occupation, $employer, $monthly_income, $source_of_funds, $notes]);
            }
        }
    } catch (Throwable $e) {}

    // Record activity
    $actorId = get_actor_user_id();
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'User',
        "Profile updated for user '$username'",
        $actorId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);

    echo json_encode(['success' => true, 'message' => 'Profile updated successfully']);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?> 