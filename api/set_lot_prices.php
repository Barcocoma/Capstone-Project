<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $standard_price = isset($data['standard_price']) ? floatval($data['standard_price']) : 70000.00;
    $deluxe_price = isset($data['deluxe_price']) ? floatval($data['deluxe_price']) : 73000.00;
    $premium_price = isset($data['premium_price']) ? floatval($data['premium_price']) : 76000.00;
    $interest_1year = isset($data['interest_1year']) ? floatval($data['interest_1year']) : 0.00;
    $interest_2year = isset($data['interest_2year']) ? floatval($data['interest_2year']) : 0.00;
    $interest_3year = isset($data['interest_3year']) ? floatval($data['interest_3year']) : 0.00;
    $interest_4year = isset($data['interest_4year']) ? floatval($data['interest_4year']) : 0.00;
    $interest_5year = isset($data['interest_5year']) ? floatval($data['interest_5year']) : 0.00;
    $spot_cash_discount = isset($data['spot_cash_discount']) ? floatval($data['spot_cash_discount']) : 0.00;
    $atneed_markup = isset($data['atneed_markup']) ? floatval($data['atneed_markup']) : 30.00;
    $down_payment_percentage = isset($data['down_payment_percentage']) ? floatval($data['down_payment_percentage']) : 20.00;
    
    // Validate inputs
    if ($standard_price < 0 || $deluxe_price < 0 || $premium_price < 0 || 
        $interest_1year < 0 || $interest_1year > 100 ||
        $interest_2year < 0 || $interest_2year > 100 ||
        $interest_3year < 0 || $interest_3year > 100 ||
        $interest_4year < 0 || $interest_4year > 100 ||
        $interest_5year < 0 || $interest_5year > 100 ||
        $spot_cash_discount < 0 || $spot_cash_discount > 100 ||
        $atneed_markup < 0 || $atneed_markup > 100 ||
        $down_payment_percentage < 0 || $down_payment_percentage > 100) {
        echo json_encode(['success' => false, 'message' => 'Invalid price or discount values']);
        exit();
    }
    
    // Check if lot_prices table exists, if not create it
    $createTable = "CREATE TABLE IF NOT EXISTS lot_prices (
        id INT PRIMARY KEY AUTO_INCREMENT,
        standard_price DECIMAL(10,2) DEFAULT 76000.00,
        deluxe_price DECIMAL(10,2) DEFAULT 78000.00,
        premium_price DECIMAL(10,2) DEFAULT 80000.00,
        interest_1year DECIMAL(5,2) DEFAULT 16.00,
        interest_2year DECIMAL(5,2) DEFAULT 17.00,
        interest_3year DECIMAL(5,2) DEFAULT 18.00,
        interest_4year DECIMAL(5,2) DEFAULT 19.00,
        interest_5year DECIMAL(5,2) DEFAULT 20.00,
        spot_cash_discount DECIMAL(5,2) DEFAULT 8.00,
        atneed_markup DECIMAL(5,2) DEFAULT 30.00,
        down_payment_percentage DECIMAL(5,2) DEFAULT 20.00,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )";
    $pdo->exec($createTable);
    
    // Check if spot_cash_discount column exists, if not add it
    try {
        $columns = $pdo->query("SHOW COLUMNS FROM lot_prices LIKE 'spot_cash_discount'")->fetchAll();
        if (count($columns) === 0) {
            $pdo->exec("ALTER TABLE lot_prices ADD COLUMN spot_cash_discount DECIMAL(5,2) DEFAULT 8.00 AFTER interest_5year");
        }
    } catch (Exception $e) {
        // Column might already exist or other error, continue
    }
    
    // Check if atneed_markup column exists, if not add it
    try {
        $columns = $pdo->query("SHOW COLUMNS FROM lot_prices LIKE 'atneed_markup'")->fetchAll();
        if (count($columns) === 0) {
            $pdo->exec("ALTER TABLE lot_prices ADD COLUMN atneed_markup DECIMAL(5,2) DEFAULT 30.00 AFTER spot_cash_discount");
        }
    } catch (Exception $e) {
        // Column might already exist or other error, continue
    }
    
    // Check if down_payment_percentage column exists, if not add it
    try {
        $columns = $pdo->query("SHOW COLUMNS FROM lot_prices LIKE 'down_payment_percentage'")->fetchAll();
        if (count($columns) === 0) {
            $pdo->exec("ALTER TABLE lot_prices ADD COLUMN down_payment_percentage DECIMAL(5,2) DEFAULT 20.00 AFTER atneed_markup");
        }
    } catch (Exception $e) {
        // Column might already exist or other error, continue
    }
    
    // Check if a config row exists
    $stmt = $pdo->query("SELECT id FROM lot_prices LIMIT 1");
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($existing) {
        // Update existing config
        $updateStmt = $pdo->prepare("UPDATE lot_prices SET 
            standard_price = ?, 
            deluxe_price = ?, 
            premium_price = ?, 
            interest_1year = ?,
            interest_2year = ?,
            interest_3year = ?,
            interest_4year = ?,
            interest_5year = ?,
            spot_cash_discount = ?,
            atneed_markup = ?,
            down_payment_percentage = ?
            WHERE id = ?");
        $updateStmt->execute([$standard_price, $deluxe_price, $premium_price, $interest_1year, $interest_2year, $interest_3year, $interest_4year, $interest_5year, $spot_cash_discount, $atneed_markup, $down_payment_percentage, $existing['id']]);
    } else {
        // Insert new config
        $insertStmt = $pdo->prepare("INSERT INTO lot_prices 
            (standard_price, deluxe_price, premium_price, interest_1year, interest_2year, interest_3year, interest_4year, interest_5year, spot_cash_discount, atneed_markup, down_payment_percentage) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $insertStmt->execute([$standard_price, $deluxe_price, $premium_price, $interest_1year, $interest_2year, $interest_3year, $interest_4year, $interest_5year, $spot_cash_discount, $atneed_markup, $down_payment_percentage]);
    }
    
    // Record activity
    $actorId = get_actor_user_id();
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'Configuration',
        "Lot prices updated - Standard: ₱" . number_format($standard_price, 2) . " - Deluxe: ₱" . number_format($deluxe_price, 2) . " - Premium: ₱" . number_format($premium_price, 2),
        $actorId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
    
    echo json_encode([
        'success' => true,
        'message' => 'Price configuration updated successfully'
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>

