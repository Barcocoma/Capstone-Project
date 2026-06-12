<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    $customer_id = $_SERVER['HTTP_X_USER_ID'] ?? $_GET['customer_id'] ?? null;
    
    if (!$customer_id) {
        echo json_encode(['success' => false, 'message' => 'Customer ID required']);
        exit;
    }
    
    // Get customer's payment plans with lot details
    $sql = "SELECT 
                pp.*,
                l.lot_number,
                b.block_number,
                s.name as sector_name,
                g.name as garden_name,
                CONCAT(
                    LEFT(g.name, 1), 
                    s.name, 
                    b.block_number, 
                    '-', 
                    l.lot_number
                ) as lot_display,
                u.first_name,
                u.last_name
            FROM payment_plans pp
            JOIN lots l ON pp.lot_id = l.id
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            LEFT JOIN gardens g ON s.garden_id = g.id
            JOIN users u ON pp.customer_id = u.id
            WHERE pp.customer_id = ?
            ORDER BY pp.created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$customer_id]);
    $payment_plans = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $result = [];
    
    foreach ($payment_plans as $plan) {
        // Get payment schedule for this plan
        $schedule_sql = "SELECT * FROM payment_plan_schedule 
                        WHERE payment_plan_id = ? 
                        ORDER BY month_number";
        $schedule_stmt = $pdo->prepare($schedule_sql);
        $schedule_stmt->execute([$plan['id']]);
        $schedule = $schedule_stmt->fetchAll(PDO::FETCH_ASSOC);

        // Derive progress from schedule and plan amounts
        $months_paid = 0;
        $paid_amount_sum = 0.0;
        foreach ($schedule as $row) {
            if (strtolower($row['status']) === 'paid') {
                $months_paid++;
                $paid_amount_sum += floatval($row['amount_due']);
            }
        }
        $total_months = intval($plan['payment_term_months']);
        $monthly_amount = floatval($plan['monthly_amount']);
        $down_payment = floatval($plan['down_payment'] ?? 0);
        // Sum actual paid schedule amounts to account for first-month extra in split DP
        $amount_paid = $down_payment + $paid_amount_sum;
        $remaining_balance = max(0, floatval($plan['total_amount']) - $amount_paid);
        $progress = [
            'total_months' => $total_months,
            'months_paid' => $months_paid,
            'months_remaining' => max(0, $total_months - $months_paid),
            'amount_paid' => $amount_paid,
            'remaining_balance' => $remaining_balance,
            'percentage_complete' => $total_months > 0 ? round(($months_paid / $total_months) * 100, 1) : 100
        ];
        
        // Get overdue payments
        $overdue_sql = "SELECT COUNT(*) as overdue_count 
                       FROM payment_plan_schedule 
                       WHERE payment_plan_id = ? 
                       AND status = 'pending' 
                       AND due_date < CURDATE()";
        $overdue_stmt = $pdo->prepare($overdue_sql);
        $overdue_stmt->execute([$plan['id']]);
        $overdue_result = $overdue_stmt->fetch(PDO::FETCH_ASSOC);
        
        // Get next payment due
        $next_payment_sql = "SELECT * FROM payment_plan_schedule 
                            WHERE payment_plan_id = ? 
                            AND status = 'pending' 
                            ORDER BY due_date ASC 
                            LIMIT 1";
        $next_payment_stmt = $pdo->prepare($next_payment_sql);
        $next_payment_stmt->execute([$plan['id']]);
        $next_payment = $next_payment_stmt->fetch(PDO::FETCH_ASSOC);
        
        $result[] = [
            'id' => $plan['id'],
            'lot_id' => $plan['lot_id'],
            'lot_display' => $plan['lot_display'],
            'lot_details' => [
                'garden' => $plan['garden_name'],
                'sector' => $plan['sector_name'],
                'block' => $plan['block_number'],
                'lot_number' => $plan['lot_number']
            ],
            'total_amount' => floatval($plan['total_amount']),
            'down_payment' => floatval($plan['down_payment'] ?? 0),
            'monthly_amount' => floatval($plan['monthly_amount']),
            'payment_term_months' => intval($plan['payment_term_months']),
            'start_date' => $plan['start_date'],
            'end_date' => $plan['end_date'],
            'status' => $plan['status'],
            'progress' => $progress,
            'overdue_payments' => intval($overdue_result['overdue_count']),
            'next_payment' => $next_payment,
            'schedule' => $schedule,
            'notes' => $plan['notes'],
            'created_at' => $plan['created_at']
        ];
    }
    
    // Get summary statistics
    $summary = [
        'total_plans' => count($result),
        'active_plans' => count(array_filter($result, fn($p) => $p['status'] === 'active')),
        'completed_plans' => count(array_filter($result, fn($p) => $p['status'] === 'completed')),
        'total_amount_owed' => array_sum(array_column($result, 'total_amount')),
        'total_paid' => array_sum(array_map(fn($p) => $p['progress']['amount_paid'], $result)),
        'total_remaining' => array_sum(array_map(fn($p) => $p['progress']['remaining_balance'], $result)),
        'overdue_payments' => array_sum(array_column($result, 'overdue_payments'))
    ];
    
    echo json_encode([
        'success' => true,
        'payment_plans' => $result,
        'summary' => $summary
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
