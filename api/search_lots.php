<?php
header('Content-Type: application/json');
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require_once __DIR__ . '/config.php';

$garden = isset($_GET['garden']) ? trim($_GET['garden']) : '';
$status = isset($_GET['status']) ? trim($_GET['status']) : '';
$q = isset($_GET['q']) ? trim($_GET['q']) : '';
$limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 200;
$offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

try {
    $where = [];
    $params = [];

    if ($garden !== '' && strcasecmp($garden, 'ALL') !== 0) {
        $where[] = 'g.name = ?';
        $params[] = $garden;
    }

    if ($status !== '') {
        $s = strtolower($status);
        if ($s === 'sold') {
            $where[] = "LOWER(l.status) IN ('reserved','occupied')";
        } else if ($s === 'available') {
            $where[] = "LOWER(l.status) = 'available'";
        }
    }

    if ($q !== '') {
        $where[] = "(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.middle_name,''),' ',COALESCE(u.last_name,'')) LIKE ? OR CONCAT(LEFT(g.name,1), s.name, b.block_number, '-', l.lot_number) LIKE ?)";
        $like = '%' . $q . '%';
        $params[] = $like;
        $params[] = $like;
    }

    $whereSql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';

    $sql = "
        SELECT 
            g.name AS garden_name,
            s.name AS sector_name,
            b.block_number,
            l.lot_number,
            LOWER(l.status) AS lot_status,
            CONCAT(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.middle_name,''),' ',COALESCE(u.last_name,'')))) AS owner_name
        FROM lots l
        JOIN blocks b ON l.block_id = b.id
        JOIN sectors s ON b.sector_id = s.id
        JOIN gardens g ON s.garden_id = g.id
        LEFT JOIN users u ON l.customer_id = u.id
        $whereSql
        ORDER BY g.name, s.name, b.block_number, l.lot_number
        LIMIT $limit OFFSET $offset
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $rows = [];
    while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $rows[] = [
            'garden' => $r['garden_name'],
            'sector' => $r['sector_name'],
            'blockNumber' => (int)$r['block_number'],
            'lotNumber' => (int)$r['lot_number'],
            'status' => $r['lot_status'],
            'owner' => $r['owner_name'] ?: '-',
            'deceasedRecords' => []
        ];
    }

    echo json_encode(['success' => true, 'lots' => $rows]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>