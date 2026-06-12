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
    // Get all customers with their lot status and payment status
    $sql = "SELECT 
                u.id,
                u.first_name,
                u.middle_name,
                u.last_name,
                u.contact_number,
                u.email,
                CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name) as full_name,
                c.registration_date,
                c.last_payment_date,
                
                -- Lot information
                GROUP_CONCAT(
                    CONCAT(
                        g.name, '-', s.name, '-', l.lot_number, 
                        ' (', l.status, ')'
                    ) 
                    SEPARATOR ', '
                ) as lots_info,
                
                COUNT(l.id) as total_lots,
                SUM(CASE WHEN l.status = 'available' THEN 1 ELSE 0 END) as available_lots,
                SUM(CASE WHEN l.status = 'reserved' THEN 1 ELSE 0 END) as reserved_lots,
                SUM(CASE WHEN l.status = 'occupied' THEN 1 ELSE 0 END) as occupied_lots,
                
                -- Payment information
                COALESCE(SUM(CASE WHEN pr.status = 'Paid' THEN pr.payment_amount ELSE 0 END), 0) as total_paid,
                COALESCE(SUM(CASE WHEN pr.status = 'Pending' THEN pr.payment_amount ELSE 0 END), 0) as pending_amount,
                COALESCE(SUM(CASE WHEN pr.status = 'Overdue' THEN pr.payment_amount ELSE 0 END), 0) as overdue_amount,
                COUNT(CASE WHEN pr.status = 'Paid' THEN 1 END) as paid_payments_count,
                COUNT(CASE WHEN pr.status = 'Pending' THEN 1 END) as pending_payments_count,
                COUNT(CASE WHEN pr.status = 'Overdue' THEN 1 END) as overdue_payments_count,
                
                -- Overall payment status
                CASE 
                    WHEN COUNT(CASE WHEN pr.status = 'Overdue' THEN 1 END) > 0 THEN 'Overdue'
                    WHEN COUNT(CASE WHEN pr.status = 'Pending' THEN 1 END) > 0 THEN 'Pending'
                    WHEN COUNT(CASE WHEN pr.status = 'Paid' THEN 1 END) > 0 THEN 'Paid'
                    ELSE 'No Payments'
                END as payment_status
                
            FROM users u
            LEFT JOIN customers c ON u.id = c.user_id
            LEFT JOIN lots l ON u.id = l.customer_id
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            LEFT JOIN gardens g ON s.garden_id = g.id
            LEFT JOIN payment_records pr ON l.id = pr.lot_id
            WHERE u.account_type = 'customer'
            GROUP BY u.id, u.first_name, u.middle_name, u.last_name, u.contact_number, u.email, c.registration_date, c.last_payment_date
            ORDER BY u.first_name, u.last_name";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $customers = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $customers[] = [
            'id' => $row['id'],
            'first_name' => $row['first_name'],
            'middle_name' => $row['middle_name'],
            'last_name' => $row['last_name'],
            'full_name' => trim($row['full_name']),
            'contact_number' => $row['contact_number'],
            'email' => $row['email'],
            'registration_date' => $row['registration_date'],
            'last_payment_date' => $row['last_payment_date'],
            
            // Lot status
            'lots_info' => $row['lots_info'] ?: 'No lots assigned',
            'total_lots' => (int)$row['total_lots'],
            'available_lots' => (int)$row['available_lots'],
            'reserved_lots' => (int)$row['reserved_lots'],
            'occupied_lots' => (int)$row['occupied_lots'],
            'lot_status' => $row['total_lots'] > 0 ? 
                ($row['occupied_lots'] > 0 ? 'Has Occupied Lots' : 
                 ($row['reserved_lots'] > 0 ? 'Has Reserved Lots' : 'Has Available Lots')) : 
                'No Lots',
            
            // Payment status
            'total_paid' => (float)$row['total_paid'],
            'pending_amount' => (float)$row['pending_amount'],
            'overdue_amount' => (float)$row['overdue_amount'],
            'paid_payments_count' => (int)$row['paid_payments_count'],
            'pending_payments_count' => (int)$row['pending_payments_count'],
            'overdue_payments_count' => (int)$row['overdue_payments_count'],
            'payment_status' => $row['payment_status'],
            
            // Overall status
            'customer_status' => $row['total_lots'] > 0 ? 'Active' : 'Inactive'
        ];
    }
    
    echo json_encode([
        'success' => true,
        'customers' => $customers,
        'total_customers' => count($customers)
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
