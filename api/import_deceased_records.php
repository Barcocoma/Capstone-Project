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

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded or upload error']);
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

    // Get header row
    $headers = array_map('trim', $rows[0]);
    
    // Function to normalize column names for flexible matching
    $normalizeColumnName = function($name) {
        return strtolower(preg_replace('/[^a-z0-9]/', '', $name));
    };
    
    // Expected columns with variations
    $expectedColumns = [
        'first_name' => ['first_name', 'firstname', 'first name', 'fname'],
        'last_name' => ['last_name', 'lastname', 'last name', 'lname'],
        'middle_name' => ['middle_name', 'middlename', 'middle name', 'mname'],
        'full_name' => ['full_name', 'fullname', 'full name', 'name'],
        'date_of_birth' => ['date_of_birth', 'dateofbirth', 'date of birth', 'dob', 'birth_date', 'birthdate', 'birth date'],
        'date_of_death' => ['date_of_death', 'dateofdeath', 'date of death', 'dod', 'death_date', 'deathdate', 'death date'],
        'burial_date' => ['burial_date', 'burialdate', 'burial date', 'burial'],
        'customer_id' => ['customer_id', 'customerid', 'customer id', 'customer'],
        'lot_id' => ['lot_id', 'lotid', 'lot id', 'lot', 'lot_owned', 'lotowned', 'lot owned'],
        'vault_option' => ['vault_option', 'vaultoption', 'vault option', 'vault'],
        'status' => ['status'],
        'cause_of_death' => ['cause_of_death', 'causeofdeath', 'cause of death', 'cause'],
        'funeral_home' => ['funeral_home', 'funeralhome', 'funeral home', 'funeral'],
        'notes' => ['notes', 'note', 'remarks', 'comments']
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

    // Required columns: name (full or separate), dates, lot_id, vault_option
    $hasSeparateNames = isset($columnMap['first_name']) && isset($columnMap['last_name']);
    $hasFullName = isset($columnMap['full_name']);
    
    if (!$hasSeparateNames && !$hasFullName) {
        $allHeaders = implode(', ', $headers);
        echo json_encode([
            'success' => false, 
            'message' => "Missing name columns. Need either: (first_name AND last_name) OR (full_name/name).\n\nFound columns in Excel: $allHeaders"
        ]);
        exit;
    }
    
    // Check for required columns
    $missingColumns = [];
    if (!isset($columnMap['date_of_birth'])) $missingColumns[] = 'date_of_birth';
    if (!isset($columnMap['date_of_death'])) $missingColumns[] = 'date_of_death';
    if (!isset($columnMap['burial_date'])) $missingColumns[] = 'burial_date';
    if (!isset($columnMap['lot_id'])) $missingColumns[] = 'lot_id (format: FA2-1)';
    if (!isset($columnMap['vault_option'])) $missingColumns[] = 'vault_option (option1, option2, or option3)';
    
    if (!empty($missingColumns)) {
        echo json_encode(['success' => false, 'message' => "Missing required columns: " . implode(', ', $missingColumns)]);
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
    
    // Function to parse date in M/D/YYYY format and convert to YYYY-MM-DD
    $parseDate = function($dateString) {
        $dateString = trim($dateString);
        if (empty($dateString)) {
            return null;
        }
        
        // Handle Excel date numbers (e.g., 44927 = 3/2/1993)
        if (is_numeric($dateString)) {
            try {
                // Excel date serial number (days since 1900-01-01)
                $excelEpoch = new DateTime('1899-12-30');
                $days = (int)$dateString;
                $date = clone $excelEpoch;
                $date->modify("+$days days");
                return $date->format('Y-m-d');
            } catch (Exception $e) {
                // Fall through to other formats
            }
        }
        
        // Try M/D/YYYY format (e.g., 3/2/1993, 12/25/2024)
        $date = DateTime::createFromFormat('n/j/Y', $dateString);
        if ($date && $date->format('n/j/Y') === $dateString) {
            return $date->format('Y-m-d');
        }
        
        // Try M/D/YY format (e.g., 3/2/93)
        $date = DateTime::createFromFormat('n/j/y', $dateString);
        if ($date && $date->format('n/j/y') === $dateString) {
            return $date->format('Y-m-d');
        }
        
        // Try YYYY-MM-DD format (backward compatibility)
        $date = DateTime::createFromFormat('Y-m-d', $dateString);
        if ($date && $date->format('Y-m-d') === $dateString) {
            return $date->format('Y-m-d');
        }
        
        // Try other common formats
        $formats = ['m/d/Y', 'd/m/Y', 'Y/m/d', 'm-d-Y', 'd-m-Y', 'Y-m-d'];
        foreach ($formats as $format) {
            $date = DateTime::createFromFormat($format, $dateString);
            if ($date) {
                return $date->format('Y-m-d');
            }
        }
        
        return null;
    };

    $results = [
        'success' => true,
        'total' => 0,
        'created' => 0,
        'failed' => 0,
        'errors' => []
    ];

    // Process data rows
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

            // Handle name parsing - support both separate columns and full_name column
            if ($hasSeparateNames) {
                // Use separate first_name and last_name columns
                $first_name = sanitize_name($getValue('first_name'));
                $middle_name = sanitize_name($getValue('middle_name'));
                $last_name = sanitize_name($getValue('last_name'));
            } else {
                // Parse from full_name or name column
                $fullName = $getValue('full_name');
                $parsed = $parseFullName($fullName);
                $first_name = $parsed['first_name'];
                $middle_name = $parsed['middle_name'];
                $last_name = $parsed['last_name'];
            }
            
            // Build full name for deceased record
            $name = trim(($first_name . ' ' . $middle_name . ' ' . $last_name));
            
            $date_of_birth_raw = $getValue('date_of_birth');
            $date_of_death_raw = $getValue('date_of_death');
            $burial_date_raw = $getValue('burial_date');
            $customer_id = intval($getValue('customer_id') ?: 0);
            $lot_display = trim($getValue('lot_id')); // Format: FA2-1
            $vault_option = strtolower(trim($getValue('vault_option')));
            $status = strtoupper(trim($getValue('status') ?: 'BURIED'));
            $cause_of_death = $getValue('cause_of_death');
            $funeral_home = $getValue('funeral_home');
            $notes = $getValue('notes');

            // Validation
            if (empty($first_name) || empty($last_name)) {
                throw new Exception("Row $i: First name and last name are required");
            }

            if (empty($date_of_birth_raw) || empty($date_of_death_raw) || empty($burial_date_raw)) {
                throw new Exception("Row $i: Date of birth, date of death, and burial date are required");
            }

            if (empty($lot_display)) {
                throw new Exception("Row $i: Lot ID is required (format: FA2-1)");
            }
            
            // Validate vault_option is required
            if (empty($vault_option) || !in_array($vault_option, ['option1', 'option2', 'option3'], true)) {
                throw new Exception("Row $i: Vault option is required and must be: option1, option2, or option3");
            }
            
            // Parse dates from M/D/YYYY format to YYYY-MM-DD
            $date_of_birth = $parseDate($date_of_birth_raw);
            $date_of_death = $parseDate($date_of_death_raw);
            $burial_date = $parseDate($burial_date_raw);
            
            if (!$date_of_birth) {
                throw new Exception("Row $i: Invalid date of birth format: $date_of_birth_raw (expected: M/D/YYYY, e.g., 3/2/1993)");
            }
            
            if (!$date_of_death) {
                throw new Exception("Row $i: Invalid date of death format: $date_of_death_raw (expected: M/D/YYYY, e.g., 3/2/1993)");
            }
            
            if (!$burial_date) {
                throw new Exception("Row $i: Invalid burial date format: $burial_date_raw (expected: M/D/YYYY, e.g., 3/2/1993)");
            }
            
            // Parse lot format (e.g., "FA2-1")
            $lotInfo = $parseLotFormat($lot_display);
            if (!$lotInfo) {
                throw new Exception("Row $i: Invalid lot format: $lot_display (expected format: FA2-1)");
            }
            
            // Get block_id from lot format
            $blockId = $getBlockId($lotInfo['garden_initial'], $lotInfo['sector'], $lotInfo['block']);
            
            // Find lot by block_id and lot_number
            $lotCheck = $pdo->prepare("SELECT id, customer_id, status FROM lots WHERE block_id = ? AND lot_number = ?");
            $lotCheck->execute([$blockId, $lotInfo['lot_number']]);
            $lotRow = $lotCheck->fetch(PDO::FETCH_ASSOC);
            
            if (!$lotRow) {
                throw new Exception("Row $i: Lot $lot_display not found");
            }
            
            $lot_id = $lotRow['id'];
            
            // Validate that the lot is owned by someone (required for deceased records)
            if (empty($lotRow['customer_id']) || $lotRow['customer_id'] === null) {
                throw new Exception("Row $i: Lot $lot_display is not owned by anyone. Deceased records can only be imported for owned lots.");
            }

            // Validate dates (already in YYYY-MM-DD format from parseDate)
            $today = new DateTime('today');
            $dob = new DateTime($date_of_birth);
            $dod = new DateTime($date_of_death);
            $bd = new DateTime($burial_date);

            if ($dob > $today) {
                throw new Exception("Row $i: Date of birth cannot be in the future");
            }

            if ($dod > $today) {
                throw new Exception("Row $i: Date of death cannot be in the future");
            }

            if ($dod < $dob) {
                throw new Exception("Row $i: Date of death cannot be before date of birth");
            }

            if ($bd < $dob) {
                throw new Exception("Row $i: Burial date cannot be before date of birth");
            }

            if ($bd < $dod) {
                throw new Exception("Row $i: Burial date cannot be before date of death");
            }

            // Validate customer owns the lot if customer_id is provided
            if ($customer_id && $lotRow['customer_id'] && intval($lotRow['customer_id']) !== $customer_id) {
                throw new Exception("Row $i: Lot $lot_display does not belong to customer $customer_id");
            }
            
            // Use the lot's owner as customer_id if not provided in Excel
            if (!$customer_id) {
                $customer_id = intval($lotRow['customer_id']);
            }

            // Normalize status
            if ($status === 'PENDING') {
                $status = 'BURIED';
            }
            if (!in_array($status, ['BURIED', 'SCHEDULED'])) {
                $status = 'BURIED';
            }

            // Auto-determine burial status based on burial date
            if ($bd <= $today) {
                $status = 'BURIED';
            }

            // Ensure vault columns exist
            try { $pdo->query("SELECT vault_option FROM lots LIMIT 0"); } catch (PDOException $e) { 
                try { $pdo->exec("ALTER TABLE lots ADD COLUMN vault_option ENUM('option1','option2','option3') NULL"); } catch (PDOException $e2) {} 
            }
            foreach ([
                "ALTER TABLE lots ADD COLUMN lower_body TINYINT(1) NOT NULL DEFAULT 0",
                "ALTER TABLE lots ADD COLUMN upper_body TINYINT(1) NOT NULL DEFAULT 0",
                "ALTER TABLE lots ADD COLUMN lower_bone TINYINT(2) NOT NULL DEFAULT 0",
                "ALTER TABLE lots ADD COLUMN upper_bone TINYINT(2) NOT NULL DEFAULT 0"
            ] as $sql) { 
                try { $pdo->exec($sql); } catch (PDOException $e) {} 
            }

            // Get current vault state
            $vstmt = $pdo->prepare('SELECT vault_option AS option, lower_body, upper_body, lower_bone, upper_bone FROM lots WHERE id = ?');
            $vstmt->execute([$lot_id]);
            $vrow = $vstmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$vrow) {
                $vrow = ['option' => $vault_option, 'lower_body' => 0, 'upper_body' => 0, 'lower_bone' => 0, 'upper_bone' => 0];
            }

            // Use provided vault_option (required)
            $opt = $vault_option;

            $lb = (int)$vrow['lower_body'];
            $ub = (int)$vrow['upper_body'];
            $lbn = (int)$vrow['lower_bone'];
            $ubn = (int)$vrow['upper_bone'];

            // Auto-select interment type and tier
            $interment_type = null;
            $assignedTier = null;
            
            if ($opt === 'option1') {
                if ($lb === 0) { $interment_type = 'body'; $assignedTier = 'lower'; }
                else if ($ub === 0) { $interment_type = 'body'; $assignedTier = 'upper'; }
                else {
                    if (($lbn + $ubn) >= 4) {
                        throw new Exception("Row $i: Maximum of 4 bones reached for lot $lot_id");
                    }
                    $interment_type = 'bone';
                    if ($lbn < 4) { $assignedTier = 'lower'; }
                    else if ($ubn < 4) { $assignedTier = 'upper'; }
                    else {
                        throw new Exception("Row $i: No available bone capacity for lot $lot_id");
                    }
                }
            } else if ($opt === 'option2') {
                if ($lb === 0) { $interment_type = 'body'; $assignedTier = 'lower'; }
                else {
                    if ($ubn >= 5) {
                        throw new Exception("Row $i: Upper tier bone capacity (5) reached for lot $lot_id");
                    }
                    $interment_type = 'bone';
                    $assignedTier = 'upper';
                }
            } else if ($opt === 'option3') {
                if ($lbn < 3) { $interment_type = 'bone'; $assignedTier = 'lower'; }
                else if ($ubn < 3) { $interment_type = 'bone'; $assignedTier = 'upper'; }
                else {
                    throw new Exception("Row $i: All bone compartments are full for lot $lot_id");
                }
            }

            // Insert deceased record
            $sql = "INSERT INTO deceased_records (name, date_of_birth, date_of_death, burial_date, lot_id, customer_id, status, cause_of_death, funeral_home, notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            $result = $stmt->execute([
                $name, $date_of_birth, $date_of_death, $burial_date, $lot_id, $customer_id ?: null,
                $status, $cause_of_death, $funeral_home, $notes
            ]);

            if ($result) {
                // Update vault usage counters
                try {
                    if ($opt && in_array($opt, ['option1','option2','option3'], true)) {
                        $pdo->prepare('UPDATE lots SET vault_option = ? WHERE id = ?')->execute([$opt, $lot_id]);
                    }
                    if ($interment_type === 'body') {
                        if ($assignedTier === 'lower') {
                            $pdo->prepare('UPDATE lots SET lower_body = 1 WHERE id = ?')->execute([$lot_id]);
                        } else {
                            $pdo->prepare('UPDATE lots SET upper_body = 1 WHERE id = ?')->execute([$lot_id]);
                        }
                    } else {
                        if ($assignedTier === 'lower') {
                            $pdo->prepare('UPDATE lots SET lower_bone = LEAST(lower_bone + 1, 99) WHERE id = ?')->execute([$lot_id]);
                        } else {
                            $pdo->prepare('UPDATE lots SET upper_bone = LEAST(upper_bone + 1, 99) WHERE id = ?')->execute([$lot_id]);
                        }
                    }
                } catch (Throwable $e) {}

                // Mark lot as occupied if buried
                if ($status === 'BURIED') {
                    $up = $pdo->prepare("UPDATE lots SET status = 'occupied' WHERE id = ?");
                    $up->execute([$lot_id]);
                }

                // Record activity
                $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
                $activity_stmt = $pdo->prepare($activity_sql);
                $activity_stmt->execute([
                    'Created',
                    'Deceased',
                    "Deceased record for '$name' imported from Excel - Lot: $lot_display",
                    $actorId,
                    $_SERVER['REMOTE_ADDR'] ?? '',
                    $_SERVER['HTTP_USER_AGENT'] ?? ''
                ]);

                $results['created']++;
            } else {
                throw new Exception("Row $i: Failed to insert deceased record");
            }
        } catch (Exception $e) {
            $results['failed']++;
            $results['errors'][] = "Row " . ($i + 1) . ": " . $e->getMessage();
        }
    }

    echo json_encode($results);
} catch (Exception $e) {
    http_response_code(500);
    error_log('Import deceased records error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
    echo json_encode([
        'success' => false,
        'message' => 'Error processing file: ' . $e->getMessage(),
        'error_type' => get_class($e),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    error_log('Import deceased records fatal error: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
    echo json_encode([
        'success' => false,
        'message' => 'Fatal error processing file: ' . $e->getMessage(),
        'error_type' => get_class($e)
    ]);
}
?>

