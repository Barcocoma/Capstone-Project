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

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    $required_fields = ['customer_id', 'amount', 'payment_method', 'payment_type'];
    foreach ($required_fields as $field) {
        if (!isset($data[$field]) || empty($data[$field])) {
            echo json_encode([
                'success' => false,
                'message' => "Missing required field: $field"
            ]);
            exit;
        }
    }
    
    $customer_id = $data['customer_id'];
    $amount = floatval($data['amount']);
    $payment_method = $data['payment_method'];
    if (!in_array($payment_method, ['Cash','GCash','Maya'], true)) {
        $payment_method = 'Cash';
    }
    $payment_type = $data['payment_type']; // "general" or "monthly"
    $notes = $data['notes'] ?? '';
    $cashier_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    // Validate amount
    if ($amount <= 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Payment amount must be greater than zero'
        ]);
        exit;
    }
    
    // Get customer information
    $customer_sql = "SELECT u.first_name, u.last_name, u.contact_number 
                     FROM users u 
                     WHERE u.id = ? AND u.account_type = 'customer'";
    $customer_stmt = $pdo->prepare($customer_sql);
    $customer_stmt->execute([$customer_id]);
    $customer = $customer_stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$customer) {
        echo json_encode([
            'success' => false,
            'message' => 'Customer not found'
        ]);
        exit;
    }
    
    $owner_name = trim($customer['first_name'] . ' ' . $customer['last_name']);
    $contact = $customer['contact_number'];
    
    // Handle different payment types
    if ($payment_type === 'monthly') {
        // Monthly payment - requires lot_id and payment_month
        if (!isset($data['lot_id']) || !isset($data['payment_month'])) {
            echo json_encode([
                'success' => false,
                'message' => 'Monthly payments require lot_id and payment_month'
            ]);
            exit;
        }
        
        $lot_id = $data['lot_id'];
        $payment_month = $data['payment_month']; // Format: YYYY-MM
        
        // Validate lot belongs to customer
        $lot_check_sql = "SELECT id FROM lots WHERE id = ? AND customer_id = ?";
        $lot_check_stmt = $pdo->prepare($lot_check_sql);
        $lot_check_stmt->execute([$lot_id, $customer_id]);
        
        if (!$lot_check_stmt->fetch()) {
            echo json_encode([
                'success' => false,
                'message' => 'Invalid lot selection for this customer'
            ]);
            exit;
        }
        
        // Check if payment for this month already exists
        $existing_payment_sql = "SELECT id FROM payment_records 
                                WHERE lot_id = ? 
                                AND DATE_FORMAT(payment_date, '%Y-%m') = ? 
                                AND status = 'Paid'";
        $existing_payment_stmt = $pdo->prepare($existing_payment_sql);
        $existing_payment_stmt->execute([$lot_id, $payment_month]);
        
        if ($existing_payment_stmt->fetch()) {
            echo json_encode([
                'success' => false,
                'message' => 'Payment for this month already exists'
            ]);
            exit;
        }
        
        // Set payment date to mid-month of the selected month
        $scheduled_due_date = get_payment_schedule_due_date($lot_id, $customer_id, $payment_month);
        $resolved_due_date = $scheduled_due_date ?: date('Y-m-d', strtotime($payment_month . '-01'));
        $payment_date = $resolved_due_date; // DATE column, not DATETIME
        $due_date = $resolved_due_date;
        $last_payment_date = $resolved_due_date;
        
        $notes = "Cashier Payment - Monthly Payment for " . date('F Y', strtotime($payment_month)) . 
                ($notes ? " - " . $notes : "");
        
    } else {
        // General payment - use first available lot or allow null
        $lot_sql = "SELECT id FROM lots WHERE customer_id = ? LIMIT 1";
        $lot_stmt = $pdo->prepare($lot_sql);
        $lot_stmt->execute([$customer_id]);
        $lot_result = $lot_stmt->fetch(PDO::FETCH_ASSOC);
        
        $lot_id = $lot_result ? $lot_result['id'] : null;
        $payment_date = date('Y-m-d');
        $due_date = date('Y-m-d');
        $last_payment_date = date('Y-m-d');
        
        $notes = "Cashier Payment - General Payment" . ($notes ? " - " . $notes : "");
    }
    
    // Insert payment record
    $payment_sql = "INSERT INTO payment_records 
                   (lot_id, owner_name, contact, section, payment_amount, payment_method, 
                    payment_due_date, last_payment_date, status, payment_date, notes) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $payment_stmt = $pdo->prepare($payment_sql);
    $success = $payment_stmt->execute([
        $lot_id,
        $owner_name,
        $contact,
        'Cashier Transaction',
        $amount,
        $payment_method,
        $due_date,
        $last_payment_date,
        'Paid',
        $payment_date,
        $notes
    ]);
    
    if ($success) {
        $payment_id = $pdo->lastInsertId();
        
        // If this is a monthly payment tied to a plan, mark the schedule as paid and auto-complete plan when done
        if ($payment_type === 'monthly') {
            try {
                // Find active plan for this lot/customer
                $plan_q = $pdo->prepare("SELECT id, payment_term_months FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
                $plan_q->execute([$lot_id, $customer_id]);
                if ($plan = $plan_q->fetch(PDO::FETCH_ASSOC)) {
                    $plan_id = (int)$plan['id'];
                    // Mark schedule row as paid for the matching month (by year-month)
                    $upd_sched = $pdo->prepare("UPDATE payment_plan_schedule SET status = 'paid', updated_at = NOW() WHERE payment_plan_id = ? AND DATE_FORMAT(due_date, '%Y-%m') = ?");
                    $upd_sched->execute([$plan_id, $payment_month]);
                    // Check progress
                    $cnt_total = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id)->fetchColumn();
                    $cnt_paid = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id . " AND status = 'paid'")->fetchColumn();
                    if ($cnt_total > 0 && $cnt_paid >= $cnt_total) {
                        // Mark plan completed
                        $pdo->prepare("UPDATE payment_plans SET status='completed', remaining_balance = 0, updated_at = NOW() WHERE id = ?")->execute([$plan_id]);
                    } else {
                        // Reduce remaining balance by this payment amount
                        $pdo->prepare("UPDATE payment_plans SET remaining_balance = GREATEST(remaining_balance - ?, 0), updated_at = NOW() WHERE id = ?")->execute([$amount, $plan_id]);
                    }
                    
                    // Update delinquency_start_month (reset if all overdue cleared, set if first overdue)
                    update_delinquency_start_month($plan_id);
                }
            } catch (Throwable $e) {
                // Non-fatal; continue
            }
        }

        // Record activity log
        if ($cashier_id) {
            $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) 
                            VALUES (?, ?, ?, ?, ?, ?)";
            $activity_stmt = $pdo->prepare($activity_sql);
            $activity_stmt->execute([
                'Pay',
                'Payment Monitoring',
                "Cashier processed {$payment_type} payment for customer '{$owner_name}' - Amount: ₱{$amount} - Method: {$payment_method}" .
                ($payment_type === 'monthly' ? " - Month: {$payment_month}" : ""),
                $cashier_id,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]);
        }
        
        // Send email receipt (non-blocking, don't fail payment if email fails)
        try {
            // Check if customer has email
            $email_check = $pdo->prepare("SELECT email FROM users WHERE id = ?");
            $email_check->execute([$customer_id]);
            $customer_email = $email_check->fetchColumn();
            
            if ($customer_email) {
                // Load the email receipt function from create_f2f_payment.php
                // Since we can't easily include it, use email_receipt.php endpoint
                // Fire-and-forget: don't wait for response
                $email_url = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https://' : 'http://') . 
                            ($_SERVER['HTTP_HOST'] ?? 'localhost') . 
                            '/api/email_receipt.php';
                
                // Send in background (non-blocking)
                $post_data = json_encode(['payment_id' => $payment_id]);
                $context = stream_context_create([
                    'http' => [
                        'method' => 'POST',
                        'header' => 'Content-Type: application/json',
                        'content' => $post_data,
                        'timeout' => 5
                    ]
                ]);
                @file_get_contents($email_url, false, $context);
            }
        } catch (Throwable $e) {
            // Non-fatal: continue even if email fails
            error_log('Failed to send receipt email for payment ' . $payment_id . ': ' . $e->getMessage());
        }
        
        echo json_encode([
            'success' => true,
            'message' => 'Payment processed successfully',
            'payment_id' => $payment_id,
            'lot_id' => $lot_id,
            'payment_details' => [
                'amount' => $amount,
                'payment_method' => $payment_method,
                'payment_type' => $payment_type,
                'payment_date' => $payment_date,
                'customer_name' => $owner_name,
                'payment_month' => $payment_type === 'monthly' ? $payment_month : null
            ]
        ]);
        
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to process payment'
        ]);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}
?>

