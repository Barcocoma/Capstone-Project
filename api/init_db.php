<?php
// Only set headers if running via web server
if (php_sapi_name() !== 'cli') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Headers: Content-Type");
    header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}

require_once 'config.php';

// Create or normalize users table
$sql = "CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    account_type VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    email VARCHAR(100) UNIQUE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
)";

if ($conn->query($sql) === FALSE) {
    die("Error creating users table: " . $conn->error);
}

// Backfill column renames if older schema exists
// Ensure account_type column exists and migrate from user_type if needed
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(32) NOT NULL DEFAULT 'customer'");
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active'");
$conn->query("UPDATE users SET account_type = user_type WHERE account_type IS NULL OR account_type = ''");

// Migrate email column to allow NULL (for customers without email)
try {
    // Check if email column is NOT NULL
    $check_result = $conn->query("SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS 
                                  WHERE TABLE_SCHEMA = DATABASE() 
                                  AND TABLE_NAME = 'users' 
                                  AND COLUMN_NAME = 'email'");
    if ($check_result && $check_result->num_rows > 0) {
        $row = $check_result->fetch_assoc();
        if ($row['IS_NULLABLE'] === 'NO') {
            // Modify email column to allow NULL
            $conn->query("ALTER TABLE users MODIFY COLUMN email VARCHAR(100) NULL");
        }
    }
} catch (Exception $e) {
    // Ignore errors - column might already be nullable or table might not exist yet
}

// Create default admin account if it doesn't exist (kept for convenience)
$default_admin_password = password_hash('Admin@123', PASSWORD_DEFAULT);
$check_admin = $conn->query("SELECT id FROM users WHERE username = 'admin'");
if ($check_admin->num_rows == 0) {
    $sql = "INSERT INTO users (username, password, account_type, email, first_name, last_name) 
            VALUES ('admin', '$default_admin_password', 'admin', 'admin@cemetery.com', 'System', 'Administrator')";
    $conn->query($sql);
}

// Create default staff account if it doesn't exist
$default_staff_password = password_hash('Staff@123', PASSWORD_DEFAULT);
$check_staff = $conn->query("SELECT id FROM users WHERE username = 'staff1'");
if ($check_staff->num_rows == 0) {
    $sql = "INSERT INTO users (username, password, account_type, email, first_name, last_name) 
            VALUES ('staff1', '$default_staff_password', 'staff', 'staff1@cemetery.com', 'Cemetery', 'Staff')";
    $conn->query($sql);
}

// Create default cashier account if it doesn't exist
$default_cashier_password = password_hash('Cashier@123', PASSWORD_DEFAULT);
$check_cashier = $conn->query("SELECT id FROM users WHERE username = 'cashier1'");
if ($check_cashier->num_rows == 0) {
    $sql = "INSERT INTO users (username, password, account_type, email, first_name, last_name) 
            VALUES ('cashier1', '$default_cashier_password', 'cashier', 'cashier1@cemetery.com', 'Cashier', 'One')";
    $conn->query($sql);
}

echo "Database initialization completed successfully!<br>";
echo "You can now log in with:<br>";
echo "Admin - username: admin, password: admin123<br>";
echo "Staff - username: staff, password: staff123<br>";
?> 