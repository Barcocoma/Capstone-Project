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

// Use PDO and include new name/contact fields
$stmt = $pdo->prepare("SELECT id, username, account_type as user_type, first_name, middle_name, last_name, contact_number, sex_at_birth, email, created_at FROM users WHERE id = ?");
$stmt->execute([$user_id]);
$result = $stmt;

if ($result->rowCount() === 0) {
    echo json_encode(['success' => false, 'message' => 'User not found']);
    exit;
}

$profile = $result->fetch(PDO::FETCH_ASSOC);
// Attach customer details if the user is a customer
try {
    if (strtolower($profile['user_type'] ?? '') === 'customer') {
        $cstmt = $pdo->prepare("SELECT street_address, city, province, postal_code, country, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, occupation, employer, monthly_income, source_of_funds, notes FROM customers WHERE user_id = ?");
        $cstmt->execute([$user_id]);
        $customer = $cstmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $profile['customer'] = $customer;
    }
} catch (Throwable $e) {}
echo json_encode(['success' => true, 'profile' => $profile]);