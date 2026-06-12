<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Check if user is authenticated
$actorId = get_actor_user_id();
if (!$actorId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// Only admin can soft delete
$stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
$stmt->execute([$actorId]);
$actorRole = strtolower($stmt->fetchColumn() ?: '');

if ($actorRole !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden: Admin access required']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['record_type']) || !isset($data['record_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$recordType = $data['record_type'];
$recordId = intval($data['record_id']);
$userId = $actorId;

// Check if MySQLi connection is available
if (!isset($conn) || $conn === null) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection error. Please check server configuration.']);
    exit;
}

try {
    $conn->begin_transaction();
    
    switch ($recordType) {
        case 'user':
            $result = softDeleteUser($conn, $recordId, $userId);
            break;
        case 'lot':
            $result = softDeleteLot($conn, $recordId, $userId);
            break;
        case 'deceased':
            $result = softDeleteDeceased($conn, $recordId, $userId);
            break;
        case 'payment':
            $result = softDeletePayment($conn, $recordId, $userId);
            break;
        default:
            throw new Exception('Invalid record type');
    }
    
    if ($result['success']) {
        $conn->commit();
        echo json_encode($result);
    } else {
        $conn->rollback();
        http_response_code(400);
        echo json_encode($result);
    }
    
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}

function softDeleteUser($conn, $userId, $deletedBy) {
    // Check if user exists and not already deleted
    $stmt = $conn->prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    
    if (!$user) {
        return ['success' => false, 'message' => 'User not found or already deleted'];
    }
    
    // Cannot delete admin users
    if ($user['account_type'] === 'admin') {
        return ['success' => false, 'message' => 'Cannot delete admin users'];
    }
    
    // Get customer details if exists
    $stmt = $conn->prepare("SELECT * FROM customers WHERE user_id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $customerResult = $stmt->get_result();
    $customer = $customerResult->fetch_assoc();
    
    // Get all related lots
    $stmt = $conn->prepare("SELECT * FROM lots WHERE customer_id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $lotsResult = $stmt->get_result();
    $lots = [];
    while ($lot = $lotsResult->fetch_assoc()) {
        $lots[] = $lot;
    }
    
    // Get all related deceased records
    $stmt = $conn->prepare("SELECT * FROM deceased_records WHERE customer_id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $userId);
    $stmt->execute();
    $deceasedResult = $stmt->get_result();
    $deceased = [];
    while ($dec = $deceasedResult->fetch_assoc()) {
        $deceased[] = $dec;
    }
    
    // Get all related payment records
    $paymentRecords = [];
    foreach ($lots as $lot) {
        $stmt = $conn->prepare("SELECT * FROM payment_records WHERE lot_id = ? AND deleted_at IS NULL");
        $stmt->bind_param("i", $lot['id']);
        $stmt->execute();
        $paymentsResult = $stmt->get_result();
        while ($payment = $paymentsResult->fetch_assoc()) {
            $paymentRecords[] = $payment;
        }
    }
    
    // Get payment plans
    $paymentPlans = [];
    foreach ($lots as $lot) {
        $stmt = $conn->prepare("SELECT * FROM payment_plans WHERE lot_id = ? AND deleted_at IS NULL");
        $stmt->bind_param("i", $lot['id']);
        $stmt->execute();
        $plansResult = $stmt->get_result();
        while ($plan = $plansResult->fetch_assoc()) {
            $paymentPlans[] = $plan;
        }
    }
    
    // Create backup snapshot
    $snapshotData = json_encode([
        'user' => $user,
        'customer' => $customer
    ]);
    
    $relatedData = json_encode([
        'lots' => $lots,
        'deceased' => $deceased,
        'payment_records' => $paymentRecords,
        'payment_plans' => $paymentPlans
    ]);
    
    $stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('user', ?, ?, ?, ?)");
    $stmt->bind_param("issi", $userId, $snapshotData, $relatedData, $deletedBy);
    $stmt->execute();
    
    // Soft delete all related records
    $now = date('Y-m-d H:i:s');
    
    // Soft delete payment records
    foreach ($paymentRecords as $payment) {
        $stmt = $conn->prepare("UPDATE payment_records SET deleted_at = ?, deleted_by = ? WHERE id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $payment['id']);
        $stmt->execute();
    }
    
    // Soft delete payment plans
    foreach ($paymentPlans as $plan) {
        $stmt = $conn->prepare("UPDATE payment_plans SET deleted_at = ?, deleted_by = ? WHERE id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $plan['id']);
        $stmt->execute();
    }
    
    // Soft delete deceased records
    foreach ($deceased as $dec) {
        $stmt = $conn->prepare("UPDATE deceased_records SET deleted_at = ?, deleted_by = ? WHERE id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $dec['id']);
        $stmt->execute();
    }
    
    // Soft delete lots (make available again)
    foreach ($lots as $lot) {
        $stmt = $conn->prepare("UPDATE lots SET deleted_at = ?, deleted_by = ?, status = 'available', customer_id = NULL WHERE id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $lot['id']);
        $stmt->execute();
    }
    
    // Soft delete customer
    if ($customer) {
        $stmt = $conn->prepare("UPDATE customers SET deleted_at = ?, deleted_by = ? WHERE user_id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $userId);
        $stmt->execute();
    }
    
    // Soft delete user
    $stmt = $conn->prepare("UPDATE users SET deleted_at = ?, deleted_by = ? WHERE id = ?");
    $stmt->bind_param("sii", $now, $deletedBy, $userId);
    $stmt->execute();
    
    return [
        'success' => true, 
        'message' => 'User and all related records soft deleted successfully',
        'affected_records' => [
            'lots' => count($lots),
            'deceased' => count($deceased),
            'payments' => count($paymentRecords),
            'payment_plans' => count($paymentPlans)
        ]
    ];
}

function softDeleteLot($conn, $lotId, $deletedBy) {
    // Check if lot exists and not already deleted
    $stmt = $conn->prepare("SELECT l.*, u.username, u.first_name, u.last_name FROM lots l LEFT JOIN users u ON l.customer_id = u.id WHERE l.id = ? AND l.deleted_at IS NULL");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $result = $stmt->get_result();
    $lot = $result->fetch_assoc();
    
    if (!$lot) {
        return ['success' => false, 'message' => 'Lot not found or already deleted'];
    }
    
    // Get all related deceased records
    $stmt = $conn->prepare("SELECT * FROM deceased_records WHERE lot_id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $deceasedResult = $stmt->get_result();
    $deceased = [];
    while ($dec = $deceasedResult->fetch_assoc()) {
        $deceased[] = $dec;
    }
    
    // Get all related payment records
    $stmt = $conn->prepare("SELECT * FROM payment_records WHERE lot_id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $paymentsResult = $stmt->get_result();
    $paymentRecords = [];
    while ($payment = $paymentsResult->fetch_assoc()) {
        $paymentRecords[] = $payment;
    }
    
    // Get payment plans
    $stmt = $conn->prepare("SELECT * FROM payment_plans WHERE lot_id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $plansResult = $stmt->get_result();
    $paymentPlans = [];
    while ($plan = $plansResult->fetch_assoc()) {
        $paymentPlans[] = $plan;
    }
    
    // Create backup snapshot
    $snapshotData = json_encode($lot);
    $relatedData = json_encode([
        'deceased' => $deceased,
        'payment_records' => $paymentRecords,
        'payment_plans' => $paymentPlans
    ]);
    
    $stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('lot', ?, ?, ?, ?)");
    $stmt->bind_param("issi", $lotId, $snapshotData, $relatedData, $deletedBy);
    $stmt->execute();
    
    // Soft delete all related records
    $now = date('Y-m-d H:i:s');
    
    // Soft delete payment records
    foreach ($paymentRecords as $payment) {
        $stmt = $conn->prepare("UPDATE payment_records SET deleted_at = ?, deleted_by = ? WHERE id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $payment['id']);
        $stmt->execute();
    }
    
    // Soft delete payment plans
    foreach ($paymentPlans as $plan) {
        $stmt = $conn->prepare("UPDATE payment_plans SET deleted_at = ?, deleted_by = ? WHERE id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $plan['id']);
        $stmt->execute();
    }
    
    // Soft delete deceased records
    foreach ($deceased as $dec) {
        $stmt = $conn->prepare("UPDATE deceased_records SET deleted_at = ?, deleted_by = ? WHERE id = ?");
        $stmt->bind_param("sii", $now, $deletedBy, $dec['id']);
        $stmt->execute();
    }
    
    // Soft delete lot (make available again)
    $stmt = $conn->prepare("UPDATE lots SET deleted_at = ?, deleted_by = ?, status = 'available', customer_id = NULL WHERE id = ?");
    $stmt->bind_param("sii", $now, $deletedBy, $lotId);
    $stmt->execute();
    
    return [
        'success' => true,
        'message' => 'Lot ownership and all related records soft deleted successfully',
        'affected_records' => [
            'deceased' => count($deceased),
            'payments' => count($paymentRecords),
            'payment_plans' => count($paymentPlans)
        ]
    ];
}

function softDeleteDeceased($conn, $deceasedId, $deletedBy) {
    // Check if deceased record exists and not already deleted
    $stmt = $conn->prepare("SELECT * FROM deceased_records WHERE id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $deceasedId);
    $stmt->execute();
    $result = $stmt->get_result();
    $deceased = $result->fetch_assoc();
    
    if (!$deceased) {
        return ['success' => false, 'message' => 'Deceased record not found or already deleted'];
    }
    
    // Create backup snapshot
    $snapshotData = json_encode($deceased);
    
    $stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('deceased', ?, ?, NULL, ?)");
    $stmt->bind_param("isi", $deceasedId, $snapshotData, $deletedBy);
    $stmt->execute();
    
    // Soft delete deceased record
    $now = date('Y-m-d H:i:s');
    $stmt = $conn->prepare("UPDATE deceased_records SET deleted_at = ?, deleted_by = ? WHERE id = ?");
    $stmt->bind_param("sii", $now, $deletedBy, $deceasedId);
    $stmt->execute();
    
    return [
        'success' => true,
        'message' => 'Deceased record soft deleted successfully'
    ];
}

function softDeletePayment($conn, $paymentId, $deletedBy) {
    // Check if payment record exists and not already deleted
    $stmt = $conn->prepare("SELECT * FROM payment_records WHERE id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $paymentId);
    $stmt->execute();
    $result = $stmt->get_result();
    $payment = $result->fetch_assoc();
    
    if (!$payment) {
        return ['success' => false, 'message' => 'Payment record not found or already deleted'];
    }
    
    // Create backup snapshot
    $snapshotData = json_encode($payment);
    
    $stmt = $conn->prepare("INSERT INTO deleted_records_backup (record_type, record_id, snapshot_data, related_data, deleted_by) VALUES ('payment', ?, ?, NULL, ?)");
    $stmt->bind_param("isi", $paymentId, $snapshotData, $deletedBy);
    $stmt->execute();
    
    // Soft delete payment record
    $now = date('Y-m-d H:i:s');
    $stmt = $conn->prepare("UPDATE payment_records SET deleted_at = ?, deleted_by = ? WHERE id = ?");
    $stmt->bind_param("sii", $now, $deletedBy, $paymentId);
    $stmt->execute();
    
    return [
        'success' => true,
        'message' => 'Payment record soft deleted successfully'
    ];
}
?>

