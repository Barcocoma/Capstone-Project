<?php
header('Content-Type: application/json');
// Allow both root and subfolder deployments
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
header("Access-Control-Allow-Origin: $origin");
echo json_encode([
  'sectorOverlayOpacity' => .0,
  'directionalOpacity' => 1.0
]);
?>


