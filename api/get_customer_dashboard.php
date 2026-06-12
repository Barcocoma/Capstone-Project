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

    // Get customer info
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $customer = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$customer) {
        echo json_encode(['success' => false, 'message' => 'Customer not found']);
        exit;
    }

    $customer_id = $customer['id'];

    // Get customer's lots with details
    $stmt = $pdo->prepare("
        SELECT 
            l.*,
            l.id as lot_id,
            b.block_number,
            s.name as sector_name,
            g.name as garden_name,
            CONCAT(s.name, '-', l.lot_number) as lot_display,
            CASE 
                WHEN l.status = 'occupied' THEN 'Occupied'
                WHEN l.status = 'reserved' THEN 'Reserved' 
                ELSE 'Available'
            END as status_display,
            CASE 
                WHEN l.vault_option = 'option1' THEN 'Standard Vault'
                WHEN l.vault_option = 'option2' THEN 'Premium Vault'
                WHEN l.vault_option = 'option3' THEN 'Deluxe Vault'
                ELSE 'No Vault Selected'
            END as vault_display
        FROM lots l
        JOIN blocks b ON l.block_id = b.id
        JOIN sectors s ON b.sector_id = s.id
        JOIN gardens g ON s.garden_id = g.id
        WHERE l.customer_id = ?
        ORDER BY g.name, s.name, l.lot_number
    ");
    $stmt->execute([$customer_id]);
    $lots = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get payment statistics
    $stmt = $pdo->prepare("
        SELECT 
            COUNT(*) as total_payments,
            COALESCE(SUM(payment_amount), 0) as total_paid_amount,
            MAX(payment_date) as last_payment_date
        FROM payment_records pr
        JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id
        WHERE l.customer_id = ?
    ");
    $stmt->execute([$customer_id]);
    $payment_stats = $stmt->fetch(PDO::FETCH_ASSOC);

    // Get recent payments (last 5)
    $stmt = $pdo->prepare("
        SELECT 
            pr.*,
            l.lot_number,
            b.block_number,
            s.name as sector_name,
            g.name as garden_name,
            CONCAT(s.name, '-', l.lot_number) as lot_display
        FROM payment_records pr
        JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id
        JOIN blocks b ON l.block_id = b.id
        JOIN sectors s ON b.sector_id = s.id
        JOIN gardens g ON s.garden_id = g.id
        WHERE l.customer_id = ?
        ORDER BY pr.payment_date DESC, pr.created_at DESC
        LIMIT 5
    ");
    $stmt->execute([$customer_id]);
    $recent_payments = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Calculate payments due (monthly payments)
    // Get account creation date to determine payment periods
    $account_created = new DateTime($customer['created_at']);
    $current_date = new DateTime();
    
    // Generate 12 months starting from account creation
    $months = [];
    $start_date = clone $account_created;
    $start_date->modify('first day of this month');
    
    for ($i = 0; $i < 12; $i++) {
        $month_key = $start_date->format('Y-m');
        $months[] = [
            'month' => $start_date->format('F Y'),
            'month_key' => $month_key,
            'due_date' => $start_date->format('Y-m-15'), // 15th of each month
            'is_past' => $start_date < $current_date
        ];
        $start_date->modify('+1 month');
    }

    // Get paid months
    $lot_ids = array_column($lots, 'id'); // Use 'id' from lots table
    $paid_months = [];
    
    if (!empty($lot_ids)) {
        $placeholders = str_repeat('?,', count($lot_ids) - 1) . '?';
        $stmt = $pdo->prepare("
            SELECT DISTINCT DATE_FORMAT(payment_date, '%Y-%m') as month_key
            FROM payment_records 
            WHERE CAST(lot_id AS UNSIGNED) IN ($placeholders)
        ");
        $stmt->execute($lot_ids);
        $paid_results = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $paid_months = array_flip($paid_results);
    }

    // Calculate overdue payments
    $overdue_months = [];
    $upcoming_due = [];
    
    foreach ($months as $month) {
        $is_paid = isset($paid_months[$month['month_key']]);
        $due_date = new DateTime($month['due_date']);
        
        if (!$is_paid) {
            if ($due_date < $current_date) {
                $overdue_months[] = $month;
            } elseif ($due_date <= (clone $current_date)->modify('+30 days')) {
                $upcoming_due[] = $month;
            }
        }
    }

    // Calculate payment rate
    $total_months = count($months);
    $paid_months_count = count($paid_months);
    $payment_rate = $total_months > 0 ? round(($paid_months_count / $total_months) * 100, 1) : 0;

    // Prepare response
    $response = [
        'success' => true,
        'customer_info' => [
            'id' => $customer['id'],
            'name' => $customer['first_name'] . ' ' . $customer['last_name'],
            'username' => $customer['username'],
            'email' => $customer['email'],
            'account_created' => $customer['created_at']
        ],
        'lots' => $lots,
        'payment_stats' => [
            'total_payments' => (int)$payment_stats['total_payments'],
            'total_paid_amount' => (float)$payment_stats['total_paid_amount'],
            'last_payment_date' => $payment_stats['last_payment_date'],
            'payment_rate' => $payment_rate
        ],
        'recent_payments' => $recent_payments,
        'payments_due' => [
            'overdue_count' => count($overdue_months),
            'upcoming_count' => count($upcoming_due),
            'overdue_months' => $overdue_months,
            'upcoming_due' => $upcoming_due,
            'total_due_amount' => (count($overdue_months) + count($upcoming_due)) * 1000 // Assuming ₱1000 per month
        ],
        'summary' => [
            'total_lots' => count($lots),
            'total_payments' => (int)$payment_stats['total_payments'],
            'overdue_payments' => count($overdue_months),
            'payment_rate' => $payment_rate
        ]
    ];

    echo json_encode($response);

} catch (Exception $e) {
    error_log("Dashboard API Error: " . $e->getMessage());
    echo json_encode([
        'success' => false, 
        'message' => 'Error loading dashboard data: ' . $e->getMessage()
    ]);
}
?>
