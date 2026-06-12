<?php
require_once 'config.php';
require_once __DIR__ . '/payment_schedule_helper.php';
require_once __DIR__ . '/receipt_helper.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

global $pdo;

// Minimal helper to send receipt via SMTP if configured (fallback to mail())
function send_payment_receipt_email($paymentId, $overrideEmail = null) {
    global $pdo;
    // Load PHPMailer if available
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

    // Fetch details (same as generate_receipt.php)
    $sql = "
        SELECT pr.*, u.first_name, u.middle_name, u.last_name, u.email, u.contact_number,
               l.lot_number, b.block_number, s.name AS sector_name, g.name AS garden_name,
               CONCAT(g.name, ' - ', s.name, '-', l.lot_number) AS lot_display
        FROM payment_records pr
        LEFT JOIN lots l ON pr.lot_id = l.id
        LEFT JOIN users u ON l.customer_id = u.id
        LEFT JOIN blocks b ON l.block_id = b.id
        LEFT JOIN sectors s ON b.sector_id = s.id
        LEFT JOIN gardens g ON s.garden_id = g.id
        WHERE pr.id = ?
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$paymentId]);
    $p = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$p) return false;
    $targetEmail = $overrideEmail ?: ($p['email'] ?? '');
    if ($targetEmail === '') return false;

    $customerName = trim($p['first_name'].' '.($p['middle_name'] ? $p['middle_name'].' ' : '').$p['last_name']);
    $receiptNo = date('Y-m-d', strtotime($p['created_at'])) . '-' . str_pad($p['id'], 5, '0', STR_PAD_LEFT);
    $amount = number_format((float)$p['payment_amount'], 2);
    $lotDisplay = $p['lot_display'] ?: 'N/A';
    $method = $p['payment_method'] ?: 'N/A';
    $txnDate = $p['payment_date'] ?: $p['created_at'];
    $subject = "Payment Receipt #$receiptNo";
    $to = $targetEmail;
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

    // Prefer SMTP via PHPMailer
    $ok = false;
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
            $mail->Body = str_replace('{{LOGO_SRC}}', '', $html);

            $pdfPath = receipt_ensure_pdf($paymentId);
            if ($pdfPath && file_exists($pdfPath)) {
                $mail->addAttachment($pdfPath, "Payment-Receipt-{$receiptNo}.pdf");
            }

            $ok = $mail->send();
            
            // Clean up temporary file
            if ($pdfPath && file_exists($pdfPath)) {
                @unlink($pdfPath);
            }
        } catch (Throwable $e) { $ok = false; }
    }
    if (!$ok) {
        $fromName = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Divine Life Memorial Park';
        $fromEmail = defined('SMTP_FROM_EMAIL') ? SMTP_FROM_EMAIL : 'no-reply@divinelifememorial.com';
        $pdfPath = receipt_ensure_pdf($paymentId);
        if ($pdfPath && file_exists($pdfPath)) {
            $boundary = md5(uniqid((string)$paymentId, true));
            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "From: {$fromName} <{$fromEmail}>\r\n";
            $headers .= "Content-Type: multipart/mixed; boundary=\"{$boundary}\"\r\n";

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
                       "From: {$fromName} <{$fromEmail}>\r\n";
            $ok = @mail($to, $subject, str_replace('{{LOGO_SRC}}', '', $html), $headers);
        }
    }
    return $ok;
}

