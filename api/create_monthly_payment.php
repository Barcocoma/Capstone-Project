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
    
    // Get request data
    $input = json_decode(file_get_contents('php://input'), true);
    
    $lot_id = $input['lot_id'] ?? null;
    $payment_month = $input['payment_month'] ?? null; // Format: YYYY-MM
    $payment_amount = $input['payment_amount'] ?? null;
    $customer_id = $input['customer_id'] ?? null;
    $success_url = isset($input['success_url']) && is_string($input['success_url']) && trim($input['success_url']) !== ''
        ? $input['success_url']
        : 'http://localhost:5173/dashboard/customer-dashboard?payment=success';
    $cancel_url = isset($input['cancel_url']) && is_string($input['cancel_url']) && trim($input['cancel_url']) !== ''
        ? $input['cancel_url']
        : 'http://localhost:5173/dashboard/make-payment?payment=cancelled';
    
    // Debug: Log received data
    error_log("Create Monthly Payment API - Received data: " . json_encode($input));
    
    // Validate required fields with specific error messages
    if (!$lot_id) {
        echo json_encode(['success' => false, 'message' => 'Missing lot_id']);
        exit;
    }
    if (!$payment_month) {
        echo json_encode(['success' => false, 'message' => 'Missing payment_month']);
        exit;
    }
    if (!$payment_amount) {
        echo json_encode(['success' => false, 'message' => 'Missing payment_amount']);
        exit;
    }
    if (!$customer_id) {
        echo json_encode(['success' => false, 'message' => 'Missing customer_id']);
        exit;
    }
    
    // Validate payment amount
    if ($payment_amount <= 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Invalid payment amount: ₱' . $payment_amount . '. Amount must be greater than 0.'
        ]);
        exit;
    }
    
    if ($payment_amount < 20) {
        echo json_encode([
            'success' => false,
            'message' => 'Minimum payment amount is ₱20.00'
        ]);
        exit;
    }
    
    // Validate lot ownership
    $ownership_sql = "SELECT l.id, l.lot_number, b.block_number, s.name as sector_name, g.name as garden_name,
                            CONCAT(COALESCE(s.name, ''), '-', COALESCE(l.lot_number, '')) as display_name
                     FROM lots l
                     LEFT JOIN blocks b ON l.block_id = b.id
                     LEFT JOIN sectors s ON b.sector_id = s.id
                     LEFT JOIN gardens g ON s.garden_id = g.id
                     WHERE l.id = ? AND l.customer_id = ?";
    
    $ownership_stmt = $pdo->prepare($ownership_sql);
    $ownership_stmt->execute([$lot_id, $customer_id]);
    $lot = $ownership_stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$lot) {
        echo json_encode([
            'success' => false,
            'message' => 'Lot not found or not owned by customer'
        ]);
        exit;
    }
    
    // Check if payment for this month already exists
    $existing_sql = "SELECT id FROM payment_records 
                     WHERE lot_id = ? 
                     AND DATE_FORMAT(payment_date, '%Y-%m') = ? 
                     AND status = 'Paid'";
    
    $existing_stmt = $pdo->prepare($existing_sql);
    $existing_stmt->execute([$lot_id, $payment_month]);
    
    if ($existing_stmt->fetch()) {
        echo json_encode([
            'success' => false,
            'message' => 'Payment for this month already exists'
        ]);
        exit;
    }
    
    // Get customer information
    $customer_sql = "SELECT first_name, last_name, contact_number FROM users WHERE id = ?";
    $customer_stmt = $pdo->prepare($customer_sql);
    $customer_stmt->execute([$customer_id]);
    $customer = $customer_stmt->fetch(PDO::FETCH_ASSOC);
    
    $owner_name = $customer ? $customer['first_name'] . ' ' . $customer['last_name'] : 'Unknown';
    $contact = $customer['contact_number'] ?? '';
    
    // Create payment description
    $month_display = date('F Y', strtotime($payment_month . '-01'));
    $description = "Monthly Payment for {$month_display} - Lot {$lot['display_name']}";
    
    // Create Paymongo checkout session
    $paymongo_secret_key = 'YOUR_PAYMONGO_SECRET_KEY';
    $paymongo_url = 'https://api.paymongo.com/v1/checkout_sessions';
    
    $amount_in_centavos = $payment_amount * 100;
    
    $checkout_data = [
        'data' => [
            'attributes' => [
                'send_email_receipt' => false,
                'show_description' => true,
                'show_line_items' => true,
                'cancel_url' => $cancel_url,
                'success_url' => $success_url,
                'line_items' => [
                    [
                        'currency' => 'PHP',
                        'amount' => $amount_in_centavos,
                        'description' => $description,
                        'name' => 'Monthly Payment',
                        'quantity' => 1
                    ]
                ],
                'payment_method_types' => ['gcash', 'paymaya'],
                'description' => $description,
                'metadata' => [
                    'lot_id' => $lot_id,
                    'payment_month' => $payment_month,
                    'customer_id' => $customer_id,
                    'source' => 'monthly_payment'
                ]
            ]
        ]
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $paymongo_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($checkout_data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Basic ' . base64_encode($paymongo_secret_key . ':')
    ]);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code !== 200) {
        throw new Exception('Paymongo API error: HTTP ' . $http_code . ' - ' . $response);
    }
    
    $paymongo_response = json_decode($response, true);
    
    if (!isset($paymongo_response['data']['attributes']['checkout_url'])) {
        throw new Exception('Invalid Paymongo response: ' . $response);
    }
    
    $checkout_url = $paymongo_response['data']['attributes']['checkout_url'];
    $checkout_id = $paymongo_response['data']['id'];
    
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
    
    // Store payment session - try to include initiated_by if column exists
    try {
        $session_sql = "INSERT INTO payment_sessions (checkout_id, lot_id, customer_id, amount, status, payment_month, created_at) 
                        VALUES (?, ?, ?, ?, 'pending', ?, NOW())";
        $session_stmt = $pdo->prepare($session_sql);
        $session_stmt->execute([$checkout_id, $lot_id, $customer_id, $payment_amount, $payment_month]);
        
        // Try to update initiated_by if column exists
        if ($initiator_id) {
            try {
                $update_sql = "UPDATE payment_sessions SET initiated_by = ? WHERE checkout_id = ?";
                $update_stmt = $pdo->prepare($update_sql);
                $update_stmt->execute([$initiator_id, $checkout_id]);
            } catch (PDOException $e) {
                // Column doesn't exist, that's okay - store in notes instead
                $update_notes_sql = "UPDATE payment_sessions SET status = CONCAT(status, '|initiated_by:', ?) WHERE checkout_id = ?";
                try {
                    $update_notes_stmt = $pdo->prepare($update_notes_sql);
                    $update_notes_stmt->execute([$initiator_id, $checkout_id]);
                } catch (PDOException $e2) {
                    // Ignore if this also fails
                }
            }
        }
    } catch (PDOException $e) {
        // If initiated_by column exists, use it
        try {
            $session_sql = "INSERT INTO payment_sessions (checkout_id, lot_id, customer_id, amount, status, payment_month, initiated_by, created_at) 
                            VALUES (?, ?, ?, ?, 'pending', ?, ?, NOW())";
            $session_stmt = $pdo->prepare($session_sql);
            $session_stmt->execute([$checkout_id, $lot_id, $customer_id, $payment_amount, $payment_month, $initiator_id]);
        } catch (PDOException $e2) {
            // Fallback to original
            $session_sql = "INSERT INTO payment_sessions (checkout_id, lot_id, customer_id, amount, status, payment_month, created_at) 
                            VALUES (?, ?, ?, ?, 'pending', ?, NOW())";
            $session_stmt = $pdo->prepare($session_sql);
            $session_stmt->execute([$checkout_id, $lot_id, $customer_id, $payment_amount, $payment_month]);
        }
    }
    
    // Record activity - only record if admin/cashier initiated, not for customer self-service
    if ($initiator_id) {
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Monthly Payment Initiated',
            'Payment Monitoring',
            "Monthly payment initiated for {$month_display} - Lot {$lot['display_name']} - Amount: {$payment_amount} - Checkout ID: {$checkout_id}",
            $initiator_id,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
    }
    
    echo json_encode([
        'success' => true,
        'checkout_url' => $checkout_url,
        'checkout_id' => $checkout_id,
        'message' => "Payment session created for {$month_display}",
        'payment_details' => [
            'lot' => $lot['display_name'],
            'month' => $month_display,
            'amount' => $payment_amount,
            'description' => $description
        ]
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error creating monthly payment: ' . $e->getMessage()
    ]);
}
?>
