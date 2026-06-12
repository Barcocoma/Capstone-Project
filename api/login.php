<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, X-User-Id");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");

// Security headers to prevent caching of sensitive data
header("Cache-Control: no-cache, no-store, must-revalidate, private");
header("Pragma: no-cache");
header("Expires: 0");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';

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
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? '');
        $skipEmail = !empty($data['skip_email']);

        // Check database only (demo login removed) - exclude deleted accounts
        $sql = "SELECT id, username, email, password, account_type, using_default, default_password FROM users WHERE username = ? AND deleted_at IS NULL";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        $loginOk = false;
        if ($user) {
            if (password_verify($password, $user['password'])) {
                $loginOk = true;
            } else if (!empty($user['using_default']) && (int)$user['using_default'] === 1 && isset($user['default_password']) && $user['default_password'] !== '' && hash_equals($user['default_password'], $password)) {
                // Accept default password for convenience if hash is out-of-sync; re-hash it now
                $loginOk = true;
                try {
                    $newHash = password_hash($password, PASSWORD_DEFAULT);
                    $upd = $pdo->prepare('UPDATE users SET password = ? WHERE id = ?');
                    $upd->execute([$newHash, $user['id']]);
                } catch (Throwable $e) {
                    // ignore; login still proceeds
                }
            }
        }

        if ($loginOk) {
            // For customers, check if email is missing (but allow skip)
            if ($user['account_type'] === 'customer' && empty($user['email']) && !$skipEmail) {
                // Customer account has no email - prompt for email but allow skip
                unset($user['password']);
                echo json_encode([
                    'success' => true,
                    'requires_email' => true,
                    'message' => 'Email address is recommended for customer accounts. You can add it now or skip for later.',
                    'user' => [
                        'id' => (int)$user['id'],
                        'username' => $user['username'],
                        'account_type' => $user['account_type'],
                        'using_default' => (int)($user['using_default'] ?? 0)
                    ]
                ]);
                exit;
            }
            
            // 2FA has been disabled – complete login for all valid users here
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
                "User '$username' logged in",
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
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Invalid credentials'
            ]);
        }
    } catch (PDOException $e) {
        echo json_encode([
            'success' => false,
            'message' => 'Database error: ' . $e->getMessage()
        ]);
    }
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request method'
    ]);
}
?>