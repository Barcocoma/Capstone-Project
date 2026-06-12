<?php
require_once 'config.php';
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
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Helper to send receipt email
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
    $subject = "Payment Receipt #$receiptNo - Divine Life Memorial Park Official Receipt";
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
            $mail->Body = $html;

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
            $message .= $html . "\r\n";

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
            $ok = @mail($to, $subject, $html, $headers);
        }
    }
    return $ok;
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $admin_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    // Validate actor user (allow admin, staff, cemetery_staff, cashier)
    if (!$admin_id) {
        echo json_encode(['success' => false, 'message' => 'User ID required']);
        exit;
    }
    $admin_check = $pdo->prepare("SELECT account_type FROM users WHERE id = ?");
    $admin_check->execute([$admin_id]);
    $admin = $admin_check->fetch(PDO::FETCH_ASSOC);
    $allowed_roles = ['admin','staff','cemetery_staff','cashier'];
    if (!$admin || !in_array($admin['account_type'], $allowed_roles, true)) {
        echo json_encode(['success' => false, 'message' => 'Insufficient permission']);
        exit;
    }
    
    // Validate required fields
    $required_fields = ['lot_id', 'customer_id', 'total_amount', 'payment_term_months'];
    foreach ($required_fields as $field) {
        if (!isset($data[$field])) {
            echo json_encode(['success' => false, 'message' => "Missing required field: $field"]);
            exit;
        }
        // Special handling for payment_term_months - 0 is valid (fully paid)
        if ($field === 'payment_term_months') {
            if (!is_numeric($data[$field])) {
                echo json_encode(['success' => false, 'message' => "Invalid payment_term_months: must be numeric"]);
                exit;
            }
        } else if (empty($data[$field])) {
            echo json_encode(['success' => false, 'message' => "Missing required field: $field"]);
            exit;
        }
    }
    
    $lot_id = $data['lot_id'];
    $customer_id = $data['customer_id'];
    $total_amount = floatval($data['total_amount']);
    $down_payment = floatval($data['down_payment'] ?? 0);
    $payment_term_months = intval($data['payment_term_months']);
    $notes = $data['notes'] ?? '';
    $down_payment_split = !empty($data['down_payment_split']);
    $due_day = isset($data['due_day']) && $data['due_day'] !== null ? intval($data['due_day']) : null;
    
    // Validate due_day if provided
    if ($due_day !== null && ($due_day < 1 || $due_day > 31)) {
        echo json_encode(['success' => false, 'message' => 'Due day must be between 1 and 31']);
        exit;
    }
    
    // Validate payment term
    $valid_terms = [0, 12, 24, 36, 48, 60]; // 0 = fully paid
    if (!in_array($payment_term_months, $valid_terms)) {
        echo json_encode(['success' => false, 'message' => 'Invalid payment term. Must be 12, 24, 36, 48 months or 0 for fully paid']);
        exit;
    }
    
    if ($total_amount <= 0) {
        echo json_encode(['success' => false, 'message' => 'Total amount must be greater than zero']);
        exit;
    }
    
    if ($down_payment < 0) {
        echo json_encode(['success' => false, 'message' => 'Down payment cannot be negative']);
        exit;
    }
    
    if ($down_payment >= $total_amount && $payment_term_months > 0) {
        echo json_encode(['success' => false, 'message' => 'Down payment must be less than total amount for installment plans']);
        exit;
    }
    
    // Verify lot and customer exist
    $lot_check = $pdo->prepare("SELECT l.id, l.customer_id, l.lot_number, b.block_number, s.name as sector_name, g.name as garden_name 
                                FROM lots l 
                                LEFT JOIN blocks b ON l.block_id = b.id
                                LEFT JOIN sectors s ON b.sector_id = s.id  
                                LEFT JOIN gardens g ON s.garden_id = g.id
                                WHERE l.id = ?");
    $lot_check->execute([$lot_id]);
    $lot = $lot_check->fetch(PDO::FETCH_ASSOC);
    
    if (!$lot) {
        echo json_encode(['success' => false, 'message' => 'Lot not found']);
        exit;
    }
    
    $customer_check = $pdo->prepare("SELECT first_name, last_name FROM users WHERE id = ? AND account_type = 'customer'");
    $customer_check->execute([$customer_id]);
    $customer = $customer_check->fetch(PDO::FETCH_ASSOC);
    
    if (!$customer) {
        echo json_encode(['success' => false, 'message' => 'Customer not found']);
        exit;
    }
    
    // Check if payment plan already exists for this lot-customer combination
    $existing_check = $pdo->prepare("SELECT id FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status != 'cancelled'");
    $existing_check->execute([$lot_id, $customer_id]);
    
    if ($existing_check->fetch()) {
        echo json_encode(['success' => false, 'message' => 'Payment plan already exists for this lot and customer']);
        exit;
    }
    
    // Simple calculation logic
    $start_date = date('Y-m-d');
    
    if ($payment_term_months == 0) {
        // FULLY PAID - Simple case
        $monthly_amount = 0;
        $end_date = null;
        $status = 'completed';
        $remaining_balance = 0;
        // keep provided down_payment but it should normally be 0; authoritative paid record is inserted below
    } else {
        // INSTALLMENT PLAN - Compute monthly using interest logic used in Add Ownership UI
        $principal_remaining = max(0, $total_amount - $down_payment);

        // Load interest configuration
        $cfg = [
            'interest_1year' => 0,
            'interest_2year' => 0,
            'interest_3year' => 0,
            'interest_4year' => 0,
            'interest_5year' => 0,
        ];
        try {
            $stmt = $pdo->query("SELECT interest_1year, interest_2year, interest_3year, interest_4year, interest_5year FROM lot_prices ORDER BY id DESC LIMIT 1");
            if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                foreach ($cfg as $k => $_) {
                    if (isset($row[$k])) { $cfg[$k] = (float)$row[$k]; }
                }
            }
        } catch (Throwable $e) { /* defaults already set */ }

        // Map months to years
        $years = 1;
        if ($payment_term_months === 12) { $years = 1; }
        else if ($payment_term_months === 24) { $years = 2; }
        else if ($payment_term_months === 36) { $years = 3; }
        else if ($payment_term_months === 48) { $years = 4; }
        else if ($payment_term_months === 60) { $years = 5; }
        else { $years = (int)ceil($payment_term_months / 12); }

        $annual_interest_percent = 0.0;
        if ($years === 1) { $annual_interest_percent = (float)$cfg['interest_1year']; }
        else if ($years === 2) { $annual_interest_percent = (float)$cfg['interest_2year']; }
        else if ($years === 3) { $annual_interest_percent = (float)$cfg['interest_3year']; }
        else if ($years === 4) { $annual_interest_percent = (float)$cfg['interest_4year']; }
        else if ($years >= 5) { $annual_interest_percent = (float)$cfg['interest_5year']; }

        $total_interest_percent = $annual_interest_percent * $years; // simple total interest across the term
        $total_interest_rate = $total_interest_percent / 100.0;

        $interest_amount = $principal_remaining * $total_interest_rate;
        $total_with_interest = $principal_remaining + $interest_amount;

        $monthly_amount = round(($payment_term_months > 0 ? ($total_with_interest / $payment_term_months) : 0), 2);
        $remaining_balance = round($total_with_interest, 2);
        $end_date = date('Y-m-d', strtotime("+$payment_term_months months", strtotime($start_date)));
        $status = 'active';
    }
    
    // Detect if due_day column exists (for legacy databases)
    $has_due_day_column = false;
    try {
        $col_check = $pdo->query("SHOW COLUMNS FROM payment_plans LIKE 'due_day'");
        $has_due_day_column = $col_check->rowCount() > 0;
    } catch (Throwable $e) {
        $has_due_day_column = false;
    }
    
    // Start transaction
    $pdo->beginTransaction();
    
    try {
        // Create payment plan (auto-detect due_day column to avoid schema conflicts)
        $plan_columns = "lot_id, customer_id, total_amount, down_payment, monthly_amount, payment_term_months, start_date, end_date, status, remaining_balance, created_by, notes";
        $plan_placeholders = "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";
        $plan_values = [
            $lot_id, $customer_id, $total_amount, $down_payment, $monthly_amount, $payment_term_months,
            $start_date, $end_date, $status, $remaining_balance, $admin_id, $notes
        ];
        
        if ($has_due_day_column) {
            $plan_columns .= ", due_day";
            $plan_placeholders .= ", ?";
            $plan_values[] = $due_day;
        }
        
        $plan_sql = "INSERT INTO payment_plans ($plan_columns) VALUES ($plan_placeholders)";
        $plan_stmt = $pdo->prepare($plan_sql);
        $plan_stmt->execute($plan_values);
        
        $payment_plan_id = $pdo->lastInsertId();
        
        // Create payment schedule ONLY for installment plans (not fully paid)
        if ($payment_term_months > 0 && $status === 'active') {
            // Helper function to get the closest valid day in a month
            $getDueDate = function($base_date, $target_day) {
                $date = new DateTime($base_date);
                $year = (int)$date->format('Y');
                $month = (int)$date->format('m');
                $days_in_month = (int)$date->format('t'); // Last day of month
                
                // If target day exceeds days in month, use the last day
                $day = min($target_day, $days_in_month);
                
                return sprintf('%04d-%02d-%02d', $year, $month, $day);
            };
            
            for ($month = 1; $month <= $payment_term_months; $month++) {
                // Calculate base date (first day of target month)
                $base_date = date('Y-m-01', strtotime("+$month months", strtotime($start_date)));
                
                // Use custom due_day if provided, otherwise default to 15th
                $target_day = $due_day !== null ? $due_day : 15;
                $due_date = $getDueDate($base_date, $target_day);
                
                // For 2-split down payment: keep monthly the same, but add the other half of DP to the first month's due
                $amount_due = $monthly_amount;
                if ($month === 1 && $down_payment_split && $down_payment > 0) {
                    $amount_due = round($monthly_amount + ($down_payment / 2), 2);
                }

                $schedule_sql = "INSERT INTO payment_plan_schedule (payment_plan_id, month_number, due_date, amount_due) 
                                VALUES (?, ?, ?, ?)";
                $schedule_stmt = $pdo->prepare($schedule_sql);
                $schedule_stmt->execute([$payment_plan_id, $month, $due_date, $amount_due]);
            }
            // Ensure no lingering full-payment seed exists for this lot when switching to installment
            try {
                $del_seed = $pdo->prepare("DELETE FROM payment_records WHERE lot_id = ? AND notes = 'Full payment - seed'");
                $del_seed->execute([$lot_id]);
            } catch (Throwable $e) { /* ignore */ }
        }
        
        // Update lot ownership
        $lot_update = $pdo->prepare("UPDATE lots SET customer_id = ?, status = 'reserved' WHERE id = ?");
        $lot_update->execute([$customer_id, $lot_id]);
        
        // Record activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_details = "Payment plan created for lot {$lot['garden_name']}-{$lot['sector_name']}-{$lot['lot_number']} - Customer: {$customer['first_name']} {$customer['last_name']} - Total: ₱" . number_format($total_amount, 2) . ($down_payment > 0 ? " - Down Payment: ₱" . number_format($down_payment, 2) : "") . " - Term: " . ($payment_term_months > 0 ? "$payment_term_months months" : "Fully Paid");
        
        $activity_stmt->execute([
            'Created',
            'Payment Plan',
            $activity_details,
            $admin_id,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
        
        // For fully paid, create a single payment record matching the plan total for history and summaries
        if ($payment_term_months == 0) {
            try {
                $pr_sql = "INSERT INTO payment_records (lot_id, owner_name, contact, section, payment_amount, payment_method, payment_due_date, last_payment_date, status, payment_date, notes) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $pr_stmt = $pdo->prepare($pr_sql);
                $pr_stmt->execute([
                    $lot_id,
                    trim(($customer['first_name'] ?? '') . ' ' . ($customer['last_name'] ?? '')),
                    $customer['contact_number'] ?? '',
                    'Cash Payment',
                    $total_amount,
                    'Cash',
                    $start_date,
                    $start_date,
                    'Paid',
                    date('Y-m-d'),
                    'Full payment - seed'
                ]);
                
                // Send email receipt for fully paid plans (At need and Spot cash)
                $payment_record_id = $pdo->lastInsertId();
                if ($payment_record_id) {
                    try {
                        send_payment_receipt_email($payment_record_id);
                    } catch (Throwable $e) { 
                        // Non-fatal; log but don't fail the transaction
                        error_log('Failed to send email receipt for payment plan: ' . $e->getMessage());
                    }
                }
            } catch (Throwable $e) { /* ignore */ }
        }

        $pdo->commit();
        
        echo json_encode([
            'success' => true,
            'message' => 'Payment plan created successfully',
            'payment_plan_id' => $payment_plan_id,
            'details' => [
                'total_amount' => $total_amount,
                'monthly_amount' => $monthly_amount,
                'payment_term_months' => $payment_term_months,
                'start_date' => $start_date,
                'end_date' => $end_date
            ]
        ]);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
    
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
?>
