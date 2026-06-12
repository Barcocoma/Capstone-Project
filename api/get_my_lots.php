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

$user_id = $_GET['user_id'] ?? 0;
if (!$user_id) {
    echo json_encode(['success' => false, 'message' => 'Missing user_id']);
    exit;
}

// Get user's name
$sql_user = "SELECT full_name FROM users WHERE id = $user_id";
$result_user = $conn->query($sql_user);
if ($result_user->num_rows === 0) {
    echo json_encode(['success' => false, 'message' => 'User not found']);
    exit;
}
$user = $result_user->fetch_assoc();
$owner_name = $user['full_name'];

// Get lots owned by this user from ownership_records
$sql = "SELECT 
    id,
    lot_id as lot_number,
    owner_name,
    contact,
    purchase_date,
    section,
    lot_type,
    status
FROM ownership_records 
WHERE owner_name = '$owner_name'
ORDER BY id DESC";

$result = $conn->query($sql);
$lots = [];
while ($row = $result->fetch_assoc()) {
    $lots[] = $row;
}

echo json_encode(['success' => true, 'lots' => $lots]); 