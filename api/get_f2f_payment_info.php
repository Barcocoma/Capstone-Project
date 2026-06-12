<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    exit;
}

try {
    $lot_display = $_GET['lot_display'] ?? '';
    
    if (!$lot_display) {
        echo json_encode([
            'success' => false,
            'message' => 'Lot display name required'
        ]);
        exit;
    }
    
    // Parse JA2-5 format: J=Garden, A=Sector, 2=Block, 5=Lot
    if (!preg_match('/^([A-Z])([A-Z])(\d+)-(\d+)$/', $lot_display, $matches)) {
        echo json_encode([
            'success' => false,
            'message' => 'Invalid lot format. Use format like JA2-5'
        ]);
        exit;
    }
    
    $garden_initial = $matches[1];
    $sector_name = $matches[2];
    $block_number = $matches[3];
    $lot_number = $matches[4];
    
    // Find lot with payment plan info
    $sql = "SELECT 
                l.id as lot_id,
                l.lot_number,
                l.customer_id,
                l.status,
                b.block_number,
                s.name as sector_name,
                g.name as garden_name,
                u.first_name,
                u.middle_name,
                u.last_name,
                u.contact_number,
                CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name) as owner_name,
                CONCAT(
                    LEFT(g.name, 1), 
                    s.name, 
                    b.block_number, 
                    '-', 
                    l.lot_number
                ) as display_name,
                pp.monthly_amount,
                pp.payment_term_months,
                pp.start_date,
                pp.status as payment_plan_status
            FROM lots l
            JOIN blocks b ON l.block_id = b.id
            JOIN sectors s ON b.sector_id = s.id
            JOIN gardens g ON s.garden_id = g.id
            LEFT JOIN users u ON l.customer_id = u.id
            LEFT JOIN payment_plans pp ON l.id = pp.lot_id AND pp.status = 'active'
            WHERE LEFT(g.name, 1) = ? 
            AND s.name = ? 
            AND b.block_number = ? 
            AND l.lot_number = ?";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$garden_initial, $sector_name, $block_number, $lot_number]);
    $lot_info = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$lot_info) {
        echo json_encode([
            'success' => false,
            'message' => 'Lot not found'
        ]);
        exit;
    }
    
    // Get pending months for this customer's payment plan
    $pending_months = [];
    
    if ($lot_info['customer_id'] && $lot_info['monthly_amount'] && $lot_info['payment_term_months'] > 0) {
        // Generate months based on payment plan
        $start_date = new DateTime($lot_info['start_date']);
        $payment_term_months = intval($lot_info['payment_term_months']);
        $monthly_amount = floatval($lot_info['monthly_amount']);
        
        // Get existing payments
        $payment_sql = "SELECT 
                            SUBSTRING(payment_date, 1, 7) as payment_month,
                            payment_amount,
                            payment_method
                        FROM payment_records 
                        WHERE lot_id = ? AND customer_id = ?
                        AND payment_date IS NOT NULL";
        
        $payment_stmt = $pdo->prepare($payment_sql);
        $payment_stmt->execute([$lot_info['lot_id'], $lot_info['customer_id']]);
        $payments = $payment_stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $paid_months = [];
        foreach ($payments as $payment) {
            $paid_months[$payment['payment_month']] = $payment;
        }
        
        // Generate months starting from next month after start date
        for ($i = 1; $i <= $payment_term_months; $i++) {
            $due_date = clone $start_date;
            $due_date->modify("+$i months");
            
            $year_month = $due_date->format('Y-m');
            $is_paid = isset($paid_months[$year_month]);
            $is_overdue = !$is_paid && $due_date < new DateTime();
            
            $pending_months[] = [
                'year_month' => $year_month,
                'display' => $due_date->format('M Y'),
                'due_date' => $due_date->format('Y-m-d'),
                'amount' => $monthly_amount,
                'paid' => $is_paid,
                'overdue' => $is_overdue,
                'payment_info' => $is_paid ? $paid_months[$year_month] : null
            ];
        }
    }
    
    echo json_encode([
        'success' => true,
        'lot_info' => $lot_info,
        'pending_months' => $pending_months
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
