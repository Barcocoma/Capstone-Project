<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';

try {
    // Add columns to users table if they don't exist
    $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(50) NULL");
    $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name VARCHAR(50) NULL");
    $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(50) NULL");
    $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number VARCHAR(30) NULL");

    echo json_encode(['success' => true, 'message' => 'Users table migration executed']);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Migration error: ' . $e->getMessage()]);
}
?>

