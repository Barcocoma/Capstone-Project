<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

try {
    // Ensure lot_vaults exists for vault summaries used in this endpoint
    // Ensure lots has vault columns
    try { $pdo->query("SELECT vault_option FROM lots LIMIT 0"); } catch (PDOException $e) { try { $pdo->exec("ALTER TABLE lots ADD COLUMN vault_option ENUM('option1','option2','option3') NULL"); } catch (PDOException $e2) {} }
    foreach ([
        "ALTER TABLE lots ADD COLUMN lower_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN lower_bone TINYINT(2) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_bone TINYINT(2) NOT NULL DEFAULT 0"
    ] as $sql) { try { $pdo->exec($sql); } catch (PDOException $e) {} }
    // Ensure mapping tables exist to avoid 1146 on first load
    $pdo->exec("CREATE TABLE IF NOT EXISTS gardens (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, area DECIMAL(10,2) NULL, description TEXT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS sectors (id INT AUTO_INCREMENT PRIMARY KEY, garden_id INT NOT NULL, name CHAR(1) NOT NULL, FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS blocks (id INT AUTO_INCREMENT PRIMARY KEY, sector_id INT NOT NULL, block_number INT NOT NULL, description TEXT NULL, FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE)");

    // Derive ownerships from lots + mapping tables (exclude soft-deleted)
    $sql = "SELECT l.id, g.name AS garden, s.name AS sector, b.block_number AS block, l.lot_number AS lotNumber, l.purchase_date AS purchaseDate, l.customer_id,
                   -- Derive status from deceased records to avoid stale data
                   CASE 
                     WHEN EXISTS (SELECT 1 FROM deceased_records d WHERE d.lot_id = l.id AND d.status = 'BURIED' AND d.deleted_at IS NULL) THEN 'occupied'
                     WHEN l.customer_id IS NOT NULL THEN 'reserved'
                     ELSE l.status
                   END AS status,
                   u.first_name, u.middle_name, u.last_name,
                   l.vault_option AS vault_option, l.lower_body, l.upper_body, l.lower_bone, l.upper_bone
            FROM lots l
            JOIN blocks b ON l.block_id=b.id
            JOIN sectors s ON b.sector_id=s.id
            JOIN gardens g ON s.garden_id=g.id
            LEFT JOIN users u ON l.customer_id=u.id
            WHERE l.customer_id IS NOT NULL AND l.deleted_at IS NULL AND (u.deleted_at IS NULL OR u.id IS NULL)
            ORDER BY l.id DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Resolve lot type per block from mapping config
    require_once __DIR__ . '/mapping/lot_type_config.php';
    $ownerships = array_map(function($r) {
        $lt = resolve_lot_type($r['garden'], $r['sector'], (int)$r['block']);
        // Short vault summary for table labels
        $summary = '';
        $opt = strtolower((string)($r['vault_option'] ?? ''));
        $lb = (int)($r['lower_body'] ?? 0);
        $ub = (int)($r['upper_body'] ?? 0);
        $lbn = (int)($r['lower_bone'] ?? 0);
        $ubn = (int)($r['upper_bone'] ?? 0);
        if ($opt === 'option1') { $summary = 'LB ' . $lb . '/1 UB ' . $ub . '/1 B ' . ($lbn + $ubn) . '/4'; }
        else if ($opt === 'option2') { $summary = "LB ${lb}/1 UB bones ${ubn}/5"; }
        else if ($opt === 'option3') { $summary = "LB bones ${lbn}/3 UB bones ${ubn}/3"; }
        return [
            'id' => (int)$r['id'],
            'customerId' => $r['customer_id'] !== null ? (int)$r['customer_id'] : null,
            'customer' => trim(($r['first_name'] ?? '') . ' ' . ($r['middle_name'] ?? '') . ' ' . ($r['last_name'] ?? '')),
            'garden' => $r['garden'],
            'sector' => $r['sector'],
            'block' => (int)$r['block'],
            'lotNumber' => (int)$r['lotNumber'],
            'lotType' => $lt,
            'purchaseDate' => $r['purchaseDate'],
            'status' => $r['status'],
            'vaultSummary' => $summary
        ];
    }, $rows);

    echo json_encode(['success' => true, 'ownerships' => $ownerships]);
    
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