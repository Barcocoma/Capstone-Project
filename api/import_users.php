<?php
require_once 'config.php';

// Check if vendor autoload exists
$vendorAutoload = __DIR__ . '/../vendor/autoload.php';
if (!file_exists($vendorAutoload)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'PhpSpreadsheet library not found. Please run: composer install'
    ]);
    exit;
}

// Check if zip extension is enabled (required for PhpSpreadsheet)
if (!extension_loaded('zip')) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'PHP zip extension is not enabled. Please enable it in php.ini: uncomment "extension=zip" and restart Apache.'
    ]);
    exit;
}

require_once $vendorAutoload;

use PhpOffice\PhpSpreadsheet\IOFactory;

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
    $actorId = get_actor_user_id();
    $actor_role = '';
    
    // Check permissions
    if ($actorId) {
        $actor_stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
        $actor_stmt->execute([$actorId]);
        $actor = $actor_stmt->fetch(PDO::FETCH_ASSOC);
        $actor_role = strtolower($actor['account_type'] ?? '');
        if ($actor_role !== 'admin' && $actor_role !== 'staff') {
            echo json_encode(['success' => false, 'message' => 'Only admin or staff can import users']);
            exit;
        }
    }

    if (!isset($_FILES['file'])) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded. Please select an Excel file.']);
        exit;
    }
    
    if ($_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize in php.ini',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE in HTML form',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            UPLOAD_ERR_EXTENSION => 'File upload stopped by PHP extension'
        ];
        $errorMsg = $errorMessages[$_FILES['file']['error']] ?? 'Unknown upload error';
        echo json_encode(['success' => false, 'message' => "File upload error: $errorMsg"]);
        exit;
    }

    $file = $_FILES['file'];
    $fileExtension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    
    if (!in_array($fileExtension, ['xlsx', 'xls'])) {
        echo json_encode(['success' => false, 'message' => 'Only Excel files (.xlsx, .xls) are allowed']);
        exit;
    }

    try {
        $spreadsheet = IOFactory::load($file['tmp_name']);
        $worksheet = $spreadsheet->getActiveSheet();
        $rows = $worksheet->toArray();
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'message' => 'Error reading Excel file: ' . $e->getMessage()
        ]);
        exit;
    }

    if (count($rows) < 2) {
        echo json_encode(['success' => false, 'message' => 'Excel file must have at least a header row and one data row']);
        exit;
    }

    // Get header row (first row)
    $headers = array_map('trim', $rows[0]);
    
    // Normalize column names - remove spaces, underscores, convert to lowercase
    // This makes "Full Name", "full_name", "FullName" all match "full_name"
    $normalizeColumnName = function($name) {
        $normalized = strtolower(preg_replace('/[\s_\-]+/', '_', trim($name)));
        // Also handle common variations
        $normalized = str_replace(['firstname', 'fname'], 'first_name', $normalized);
        $normalized = str_replace(['lastname', 'lname', 'surname'], 'last_name', $normalized);
        $normalized = str_replace(['fullname', 'complete_name', 'complete_name'], 'full_name', $normalized);
        $normalized = str_replace(['contactnumber', 'phonenumber', 'mobilenumber'], 'contact_number', $normalized);
        $normalized = str_replace(['sexatbirth'], 'sex_at_birth', $normalized);
        return $normalized;
    };
    
    // Expected columns with variations (case-insensitive, space/underscore flexible)
    $expectedColumns = [
        'username' => ['username', 'user_name', 'user id', 'userid'],
        'email' => ['email', 'e-mail', 'email_address'],
        'first_name' => ['first_name', 'firstname', 'first name', 'fname', 'given_name', 'given name'],
        'middle_name' => ['middle_name', 'middlename', 'middle name', 'mname', 'middle_initial'],
        'last_name' => ['last_name', 'lastname', 'last name', 'lname', 'surname', 'family_name', 'family name'],
        'full_name' => ['full_name', 'fullname', 'full name', 'name', 'complete_name', 'complete name'],
        'contact_number' => ['contact_number', 'contactnumber', 'contact number', 'phone', 'mobile', 'phone_number', 'phone number', 'contact', 'mobile_number', 'mobile number'],
        'sex_at_birth' => ['sex_at_birth', 'sexatbirth', 'sex at birth', 'gender', 'sex'],
        'user_type' => ['user_type', 'usertype', 'user type', 'role', 'account_type', 'account type'],
        'street_address' => ['street_address', 'streetaddress', 'street address', 'address', 'street'],
        'city' => ['city'],
        'province' => ['province', 'state'],
        'postal_code' => ['postal_code', 'postalcode', 'postal code', 'zip_code', 'zip code', 'zip'],
        'country' => ['country'],
        'emergency_contact_name' => ['emergency_contact_name', 'emergencycontactname', 'emergency contact name', 'emergency_contact', 'emergency contact'],
        'emergency_contact_phone' => ['emergency_contact_phone', 'emergencycontactphone', 'emergency contact phone', 'emergency_phone', 'emergency phone'],
        'emergency_contact_relationship' => ['emergency_contact_relationship', 'emergencycontactrelationship', 'emergency contact relationship', 'relationship'],
        'occupation' => ['occupation', 'job', 'work'],
        'employer' => ['employer', 'company', 'workplace'],
        'monthly_income' => ['monthly_income', 'monthlyincome', 'monthly income', 'income'],
        'source_of_funds' => ['source_of_funds', 'sourceoffunds', 'source of funds'],
        'notes' => ['notes', 'note', 'remarks', 'comments'],
        // Optional simple payment import fields
        'plan_total' => ['plan_total', 'total_amount', 'total amount', 'price', 'amount', 'lot_price', 'lot price'],
        // Note: we deliberately do NOT include 'lot_id' here, so that a pure deceased
        // import template (which uses `lot_id`) will not be treated as an account
        // import. This prevents auto-creating accounts when uploading a deceased-only
        // Excel file.
        'lot_owned' => ['lot_owned', 'lotowned', 'lot owned', 'lot', 'lot_number', 'lot number'],
        'payment_status' => ['payment_status', 'payment status'],
        'start_month' => ['start_month', 'start month', 'plan_start', 'plan start', 'installment_start', 'installment start'],
        'end_month' => ['end_month', 'end month', 'plan_end', 'plan end', 'installment_end', 'installment end'],
        'deceased_name' => ['deceased_name', 'deceasedname', 'deceased name', 'deceased'],
        'deceased_first_name' => ['deceased_first_name', 'deceasedfirstname', 'deceased first name'],
        'deceased_last_name' => ['deceased_last_name', 'deceasedlastname', 'deceased last name'],
        'deceased_date_of_birth' => ['deceased_date_of_birth', 'deceaseddateofbirth', 'deceased date of birth', 'deceased_dob', 'deceased dob', 'date_of_birth', 'dateofbirth'],
        'deceased_date_of_death' => ['deceased_date_of_death', 'deceaseddateofdeath', 'deceased date of death', 'deceased_dod', 'deceased dod', 'date_of_death', 'dateofdeath'],
        'deceased_burial_date' => ['deceased_burial_date', 'deceasedburialdate', 'deceased burial date', 'burial_date', 'burial date'],
        'lot_id' => ['lot_id', 'lotid', 'lot id'], // For deceased records
        'vault_option' => ['vault_option', 'vaultoption', 'vault option'],
        'deceased_cause_of_death' => ['deceased_cause_of_death', 'deceasedcauseofdeath', 'deceased cause of death', 'cause_of_death', 'cause of death'],
        'deceased_funeral_home' => ['deceased_funeral_home', 'deceasedfuneralhome', 'deceased funeral home', 'funeral_home', 'funeral home'],
        'deceased_status' => ['deceased_status', 'deceasedstatus', 'deceased status', 'status'],
        'deceased_notes' => ['deceased_notes', 'deceasednotes', 'deceased notes']
    ];
    
    // Map headers to column indices (flexible matching)
    $columnMap = [];
    foreach ($expectedColumns as $canonicalName => $variations) {
        foreach ($variations as $variation) {
            $normalized = $normalizeColumnName($variation);
            $idx = array_search($normalized, array_map($normalizeColumnName, $headers));
            if ($idx !== false) {
                $columnMap[$canonicalName] = $idx;
                break; // Found, move to next column
            }
        }
    }

    // Required columns: first_name, last_name, lot_owned
    $hasSeparateNames = isset($columnMap['first_name']) && isset($columnMap['last_name']);
    $hasFullName = isset($columnMap['full_name']);
    
    // Debug info for troubleshooting
    $foundColumns = array_keys($columnMap);
    $allHeaders = implode(', ', $headers);
    
    if (!$hasSeparateNames && !$hasFullName) {
        echo json_encode([
            'success' => false, 
            'message' => "Missing name columns. Need either: (first_name AND last_name) OR (full_name/name).\n\nFound columns in Excel: $allHeaders\n\nDetected columns: " . (empty($foundColumns) ? 'None' : implode(', ', $foundColumns)) . "\n\nTip: Column names can have spaces (e.g., 'Full Name' or 'Contact Number')"
        ]);
        exit;
    }
    
    // Check for lot_owned (required)
    if (!isset($columnMap['lot_owned'])) {
        echo json_encode(['success' => false, 'message' => "Missing required column: lot_owned (e.g., FA2-1)"]);
        exit;
    }
    
    // Function to parse full name into first_name and last_name
    $parseFullName = function($fullName) {
        $fullName = trim($fullName);
        if (empty($fullName)) {
            return ['first_name' => '', 'last_name' => '', 'middle_name' => ''];
        }
        
        // Try "Last Name, First Name" format (with comma)
        if (strpos($fullName, ',') !== false) {
            $parts = array_map('trim', explode(',', $fullName, 2));
            if (count($parts) === 2) {
                // Format: "Dela Cruz, Juan" -> last_name = "Dela Cruz", first_name = "Juan"
                return [
                    'last_name' => sanitize_name($parts[0]),
                    'first_name' => sanitize_name($parts[1]),
                    'middle_name' => ''
                ];
            }
        }
        
        // Try "First Name Last Name" format (space-separated)
        $nameParts = preg_split('/\s+/', $fullName);
        if (count($nameParts) >= 2) {
            // First part is first name, last part is last name, middle parts are middle name
            $first_name = sanitize_name(array_shift($nameParts));
            $last_name = sanitize_name(array_pop($nameParts));
            $middle_name = sanitize_name(implode(' ', $nameParts));
            return [
                'first_name' => $first_name,
                'last_name' => $last_name,
                'middle_name' => $middle_name
            ];
        }
        
        // If only one word, treat as first name
        return [
            'first_name' => sanitize_name($fullName),
            'last_name' => '',
            'middle_name' => ''
        ];
    };

    // Function to generate username from last name + 5 random digits (e.g. BARIRING00301)
    $generateUsername = function($lastName) use ($pdo) {
        // Uppercase, letters only for base
        $base = strtoupper(preg_replace('/[^A-Z]/i', '', (string)$lastName));
        if ($base === '') {
            $base = 'USER';
        }

        $makeDigits = function() {
            return str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
        };

        $attempts = 0;
        do {
            $candidate = $base . $makeDigits();
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
            $stmt->execute([$candidate]);
            $exists = (bool)$stmt->fetch(PDO::FETCH_ASSOC);
            $attempts++;
        } while ($exists && $attempts < 10);

        return $candidate;
    };

    // Load simple pricing config (fallback to defaults if table missing)
    $pricing = [
        'standard_price' => 76000.00,
        'interest_1year' => 16.00,
        'interest_2year' => 17.00,
        'interest_3year' => 18.00,
        'interest_4year' => 19.00,
        'interest_5year' => 20.00,
        'spot_cash_discount' => 8.00,
        'atneed_markup' => 30.00,
    ];
    try {
        $stmt = $pdo->query("SELECT standard_price, interest_1year, interest_2year, interest_3year, interest_4year, interest_5year, spot_cash_discount, atneed_markup FROM lot_prices ORDER BY id DESC LIMIT 1");
        if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            foreach ($pricing as $k => $_) {
                if (isset($row[$k])) {
                    $pricing[$k] = (float)$row[$k];
                }
            }
        }
    } catch (Throwable $e) {
        // If lot_prices table doesn't exist or query fails, just use defaults above
    }

    $results = [
        'success' => true,
        'total' => 0,
        'created' => 0,
        'failed' => 0,
        'errors' => []
    ];

    // Process data rows (skip header row)
    for ($i = 1; $i < count($rows); $i++) {
        $row = $rows[$i];
        
        // Skip empty rows
        if (empty(array_filter($row))) {
            continue;
        }

        $results['total']++;
        
        try {
            // Extract data from row
            $getValue = function($col) use ($row, $columnMap) {
                return isset($columnMap[$col]) ? trim((string)($row[$columnMap[$col]] ?? '')) : '';
            };

            $username = $getValue('username');
            $email = $getValue('email');
            
            // Handle name parsing - support both separate columns and full_name column
            if ($hasSeparateNames) {
                // Use separate first_name and last_name columns
                $first_name = sanitize_name($getValue('first_name'));
                $middle_name = sanitize_name($getValue('middle_name'));
                $last_name = sanitize_name($getValue('last_name'));
            } else {
                // Parse from full_name or name column
                $fullName = $getValue('full_name') ?: $getValue('name');
                $parsed = $parseFullName($fullName);
                $first_name = $parsed['first_name'];
                $last_name = $parsed['last_name'];
                $middle_name = $parsed['middle_name'] ?: sanitize_name($getValue('middle_name'));
            }
            
            $contact_number = $getValue('contact_number');
            $sex_at_birth = strtolower(trim($getValue('sex_at_birth') ?: $getValue('gender')));
            $user_type = strtolower(trim($getValue('user_type') ?: $getValue('role') ?: 'customer'));
            
            // Customer details
            $street_address = $getValue('street_address');
            $city = $getValue('city');
            $province = $getValue('province');
            $postal_code = $getValue('postal_code');
            $country = $getValue('country') ?: 'Philippines';
            $emergency_contact_name = sanitize_name($getValue('emergency_contact_name'));
            $emergency_contact_phone = $getValue('emergency_contact_phone');
            $emergency_contact_relationship = $getValue('emergency_contact_relationship');
            $occupation = $getValue('occupation');
            $employer = $getValue('employer');
            $monthly_income = $getValue('monthly_income');
            $source_of_funds = $getValue('source_of_funds');
            $notes = $getValue('notes');

            // Optional simple payment plan data from Excel
            $plan_total_raw = $getValue('plan_total');
            $payment_status_raw = strtolower($getValue('payment_status'));
            $start_month_raw = $getValue('start_month');
            $end_month_raw = $getValue('end_month');

            // Validation - Required: first_name, last_name, lot_owned
            if (empty($first_name) || empty($last_name)) {
                throw new Exception("Row $i: Missing required fields (first_name or last_name)");
            }
            
            $lot_owned = $getValue('lot_owned');
            if (empty($lot_owned)) {
                throw new Exception("Row $i: Missing required field: lot_owned (e.g., FA2-1)");
            }

            // Flag if row contains any payment info
            $hasPaymentFlag = $payment_status_raw !== '';
            
            // Auto-generate username (LASTNAME + 5 random digits) if not provided
            if (empty($getValue('username'))) {
                $username = $generateUsername($last_name);
            } else {
                $username = trim($getValue('username'));
                // Check if provided username already exists, if so, auto-generate instead
                $check_username = $pdo->prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL");
                $check_username->execute([$username]);
                if ($check_username->rowCount() > 0) {
                    // If provided username exists, auto-generate instead
                    $username = $generateUsername($last_name);
                }
            }
            
            // Email is optional - set to null if empty
            $email = $getValue('email');
            if (!empty($email) && !is_valid_email($email)) {
                throw new Exception("Row $i: Invalid email format. Must be a .com address (e.g. name@gmail.com) or leave empty");
            }
            
            // Contact number is optional - normalize if provided
            $contact_number = $getValue('contact_number');
            if (!empty($contact_number)) {
                // Normalize contact number (add +639 if needed)
                if (!preg_match('/^\+639/', $contact_number)) {
                    $contact_number = preg_replace('/^639?/', '', preg_replace('/[^0-9]/', '', $contact_number));
                    if (strlen($contact_number) === 9) {
                        $contact_number = '+639' . $contact_number;
                    }
                }
            } else {
                $contact_number = ''; // Leave empty if not provided
            }
            
            // Gender is optional - default to empty
            $sex_at_birth = strtolower(trim($getValue('sex_at_birth') ?: $getValue('gender') ?: ''));

            // Normalize role - default to customer
            if ($user_type === 'cemetery_staff') {
                $user_type = 'staff';
            }
            if (!in_array($user_type, ['admin', 'staff', 'cashier', 'customer'])) {
                $user_type = 'customer'; // Default to customer
            }

            // Permission check: staff can only create customers
            if ($actor_role === 'staff' && $user_type !== 'customer') {
                throw new Exception("Row $i: Staff can only create customer accounts");
            }

            // Check if email already exists (if provided)
            if ($email) {
                $check_email = $pdo->prepare("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL");
                $check_email->execute([$email]);
                if ($check_email->rowCount() > 0) {
                    throw new Exception("Row $i: Email '$email' already exists");
                }
            }

            // Generate default password
            $generateStrong = function() {
                $uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
                $lowers = 'abcdefghijkmnopqrstuvwxyz';
                $digits = '23456789';
                $specials = '!@#$%^&*()-_';
                $pool = $uppers . $lowers . $digits . $specials;
                $pick = function($alphabet) { return $alphabet[random_int(0, strlen($alphabet) - 1)]; };
                $chars = [];
                $chars[] = $pick($uppers);
                $chars[] = $pick($lowers);
                $chars[] = $pick($digits);
                $chars[] = $pick($specials);
                for ($j = 0; $j < 6; $j++) { $chars[] = $pick($pool); }
                for ($j = count($chars) - 1; $j > 0; $j--) {
                    $k = random_int(0, $j);
                    $tmp = $chars[$j];
                    $chars[$j] = $chars[$k];
                    $chars[$k] = $tmp;
                }
                return implode('', $chars);
            };
            $password = $generateStrong();
            $hashed_password = password_hash($password, PASSWORD_DEFAULT);

            // Insert user
            $hasDefault = true;
            $hasUsingDefault = true;
            try { $pdo->query("SELECT default_password FROM users LIMIT 0"); } catch (PDOException $e) { $hasDefault = false; }
            try { $pdo->query("SELECT using_default FROM users LIMIT 0"); } catch (PDOException $e) { $hasUsingDefault = false; }

            $email_value = ($email === '') ? null : $email;
            
            if ($hasDefault && $hasUsingDefault) {
                $sql = "INSERT INTO users (username, password, email, account_type, default_password, using_default, first_name, middle_name, last_name, contact_number, sex_at_birth) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$username, $hashed_password, $email_value, $user_type, $password, $first_name, $middle_name, $last_name, $contact_number, $sex_at_birth]);
            } elseif ($hasDefault) {
                $sql = "INSERT INTO users (username, password, email, account_type, default_password, first_name, middle_name, last_name, contact_number, sex_at_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$username, $hashed_password, $email_value, $user_type, $password, $first_name, $middle_name, $last_name, $contact_number, $sex_at_birth]);
            } else {
                $sql = "INSERT INTO users (username, password, email, account_type, first_name, middle_name, last_name, contact_number, sex_at_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$username, $hashed_password, $email_value, $user_type, $first_name, $middle_name, $last_name, $contact_number, $sex_at_birth]);
            }

            $user_id = (int)$pdo->lastInsertId();

            // Insert customer details if role is customer (all fields optional - can be empty)
            if ($user_type === 'customer') {
                try {
                    $custSql = "INSERT INTO customers (user_id, street_address, city, province, postal_code, country, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, occupation, employer, monthly_income, source_of_funds, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                    $custStmt = $pdo->prepare($custSql);
                    $custStmt->execute([
                        $user_id,
                        $street_address ?: '',
                        $city ?: '',
                        $province ?: '',
                        $postal_code ?: '',
                        $country ?: 'Philippines',
                        $emergency_contact_name ?: '',
                        $emergency_contact_phone ?: '',
                        $emergency_contact_relationship ?: '',
                        $occupation ?: '',
                        $employer ?: '',
                        $monthly_income !== '' ? $monthly_income : null,
                        $source_of_funds ?: '',
                        $notes ?: ''
                    ]);
                } catch (Throwable $e) {
                    // Continue even if customer insert fails
                }
            }

            // Record activity
            $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
            $activity_stmt = $pdo->prepare($activity_sql);
            $activity_stmt->execute([
                'Created',
                'User',
                "User '$username' imported from Excel",
                $actorId,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]);

            // Function to parse lot format (e.g., "FA2-1" = F=Garden, A=Sector, 2=Block, 1=Lot)
            $parseLotFormat = function($lotDisplay) {
                // Format: FA2-1 or JA2-5 (GardenInitial + Sector + Block-Lot)
                if (preg_match('/^([A-Z])([A-Z])(\d+)-(\d+)$/i', $lotDisplay, $matches)) {
                    return [
                        'garden_initial' => strtoupper($matches[1]),
                        'sector' => strtoupper($matches[2]),
                        'block' => (int)$matches[3],
                        'lot_number' => (int)$matches[4]
                    ];
                }
                return null;
            };

            // Function to find or create garden/sector/block and get block_id
            $getBlockId = function($gardenInitial, $sector, $block) use ($pdo) {
                // Map garden initial to full garden name
                $gardenNames = [
                    'F' => 'Faith Garden',
                    'H' => 'Hope Garden',
                    'J' => 'Joy Garden',
                    'L' => 'Love Garden',
                    'P' => 'Peace Garden'
                ];
                
                $gardenInitialUpper = strtoupper($gardenInitial);
                $gardenName = $gardenNames[$gardenInitialUpper] ?? null;
                
                if (!$gardenName) {
                    throw new Exception("Unknown garden initial: $gardenInitial (valid: F, H, J, L, P)");
                }
                
                // Find garden by initial (first letter)
                $gardenStmt = $pdo->prepare("SELECT id, name FROM gardens WHERE UPPER(LEFT(name, 1)) = ? LIMIT 1");
                $gardenStmt->execute([$gardenInitialUpper]);
                $garden = $gardenStmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$garden) {
                    // Try to find by exact name
                    $gardenStmt2 = $pdo->prepare("SELECT id, name FROM gardens WHERE name = ? LIMIT 1");
                    $gardenStmt2->execute([$gardenName]);
                    $garden = $gardenStmt2->fetch(PDO::FETCH_ASSOC);
                }
                
                // Create garden if doesn't exist
                if (!$garden) {
                    $gardenIns = $pdo->prepare("INSERT INTO gardens (name) VALUES (?)");
                    $gardenIns->execute([$gardenName]);
                    $gardenId = $pdo->lastInsertId();
                } else {
                    $gardenId = $garden['id'];
                }
                
                // Find sector
                $sectorStmt = $pdo->prepare("SELECT id FROM sectors WHERE garden_id = ? AND UPPER(name) = ? LIMIT 1");
                $sectorStmt->execute([$gardenId, strtoupper($sector)]);
                $sectorRow = $sectorStmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$sectorRow) {
                    // Create sector if doesn't exist
                    $sectorIns = $pdo->prepare("INSERT INTO sectors (garden_id, name) VALUES (?, ?)");
                    $sectorIns->execute([$gardenId, strtoupper($sector)]);
                    $sectorId = $pdo->lastInsertId();
                } else {
                    $sectorId = $sectorRow['id'];
                }
                
                // Find or create block
                $blockStmt = $pdo->prepare("SELECT id FROM blocks WHERE sector_id = ? AND block_number = ? LIMIT 1");
                $blockStmt->execute([$sectorId, $block]);
                $blockRow = $blockStmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$blockRow) {
                    // Create block if doesn't exist
                    $blockIns = $pdo->prepare("INSERT INTO blocks (sector_id, block_number) VALUES (?, ?)");
                    $blockIns->execute([$sectorId, $block]);
                    $blockId = $pdo->lastInsertId();
                } else {
                    $blockId = $blockRow['id'];
                }
                
                return $blockId;
            };

            // Handle lot ownership (required) - must be processed before user creation fails
            $lot_owned = $getValue('lot_owned');
            if (empty($lot_owned)) {
                throw new Exception("Row $i: lot_owned is required (e.g., FA2-1)");
            }
            
            // Process lot ownership
            try {
                $lotInfo = $parseLotFormat($lot_owned);
                if (!$lotInfo) {
                    throw new Exception("Invalid lot format: $lot_owned (expected format: FA2-1)");
                }
                
                $blockId = $getBlockId($lotInfo['garden_initial'], $lotInfo['sector'], $lotInfo['block']);
                
                // Check if lot exists
                $lotCheck = $pdo->prepare("SELECT id, status, customer_id FROM lots WHERE block_id = ? AND lot_number = ?");
                $lotCheck->execute([$blockId, $lotInfo['lot_number']]);
                $existingLot = $lotCheck->fetch(PDO::FETCH_ASSOC);
                
                if ($existingLot) {
                    // Always (re)assign the lot to this imported customer.
                    // Import file is treated as the source of truth, so we keep it simple
                    // and do not block when there is an existing owner.
                    $lotUpdate = $pdo->prepare("UPDATE lots SET status = 'reserved', customer_id = ?, purchase_date = ? WHERE id = ?");
                    $lotUpdate->execute([$user_id, date('Y-m-d'), $existingLot['id']]);
                    $lot_id = (int)$existingLot['id'];
                } else {
                    // Create new lot
                    $lotInsert = $pdo->prepare("INSERT INTO lots (block_id, lot_number, status, customer_id, purchase_date) VALUES (?, ?, 'reserved', ?, ?)");
                    $lotInsert->execute([$blockId, $lotInfo['lot_number'], $user_id, date('Y-m-d')]);
                    $lot_id = (int)$pdo->lastInsertId();
                }
                
                // Record activity
                $lotActivity = $pdo->prepare("INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)");
                $lotActivity->execute([
                    'Created',
                    'Ownership',
                    "Lot $lot_owned assigned to user '$username' during import",
                    $actorId,
                    $_SERVER['REMOTE_ADDR'] ?? '',
                    $_SERVER['HTTP_USER_AGENT'] ?? ''
                ]);
            } catch (Exception $lotError) {
                // Lot ownership is required, so fail the entire row if lot assignment fails
                throw new Exception("Lot ownership error: " . $lotError->getMessage());
            }
            
            // Simple payment plan import (optional)
            if ($hasPaymentFlag) {
                // Parse payment_status: supports:
                // - "6(12)" style (6 months paid of 12 total)
                // - spotcash / atneed / fullypaid (case-insensitive words)
                $termMonths = 0;
                $doneMonths = 0;
                $progressText = trim($payment_status_raw);
                $isFullyPaid = false;
                $paymentWord = preg_replace('/\s+/', '', $payment_status_raw);
                $needsDates = false;

                if (in_array($paymentWord, ['fullypaid','fully_paid','fullpaid','full_paid'], true)) {
                    $isFullyPaid = true;
                    $termMonths = 0;
                    $progressText = 'fullypaid';
                    // For fully paid words, we don't need explicit term dates
                    $needsDates = false;
                } elseif (in_array($paymentWord, ['spotcash','spot_cash'], true)) {
                    $isFullyPaid = true;
                    $termMonths = 0;
                    $progressText = 'spotcash';
                    $needsDates = false;
                } elseif (in_array($paymentWord, ['atneed','at_need'], true)) {
                    $isFullyPaid = true;
                    $termMonths = 0;
                    $progressText = 'atneed';
                    $needsDates = false;
                } else {
                    // Simple term format: "6(12)" = 6 months paid in 12‑month plan
                    if (!preg_match('#^(\d+)\s*\(\s*(\d+)\s*\)$#', $payment_status_raw, $m)) {
                        throw new Exception("Row $i: Invalid payment_status format. Use e.g. 6(12), spotcash, atneed or fullypaid");
                    }
                    $doneMonths = (int)$m[1];
                    $termMonths = (int)$m[2];
                    if ($termMonths <= 0) {
                        throw new Exception("Row $i: payment_status total months must be greater than zero");
                    }
                    // Keep simple: just store as text in notes later; no need to track 'done'
                    $progressText = $doneMonths . '(' . $termMonths . ')';
                    // For installment-style status we require explicit dates
                    $needsDates = true;
                }

                // Determine plan dates
                if ($needsDates) {
                    // Parse dates from M/D/YYYY (e.g. 1/24/2024) to YYYY-MM-DD
                    $parseMdY = function($label, $value) use ($i) {
                        $value = trim($value);
                        if ($value === '') {
                            throw new Exception("Row $i: $label is required when payment_status is set");
                        }
                        $dt = DateTime::createFromFormat('n/j/Y', $value);
                        if (!$dt || $dt->format('n/j/Y') !== $value) {
                            throw new Exception("Row $i: Invalid $label format. Use M/D/YYYY e.g. 1/24/2024");
                        }
                        return $dt;
                    };

                    $startDate = $parseMdY('start_month', $start_month_raw);
                    $endDate = $parseMdY('end_month', $end_month_raw);
                } else {
                    // For spotcash/atneed/fullypaid, we don't require explicit dates.
                    // Use today's date for both start and end just to keep the record valid.
                    $startDate = new DateTime('today');
                    $endDate = new DateTime('today');
                }

                // Do not create duplicate plans for same lot & customer
                $planCheck = $pdo->prepare("SELECT id FROM payment_plans WHERE lot_id = ? AND customer_id = ? AND status != 'cancelled'");
                $planCheck->execute([$lot_id, $user_id]);
                if ($planCheck->fetch()) {
                    // Skip silently to keep import simple
                } else {
                    // Determine total amount:
                    // 1) If Excel provided a numeric plan_total, use it.
                    // 2) Otherwise, use standard pricing with simple interest rules.
                    $total_amount = 0.0;
                    if ($plan_total_raw !== '') {
                        $clean = preg_replace('/[^\d\.]/', '', str_replace(',', '', $plan_total_raw));
                        if (is_numeric($clean)) {
                            $total_amount = (float)$clean;
                        }
                    }
                    if ($total_amount <= 0) {
                        $base = (float)$pricing['standard_price'];
                        // Apply atneed / spotcash adjustments if applicable
                        if ($paymentWord === 'spotcash' || $paymentWord === 'spot_cash') {
                            $disc = (float)$pricing['spot_cash_discount'];
                            $total_amount = round($base * (1 - ($disc / 100)), 2);
                        } elseif ($paymentWord === 'atneed' || $paymentWord === 'at_need') {
                            $markup = (float)$pricing['atneed_markup'];
                            $total_amount = round($base * (1 + ($markup / 100)), 2);
                        } else {
                            // Regular installment with interest by term
                            $years = 1;
                            if ($termMonths === 12) { $years = 1; }
                            elseif ($termMonths === 24) { $years = 2; }
                            elseif ($termMonths === 36) { $years = 3; }
                            elseif ($termMonths === 48) { $years = 4; }
                            elseif ($termMonths >= 60) { $years = 5; }
                            $interestKey = 'interest_' . $years . 'year';
                            $annual_percent = isset($pricing[$interestKey]) ? (float)$pricing[$interestKey] : 0.0;
                            $total_interest_rate = ($annual_percent * $years) / 100.0;
                            $total_amount = round($base * (1 + $total_interest_rate), 2);
                        }
                    }
                    $down_payment = 0.0;
                    $monthly_amount = 0.0;
                    $remaining_balance = 0.0;
                    if ($termMonths > 0) {
                        // Simple equal installment: no interest, no DP
                        $monthly_amount = $total_amount > 0 ? round($total_amount / $termMonths, 2) : 0.0;
                        $paid_amount = $monthly_amount * max(0, $doneMonths);
                        $remaining_balance = max(0, $total_amount - $paid_amount);
                    } else {
                        // Fully-paid style: record total as paid, remaining 0
                        $monthly_amount = 0.0;
                        $remaining_balance = 0.0;
                    }
                    $status = $isFullyPaid ? 'completed' : 'active';
                    $created_by = $actorId ?: $user_id;
                    $planNotes = trim(($notes ? $notes . ' | ' : '') . "Imported payment progress: " . ($isFullyPaid ? $progressText : $progressText));

                    $planSql = "INSERT INTO payment_plans (lot_id, customer_id, total_amount, down_payment, monthly_amount, payment_term_months, start_date, end_date, status, remaining_balance, created_by, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                    $planStmt = $pdo->prepare($planSql);
                    $planStmt->execute([
                        $lot_id,
                        $user_id,
                        $total_amount,
                        $down_payment,
                        $monthly_amount,
                        $termMonths,
                        $startDate->format('Y-m-d'),
                        $endDate->format('Y-m-d'),
                        $status,
                        $remaining_balance,
                        $created_by,
                        $planNotes
                    ]);

                    $payment_plan_id = (int)$pdo->lastInsertId();

                    // If we have partially-paid months like 6(12), mark the first N months as paid
                    if (!$isFullyPaid && $termMonths > 0) {
                        try {
                            // 1) Seed a very simple schedule so progress (X/term) works
                            $schedSql = "INSERT INTO payment_plan_schedule (payment_plan_id, month_number, due_date, amount_due, status)
                                         VALUES (?, ?, ?, ?, ?)";
                            $schedStmt = $pdo->prepare($schedSql);

                            for ($m = 0; $m < $termMonths; $m++) {
                                $monthDate = clone $startDate;
                                $monthDate->modify("+$m month");
                                $dueDate = $monthDate->format('Y-m-01');
                                $monthNumber = $m + 1;
                                $statusVal = ($m < $doneMonths) ? 'paid' : 'pending';
                                $schedStmt->execute([
                                    $payment_plan_id,
                                    $monthNumber,
                                    $dueDate,
                                    $monthly_amount,
                                    $statusVal
                                ]);
                            }

                            // 2) Also create lightweight payment_records for the months already paid
                            if ($doneMonths > 0) {
                                $ownerName = trim($first_name . ' ' . $last_name);
                                $contact = $contact_number;

                                $pr_sql = "INSERT INTO payment_records (lot_id, owner_name, contact, section, payment_amount, payment_method, payment_due_date, last_payment_date, status, payment_date, notes) 
                                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                                $pr_stmt = $pdo->prepare($pr_sql);

                                for ($m = 0; $m < $doneMonths && $m < $termMonths; $m++) {
                                    $monthDate = clone $startDate;
                                    $monthDate->modify("+$m month");
                                    $ym = $monthDate->format('Y-m');
                                    $payDate = $monthDate->format('Y-m-01');

                                $pr_stmt->execute([
                                    $lot_id,
                                    $ownerName,
                                    $contact,
                                    'Imported installment',
                                    $monthly_amount, // treat as actual payment for reporting
                                    'Import',
                                    $payDate,
                                    $payDate,
                                    'Paid',
                                    $payDate,
                                    "Imported - Month: $ym"
                                ]);
                                }
                            }
                        } catch (Throwable $e) {
                            // Non-fatal: ignore if seeding schedule/history fails
                        }
                    }
                }
            }

            // Handle deceased records if data is provided
            $deceased_name_raw = $getValue('deceased_name');
            $deceased_date_of_birth_raw = $getValue('deceased_date_of_birth');
            $deceased_date_of_death_raw = $getValue('deceased_date_of_death');
            $deceased_burial_date_raw = $getValue('deceased_burial_date');
            $deceased_lot_id_raw = $getValue('lot_id');
            $deceased_vault_option = strtolower(trim($getValue('vault_option')));
            $deceased_cause_of_death = $getValue('deceased_cause_of_death');
            $deceased_funeral_home = $getValue('deceased_funeral_home');
            $deceased_status = strtoupper(trim($getValue('deceased_status') ?: 'BURIED'));
            $deceased_notes = $getValue('deceased_notes');
            
            // If deceased_name is empty, try to get the second "full_name" column (after end_month)
            if (empty($deceased_name_raw)) {
                // Find index of end_month column
                $endMonthIdx = isset($columnMap['end_month']) ? $columnMap['end_month'] : null;
                if ($endMonthIdx !== null) {
                    // Look for "full_name" column after end_month
                    for ($j = $endMonthIdx + 1; $j < count($headers); $j++) {
                        $normalizedHeader = $normalizeColumnName($headers[$j]);
                        if ($normalizedHeader === $normalizeColumnName('full_name')) {
                            $deceased_name_raw = trim((string)($row[$j] ?? ''));
                            break;
                        }
                    }
                }
            }
            
            // If we have deceased data, save it
            if (!empty($deceased_name_raw) && !empty($deceased_date_of_birth_raw) && 
                !empty($deceased_date_of_death_raw) && !empty($deceased_burial_date_raw)) {
                
                try {
                    // Parse dates from DD/MM/YYYY or M/D/YYYY format
                    $parseDate = function($dateStr, $label) use ($i) {
                        $dateStr = trim($dateStr);
                        if (empty($dateStr)) {
                            return null;
                        }
                        // Try DD/MM/YYYY format first (from generator)
                        $dt = DateTime::createFromFormat('d/m/Y', $dateStr);
                        if ($dt && $dt->format('d/m/Y') === $dateStr) {
                            return $dt->format('Y-m-d');
                        }
                        // Try M/D/YYYY format (alternative)
                        $dt = DateTime::createFromFormat('n/j/Y', $dateStr);
                        if ($dt && $dt->format('n/j/Y') === $dateStr) {
                            return $dt->format('Y-m-d');
                        }
                        throw new Exception("Row $i: Invalid $label format: $dateStr (expected: DD/MM/YYYY or M/D/YYYY)");
                    };
                    
                    $date_of_birth = $parseDate($deceased_date_of_birth_raw, 'date_of_birth');
                    $date_of_death = $parseDate($deceased_date_of_death_raw, 'date_of_death');
                    $burial_date = $parseDate($deceased_burial_date_raw, 'burial_date');
                    
                    // Parse deceased lot_id if provided, otherwise use lot_owned
                    $deceased_lot_id = null;
                    if (!empty($deceased_lot_id_raw)) {
                        $deceasedLotInfo = $parseLotFormat($deceased_lot_id_raw);
                        if (!$deceasedLotInfo) {
                            throw new Exception("Row $i: Invalid deceased lot_id format: $deceased_lot_id_raw");
                        }
                        $deceasedBlockId = $getBlockId($deceasedLotInfo['garden_initial'], $deceasedLotInfo['sector'], $deceasedLotInfo['block']);
                        $deceasedLotCheck = $pdo->prepare("SELECT id FROM lots WHERE block_id = ? AND lot_number = ?");
                        $deceasedLotCheck->execute([$deceasedBlockId, $deceasedLotInfo['lot_number']]);
                        $deceasedLotRow = $deceasedLotCheck->fetch(PDO::FETCH_ASSOC);
                        if ($deceasedLotRow) {
                            $deceased_lot_id = (int)$deceasedLotRow['id'];
                        } else {
                            // Create lot if doesn't exist
                            $deceasedLotInsert = $pdo->prepare("INSERT INTO lots (block_id, lot_number, status) VALUES (?, ?, 'available')");
                            $deceasedLotInsert->execute([$deceasedBlockId, $deceasedLotInfo['lot_number']]);
                            $deceased_lot_id = (int)$pdo->lastInsertId();
                        }
                    } else {
                        // Use the lot_owned as deceased lot_id
                        $deceased_lot_id = $lot_id;
                    }
                    
                    // Validate vault_option
                    if (empty($deceased_vault_option) || !in_array($deceased_vault_option, ['option1', 'option2', 'option3'], true)) {
                        $deceased_vault_option = 'option1'; // Default
                    }
                    
                    // Normalize status
                    if (!in_array($deceased_status, ['BURIED', 'SCHEDULED'])) {
                        $deceased_status = 'BURIED';
                    }
                    
                    // Insert deceased record
                    $deceasedSql = "INSERT INTO deceased_records (name, date_of_birth, date_of_death, burial_date, lot_id, customer_id, status, cause_of_death, funeral_home, notes) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                    $deceasedStmt = $pdo->prepare($deceasedSql);
                    $deceasedStmt->execute([
                        trim($deceased_name_raw),
                        $date_of_birth,
                        $date_of_death,
                        $burial_date,
                        $deceased_lot_id,
                        $user_id,
                        $deceased_status,
                        $deceased_cause_of_death ?: null,
                        $deceased_funeral_home ?: null,
                        $deceased_notes ?: null
                    ]);
                    
                    // Update vault_option on lot if provided
                    if ($deceased_vault_option && in_array($deceased_vault_option, ['option1', 'option2', 'option3'], true)) {
                        try {
                            $pdo->prepare('UPDATE lots SET vault_option = ? WHERE id = ?')->execute([$deceased_vault_option, $deceased_lot_id]);
                        } catch (Throwable $e) {
                            // Non-fatal: vault_option column might not exist
                        }
                    }
                    
                    // Record activity
                    $deceasedActivity = $pdo->prepare("INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)");
                    $deceasedActivity->execute([
                        'Created',
                        'Deceased',
                        "Deceased record for '{$deceased_name_raw}' imported from Excel - Lot: " . ($deceased_lot_id_raw ?: $lot_owned),
                        $actorId,
                        $_SERVER['REMOTE_ADDR'] ?? '',
                        $_SERVER['HTTP_USER_AGENT'] ?? ''
                    ]);
                } catch (Exception $deceasedError) {
                    // Non-fatal: log error but don't fail the entire row
                    error_log("Deceased record import error for row $i: " . $deceasedError->getMessage());
                }
            }

            $results['created']++;
        } catch (Exception $e) {
            $results['failed']++;
            $results['errors'][] = "Row " . ($i + 1) . ": " . $e->getMessage();
        }
    }

    echo json_encode($results);
} catch (PDOException $e) {
    http_response_code(500);
    error_log('Import users database error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage(),
        'error_type' => 'PDOException'
    ]);
} catch (Exception $e) {
    http_response_code(500);
    error_log('Import users error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
    echo json_encode([
        'success' => false,
        'message' => 'Error processing file: ' . $e->getMessage(),
        'error_type' => get_class($e),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('Import users fatal error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
    echo json_encode([
        'success' => false,
        'message' => 'Fatal error processing file: ' . $e->getMessage(),
        'error_type' => get_class($e)
    ]);
}
?>

