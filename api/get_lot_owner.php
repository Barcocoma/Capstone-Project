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
    
    // Find the customer who owns this specific lot with their payment plan
    $sql = "SELECT 
                u.id as customer_id,
                u.first_name,
                u.middle_name,
                u.last_name,
                u.contact_number,
                u.email,
                CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name) as full_name,
                l.id as lot_id,
                g.name as garden_name,
                s.name as sector_name,
                CONCAT(
                    LEFT(g.name, 1), 
                    s.name, 
                    b.block_number, 
                    '-', 
                    l.lot_number
                ) as lot_display,
                pp.monthly_amount,
                pp.payment_term_months,
                pp.total_amount,
                pp.status as payment_plan_status
            FROM lots l
            JOIN blocks b ON l.block_id = b.id
            JOIN sectors s ON b.sector_id = s.id
            JOIN gardens g ON s.garden_id = g.id
            JOIN users u ON l.customer_id = u.id
            LEFT JOIN payment_plans pp ON l.id = pp.lot_id AND pp.status = 'active'
            WHERE LEFT(g.name, 1) = ? 
            AND s.name = ? 
            AND b.block_number = ? 
            AND l.lot_number = ?
            AND l.customer_id IS NOT NULL";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$garden_initial, $sector_name, $block_number, $lot_number]);
    $owner = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$owner) {
        echo json_encode([
            'success' => false,
            'message' => 'No customer found for lot ' . $lot_display
        ]);
        exit;
    }
    
    echo json_encode([
        'success' => true,
        'customer' => $owner
    ]);
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
