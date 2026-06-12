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

global $pdo;

// Helper to send receipt email with optional bulk summary
function send_payment_receipt_email($paymentId, array $options = []) {
    if (!$paymentId) {
        return false;
    }
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
    $dueDateDisplay = $p['payment_due_date'] ? date('M d, Y', strtotime($p['payment_due_date'])) : 'N/A';
    $subject = $options['subject'] ?? "Payment Receipt #$receiptNo";
    $to = $p['email'];
    $bulkMonths = $options['bulk_months'] ?? [];
    $additionalPaymentIds = $options['additional_payment_ids'] ?? [];

    $bodyContent = "<div style='font-size:14px;color:#111827;margin-bottom:16px'>Official Receipt</div>"
        . "<div style='border:1px solid #e5e7eb;border-radius:8px;overflow:hidden'>"
        . "<table style='width:100%;border-collapse:collapse;font-size:14px'>"
        . "<tr style='background:#f1f5f9'><td style='padding:10px 12px;color:#374151'>Receipt No.</td><td style='padding:10px 12px;text-align:right;color:#111827'><strong>$receiptNo</strong></td></tr>"
        . "<tr><td style='padding:10px 12px;color:#374151'>Customer</td><td style='padding:10px 12px;text-align:right;color:#111827'>$customerName</td></tr>"
        . "<tr style='background:#f9fafb'><td style='padding:10px 12px;color:#374151'>Lot</td><td style='padding:10px 12px;text-align:right;color:#111827'>$lotDisplay</td></tr>"
        . "<tr><td style='padding:10px 12px;color:#374151'>Amount</td><td style='padding:10px 12px;text-align:right;color:#16a34a'><strong>₱$amount</strong></td></tr>"
        . "<tr style='background:#f9fafb'><td style='padding:10px 12px;color:#374151'>Method</td><td style='padding:10px 12px;text-align:right;color:#111827'>$method</td></tr>"
        . "<tr><td style='padding:10px 12px;color:#374151'>Due Date</td><td style='padding:10px 12px;text-align:right;color:#111827'>$dueDateDisplay</td></tr>"
        . "</table></div>";

    if (!empty($bulkMonths)) {
        $bulkRows = '';
        $totalBulkAmount = 0;
        foreach ($bulkMonths as $entry) {
            $label = htmlspecialchars($entry['label'] ?? '', ENT_QUOTES, 'UTF-8');
            $methodLabel = htmlspecialchars($entry['method'] ?? 'Cash', ENT_QUOTES, 'UTF-8');
            $rowAmount = isset($entry['amount']) ? (float)$entry['amount'] : 0;
            $totalBulkAmount += $rowAmount;
            $bulkRows .= "<tr>"
                . "<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827'>{$label}</td>"
                . "<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151'>{$methodLabel}</td>"
                . "<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#16a34a'><strong>₱" . number_format($rowAmount, 2) . "</strong></td>"
                . "</tr>";
        }
        $bodyContent .= "<div style='margin-top:24px'>"
            . "<div style='font-size:13px;font-weight:600;color:#0f172a;margin-bottom:8px'>Summary of Months Paid (" . count($bulkMonths) . ")</div>"
            . "<div style='border:1px solid #e5e7eb;border-radius:8px;overflow:hidden'>"
            . "<table style='width:100%;border-collapse:collapse;font-size:13px'>"
            . "<thead><tr style='background:#f9fafb;color:#374151;text-transform:uppercase;font-size:11px'>"
            . "<th style='padding:10px 12px;text-align:left'>Month</th>"
            . "<th style='padding:10px 12px;text-align:left'>Method</th>"
            . "<th style='padding:10px 12px;text-align:right'>Amount</th>"
            . "</tr></thead>"
            . "<tbody>{$bulkRows}"
            . "<tr style='background:#f1f5f9;font-weight:600'>"
            . "<td colspan='2' style='padding:10px 12px;text-align:right;color:#0f172a'>Total</td>"
            . "<td style='padding:10px 12px;text-align:right;color:#16a34a'><strong>₱" . number_format($totalBulkAmount, 2) . "</strong></td>"
            . "</tr>"
            . "</tbody></table></div></div>";
    }

    $bodyContent .= "<p style='margin:18px 0 0;color:#4b5563;font-size:12px'>Thank you for your payment. Please keep this email for your records.</p>";

    $html = "<div style='background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        . "<div style='max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden'>"
        . "<div style='background:#0f172a;padding:20px 24px;display:flex;align-items:center;gap:12px'>"
        . "<div style='color:#fff;font-size:18px;font-weight:700;letter-spacing:.3px'>Divine Life Memorial Park</div>"
        . "</div>"
        . "<div style='padding:24px'>{$bodyContent}</div>"
        . "<div style='background:#f8fafc;padding:10px 16px;text-align:center;color:#6b7280;font-size:12px'>© ".date('Y')." Divine Life Memorial Park</div>"
        . "</div>"
        . "</div>";

    $attachments = [];
    $basePdf = receipt_ensure_pdf($paymentId);
    if ($basePdf && file_exists($basePdf)) {
        $attachments[] = [
            'path' => $basePdf,
            'name' => "Payment-Receipt-{$receiptNo}.pdf"
        ];
    }
    if (!empty($additionalPaymentIds) && is_array($additionalPaymentIds)) {
        foreach ($additionalPaymentIds as $extraId) {
            if (!$extraId) continue;
            $extraPath = receipt_ensure_pdf($extraId);
            if ($extraPath && file_exists($extraPath)) {
                // Get receipt number for better naming
                $extraReceiptStmt = $pdo->prepare("SELECT id, created_at FROM payment_records WHERE id = ?");
                $extraReceiptStmt->execute([$extraId]);
                $extraReceipt = $extraReceiptStmt->fetch(PDO::FETCH_ASSOC);
                $extraReceiptNo = $extraReceipt ? (date('Y-m-d', strtotime($extraReceipt['created_at'])) . '-' . str_pad($extraReceipt['id'], 5, '0', STR_PAD_LEFT)) : $extraId;
                $attachments[] = [
                    'path' => $extraPath,
                    'name' => "Payment-Receipt-{$extraReceiptNo}.pdf"
                ];
            }
        }
    }

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

            foreach ($attachments as $attachment) {
                $mail->addAttachment($attachment['path'], $attachment['name']);
            }

            $ok = $mail->send();
        } catch (Throwable $e) {
            $ok = false;
        }
    }
    if (!$ok) {
        $fromName = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Divine Life Memorial Park';
        $fromEmail = defined('SMTP_FROM_EMAIL') ? SMTP_FROM_EMAIL : 'no-reply@divinelifememorial.com';
        if (!empty($attachments)) {
            $boundary = md5(uniqid((string)$paymentId, true));
            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "From: {$fromName} <{$fromEmail}>\r\n";
            $headers .= "Content-Type: multipart/mixed; boundary=\"{$boundary}\"\r\n";

            $message = "--{$boundary}\r\n";
            $message .= "Content-Type: text/html; charset=UTF-8\r\n";
            $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
            $message .= str_replace('{{LOGO_SRC}}', '', $html) . "\r\n";

            foreach ($attachments as $attachment) {
                $message .= "--{$boundary}\r\n";
                $message .= "Content-Type: application/pdf; name=\"{$attachment['name']}\"\r\n";
                $message .= "Content-Transfer-Encoding: base64\r\n";
                $message .= "Content-Disposition: attachment; filename=\"{$attachment['name']}\"\r\n\r\n";
                $message .= chunk_split(base64_encode(file_get_contents($attachment['path']))) . "\r\n";
            }
            $message .= "--{$boundary}--";

            $ok = @mail($to, $subject, $message, $headers);
        } else {
            $headers = "MIME-Version: 1.0\r\n".
                       "Content-type: text/html; charset=UTF-8\r\n".
                       "From: {$fromName} <{$fromEmail}>\r\n";
            $ok = @mail($to, $subject, str_replace('{{LOGO_SRC}}', '', $html), $headers);
        }
    }

    foreach ($attachments as $attachment) {
        if (file_exists($attachment['path'])) {
            @unlink($attachment['path']);
        }
    }

    return $ok;
}

