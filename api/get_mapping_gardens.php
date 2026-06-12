<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Try to include mapping lot positions from MappingOnly first, then local copy if present
require_once __DIR__ . '/mapping/lot_positions.php';

try {
    if (!isset($lotPositions) || !is_array($lotPositions)) {
        echo json_encode(['success' => false, 'message' => 'Mapping positions not found']);
        exit;
    }
    $gardens = array_keys($lotPositions);
    sort($gardens);
    echo json_encode(['success' => true, 'gardens' => $gardens]);
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>