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
    // Role-based filtering: staff can only view customers
    $actorId = get_actor_user_id();
    $actorRole = '';
    if ($actorId) {
        $stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
        $stmt->execute([$actorId]);
        $actorRole = strtolower($stmt->fetchColumn() ?: '');
    }
    // Check optional columns (for backwards compatibility if SQL not re-run yet)
    $hasDefault = false; $hasUsingDefault = false;
    try { $pdo->query("SELECT default_password FROM users LIMIT 0"); $hasDefault = true; } catch (PDOException $e) {}
    try { $pdo->query("SELECT using_default FROM users LIMIT 0"); $hasUsingDefault = true; } catch (PDOException $e) {}

    $columns = [
        'id', 'username', 'email', 'account_type as user_type',
        'first_name', 'middle_name', 'last_name', 'contact_number', 'sex_at_birth', 'created_at'
    ];
    if ($hasDefault) { $columns[] = 'default_password'; }
    if ($hasUsingDefault) { $columns[] = 'using_default'; }
    $baseSql = "SELECT " . implode(', ', $columns) . " FROM users";
    $where = ' WHERE deleted_at IS NULL';
    $params = [];
    if ($actorRole === 'staff') {
        $where .= " AND account_type = 'customer'";
    }
    $sql = $baseSql . $where . " ORDER BY created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'users' => $users]);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?> 