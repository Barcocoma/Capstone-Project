<?php
require_once __DIR__ . '/config.php';

/**
 * Fetch full payment record with customer and lot associations.
 *
 * @param int|string $paymentId
 * @return array|null
 */
function receipt_fetch_payment_details($paymentId) {
    global $pdo;

    if (!$paymentId) {
        return null;
    }

    $query = "
        SELECT 
            pr.*,
            u.first_name,
            u.middle_name,
            u.last_name,
            u.email,
            u.contact_number,
            l.lot_number,
            b.block_number,
            s.name AS sector_name,
            g.name AS garden_name,
            CONCAT(g.name, ' - ', s.name, '-', l.lot_number) AS lot_display,
            c.street_address,
            c.city,
            c.province
        FROM payment_records pr
        LEFT JOIN lots l ON pr.lot_id = l.id
        LEFT JOIN users u ON l.customer_id = u.id
        LEFT JOIN customers c ON u.id = c.user_id
        LEFT JOIN blocks b ON l.block_id = b.id
        LEFT JOIN sectors s ON b.sector_id = s.id
        LEFT JOIN gardens g ON s.garden_id = g.id
        WHERE pr.id = ?
    ";

    $stmt = $pdo->prepare($query);
    $stmt->execute([$paymentId]);

    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    return $result ?: null;
}

/**
 * Build structured receipt payload reused by JSON, email, and PDF.
 *
 * @param array $paymentData
 * @return array
 */
function receipt_build_payload(array $paymentData) {
    $middleName = !empty($paymentData['middle_name']) ? $paymentData['middle_name'] . ' ' : '';
    $customerName = trim(
        ($paymentData['first_name'] ?? '') . ' ' .
        $middleName .
        ($paymentData['last_name'] ?? '')
    );

    $customerAddress = trim(
        ($paymentData['street_address'] ?? '') . ' ' .
        ($paymentData['city'] ?? '') . ' ' .
        ($paymentData['province'] ?? '')
    );

    $receiptNumber = date('Y-m-d', strtotime($paymentData['created_at'])) . '-' .
        str_pad($paymentData['id'], 5, '0', STR_PAD_LEFT);

    $paymentDescription = "Monthly Payment";
    $notesSource = $paymentData['notes'] ?? '';
    if (!empty($notesSource) && strpos($notesSource, 'Monthly Payment for') !== false) {
        if (preg_match('/Monthly Payment for ([A-Za-z]+\s+\d{4})/i', $notesSource, $matches)) {
            $paymentDescription = "Monthly Payment for " . $matches[1];
        }
    }

    return [
        'receipt_number' => $receiptNumber,
        'transaction_date' => $paymentData['created_at'],
        'payment_date' => $paymentData['payment_date'],
        'company_info' => [
            'name' => 'Divine Life Memorial Park',
            'address' => 'Memorial Park Address',
            'phone' => '+63 XXX XXX XXXX',
            'email' => 'info@divinelifememorial.com'
        ],
        'customer_info' => [
            'name' => $customerName,
            'email' => $paymentData['email'] ?? '',
            'contact' => $paymentData['contact_number'] ?? '',
            'address' => $customerAddress
        ],
        'lot_info' => [
            'lot_display' => $paymentData['lot_display'] ?? 'N/A',
            'garden' => $paymentData['garden_name'] ?? 'N/A',
            'sector' => $paymentData['sector_name'] ?? 'N/A',
            'block' => $paymentData['block_number'] ?? 'N/A',
            'lot_number' => $paymentData['lot_number'] ?? 'N/A'
        ],
        'payment_info' => [
            'description' => $paymentDescription,
            'amount' => (float)($paymentData['payment_amount'] ?? 0),
            'method' => $paymentData['payment_method'] ?? '',
            'status' => $paymentData['status'] ?? '',
            'due_date' => $paymentData['payment_due_date'] ?? '',
            'notes' => $paymentData['notes'] ?? ''
        ],
        'receipt_footer' => [
            'thank_you_message' => 'Thank you for your payment!',
            'contact_info' => 'For inquiries, please contact us at the above information.',
            'generated_at' => date('Y-m-d H:i:s'),
            'processed_by' => 'Cashier'
        ]
    ];
}

/**
 * Build printable HTML layout for the receipt PDF.
 *
 * @param array $payload
 * @return string
 */
