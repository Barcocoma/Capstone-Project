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
    // Align with our customers table columns; join to users for name/email/contact
    $sql = "SELECT c.id, u.first_name, u.middle_name, u.last_name, u.email, u.contact_number as phone,
                   c.street_address, c.city, c.province, c.postal_code, c.country,
                   c.emergency_contact_name, c.emergency_contact_phone, c.emergency_contact_relationship,
                   c.occupation, c.employer, c.monthly_income, c.source_of_funds, c.notes,
                   c.registration_date, c.last_payment_date, c.created_at
            FROM customers c
            LEFT JOIN users u ON c.user_id = u.id
            ORDER BY c.id DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $customers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode(['success' => true, 'customers' => $customers]);
    
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