<?php
require_once 'config.php';
require_once __DIR__ . '/receipt_helper.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
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
    // Get customer ID from user session or header
    $customer_id = get_actor_user_id();
    
    if (!$customer_id) {
        echo json_encode([
            'success' => false,
            'message' => 'Customer not authenticated'
        ]);
        exit;
    }
    
    // Get customer's lots first
    $lots_sql = "SELECT id, lot_number, block_id FROM lots WHERE customer_id = ?";
    $lots_stmt = $pdo->prepare($lots_sql);
    $lots_stmt->execute([$customer_id]);
    $customer_lots = $lots_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($customer_lots)) {
        echo json_encode([
            'success' => true,
            'paymentHistory' => []
        ]);
        exit;
    }
    
    // Extract lot IDs
    $lot_ids = array_column($customer_lots, 'id');
    $placeholders = str_repeat('?,', count($lot_ids) - 1) . '?';
    
    // Get payment records for customer's lots
    $sql = "SELECT pr.id, pr.lot_id, pr.owner_name, pr.contact, pr.section, 
            pr.payment_amount, pr.payment_method, pr.payment_due_date, 
            pr.last_payment_date, pr.status, pr.payment_date, pr.notes, 
            pr.created_at, l.lot_number, b.block_number, s.name as sector_name
            FROM payment_records pr
            LEFT JOIN lots l ON pr.lot_id = l.id
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            WHERE pr.lot_id IN ($placeholders)
            ORDER BY pr.created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($lot_ids);
    $paymentRecords = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $paymentRecords[] = [
            'id' => $row['id'],
            'lot_id' => $row['lot_id'],
            'lot_number' => $row['lot_number'],
            'block_number' => $row['block_number'],
            'sector_name' => $row['sector_name'],
            'owner_name' => $row['owner_name'],
            'contact' => $row['contact'],
            'section' => $row['section'],
            'payment_amount' => floatval($row['payment_amount']),
            'payment_method' => $row['payment_method'],
            'payment_due_date' => $row['payment_due_date'],
            'last_payment_date' => $row['last_payment_date'],
            'status' => $row['status'],
            'payment_date' => $row['payment_date'],
            'notes' => $row['notes'],
            'created_at' => $row['created_at'],
            'receipt_url' => receipt_pdf_download_url($row['id'])
        ];
    }
    
    echo json_encode([
        'success' => true, 
        'paymentHistory' => $paymentRecords
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
