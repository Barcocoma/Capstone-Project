<?php
require_once 'config.php';
require_once __DIR__ . '/receipt_helper.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    // Serve PDF download when requested via GET (stream directly without saving)
    if ($method === 'GET' && isset($_GET['format']) && strtolower($_GET['format']) === 'pdf') {
        $paymentId = $_GET['payment_id'] ?? null;
        if (!$paymentId) {
            http_response_code(400);
            echo 'Payment ID is required';
            exit;
        }

        $pdfData = receipt_generate_pdf_binary($paymentId);
        if (!$pdfData) {
            http_response_code(404);
            echo 'Receipt PDF not found';
            exit;
        }

        $filename = 'receipt_' . preg_replace('/[^0-9]/', '', (string)$paymentId) . '.pdf';
        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($pdfData));
        echo $pdfData;
        exit;
    }

    header('Content-Type: application/json');

    if ($method !== 'POST') {
        echo json_encode([
            'success' => false,
            'message' => 'Method not allowed'
        ]);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $paymentId = $data['payment_id'] ?? null;

    if (!$paymentId) {
        echo json_encode([
            'success' => false,
            'message' => 'Payment ID is required'
        ]);
        exit;
    }

    $paymentData = receipt_fetch_payment_details($paymentId);

    if (!$paymentData) {
        echo json_encode([
            'success' => false,
            'message' => 'Payment record not found'
        ]);
        exit;
    }

    $receiptData = receipt_build_payload($paymentData);

    echo json_encode([
        'success' => true,
        'receipt' => $receiptData
    ]);
} catch (Exception $e) {
    if (!headers_sent()) {
        header('Content-Type: application/json');
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error generating receipt: ' . $e->getMessage()
    ]);
}
?>
