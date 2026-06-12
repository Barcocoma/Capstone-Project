<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

global $pdo;

try {
    // Get all customers with each lot as a separate row
    $sql = "SELECT 
                u.id,
                u.first_name,
                u.middle_name,
                u.last_name,
                u.contact_number,
                u.email,
                CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name) as full_name,
                
                -- Individual lot information
                l.id as lot_id,
                l.lot_number,
                l.status as lot_status,
                l.purchase_date,
                CONCAT(
                    LEFT(g.name, 1),
                    s.name,
                    b.block_number,
                    '-',
                    l.lot_number
                ) as lot_details,
                
                -- Payment information for this specific lot
                COALESCE(SUM(CASE WHEN pr.status = 'Paid' THEN pr.payment_amount ELSE 0 END), 0) as total_paid,
                COALESCE(SUM(CASE WHEN pr.status = 'Pending' THEN pr.payment_amount ELSE 0 END), 0) as pending_amount,
                COALESCE(SUM(CASE WHEN pr.status = 'Overdue' THEN pr.payment_amount ELSE 0 END), 0) as overdue_amount,
                COUNT(CASE WHEN pr.status = 'Paid' THEN 1 END) as paid_payments_count,
                COUNT(CASE WHEN pr.status = 'Pending' THEN 1 END) as pending_payments_count,
                COUNT(CASE WHEN pr.status = 'Overdue' THEN 1 END) as overdue_payments_count
                
            FROM users u
            LEFT JOIN lots l ON u.id = l.customer_id AND l.deleted_at IS NULL
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            LEFT JOIN gardens g ON s.garden_id = g.id
            LEFT JOIN payment_records pr ON CAST(pr.lot_id AS UNSIGNED) = l.id AND pr.deleted_at IS NULL
            WHERE u.account_type = 'customer' AND u.deleted_at IS NULL
            GROUP BY u.id, u.first_name, u.middle_name, u.last_name, u.contact_number, u.email, l.id, l.lot_number, l.status, l.purchase_date, g.name, s.name
            ORDER BY u.first_name, u.last_name, g.name, s.name, l.lot_number";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $customers = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Skip if no lot assigned
        if (!$row['lot_id']) {
            // Add customer with no lots
            $customers[] = [
                'id' => $row['id'],
                'full_name' => trim($row['full_name']),
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'contact_number' => $row['contact_number'],
                'email' => $row['email'],
                'lot_details' => 'No lots assigned',
                'lot_status' => 'No Lots',
                'payment_status' => 'No Payments',
                'total_paid' => 0,
                'pending_amount' => 0,
                'overdue_amount' => 0,
                'customer_status' => 'Inactive'
            ];
            continue;
        }
        
        // Get simplified payment status for this specific lot
        $payment_status = 'No Payments';
        
        // Check if this lot has a payment plan (prefer latest active/non-cancelled)
        $payment_plan_sql = "SELECT id, payment_term_months FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1";
        $plan_stmt = $pdo->prepare($payment_plan_sql);
        $plan_stmt->execute([$row['lot_id'], $row['id']]);
        $payment_plan = $plan_stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($payment_plan && (int)$payment_plan['payment_term_months'] > 0) {
            // Installment plan: compute progress from schedule; also compute total paid from payment_records limited to monthly payments
            $plan_id = (int)$payment_plan['id'];
            $total_months = (int)$payment_plan['payment_term_months'];
            $sched_paid = 0; $sched_total = 0;
            try {
                $q1 = $pdo->prepare("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = ? AND status = 'paid'");
                $q1->execute([$plan_id]);
                $sched_paid = (int)$q1->fetchColumn();
                $q2 = $pdo->prepare("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = ?");
                $q2->execute([$plan_id]);
                $sched_total = (int)$q2->fetchColumn();
                if ($sched_total <= 0) { $sched_total = $total_months; }
            } catch (Throwable $e) {}
            if ($sched_total <= 0) { $sched_total = $total_months; }

            // Total paid strictly from the schedule itself: sum amount_due for rows marked paid
            // This avoids edge-cases where a payment record's month/date formatting does not
            // exactly match the schedule month, which previously caused under-counting (e.g. 2/12 but ₱6k only).
            $sum_sql = "SELECT COALESCE(SUM(amount_due), 0)
                        FROM payment_plan_schedule
                        WHERE payment_plan_id = ? AND status = 'paid'";
            $sum_stmt = $pdo->prepare($sum_sql);
            $sum_stmt->execute([$plan_id]);
            $installment_paid_total = (float)$sum_stmt->fetchColumn();

            // Fallback: if no schedule rows are marked paid yet (e.g., plan still 'pending'),
            // infer progress and total from payment_records months that match the schedule.
            if ($sched_paid === 0 || $installment_paid_total <= 0.0) {
                // Count distinct paid months that intersect with this plan's schedule
                $qFallbackCount = $pdo->prepare(
                    "SELECT COUNT(DISTINCT DATE_FORMAT(pr.payment_date, '%Y-%m'))
                     FROM payment_records pr
                     WHERE pr.lot_id = ? AND pr.status = 'Paid' AND EXISTS (
                       SELECT 1 FROM payment_plan_schedule sch
                       WHERE sch.payment_plan_id = ? AND DATE_FORMAT(pr.payment_date, '%Y-%m') = DATE_FORMAT(sch.due_date, '%Y-%m')
                     )"
                );
                $qFallbackCount->execute([$row['lot_id'], $plan_id]);
                $derivedCount = (int)$qFallbackCount->fetchColumn();
                if ($derivedCount > $sched_paid) { $sched_paid = $derivedCount; }

                // Sum the scheduled amounts for those months to keep totals consistent with the plan
                $qFallbackAmt = $pdo->prepare(
                    "SELECT COALESCE(SUM(sch.amount_due),0) FROM payment_plan_schedule sch
                     WHERE sch.payment_plan_id = ? AND DATE_FORMAT(sch.due_date, '%Y-%m') IN (
                       SELECT DISTINCT DATE_FORMAT(pr.payment_date, '%Y-%m')
                       FROM payment_records pr
                       WHERE pr.lot_id = ? AND pr.status = 'Paid'
                     )"
                );
                $qFallbackAmt->execute([$plan_id, $row['lot_id']]);
                $derivedAmt = (float)$qFallbackAmt->fetchColumn();
                if ($derivedAmt > $installment_paid_total) { $installment_paid_total = $derivedAmt; }
            }

            // Cap total paid to plan total (down payment + remaining)
            $cap_sql = $pdo->prepare("SELECT total_amount FROM payment_plans WHERE id = ?");
            $cap_sql->execute([$plan_id]);
            $plan_total = (float)$cap_sql->fetchColumn();
            if ($installment_paid_total > $plan_total) { $installment_paid_total = $plan_total; }

            $payment_status = ($sched_paid >= $sched_total && $sched_total > 0)
                ? 'Fully Paid'
                : ("Installment " . max(0, $sched_paid) . "/" . max(1, $sched_total));

            // Override amount fields for display consistency
            $row['total_paid'] = $installment_paid_total;
        } else {
            // No installment plan: treat as fully paid only if there is a full payment record in history
            $is_fully_paid = false;
            $sum_paid = 0.0;
            try {
                // Prefer explicit full payment record
                $chk = $pdo->prepare("SELECT COUNT(*) FROM payment_records WHERE lot_id = ? AND notes = 'Full payment - seed' AND status='Paid'");
                $chk->execute([$row['lot_id']]);
                $is_fully_paid = ((int)$chk->fetchColumn()) > 0;
                if ($is_fully_paid) {
                    $sum = $pdo->prepare("SELECT COALESCE(SUM(payment_amount),0) FROM payment_records WHERE lot_id = ? AND status='Paid'");
                    $sum->execute([$row['lot_id']]);
                    $sum_paid = (float)$sum->fetchColumn();
                }
            } catch (Throwable $e) {}
            $payment_status = $is_fully_paid ? 'Fully Paid' : 'No Payments';
            if ($is_fully_paid) {
                $row['total_paid'] = $sum_paid;
            }
        }
        
        $customers[] = [
            'id' => $row['id'],
            'lot_id' => $row['lot_id'],
            'full_name' => trim($row['full_name']),
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'contact_number' => $row['contact_number'],
            'email' => $row['email'],
            
            // Individual lot details - simplified format like "JA1-1"
            'lot_details' => $row['lot_details'],
            'lot_status' => $row['lot_status'] ? ucfirst($row['lot_status']) : 'Unknown',
            
            // Payment summary for this specific lot
            'payment_status' => $payment_status,
            'total_paid' => (float)$row['total_paid'],
            'pending_amount' => (float)$row['pending_amount'],
            'overdue_amount' => (float)$row['overdue_amount'],
            
            // Overall status
            'customer_status' => 'Active',
            'row_key' => $row['id'] . '-' . $row['lot_id']
        ];
    }
    
    echo json_encode([
        'success' => true,
        'customers' => $customers,
        'total_customers' => count($customers)
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error fetching customer data: ' . $e->getMessage()
    ]);
}
?>