/**
 * Process a single monthly payment record.
 *
 * @throws Exception when validation fails.
 */
function process_monthly_payment($lot_id, $customer_id, $owner_name, $contact, $payment_method, $payment_amount, $payment_month, $sendReceipt = true) {
    global $pdo;

    if (empty($payment_month)) {
        throw new Exception('Payment month is required for monthly payments.');
    }

    $payment_amount = round((float)$payment_amount, 2);
    if ($payment_amount <= 0) {
        throw new Exception("Invalid payment amount for {$payment_month}");
    }

    $scheduled_due_date = get_payment_schedule_due_date($lot_id, $customer_id, $payment_month);
    $resolved_due_date = $scheduled_due_date ?: date('Y-m-d', strtotime($payment_month . '-01'));
    $payment_date = $resolved_due_date; // DATE column, not DATETIME
    $due_date = $resolved_due_date;
    $last_payment_date = $resolved_due_date;
    $notes = "Face-to-Face Payment - Monthly Payment for " . date('F Y', strtotime($payment_month));

    // Ensure payment for this month does not already exist
    $existing_payment_sql = "SELECT id FROM payment_records 
                             WHERE lot_id = ? 
                             AND DATE_FORMAT(payment_date, '%Y-%m') = ? 
                             AND status = 'Paid'";
    $existing_payment_stmt = $pdo->prepare($existing_payment_sql);
    $existing_payment_stmt->execute([$lot_id, $payment_month]);
    if ($existing_payment_stmt->fetch()) {
        throw new Exception("Payment for {$payment_month} already exists");
    }

    $payment_record_sql = "INSERT INTO payment_records (lot_id, owner_name, contact, section, payment_amount, 
            payment_method, payment_due_date, last_payment_date, status, payment_date, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $payment_stmt = $pdo->prepare($payment_record_sql);
    $payment_stmt->execute([
        $lot_id,
        $owner_name,
        $contact,
        'Face-to-Face',
        $payment_amount,
        $payment_method,
        $due_date,
        $last_payment_date,
        'Paid',
        $payment_date,
        $notes
    ]);

    $payment_id = $pdo->lastInsertId();

    if ($sendReceipt) {
        try { send_payment_receipt_email($payment_id); } catch (Throwable $e) { /* ignore */ }
    }

    // Record activity log
    $cashier_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
    if ($cashier_id) {
        try {
            $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
            $activity_stmt = $pdo->prepare($activity_sql);
            $activity_stmt->execute([
                'Pay',
                'Payment Monitoring',
                "Face-to-face payment processed for customer '{$owner_name}' - Amount: ₱{$payment_amount} - Method: {$payment_method} - Month: {$payment_month}",
                $cashier_id,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]);
        } catch (Throwable $e) {
            // Non-fatal
        }
    }

    // Update installment schedule / plan progress
    try {
        $plan_q = $pdo->prepare("SELECT id FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
        $plan_q->execute([$lot_id, $customer_id]);
        if ($plan = $plan_q->fetch(PDO::FETCH_ASSOC)) {
            $plan_id = (int)$plan['id'];
            $upd_sched = $pdo->prepare("UPDATE payment_plan_schedule SET status = 'paid', updated_at = NOW() WHERE payment_plan_id = ? AND DATE_FORMAT(due_date, '%Y-%m') = ?");
            $upd_sched->execute([$plan_id, $payment_month]);
            $cnt_total = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id)->fetchColumn();
            $cnt_paid = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id . " AND status = 'paid'")->fetchColumn();
            if ($cnt_total > 0 && $cnt_paid >= $cnt_total) {
                $pdo->prepare("UPDATE payment_plans SET status='completed', remaining_balance = 0, updated_at = NOW() WHERE id = ?")->execute([$plan_id]);
            } else {
                $pdo->prepare("UPDATE payment_plans SET remaining_balance = GREATEST(remaining_balance - ?, 0), updated_at = NOW() WHERE id = ?")->execute([$payment_amount, $plan_id]);
            }
            
            // Update delinquency_start_month (reset if all overdue cleared, set if first overdue)
            update_delinquency_start_month($plan_id);
        }
    } catch (Throwable $e) {
        // Ignore schedule update failures; payment record still stands
    }

    return $payment_id;
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $lot_id = $input['lot_id'] ?? null;
    $customer_id = $input['customer_id'] ?? null;
    $payment_amount = floatval($input['payment_amount'] ?? 0);
    $payment_method = $input['payment_method'] ?? 'Cash';
    if (!in_array($payment_method, ['Cash','GCash','Maya'], true)) {
        $payment_method = 'Cash';
    }
    $payment_month = $input['payment_month'] ?? null;

    $bulkPayments = [];
    if (!empty($input['bulk_payments']) && is_array($input['bulk_payments'])) {
        foreach ($input['bulk_payments'] as $entry) {
            $month = isset($entry['payment_month']) ? trim($entry['payment_month']) : null;
            $amount = isset($entry['payment_amount']) ? floatval($entry['payment_amount']) : 0;
            if ($month) {
                $bulkPayments[] = [
                    'payment_month' => $month,
                    'payment_amount' => $amount,
                ];
            }
        }
    }
    $hasBulkPayments = count($bulkPayments) > 0;
    
    // Validation
    if (!$lot_id || !$customer_id) {
        echo json_encode([
            'success' => false,
            'message' => 'Missing required fields: lot_id and customer_id are required'
        ]);
        exit;
    }
    if (!$hasBulkPayments && $payment_amount <= 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Payment amount must be greater than zero'
        ]);
        exit;
    }
    
    // Get customer information
    $customer_sql = "SELECT u.first_name, u.middle_name, u.last_name, u.contact_number, u.id as customer_id FROM users u 
                    JOIN lots l ON l.customer_id = u.id 
                    WHERE l.id = ?";
    $customer_stmt = $pdo->prepare($customer_sql);
    $customer_stmt->execute([$lot_id]);
    $customer = $customer_stmt->fetch(PDO::FETCH_ASSOC);

    if (!$customer) {
        echo json_encode([
            'success' => false,
            'message' => 'Customer not found'
        ]);
        exit;
    }

    $owner_name = trim($customer['first_name'] . ' ' . 
                      ($customer['middle_name'] ? $customer['middle_name'] . ' ' : '') . 
                      $customer['last_name']);
    $contact = $customer['contact_number'] ?? '';
    $customer_id = (int)$customer['customer_id'];

    if ($hasBulkPayments) {
        $seenMonths = [];
        foreach ($bulkPayments as $entry) {
            if (empty($entry['payment_month']) || $entry['payment_amount'] <= 0) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Bulk payments require valid payment_month and payment_amount values'
                ]);
                exit;
            }
            if (isset($seenMonths[$entry['payment_month']])) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Duplicate payment months detected in bulk request'
                ]);
                exit;
            }
            $seenMonths[$entry['payment_month']] = true;
        }

        usort($bulkPayments, function ($a, $b) {
            return strcmp($a['payment_month'], $b['payment_month']);
        });

        $paymentIds = [];
        $processedMonths = [];
        try {
            $pdo->beginTransaction();
            foreach ($bulkPayments as $entry) {
                $paymentIds[] = process_monthly_payment(
                    $lot_id,
                    $customer_id,
                    $owner_name,
                    $contact,
                    $payment_method,
                    $entry['payment_amount'],
                    $entry['payment_month'],
                    false
                );
                $processedMonths[] = $entry['payment_month'];
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => $e->getMessage()
            ]);
            exit;
        }

        $bulkSummary = [];
        if (!empty($paymentIds)) {
            $placeholders = implode(',', array_fill(0, count($paymentIds), '?'));
            $detailsStmt = $pdo->prepare("SELECT id, payment_amount, payment_method, payment_due_date, payment_date, created_at, notes
                                          FROM payment_records
                                          WHERE id IN ($placeholders)
                                          ORDER BY payment_due_date IS NULL, payment_due_date, payment_date, id");
            $detailsStmt->execute($paymentIds);
            $rows = $detailsStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $row) {
                $label = $row['payment_due_date']
                    ? date('M d, Y', strtotime($row['payment_due_date']))
                    : (preg_match('/([A-Za-z]+\\s+\\d{4})/', $row['notes'] ?? '', $m) ? $m[1] : date('M d, Y', strtotime($row['payment_date'] ?? $row['created_at'])));
                $bulkSummary[] = [
                    'label' => $label,
                    'method' => $row['payment_method'] ?? 'Cash',
                    'amount' => (float)$row['payment_amount']
                ];
            }
        }

        $options = [
            'subject' => "Payment Receipt - " . count($paymentIds) . " Month" . (count($paymentIds) === 1 ? '' : 's'),
            'bulk_months' => $bulkSummary,
            'additional_payment_ids' => array_slice($paymentIds, 1)
        ];

        $sent = false;
        try {
            $sent = send_payment_receipt_email($paymentIds[0] ?? null, $options);
        } catch (Throwable $e) {
            $sent = false;
        }
        if (!$sent) {
            foreach ($paymentIds as $pid) {
                try { send_payment_receipt_email($pid); } catch (Throwable $e) { /* ignore */ }
            }
        }

        echo json_encode([
            'success' => true,
            'message' => 'Bulk payments recorded successfully',
            'payment_ids' => $paymentIds,
            'processed_months' => $processedMonths
        ]);
        exit;
    }

    // Process single monthly payment path
    if (!empty($payment_month)) {
        try {
            $payment_id = process_monthly_payment(
                $lot_id,
                $customer_id,
                $owner_name,
                $contact,
                $payment_method,
                $payment_amount,
                $payment_month,
                true
            );

            echo json_encode([
                'success' => true,
                'message' => 'Payment recorded successfully',
                'payment_id' => $payment_id,
                'processed_months' => [$payment_month]
            ]);
            exit;
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => $e->getMessage()
            ]);
            exit;
        }
    }

    // General payment path (no specific payment month)
    $payment_date = date('Y-m-d'); // DATE column, not DATETIME
    $due_date = date('Y-m-d');
    $last_payment_date = date('Y-m-d');
    $notes = "Face-to-Face Payment - General Payment";

    $payment_record_sql = "INSERT INTO payment_records (lot_id, owner_name, contact, section, payment_amount, 
            payment_method, payment_due_date, last_payment_date, status, payment_date, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $payment_stmt = $pdo->prepare($payment_record_sql);
    $payment_stmt->execute([
        $lot_id,
        $owner_name,
        $contact,
        'Face-to-Face',
        $payment_amount,
        $payment_method,
        $due_date,
        $last_payment_date,
        'Paid',
        $payment_date,
        $notes
    ]);

    $payment_id = $pdo->lastInsertId();
    
    try { send_payment_receipt_email($payment_id); } catch (Throwable $e) { /* ignore */ }
    
    $cashier_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
    if ($cashier_id) {
        try {
            $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
            $activity_stmt = $pdo->prepare($activity_sql);
            $activity_stmt->execute([
                'Pay',
                'Payment Monitoring',
                "Face-to-face payment processed for customer '{$owner_name}' - Amount: ₱{$payment_amount} - Method: {$payment_method}",
                $cashier_id,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]);
        } catch (Throwable $e) {
            // Non-fatal; continue
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Payment recorded successfully',
        'payment_id' => $payment_id
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
