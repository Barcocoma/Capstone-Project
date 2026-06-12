<?php
require_once 'config.php';
require_once __DIR__ . '/payment_schedule_helper.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    $checkout_id = $_GET['checkout_id'] ?? '';
    
    if (!$checkout_id) {
        echo json_encode(['success' => false, 'message' => 'Missing checkout_id']);
        exit;
    }
    
    // Check PayMongo checkout session status
    $secret_key = 'YOUR_PAYMONGO_SECRET_KEY';
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://api.paymongo.com/v1/checkout_sessions/{$checkout_id}");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Basic ' . base64_encode($secret_key . ':'),
        'Content-Type: application/json'
    ]);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code !== 200) {
        echo json_encode(['success' => false, 'message' => 'Failed to check payment status']);
        exit;
    }
    
    $checkout_data = json_decode($response, true);
    $attributes = $checkout_data['data']['attributes'] ?? [];
    $status = $attributes['status'] ?? 'unknown';
    
    // Consider paid if checkout status is 'paid' or any embedded payment is 'paid'
    $is_paid = ($status === 'paid');
    if (!$is_paid && !empty($attributes['payments']) && is_array($attributes['payments'])) {
        foreach ($attributes['payments'] as $payment) {
            $payment_status = $payment['attributes']['status'] ?? '';
            if ($payment_status === 'paid') {
                $is_paid = true;
                break;
            }
        }
    }
    
    // If paid, process the payment immediately
    if ($is_paid) {
        // Get payment session from database
        $session_sql = "SELECT * FROM payment_sessions WHERE checkout_id = ?";
        $session_stmt = $pdo->prepare($session_sql);
        $session_stmt->execute([$checkout_id]);
        $session = $session_stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($session && $session['status'] === 'pending') {
            // Check if payment record already exists for this checkout session
            $existing_payment_sql = "SELECT id FROM payment_records WHERE notes LIKE ? LIMIT 1";
            $existing_payment_stmt = $pdo->prepare($existing_payment_sql);
            $existing_payment_stmt->execute(['%Session ID: ' . $checkout_id . '%']);
            $existing_payment = $existing_payment_stmt->fetch(PDO::FETCH_ASSOC);
            
            // Only process if no payment record exists yet
            if (!$existing_payment) {
                // Update session status
                $update_sql = "UPDATE payment_sessions SET status = 'paid', updated_at = NOW() WHERE checkout_id = ?";
                $update_stmt = $pdo->prepare($update_sql);
                $update_stmt->execute([$checkout_id]);
                
                // Get customer information
                $customer_sql = "SELECT u.first_name, u.last_name, u.contact_number FROM users u WHERE u.id = ?";
                $customer_stmt = $pdo->prepare($customer_sql);
                $customer_stmt->execute([$session['customer_id']]);
                $customer = $customer_stmt->fetch(PDO::FETCH_ASSOC);
                
                $owner_name = $customer ? $customer['first_name'] . ' ' . $customer['last_name'] : 'Unknown';
                $contact = $customer['contact_number'] ?? '';
                
                // Create payment record with correct date
                if (!empty($session['payment_month'])) {
                    $scheduled_due_date = get_payment_schedule_due_date($session['lot_id'], $session['customer_id'], $session['payment_month']);
                    $resolved_due_date = $scheduled_due_date ?: date('Y-m-d', strtotime($session['payment_month'] . '-01'));
                    $payment_date = $resolved_due_date; // DATE column, not DATETIME
                    $due_date = $resolved_due_date;
                    $last_payment_date = $resolved_due_date;
                } else {
                    $payment_date = date('Y-m-d'); // DATE column, not DATETIME
                    $due_date = date('Y-m-d');
                    $last_payment_date = date('Y-m-d');
                }
                
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
                    'Payment processed - Session ID: ' . $checkout_id . 
                    (!empty($session['payment_month']) ? ' - Month: ' . $session['payment_month'] : '')
                ]);
                
                $newPaymentId = (int)$pdo->lastInsertId();
                
                // Send receipt email
                if (!function_exists('send_payment_receipt_email')) {
                    function send_payment_receipt_email($paymentId) {
                        global $pdo;
                        $mailerAvailable = false;
                        try {
                            $vendor = __DIR__ . '/../vendor/autoload.php';
                            if (file_exists($vendor)) {
                                require_once $vendor;
                                if (class_exists('PHPMailer\\PHPMailer\\PHPMailer')) { $mailerAvailable = true; }
                            }
                        } catch (Throwable $e) { /* ignore */ }

                        $sql = "SELECT pr.*, u.first_name, u.middle_name, u.last_name, u.email,
                                       CONCAT(g.name, ' - ', s.name, '-', l.lot_number) AS lot_display,
                                       g.name AS garden_name, s.name AS sector_name, l.lot_number
                                FROM payment_records pr
                                LEFT JOIN lots l ON pr.lot_id = l.id
                                LEFT JOIN users u ON l.customer_id = u.id
                                LEFT JOIN blocks b ON l.block_id = b.id
                                LEFT JOIN sectors s ON b.sector_id = s.id
                                LEFT JOIN gardens g ON s.garden_id = g.id
                                WHERE pr.id = ?";
                        $stmt = $pdo->prepare($sql);
                        $stmt->execute([$paymentId]);
                        $p = $stmt->fetch(PDO::FETCH_ASSOC);
                        if (!$p || empty($p['email'])) return false;

                        $customerName = trim($p['first_name'].' '.($p['middle_name'] ? $p['middle_name'].' ' : '').$p['last_name']);
                        $receiptNo = date('Y-m-d', strtotime($p['created_at'])) . '-' . str_pad($p['id'], 5, '0', STR_PAD_LEFT);
                        $amount = number_format((float)$p['payment_amount'], 2);
                        $lotDisplay = $p['lot_display'] ?: 'N/A';
                        $method = $p['payment_method'] ?: 'N/A';
                        $txnDate = $p['payment_date'] ?: $p['created_at'];
                        $dueDateDisplay = $p['payment_due_date'] ? date('M d, Y', strtotime($p['payment_due_date'])) : 'N/A';
                        $subject = "Payment Receipt #$receiptNo";
                        $to = $p['email'];
                        
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
                                          "<tr><td style='padding:10px 12px;color:#374151'>Due Date</td><td style='padding:10px 12px;text-align:right;color:#111827'>$dueDateDisplay</td></tr>".
                                        "</table>".
                                      "</div>".
                                      "<p style='margin:18px 0 0;color:#4b5563;font-size:12px'>Thank you for your payment. Please keep this email for your records.</p>".
                                    "</div>".
                                    "<div style='background:#f8fafc;padding:10px 16px;text-align:center;color:#6b7280;font-size:12px'>© ".date('Y')." Divine Life Memorial Park</div>".
                                  "</div>".
                                "</div>";

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
                                $mail->Body = $html;

                                $ok = $mail->send();
                            } catch (Throwable $e) { $ok = false; }
                        }
                        if (!$ok) {
                            $fromName = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Divine Life Memorial Park';
                            $fromEmail = defined('SMTP_FROM_EMAIL') ? SMTP_FROM_EMAIL : 'no-reply@divinelifememorial.com';
                            $headers = "MIME-Version: 1.0\r\n".
                                       "Content-type: text/html; charset=UTF-8\r\n".
                                       "From: {$fromName} <{$fromEmail}>\r\n";
                            $ok = @mail($to, $subject, $html, $headers);
                        }
                        return $ok;
                    }
                }
                try {
                    send_payment_receipt_email($newPaymentId);
                } catch (Throwable $e) {
                    // Non-fatal; continue even if email fails
                    error_log('Failed to send receipt email: ' . $e->getMessage());
                }
                
                // Mark plan schedule and update plan status if applicable
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
            } else {
                // Payment record already exists, just update session status
                $update_sql = "UPDATE payment_sessions SET status = 'paid', updated_at = NOW() WHERE checkout_id = ?";
                $update_stmt = $pdo->prepare($update_sql);
                $update_stmt->execute([$checkout_id]);
            }
        }
    }
    
    echo json_encode([
        'success' => true,
        'is_paid' => $is_paid,
        'status' => $status
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
