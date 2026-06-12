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
    $sql = "SELECT 
                pr.id, 
                pr.lot_id, 
                pr.owner_name as ownerName, 
                pr.contact, 
                pr.section, 
                pr.payment_amount as paymentAmount, 
                pr.payment_method as paymentMethod, 
                pr.payment_due_date as paymentDue, 
                pr.last_payment_date as lastPayment, 
                pr.status, 
                pr.payment_date as paymentDate, 
                pr.notes, 
                pr.created_at,
                l.customer_id as customerId,
                CONCAT(
                    LEFT(g.name, 1), 
                    s.name, 
                    b.block_number, 
                    '-', 
                    l.lot_number
                ) as lotNumber
            FROM payment_records pr
            LEFT JOIN lots l ON pr.lot_id = l.id
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            LEFT JOIN gardens g ON s.garden_id = g.id
            WHERE pr.deleted_at IS NULL
            ORDER BY pr.created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $paymentRecords = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $paymentRecords[] = [
            'id' => $row['id'],
            'lotNumber' => $row['lotNumber'] ?: $row['lot_id'], // Fallback to lot_id if join fails
            'ownerName' => $row['ownerName'],
            'contact' => $row['contact'],
            'section' => $row['section'],
            'paymentAmount' => floatval($row['paymentAmount']),
            'paymentMethod' => $row['paymentMethod'],
            'paymentDue' => $row['paymentDue'],
            'lastPayment' => $row['lastPayment'],
            'status' => $row['status'],
            'paymentDate' => $row['paymentDate'],
            'notes' => $row['notes'],
            'created_at' => $row['created_at'],
            'customerId' => $row['customerId']
        ];
    }
    
    echo json_encode(['success' => true, 'paymentRecords' => $paymentRecords]);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
