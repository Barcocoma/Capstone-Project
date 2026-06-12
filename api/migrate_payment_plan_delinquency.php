<?php
require_once __DIR__ . '/config.php';

/**
 * Migration script:
 *   php api/migrate_payment_plan_delinquency.php
 *
 * Adds delinquency_start_month column to payment_plans if missing.
 */

try {
    global $pdo;

    $columnCheck = $pdo->prepare("
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'payment_plans'
          AND COLUMN_NAME = 'delinquency_start_month'
        LIMIT 1
    ");
    $columnCheck->execute();

    if ($columnCheck->fetch()) {
        echo "[OK] Column delinquency_start_month already exists.\n";
        exit(0);
    }

    $pdo->exec("
        ALTER TABLE payment_plans
        ADD COLUMN delinquency_start_month CHAR(7) NULL DEFAULT NULL
            AFTER due_day
    ");

    echo "[OK] Added delinquency_start_month column to payment_plans.\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, '[ERROR] Migration failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}



