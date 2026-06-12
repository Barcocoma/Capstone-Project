<?php
require_once 'config.php';
header('Content-Type: application/json');

try {
    // Very simple query: just count lots with overdue payments
    $sql = "SELECT COUNT(DISTINCT pp.lot_id) as overdue_lots_count
            FROM payment_plans pp
            JOIN payment_plan_schedule pps ON pps.payment_plan_id = pp.id
            WHERE pp.status = 'active'
            AND pps.status = 'pending'
            AND pps.due_date < CURDATE()";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'overdue_count' => intval($result['overdue_lots_count'])
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'overdue_count' => 0,
        'message' => $e->getMessage()
    ]);
}
?>
