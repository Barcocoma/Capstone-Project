<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    exit;
}

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    $amount = $data['amount'] ?? 0;
    $lot_id = $data['lot_id'] ?? '';
    $customer_id = $data['customer_id'] ?? '';
    $description = $data['description'] ?? 'Cemetery Monthly Payment';
    
    if ($amount <= 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Invalid payment amount'
        ]);
        exit;
    }
    
    // Convert amount to centavos (Paymongo expects amount in smallest currency unit)
    $amount_in_centavos = $amount * 100;
    
    // Paymongo API configuration
    $paymongo_secret_key = 'YOUR_PAYMONGO_SECRET_KEY';
    $paymongo_url = 'https://api.paymongo.com/v1/checkout_sessions';
    
    // Prepare Paymongo checkout session data
    $checkout_data = [
        'data' => [
            'attributes' => [
                'send_email_receipt' => false,
                'show_description' => true,
                'show_line_items' => true,
                'cancel_url' => 'http://localhost:5173/dashboard/make-payment?payment=cancelled',
                'success_url' => 'http://localhost:5173/dashboard/customer-dashboard?payment=success',
                'line_items' => [
                    [
                        'currency' => 'PHP',
                        'amount' => $amount_in_centavos,
                        'description' => $description,
                        'name' => 'Monthly Payment',
                        'quantity' => 1
                    ]
                ],
                'description' => 'Divine Life Memorial Park - ' . $description,
                'payment_method_types' => [
                    'gcash',
                    'paymaya'
                ]
            ]
        ]
    ];
    
    // Create cURL request to Paymongo
    $curl = curl_init();
    
    curl_setopt_array($curl, [
        CURLOPT_URL => $paymongo_url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => "",
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => "POST",
        CURLOPT_POSTFIELDS => json_encode($checkout_data),
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/json",
            "accept: application/json",
            "authorization: Basic " . base64_encode($paymongo_secret_key . ':')
        ],
    ]);
    
    $response = curl_exec($curl);
    $http_code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $err = curl_error($curl);
    
    curl_close($curl);
    
    if ($err) {
        echo json_encode([
            'success' => false,
            'message' => 'Payment gateway error: ' . $err
        ]);
        exit;
    }
    
    $paymongo_response = json_decode($response, true);
    
    if ($http_code !== 200 || !isset($paymongo_response['data'])) {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to create payment session: ' . ($paymongo_response['errors'][0]['detail'] ?? 'Unknown error')
        ]);
        exit;
    }
    
    // Store payment session in database for tracking
    $checkout_id = $paymongo_response['data']['id'];
    $checkout_url = $paymongo_response['data']['attributes']['checkout_url'];
    
    // Get who initiated this payment (admin/cashier)
    $initiator_id = get_actor_user_id();
    if (!$initiator_id) {
        $headerUserId = $_SERVER['HTTP_X_USER_ID'] ?? '';
        if ($headerUserId !== '' && ctype_digit((string)$headerUserId)) {
            $candidate = (int)$headerUserId;
            if ($candidate > 0) {
                $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ? AND account_type IN ("admin", "cashier")');
                $stmt->execute([$candidate]);
                if ($stmt->fetchColumn()) {
                    $initiator_id = $candidate;
                }
            }
        }
    }
    
    // Try to insert with initiated_by, fallback if column doesn't exist
    try {
        $sql = "INSERT INTO payment_sessions (checkout_id, lot_id, customer_id, amount, status, created_at) 
                VALUES (?, ?, ?, ?, 'pending', NOW())";
        $stmt = $pdo->prepare($sql);
        $result = $stmt->execute([$checkout_id, $lot_id, $customer_id, $amount]);
        
        // Try to update initiated_by if column exists
        if ($initiator_id && $result) {
            try {
                $update_sql = "UPDATE payment_sessions SET initiated_by = ? WHERE checkout_id = ?";
                $update_stmt = $pdo->prepare($update_sql);
                $update_stmt->execute([$initiator_id, $checkout_id]);
            } catch (PDOException $e) {
                // Column doesn't exist, ignore
            }
        }
    } catch (PDOException $e) {
        // If initiated_by column exists, use it
        try {
            $sql = "INSERT INTO payment_sessions (checkout_id, lot_id, customer_id, amount, status, initiated_by, created_at) 
                    VALUES (?, ?, ?, ?, 'pending', ?, NOW())";
            $stmt = $pdo->prepare($sql);
            $result = $stmt->execute([$checkout_id, $lot_id, $customer_id, $amount, $initiator_id]);
        } catch (PDOException $e2) {
            // Fallback to original
            $sql = "INSERT INTO payment_sessions (checkout_id, lot_id, customer_id, amount, status, created_at) 
                    VALUES (?, ?, ?, ?, 'pending', NOW())";
            $stmt = $pdo->prepare($sql);
            $result = $stmt->execute([$checkout_id, $lot_id, $customer_id, $amount]);
        }
    }
    
    if ($result) {
        // Record activity only if admin/cashier initiated
        if ($initiator_id) {
            $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
            $activity_stmt = $pdo->prepare($activity_sql);
            $activity_stmt->execute([
                'Created',
                'Payment Session',
                "Paymongo checkout session created for lot '$lot_id' - Amount: $amount - Session ID: $checkout_id",
                $initiator_id,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]);
        }
        
        echo json_encode([
            'success' => true,
            'checkout_url' => $checkout_url,
            'checkout_id' => $checkout_id,
            'amount' => $amount
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to store payment session'
        ]);
    }
    
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}
?>