function receipt_build_pdf_html(array $payload) {
    $amount = number_format($payload['payment_info']['amount'], 2);
    $paymentDate = $payload['payment_date']
        ? date('F d, Y h:i A', strtotime($payload['payment_date']))
        : date('F d, Y h:i A', strtotime($payload['transaction_date']));
    $transactionDate = date('F d, Y h:i A', strtotime($payload['transaction_date']));
    $dueDate = $payload['payment_info']['due_date']
        ? date('F d, Y', strtotime($payload['payment_info']['due_date']))
        : 'N/A';
    $notes = htmlspecialchars($payload['payment_info']['notes'] ?? '', ENT_QUOTES, 'UTF-8');

    $company = $payload['company_info'];
    $customer = $payload['customer_info'];
    $lot = $payload['lot_info'];
    $payment = $payload['payment_info'];

    $companyName = htmlspecialchars($company['name'] ?? '', ENT_QUOTES, 'UTF-8');
    $companyAddress = htmlspecialchars($company['address'] ?? '', ENT_QUOTES, 'UTF-8');
    $companyPhone = htmlspecialchars($company['phone'] ?? '', ENT_QUOTES, 'UTF-8');
    $companyEmail = htmlspecialchars($company['email'] ?? '', ENT_QUOTES, 'UTF-8');

    $customerName = htmlspecialchars($customer['name'] ?: 'N/A', ENT_QUOTES, 'UTF-8');
    $customerEmail = htmlspecialchars($customer['email'] ?: 'N/A', ENT_QUOTES, 'UTF-8');
    $customerContact = htmlspecialchars($customer['contact'] ?: 'N/A', ENT_QUOTES, 'UTF-8');
    $customerAddress = htmlspecialchars($customer['address'] ?: 'N/A', ENT_QUOTES, 'UTF-8');

    $lotDisplay = htmlspecialchars($lot['lot_display'] ?? 'N/A', ENT_QUOTES, 'UTF-8');
    $lotGarden = htmlspecialchars($lot['garden'] ?? 'N/A', ENT_QUOTES, 'UTF-8');
    $lotSector = htmlspecialchars($lot['sector'] ?? 'N/A', ENT_QUOTES, 'UTF-8');
    $lotBlock = htmlspecialchars($lot['block'] ?? 'N/A', ENT_QUOTES, 'UTF-8');
    $lotNumber = htmlspecialchars($lot['lot_number'] ?? 'N/A', ENT_QUOTES, 'UTF-8');

    $paymentDescription = htmlspecialchars($payment['description'] ?? '', ENT_QUOTES, 'UTF-8');
    $paymentMethod = htmlspecialchars($payment['method'] ?? '', ENT_QUOTES, 'UTF-8');
    $paymentStatus = htmlspecialchars($payment['status'] ?? '', ENT_QUOTES, 'UTF-8');

    $html = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Receipt {$payload['receipt_number']}</title>
    <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 24px; font-size: 12px; }
        .receipt-wrapper { max-width: 720px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
        .company-name { font-size: 20px; font-weight: bold; color: #0f172a; }
        .section-title { font-weight: bold; font-size: 14px; color: #334155; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin-bottom: 20px; }
        .info-item { display: flex; flex-direction: column; gap: 2px; }
        .info-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.75px; }
        .info-value { font-size: 13px; color: #111827; font-weight: 600; }
        .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .table th { text-align: left; background: #f1f5f9; color: #1f2937; font-size: 12px; padding: 10px; border-bottom: 1px solid #e2e8f0; }
        .table td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        .amount { font-size: 16px; color: #16a34a; font-weight: bold; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #6b7280; }
        .badge { display: inline-flex; align-items: center; background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; }
    </style>
</head>
<body>
    <div class="receipt-wrapper">
        <div class="header">
            <div>
                <div class="company-name">{$companyName}</div>
                <div style="font-size: 12px; color: #475569; margin-top: 4px;">
                    {$companyAddress}<br>
                    {$companyPhone} &bull; {$companyEmail}
                </div>
            </div>
            <div style="text-align: right;">
                <div class="badge">Official Receipt</div>
                <div style="margin-top: 12px; font-size: 12px; color: #1f2937;">
                    Receipt #: <strong>{$payload['receipt_number']}</strong><br>
                    Issued: {$transactionDate}
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Customer Information</div>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Name</div>
                    <div class="info-value">{$customerName}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Email</div>
                    <div class="info-value">{$customerEmail}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Contact</div>
                    <div class="info-value">{$customerContact}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Address</div>
                    <div class="info-value">{$customerAddress}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Lot Details</div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Display</th>
                        <th>Garden</th>
                        <th>Sector</th>
                        <th>Block</th>
                        <th>Lot #</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{$lotDisplay}</td>
                        <td>{$lotGarden}</td>
                        <td>{$lotSector}</td>
                        <td>{$lotBlock}</td>
                        <td>{$lotNumber}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="section">
            <div class="section-title">Payment Summary</div>
            <table class="table">
                <tbody>
                    <tr>
                        <td style="width: 45%;">Description</td>
                        <td>{$paymentDescription}</td>
                    </tr>
                    <tr>
                        <td>Payment Method</td>
                        <td>{$paymentMethod}</td>
                    </tr>
                    <tr>
                        <td>Status</td>
                        <td>{$paymentStatus}</td>
                    </tr>
                    <tr>
                        <td>Due Date</td>
                        <td>{$dueDate}</td>
                    </tr>
                    <tr>
                        <td>Payment Date</td>
                        <td>{$paymentDate}</td>
                    </tr>
                    <tr>
                        <td>Amount Paid</td>
                        <td class="amount">₱{$amount}</td>
                    </tr>
                </tbody>
            </table>
HTML;

    if (!empty($notes)) {
        $html .= <<<HTML
            <div style="margin-top: 16px;">
                <div class="section-title" style="margin-bottom: 4px;">Notes</div>
                <div style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; font-size: 12px;">
                    {$notes}
                </div>
            </div>
HTML;
    }

    $footer = $payload['receipt_footer'];
    $html .= <<<HTML
        </div>

        <div class="footer">
            <div style="font-weight: 600; color: #1e293b;">{$footer['thank_you_message']}</div>
            <div>{$footer['contact_info']}</div>
            <div style="margin-top: 8px;">Generated: {$footer['generated_at']}</div>
            <div>Processed by: {$footer['processed_by']}</div>
        </div>
    </div>
</body>
</html>
HTML;

    return $html;
}

/**
 * Return the local absolute path to the receipt PDF directory.
 *
 * @return string
 */
function receipt_pdf_directory() {
    $dir = __DIR__ . '/../public/receipts';
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    return $dir;
}

/**
 * Get PDF file path for a payment id.
 *
 * @param int|string $paymentId
 * @return string
 */
function receipt_pdf_path($paymentId) {
    $filename = 'receipt_' . preg_replace('/[^0-9]/', '', (string)$paymentId) . '.pdf';
    return receipt_pdf_directory() . DIRECTORY_SEPARATOR . $filename;
}

/**
 * Generate PDF as binary data without saving to disk (optimized for on-demand generation).
 *
 * @param int|string $paymentId
 * @return string|null Returns PDF binary data or null on failure
 */
function receipt_generate_pdf_binary($paymentId) {
    $paymentData = receipt_fetch_payment_details($paymentId);
    if (!$paymentData) {
        return null;
    }

    $payload = receipt_build_payload($paymentData);
    $html = receipt_build_pdf_html($payload);

    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (file_exists($autoload)) {
        require_once $autoload;
    }

    if (!class_exists('Dompdf\\Dompdf')) {
        error_log('Dompdf is not available. Run composer install to enable PDF generation.');
        return null;
    }

    try {
        $options = new Dompdf\Options();
        $options->set('isRemoteEnabled', true);
        $dompdf = new Dompdf\Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4');
        $dompdf->render();

        return $dompdf->output();
    } catch (Throwable $e) {
        error_log('Failed to generate receipt PDF: ' . $e->getMessage());
        return null;
    }
}

/**
 * Generate PDF and save to temporary file (for email attachments only).
 * File is automatically deleted after use.
 *
 * @param int|string $paymentId
 * @return string|null Returns temporary file path or null on failure
 */
function receipt_generate_pdf_temp($paymentId) {
    $pdfData = receipt_generate_pdf_binary($paymentId);
    if (!$pdfData) {
        return null;
    }

    // Create temporary file that will be auto-deleted
    $tempFile = tempnam(sys_get_temp_dir(), 'receipt_' . $paymentId . '_');
    if ($tempFile === false) {
        return null;
    }

    file_put_contents($tempFile, $pdfData);
    return $tempFile;
}

/**
 * Generate or retrieve an existing receipt PDF for the provided payment record.
 * DEPRECATED: Use receipt_generate_pdf_binary() for on-demand generation instead.
 * Kept for backward compatibility but no longer saves to disk.
 *
 * @param int|string $paymentId
 * @param bool $forceRegenerate
 * @return string|null Returns temporary file path or null on failure
 */
function receipt_generate_pdf($paymentId, $forceRegenerate = false) {
    // Use temporary file instead of permanent storage
    return receipt_generate_pdf_temp($paymentId);
}

/**
 * Convenience wrapper to ensure a receipt PDF exists (temporary file).
 *
 * @param int|string $paymentId
 * @return string|null Returns temporary file path or null on failure
 */
function receipt_ensure_pdf($paymentId) {
    return receipt_generate_pdf_temp($paymentId);
}

/**
 * Build an API download URL for the receipt PDF, routed through generate_receipt.php.
 *
 * @param int|string $paymentId
 * @return string
 */
function receipt_pdf_download_url($paymentId) {
    return '/api/generate_receipt.php?payment_id=' . urlencode($paymentId) . '&format=pdf';
}

?>

