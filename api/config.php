<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

// Database configuration (supports env vars for Docker or other hosts)
$host = getenv('DB_HOST') !== false ? getenv('DB_HOST') : 'localhost';
$username = getenv('DB_USERNAME') !== false ? getenv('DB_USERNAME') : 'root';
$password = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : '';
// Ensure we connect to the CMS schema used by this app
$dbname = getenv('DB_NAME') !== false ? getenv('DB_NAME') : 'cemetery_management';
$port = getenv('DB_PORT') !== false ? (int)getenv('DB_PORT') : 3306;

// Create PDO connection
try {
    $pdo = new PDO("mysql:host=$host;port=$port;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Create database if it doesn't exist
    // Create the database if it doesn't exist
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbname`");
    $pdo->exec("USE `$dbname`");

    // Ensure required mapping tables exist when API is hit directly after fresh setup
    $pdo->exec("CREATE TABLE IF NOT EXISTS gardens (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, area DECIMAL(10,2) NULL, description TEXT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS sectors (id INT AUTO_INCREMENT PRIMARY KEY, garden_id INT NOT NULL, name CHAR(1) NOT NULL, FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS blocks (id INT AUTO_INCREMENT PRIMARY KEY, sector_id INT NOT NULL, block_number INT NOT NULL, description TEXT NULL, FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS lots (id INT PRIMARY KEY AUTO_INCREMENT, block_id INT NOT NULL, lot_number INT NOT NULL, status ENUM('available','reserved','occupied') NOT NULL DEFAULT 'available', customer_id INT NULL, purchase_date DATE NULL, vault_option ENUM('option1','option2','option3') NULL, lower_body TINYINT(1) NOT NULL DEFAULT 0, upper_body TINYINT(1) NOT NULL DEFAULT 0, lower_bone TINYINT(2) NOT NULL DEFAULT 0, upper_bone TINYINT(2) NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_block_lot (block_id, lot_number))");
    
    // Ensure 2FA tables exist
    $pdo->exec("CREATE TABLE IF NOT EXISTS otp_codes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        device_fingerprint VARCHAR(255) NULL,
        expires_at TIMESTAMP NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        pending_email VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_otp (user_id, otp_code),
        INDEX idx_expires (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS trusted_devices (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        device_fingerprint VARCHAR(255) NOT NULL,
        device_info TEXT NULL,
        first_verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_device (user_id, device_fingerprint),
        INDEX idx_user_device (user_id, device_fingerprint),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    
} catch (PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

// Create MySQLi connection (for backup/recovery system and legacy code)
// Database already created by PDO above, so we can safely connect to it
try {
    $conn = new mysqli($host, $username, $password, '', $port);
    if ($conn->connect_error) {
        throw new Exception("MySQLi Connection failed: " . $conn->connect_error);
    }
    $conn->set_charset('utf8');
    // Select the database
    if (!$conn->select_db($dbname)) {
        throw new Exception("Failed to select database: " . $conn->error);
    }
} catch (Exception $e) {
    // MySQLi connection is optional for some operations
    $conn = null;
    error_log("MySQLi connection failed: " . $e->getMessage());
}

// Optional SMTP configuration for outgoing emails (e.g., Gmail)
// Set SMTP_ENABLED to true and provide credentials to enable SMTP sending
if (!defined('SMTP_ENABLED')) {
    define('SMTP_ENABLED', true); // set to true after configuring below
}
if (!defined('SMTP_HOST')) { define('SMTP_HOST', 'smtp.gmail.com'); }
if (!defined('SMTP_PORT')) { define('SMTP_PORT', 587); }
if (!defined('SMTP_USERNAME')) { define('SMTP_USERNAME', 'your-email@gmail.com'); }
if (!defined('SMTP_PASSWORD')) { define('SMTP_PASSWORD', 'your-gmail-app-password'); } // For Gmail, use App Password
if (!defined('SMTP_FROM_EMAIL')) { define('SMTP_FROM_EMAIL', 'no-reply@divinelifememorial.com'); }
if (!defined('SMTP_FROM_NAME')) { define('SMTP_FROM_NAME', 'divine life memorial park'); }

/**
 * Returns the acting user id for activity logging.
 * Reads the X-User-Id request header. Returns null if absent/invalid.
 */
function get_actor_user_id() {
    // 1) Prefer explicit header
    $headerUserId = $_SERVER['HTTP_X_USER_ID'] ?? '';
    if ($headerUserId !== '' && ctype_digit((string)$headerUserId)) {
        $candidate = (int)$headerUserId;
        if ($candidate > 0) {
            try {
                global $pdo;
                $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
                $stmt->execute([$candidate]);
                if ($stmt->fetchColumn()) {
                    return $candidate;
                }
            } catch (Throwable $e) {
                // ignore and fall through to session/null
            }
        }
    }

    // 2) Fallback to session user if available
    if (session_status() !== PHP_SESSION_ACTIVE) {
        // Safe session start; avoids warning if headers already sent
        @session_start();
    }
    if (!empty($_SESSION['user']['id']) && ctype_digit((string)$_SESSION['user']['id'])) {
        $candidate = (int)$_SESSION['user']['id'];
        if ($candidate > 0) {
            try {
                global $pdo;
                $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
                $stmt->execute([$candidate]);
                if ($stmt->fetchColumn()) {
                    return $candidate;
                }
            } catch (Throwable $e) {
                // ignore and fall through to null
            }
        }
    }

    return null;
}

/**
 * Sanitizes a name by removing special characters
 * Only allows: letters, spaces, hyphens, apostrophes, and periods
 * @param string $value - The input value to sanitize
 * @return string - The sanitized value
 */
function sanitize_name($value) {
    if (empty($value)) return '';
    // Only allow letters (including accented characters), spaces, hyphens, apostrophes, and periods
    return preg_replace('/[^a-zA-Z\s\-'."'".'\.À-ÿ]/u', '', $value);
}

/**
 * Validates that the given email is a .com address (e.g. name@gmail.com)
 *
 * @param string $value
 * @return bool
 */
function is_valid_email($value) {
    if (!is_string($value) || $value === '') {
        return false;
    }
    return (bool)preg_match('/^[^@\s]+@[^@\s]+\.com$/i', $value);
}
?>

