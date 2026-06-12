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
    exit();
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Migration guard: ensure lots.customer_id references users(id) not customers(id)
    try {
        $fkq = $pdo->prepare("SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lots' AND COLUMN_NAME = 'customer_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1");
        $fkq->execute();
        $fk = $fkq->fetch(PDO::FETCH_ASSOC);
        if ($fk && strtolower($fk['REFERENCED_TABLE_NAME']) !== 'users') {
            $drop = sprintf("ALTER TABLE lots DROP FOREIGN KEY `%s`", $fk['CONSTRAINT_NAME']);
            $pdo->exec($drop);
            $pdo->exec("ALTER TABLE lots ADD CONSTRAINT fk_lots_customer_user FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL");
        }
    } catch (Throwable $e) { /* ignore if insufficient privileges */ }
    
    // Inputs for mapping-driven ownership
    $customer_id = isset($data['customer_id']) ? (int)$data['customer_id'] : 0;
    $garden = trim($data['garden'] ?? '');
    $sector = trim($data['sector'] ?? '');
    $block = isset($data['block']) ? (int)$data['block'] : 0;
    $lotNumber = isset($data['lotNumber']) ? (int)$data['lotNumber'] : 0;
    $lotType = trim($data['lotType'] ?? 'standard');
    if ($customer_id <= 0 || $garden === '' || $sector === '' || $block <= 0 || $lotNumber <= 0) {
        echo json_encode(['success' => false, 'message' => 'Missing required fields']);
        exit;
    }

    // Save into lots table (unified)
    $purchaseDate = date('Y-m-d');
    // Find block_id by garden/sector/block from mapping tables if present; otherwise store derived-only in lots by creating a block row
    $blockId = null;
    try {
        $stmt = $pdo->prepare("SELECT b.id FROM blocks b JOIN sectors s ON b.sector_id=s.id JOIN gardens g ON s.garden_id=g.id WHERE g.name=? AND s.name=? AND b.block_number=?");
        $stmt->execute([$garden, $sector, $block]);
        $blockId = $stmt->fetchColumn();
        if (!$blockId) {
            // create garden/sector/block lazily
            $pdo->beginTransaction();
            $gstmt = $pdo->prepare("INSERT INTO gardens(name) VALUES (?)");
            $gstmt->execute([$garden]);
            $gardenId = $pdo->lastInsertId();
            $sstmt = $pdo->prepare("INSERT INTO sectors(garden_id,name) VALUES (?,?)");
            $sstmt->execute([$gardenId, $sector]);
            $sectorId = $pdo->lastInsertId();
            $bstmt = $pdo->prepare("INSERT INTO blocks(sector_id,block_number) VALUES (?,?)");
            $bstmt->execute([$sectorId, $block]);
            $blockId = $pdo->lastInsertId();
            $pdo->commit();
        }
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }

    // Upsert lot row
    $stmt = $pdo->prepare("SELECT id,status FROM lots WHERE block_id=? AND lot_number=?");
    $stmt->execute([$blockId, $lotNumber]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($existing && in_array($existing['status'], ['reserved','occupied'])) {
        echo json_encode(['success' => false, 'message' => 'Lot already taken']);
        exit;
    }
    if ($existing) {
        $upd = $pdo->prepare("UPDATE lots SET status='reserved', customer_id=?, purchase_date=? WHERE id=?");
        $result = $upd->execute([$customer_id, $purchaseDate, $existing['id']]);
    } else {
        $ins = $pdo->prepare("INSERT INTO lots(block_id, lot_number, status, customer_id, purchase_date) VALUES (?,?,?,?,?)");
        $result = $ins->execute([$blockId, $lotNumber, 'reserved', $customer_id, $purchaseDate]);
    }

    if ($result) {
        // Get the lot_id for the created/updated lot
        $lot_id_query = $pdo->prepare("SELECT id FROM lots WHERE block_id = ? AND lot_number = ?");
        $lot_id_query->execute([$blockId, $lotNumber]);
        $lot_record = $lot_id_query->fetch(PDO::FETCH_ASSOC);
        $lot_id = $lot_record ? $lot_record['id'] : null;
        
        // Record activity
        $actorId = get_actor_user_id();
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Created',
            'Ownership',
            "Reserved lot $lotNumber in Block $block ($garden-$sector) for user ID $customer_id",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
        
        echo json_encode([
            'success' => true, 
            'message' => 'Ownership created successfully',
            'lot_id' => $lot_id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to create ownership']);
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}
?> 