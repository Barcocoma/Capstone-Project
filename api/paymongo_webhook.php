<?php
require_once 'config.php';
require_once __DIR__ . '/payment_schedule_helper.php';
require_once __DIR__ . '/receipt_helper.php';
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
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Verify webhook signature (in production, you should verify the webhook signature)
    // For now, we'll process the webhook data directly
    
    if (!isset($data['data']['attributes']['data']['id'])) {
        echo json_encode([
            'success' => false,
            'message' => 'Invalid webhook data'
        ]);
        exit;
    }
    
    $checkout_id = $data['data']['attributes']['data']['id'];
    $payment_status = $data['data']['attributes']['data']['attributes']['status'] ?? 'unknown';
    
    // Get payment session from database
    $sql = "SELECT * FROM payment_sessions WHERE checkout_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$checkout_id]);
    $payment_session = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$payment_session) {
        echo json_encode([
            'success' => false,
            'message' => 'Payment session not found'
        ]);
        exit;
    }
    
    // Update payment session status
    $update_sql = "UPDATE payment_sessions SET status = ?, updated_at = NOW() WHERE checkout_id = ?";
    $update_stmt = $pdo->prepare($update_sql);
    $update_stmt->execute([$payment_status, $checkout_id]);
    
    // If payment is successful, create payment record (only if not already created)
        if ($payment_status === 'paid') {
            // Check if payment record already exists for this checkout session
            $existing_payment_sql = "SELECT id FROM payment_records WHERE notes LIKE ? LIMIT 1";
            $existing_payment_stmt = $pdo->prepare($existing_payment_sql);
            $existing_payment_stmt->execute(['%Session ID: ' . $checkout_id . '%']);
            $existing_payment = $existing_payment_stmt->fetch(PDO::FETCH_ASSOC);
            
            // Only create payment record if it doesn't already exist
            if (!$existing_payment) {
                // Get customer information
                $customer_sql = "SELECT u.first_name, u.last_name, u.contact_number, u.id as customer_id FROM users u 
                                JOIN lots l ON l.customer_id = u.id 
                                WHERE l.id = ?";
                $customer_stmt = $pdo->prepare($customer_sql);
                $customer_stmt->execute([$payment_session['lot_id']]);
                $customer = $customer_stmt->fetch(PDO::FETCH_ASSOC);

                if ($customer) {
                    $owner_name = $customer['first_name'] . ' ' . $customer['last_name'];
                    $contact = $customer['contact_number'];
                    $customer_id = $customer['customer_id'];

                    // CRITICAL: Set payment_date to match the payment month for detection
                    if (!empty($payment_session['payment_month'])) {
                        // For monthly payments: payment_date MUST be in the payment month
                        $scheduled_due_date = get_payment_schedule_due_date(
                            $payment_session['lot_id'],
                            $customer_id,
                            $payment_session['payment_month']
                        );
                        $resolved_due_date = $scheduled_due_date ?: date('Y-m-d', strtotime($payment_session['payment_month'] . '-01'));
                        $payment_date = $resolved_due_date; // DATE column, not DATETIME
                        $due_date = $resolved_due_date;
                        $last_payment_date = $resolved_due_date;
                    } else {
                        // For general payments: use current date
                        $payment_date = date('Y-m-d'); // DATE column, not DATETIME
                        $due_date = date('Y-m-d');
                        $last_payment_date = date('Y-m-d');
                    }

                    $payment_record_sql = "INSERT INTO payment_records (lot_id, owner_name, contact, section, payment_amount, 
                            payment_method, payment_due_date, last_payment_date, status, payment_date, notes) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

                    $payment_stmt = $pdo->prepare($payment_record_sql);
                    $payment_stmt->execute([
                        $payment_session['lot_id'],
                        $owner_name,
                        $contact,
                        'Online',
                        $payment_session['amount'],
                        'GCash',
                        $due_date,
                        $last_payment_date,
                        'Paid',
                        $payment_date,
                        'Payment processed via Paymongo - Session ID: ' . $checkout_id . 
                        (!empty($payment_session['payment_month']) ? ' - Month: ' . $payment_session['payment_month'] : '')
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
                                              "<tr><td style='padding:10px 12px;color:#374151'>Date</td><td style='padding:10px 12px;text-align:right;color:#111827'>".date('M d, Y', strtotime($txnDate))."</td></tr>".
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
                    }
                    try {
                        send_payment_receipt_email($newPaymentId);
                    } catch (Throwable $e) {
                        // Non-fatal; continue even if email fails
                        error_log('Failed to send receipt email: ' . $e->getMessage());
                    }
                    
                    // Mark plan schedule and update plan status if applicable
                    if (!empty($payment_session['payment_month'])) {
                        try {
                            $plan_q = $pdo->prepare("SELECT id FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
                            $plan_q->execute([$payment_session['lot_id'], $customer_id]);
                            if ($plan = $plan_q->fetch(PDO::FETCH_ASSOC)) {
                                $plan_id = (int)$plan['id'];
                                $pdo->prepare("UPDATE payment_plan_schedule SET status = 'paid', updated_at = NOW() WHERE payment_plan_id = ? AND DATE_FORMAT(due_date, '%Y-%m') = ?")->execute([$plan_id, $payment_session['payment_month']]);
                                $cnt_total = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id)->fetchColumn();
                                $cnt_paid = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id . " AND status = 'paid'")->fetchColumn();
                                if ($cnt_total > 0 && $cnt_paid >= $cnt_total) {
                                    $pdo->prepare("UPDATE payment_plans SET status='completed', remaining_balance = 0, updated_at = NOW() WHERE id = ?")->execute([$plan_id]);
                                } else {
                                    $pdo->prepare("UPDATE payment_plans SET remaining_balance = GREATEST(remaining_balance - ?, 0), updated_at = NOW() WHERE id = ?")->execute([$payment_session['amount'], $plan_id]);
                                }
                                
                                // Update delinquency_start_month (reset if all overdue cleared, set if first overdue)
                                update_delinquency_start_month($plan_id);
                            }
                        } catch (Throwable $e) {
                            // Non-fatal; continue
                            error_log('Failed to update payment plan schedule: ' . $e->getMessage());
                        }
                    }
                
                // Get who initiated this payment (admin/cashier) from payment_sessions
                $initiator_id = null;
                try {
                    // Try to get initiated_by from payment_sessions
                    $initiator_sql = "SELECT initiated_by FROM payment_sessions WHERE checkout_id = ?";
                    $initiator_stmt = $pdo->prepare($initiator_sql);
                    $initiator_stmt->execute([$checkout_id]);
                    $initiator_result = $initiator_stmt->fetch(PDO::FETCH_ASSOC);
                    if ($initiator_result && !empty($initiator_result['initiated_by'])) {
                        $initiator_id = (int)$initiator_result['initiated_by'];
                        // Verify it's an admin or cashier
                        $verify_stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? AND account_type IN ("admin", "cashier")');
                        $verify_stmt->execute([$initiator_id]);
                        if (!$verify_stmt->fetchColumn()) {
                            $initiator_id = null;
                        }
                    }
                } catch (PDOException $e) {
                    // Column doesn't exist or error, try to get from status field if stored there
                    if (isset($payment_session['status']) && strpos($payment_session['status'], 'initiated_by:') !== false) {
                        preg_match('/initiated_by:(\d+)/', $payment_session['status'], $matches);
                        if (isset($matches[1])) {
                            $initiator_id = (int)$matches[1];
                            $verify_stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? AND account_type IN ("admin", "cashier")');
                            $verify_stmt->execute([$initiator_id]);
                            if (!$verify_stmt->fetchColumn()) {
                                $initiator_id = null;
                            }
                        }
                    }
                }
                
                // Record activity - use initiator if found, otherwise skip (don't use customer_id)
                if ($initiator_id) {
                    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
                    $activity_stmt = $pdo->prepare($activity_sql);
                    $activity_stmt->execute([
                        'Pay',
                        'Payment Monitoring',
                        "Online payment completed for lot '{$payment_session['lot_id']}' - Amount: ₱{$payment_session['amount']} - Session ID: $checkout_id",
                        $initiator_id,
                        $_SERVER['REMOTE_ADDR'] ?? '',
                        $_SERVER['HTTP_USER_AGENT'] ?? ''
                    ]);
                }
                }
            }
        }
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Webhook processed successfully'
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
