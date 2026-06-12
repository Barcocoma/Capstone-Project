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
    
    // Get customer's lots with full details
    $sql = "SELECT l.id, l.lot_number, b.block_number, s.name as sector_name, g.name as garden_name,
                   CONCAT(
                       LEFT(g.name, 1), 
                       s.name, 
                       b.block_number, 
                       '-', 
                       l.lot_number
                   ) as display_name
            FROM lots l
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            LEFT JOIN gardens g ON s.garden_id = g.id
            WHERE l.customer_id = ?
            ORDER BY g.name, s.name, b.block_number, l.lot_number";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$customer_id]);
    $customer_lots = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $customer_lots[] = [
            'id' => $row['id'],
            'lot_number' => $row['lot_number'],
            'block_number' => $row['block_number'],
            'sector_name' => $row['sector_name'],
            'garden_name' => $row['garden_name'],
            'display_name' => $row['display_name'] // Use SQL-generated format (JA2-5)
        ];
    }
    
    echo json_encode([
        'success' => true,
        'customerLots' => $customer_lots
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
