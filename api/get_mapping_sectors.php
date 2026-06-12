<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$garden = $_GET['garden'] ?? '';
require_once __DIR__ . '/mapping/lot_positions.php';
if (!$garden || !isset($lotPositions[$garden])) { echo json_encode(['success' => false, 'sectors' => []]); exit; }
$sectors = array_keys($lotPositions[$garden]);
sort($sectors);
echo json_encode(['success' => true, 'sectors' => $sectors]);
?>


