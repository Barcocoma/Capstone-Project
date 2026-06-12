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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $data = json_decode(file_get_contents('php://input'), true);
        $user_id = (int)($data['user_id'] ?? 0);
        $device_fingerprint = trim((string)($data['device_fingerprint'] ?? ''));

        if ($user_id <= 0) {
            echo json_encode(['success' => false, 'message' => 'Invalid user ID']);
            exit;
        }

        // Get user information
        $sql = "SELECT id, email, first_name, last_name, account_type FROM users WHERE id = ? AND deleted_at IS NULL";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$user_id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'User not found']);
            exit;
        }

        // Only require 2FA for customers
        if ($user['account_type'] !== 'customer') {
            echo json_encode(['success' => false, 'message' => '2FA is only required for customer accounts']);
            exit;
        }

        // Check if user has email
        if (empty($user['email'])) {
            echo json_encode(['success' => false, 'message' => 'Email is required for 2FA. Please add an email address to your account or contact support.']);
            exit;
        }
        
        $email_to_use = $user['email'];

        // Check if device is already trusted
        $isFirstLogin = false;
        $isNewDevice = true;
        
        if (!empty($device_fingerprint)) {
            $trusted_sql = "SELECT id FROM trusted_devices WHERE user_id = ? AND device_fingerprint = ?";
            $trusted_stmt = $pdo->prepare($trusted_sql);
            $trusted_stmt->execute([$user_id, $device_fingerprint]);
            $isNewDevice = $trusted_stmt->rowCount() === 0;
        }

        // Check if this is first login (no trusted devices at all)
        $first_check_sql = "SELECT id FROM trusted_devices WHERE user_id = ? LIMIT 1";
        $first_check_stmt = $pdo->prepare($first_check_sql);
        $first_check_stmt->execute([$user_id]);
        $isFirstLogin = $first_check_stmt->rowCount() === 0;

        // Generate 6-digit OTP
        $otp_code = str_pad((string)rand(0, 999999), 6, '0', STR_PAD_LEFT);
        
        // Set expiration (10 minutes from now)
        $expires_at = date('Y-m-d H:i:s', strtotime('+10 minutes'));

        // Invalidate any existing unused OTPs for this user
        $invalidate_sql = "UPDATE otp_codes SET used = 1 WHERE user_id = ? AND used = 0";
        $invalidate_stmt = $pdo->prepare($invalidate_sql);
        $invalidate_stmt->execute([$user_id]);

        // Store new OTP
        $insert_sql = "INSERT INTO otp_codes (user_id, otp_code, device_fingerprint, expires_at) VALUES (?, ?, ?, ?)";
        $insert_stmt = $pdo->prepare($insert_sql);
        $insert_stmt->execute([$user_id, $otp_code, $device_fingerprint, $expires_at]);

        // Send OTP via email
        $customerName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
        if (empty($customerName)) {
            $customerName = 'Customer';
        }

        $subject = $isFirstLogin 
            ? "Welcome! Your Verification Code for First Login" 
            : "Security Verification Code - New Device Login";
        
        $message = $isFirstLogin
            ? "<p>Welcome to Divine Life Memorial Park!</p><p>This is your first login. Please use the verification code below to complete your login:</p>"
            : "<p>We detected a login attempt from a new device. For your security, please use the verification code below to complete your login:</p>";

        $html = "<div style='background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif'>".
                  "<div style='max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden'>".
                    "<div style='background:#0f172a;padding:20px 24px;display:flex;align-items:center;gap:12px'>".
                      "<div style='color:#fff;font-size:18px;font-weight:700;letter-spacing:.3px'>Divine Life Memorial Park</div>".
                    "</div>".
                    "<div style='padding:24px'>".
                      "<div style='font-size:16px;color:#111827;margin-bottom:16px'><strong>Security Verification</strong></div>".
                      "<p style='color:#4b5563;font-size:14px;margin-bottom:16px'>Hello $customerName,</p>".
                      $message.
                      "<div style='background:#f1f5f9;border:2px solid #0f172a;border-radius:8px;padding:20px;text-align:center;margin:24px 0'>".
                        "<div style='font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;font-family:monospace'>$otp_code</div>".
                      "</div>".
                      "<p style='color:#6b7280;font-size:12px;margin-top:16px'>This code will expire in 10 minutes. If you didn't request this code, please ignore this email.</p>".
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
                error_log('OTP email send error: ' . $e->getMessage());
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
            echo json_encode([
                'success' => true,
                'message' => '6 digit verification code sent to your email',
                'is_first_login' => $isFirstLogin,
                'is_new_device' => $isNewDevice
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Failed to send verification code. Please try again.'
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
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request method'
    ]);
}
?>

