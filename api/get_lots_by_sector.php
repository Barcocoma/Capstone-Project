<?php
// get_lots_by_sector.php
// Returns lot data for a specific sector including positioning coordinates and burial information

header('Content-Type: application/json');
// Allow both root and subfolder deployments
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require_once __DIR__ . '/config.php';

// Get parameters
$garden = isset($_GET['garden']) ? $_GET['garden'] : '';
$sector = isset($_GET['sector']) ? $_GET['sector'] : '';
if (!$garden || !$sector) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing garden or sector parameter']);
    exit;
}

// Use local mapping data only (no external Project2 dependency)
require_once __DIR__ . '/mapping/lot_positions.php';
$positionsWithSize = [];
$standardSize = ['width' => 24, 'height' => 45];
if (class_exists('LotConfig')) { 
    $sectorSize = LotConfig::getSectorSize($garden, $sector);
    if ($sectorSize) {
        $standardSize = $sectorSize;
    }
}
if (isset($lotPositions[$garden][$sector])) {
    foreach ($lotPositions[$garden][$sector] as $blockNumber => $lotsCfg) {
        $positionsWithSize[$blockNumber] = [];
        foreach ($lotsCfg as $lotNumber => $position) {
            $positionsWithSize[$blockNumber][$lotNumber] = array_merge($position, $standardSize);
        }
    }
}

// Use local lot type mapping only (no external Project2 dependency)
require_once __DIR__ . '/mapping/lot_type_config.php';

// Load current lot prices from DB to override default mapping prices
$CURRENT_PRICES = [
    'standard' => 70000.00,
    'deluxe' => 73000.00,
    'premium' => 76000.00,
];
try {
    if (isset($pdo)) {
        $cfg = $pdo->query("SELECT standard_price, deluxe_price, premium_price FROM lot_prices ORDER BY id DESC LIMIT 1");
        if ($row = $cfg->fetch(PDO::FETCH_ASSOC)) {
            $CURRENT_PRICES['standard'] = (float)($row['standard_price'] ?? $CURRENT_PRICES['standard']);
            $CURRENT_PRICES['deluxe']   = (float)($row['deluxe_price']   ?? $CURRENT_PRICES['deluxe']);
            $CURRENT_PRICES['premium']  = (float)($row['premium_price']  ?? $CURRENT_PRICES['premium']);
        }
    }
} catch (Throwable $e) { /* keep defaults on error */ }

// Pull DB data for this garden/sector
$dbLots = [];
try {
    $sql = "
    SELECT 
        l.id,
        l.lot_number,
        l.status,
        l.customer_id,
        l.vault_option,
        l.lower_body,
        l.upper_body,
        l.lower_bone,
        l.upper_bone,
        CONCAT(u.first_name, ' ', COALESCE(u.middle_name,''), ' ', u.last_name) AS owner_name,
        u.contact_number AS owner_contact,
        b.block_number,
        s.name AS sector_name,
        g.name AS garden_name
    FROM gardens g
    JOIN sectors s ON s.garden_id = g.id
    JOIN blocks b ON b.sector_id = s.id
    JOIN lots l ON l.block_id = b.id
    LEFT JOIN users u ON l.customer_id = u.id
    WHERE g.name = ? AND s.name = ?
    ORDER BY b.block_number, l.lot_number
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$garden, $sector]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $key = $row['block_number'] . ':' . $row['lot_number'];
        $dbLots[$key] = $row;
    }
} catch (Throwable $e) {
    // fail soft; still return positional lots
}

// Fetch deceased records for all lots in this garden/sector
$deceasedByLotId = [];
try {
    $drSql = "
    SELECT 
        dr.id,
        dr.name,
        dr.date_of_birth,
        dr.date_of_death,
        dr.burial_date,
        dr.status AS deceased_status,
        dr.cause_of_death,
        dr.funeral_home,
        dr.notes,
        l.id AS lot_id,
        b.block_number,
        l.lot_number
    FROM deceased_records dr
    JOIN lots l ON dr.lot_id = l.id
    JOIN blocks b ON l.block_id = b.id
    JOIN sectors s ON b.sector_id = s.id
    JOIN gardens g ON s.garden_id = g.id
    WHERE g.name = ? AND s.name = ? AND dr.deleted_at IS NULL
    ORDER BY dr.burial_date ASC, dr.id ASC
    ";
    $drStmt = $pdo->prepare($drSql);
    $drStmt->execute([$garden, $sector]);
    while ($r = $drStmt->fetch(PDO::FETCH_ASSOC)) {
        $lotId = (int)$r['lot_id'];
        if (!isset($deceasedByLotId[$lotId])) { $deceasedByLotId[$lotId] = []; }
        $deceasedByLotId[$lotId][] = [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'dateOfBirth' => $r['date_of_birth'],
            'dateOfDeath' => $r['date_of_death'],
            'burialDate' => $r['burial_date'],
            'status' => $r['deceased_status'],
            'causeOfDeath' => $r['cause_of_death'],
            'funeralHome' => $r['funeral_home'],
            'notes' => $r['notes']
        ];
    }
} catch (Throwable $e) {
    // ignore
}

$lots = [];
// Enumerate from positioning data so lots can appear even without DB inserts
foreach ($positionsWithSize as $blockNumber => $lotsInBlock) {
    foreach ($lotsInBlock as $lotNumber => $coords) {
        $key = $blockNumber . ':' . $lotNumber;
        $row = $dbLots[$key] ?? null;

        $type = resolve_lot_type($garden, $sector, (int)$blockNumber);
        $typeDetails = get_lot_type_details($type);

        $lot = [
            'id' => $row['id'] ?? null,
            'lotNumber' => (int)$lotNumber,
            'type' => $type,
            'class' => $typeDetails['label'],
            'area' => $typeDetails['typicalAreaSqm'],
            'status' => isset($row['status']) ? strtolower($row['status']) : 'available',
            // Use current prices from lot_prices table (fallback to mapping defaults)
            'price' => isset($CURRENT_PRICES[$type]) ? $CURRENT_PRICES[$type] : $typeDetails['basePrice'],
            'ownerId' => isset($row['customer_id']) ? (int)$row['customer_id'] : null,
            'owner' => $row['owner_name'] ?? null,
            'ownerContact' => $row['owner_contact'] ?? null,
            'blockNumber' => (int)$blockNumber,
            'sectorName' => $row['sector_name'] ?? $sector,
            'gardenName' => $row['garden_name'] ?? $garden,
            'typeDetails' => $typeDetails,
            'coordinates' => $coords,
        ];

        // Vault details (always include; default to no selection and zeros)
        $lot['vault'] = [
            'option' => $row['vault_option'] ?? null,
            'lower_body' => isset($row['lower_body']) ? (int)$row['lower_body'] : 0,
            'upper_body' => isset($row['upper_body']) ? (int)$row['upper_body'] : 0,
            'lower_bone' => isset($row['lower_bone']) ? (int)$row['lower_bone'] : 0,
            'upper_bone' => isset($row['upper_bone']) ? (int)$row['upper_bone'] : 0,
        ];

        // Deceased records array if any
        if (!empty($lot['id']) && isset($deceasedByLotId[(int)$lot['id']])) {
            $lot['deceasedRecords'] = $deceasedByLotId[(int)$lot['id']];
        } else {
            $lot['deceasedRecords'] = [];
        }

        $lots[] = $lot;
    }
}

echo json_encode(['lots' => $lots]);
