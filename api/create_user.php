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
    
    // Normalize inputs
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');
    $user_type = strtolower(trim((string)($data['user_type'] ?? 'customer')));
    $email = trim((string)($data['email'] ?? ''));
    $first_name = sanitize_name(trim((string)($data['first_name'] ?? '')));
    $middle_name = sanitize_name(trim((string)($data['middle_name'] ?? '')));
    $last_name = sanitize_name(trim((string)($data['last_name'] ?? '')));
    $contact_number = trim((string)($data['contact_number'] ?? ''));
    $sex_at_birth = strtolower(trim((string)($data['sex_at_birth'] ?? '')));
    // Optional customer details (if role is customer)
    $street_address = trim((string)($data['street_address'] ?? ''));
    $city = trim((string)($data['city'] ?? ''));
    $province = trim((string)($data['province'] ?? ''));
    $postal_code = trim((string)($data['postal_code'] ?? ''));
    $country = trim((string)($data['country'] ?? 'Philippines'));
    $emergency_contact_name = sanitize_name(trim((string)($data['emergency_contact_name'] ?? '')));
    $emergency_contact_phone = trim((string)($data['emergency_contact_phone'] ?? ''));
    $emergency_contact_relationship = trim((string)($data['emergency_contact_relationship'] ?? ''));
    $occupation = trim((string)($data['occupation'] ?? ''));
    $employer = trim((string)($data['employer'] ?? ''));
    $monthly_income = ($data['monthly_income'] ?? null);
    $source_of_funds = trim((string)($data['source_of_funds'] ?? ''));
    $notes = trim((string)($data['notes'] ?? ''));
    
    // Function to generate username from last name + 5 random digits (e.g. BARIRING00301)
    $generateUsername = function($lastName) use ($pdo) {
        $base = strtoupper(preg_replace('/[^A-Z]/i', '', (string)$lastName));
        if ($base === '') {
            $base = 'USER';
        }

        $makeDigits = function() {
            return str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
        };

        $attempts = 0;
        do {
            $candidate = $base . $makeDigits();
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
            $stmt->execute([$candidate]);
            $exists = (bool)$stmt->fetch(PDO::FETCH_ASSOC);
            $attempts++;
        } while ($exists && $attempts < 10);

        return $candidate;
    };
    
    // Auto-generate username if empty (for customer accounts, always auto-generate)
    if ($username === '' || $user_type === 'customer') {
        $username = $generateUsername($last_name);
    }
    
    // Basic validation
    if ($user_type === '') {
        echo json_encode(['success' => false, 'message' => 'Role is required']);
        exit;
    }
    // Validate email format only if email is provided
    if ($email !== '' && !is_valid_email($email)) {
        echo json_encode(['success' => false, 'message' => 'Email must be a valid .com address (e.g. name@gmail.com)']);
        exit;
    }

    // Normalize role to DB values (use 'staff')
    if ($user_type === 'cemetery_staff') { $user_type = 'staff'; }
    
    // Permission check: only admin can create any role; staff can only create customers
    if ($actorId) {
        $actor_stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
        $actor_stmt->execute([$actorId]);
        $actor = $actor_stmt->fetch(PDO::FETCH_ASSOC);
        $actor_role = strtolower($actor['account_type'] ?? '');
        if ($actor_role === 'staff') {
            if ($user_type !== 'customer') {
                echo json_encode(['success' => false, 'message' => 'Staff can create customer accounts only']);
                exit;
            }
        } elseif ($actor_role !== 'admin') {
            echo json_encode(['success' => false, 'message' => 'Only admin or staff can create accounts']);
            exit;
        }
    }

    // Password complexity check and default generation if missing
    $generateDefault = false;
    if ($password === '') {
        $generateDefault = true;
        // Generate strong default password (10 chars, includes upper, lower, digit, special)
        $generateStrong = function() {
            $uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
            $lowers = 'abcdefghijkmnopqrstuvwxyz';
            $digits = '23456789';
            $specials = '!@#$%^&*()-_';
            $pool = $uppers . $lowers . $digits . $specials;
            $pick = function($alphabet) { return $alphabet[random_int(0, strlen($alphabet) - 1)]; };
            $chars = [];
            $chars[] = $pick($uppers);
            $chars[] = $pick($lowers);
            $chars[] = $pick($digits);
            $chars[] = $pick($specials);
            for ($i = 0; $i < 6; $i++) { $chars[] = $pick($pool); }
            // Shuffle securely
            for ($i = count($chars) - 1; $i > 0; $i--) {
                $j = random_int(0, $i);
                $tmp = $chars[$i];
                $chars[$i] = $chars[$j];
                $chars[$j] = $tmp;
            }
            return implode('', $chars);
        };
        $password = $generateStrong();
    }

    $isComplex = function($pwd) {
        if (strlen($pwd) < 8) return false;
        if (!preg_match('/[A-Z]/', $pwd)) return false;
        if (!preg_match('/[0-9]/', $pwd)) return false;
        if (!preg_match('/[^a-zA-Z0-9]/', $pwd)) return false;
        return true;
    };
    if (!$isComplex($password)) {
        echo json_encode(['success' => false, 'message' => 'Password must be at least 8 chars with uppercase, number, and special character']);
        exit;
    }
    
    // Hash password
    $hashed_password = password_hash($password, PASSWORD_DEFAULT);
    
    // Check if username already exists (exclude soft-deleted accounts)
    $check_username = $pdo->prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL");
    $check_username->execute([$username]);
    if ($check_username->rowCount() > 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Username already exists'
        ]);
        exit;
    }
    
    // Check if email already exists (exclude soft-deleted accounts) - only if email is provided
    if ($email !== '') {
        $check_email = $pdo->prepare("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL");
        $check_email->execute([$email]);
        if ($check_email->rowCount() > 0) {
            echo json_encode([
                'success' => false,
                'message' => 'Email already exists'
            ]);
            exit;
        }
    }
    
    // Backwards compatible insert if optional columns missing
    $hasDefault = true; $hasUsingDefault = true;
    try { $pdo->query("SELECT default_password FROM users LIMIT 0"); } catch (PDOException $e) { $hasDefault = false; }
    try { $pdo->query("SELECT using_default FROM users LIMIT 0"); } catch (PDOException $e) { $hasUsingDefault = false; }

    // Convert empty email to NULL for database
    $email_value = ($email === '') ? null : $email;
    
    if ($hasDefault && $hasUsingDefault) {
        $sql = "INSERT INTO users (username, password, email, account_type, default_password, using_default, first_name, middle_name, last_name, contact_number, sex_at_birth) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$username, $hashed_password, $email_value, $user_type, $password, $first_name, $middle_name, $last_name, $contact_number, $sex_at_birth]);
    } elseif ($hasDefault) {
        $sql = "INSERT INTO users (username, password, email, account_type, default_password, first_name, middle_name, last_name, contact_number, sex_at_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$username, $hashed_password, $email_value, $user_type, $password, $first_name, $middle_name, $last_name, $contact_number, $sex_at_birth]);
    } else {
        $sql = "INSERT INTO users (username, password, email, account_type, first_name, middle_name, last_name, contact_number, sex_at_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$username, $hashed_password, $email_value, $user_type, $first_name, $middle_name, $last_name, $contact_number, $sex_at_birth]);
    }
    
     // Customer details insertion if role is customer
     $user_id = (int)$pdo->lastInsertId();
     if ($user_type === 'customer') {
        try {
            $custSql = "INSERT INTO customers (user_id, street_address, city, province, postal_code, country, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, occupation, employer, monthly_income, source_of_funds, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $custStmt = $pdo->prepare($custSql);
            $custStmt->execute([
                $user_id,
                $street_address,
                $city,
                $province,
                $postal_code,
                $country !== '' ? $country : 'Philippines',
                $emergency_contact_name,
                $emergency_contact_phone,
                $emergency_contact_relationship,
                $occupation,
                $employer,
                $monthly_income !== '' ? $monthly_income : null,
                $source_of_funds,
                $notes
            ]);
        } catch (Throwable $e) {
            // do not fail user creation if customer insert fails
        }
     }

     // Record activity
     
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Created',
        'User',
        "New user '$username' added with role '$user_type'",
         $actorId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
    
    $response = [
        'success' => true,
        'message' => 'User created successfully',
        'username' => $username
    ];
    if ($generateDefault) {
        $response['default_password'] = $password;
    }
    echo json_encode($response);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?> 