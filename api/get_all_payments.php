<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';
require_once __DIR__ . '/receipt_helper.php';

try {
    // Use the existing PDO connection from config.php
    global $pdo;
    
    // Get filter parameter
    $filter = $_GET['filter'] ?? 'all';
    
    // Get user ID from header (for customer filtering)
    $user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    // Build date filter
    $date_filter = '';
    $params = [];
    
    if ($filter === 'today') {
        $date_filter = ' AND DATE(pr.payment_date) = CURDATE()';
    } elseif ($filter === '30days') {
        $date_filter = ' AND pr.payment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }
    
    // Build user filter (only show payments for customer's lots if user_id provided)
    $user_filter = '';
    if ($user_id) {
        $user_filter = ' AND l.customer_id = ?';
        $params[] = $user_id;
    }
    
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

    if (in_array('performed_by', $columnNames, true)) {
        $performerNameExpressions[] = "NULLIF(pr.performed_by, '')";
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

    $performerBase = empty($performerNameExpressions)
        ? "'Cashier'"
        : "COALESCE(" . implode(', ', $performerNameExpressions) . ", 'Cashier')";

    $performedByExpression = "CASE 
                WHEN LOWER(pr.notes) LIKE '%down payment%' OR LOWER(pr.notes) LIKE '%downpayment%' THEN 'Cashier'
                WHEN LOWER(pr.notes) LIKE '%full payment%' OR LOWER(pr.notes) LIKE '%full-payment%' OR LOWER(pr.notes) LIKE '%fullpayment%' THEN 'Cashier'
                WHEN pr.notes LIKE '%Session ID:%' THEN 'Online Payment'
                WHEN pr.payment_method IN ('GCash', 'Maya') THEN 'Online Payment'
                ELSE $performerBase
            END";

    $orderBy = "pr.payment_date DESC, pr.id DESC";
    if (in_array('created_at', $columnNames, true)) {
        $orderBy = "pr.created_at DESC, pr.payment_date DESC, pr.id DESC";
    }

    // Get payments with performer information
    $sql = "SELECT 
                pr.id,
                pr.lot_id,
                pr.owner_name,
                pr.contact,
                pr.section,
                pr.payment_amount,
                pr.payment_method,
                pr.payment_due_date,
                pr.last_payment_date,
                pr.status,
                pr.payment_date,
                pr.notes,
                l.lot_number,
                b.block_number,
                s.name as sector_name,
                g.name as garden_name,
                CONCAT(
                    LEFT(g.name, 1),
                    s.name,
                    b.block_number,
                    '-',
                    l.lot_number
                ) as lot_display,
                $performedByExpression as performed_by
            FROM payment_records pr
            LEFT JOIN lots l ON pr.lot_id = l.id
            LEFT JOIN blocks b ON l.block_id = b.id
            LEFT JOIN sectors s ON b.sector_id = s.id
            LEFT JOIN gardens g ON s.garden_id = g.id
            $joins
            WHERE pr.deleted_at IS NULL AND (l.deleted_at IS NULL OR l.id IS NULL)" . $date_filter . $user_filter . "
            ORDER BY $orderBy
            LIMIT 1000";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $payments = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format the payments
    $formatted_payments = array_map(function($payment) {
        return [
            'id' => $payment['id'],
            'lot_id' => $payment['lot_id'],
            'lot_display' => $payment['lot_display'] ?: 'Unknown Lot',
            'owner_name' => $payment['owner_name'],
            'contact' => $payment['contact'],
            'section' => $payment['section'],
            'payment_amount' => floatval($payment['payment_amount']),
            'payment_method' => $payment['payment_method'],
            'payment_due_date' => $payment['payment_due_date'],
            'last_payment_date' => $payment['last_payment_date'],
            'status' => $payment['status'],
            'payment_date' => $payment['payment_date'],
            'notes' => $payment['notes'],
            'performed_by' => $payment['performed_by'],
            'is_paymongo' => strpos($payment['notes'], 'Paymongo Payment ID:') !== false,
            'receipt_url' => receipt_pdf_download_url($payment['id'])
        ];
    }, $payments);
    
    echo json_encode([
        'success' => true,
        'payments' => $formatted_payments,
        'count' => count($formatted_payments)
    ]);
    
} catch (Exception $e) {
    error_log("Error in get_all_payments.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Error fetching payments: ' . $e->getMessage()
    ]);
}
?>
