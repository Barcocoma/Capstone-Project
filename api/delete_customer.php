<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    // Get the ID from query parameters - accept any value
    $id = $_GET['id'] ?? '';

    $actorId = get_actor_user_id();

    // Delete the customer - no validation required
    $stmt = $pdo->prepare("DELETE FROM customers WHERE id = ?");
    $result = $stmt->execute([$id]);

    if ($result) {
        // Record activity
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Deleted',
            'Customer',
            "Customer with ID '$id' deleted",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Customer deleted successfully',
            'deleted_id' => $id
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to delete customer']);
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