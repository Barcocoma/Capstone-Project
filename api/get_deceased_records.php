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

try {
    // Auto-bury: if today >= burial_date for scheduled, mark as BURIED
    $auto1 = $pdo->prepare("UPDATE deceased_records SET status = 'BURIED' WHERE status = 'SCHEDULED' AND burial_date IS NOT NULL AND burial_date <= CURRENT_DATE AND deleted_at IS NULL");
    $auto1->execute();
    // Ensure corresponding lots are marked occupied for buried records
    $auto2 = $pdo->prepare("UPDATE lots l JOIN deceased_records d ON d.lot_id = l.id SET l.status = 'occupied' WHERE d.status = 'BURIED' AND l.status <> 'occupied' AND d.deleted_at IS NULL");
    $auto2->execute();

    // Ensure lots has vault columns
    try { $pdo->query("SELECT vault_option FROM lots LIMIT 0"); } catch (PDOException $e) { try { $pdo->exec("ALTER TABLE lots ADD COLUMN vault_option ENUM('option1','option2','option3') NULL"); } catch (PDOException $e2) {} }
    foreach ([
        "ALTER TABLE lots ADD COLUMN lower_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN lower_bone TINYINT(2) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_bone TINYINT(2) NOT NULL DEFAULT 0"
    ] as $sql) { try { $pdo->exec($sql); } catch (PDOException $e) {} }

    $sql = "SELECT d.id, d.name, d.date_of_birth, d.date_of_death, d.burial_date, d.lot_id, d.customer_id, d.status, d.cause_of_death, d.funeral_home, d.notes, d.created_at,
                    l.vault_option AS vault_option, l.lower_body, l.upper_body, l.lower_bone, l.upper_bone,
                    CONCAT(g.name, ' / Sector ', s.name, ' / Block ', b.block_number, ' / Lot ', l.lot_number) AS lot_label
            FROM deceased_records d
            LEFT JOIN lots l ON l.id = d.lot_id
            LEFT JOIN blocks b ON b.id = l.block_id
            LEFT JOIN sectors s ON s.id = b.sector_id
            LEFT JOIN gardens g ON g.id = s.garden_id
            WHERE d.deleted_at IS NULL
            ORDER BY d.created_at DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $deceased_records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode(['success' => true, 'deceased_records' => $deceased_records]);
    
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
