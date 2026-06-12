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

// Only admin can view deleted records
$stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
$stmt->execute([$actorId]);
$actorRole = strtolower($stmt->fetchColumn() ?: '');

if ($actorRole !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden: Admin access required']);
    exit;
}

$recordType = isset($_GET['record_type']) ? $_GET['record_type'] : 'all';

// Check if MySQLi connection is available
if (!isset($conn) || $conn === null) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection error. Please check server configuration.']);
    exit;
}

try {
    $records = [];
    
    switch ($recordType) {
        case 'user':
            $records = getDeletedUsers($conn);
            break;
        case 'lot':
            $records = getDeletedLots($conn);
            break;
        case 'deceased':
            $records = getDeletedDeceased($conn);
            break;
        case 'payment':
            $records = getDeletedPayments($conn);
            break;
        case 'all':
            $records = [
                'users' => getDeletedUsers($conn),
                'lots' => getDeletedLots($conn),
                'deceased' => getDeletedDeceased($conn),
                'payments' => getDeletedPayments($conn)
            ];
            break;
        default:
            throw new Exception('Invalid record type');
    }
    
    echo json_encode(['success' => true, 'data' => $records]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}

function getDeletedUsers($conn) {
    $stmt = $conn->prepare("
        SELECT 
            b.id as backup_id,
            b.record_id,
            b.snapshot_data,
            b.related_data,
            b.deleted_at,
            b.can_restore,
            b.restore_notes,
            u.username as deleted_by_username
        FROM deleted_records_backup b
        LEFT JOIN users u ON b.deleted_by = u.id
        WHERE b.record_type = 'user'
        ORDER BY b.deleted_at DESC
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    $records = [];
    while ($row = $result->fetch_assoc()) {
        $snapshot = json_decode($row['snapshot_data'], true);
        $related = json_decode($row['related_data'], true);
        
        $records[] = [
            'backup_id' => $row['backup_id'],
            'record_id' => $row['record_id'],
            'username' => $snapshot['user']['username'] ?? 'N/A',
            'email' => $snapshot['user']['email'] ?? 'N/A',
            'full_name' => trim(($snapshot['user']['first_name'] ?? '') . ' ' . ($snapshot['user']['last_name'] ?? '')),
            'account_type' => $snapshot['user']['account_type'] ?? 'N/A',
            'deleted_at' => $row['deleted_at'],
            'deleted_by' => $row['deleted_by_username'] ?? 'Unknown',
            'can_restore' => (bool)$row['can_restore'],
            'restore_notes' => $row['restore_notes'],
            'related_records' => [
                'lots_count' => count($related['lots'] ?? []),
                'deceased_count' => count($related['deceased'] ?? []),
                'payments_count' => count($related['payment_records'] ?? []),
                'payment_plans_count' => count($related['payment_plans'] ?? [])
            ]
        ];
    }
    
    return $records;
}

function getDeletedLots($conn) {
    $stmt = $conn->prepare("
        SELECT 
            b.id as backup_id,
            b.record_id,
            b.snapshot_data,
            b.related_data,
            b.deleted_at,
            b.can_restore,
            b.restore_notes,
            u.username as deleted_by_username
        FROM deleted_records_backup b
        LEFT JOIN users u ON b.deleted_by = u.id
        WHERE b.record_type = 'lot'
        ORDER BY b.deleted_at DESC
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    $records = [];
    while ($row = $result->fetch_assoc()) {
        $snapshot = json_decode($row['snapshot_data'], true);
        $related = json_decode($row['related_data'], true);
        
        // Get block info for display
        $blockId = $snapshot['block_id'] ?? null;
        $lotNumber = $snapshot['lot_number'] ?? 'N/A';
        $lotLocation = 'N/A';
        
        if ($blockId) {
            $stmt2 = $conn->prepare("
                SELECT b.block_number, s.name as sector_name, g.name as garden_name
                FROM blocks b
                JOIN sectors s ON b.sector_id = s.id
                JOIN gardens g ON s.garden_id = g.id
                WHERE b.id = ?
            ");
            $stmt2->bind_param("i", $blockId);
            $stmt2->execute();
            $locationResult = $stmt2->get_result();
            if ($locationData = $locationResult->fetch_assoc()) {
                $lotLocation = $locationData['garden_name'] . ' / Sector ' . $locationData['sector_name'] . ' / Block ' . $locationData['block_number'] . ' / Lot ' . $lotNumber;
            }
        }
        
        // Get username/email from snapshot
        $username = $snapshot['username'] ?? 'N/A';
        $email = $snapshot['email'] ?? null;
        
        $records[] = [
            'backup_id' => $row['backup_id'],
            'record_id' => $row['record_id'],
            'lot_location' => $lotLocation,
            'owner_name' => trim(($snapshot['first_name'] ?? '') . ' ' . ($snapshot['last_name'] ?? '')) ?: $username,
            'owner_username' => $username,
            'owner_email' => $email,
            'status' => $snapshot['status'] ?? 'N/A',
            'purchase_date' => $snapshot['purchase_date'] ?? 'N/A',
            'deleted_at' => $row['deleted_at'],
            'deleted_by' => $row['deleted_by_username'] ?? 'Unknown',
            'can_restore' => (bool)$row['can_restore'],
            'restore_notes' => $row['restore_notes'],
            'related_records' => [
                'deceased_count' => count($related['deceased'] ?? []),
                'payments_count' => count($related['payment_records'] ?? []),
                'payment_plans_count' => count($related['payment_plans'] ?? [])
            ]
        ];
    }
    
    return $records;
}

function getDeletedDeceased($conn) {
    $stmt = $conn->prepare("
        SELECT 
            b.id as backup_id,
            b.record_id,
            b.snapshot_data,
            b.deleted_at,
            b.can_restore,
            b.restore_notes,
            u.username as deleted_by_username
        FROM deleted_records_backup b
        LEFT JOIN users u ON b.deleted_by = u.id
        WHERE b.record_type = 'deceased'
        ORDER BY b.deleted_at DESC
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    $records = [];
    while ($row = $result->fetch_assoc()) {
        $snapshot = json_decode($row['snapshot_data'], true);
        
        // Get lot location and owner info from snapshot
        $lotId = $snapshot['lot_id'] ?? null;
        $lotLocation = 'N/A';
        $ownerUsername = 'N/A';
        
        if ($lotId) {
            // Get lot location - try from current lot first (even if deleted, we can still read it)
            $stmt2 = $conn->prepare("
                SELECT l.lot_number, l.customer_id, l.block_id,
                       b.block_number, s.name as sector_name, g.name as garden_name
                FROM lots l
                LEFT JOIN blocks b ON l.block_id = b.id
                LEFT JOIN sectors s ON b.sector_id = s.id
                LEFT JOIN gardens g ON s.garden_id = g.id
                WHERE l.id = ?
            ");
            $stmt2->bind_param("i", $lotId);
            $stmt2->execute();
            $lotResult = $stmt2->get_result();
            $lotData = $lotResult->fetch_assoc();
            
            if ($lotData && $lotData['garden_name']) {
                $lotLocation = $lotData['garden_name'] . ' / Sector ' . $lotData['sector_name'] . ' / Block ' . $lotData['block_number'] . ' / Lot ' . $lotData['lot_number'];
            } else if ($lotData && $lotData['lot_number']) {
                $lotLocation = 'Lot ID: ' . $lotId . ' (Lot #' . $lotData['lot_number'] . ')';
            } else {
                $lotLocation = 'Lot ID: ' . $lotId;
            }
            
            // Get owner username - try from snapshot customer_id first, then from current lot
            $customerId = $snapshot['customer_id'] ?? ($lotData['customer_id'] ?? null);
            if ($customerId) {
                // Try to get username from active user first
                $stmt3 = $conn->prepare("SELECT username, email FROM users WHERE id = ? AND deleted_at IS NULL");
                $stmt3->bind_param("i", $customerId);
                $stmt3->execute();
                $userResult = $stmt3->get_result();
                if ($userData = $userResult->fetch_assoc()) {
                    $ownerUsername = $userData['username'];
                    $ownerEmail = $userData['email'] ?? null;
                } else {
                    // User is deleted, check if user exists at all (even deleted)
                    $stmt4 = $conn->prepare("SELECT username, email FROM users WHERE id = ?");
                    $stmt4->bind_param("i", $customerId);
                    $stmt4->execute();
                    $deletedUserResult = $stmt4->get_result();
                    if ($deletedUserData = $deletedUserResult->fetch_assoc()) {
                        // Keep username but don't append '(Deleted)' for UI consistency
                        $ownerUsername = $deletedUserData['username'];
                        $ownerEmail = $deletedUserData['email'] ?? null;
                    } else {
                        $ownerUsername = 'Unknown User';
                    }
                }
            }
        }
        
        $records[] = [
            'backup_id' => $row['backup_id'],
            'record_id' => $row['record_id'],
            'name' => $snapshot['name'] ?? 'N/A',
            'date_of_birth' => $snapshot['date_of_birth'] ?? 'N/A',
            'date_of_death' => $snapshot['date_of_death'] ?? 'N/A',
            'burial_date' => $snapshot['burial_date'] ?? 'N/A',
            'status' => $snapshot['status'] ?? 'N/A',
            'lot_location' => $lotLocation,
            'owner_username' => $ownerUsername,
            'owner_email' => $ownerEmail ?? null,
            'deleted_at' => $row['deleted_at'],
            'deleted_by' => $row['deleted_by_username'] ?? 'Unknown',
            'can_restore' => (bool)$row['can_restore'],
            'restore_notes' => $row['restore_notes']
        ];
    }
    
    return $records;
}

function getDeletedPayments($conn) {
    $stmt = $conn->prepare("
        SELECT 
            b.id as backup_id,
            b.record_id,
            b.snapshot_data,
            b.deleted_at,
            b.can_restore,
            b.restore_notes,
            u.username as deleted_by_username
        FROM deleted_records_backup b
        LEFT JOIN users u ON b.deleted_by = u.id
        WHERE b.record_type = 'payment'
        ORDER BY b.deleted_at DESC
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    $records = [];
    while ($row = $result->fetch_assoc()) {
        $snapshot = json_decode($row['snapshot_data'], true);
        
        $records[] = [
            'backup_id' => $row['backup_id'],
            'record_id' => $row['record_id'],
            'owner_name' => $snapshot['owner_name'] ?? 'N/A',
            'payment_amount' => $snapshot['payment_amount'] ?? 0,
            'payment_method' => $snapshot['payment_method'] ?? 'N/A',
            'payment_date' => $snapshot['payment_date'] ?? 'N/A',
            'status' => $snapshot['status'] ?? 'N/A',
            'deleted_at' => $row['deleted_at'],
            'deleted_by' => $row['deleted_by_username'] ?? 'Unknown',
            'can_restore' => (bool)$row['can_restore'],
            'restore_notes' => $row['restore_notes']
        ];
    }
    
    return $records;
}
?>

