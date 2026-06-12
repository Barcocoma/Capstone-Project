<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { echo json_encode(['success' => false, 'message' => 'POST only']); exit; }

$body = json_decode(file_get_contents('php://input'), true) ?: [];
$to = trim($body['to'] ?? '');
if ($to === '') { echo json_encode(['success' => false, 'message' => 'Missing to']); exit; }

$detail = [
  'smtp_enabled' => defined('SMTP_ENABLED') ? SMTP_ENABLED : null,
  'host' => defined('SMTP_HOST') ? SMTP_HOST : null,
  'port' => defined('SMTP_PORT') ? SMTP_PORT : null,
  'username' => defined('SMTP_USERNAME') ? (SMTP_USERNAME !== '' ? 'SET' : 'EMPTY') : null,
  'from_email' => defined('SMTP_FROM_EMAIL') ? SMTP_FROM_EMAIL : null,
];

$vendor = __DIR__ . '/../vendor/autoload.php';
$hasVendor = file_exists($vendor);
$detail['vendor_autoload'] = $hasVendor ? 'found' : 'missing';

$mailerAvailable = false;
if ($hasVendor) {
  require_once $vendor;
  $mailerAvailable = class_exists('PHPMailer\\PHPMailer\\PHPMailer');
}
$detail['phpmailer'] = $mailerAvailable ? 'available' : 'unavailable';

$subject = 'SMTP Test - Cemetery Management System';
$html = '<p>This is a test email from the Cemetery Management System.</p>';

$ok = false; $error = '';
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
    $mail->addAddress($to);
    $mail->Subject = $subject;
    $mail->isHTML(true);
    $mail->Body = $html;
    $ok = $mail->send();
  } catch (Throwable $e) {
    $error = $e->getMessage();
    if (isset($mail) && method_exists($mail, 'ErrorInfo')) { $error .= ' | ' . $mail->ErrorInfo; }
  }
} else {
  // Fallback to PHP mail
  $headers = "MIME-Version: 1.0\r\nContent-type: text/html; charset=UTF-8\r\nFrom: ".(defined('SMTP_FROM_NAME')?SMTP_FROM_NAME:'CMS')." <".(defined('SMTP_FROM_EMAIL')?SMTP_FROM_EMAIL:'no-reply@example.com').">\r\n";
  $ok = @mail($to, $subject, $html, $headers);
  if (!$ok) { $error = 'mail() returned false (PHP mail likely not configured)'; }
}

echo json_encode(['success' => (bool)$ok, 'error' => $error, 'details' => $detail]);
?>




