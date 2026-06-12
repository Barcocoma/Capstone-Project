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

// Try to load Composer autoloader for PHPMailer if present
$mailerAvailable = false;
try {
    $vendor = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($vendor)) {
        require_once $vendor;
        if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
            $mailerAvailable = true;
        }
    }
} catch (Throwable $e) { /* ignore */ }

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $email = trim((string)($data['email'] ?? ''));
    $username = trim((string)($data['username'] ?? ''));

    $user = null;
    $email_to_use = '';
    $user_id = null;
    $customerName = '';

    // If email is provided, find user by email
    if (!empty($email)) {
        // Validate email format
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            echo json_encode(['success' => false, 'message' => 'Please provide a valid email address']);
            exit;
        }

        $user_sql = "SELECT id, username, email, first_name, last_name FROM users WHERE email = ? AND deleted_at IS NULL";
        $user_stmt = $pdo->prepare($user_sql);
        $user_stmt->execute([$email]);
        $user = $user_stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'Email address not found']);
            exit;
        }

        if (empty($user['email'])) {
            echo json_encode(['success' => false, 'message' => 'No email address found for this account. Please contact support.']);
            exit;
        }

        $email_to_use = $user['email'];
        $user_id = $user['id'];
        $username = $user['username'];
        $customerName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
        if (empty($customerName)) {
            $customerName = $user['username'];
        }
    } 
    // If username is provided, find user by username
    elseif (!empty($username)) {
        $user_sql = "SELECT id, username, email, first_name, last_name FROM users WHERE username = ? AND deleted_at IS NULL";
        $user_stmt = $pdo->prepare($user_sql);
        $user_stmt->execute([$username]);
        $user = $user_stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'Username not found']);
            exit;
        }

        if (empty($user['email'])) {
            echo json_encode(['success' => false, 'message' => 'No email address found for this username. Please contact support.']);
            exit;
        }

        $email_to_use = $user['email'];
        $user_id = $user['id'];
        $username = $user['username'];
        $customerName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
        if (empty($customerName)) {
            $customerName = $user['username'];
        }
    } 
    // If neither provided
    else {
        echo json_encode(['success' => false, 'message' => 'Please provide either your email address or username']);
        exit;
    }

    // Generate new password
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
    for ($i = count($chars) - 1; $i > 0; $i--) { 
        $j = random_int(0, $i); 
        $t = $chars[$i]; 
        $chars[$i] = $chars[$j]; 
        $chars[$j] = $t; 
    }
    $newPassword = implode('', $chars);

    // Hash and save new password
    $hashed = password_hash($newPassword, PASSWORD_DEFAULT);
    $update_stmt = $pdo->prepare('UPDATE users SET password = ?, default_password = ?, using_default = 1 WHERE id = ?');
    $update_stmt->execute([$hashed, $newPassword, $user_id]);

    // Send password reset email
    $subject = "Password Reset - Divine Life Memorial Park";
    
    $message = "<p>Hello $customerName,</p>";
    $message .= "<p>Your password has been reset. Please use the following temporary password to log in:</p>";
    $message .= "<p><strong>You will be required to change this password after logging in.</strong></p>";

    $html = "<div style='background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif'>".
              "<div style='max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden'>".
                "<div style='background:#0f172a;padding:20px 24px;display:flex;align-items:center;gap:12px'>".
                  "<div style='color:#fff;font-size:18px;font-weight:700;letter-spacing:.3px'>Divine Life Memorial Park</div>".
                "</div>".
                "<div style='padding:24px'>".
                  "<div style='font-size:16px;color:#111827;margin-bottom:16px'><strong>Password Reset</strong></div>".
                  "<p style='color:#4b5563;font-size:14px;margin-bottom:16px'>Hello $customerName,</p>".
                  $message.
                  "<div style='background:#f1f5f9;border:2px solid #0f172a;border-radius:8px;padding:20px;text-align:center;margin:24px 0'>".
                    "<div style='font-size:24px;font-weight:700;letter-spacing:4px;color:#0f172a;font-family:monospace'>$newPassword</div>".
                  "</div>".
                  "<p style='color:#6b7280;font-size:12px;margin-top:16px'><strong>Security Note:</strong> For your security, please change this password immediately after logging in.</p>".
                  "<p style='color:#6b7280;font-size:12px;margin-top:8px'>If you did not request this password reset, please contact support immediately.</p>".
                "</div>".
                "<div style='background:#f8fafc;padding:10px 16px;text-align:center;color:#6b7280;font-size:12px'>© ".date('Y')." Divine Life Memorial Park</div>".
              "</div>".
            "</div>";

    $to = $email_to_use;
    $ok = false;

    // Prefer SMTP via PHPMailer if enabled and available
    if (defined('SMTP_ENABLED') && SMTP_ENABLED && $mailerAvailable) {
        try {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = SMTP_HOST;
            $mail->SMTPAuth = true;
            $mail->Username = SMTP_USERNAME;
            $mail->Password = SMTP_PASSWORD;
            $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = SMTP_PORT;
            $mail->CharSet = 'UTF-8';

            $mail->setFrom(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
            $mail->addAddress($to, $customerName);
            $mail->Subject = $subject;
            $mail->isHTML(true);
            $mail->Body = $html;

            $ok = $mail->send();
        } catch (Throwable $e) {
            error_log('Password reset email send error: ' . $e->getMessage());
            $ok = false;
        }
    }

    // Fallback to PHP mail() if SMTP not configured/available
    if (!$ok) {
        $headers = "MIME-Version: 1.0\r\n".
                   "Content-type: text/html; charset=UTF-8\r\n".
                   "From: ".(defined('SMTP_FROM_NAME')?SMTP_FROM_NAME:'Divine Life Memorial Park')." <".(defined('SMTP_FROM_EMAIL')?SMTP_FROM_EMAIL:'no-reply@divinelifememorial.com').">\r\n";
        $ok = @mail($to, $subject, $html, $headers);
    }

    if ($ok) {
        // Record activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $lookupMethod = !empty($data['email']) ? 'email' : 'username';
        $lookupValue = !empty($data['email']) ? $email_to_use : $username;
        $activity_stmt->execute([
            'Password Reset',
            'User',
            "Password reset requested via $lookupMethod: '$lookupValue' (username: '$username', email: '$email_to_use')",
            $user_id,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Password reset email sent to your email address'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to send password reset email. Please try again or contact support.'
        ]);
    }

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
?>

