<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { echo json_encode(['success'=>false,'message'=>'Method not allowed']); exit; }

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $lot_id = intval($data['lot_id'] ?? 0);
    $option = strtolower(trim((string)($data['option'] ?? '')));
    if (!$lot_id || !in_array($option, ['option1','option2','option3'], true)) {
        echo json_encode(['success'=>false,'message'=>'Invalid lot or option']);
        exit;
    }
    // Ensure vault columns on lots
    try { $pdo->query("SELECT vault_option FROM lots LIMIT 0"); } catch (PDOException $e) { try { $pdo->exec("ALTER TABLE lots ADD COLUMN vault_option ENUM('option1','option2','option3') NULL"); } catch (PDOException $e2) {} }
    foreach ([
        "ALTER TABLE lots ADD COLUMN lower_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_body TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN lower_bone TINYINT(2) NOT NULL DEFAULT 0",
        "ALTER TABLE lots ADD COLUMN upper_bone TINYINT(2) NOT NULL DEFAULT 0"
    ] as $sql) { try { $pdo->exec($sql); } catch (PDOException $e) {} }

    // Load existing to enforce switching rules
    $cur = $pdo->prepare('SELECT vault_option AS option, lower_body, upper_body, lower_bone, upper_bone FROM lots WHERE id = ?');
    $cur->execute([$lot_id]);
    $row = $cur->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $curOpt = $row['option'];
        $lb = (int)$row['lower_body'];
        $ub = (int)$row['upper_body'];
        $lbn = (int)$row['lower_bone'];
        $ubn = (int)$row['upper_bone'];
        // LOCKING RULE: If a vault option is already set, block any further changes unless admin reset cleared it to NULL
        if (!empty($curOpt)) {
            echo json_encode(['success'=>false,'locked'=>true,'message'=>'Vault option is locked and cannot be changed. (Remove all records to change.)']);
            exit;
        }
        // If reached here, current option is NULL — first-time set is allowed
        $upd = $pdo->prepare('UPDATE lots SET vault_option = ? WHERE id = ?');
        $upd->execute([$option, $lot_id]);
    } else {
        // If lot exists without columns populated, just set the option
        $ins = $pdo->prepare('UPDATE lots SET vault_option = ? WHERE id = ?');
        $ins->execute([$option, $lot_id]);
    }
    
    // Record activity
    $actorId = get_actor_user_id();
    $activity_sql = "INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)";
    $activity_stmt = $pdo->prepare($activity_sql);
    $activity_stmt->execute([
        'Updated',
        'Configuration',
        "Vault option set to '$option' for lot ID $lot_id",
        $actorId,
        $_SERVER['REMOTE_ADDR'] ?? '',
        $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
    
    echo json_encode(['success'=>true]);
} catch (PDOException $e) {
    echo json_encode(['success'=>false,'message'=>'Database error: '.$e->getMessage()]);
}
?>

