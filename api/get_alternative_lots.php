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

// Only admin can access this
$stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
$stmt->execute([$actorId]);
$actorRole = strtolower($stmt->fetchColumn() ?: '');

if ($actorRole !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden: Admin access required']);
    exit;
}

if (!isset($_GET['original_lot_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing original_lot_id']);
    exit;
}

$originalLotId = intval($_GET['original_lot_id']);

// Check if MySQLi connection is available
if (!isset($conn) || $conn === null) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection error. Please check server configuration.']);
    exit;
}

try {
    // Get the original lot's block to determine lot type
    $stmt = $conn->prepare("
        SELECT l.*, b.block_number, s.name as sector_name, g.name as garden_name
        FROM lots l
        JOIN blocks b ON l.block_id = b.id
        JOIN sectors s ON b.sector_id = s.id
        JOIN gardens g ON s.garden_id = g.id
        WHERE l.id = ?
    ");
    $stmt->bind_param("i", $originalLotId);
    $stmt->execute();
    $result = $stmt->get_result();
    $originalLot = $result->fetch_assoc();
    
    if (!$originalLot) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Original lot not found']);
        exit;
    }
    
    // Determine lot type based on block number
    // This logic should match your lot_type_config.php
    $blockNumber = $originalLot['block_number'];
    $lotType = 'standard'; // default
    
    if ($blockNumber >= 1 && $blockNumber <= 2) {
        $lotType = 'standard';
    } else if ($blockNumber >= 3 && $blockNumber <= 4) {
        $lotType = 'premium';
    } else if ($blockNumber >= 5 && $blockNumber <= 6) {
        $lotType = 'deluxe';
    }
    
    // Get all available lots of the same type
    $availableLots = [];
    
    // Query all available lots
    $stmt = $conn->prepare("
        SELECT l.id, l.lot_number, l.status,
               b.block_number, b.id as block_id,
               s.name as sector_name, s.id as sector_id,
               g.name as garden_name, g.id as garden_id
        FROM lots l
        JOIN blocks b ON l.block_id = b.id
        JOIN sectors s ON b.sector_id = s.id
        JOIN gardens g ON s.garden_id = g.id
        WHERE l.status = 'available' 
        AND l.deleted_at IS NULL
        ORDER BY g.name, s.name, b.block_number, l.lot_number
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    
    while ($lot = $result->fetch_assoc()) {
        $lotBlockNumber = $lot['block_number'];
        $currentLotType = 'standard';
        
        if ($lotBlockNumber >= 1 && $lotBlockNumber <= 2) {
            $currentLotType = 'standard';
        } else if ($lotBlockNumber >= 3 && $lotBlockNumber <= 4) {
            $currentLotType = 'premium';
        } else if ($lotBlockNumber >= 5 && $lotBlockNumber <= 6) {
            $currentLotType = 'deluxe';
        }
        
        // Only include lots of the same type
        if ($currentLotType === $lotType) {
            $availableLots[] = [
                'id' => $lot['id'],
                'display_name' => $lot['garden_name'] . ' / Sector ' . $lot['sector_name'] . ' / Block ' . $lot['block_number'] . ' / Lot ' . $lot['lot_number'],
                'garden_id' => $lot['garden_id'],
                'garden_name' => $lot['garden_name'],
                'sector_id' => $lot['sector_id'],
                'sector_name' => $lot['sector_name'],
                'block_id' => $lot['block_id'],
                'block_number' => $lot['block_number'],
                'lot_number' => $lot['lot_number'],
                'lot_type' => $currentLotType
            ];
        }
    }
    
    // Group by garden
    $groupedLots = [];
    foreach ($availableLots as $lot) {
        $gardenName = $lot['garden_name'];
        if (!isset($groupedLots[$gardenName])) {
            $groupedLots[$gardenName] = [
                'garden_id' => $lot['garden_id'],
                'garden_name' => $gardenName,
                'sectors' => []
            ];
        }
        
        $sectorName = $lot['sector_name'];
        if (!isset($groupedLots[$gardenName]['sectors'][$sectorName])) {
            $groupedLots[$gardenName]['sectors'][$sectorName] = [
                'sector_id' => $lot['sector_id'],
                'sector_name' => $sectorName,
                'blocks' => []
            ];
        }
        
        $blockNumber = $lot['block_number'];
        if (!isset($groupedLots[$gardenName]['sectors'][$sectorName]['blocks'][$blockNumber])) {
            $groupedLots[$gardenName]['sectors'][$sectorName]['blocks'][$blockNumber] = [
                'block_id' => $lot['block_id'],
                'block_number' => $blockNumber,
                'lots' => []
            ];
        }
        
        $groupedLots[$gardenName]['sectors'][$sectorName]['blocks'][$blockNumber]['lots'][] = [
            'id' => $lot['id'],
            'lot_number' => $lot['lot_number'],
            'display_name' => $lot['display_name']
        ];
    }
    
    // Convert to indexed arrays
    $gardens = [];
    foreach ($groupedLots as $garden) {
        $sectors = [];
        foreach ($garden['sectors'] as $sector) {
            $blocks = [];
            foreach ($sector['blocks'] as $block) {
                $blocks[] = $block;
            }
            $sector['blocks'] = $blocks;
            $sectors[] = $sector;
        }
        $garden['sectors'] = $sectors;
        $gardens[] = $garden;
    }
    
    echo json_encode([
        'success' => true,
        'original_lot' => [
            'id' => $originalLot['id'],
            'display_name' => $originalLot['garden_name'] . ' / Sector ' . $originalLot['sector_name'] . ' / Block ' . $originalLot['block_number'] . ' / Lot ' . $originalLot['lot_number'],
            'lot_type' => $lotType
        ],
        'available_lots' => $availableLots,
        'grouped_lots' => $gardens,
        'lot_type' => $lotType,
        'total_available' => count($availableLots)
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
?>

