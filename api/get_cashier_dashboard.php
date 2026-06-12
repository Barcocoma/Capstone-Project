<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    // Get user ID from header
    $user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    if (!$user_id) {
        echo json_encode(['success' => false, 'message' => 'User ID not provided']);
        exit;
    }

    // Get cashier info
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND account_type = 'cashier'");
    $stmt->execute([$user_id]);
    $cashier = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$cashier) {
        echo json_encode(['success' => false, 'message' => 'Cashier not found']);
        exit;
    }

    // Get today's date for filtering
    $today = date('Y-m-d');
    $current_month = date('Y-m');

    // 1. Total Collected Today - Include ALL payment types (at need, down payments, monthly payments)
    // Filter by created_date to include installment payments made today
    $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(payment_amount), 0) as total_collected_today
        FROM payment_records 
        WHERE DATE(created_at) = ? 
        AND payment_method IN ('Cash','GCash','Maya','Check')
    ");
    $stmt->execute([$today]);
    $today_stats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 2. Customers Served Today - Count distinct customers by customer_id from lots
    // This ensures each customer is counted only once, regardless of how many payments they made
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT l.customer_id) as customers_served_today
        FROM payment_records pr
        INNER JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id
        WHERE DATE(pr.created_at) = ?
        AND pr.payment_method IN ('Cash','GCash','Maya','Check')
        AND l.customer_id IS NOT NULL
    ");
    $stmt->execute([$today]);
    $customers_today = $stmt->fetch(PDO::FETCH_ASSOC);

    // 3. Overdue Payments (monthly payments that are past due)
    $stmt = $pdo->prepare("
        SELECT COUNT(DISTINCT l.customer_id) as overdue_customers
        FROM lots l
        LEFT JOIN payment_records pr ON CAST(pr.lot_id AS UNSIGNED) = l.id 
            AND DATE_FORMAT(pr.payment_date, '%Y-%m') = ?
        WHERE pr.id IS NULL
        AND l.customer_id IS NOT NULL
        AND l.status IN ('reserved', 'occupied')
    ");
    $stmt->execute([$current_month]);
    $overdue_stats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 4. Total Transactions Today - Include ALL payment types
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as transactions_today
        FROM payment_records 
        WHERE DATE(created_at) = ?
        AND payment_method IN ('Cash','GCash','Maya','Check')
    ");
    $stmt->execute([$today]);
    $transactions_today = $stmt->fetch(PDO::FETCH_ASSOC);

    // 5. Recent Payments (last 10 on-site payments) - Include ALL payment types
    // Use created_at for accurate timestamp (when payment was actually processed)
    // Get current owner name from users table (not from payment_records.owner_name) 
    // to reflect ownership transfers correctly
    $stmt = $pdo->prepare("
        SELECT 
            pr.*,
            pr.created_at as payment_timestamp,
            l.lot_number,
            b.block_number,
            s.name as sector_name,
            g.name as garden_name,
            CONCAT(s.name, '-', l.lot_number) as lot_display,
            TRIM(CONCAT_WS(' ', 
                u.first_name, 
                u.middle_name, 
                u.last_name
            )) as owner_name
        FROM payment_records pr
        LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id
        LEFT JOIN users u ON l.customer_id = u.id
        LEFT JOIN blocks b ON l.block_id = b.id
        LEFT JOIN sectors s ON b.sector_id = s.id
        LEFT JOIN gardens g ON s.garden_id = g.id
        WHERE pr.payment_method IN ('Cash','GCash','Maya','Check')
        ORDER BY pr.created_at DESC
        LIMIT 10
    ");
    $stmt->execute();
    $recent_payments = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 6. Weekly Statistics - Include ALL payment types
    $week_start = date('Y-m-d', strtotime('monday this week'));
    $week_end = date('Y-m-d', strtotime('sunday this week'));
    $stmt = $pdo->prepare("
        SELECT 
            COUNT(*) as total_transactions_week,
            COALESCE(SUM(payment_amount), 0) as total_collected_week
        FROM payment_records 
        WHERE DATE(created_at) BETWEEN ? AND ?
        AND payment_method IN ('Cash','GCash','Maya','Check')
    ");
    $stmt->execute([$week_start, $week_end]);
    $weekly_stats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 7. Monthly Statistics - Include ALL payment types
    // Use created_at (when payment was actually processed) instead of payment_date
    // This ensures we count all payments made this month, not just payments assigned to this month
    $month_start = date('Y-m-01');
    $month_end = date('Y-m-t'); // Last day of current month
    $stmt = $pdo->prepare("
        SELECT 
            COUNT(*) as total_transactions_month,
            COALESCE(SUM(payment_amount), 0) as total_collected_month
        FROM payment_records 
        WHERE DATE(created_at) BETWEEN ? AND ?
        AND payment_method IN ('Cash','GCash','Maya','Check')
    ");
    $stmt->execute([$month_start, $month_end]);
    $monthly_stats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 8. Customer Statistics
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as total_customers
        FROM users 
        WHERE account_type = 'customer'
    ");
    $stmt->execute();
    $customer_stats = $stmt->fetch(PDO::FETCH_ASSOC);

    // 9. Payment Method Breakdown (Today) - Include ALL payment types
    $stmt = $pdo->prepare("
        SELECT 
            payment_method,
            COUNT(*) as count,
            COALESCE(SUM(payment_amount), 0) as total_amount
        FROM payment_records 
        WHERE DATE(created_at) = ?
        AND payment_method IN ('Cash','GCash','Maya','Check')
        GROUP BY payment_method
    ");
    $stmt->execute([$today]);
    $payment_methods = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Prepare response
    $response = [
        'success' => true,
        'cashier_info' => [
            'id' => $cashier['id'],
            'name' => $cashier['first_name'] . ' ' . $cashier['last_name'],
            'username' => $cashier['username'],
            'email' => $cashier['email']
        ],
        'stats' => [
            'total_collected_today' => (float)$today_stats['total_collected_today'],
            'customers_served_today' => (int)$customers_today['customers_served_today'],
            'overdue_customers' => (int)$overdue_stats['overdue_customers'],
            'transactions_today' => (int)$transactions_today['transactions_today'],
            'total_collected_week' => (float)$weekly_stats['total_collected_week'],
            'transactions_week' => (int)$weekly_stats['total_transactions_week'],
            'total_collected_month' => (float)$monthly_stats['total_collected_month'],
            'total_transactions_month' => (int)$monthly_stats['total_transactions_month'],
            'total_customers' => (int)$customer_stats['total_customers']
        ],
        'recent_payments' => $recent_payments,
        'payment_methods' => $payment_methods,
        'date_info' => [
            'today' => $today,
            'current_month' => date('F Y'),
            'current_time' => date('Y-m-d H:i:s')
        ]
    ];

    echo json_encode($response);

} catch (Exception $e) {
    error_log("Cashier Dashboard API Error: " . $e->getMessage());
    echo json_encode([
        'success' => false, 
        'message' => 'Error loading cashier dashboard data: ' . $e->getMessage()
    ]);
}
?>
