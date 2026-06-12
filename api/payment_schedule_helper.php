<?php
require_once __DIR__ . '/config.php';

if (!function_exists('get_payment_schedule_row')) {
    /**
     * Fetch payment schedule row for a specific lot/customer/month.
     *
     * @param int|string $lot_id
     * @param int|string $customer_id
     * @param string $yearMonth Format YYYY-MM
     * @return array|null
     */
    function get_payment_schedule_row($lot_id, $customer_id, $yearMonth) {
        global $pdo;
        if (!$lot_id || !$customer_id || !$yearMonth) {
            return null;
        }
        try {
            $sql = "SELECT 
                        pps.due_date,
                        pps.amount_due,
                        pps.month_number,
                        pp.id AS plan_id
                    FROM payment_plan_schedule pps
                    JOIN payment_plans pp ON pps.payment_plan_id = pp.id
                    WHERE pp.lot_id = ?
                      AND pp.customer_id = ?
                      AND DATE_FORMAT(pps.due_date, '%Y-%m') = ?
                      AND (pp.deleted_at IS NULL OR pp.deleted_at IS NULL)
                    ORDER BY 
                      (pp.status = 'active') DESC,
                      pp.id DESC,
                      pps.due_date DESC
                    LIMIT 1";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$lot_id, $customer_id, $yearMonth]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;
        } catch (Throwable $e) {
            return null;
        }
    }
}

if (!function_exists('get_payment_schedule_due_date')) {
    /**
     * Resolve the custom due date for a given lot/customer/month.
     *
     * @param int|string $lot_id
     * @param int|string $customer_id
     * @param string $yearMonth
     * @return string|null
     */
    function get_payment_schedule_due_date($lot_id, $customer_id, $yearMonth) {
        try {
            $row = get_payment_schedule_row($lot_id, $customer_id, $yearMonth);
            return $row && isset($row['due_date']) ? $row['due_date'] : null;
        } catch (Throwable $e) {
            // Return null on any error to allow fallback date logic
            error_log('Error in get_payment_schedule_due_date: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('update_delinquency_start_month')) {
    /**
     * Update delinquency_start_month for a payment plan based on current overdue status.
     * Only resets when all overdue payments are cleared.
     * Sets it when first overdue payment occurs.
     *
     * @param int|string $plan_id
     * @return void
     */
    function update_delinquency_start_month($plan_id) {
        global $pdo;
        if (!$plan_id) {
            return;
        }
        
        try {
            // Get current delinquency_start_month and check for overdue payments
            $plan_q = $pdo->prepare("
                SELECT 
                    pp.delinquency_start_month,
                    MIN(pps.due_date) as earliest_overdue_date
                FROM payment_plans pp
                LEFT JOIN payment_plan_schedule pps ON pps.payment_plan_id = pp.id
                    AND pps.status = 'pending'
                    AND pps.due_date < CURDATE()
                WHERE pp.id = ?
                GROUP BY pp.id, pp.delinquency_start_month
            ");
            $plan_q->execute([$plan_id]);
            $plan_data = $plan_q->fetch(PDO::FETCH_ASSOC);
            
            if (!$plan_data) {
                return;
            }
            
            $stored_delinquency_start = $plan_data['delinquency_start_month'] ?? null;
            $earliest_overdue_date = $plan_data['earliest_overdue_date'];
            
            $should_update = false;
            $new_delinquency_start = null;
            
            if ($earliest_overdue_date) {
                // There are overdue payments
                $earliest_overdue_ym = date('Y-m', strtotime($earliest_overdue_date));
                
                if ($stored_delinquency_start === null) {
                    // First time becoming overdue - set delinquency_start_month
                    $should_update = true;
                    $new_delinquency_start = $earliest_overdue_ym;
                }
                // If stored_delinquency_start exists, keep it (don't reset on partial payments)
            } else {
                // No overdue payments
                if ($stored_delinquency_start !== null) {
                    // All overdue payments cleared - reset delinquency_start_month to NULL
                    $should_update = true;
                    $new_delinquency_start = null;
                }
            }
            
            if ($should_update) {
                $update_q = $pdo->prepare("UPDATE payment_plans SET delinquency_start_month = ?, updated_at = NOW() WHERE id = ?");
                $update_q->execute([$new_delinquency_start, $plan_id]);
            }
        } catch (Throwable $e) {
            // Non-fatal error, log and continue
            error_log('Error updating delinquency_start_month: ' . $e->getMessage());
        }
    }
}


