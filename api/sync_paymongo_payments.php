<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

try {
    // Use the existing PDO connection from config.php
    global $pdo;
    
    // Paymongo API configuration
    $paymongo_secret_key = 'YOUR_PAYMONGO_SECRET_KEY';
    $paymongo_url = 'https://api.paymongo.com/v1/payments?limit=50&status=paid';
    
    // Create authorization header
    $auth_header = 'Basic ' . base64_encode($paymongo_secret_key . ':');
    
    // Make request to Paymongo API
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $paymongo_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Authorization: ' . $auth_header
    ]);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code !== 200) {
        throw new Exception('Failed to fetch Paymongo payments: HTTP ' . $http_code);
    }
    
    $data = json_decode($response, true);
    
    if (!isset($data['data'])) {
        throw new Exception('Invalid response from Paymongo API');
    }
    
    $synced_count = 0;
    $skipped_count = 0;
    
    foreach ($data['data'] as $payment) {
        $payment_id = $payment['id'];
        $amount = $payment['attributes']['amount'] / 100; // Convert from centavos to pesos
        $description = $payment['attributes']['description'];
        $billing = $payment['attributes']['billing'];
        $source = $payment['attributes']['source'];
        $paid_at = date('Y-m-d H:i:s', $payment['attributes']['paid_at']);
        $created_at = date('Y-m-d H:i:s', $payment['attributes']['created_at']);
        
        // Extract lot information from description
        $lot_id = null;
        if (preg_match('/Lot\s+([A-Za-z0-9\-]+)/', $description, $matches)) {
            $lot_identifier = $matches[1];
            
            // Try to find the lot by identifier
            $lot_sql = "SELECT l.id FROM lots l 
                       LEFT JOIN blocks b ON l.block_id = b.id
                       LEFT JOIN sectors s ON b.sector_id = s.id 
                       WHERE l.lot_number = ? OR CONCAT(s.name, '-', l.lot_number) = ?";
            $lot_stmt = $pdo->prepare($lot_sql);
            $lot_stmt->execute([$lot_identifier, $lot_identifier]);
            $lot = $lot_stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($lot) {
                $lot_id = $lot['id'];
            }
        }
        
        // DISABLED: Skip all payments - webhook system handles PayMongo payments
        // This prevents duplicate payment records from being created
        $skipped_count++;
        continue;
        
        // Determine payment method from source
        $payment_method = 'Online Payment';
        if (isset($source['type'])) {
            switch ($source['type']) {
                case 'gcash':
                    $payment_method = 'GCash';
                    break;
                case 'paymaya':
                    $payment_method = 'PayMaya';
                    break;
                case 'card':
                    $payment_method = 'Card';
                    break;
                default:
                    $payment_method = 'Online Payment';
            }
        }
        
        // Get customer information if lot is found
        $customer_id = null;
        $owner_name = $billing['name'] ?? 'Unknown';
        $contact = $billing['phone'] ?? '';
        
        if ($lot_id) {
            $customer_sql = "SELECT u.id, u.first_name, u.last_name, u.contact_number, b.block_number, s.name as sector_name, g.name as garden_name 
                            FROM users u 
                            JOIN lots l ON l.customer_id = u.id 
                            LEFT JOIN blocks b ON l.block_id = b.id
                            LEFT JOIN sectors s ON b.sector_id = s.id
                            LEFT JOIN gardens g ON s.garden_id = g.id
                            WHERE l.id = ?";
            $customer_stmt = $pdo->prepare($customer_sql);
            $customer_stmt->execute([$lot_id]);
            $customer = $customer_stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($customer) {
                $customer_id = $customer['id'];
                $owner_name = $customer['first_name'] . ' ' . $customer['last_name'];
                $contact = $customer['contact_number'];
            }
        }
        
        // Determine payment date based on description for monthly payments
        $payment_date = $paid_at; // Default to actual payment date
        $due_date = date('Y-m-d', strtotime($paid_at));
        $last_payment_date = date('Y-m-d', strtotime($paid_at));
        
        // Check if this is a monthly payment by looking for month patterns in description
        if (preg_match('/Monthly Payment for (\w+) (\d{4})/i', $description, $matches)) {
            $month_name = $matches[1];
            $year = $matches[2];
            
            // Convert month name to number
            $month_number = date('m', strtotime($month_name . ' 1'));
            
            if ($month_number) {
                // Set payment date to mid-month of the target month
                $target_month = $year . '-' . $month_number;
                $payment_date = $target_month . '-15 00:00:00';
                $due_date = $target_month . '-01';
                $last_payment_date = $target_month . '-15';
            }
        }
        
        // Insert payment record (allow null lot_id for unmatched lots)
        $insert_sql = "INSERT INTO payment_records (
            lot_id, owner_name, contact, section, payment_amount, 
            payment_method, payment_due_date, last_payment_date, 
            status, payment_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $insert_stmt = $pdo->prepare($insert_sql);
        $insert_stmt->execute([
            $lot_id ?: null,
            $owner_name,
            $contact,
            'Online Payment',
            $amount,
            $payment_method,
            $due_date,
            $last_payment_date,
            'Paid',
            $payment_date,
            'Paymongo Payment ID: ' . $payment_id . ' - ' . $description
        ]);
        
        // Record activity if customer found
        if ($customer_id) {
            $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
            $activity_stmt = $pdo->prepare($activity_sql);
            $activity_stmt->execute([
                'Payment Synced from Paymongo',
                'Payment',
                "Synced Paymongo payment for lot '{$lot_id}' - Amount: {$amount} - Payment ID: {$payment_id}",
                $customer_id,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]);
        }
        
        $synced_count++;
    }
    
    echo json_encode([
        'success' => true,
        'message' => "Successfully synced {$synced_count} payments from Paymongo. {$skipped_count} payments were already synced.",
        'synced_count' => $synced_count,
        'skipped_count' => $skipped_count,
        'total_payments' => count($data['data'])
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error syncing Paymongo payments: ' . $e->getMessage()
    ]);
}
?>
