<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: PUT, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    // Get the ID from query parameters - accept any value
    $id = $_GET['id'] ?? '';
    
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Accept any data without strict validation - balanced fields
    $first_name = sanitize_name($data['first_name'] ?? '');
    $last_name = sanitize_name($data['last_name'] ?? '');
    $middle_name = sanitize_name($data['middle_name'] ?? '');
    $email = $data['email'] ?? '';
    $phone = $data['phone'] ?? '';
    $alternate_phone = $data['alternate_phone'] ?? '';
    $date_of_birth = $data['date_of_birth'] ?? '';
    $gender = $data['gender'] ?? '';
    $civil_status = $data['civil_status'] ?? '';
    $street_address = $data['street_address'] ?? '';
    $city = $data['city'] ?? '';
    $province = $data['province'] ?? '';
    $emergency_contact_name = sanitize_name($data['emergency_contact_name'] ?? '');
    $emergency_contact_phone = $data['emergency_contact_phone'] ?? '';
    $occupation = $data['occupation'] ?? '';
    $employer = $data['employer'] ?? '';
    $monthly_income = $data['monthly_income'] ?? '';
    $last_payment_date = $data['last_payment_date'] ?? '';
    $status = $data['status'] ?? 'active';

    if ($email && !is_valid_email($email)) {
        echo json_encode(['success' => false, 'message' => 'Email must be a valid .com address (e.g. name@gmail.com)']);
        exit;
    }

    // Update customer using prepared statement - balanced fields
    $sql = "UPDATE customers SET 
            first_name = ?, 
            last_name = ?, 
            middle_name = ?,
            email = ?, 
            phone = ?, 
            alternate_phone = ?,
            date_of_birth = ?,
            gender = ?,
            civil_status = ?,
            street_address = ?,
            city = ?,
            province = ?,
            emergency_contact_name = ?,
            emergency_contact_phone = ?,
            occupation = ?,
            employer = ?,
            monthly_income = ?,
            last_payment_date = ?,
            status = ? 
            WHERE id = ?";
    
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute([
        $first_name, $last_name, $middle_name, $email, $phone, $alternate_phone, $date_of_birth, 
        $gender, $civil_status, $street_address, $city, $province, $emergency_contact_name, 
        $emergency_contact_phone, $occupation, $employer, $monthly_income, $last_payment_date, $status, $id
    ]);

    if ($result) {
        // Record activity
        $actorId = get_actor_user_id();
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Updated',
            'Customer',
            "Customer '$first_name $last_name' updated",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        echo json_encode(['success' => true, 'message' => 'Customer updated successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update customer']);
    }
    
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