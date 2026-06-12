<?php
require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    global $pdo;
    
    // Get filter parameter
    $filter = $_GET['filter'] ?? 'all';
    
    // Build date filter - use created_at (actual payment date) not payment_date (due date)
    $date_filter = '';
    if ($filter === 'today') {
        $date_filter = ' AND DATE(pr.created_at) = CURDATE()';
    } elseif ($filter === '30days') {
        $date_filter = ' AND pr.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }
    // 'all' - no filter
    
    // Detect optional performer columns
    $columnNames = [];
    try {
        $columnStmt = $pdo->query("
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'payment_records'
        ");
        $columnNames = $columnStmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (Exception $e) {
        $columnNames = [];
    }

    $joins = "";
    $performerNameExpressions = [];

    if (in_array('recorded_by', $columnNames, true)) {
        $joins .= "\n            LEFT JOIN users pr_recorded_by ON pr.recorded_by = pr_recorded_by.id";
        $performerNameExpressions[] = "NULLIF(pr_recorded_by.username, '')";
    }

    if (in_array('created_by', $columnNames, true)) {
        $joins .= "\n            LEFT JOIN users pr_created_by ON pr.created_by = pr_created_by.id";
        $performerNameExpressions[] = "NULLIF(pr_created_by.username, '')";
    }

    if (in_array('processed_by', $columnNames, true)) {
        $joins .= "\n            LEFT JOIN users pr_processed_by ON pr.processed_by = pr_processed_by.id";
        $performerNameExpressions[] = "NULLIF(pr_processed_by.username, '')";
    }

    if (in_array('cashier_id', $columnNames, true)) {
        $joins .= "\n            LEFT JOIN users pr_cashier ON pr.cashier_id = pr_cashier.id";
        $performerNameExpressions[] = "NULLIF(pr_cashier.username, '')";
    }

    $activityPerformerExpression = "(SELECT 
                NULLIF(u.username, '')
            FROM activity_log al
            LEFT JOIN users u ON al.performed_by = u.id
            WHERE al.performed_by IS NOT NULL
              AND al.type IN ('Payment Monitoring', 'Payment', 'Payment Transaction')
              AND ABS(TIMESTAMPDIFF(SECOND, al.created_at, pr.created_at)) <= 600
              AND (
                    (pr.owner_name IS NOT NULL AND pr.owner_name <> '' AND al.details LIKE CONCAT('%', pr.owner_name, '%'))
                 OR (pr.contact IS NOT NULL AND pr.contact <> '' AND al.details LIKE CONCAT('%', pr.contact, '%'))
                )
            ORDER BY ABS(TIMESTAMPDIFF(SECOND, al.created_at, pr.created_at)), al.id DESC
            LIMIT 1)";

    $performerNameExpressions[] = $activityPerformerExpression;

    if (empty($performerNameExpressions)) {
        $performerBase = "'Cashier'";
    } else {
        $performerBase = "COALESCE(" . implode(', ', $performerNameExpressions) . ", 'Cashier')";
    }

    $performedByExpression = "CASE 
                WHEN LOWER(pr.notes) LIKE '%down payment%' OR LOWER(pr.notes) LIKE '%downpayment%' THEN 'Cashier'
                WHEN LOWER(pr.notes) LIKE '%full payment%' OR LOWER(pr.notes) LIKE '%full-payment%' OR LOWER(pr.notes) LIKE '%fullpayment%' THEN 'Cashier'
                WHEN pr.notes LIKE '%Session ID:%' THEN 'Online Payment'
                WHEN pr.payment_method IN ('GCash', 'Maya') THEN 'Online Payment'
                ELSE $performerBase
            END";

    // Order by created_at (actual payment date) - always use created_at for actual payment date
    $orderBy = "pr.created_at DESC, pr.id DESC";

    // Simple query to get all paid payments - use created_at for actual payment date
    $sql = "SELECT 
                pr.id,
                pr.owner_name,
                pr.contact,
                pr.payment_amount,
                pr.payment_method,
                pr.status,
                pr.created_at as payment_date,
                pr.notes,
                CONCAT(
                    LEFT(g.name, 1),
                    s.name,
                    b.block_number,
                    '-',
                    l.lot_number
                ) as lot_display,
                $performedByExpression as performed_by
            FROM payment_records pr
            LEFT JOIN lots l ON pr.lot_id = l.id AND l.deleted_at IS NULL
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            LEFT JOIN gardens g ON s.garden_id = g.id
            $joins
            WHERE pr.status='Paid' AND pr.deleted_at IS NULL" . $date_filter . "
            ORDER BY $orderBy
            LIMIT 5000";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $payments = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'payments' => $payments,
        'count' => count($payments)
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
