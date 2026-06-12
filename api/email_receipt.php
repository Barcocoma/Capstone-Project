<?php
require_once 'config.php';
require_once __DIR__ . '/receipt_helper.php';
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
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

global $pdo;

try {
    $raw = file_get_contents('php://input');
    $data = $raw ? json_decode($raw, true) : [];

    $payment_id = $data['payment_id'] ?? ($_GET['payment_id'] ?? null);
    $checkout_id = $data['checkout_id'] ?? ($_GET['checkout_id'] ?? null);

    if (!$payment_id && !$checkout_id) {
        echo json_encode(['success' => false, 'message' => 'payment_id or checkout_id is required']);
        exit;
    }

    // Resolve payment_id via checkout_id if needed (notes contain the session id)
    if (!$payment_id && $checkout_id) {
        $stmt = $pdo->prepare("SELECT id FROM payment_records WHERE status='Paid' AND notes LIKE ? ORDER BY id DESC LIMIT 1");
        $stmt->execute(['%'.$checkout_id.'%']);
        $payment_id = $stmt->fetchColumn();
    }

    if (!$payment_id) {
        echo json_encode(['success' => false, 'message' => 'Paid record not found for provided checkout_id']);
        exit;
    }

    // Fetch details (reuse query from generate_receipt.php)
    $sql = "
        SELECT pr.*, u.first_name, u.middle_name, u.last_name, u.email, u.contact_number,
               l.lot_number, b.block_number, s.name AS sector_name, g.name AS garden_name,
               CONCAT(g.name, ' - ', s.name, '-', l.lot_number) AS lot_display,
               c.street_address, c.city, c.province
        FROM payment_records pr
        LEFT JOIN lots l ON pr.lot_id = l.id
        LEFT JOIN users u ON l.customer_id = u.id
        LEFT JOIN customers c ON u.id = c.user_id
        LEFT JOIN blocks b ON l.block_id = b.id
        LEFT JOIN sectors s ON b.sector_id = s.id
        LEFT JOIN gardens g ON s.garden_id = g.id
        WHERE pr.id = ?
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$payment_id]);
    $p = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$p || empty($p['email'])) {
        echo json_encode(['success' => false, 'message' => 'Receipt details or customer email not found']);
        exit;
    }

    $customerName = trim($p['first_name'].' '.($p['middle_name'] ? $p['middle_name'].' ' : '').$p['last_name']);
    $receiptNo = date('Y-m-d', strtotime($p['created_at'])) . '-' . str_pad($p['id'], 5, '0', STR_PAD_LEFT);
    $amount = number_format((float)$p['payment_amount'], 2);
    $lotDisplay = $p['lot_display'] ?: 'N/A';
    $method = $p['payment_method'] ?: 'N/A';
    $txnDate = $p['payment_date'] ?: $p['created_at'];

    // Build designed HTML email
    $subject = "Payment Receipt #$receiptNo";
    $to = $p['email'];
    $headers = "MIME-Version: 1.0\r\n".
               "Content-type: text/html; charset=UTF-8\r\n".
               "From: Divine Life Memorial Park <".(defined('SMTP_FROM_EMAIL')?SMTP_FROM_EMAIL:'no-reply@divinelifememorial.com').">\r\n";

    $baseUrl = (isset($_SERVER['HTTP_HOST']) && $_SERVER['HTTP_HOST'] !== '')
      ? ( (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . '/ManagementSystem')
      : '';
    $logoUrl = $baseUrl . '/public/img/divine_life.png';

    $html = "<div style='background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif'>".
              "<div style='max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden'>".
                "<div style='background:#0f172a;padding:20px 24px;display:flex;align-items:center;gap:12px'>".
                  "<div style='color:#fff;font-size:18px;font-weight:700;letter-spacing:.3px'>Divine Life Memorial Park</div>".
                "</div>".
                "<div style='padding:24px'>".
                  "<div style='font-size:14px;color:#111827;margin-bottom:16px'>Official Receipt</div>".
                  "<div style='border:1px solid #e5e7eb;border-radius:8px;overflow:hidden'>".
                    "<table style='width:100%;border-collapse:collapse;font-size:14px'>".
                      "<tr style='background:#f1f5f9'><td style='padding:10px 12px;color:#374151'>Receipt No.</td><td style='padding:10px 12px;text-align:right;color:#111827'><strong>$receiptNo</strong></td></tr>".
                      "<tr><td style='padding:10px 12px;color:#374151'>Customer</td><td style='padding:10px 12px;text-align:right;color:#111827'>$customerName</td></tr>".
                      "<tr style='background:#f9fafb'><td style='padding:10px 12px;color:#374151'>Lot</td><td style='padding:10px 12px;text-align:right;color:#111827'>$lotDisplay</td></tr>".
                      "<tr><td style='padding:10px 12px;color:#374151'>Amount</td><td style='padding:10px 12px;text-align:right;color:#16a34a'><strong>₱$amount</strong></td></tr>".
                      "<tr style='background:#f9fafb'><td style='padding:10px 12px;color:#374151'>Method</td><td style='padding:10px 12px;text-align:right;color:#111827'>$method</td></tr>".
                      "<tr><td style='padding:10px 12px;color:#374151'>Date</td><td style='padding:10px 12px;text-align:right;color:#111827'>".date('M d, Y', strtotime($txnDate))."</td></tr>".
                    "</table>".
                  "</div>".
                  "<p style='margin:18px 0 0;color:#4b5563;font-size:12px'>Thank you for your payment. Please keep this email for your records.</p>".
                "</div>".
                "<div style='background:#f8fafc;padding:10px 16px;text-align:center;color:#6b7280;font-size:12px'>© ".date('Y')." Divine Life Memorial Park</div>".
              "</div>".
            "</div>";

    $ok = false;
    // Prefer SMTP via PHPMailer if enabled and available
    if (defined('SMTP_ENABLED') && SMTP_ENABLED && $mailerAvailable) {
        try {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = SMTP_HOST;
            $mail->SMTPAuth = true;
            $mail->Username = SMTP_USERNAME;
            $mail->Password = SMTP_PASSWORD; // For Gmail: use App Password
            $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = SMTP_PORT;
            $mail->CharSet = 'UTF-8';

            $mail->setFrom(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
            $mail->addAddress($to, $customerName);
            $mail->Subject = $subject;
            $mail->isHTML(true);
            $mail->Body = str_replace('{{LOGO_SRC}}', '', $html);

            $pdfPath = receipt_ensure_pdf($payment_id);
            if ($pdfPath && file_exists($pdfPath)) {
                $mail->addAttachment($pdfPath, "Payment-Receipt-{$receiptNo}.pdf");
            }

            $ok = $mail->send();
            
            // Clean up temporary file
            if ($pdfPath && file_exists($pdfPath)) {
                @unlink($pdfPath);
            }
        } catch (Throwable $e) {
            $ok = false;
        }
    }

    // Fallback to PHP mail() if SMTP not configured/available
    if (!$ok) {
        $pdfPath = receipt_ensure_pdf($payment_id);
        if ($pdfPath && file_exists($pdfPath)) {
            $boundary = md5(uniqid((string)$payment_id, true));
            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: multipart/mixed; boundary=\"{$boundary}\"\r\n";
            $headers .= "From: ".(defined('SMTP_FROM_NAME')?SMTP_FROM_NAME:'Divine Life Memorial Park')." <".(defined('SMTP_FROM_EMAIL')?SMTP_FROM_EMAIL:'no-reply@divinelifememorial.com').">\r\n";

            $message = "--{$boundary}\r\n";
            $message .= "Content-Type: text/html; charset=UTF-8\r\n";
            $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
            $message .= str_replace('{{LOGO_SRC}}', '', $html) . "\r\n";

            $message .= "--{$boundary}\r\n";
            $message .= "Content-Type: application/pdf; name=\"Payment-Receipt-{$receiptNo}.pdf\"\r\n";
            $message .= "Content-Transfer-Encoding: base64\r\n";
            $message .= "Content-Disposition: attachment; filename=\"Payment-Receipt-{$receiptNo}.pdf\"\r\n\r\n";
            $message .= chunk_split(base64_encode(file_get_contents($pdfPath))) . "\r\n";
            $message .= "--{$boundary}--";

            $ok = @mail($to, $subject, $message, $headers);
            
            // Clean up temporary file
            @unlink($pdfPath);
        } else {
            $headers = "MIME-Version: 1.0\r\n".
                       "Content-type: text/html; charset=UTF-8\r\n".
                       "From: ".(defined('SMTP_FROM_NAME')?SMTP_FROM_NAME:'Divine Life Memorial Park')." <".(defined('SMTP_FROM_EMAIL')?SMTP_FROM_EMAIL:'no-reply@divinelifememorial.com').">\r\n";
            $ok = @mail($to, $subject, str_replace('{{LOGO_SRC}}', '', $html), $headers);
        }
    }

    echo json_encode([
        'success' => (bool)$ok,
        'message' => $ok ? 'Receipt email sent' : 'Failed to send email (configure SMTP or PHP mail)',
        'payment_id' => (int)$payment_id,
        'email' => $to
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error sending receipt: '.$e->getMessage()]);
}
?>


