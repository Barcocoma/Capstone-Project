<?php
/**
 * Session validation middleware
 * Validates user sessions for protected API endpoints
 */

function validateSession() {
    // Start session if not already started
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    
    // Check if user session exists
    if (empty($_SESSION['user']) || !is_array($_SESSION['user'])) {
        return false;
    }
    
    // Validate user still exists in database
    try {
        global $pdo;
        $stmt = $pdo->prepare('SELECT id, username, account_type FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user']['id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            // User no longer exists, destroy session
            $_SESSION = [];
            session_destroy();
            return false;
        }
        
        // Update session with fresh user data
        $_SESSION['user'] = [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'account_type' => $user['account_type']
        ];
        
        return true;
    } catch (Throwable $e) {
        // Database error, assume session is invalid
        $_SESSION = [];
        session_destroy();
        return false;
    }
}

function requireAuth() {
    if (!validateSession()) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Authentication required',
            'code' => 'AUTH_REQUIRED'
        ]);
        exit;
    }
}

function requireRole($allowedRoles) {
    requireAuth();
    
    $userRole = $_SESSION['user']['account_type'] ?? '';
    
    if (!in_array($userRole, $allowedRoles)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'Insufficient permissions',
            'code' => 'INSUFFICIENT_PERMISSIONS'
        ]);
        exit;
    }
}

function getCurrentUser() {
    if (!validateSession()) {
        return null;
    }
    
    return $_SESSION['user'];
}
?>