try {
    $processed_count = 0;
    $errors = [];
    $target_checkout = isset($_GET['checkout_id']) ? trim($_GET['checkout_id']) : null;
    
    // Get pending payment sessions (optionally only one checkout)
    if ($target_checkout) {
        $stmt = $pdo->prepare("SELECT * FROM payment_sessions WHERE checkout_id = ? AND status = 'pending' ORDER BY created_at DESC");
        $stmt->execute([$target_checkout]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM payment_sessions WHERE status = 'pending' ORDER BY created_at DESC");
        $stmt->execute();
    }
    $pending_sessions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($pending_sessions)) {
        echo json_encode([
            'success' => true,
            'message' => 'No pending payments to process',
            'processed_count' => 0
        ]);
        exit;
    }
    
    // Paymongo API configuration
    $secret_key = 'YOUR_PAYMONGO_SECRET_KEY';
    
    foreach ($pending_sessions as $session) {
        try {
            // Check payment status with Paymongo API
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, "https://api.paymongo.com/v1/checkout_sessions/{$session['checkout_id']}");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: Basic ' . base64_encode($secret_key . ':'),
                'Content-Type: application/json'
            ]);
            
            $response = curl_exec($ch);
            $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($http_code === 200) {
                $checkout_data = json_decode($response, true);
                $attributes = $checkout_data['data']['attributes'] ?? [];
                // Try to read payer email provided on the checkout page
                $payerEmail = '';
                if (!empty($attributes['billing']['email'])) { $payerEmail = $attributes['billing']['email']; }
                if ($payerEmail === '' && !empty($attributes['customer_email'])) { $payerEmail = $attributes['customer_email']; }
                if ($payerEmail === '' && !empty($attributes['email'])) { $payerEmail = $attributes['email']; }
                $status = $attributes['status'] ?? 'unknown';
                
                // Consider paid if:
                // 1) checkout status is 'paid', OR
                // 2) any embedded payments entry has status 'paid', OR
                // 3) linked payment_intent (if present) has status 'succeeded'
                $isPaid = ($status === 'paid');
                if (!$isPaid && !empty($attributes['payments']) && is_array($attributes['payments'])) {
                    foreach ($attributes['payments'] as $p) {
                        $ps = $p['attributes']['status'] ?? '';
                        if ($ps === 'paid') { $isPaid = true; break; }
                    }
                }
                if (!$isPaid && !empty($attributes['payment_intent']['id'])) {
                    // Best-effort: query payment_intent to check if succeeded
                    try {
                        $piId = $attributes['payment_intent']['id'];
                        $ch2 = curl_init();
                        curl_setopt($ch2, CURLOPT_URL, "https://api.paymongo.com/v1/payment_intents/{$piId}");
                        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
                        curl_setopt($ch2, CURLOPT_HTTPHEADER, [
                            'Authorization: Basic ' . base64_encode($secret_key . ':'),
                            'Content-Type: application/json'
                        ]);
                        $resp2 = curl_exec($ch2);
                        $code2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
                        curl_close($ch2);
                        if ($code2 === 200) {
                            $pi = json_decode($resp2, true);
                            $piStatus = $pi['data']['attributes']['status'] ?? '';
                            if ($piStatus === 'succeeded') { $isPaid = true; }
                        }
                    } catch (Throwable $e) { /* ignore */ }
                }

                if ($isPaid) {
                    // Process the payment directly (simpler than webhook)
                    try {
                        // Update payment session status
                        $update_session_sql = "UPDATE payment_sessions SET status = 'paid', updated_at = NOW() WHERE checkout_id = ?";
                        $update_session_stmt = $pdo->prepare($update_session_sql);
                        $update_session_stmt->execute([$session['checkout_id']]);
                        
                        // Get customer information
                        $customer_sql = "SELECT u.first_name, u.last_name, u.contact_number FROM users u WHERE u.id = ?";
                        $customer_stmt = $pdo->prepare($customer_sql);
                        $customer_stmt->execute([$session['customer_id']]);
                        $customer = $customer_stmt->fetch(PDO::FETCH_ASSOC);
                        
                        $owner_name = $customer ? $customer['first_name'] . ' ' . $customer['last_name'] : 'Unknown';
                        $contact = $customer['contact_number'] ?? '';
                        
                        // Create payment record with correct date format for monthly status detection
                        if (!empty($session['payment_month'])) {
                            // For monthly payments: set payment_date to the payment month (CRITICAL for detection)
                            $scheduled_due_date = get_payment_schedule_due_date($session['lot_id'], $session['customer_id'], $session['payment_month']);
                            $resolved_due_date = $scheduled_due_date ?: date('Y-m-d', strtotime($session['payment_month'] . '-01'));
                            $payment_date = $resolved_due_date; // DATE column, not DATETIME
                            $due_date = $resolved_due_date;
                            $last_payment_date = $resolved_due_date;
                        } else {
                            // For general payments: use current date
                            $payment_date = date('Y-m-d'); // DATE column, not DATETIME
                            $due_date = date('Y-m-d');
                            $last_payment_date = date('Y-m-d');
                        }
                        
                        // Avoid duplicate records for the same lot and month
                        $duplicate = false;
                        if (!empty($session['payment_month'])) {
                            $dup_stmt = $pdo->prepare("SELECT id FROM payment_records WHERE lot_id = ? AND DATE_FORMAT(payment_date, '%Y-%m') = ? AND status = 'Paid' LIMIT 1");
                            $dup_stmt->execute([$session['lot_id'], $session['payment_month']]);
                            $duplicate = (bool)$dup_stmt->fetchColumn();
                        }

                        if (!$duplicate) {
                            $payment_record_sql = "INSERT INTO payment_records (lot_id, owner_name, contact, section, payment_amount, 
                                    payment_method, payment_due_date, last_payment_date, status, payment_date, notes) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                            
                            $payment_stmt = $pdo->prepare($payment_record_sql);
                            $payment_stmt->execute([
                                $session['lot_id'],
                                $owner_name,
                                $contact,
                                'Online',
                                $session['amount'],
                                'GCash',
                                $due_date,
                                $last_payment_date,
                                'Paid',
                                $payment_date,
                                'Payment processed - Session ID: ' . $session['checkout_id'] . 
                                (!empty($session['payment_month']) ? ' - Month: ' . $session['payment_month'] : '')
                            ]);

                            $newPaymentId = (int)$pdo->lastInsertId();
                            // Attempt to send receipt email to checkout-entered email if present
                            try { send_payment_receipt_email($newPaymentId, $payerEmail ?: null); } catch (Throwable $e) { /* ignore */ }
                        }
                        
                        // Mark plan schedule and update plan status if applicable
                        try {
                            if (!empty($session['payment_month'])) {
                                $plan_q = $pdo->prepare("SELECT id FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
                                $plan_q->execute([$session['lot_id'], $session['customer_id']]);
                                if ($plan = $plan_q->fetch(PDO::FETCH_ASSOC)) {
                                    $plan_id = (int)$plan['id'];
                                    $pdo->prepare("UPDATE payment_plan_schedule SET status = 'paid', updated_at = NOW() WHERE payment_plan_id = ? AND DATE_FORMAT(due_date, '%Y-%m') = ?")->execute([$plan_id, $session['payment_month']]);
                                    $cnt_total = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id)->fetchColumn();
                                    $cnt_paid = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id . " AND status = 'paid'")->fetchColumn();
                                    if ($cnt_total > 0 && $cnt_paid >= $cnt_total) {
                                        $pdo->prepare("UPDATE payment_plans SET status='completed', remaining_balance = 0, updated_at = NOW() WHERE id = ?")->execute([$plan_id]);
                                    } else {
                                        $pdo->prepare("UPDATE payment_plans SET remaining_balance = GREATEST(remaining_balance - ?, 0), updated_at = NOW() WHERE id = ?")->execute([$session['amount'], $plan_id]);
                                    }
                                    
                                    // Update delinquency_start_month (reset if all overdue cleared, set if first overdue)
                                    update_delinquency_start_month($plan_id);
                                }
                            }
                        } catch (Throwable $e) { /* ignore */ }
                        
                        $processed_count++;
                        
                    } catch (Exception $e) {
                        $errors[] = "Failed to process payment for session {$session['checkout_id']}: " . $e->getMessage();
                    }
                    
                } elseif ($status === 'cancelled' || $status === 'expired') {
                    // Update session status to cancelled/expired
                    $update_stmt = $pdo->prepare("UPDATE payment_sessions SET status = ?, updated_at = NOW() WHERE checkout_id = ?");
                    $update_stmt->execute([$status, $session['checkout_id']]);
                }
            }
            
        } catch (Exception $e) {
            $errors[] = "Error processing session {$session['checkout_id']}: " . $e->getMessage();
        }
    }
    
    echo json_encode([
        'success' => true,
        'message' => "Processed $processed_count payments",
        'processed_count' => $processed_count,
        'total_pending' => count($pending_sessions),
        'errors' => $errors
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error processing pending payments: ' . $e->getMessage()
    ]);
}
?>



