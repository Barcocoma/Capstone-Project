<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$garden = $_GET['garden'] ?? '';
$sector = $_GET['sector'] ?? '';
require_once __DIR__ . '/mapping/lot_positions.php';
if (!$garden || !$sector || !isset($lotPositions[$garden][$sector])) { echo json_encode(['success' => false, 'blocks' => []]); exit; }
$blocks = array_keys($lotPositions[$garden][$sector]);
sort($blocks, SORT_NUMERIC);
echo json_encode(['success' => true, 'blocks' => $blocks]);
?>


