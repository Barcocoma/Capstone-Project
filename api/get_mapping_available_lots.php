<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$garden = $_GET['garden'] ?? '';
$sector = $_GET['sector'] ?? '';
$block = isset($_GET['block']) ? intval($_GET['block']) : 0;

require_once __DIR__ . '/mapping/lot_positions.php';
require_once __DIR__ . '/mapping/lot_type_config.php';

try {
    if (!$garden || !$sector || !$block || !isset($lotPositions[$garden][$sector][$block])) {
        echo json_encode(['success' => false, 'lots' => []]);
        exit;
    }

    // Determine number of lots in the block from mapping positions
    $lotsInBlock = $lotPositions[$garden][$sector][$block] ?? [];
    $allLotNumbers = array_keys($lotsInBlock);
    sort($allLotNumbers, SORT_NUMERIC);

    // Fetch occupancy from unified lots table
    require_once 'config.php';
    if (count($allLotNumbers) === 0) { echo json_encode(['success' => true, 'lots' => [], 'lotType' => resolve_lot_type($garden, $sector, $block)]); exit; }
    $placeholders = implode(',', array_fill(0, count($allLotNumbers), '?'));
    $sql = "SELECT l.lot_number, l.status FROM lots l WHERE l.block_id=(SELECT b.id FROM blocks b JOIN sectors s ON b.sector_id=s.id JOIN gardens g ON s.garden_id=g.id WHERE g.name=? AND s.name=? AND b.block_number=?) AND l.lot_number IN ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $params = array_merge([$garden, $sector, $block], $allLotNumbers);
    $stmt->execute($params);
    $taken = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $taken[(int)$row['lot_number']] = strtolower($row['status'] ?? 'available');
    }

    $available = [];
    foreach ($allLotNumbers as $ln) {
        $status = $taken[$ln] ?? 'available';
        if (!in_array($status, ['reserved','occupied'])) {
            $available[] = $ln;
        }
    }

    // Block lot type from mapping config
    $lotType = resolve_lot_type($garden, $sector, $block);

    echo json_encode(['success' => true, 'lots' => $available, 'lotType' => $lotType]);
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>


