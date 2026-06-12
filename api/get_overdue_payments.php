<?php
require_once 'config.php';
header('Content-Type: application/json');

try {
    // VERY SIMPLE: Get all customers with overdue payments
    $sql = "SELECT 
                u.id as customer_id,
                u.first_name,
                u.last_name,
                u.contact_number,
                COUNT(DISTINCT pp.id) as total_lots,
                SUM(pp.monthly_amount) as total_monthly_amount,
                COUNT(pps.id) as total_overdue_months,
                GROUP_CONCAT(DISTINCT CONCAT(g.name, ' ', s.name, b.block_number, '-', l.lot_number) SEPARATOR ', ') as lot_display
            FROM payment_plans pp
            JOIN users u ON u.id = pp.customer_id
            JOIN lots l ON l.id = pp.lot_id
            JOIN blocks b ON b.id = l.block_id
            JOIN sectors s ON s.id = b.sector_id
            JOIN gardens g ON g.id = s.garden_id
            JOIN payment_plan_schedule pps ON pps.payment_plan_id = pp.id
            WHERE pp.status = 'active'
            AND pps.status = 'pending'
            AND pps.due_date < CURDATE()
            GROUP BY u.id
            ORDER BY u.first_name, u.last_name";

    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $overdue_lots = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'overdue_lots' => $overdue_lots,
        'total_overdue_lots' => count($overdue_lots)
    ]);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'overdue_lots' => [],
        'total_overdue_lots' => 0,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
