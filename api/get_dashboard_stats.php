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

$user_type = $_GET['user_type'] ?? 'admin';

// Get basic stats
$total_lots = $pdo->query("SELECT COUNT(*) AS total FROM lots")->fetchColumn();
$total_owners = $pdo->query("SELECT COUNT(*) AS total FROM lots WHERE customer_id IS NOT NULL")->fetchColumn();
$total_users = $pdo->query("SELECT COUNT(*) AS total FROM users")->fetchColumn();
$total_customers = $pdo->query("SELECT COUNT(*) AS total FROM customers")->fetchColumn();
$total_transactions = $pdo->query("SELECT COUNT(*) AS total FROM payment_records")->fetchColumn();

// Get status counts
$available_lots = $pdo->query("SELECT COUNT(*) AS total FROM lots WHERE status = 'available'")->fetchColumn();
$sold_lots = $pdo->query("SELECT COUNT(*) AS total FROM lots WHERE status = 'occupied'")->fetchColumn();
$reserved_lots = $pdo->query("SELECT COUNT(*) AS total FROM lots WHERE status = 'reserved'")->fetchColumn();

// Get payment stats
$total_payments = $pdo->query("SELECT COALESCE(SUM(payment_amount), 0) AS total FROM payment_records WHERE status = 'Paid'")->fetchColumn();
$pending_payments = $pdo->query("SELECT COUNT(*) AS total FROM payment_records WHERE status = 'Pending'")->fetchColumn();
$paid_transactions = $pdo->query("SELECT COUNT(*) AS total FROM payment_records WHERE status = 'Paid'")->fetchColumn();

// Get user type counts
$admin_users = $pdo->query("SELECT COUNT(*) AS total FROM users WHERE account_type = 'admin'")->fetchColumn();
$staff_users = $pdo->query("SELECT COUNT(*) AS total FROM users WHERE account_type = 'staff'")->fetchColumn();
$customer_users = $pdo->query("SELECT COUNT(*) AS total FROM users WHERE account_type = 'customer'")->fetchColumn();

// Get recent transactions
$recent_transactions = [];
$sql_recent = "SELECT id, lot_id, owner_name, payment_amount, payment_method, payment_date, status 
               FROM payment_records 
               ORDER BY payment_date DESC LIMIT 5";
$stmt_recent = $pdo->prepare($sql_recent);
$stmt_recent->execute();
$recent_transactions = $stmt_recent->fetchAll(PDO::FETCH_ASSOC);

// Get recent users
$recent_users = [];
$sql_users = "SELECT id, username, account_type, first_name, last_name, created_at FROM users ORDER BY created_at DESC LIMIT 5";
$stmt_users = $pdo->prepare($sql_users);
$stmt_users->execute();
$recent_users = $stmt_users->fetchAll(PDO::FETCH_ASSOC);

$stats = [
    'total_lots' => $total_lots,
    'total_owners' => $total_owners,
    'total_users' => $total_users,
    'total_customers' => $total_customers,
    'total_transactions' => $total_transactions,
    'available_lots' => $available_lots,
    'sold_lots' => $sold_lots,
    'reserved_lots' => $reserved_lots,
    'total_payments' => $total_payments,
    'pending_payments' => $pending_payments,
    'paid_transactions' => $paid_transactions,
    'admin_users' => $admin_users,
    'staff_users' => $staff_users,
    'customer_users' => $customer_users,
    'recent_transactions' => $recent_transactions,
    'recent_users' => $recent_users
];

echo json_encode(['success' => true, 'stats' => $stats]); 