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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

try {
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
    
    // Get current prices
    $stmt = $pdo->query("SELECT * FROM lot_prices ORDER BY id DESC LIMIT 1");
    $config = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$config) {
        // Insert default values if no config exists
        $pdo->exec("INSERT INTO lot_prices (standard_price, deluxe_price, premium_price, interest_1year, interest_2year, interest_3year, interest_4year, interest_5year, spot_cash_discount, atneed_markup, down_payment_percentage) 
                    VALUES (76000.00, 78000.00, 80000.00, 16.00, 17.00, 18.00, 19.00, 20.00, 8.00, 30.00, 20.00)");
        $stmt = $pdo->query("SELECT * FROM lot_prices ORDER BY id DESC LIMIT 1");
        $config = $stmt->fetch(PDO::FETCH_ASSOC);
    }
    
    echo json_encode([
        'success' => true,
        'config' => [
            'standard_price' => $config['standard_price'],
            'deluxe_price' => $config['deluxe_price'],
            'premium_price' => $config['premium_price'],
            'interest_1year' => $config['interest_1year'],
            'interest_2year' => $config['interest_2year'],
            'interest_3year' => $config['interest_3year'],
            'interest_4year' => $config['interest_4year'],
            'interest_5year' => $config['interest_5year'],
            'spot_cash_discount' => $config['spot_cash_discount'] ?? '8.00',
            'atneed_markup' => $config['atneed_markup'] ?? '30.00',
            'down_payment_percentage' => $config['down_payment_percentage'] ?? '20.00'
        ]
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>

