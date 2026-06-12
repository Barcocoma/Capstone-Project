<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$timezone = new DateTimeZone('Asia/Manila');
date_default_timezone_set('Asia/Manila');

function resolve_target_date(DateTimeZone $tz): string {
    $override = $_GET['target_date'] ?? $_POST['target_date'] ?? null;
    if ($override && preg_match('/^\d{4}-\d{2}-\d{2}$/', $override)) {
        return $override;
    }
    $now = new DateTime('now', $tz);
    return $now->setTime(0, 0)->modify('+1 day')->format('Y-m-d');
}

$targetDate = resolve_target_date($timezone);

$vendor = __DIR__ . '/../vendor/autoload.php';
$mailerAvailable = false;
if (file_exists($vendor)) {
    require_once $vendor;
    $mailerAvailable = class_exists('PHPMailer\\PHPMailer\\PHPMailer');
}

function send_due_email(array $row, bool $useMailer, array &$errors = []): bool {
    $to = trim($row['email'] ?? '');
    if ($to === '') {
        $errors[] = "Schedule {$row['schedule_id']}: missing email address";
        return false;
    }

    $fromName = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Divine Life Memorial Park';
    $fromEmail = defined('SMTP_FROM_EMAIL') ? SMTP_FROM_EMAIL : '';
    $smtpUsername = defined('SMTP_USERNAME') ? SMTP_USERNAME : '';

    if ($fromEmail === '' && filter_var($smtpUsername, FILTER_VALIDATE_EMAIL)) {
        $fromEmail = $smtpUsername;
    }

    // Gmail (and most SMTP providers) require the From address to match the authenticated account
    if (
        filter_var($smtpUsername, FILTER_VALIDATE_EMAIL) &&
        filter_var($fromEmail, FILTER_VALIDATE_EMAIL) &&
        strtolower($smtpUsername) !== strtolower($fromEmail)
    ) {
        // Use SMTP username for From, keep configured address as reply-to
        $replyToEmail = $fromEmail;
        $replyToName = $fromName;
        $fromEmail = $smtpUsername;
    } else {
        $replyToEmail = null;
        $replyToName = null;
    }

    // Ensure we always have a valid From email
    if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        $fromEmail = $smtpUsername ?: 'no-reply@divinelifememorial.com';
    }

    $customerName = trim($row['first_name'] . ' ' . $row['last_name']);
    $dueString = date('F j, Y', strtotime($row['due_date']));
    $amount = number_format((float)$row['amount_due'], 2);
    $lotLabel = trim($row['garden_name'] . ' / Sector ' . $row['sector_name'] . ' / Block ' . $row['block_number'] . ' / Lot ' . $row['lot_number']);
    $subject = "Reminder: Payment due on {$dueString}";

    $body = "<div style='font-family:Arial,sans-serif;color:#111827;padding:18px;background:#f9fafb'>"
        . "<div style='max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px'>"
        . "<h2 style='margin:0 0 12px;font-size:18px;color:#111827'>Friendly payment reminder</h2>"
        . "<p style='margin:0 0 16px;color:#374151'>Hi {$customerName}, this is a reminder that you have an upcoming payment due tomorrow.</p>"
        . "<table style='width:100%;border-collapse:collapse;font-size:14px'>"
        . "<tr><td style='padding:8px;color:#6b7280'>Due Date</td><td style='padding:8px;text-align:right;font-weight:600;color:#111827'>{$dueString}</td></tr>"
        . "<tr><td style='padding:8px;color:#6b7280'>Amount</td><td style='padding:8px;text-align:right;font-weight:600;color:#16a34a'>₱{$amount}</td></tr>"
        . "<tr><td style='padding:8px;color:#6b7280'>Lot</td><td style='padding:8px;text-align:right;color:#111827'>{$lotLabel}</td></tr>"
        . "</table>"
        . "<p style='margin:16px 0 0;color:#4b5563'>You can settle the payment online or visit the office. Thank you for keeping your account up to date.</p>"
        . "<p style='margin:24px 0 0;color:#9ca3af;font-size:12px'>This is an automated message from Divine Life Memorial Park.</p>"
        . "</div></div>";

    if (defined('SMTP_ENABLED') && SMTP_ENABLED && $useMailer) {
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
            $mail->setFrom($fromEmail, $fromName);
            if ($replyToEmail) {
                $mail->addReplyTo($replyToEmail, $replyToName ?: $fromName);
            }
            $mail->addAddress($to, $customerName);
            $mail->Subject = $subject;
            $mail->isHTML(true);
            $mail->Body = $body;
            return $mail->send();
        } catch (Throwable $e) {
            $errors[] = "Schedule {$row['schedule_id']}: " . $e->getMessage();
            // fall through to PHP mail()
        }
    }

    $headers = "MIME-Version: 1.0\r\n"
        . "Content-type: text/html; charset=UTF-8\r\n"
        . "From: {$fromName} <{$fromEmail}>\r\n";
    return @mail($to, $subject, $body, $headers);
}

try {
    global $pdo;
    $sql = "
        SELECT 
            pps.id AS schedule_id,
            pps.due_date,
            pps.amount_due,
            u.email,
            COALESCE(u.first_name, '') AS first_name,
            COALESCE(u.last_name, '') AS last_name,
            l.lot_number,
            b.block_number,
            s.name AS sector_name,
            g.name AS garden_name
        FROM payment_plan_schedule pps
        INNER JOIN payment_plans pp ON pps.payment_plan_id = pp.id
        INNER JOIN users u ON pp.customer_id = u.id
        INNER JOIN lots l ON pp.lot_id = l.id
        INNER JOIN blocks b ON l.block_id = b.id
        INNER JOIN sectors s ON b.sector_id = s.id
        INNER JOIN gardens g ON s.garden_id = g.id
        WHERE pps.status <> 'paid'
          AND DATE(pps.due_date) = :targetDate
          AND u.email IS NOT NULL
          AND u.email <> ''
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute(['targetDate' => $targetDate]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $sent = 0;
    $failures = [];

    $errorMessages = [];
    foreach ($rows as $row) {
        if (send_due_email($row, $mailerAvailable, $errorMessages)) {
            $sent++;
        } else {
            $failures[] = $row['schedule_id'];
        }
    }

    echo json_encode([
        'success' => true,
        'target_date' => $targetDate,
        'total_due' => count($rows),
        'reminders_sent' => $sent,
        'failed_schedule_ids' => $failures,
        'errors' => $errorMessages,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to send reminders: ' . $e->getMessage()
    ]);
}

