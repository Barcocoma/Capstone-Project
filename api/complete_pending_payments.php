<?php
require_once 'config.php';
require_once __DIR__ . '/payment_schedule_helper.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    // Get all pending payment sessions
    $stmt = $pdo->prepare("SELECT * FROM payment_sessions WHERE status = 'pending' ORDER BY created_at ASC");
    $stmt->execute();
    $pending_sessions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $completed_count = 0;
    
    foreach ($pending_sessions as $session) {
        try {
            // Get customer info
            $customer_sql = "SELECT first_name, last_name, contact_number FROM users WHERE id = ?";
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
            
            // Check if payment record already exists for this checkout session
            $existing_payment_sql = "SELECT id FROM payment_records WHERE notes LIKE ? LIMIT 1";
            $existing_payment_stmt = $pdo->prepare($existing_payment_sql);
            $existing_payment_stmt->execute(['%Session: ' . $session['checkout_id'] . '%']);
            $existing_payment = $existing_payment_stmt->fetch(PDO::FETCH_ASSOC);
            
            // Only insert payment record if it doesn't already exist
            if (!$existing_payment) {
                // Insert payment record
                $payment_sql = "INSERT INTO payment_records (lot_id, owner_name, contact, section, payment_amount, 
                               payment_method, payment_due_date, last_payment_date, status, payment_date, notes) 
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                
                $payment_stmt = $pdo->prepare($payment_sql);
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
                    'Auto-completed payment - Session: ' . $session['checkout_id']
                ]);
            }
            
            // Update session status
            $update_sql = "UPDATE payment_sessions SET status = 'paid', updated_at = NOW() WHERE id = ?";
            $update_stmt = $pdo->prepare($update_sql);
            $update_stmt->execute([$session['id']]);
            
            // If this was a monthly payment tied to a plan, mark schedule as paid and complete plan if finished
            try {
                if (!empty($session['payment_month'])) {
                    $plan_q = $pdo->prepare("SELECT id FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
                    $plan_q->execute([$session['lot_id'], $session['customer_id']]);
                    if ($plan = $plan_q->fetch(PDO::FETCH_ASSOC)) {
                        $plan_id = (int)$plan['id'];
                        $upd_sched = $pdo->prepare("UPDATE payment_plan_schedule SET status = 'paid', updated_at = NOW() WHERE payment_plan_id = ? AND DATE_FORMAT(due_date, '%Y-%m') = ?");
                        $upd_sched->execute([$plan_id, $session['payment_month']]);
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
            } catch (Throwable $e) {
                // ignore and continue
            }
            
            $completed_count++;
            
        } catch (Exception $e) {
            error_log("Error completing payment session {$session['id']}: " . $e->getMessage());
        }
    }
    
    echo json_encode([
        'success' => true,
        'message' => "Completed $completed_count pending payments",
        'completed_count' => $completed_count
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
