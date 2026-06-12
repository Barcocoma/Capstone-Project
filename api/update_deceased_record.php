<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $id = $_GET['id'] ?? '';
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Accept any data without strict validation
    $updateFields = [];
    $params = [];
    
    $allowedFields = [
        'name', 'date_of_birth', 'date_of_death', 'burial_date', 'lot_id', 'customer_id',
        'status', 'cause_of_death', 'funeral_home', 'notes'
    ];
    
    foreach ($allowedFields as $field) {
        if (isset($input[$field])) {
            $updateFields[] = "$field = ?";
            // Sanitize name field
            if ($field === 'name') {
                $params[] = sanitize_name($input[$field]);
            } else {
                $params[] = $input[$field];
            }
        }
    }

    // Business rules similar to create: status and burial date constraints
    $newStatus = isset($input['status']) ? strtoupper($input['status']) : null;
    $newBurialDate = isset($input['burial_date']) ? $input['burial_date'] : null;
    if ($newStatus === 'PENDING') {
        echo json_encode(['success' => false, 'message' => 'PENDING status is not allowed']);
        exit;
    }
    if ($newStatus === 'SCHEDULED') {
        if (empty($newBurialDate)) {
            echo json_encode(['success' => false, 'message' => 'Burial date is required for SCHEDULED status']);
            exit;
        }
        $today = (new DateTime('today'));
        $bdate = DateTime::createFromFormat('Y-m-d', $newBurialDate);
        if (!$bdate || $bdate < $today) {
            echo json_encode(['success' => false, 'message' => 'Burial date must be today or a future date']);
            exit;
        }
    }
    if (!empty($newBurialDate)) {
        $today = (new DateTime('today'));
        $bdate = DateTime::createFromFormat('Y-m-d', $newBurialDate);
        if ($bdate && $bdate <= $today) {
            // Force status to BURIED immediately
            $updateFields[] = "status = 'BURIED'";
        }
    }
    
    // If no fields to update, just return success
    if (empty($updateFields)) {
        echo json_encode([
            'success' => true,
            'message' => 'No fields to update',
            'updated_id' => $id
        ]);
        exit;
    }
    
    $params[] = $id;
    
    $sql = "UPDATE deceased_records SET " . implode(', ', $updateFields) . " WHERE id = ?";
    $stmt = $pdo->prepare($sql);
    $result = $stmt->execute($params);

    if ($result) {
        // If record is now buried, set lot to occupied
        try {
            $lotId = $input['lot_id'] ?? null;
            if ($lotId) {
                $pdo->prepare("UPDATE lots SET status = 'occupied' WHERE id = ?")->execute([$lotId]);
            }
        } catch (Throwable $e) {}
        // Record activity
        $actorId = get_actor_user_id();
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Updated',
            'Deceased',
            "Deceased record '$id' updated",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Deceased record updated successfully',
            'updated_id' => $id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to update deceased record']);
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
