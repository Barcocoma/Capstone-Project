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

try {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Inputs (accept split names or full name)
    $first_name = sanitize_name(trim($data['first_name'] ?? ''));
    $middle_name = sanitize_name(trim($data['middle_name'] ?? ''));
    $last_name = sanitize_name(trim($data['last_name'] ?? ''));
    $name = sanitize_name(trim($data['name'] ?? ''));
    if ($first_name || $last_name) {
        $name = trim(($first_name . ' ' . $middle_name . ' ' . $last_name));
    }
    $date_of_birth = $data['date_of_birth'] ?? '';
    $date_of_death = $data['date_of_death'] ?? '';
    $burial_date = $data['burial_date'] ?? '';
    $customer_id = intval($data['customer_id'] ?? 0);
    $lot_id = intval($data['lot_id'] ?? 0);
    $vault_option = strtolower(trim((string)($data['vault_option'] ?? '')));
    // Interment type is auto-selected based on vault option and current occupancy
    $interment_type = null; // 'body' or 'bone'
    $status = strtoupper(trim($data['status'] ?? ''));
    $cause_of_death = $data['cause_of_death'] ?? '';
    $funeral_home = $data['funeral_home'] ?? '';
    $notes = $data['notes'] ?? '';

    // Ensure lot exists and belongs to this customer (if provided)
    $lotCheck = $pdo->prepare("SELECT id, customer_id FROM lots WHERE id = ?");
    $lotCheck->execute([$lot_id]);
    $lotRow = $lotCheck->fetch(PDO::FETCH_ASSOC);
    if (!$lotRow) {
        echo json_encode(['success' => false, 'message' => 'Invalid lot selected']);
        exit;
    }
    if ($customer_id && $lotRow['customer_id'] && intval($lotRow['customer_id']) !== $customer_id) {
        echo json_encode(['success' => false, 'message' => 'Selected lot does not belong to this customer']);
        exit;
    }

    // Business rules:
    // - If status is SCHEDULED, burial_date is required and must be >= today
    // - If burial_date is provided and today >= burial_date, force status to BURIED
    // - Do not allow PENDING status per new rules
    if ($status === 'PENDING') {
        echo json_encode(['success' => false, 'message' => 'PENDING status is not allowed']);
        exit;
    }
    if ($status === 'SCHEDULED') {
        if (empty($burial_date)) {
            echo json_encode(['success' => false, 'message' => 'Burial date is required for SCHEDULED status']);
            exit;
        }
        $today = (new DateTime('today'));
        $bdate = DateTime::createFromFormat('Y-m-d', $burial_date);
        if (!$bdate || $bdate < $today) {
            echo json_encode(['success' => false, 'message' => 'Burial date must be today or a future date']);
            exit;
        }
    }
    if (!empty($burial_date)) {
        $today = (new DateTime('today'));
        $bdate = DateTime::createFromFormat('Y-m-d', $burial_date);
        if ($bdate && $bdate <= $today) {
            $status = 'BURIED';
        }
    }

    // Ensure vault columns exist on lots
    try { $pdo->query("SELECT vault_option FROM lots LIMIT 0"); } catch (PDOException $e) { try { $pdo->exec("ALTER TABLE lots ADD COLUMN vault_option ENUM('option1','option2','option3') NULL"); } catch (PDOException $e2) {} }
    foreach ([
        "ALTER TABLE lots ADD COLUMN lower_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN lower_bone TINYINT(2) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_bone TINYINT(2) NOT NULL DEFAULT 0"
    ] as $sql) { try { $pdo->exec($sql); } catch (PDOException $e) {} }

    // Fetch current vault state from lots
    $vstmt = $pdo->prepare('SELECT vault_option AS option, lower_body, upper_body, lower_bone, upper_bone FROM lots WHERE id = ?');
    $vstmt->execute([$lot_id]);
    $vrow = $vstmt->fetch(PDO::FETCH_ASSOC);
    if (!$vrow) {
        // Stage option; only persist after successful creation
        if (!in_array($vault_option, ['option1','option2','option3'], true)) {
            echo json_encode(['success' => false, 'message' => 'Select a valid vault usage option for this lot']);
            exit;
        }
        $vrow = ['option' => $vault_option, 'lower_body' => 0, 'upper_body' => 0, 'lower_bone' => 0, 'upper_bone' => 0];
    }
    $rowExists = $vrow ? true : false;

    // Effective chosen option: prefer provided vault_option if valid, otherwise current lot option
    $effectiveProvided = in_array($vault_option, ['option1','option2','option3'], true) ? $vault_option : null;
    $opt = $effectiveProvided ?: ($vrow['option'] ?? null);
    $lb = (int)$vrow['lower_body'];
    $ub = (int)$vrow['upper_body'];
    $lbn = (int)$vrow['lower_bone'];
    $ubn = (int)$vrow['upper_bone'];

    // Auto-select interment type and tier, and enforce capacity rules
    $assignedTier = null; // 'lower' or 'upper'
    if ($opt === 'option1') {
        // Prefer bodies first (lower then upper) until both body vaults are occupied; then allow bones up to total 4,
        // filling lower bone slots first then upper.
        if ($lb === 0) { $interment_type = 'body'; $assignedTier = 'lower'; }
        else if ($ub === 0) { $interment_type = 'body'; $assignedTier = 'upper'; }
        else {
            // Both body vaults filled; try bones
            if (($lbn + $ubn) >= 4) { echo json_encode(['success'=>false,'message'=>'Maximum of 4 bones reached']); exit; }
            $interment_type = 'bone';
            if ($lbn < 4) { $assignedTier = 'lower'; }
            else if ($ubn < 4) { $assignedTier = 'upper'; }
            else { echo json_encode(['success'=>false,'message'=>'No available bone capacity']); exit; }
        }
    } else if ($opt === 'option2') {
        // Lower supports one body; if occupied, place bones in upper up to 5
        if ($lb === 0) { $interment_type = 'body'; $assignedTier = 'lower'; }
        else {
            if ($ubn >= 5) { echo json_encode(['success'=>false,'message'=>'Upper tier bone capacity (5) reached']); exit; }
            $interment_type = 'bone'; $assignedTier = 'upper';
        }
    } else if ($opt === 'option3') {
        // Bones only; lower up to 3 then upper up to 3
        if ($lbn < 3) { $interment_type = 'bone'; $assignedTier = 'lower'; }
        else if ($ubn < 3) { $interment_type = 'bone'; $assignedTier = 'upper'; }
        else { echo json_encode(['success'=>false,'message'=>'All bone compartments are full (3 lower + 3 upper)']); exit; }
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
            // Persist chosen vault option to the lot when provided or missing
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
        $actorId = get_actor_user_id();
        $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
        $activity_stmt = $pdo->prepare($activity_sql);
        $activity_stmt->execute([
            'Created',
            'Deceased',
            "New deceased record created for '$name' - Lot ID: $lot_id",
            $actorId,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
        
        echo json_encode(['success' => true, 'message' => 'Deceased record created successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to create deceased record']);
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Server error: ' . $e->getMessage()
    ]);
}
?>
