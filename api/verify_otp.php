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

// Secure session settings
ini_set('session.use_strict_mode', 1);
ini_set('session.cookie_httponly', 1);
if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') {
    ini_set('session.cookie_secure', 1);
}
session_name('cms_session');
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $data = json_decode(file_get_contents('php://input'), true);
        $user_id = (int)($data['user_id'] ?? 0);
        $otp_code = trim((string)($data['otp_code'] ?? ''));
        $device_fingerprint = trim((string)($data['device_fingerprint'] ?? ''));

        if ($user_id <= 0 || empty($otp_code)) {
            echo json_encode(['success' => false, 'message' => 'User ID and OTP code are required']);
            exit;
        }

        // Verify OTP
        $sql = "SELECT id, user_id, otp_code, expires_at, used 
                FROM otp_codes 
                WHERE user_id = ? AND otp_code = ? AND used = 0 
                ORDER BY created_at DESC 
                LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$user_id, $otp_code]);
        $otp_record = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$otp_record) {
            echo json_encode(['success' => false, 'message' => 'Invalid verification code']);
            exit;
        }

        // Check if OTP is expired
        $expires_at = strtotime($otp_record['expires_at']);
        $now = time();
        if ($now > $expires_at) {
            echo json_encode(['success' => false, 'message' => 'Verification code has expired. Please request a new one.']);
            exit;
        }

        // Mark OTP as used
        $update_sql = "UPDATE otp_codes SET used = 1 WHERE id = ?";
        $update_stmt = $pdo->prepare($update_sql);
        $update_stmt->execute([$otp_record['id']]);

        // Get user information
        $user_sql = "SELECT id, username, email, account_type, using_default, default_password FROM users WHERE id = ? AND deleted_at IS NULL";
        $user_stmt = $pdo->prepare($user_sql);
        $user_stmt->execute([$user_id]);
        $user = $user_stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'User not found']);
            exit;
        }

        // Add device to trusted devices if fingerprint provided
        if (!empty($device_fingerprint)) {
            $device_info = json_encode([
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
                'ip_address' => $_SERVER['REMOTE_ADDR'] ?? ''
            ]);

            $trusted_sql = "INSERT INTO trusted_devices (user_id, device_fingerprint, device_info) 
                          VALUES (?, ?, ?) 
                          ON DUPLICATE KEY UPDATE last_used_at = CURRENT_TIMESTAMP";
            $trusted_stmt = $pdo->prepare($trusted_sql);
            $trusted_stmt->execute([$user_id, $device_fingerprint, $device_info]);
        }

        // Regenerate session id to prevent fixation
        session_regenerate_id(true);

        // Store minimal user info in session
        $_SESSION['user'] = [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'account_type' => $user['account_type'],
        ];

        // Record login activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Logged In',
            'User',
            "User '{$user['username']}' logged in with 2FA",
            $user['id'],
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        unset($user['password']);
        $usingDefault = (int)($user['using_default'] ?? 0);
        echo json_encode([
            'success' => true,
            'message' => 'Login successful',
            'requires_password_change' => ($usingDefault === 1),
            'user' => [
                'id' => (int)$user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'account_type' => $user['account_type'],
                'using_default' => $usingDefault
            ]
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Server error: ' . $e->getMessage()
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request method'
    ]);
}
?>

