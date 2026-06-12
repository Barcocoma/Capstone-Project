<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';
require_once __DIR__ . '/receipt_helper.php';

if (!function_exists('diff_months')) {
    function diff_months($startYm, $targetYm) {
        if (!$startYm || !$targetYm) {
            return 0;
        }
        $startYear = (int)substr($startYm, 0, 4);
        $startMonth = (int)substr($startYm, 5, 2);
        $targetYear = (int)substr($targetYm, 0, 4);
        $targetMonth = (int)substr($targetYm, 5, 2);
        return ($targetYear - $startYear) * 12 + ($targetMonth - $startMonth);
    }
}

try {
    // Use the existing PDO connection from config.php
    global $pdo;
    
    // Ensure delinquency_start_month column exists (migration check)
    try {
        $columnCheck = $pdo->prepare("
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'payment_plans'
              AND COLUMN_NAME = 'delinquency_start_month'
            LIMIT 1
        ");
        $columnCheck->execute();
        if (!$columnCheck->fetch()) {
            // Column doesn't exist, add it
            $pdo->exec("
                ALTER TABLE payment_plans
                ADD COLUMN delinquency_start_month CHAR(7) NULL DEFAULT NULL
                    AFTER due_day
            ");
        }
    } catch (Throwable $e) {
        // Non-fatal: continue even if migration check fails
        error_log('Migration check warning: ' . $e->getMessage());
    }
    
    // Get user ID from header or fallback to query param
    $user_id = $_SERVER['HTTP_X_USER_ID'] ?? ($_GET['user_id'] ?? null);
    
    if (!$user_id) {
        echo json_encode([
            'success' => false,
            'message' => 'User ID is required'
        ]);
        exit;
    }
    
    // Get customer's creation date and lots
    $customer_sql = "SELECT u.created_at, l.id, l.lot_number, b.block_number, s.name as sector_name, g.name as garden_name,
                            CONCAT(
                                LEFT(g.name, 1), 
                                COALESCE(s.name, ''), 
                                COALESCE(b.block_number, ''), 
                                '-', 
                                COALESCE(l.lot_number, '')
                            ) as display_name
                     FROM users u
                     LEFT JOIN lots l ON l.customer_id = u.id
                     LEFT JOIN blocks b ON l.block_id = b.id
                     LEFT JOIN sectors s ON b.sector_id = s.id
                     LEFT JOIN gardens g ON s.garden_id = g.id
                     WHERE u.id = ? AND l.id IS NOT NULL";
    
    $customer_stmt = $pdo->prepare($customer_sql);
    $customer_stmt->execute([$user_id]);
    $lots = $customer_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get customer creation date
    $creation_sql = "SELECT created_at FROM users WHERE id = ?";
    $creation_stmt = $pdo->prepare($creation_sql);
    $creation_stmt->execute([$user_id]);
    $customer_info = $creation_stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$customer_info) {
        echo json_encode([
            'success' => false,
            'message' => 'Customer not found'
        ]);
        exit;
    }
    
    $account_creation_date = $customer_info['created_at'];
    
    if (empty($lots)) {
        echo json_encode([
            'success' => true,
            'monthly_status' => [],
            'summary' => [
                'total_lots' => 0,
                'total_months' => 0,
                'total_paid_months' => 0,
                'total_pending_months' => 0,
                'payment_rate' => 0,
                'account_created' => date('M Y', strtotime($account_creation_date))
            ],
            'message' => 'No lots found for this customer'
        ]);
        exit;
    }
    
    $lot_ids = array_column($lots, 'id');
    $placeholders = str_repeat('?,', count($lot_ids) - 1) . '?';
    
    // Get payment records since account creation
    // Include payment_due_date and notes to properly match payments to months
    // Note: We filter by payment_date >= creation_date, but we match payments to months using
    // the notes field (explicit Month: YYYY-MM) or payment_due_date, which may differ from payment_date
    $payments_sql = "SELECT id, lot_id, payment_date, payment_due_date, payment_amount, payment_method, status, notes
                     FROM payment_records 
                     WHERE lot_id IN ($placeholders) 
                     AND status = 'Paid'
                     ORDER BY payment_date DESC";
    
    $payments_stmt = $pdo->prepare($payments_sql);
    $payments_stmt->execute($lot_ids);
    $payments = $payments_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get payment plans for this customer to determine actual payment terms
    $payment_plans_sql = "SELECT id, lot_id, payment_term_months, start_date, status, monthly_amount, total_amount, down_payment, due_day, delinquency_start_month FROM payment_plans WHERE customer_id = ?";
    $payment_plans_stmt = $pdo->prepare($payment_plans_sql);
    $payment_plans_stmt->execute([$user_id]);
    $payment_plans = $payment_plans_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get payment plan schedules to get actual amounts due (including 2-split down payment logic)
    $schedule_sql = "SELECT pps.payment_plan_id, pps.month_number, pps.amount_due, pps.due_date, pp.lot_id, pp.due_day
                     FROM payment_plan_schedule pps
                     JOIN payment_plans pp ON pps.payment_plan_id = pp.id
                     WHERE pp.customer_id = ?
                     ORDER BY pp.lot_id, pps.month_number";
    $schedule_stmt = $pdo->prepare($schedule_sql);
    $schedule_stmt->execute([$user_id]);
    $schedules = $schedule_stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Group schedules by lot_id
    $schedules_by_lot = [];
    foreach ($schedules as $schedule) {
        $schedules_by_lot[$schedule['lot_id']][] = $schedule;
    }
    
    // Create a map of lot_id to payment plan
    $lot_payment_plans = [];
    foreach ($payment_plans as $plan) {
        $lot_payment_plans[$plan['lot_id']] = $plan;
    }
    
    // Generate months per-lot from its own plan to reflect correct 12/24/36/48 terms
    $months_by_lot = [];
    foreach ($payment_plans as $plan) {
        if (($plan['payment_term_months'] ?? 0) > 0) {
            // Normalize to the first day of the start month to avoid month-skipping
            // issues when adding months from dates like the 29th/30th/31st
            $start_ts = strtotime($plan['start_date']);
            $assignment_date = new DateTime(date('Y-m-01', $start_ts));
            $lot_months = [];
            $lot_schedules = $schedules_by_lot[$plan['lot_id']] ?? [];
            
            for ($i = 1; $i <= (int)$plan['payment_term_months']; $i++) {
                // Find the corresponding schedule entry for this month
                $schedule_amount = $plan['monthly_amount']; // fallback
                $schedule_due_date = null;
                foreach ($lot_schedules as $schedule) {
                    if ($schedule['month_number'] == $i) {
                        $schedule_amount = $schedule['amount_due'];
                        $schedule_due_date = $schedule['due_date'];
                        break;
                    }
                }
                
                // Use schedule's due_date if available (has correct custom day), otherwise calculate
                if ($schedule_due_date) {
                    $due_date = new DateTime($schedule_due_date);
                } else {
                    $due_date = clone $assignment_date;
                    $due_date->modify("+$i month");
                    // Use custom due_day from plan if available, otherwise default to 15th
                    $target_day = $plan['due_day'] ?? 15;
                    $year = (int)$due_date->format('Y');
                    $month = (int)$due_date->format('m');
                    $days_in_month = (int)$due_date->format('t');
                    $day = min($target_day, $days_in_month);
                    $due_date = new DateTime(sprintf('%04d-%02d-%02d', $year, $month, $day));
                }
                
                $lot_months[] = [
                    'year_month' => $due_date->format('Y-m'),
                    'display' => $due_date->format('M Y'),
                    'year' => $due_date->format('Y'),
                    'month' => $due_date->format('n'),
                    'due_date' => $due_date->format('Y-m-d'),
                    'due_day' => $due_date->format('j'),
                    // Use actual scheduled amount (includes 2-split down payment logic)
                    'amount' => (float)$schedule_amount
                ];
            }
            $months_by_lot[$plan['lot_id']] = $lot_months;
        }
    }
    
    // Create monthly status for each lot
    $monthly_status = [];
    
    foreach ($lots as $lot) {
        // Check if this lot has a payment plan
        $lot_plan = $lot_payment_plans[$lot['id']] ?? null;
        
        // Only show lots that have active payment plans with payment terms > 0
        // Check status to ensure plan is active (not cancelled or completed)
        // Default status is 'active' if not set
        $plan_status = $lot_plan['status'] ?? 'active';
        if (!$lot_plan || 
            $lot_plan['payment_term_months'] == 0 || 
            $plan_status === 'cancelled' ||
            $plan_status === 'completed') {
            continue; // Skip lots without payment plans, fully paid lots, or cancelled/completed plans
        }
        
        $lot_payments = array_filter($payments, function($payment) use ($lot) {
            return $payment['lot_id'] == $lot['id'];
        });
        
            $lot_monthly_status = [];
        
        // Show only the months for this lot's own plan
        $months_for_lot = $months_by_lot[$lot['id']] ?? [];
        
        // Ensure months are sorted chronologically by due_date for correct penalty calculation
        usort($months_for_lot, function($a, $b) {
            return strtotime($a['due_date']) - strtotime($b['due_date']);
        });
        
        // Build a map of paid months for quick lookup
        // Priority: 1) notes field (explicit Month: YYYY-MM), 2) payment_due_date, 3) payment_date
        $paid_months_map = [];
        foreach ($lot_payments as $payment) {
            $payment_month = null;
            
            // Priority 1: Check notes field for explicit payment_month (most reliable)
            // Pattern matches " - Month: YYYY-MM" or "Month: YYYY-MM" (case insensitive, flexible spacing)
            if (!empty($payment['notes'])) {
                // Try pattern with dash first: " - Month: YYYY-MM"
                if (preg_match('/[-\s]+Month:\s*(\d{4}-\d{2})/i', $payment['notes'], $matches)) {
                    $payment_month = trim($matches[1]);
                }
            }
            
            // Priority 2: Use payment_due_date if available (set from payment_month for monthly payments)
            if (!$payment_month && !empty($payment['payment_due_date'])) {
                $payment_month = date('Y-m', strtotime($payment['payment_due_date']));
            }
            
            // Priority 3: Fall back to payment_date
            if (!$payment_month && !empty($payment['payment_date'])) {
                $payment_month = date('Y-m', strtotime($payment['payment_date']));
            }
            
            // Only add to map if we successfully determined the payment month
            if ($payment_month) {
                // Allow multiple payments per month - keep the most recent one
                if (!isset($paid_months_map[$payment_month]) || 
                    strtotime($payment['payment_date']) > strtotime($paid_months_map[$payment_month]['payment_date'])) {
                    $paid_months_map[$payment_month] = [
                        'payment_amount' => $payment['payment_amount'],
                        'payment_method' => $payment['payment_method'],
                        'payment_date' => $payment['payment_date'],
                        'payment_id' => $payment['id'] ?? null,
                    ];
                }
            }
        }

        // Build intermediate month states
        $month_states = [];
        $current_overdue_months = [];
        $nowTs = time();

        foreach ($months_for_lot as $month) {
            $month_paid = isset($paid_months_map[$month['year_month']]);
            $payment_data = $month_paid ? $paid_months_map[$month['year_month']] : null;

            $payment_amount = $payment_data['payment_amount'] ?? 0;
            $payment_method = $payment_data['payment_method'] ?? '';
            $payment_date = $payment_data['payment_date'] ?? '';
            $payment_id = $payment_data['payment_id'] ?? null;
            $receipt_url = '';
            if ($payment_id) {
                $receipt_url = receipt_pdf_download_url($payment_id);
            }

            $dueTs = strtotime($month['due_date']);
            $is_overdue_unpaid = !$month_paid && ($dueTs < $nowTs);

            if ($is_overdue_unpaid) {
                $current_overdue_months[] = $month;
            }

            $month_states[] = [
                'month' => $month,
                'month_paid' => $month_paid,
                'payment_amount' => $payment_amount,
                'payment_method' => $payment_method,
                'payment_date' => $payment_date,
                'payment_id' => $payment_id,
                'receipt_url' => $receipt_url,
                'is_overdue_unpaid' => $is_overdue_unpaid,
            ];
        }

        $plan_id = $lot_plan['id'] ?? null;
        $current_overdue_count = count($current_overdue_months);
        
        // Get stored delinquency_start_month from database
        $stored_delinquency_start = $lot_plan['delinquency_start_month'] ?? null;
        
        // Determine delinquency_start:
        // 1. If there are current overdue months:
        //    - If stored_delinquency_start exists, use it (don't reset on partial payments)
        //    - If stored_delinquency_start is NULL, this is the first time becoming overdue - set it
        // 2. If there are NO current overdue months:
        //    - If stored_delinquency_start exists, we should clear it (all overdue cleared)
        //    - If stored_delinquency_start is NULL, keep it NULL
        
        $delinquency_start = null;
        $should_update_delinquency = false;
        $new_delinquency_start = null;
        
        if ($current_overdue_count > 0) {
            // There are overdue payments
            $earliest_overdue = $current_overdue_months[0]['year_month'];
            
            if ($stored_delinquency_start === null) {
                // First time becoming overdue - set delinquency_start_month
                $delinquency_start = $earliest_overdue;
                $should_update_delinquency = true;
                $new_delinquency_start = $earliest_overdue;
            } else {
                // Use stored value - don't reset on partial payments
                $delinquency_start = $stored_delinquency_start;
            }
        } else {
            // No current overdue payments
            if ($stored_delinquency_start !== null) {
                // All overdue payments cleared - reset delinquency_start_month to NULL
                $should_update_delinquency = true;
                $new_delinquency_start = null;
            }
            // If stored is already NULL, no action needed
        }
        
        // Update delinquency_start_month in database if needed
        if ($should_update_delinquency && $plan_id) {
            try {
                $update_delinquency = $pdo->prepare("UPDATE payment_plans SET delinquency_start_month = ?, updated_at = NOW() WHERE id = ?");
                $update_delinquency->execute([$new_delinquency_start, $plan_id]);
            } catch (Throwable $e) {
                // Non-fatal error, continue with calculation
            }
        }

        foreach ($month_states as $state) {
            $month = $state['month'];
            $month_paid = $state['month_paid'];
            $payment_amount = $state['payment_amount'];
            $payment_method = $state['payment_method'];
            $payment_date = $state['payment_date'];
            $payment_id = $state['payment_id'];
            $receipt_url = $state['receipt_url'];
            $is_overdue_unpaid = $state['is_overdue_unpaid'];

            $base_amount = isset($month['amount']) ? (float)$month['amount'] : 0.0;
            $penalty = 0.0;
            $amount_with_penalty = $base_amount;

            if ($is_overdue_unpaid && $delinquency_start) {
                $tier = diff_months($delinquency_start, $month['year_month']) + 1;
                if ($tier < 1) { $tier = 1; }
                $amount_with_penalty = round($base_amount * pow(1.03, $tier), 2);
                $penalty = round($amount_with_penalty - $base_amount, 2);
            }

            $lot_monthly_status[] = [
                'year_month' => $month['year_month'],
                'display' => $month['display'],
                'year' => $month['year'],
                'month' => $month['month'],
                'due_date' => $month['due_date'], // Exact due date
                'due_day' => $month['due_day'], // Day of month
                'amount' => $base_amount,
                'penalty' => $penalty,
                'amount_with_penalty' => $amount_with_penalty,
                'overdue' => $is_overdue_unpaid,
                'paid' => $month_paid,
                'payment_amount' => $payment_amount,
                'payment_method' => $payment_method,
                'payment_date' => $payment_date,
                'payment_id' => $payment_id,
                'receipt_url' => $receipt_url
            ];
        }
        
        // Helper to increment YYYY-MM → next month
        $incYm = function($ym) {
            // $ym format YYYY-MM
            $y = (int)substr($ym, 0, 4);
            $m = (int)substr($ym, 5, 2);
            $m++;
            if ($m > 12) { $m = 1; $y++; }
            return sprintf('%04d-%02d', $y, $m);
        };
        // Group by canonical year_month and merge duplicates instead of shifting months
        // so the sequence remains Jan, Feb, Mar, ... without repeats out of order
        $grouped = [];
        foreach ($lot_monthly_status as $m) {
            $ym = $m['year_month'];
            if (!isset($grouped[$ym])) {
                $grouped[$ym] = $m;
            } else {
                // Merge: add amounts and penalties, and set paid=true only if all parts are paid
                $grouped[$ym]['amount'] = round(($grouped[$ym]['amount'] ?? 0) + ($m['amount'] ?? 0), 2);
                $grouped[$ym]['penalty'] = round(($grouped[$ym]['penalty'] ?? 0) + ($m['penalty'] ?? 0), 2);
                $grouped[$ym]['amount_with_penalty'] = round(($grouped[$ym]['amount_with_penalty'] ?? 0) + ($m['amount_with_penalty'] ?? 0), 2);
                $grouped[$ym]['paid'] = ($grouped[$ym]['paid'] && $m['paid']);
                // Keep earliest payment_date and corresponding method
                if (!empty($m['payment_date']) && (empty($grouped[$ym]['payment_date']) || $m['payment_date'] < $grouped[$ym]['payment_date'])) {
                    $grouped[$ym]['payment_date'] = $m['payment_date'];
                    $grouped[$ym]['payment_method'] = $m['payment_method'];
                    $grouped[$ym]['payment_amount'] = $m['payment_amount'];
                    $grouped[$ym]['payment_id'] = $m['payment_id'];
                    $grouped[$ym]['receipt_url'] = $m['receipt_url'];
                }
            }
        }
        // Determine chronological start
        uksort($grouped, function($a,$b){ return strcmp($a,$b); });
        $lot_months_unique = array_values($grouped);

        // Ensure exact term length (12/24/36/48/60): rebuild from plan schedule start to avoid off-by-one
        $expectedMonths = isset($lot_plan['payment_term_months']) ? (int)$lot_plan['payment_term_months'] : 0;
        if ($expectedMonths > 0) {
            // Map merged months by ym for quick lookup (from $grouped)
            $byYm = [];
            foreach ($lot_months_unique as $m) { $byYm[$m['year_month']] = $m; }
            // Determine canonical start YM from schedule (months_for_lot generated earlier)
            $startYm = null;
            if (!empty($months_for_lot)) {
                $startYm = $months_for_lot[0]['year_month'];
            } elseif (!empty($lot_months_unique)) {
                $startYm = $lot_months_unique[0]['year_month'];
            }
            $rebuilt = [];
            if ($startYm) {
                $currentYm = $startYm;
                for ($i = 0; $i < $expectedMonths; $i++) {
                    $date = DateTime::createFromFormat('Y-m', $currentYm);
                    if (isset($byYm[$currentYm])) {
                        $entry = $byYm[$currentYm];
                    } else {
                        // fallback amount from schedule if available else last known amount
                        $fallbackAmount = isset($months_for_lot[$i]['amount']) ? (float)$months_for_lot[$i]['amount'] : (isset($rebuilt[$i-1]) ? (float)$rebuilt[$i-1]['amount'] : 0.0);
                        $entry = [
                            'year_month' => $currentYm,
                            'display' => $date ? $date->format('M Y') : $currentYm,
                            'year' => $date ? $date->format('Y') : substr($currentYm,0,4),
                            'month' => $date ? (int)$date->format('n') : (int)substr($currentYm,5,2),
                            'due_date' => $date ? $date->format('Y-m-01') : ($currentYm.'-01'),
                            'due_day' => 1,
                            'amount' => $fallbackAmount,
                            'penalty' => 0,
                            'amount_with_penalty' => $fallbackAmount,
                            'overdue' => false,
                            'paid' => false,
                            'payment_amount' => 0,
                            'payment_method' => '',
                            'payment_date' => '',
                            'payment_id' => null,
                            'receipt_url' => ''
                        ];
                    }
                    $rebuilt[] = $entry;
                    $currentYm = $incYm($currentYm);
                }
                $lot_months_unique = $rebuilt;
            }
        }

        $monthly_status[] = [
            'lot_id' => $lot['id'],
            'lot_display' => $lot['display_name'],
            'sector' => $lot['sector_name'],
            'block' => $lot['block_number'],
            'lot_number' => $lot['lot_number'],
            'garden' => $lot['garden_name'],
            'monthly_payments' => $lot_months_unique
        ];
    }
    
    // Calculate summary statistics
    $total_months = 0;
    foreach ($months_by_lot as $arr) { $total_months += count($arr); }
    $total_paid_months = 0;
    $total_pending_months = 0;
    
    foreach ($monthly_status as $lot_status) {
        foreach ($lot_status['monthly_payments'] as $month_status) {
            if ($month_status['paid']) {
                $total_paid_months++;
            } else {
                $total_pending_months++;
            }
        }
    }
    
    echo json_encode([
        'success' => true,
        'monthly_status' => $monthly_status,
        'summary' => [
            'total_lots' => count($lots),
            'total_months' => $total_months,
            'total_paid_months' => $total_paid_months,
            'total_pending_months' => $total_pending_months,
            'payment_rate' => $total_months > 0 ? round(($total_paid_months / $total_months) * 100, 1) : 0,
            'account_created' => date('M Y', strtotime($account_creation_date))
        ],
        'account_creation_date' => $account_creation_date
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error fetching monthly payment status: ' . $e->getMessage()
    ]);
}
?>
