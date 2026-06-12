<?php
require_once 'config.php';
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
    $customer_id = $data['customer_id'] ?? null;
    
    if (!$customer_id) {
        echo json_encode([
            'success' => false,
            'message' => 'Customer ID is required'
        ]);
        exit;
    }
    
    // Get customer basic info
    $customer_sql = "
        SELECT 
            u.id as customer_id,
            u.first_name,
            u.middle_name,
            u.last_name,
            u.email,
            u.contact_number,
            u.created_at as registration_date,
            c.street_address,
            c.city,
            c.province,
            c.occupation,
            c.employer,
            c.monthly_income,
            c.emergency_contact_name,
            c.emergency_contact_phone,
            c.last_payment_date
        FROM users u
        LEFT JOIN customers c ON u.id = c.user_id
        WHERE u.id = ? AND u.account_type = 'customer'
    ";
    
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
    
    // Get customer lots
    $lots_sql = "
        SELECT 
            l.id,
            l.lot_number,
            l.status,
            l.purchase_date,
            l.vault_option,
            b.block_number,
            s.name as sector_name,
            g.name as garden_name,
            CONCAT(
                LEFT(g.name, 1), 
                s.name, 
                b.block_number, 
                '-', 
                l.lot_number
            ) as display_name
        FROM lots l
        JOIN blocks b ON l.block_id = b.id
        JOIN sectors s ON b.sector_id = s.id
        JOIN gardens g ON s.garden_id = g.id
        WHERE l.customer_id = ?
        ORDER BY g.name, s.name, l.lot_number
    ";
    
    $lots_stmt = $pdo->prepare($lots_sql);
    $lots_stmt->execute([$customer_id]);
    $lots = $lots_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get payment history for all customer lots
    $payment_history = [];
    if (!empty($lots)) {
        $lot_ids = array_column($lots, 'id');
        $lot_placeholders = str_repeat('?,', count($lot_ids) - 1) . '?';
        
        $payments_sql = "
            SELECT 
                pr.*,
                l.lot_number,
                s.name as sector_name,
                g.name as garden_name,
                CONCAT(
                    LEFT(g.name, 1), 
                    s.name, 
                    b.block_number, 
                    '-', 
                    l.lot_number
                ) as lot_display
            FROM payment_records pr
            JOIN lots l ON pr.lot_id = l.id
            JOIN blocks b ON l.block_id = b.id
            JOIN sectors s ON b.sector_id = s.id
            JOIN gardens g ON s.garden_id = g.id
            WHERE pr.lot_id IN ($lot_placeholders)
            ORDER BY pr.payment_date DESC, pr.created_at DESC
        ";
        
        $payments_stmt = $pdo->prepare($payments_sql);
        $payments_stmt->execute($lot_ids);
        $payment_history = $payments_stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    // Get monthly payment status
    $monthly_status = null;
    $monthly_status_url = 'http://localhost/ManagementSystem/api/get_monthly_payment_status.php';
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $monthly_status_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['customer_id' => $customer_id]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-User-Id: ' . $customer_id
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    
    $monthly_response = curl_exec($ch);
    $curl_error = curl_error($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($curl_error) {
        error_log("Curl error fetching monthly status for customer $customer_id: " . $curl_error);
    }
    
    if ($monthly_response) {
        $monthly_data = json_decode($monthly_response, true);
        if ($monthly_data && isset($monthly_data['success']) && $monthly_data['success']) {
            $monthly_status = $monthly_data;
        } else {
            error_log("Monthly status API returned unsuccessful response for customer $customer_id. Response: " . substr($monthly_response, 0, 500));
            // Still set monthly_status to empty structure if API fails
            $monthly_status = [
                'success' => true,
                'monthly_status' => [],
                'summary' => [
                    'total_lots' => 0,
                    'total_months' => 0,
                    'total_paid_months' => 0,
                    'total_pending_months' => 0,
                    'payment_rate' => 0,
                    'account_created' => date('M Y', strtotime($customer['registration_date'] ?? 'now'))
                ]
            ];
        }
    } else {
        error_log("Monthly status API returned empty response for customer $customer_id. HTTP Code: " . $http_code);
        // Set empty structure if API fails
        $monthly_status = [
            'success' => true,
            'monthly_status' => [],
            'summary' => [
                'total_lots' => 0,
                'total_months' => 0,
                'total_paid_months' => 0,
                'total_pending_months' => 0,
                'payment_rate' => 0,
                'account_created' => date('M Y', strtotime($customer['registration_date'] ?? 'now'))
            ]
        ];
    }
    
    // Calculate payment summary
    $payment_summary = [
        'total_payments' => count($payment_history),
        'total_paid_amount' => 0,
        'outstanding_balance' => 0,
        'last_payment_date' => null,
        'overdue_months' => 0,
        'payment_rate' => 0
    ];
    
    foreach ($payment_history as $payment) {
        if ($payment['status'] === 'Paid') {
            $payment_summary['total_paid_amount'] += (float)$payment['payment_amount'];
            if (!$payment_summary['last_payment_date'] || $payment['payment_date'] > $payment_summary['last_payment_date']) {
                $payment_summary['last_payment_date'] = $payment['payment_date'];
            }
        }
    }
    
    if ($monthly_status && isset($monthly_status['summary'])) {
        $payment_summary['overdue_months'] = $monthly_status['summary']['total_unpaid_months'] ?? 0;
        $payment_summary['payment_rate'] = $monthly_status['summary']['payment_rate'] ?? 0;
    }
    
    // Format customer data
    $full_name = trim($customer['first_name'] . ' ' . ($customer['middle_name'] ? $customer['middle_name'] . ' ' : '') . $customer['last_name']);
    
    $customer_details = [
        'id' => $customer_id,
        'full_name' => $full_name,
        'first_name' => $customer['first_name'],
        'middle_name' => $customer['middle_name'],
        'last_name' => $customer['last_name'],
        'email' => $customer['email'],
        'contact_number' => $customer['contact_number'],
        'address' => trim(($customer['street_address'] ?? '') . ' ' . ($customer['city'] ?? '') . ' ' . ($customer['province'] ?? '')),
        'occupation' => $customer['occupation'],
        'employer' => $customer['employer'],
        'monthly_income' => $customer['monthly_income'],
        'emergency_contact_name' => $customer['emergency_contact_name'],
        'emergency_contact_phone' => $customer['emergency_contact_phone'],
        'registration_date' => $customer['registration_date'],
        'last_payment_date' => $customer['last_payment_date'],
        'lots' => $lots,
        'payment_history' => $payment_history,
        'payment_summary' => $payment_summary,
        'monthly_status' => $monthly_status ?? [
            'success' => true,
            'monthly_status' => [],
            'summary' => [
                'total_lots' => 0,
                'total_months' => 0,
                'total_paid_months' => 0,
                'total_pending_months' => 0,
                'payment_rate' => 0,
                'account_created' => date('M Y', strtotime($customer['registration_date'] ?? 'now'))
            ]
        ],
        'status' => count($lots) > 0 ? 'Active' : 'Inactive'
    ];
    
    echo json_encode([
        'success' => true,
        'customer' => $customer_details
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error fetching customer details: ' . $e->getMessage()
    ]);
}
?>
