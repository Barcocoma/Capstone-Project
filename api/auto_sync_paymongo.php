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
    
    // Get the last sync timestamp
    $last_sync_sql = "SELECT MAX(created_at) as last_sync FROM payment_records WHERE notes LIKE '%Paymongo Payment ID:%'";
    $last_sync_stmt = $pdo->query($last_sync_sql);
    $last_sync_result = $last_sync_stmt->fetch(PDO::FETCH_ASSOC);
    $last_sync = $last_sync_result['last_sync'] ? strtotime($last_sync_result['last_sync']) : strtotime('-1 day');
    
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
    $new_payments = [];
    
    foreach ($data['data'] as $payment) {
        $payment_id = $payment['id'];
        $amount = $payment['attributes']['amount'] / 100; // Convert from centavos to pesos
        $description = $payment['attributes']['description'];
        $billing = $payment['attributes']['billing'];
        $source = $payment['attributes']['source'];
        $paid_at = $payment['attributes']['paid_at'];
        $created_at = date('Y-m-d H:i:s', $payment['attributes']['created_at']);
        
        // Only process payments newer than last sync
        if ($payment['attributes']['created_at'] <= $last_sync) {
            $skipped_count++;
            continue;
        }
        
        // DISABLED: Skip all payments - webhook system handles PayMongo payments
        // This prevents duplicate payment records from being created
        $skipped_count++;
        continue;
        
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
        
        // Only insert if lot_id resolved; otherwise skip to avoid null lot_id
        $insert_sql = "INSERT INTO payment_records (
            lot_id, owner_name, contact, section, payment_amount, 
            payment_method, payment_due_date, last_payment_date, 
            status, payment_date, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $insert_stmt = $pdo->prepare($insert_sql);
        if (!$lot_id) { $skipped_count++; continue; }
        $insert_stmt->execute([
            $lot_id,
            $owner_name,
            $contact,
            'Online Payment',
            $amount,
            $payment_method,
            date('Y-m-d', $paid_at),
            date('Y-m-d', $paid_at),
            'Paid',
            date('Y-m-d H:i:s', $paid_at),
            'Paymongo Payment ID: ' . $payment_id . ' - ' . $description,
            $created_at
        ]);

        // If monthly pattern detected, mark plan schedule row paid and update plan
        try {
            if (preg_match('/Monthly Payment for (\w+) (\d{4})/i', $description, $mm)) {
                $month_number = date('m', strtotime($mm[1] . ' 1'));
                $ym = $mm[2] . '-' . $month_number;
                $plan_q = $pdo->prepare("SELECT id FROM payment_plans WHERE lot_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
                $plan_q->execute([$lot_id]);
                if ($plan = $plan_q->fetch(PDO::FETCH_ASSOC)) {
                    $plan_id = (int)$plan['id'];
                    $pdo->prepare("UPDATE payment_plan_schedule SET status = 'paid', updated_at = NOW() WHERE payment_plan_id = ? AND DATE_FORMAT(due_date, '%Y-%m') = ?")->execute([$plan_id, $ym]);
                    $cnt_total = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id)->fetchColumn();
                    $cnt_paid = (int)$pdo->query("SELECT COUNT(*) FROM payment_plan_schedule WHERE payment_plan_id = " . (int)$plan_id . " AND status = 'paid'")->fetchColumn();
                    if ($cnt_total > 0 && $cnt_paid >= $cnt_total) {
                        $pdo->prepare("UPDATE payment_plans SET status='completed', remaining_balance = 0, updated_at = NOW() WHERE id = ?")->execute([$plan_id]);
                    } else {
                        $pdo->prepare("UPDATE payment_plans SET remaining_balance = GREATEST(remaining_balance - ?, 0), updated_at = NOW() WHERE id = ?")->execute([$amount, $plan_id]);
                    }
                }
            }
        } catch (Throwable $e) { /* ignore */ }
        
        // Record activity if customer found
        if ($customer_id) {
            $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
            $activity_stmt = $pdo->prepare($activity_sql);
            $activity_stmt->execute([
                'Payment Auto-Synced from Paymongo',
                'Payment',
                "Auto-synced Paymongo payment for lot '{$lot_id}' - Amount: {$amount} - Payment ID: {$payment_id}",
                $customer_id,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]);
        }
        
        $synced_count++;
        $new_payments[] = [
            'id' => $payment_id,
            'amount' => $amount,
            'description' => $description,
            'owner_name' => $owner_name
        ];
    }
    
    echo json_encode([
        'success' => true,
        'message' => $synced_count > 0 ? "Auto-synced {$synced_count} new payments from Paymongo" : "No new payments found",
        'synced_count' => $synced_count,
        'skipped_count' => $skipped_count,
        'new_payments' => $new_payments,
        'last_sync' => date('Y-m-d H:i:s', $last_sync)
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error auto-syncing Paymongo payments: ' . $e->getMessage()
    ]);
}
?>
