<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');
header('Access-Control-Allow-Methods: GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    $lot_id = intval($_GET['lot_id'] ?? 0);
    if (!$lot_id) {
        echo json_encode(['success' => false, 'message' => 'Missing lot_id']);
        exit;
    }

    // Ensure vault columns exist on lots table (fallback-safe)
    $needCols = [];
    foreach (['vault_option','lower_body','upper_body','lower_bone','upper_bone'] as $col) {
        try { $pdo->query("SELECT $col FROM lots LIMIT 0"); } catch (PDOException $e) { $needCols[] = $col; }
    }
    if (!empty($needCols)) {
        try {
            if (in_array('vault_option', $needCols, true)) {
                $pdo->exec("ALTER TABLE lots ADD COLUMN vault_option ENUM('option1','option2','option3') NULL");
            }
        } catch (PDOException $e) {}
        foreach ([
            "ALTER TABLE lots ADD COLUMN lower_body TINYINT(1) NOT NULL DEFAULT 0",
            "ALTER TABLE lots ADD COLUMN upper_body TINYINT(1) NOT NULL DEFAULT 0",
            "ALTER TABLE lots ADD COLUMN lower_bone TINYINT(2) NOT NULL DEFAULT 0",
            "ALTER TABLE lots ADD COLUMN upper_bone TINYINT(2) NOT NULL DEFAULT 0"
        ] as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }
    }

    $stmt = $pdo->prepare('SELECT vault_option AS option, lower_body, upper_body, lower_bone, upper_bone FROM lots WHERE id = ?');
    $stmt->execute([$lot_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    $availableOptions = [];
    $allowedSwitchTargets = [];
    $locked = false;
    $lot_vault = null;
    if ($row && $row['option']) {
        $opt = $row['option'];
        $lb = (int)$row['lower_body'];
        $ub = (int)$row['upper_body'];
        $lbn = (int)$row['lower_bone'];
        $ubn = (int)$row['upper_bone'];
        $lot_vault = [
            'option' => $opt,
            'lower_body' => $lb,
            'upper_body' => $ub,
            'lower_bone' => $lbn,
            'upper_bone' => $ubn,
        ];
        // LOCK: once any option is present, mark as locked
        $locked = true;
    } else {
        $availableOptions = ['option1','option2','option3'];
    }

    echo json_encode([
        'success' => true,
        'lot_vault' => $lot_vault,
        'availableOptions' => $availableOptions,
        'allowedSwitchTargets' => $allowedSwitchTargets,
        'locked' => $locked
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>

