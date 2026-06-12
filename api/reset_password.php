<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $actorId = get_actor_user_id();
    $data = json_decode(file_get_contents('php://input'), true);
    $id = (int)($data['id'] ?? 0);
    if (!$id) { echo json_encode(['success' => false, 'message' => 'Missing user ID']); exit; }

    // Permission: admin can reset any; staff can reset customers only; users can reset own
    $actorRole = '';
    if ($actorId) {
        $stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
        $stmt->execute([$actorId]);
        $actorRole = strtolower($stmt->fetchColumn() ?: '');
    }
    $targetStmt = $pdo->prepare('SELECT account_type, username FROM users WHERE id = ?');
    $targetStmt->execute([$id]);
    $target = $targetStmt->fetch(PDO::FETCH_ASSOC);
    if (!$target) { echo json_encode(['success' => false, 'message' => 'User not found']); exit; }

    if ($actorId !== $id) {
        if ($actorRole === 'staff' && strtolower($target['account_type']) !== 'customer') {
            echo json_encode(['success' => false, 'message' => 'Staff can reset customers only']);
            exit;
        }
        if ($actorRole !== 'admin' && $actorRole !== 'staff') {
            echo json_encode(['success' => false, 'message' => 'Not authorized']);
            exit;
        }
    }

    $username = $target['username'];
    // Reset to stored default_password; if missing, generate and store
    $defaultStmt = $pdo->prepare('SELECT default_password FROM users WHERE id = ?');
    $defaultStmt->execute([$id]);
    $defaultPassword = $defaultStmt->fetchColumn();
    if (!$defaultPassword) {
        // Generate strong default
        $uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        $lowers = 'abcdefghijkmnopqrstuvwxyz';
        $digits = '23456789';
        $specials = '!@#$%^&*()-_';
        $pool = $uppers . $lowers . $digits . $specials;
        $pick = function($alphabet) { return $alphabet[random_int(0, strlen($alphabet) - 1)]; };
        $chars = [];
        $chars[] = $pick($uppers);
        $chars[] = $pick($lowers);
        $chars[] = $pick($digits);
        $chars[] = $pick($specials);
        for ($i = 0; $i < 6; $i++) { $chars[] = $pick($pool); }
        for ($i = count($chars) - 1; $i > 0; $i--) { $j = random_int(0, $i); $t = $chars[$i]; $chars[$i] = $chars[$j]; $chars[$j] = $t; }
        $defaultPassword = implode('', $chars);
        $pdo->prepare('UPDATE users SET default_password = ? WHERE id = ?')->execute([$defaultPassword, $id]);
    }
    $newPassword = $defaultPassword;
    $hashed = password_hash($newPassword, PASSWORD_DEFAULT);

    $upd = $pdo->prepare('UPDATE users SET password = ? WHERE id = ?');
    $upd->execute([$hashed, $id]);

    // Log
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'User',
        "Password reset for user '$username'",
        $actorId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);

    echo json_encode(['success' => true, 'message' => 'Password reset', 'default_password' => $newPassword]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>

