<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    exit;
}

try {
    // Get current user info from header or session
    $current_user_id = null;
    $current_user_role = null;
    
    // Try to get from X-User-Id header
    $header_user_id = $_SERVER['HTTP_X_USER_ID'] ?? '';
    if ($header_user_id !== '' && ctype_digit((string)$header_user_id)) {
        $current_user_id = (int)$header_user_id;
    }
    
    // If not in header, try session
    if (!$current_user_id) {
        $actor_id = get_actor_user_id();
        if ($actor_id) {
            $current_user_id = $actor_id;
        }
    }
    
    // Get user role
    if ($current_user_id) {
        $user_stmt = $pdo->prepare("SELECT account_type FROM users WHERE id = ?");
        $user_stmt->execute([$current_user_id]);
        $user_result = $user_stmt->fetch(PDO::FETCH_ASSOC);
        $current_user_role = $user_result ? strtolower($user_result['account_type']) : null;
    }
    
    // Build SQL query based on user role
    // Admin: see activities from admin, staff, cemetery_staff, and cashier (NOT customer)
    // Staff: see activities of all staff accounts (staff and cemetery_staff)
    // Cashier: see only their own activities
    // NOTE: Customer activities are excluded for all roles
    $sql = "SELECT al.id, al.action, al.type, al.details, al.performed_by, al.ip_address, al.created_at, u.username 
            FROM activity_log al 
            LEFT JOIN users u ON al.performed_by = u.id";
    
    $whereConditions = [];
    $params = [];
    
    // Add WHERE clause based on user role
    if ($current_user_role === 'staff' || $current_user_role === 'cemetery_staff') {
        // Staff can see activities of all staff accounts (staff and cemetery_staff)
        // Exclude customer activities
        $whereConditions[] = "(u.account_type IN ('staff', 'cemetery_staff') OR al.performed_by IS NULL)";
        $whereConditions[] = "(u.account_type IS NULL OR u.account_type != 'customer')";
    } elseif ($current_user_role === 'cashier') {
        // Cashier: only their own activities
        if ($current_user_id) {
            $whereConditions[] = "al.performed_by = ?";
            $params[] = $current_user_id;
            // Cashier's own activities are already filtered, but ensure no customer activities
            $whereConditions[] = "(u.account_type IS NULL OR u.account_type != 'customer')";
        } else {
            $whereConditions[] = "1=0"; // No results if no user ID
        }
    } else {
        // Admin and null roles: see activities from admin, staff, cemetery_staff, and cashier (NOT customer)
        $whereConditions[] = "(u.account_type IN ('admin', 'staff', 'cemetery_staff', 'cashier') OR al.performed_by IS NULL)";
        // Explicitly exclude customer activities
        $whereConditions[] = "(u.account_type IS NULL OR u.account_type != 'customer')";
    }
    
    // Add WHERE clause if we have conditions
    if (!empty($whereConditions)) {
        $sql .= " WHERE " . implode(" AND ", $whereConditions);
    }
    
    $sql .= " ORDER BY al.created_at DESC LIMIT 100";
    
    $stmt = $pdo->prepare($sql);
    
    // Execute with parameters based on role
    if (!empty($params)) {
        $stmt->execute($params);
    } else {
        $stmt->execute();
    }
    
    $activityLogs = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $activityLogs[] = [
            'id' => $row['id'],
            'action' => $row['action'],
            'type' => $row['type'],
            'details' => $row['details'],
            'user' => $row['username'] ? $row['username'] : 'System',
            'timestamp' => $row['created_at'],
            'ip_address' => $row['ip_address'] ?? 'N/A'
        ];
    }
    
    echo json_encode(['success' => true, 'activityLogs' => $activityLogs]);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?> 