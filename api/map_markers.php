<?php
// map_markers.php
// Returns static infrastructure markers used across all maps

header('Content-Type: application/json');
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '*';
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Helper to compute midpoint between two lat/lng pairs
function midpoint($a, $b) {
    return [
        'lat' => ($a['lat'] + $b['lat']) / 2,
        'lng' => ($a['lng'] + $b['lng']) / 2,
    ];
}

// Base points provided
$mainGate = [ 'lat' => 14.259766592217202, 'lng' => 121.1646436819092 ];

$chapelP1 = [ 'lat' => 14.259676372959497, 'lng' => 121.16372605302982 ];
$chapelP2 = [ 'lat' => 14.259420315337264, 'lng' => 121.16390844324835 ];
$chapelCenter = midpoint($chapelP1, $chapelP2);

$guardHouse = [ 'lat' => 14.259677672751433, 'lng' => 121.16466683785359 ];

$toilet1 = [ 'lat' => 14.26097060090428, 'lng' => 121.16379836646003 ];
$toilet2 = [ 'lat' => 14.259497349841995, 'lng' => 121.16253915702774 ];

$parkingFrom = [ 'lat' => 14.259425788140618, 'lng' => 121.16436626927081 ];
$parkingTo   = [ 'lat' => 14.259892410689833, 'lng' => 121.16417046800765 ];
$parkingCenter = midpoint($parkingFrom, $parkingTo);

// Feature list supports point and segment markers
// Each has a title and color for consistent rendering on satellite imagery
$features = [
    [ 'kind' => 'point', 'title' => 'Main Gate', 'lat' => $mainGate['lat'], 'lng' => $mainGate['lng'], 'color' => '#2563eb' ],
    // Chapel covers two buildings → render across the span as a segment
    [ 'kind' => 'segment', 'title' => 'Chapel', 'from' => $chapelP1, 'to' => $chapelP2, 'color' => '#8b5cf6' ],
    [ 'kind' => 'point', 'title' => 'Guard House', 'lat' => $guardHouse['lat'], 'lng' => $guardHouse['lng'], 'color' => '#f97316' ],
    [ 'kind' => 'point', 'title' => 'Toilet', 'lat' => $toilet1['lat'], 'lng' => $toilet1['lng'], 'color' => '#22c55e' ],
    [ 'kind' => 'point', 'title' => 'Toilet', 'lat' => $toilet2['lat'], 'lng' => $toilet2['lng'], 'color' => '#22c55e' ],
    // Parking spans a range → render along the span
    [ 'kind' => 'segment', 'title' => 'Parking Area', 'from' => $parkingFrom, 'to' => $parkingTo, 'color' => '#0ea5e9' ],
];

echo json_encode([ 'points' => $features ]);


