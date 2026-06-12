<?php
require_once 'config.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    exit;
}

try {
    $reportType = $_GET['type'] ?? 'all';
    $dateRange = $_GET['date_range'] ?? 'last6months';
    $section = $_GET['section'] ?? 'all';
    $granularity = $_GET['granularity'] ?? 'auto'; // 'daily' | 'monthly' | 'yearly' | 'auto'
    $garden = $_GET['garden'] ?? 'all';
    $customStart = isset($_GET['start_date']) ? trim($_GET['start_date']) : null;
    $customEnd = isset($_GET['end_date']) ? trim($_GET['end_date']) : null;

    // Compute date range - Use datetime format for proper BETWEEN clause
    $today = date('Y-m-d');
    $startDate = null;
    $endDate = $today . ' 23:59:59'; // Include full day
    switch ($dateRange) {
        case 'last30days':
            $startDate = date('Y-m-d', strtotime('-30 days')) . ' 00:00:00';
            break;
        case 'last3months':
            $startDate = date('Y-m-d', strtotime('-3 months')) . ' 00:00:00';
            break;
        case 'last6months':
            $startDate = date('Y-m-d', strtotime('-6 months')) . ' 00:00:00';
            break;
        case 'lastyear':
            $startDate = date('Y-m-d', strtotime('-12 months')) . ' 00:00:00';
            break;
        case 'custom':
            // Expect start_date and end_date in YYYY-MM-DD
            if ($customStart && $customEnd && preg_match('/^\d{4}-\d{2}-\d{2}$/', $customStart) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $customEnd)) {
                $startDate = $customStart . ' 00:00:00';
                $endDate = $customEnd . ' 23:59:59';
            } else {
                // Fallback to last 3 months if invalid custom inputs
                $startDate = date('Y-m-d', strtotime('-3 months')) . ' 00:00:00';
            }
            break;
        default:
            $startDate = date('Y-m-d', strtotime('-6 months')) . ' 00:00:00';
            break;
    }

    // Section filter (expects values like 'all' or 'section-a')
    $sectionFilterSql = '';
    $sectionFilterParam = null;
    if ($section !== 'all') {
        $letter = strtoupper(substr($section, -1));
        if (preg_match('/^[A-Z]$/', $letter)) {
            $sectionFilterSql = " AND s.name = ? ";
            $sectionFilterParam = $letter;
        }
    }

    $gardenFilterSql = '';
    $gardenFilterParam = null;
    if ($garden !== 'all') {
        $gardenFilterSql = " AND g.name = ? ";
        $gardenFilterParam = $garden;
    }

    $reports = [];
    $summary = [];

    // Load mapping to compute total lots even when DB lacks rows
    $mappingTotalsBySector = [];
    $mappingTotalsByGardenSector = [];
    $mappingPairOriginalNames = [];
    $mappingGardenNames = [];
    try {
        require_once __DIR__ . '/mapping/lot_positions.php';
        if (isset($lotPositions) && is_array($lotPositions)) {
            foreach ($lotPositions as $gardenName => $sectors) {
                $gardenKey = strtoupper($gardenName);
                $mappingGardenNames[$gardenKey] = $gardenName;
                foreach ($sectors as $sectorName => $blocks) {
                    // Filter by requested section letter if provided
                    if ($sectionFilterParam && strtoupper($sectorName) !== $sectionFilterParam) {
                        continue;
                    }
                    $totalLots = 0;
                    foreach ($blocks as $blockNumber => $lotsCfg) {
                        if (is_array($lotsCfg)) {
                            $totalLots += count($lotsCfg);
                        }
                    }
                    $sectorKey = strtoupper($sectorName);
                    if (!isset($mappingTotalsBySector[$sectorKey])) { $mappingTotalsBySector[$sectorKey] = 0; }
                    $mappingTotalsBySector[$sectorKey] += $totalLots;
                    $pairKey = $gardenKey . '||' . $sectorKey;
                    $mappingTotalsByGardenSector[$pairKey] = ($mappingTotalsByGardenSector[$pairKey] ?? 0) + $totalLots;
                    $mappingPairOriginalNames[$pairKey] = ['garden' => $gardenName, 'sector' => $sectorName];
                }
            }
        }
    } catch (Throwable $e) {
        // ignore mapping load failures
    }

    // Financial reports removed
    if (false) {
        $financialData = [];
        $useDaily = ($granularity === 'daily') || ($granularity === 'auto' && $dateRange === 'last30days');
        $useYearly = ($granularity === 'yearly');
        // Convert datetime range to date range for payment_date comparison
        // Use today's date as end date to ensure current payments are included
        $startDateOnly = date('Y-m-d', strtotime($startDate));
        $endDateOnly = date('Y-m-d'); // Always use today to include latest payments
        
        if ($useDaily) {
            // Get all paid payments from payment_records (exclude deleted accounts)
            $sql = "SELECT DATE(COALESCE(pr.payment_date, DATE(pr.created_at))) AS d, 
                           COALESCE(SUM(pr.payment_amount),0) AS revenue, COUNT(*) AS cnt 
                    FROM payment_records pr
                    LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id AND l.deleted_at IS NULL
                    LEFT JOIN blocks b ON b.id = l.block_id
                    LEFT JOIN sectors s ON s.id = b.sector_id
                    LEFT JOIN gardens g ON g.id = s.garden_id
                    WHERE pr.status='Paid' AND pr.deleted_at IS NULL 
                    AND COALESCE(pr.payment_date, DATE(pr.created_at)) BETWEEN ? AND ?" . 
                    ($garden !== 'all' ? " AND g.name = ?" : "") . 
                    ($sectionFilterSql ? " AND s.name = ?" : "") . 
                    " GROUP BY d ORDER BY d";
            $stmt = $pdo->prepare($sql);
            $params = [$startDateOnly, $endDateOnly];
            if ($garden !== 'all') { $params[] = $garden; }
            if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
            $stmt->execute($params);
            $dailyData = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $d = $row['d'];
                if (!isset($dailyData[$d])) {
                    $dailyData[$d] = ['revenue' => 0, 'payments' => 0];
                }
                $dailyData[$d]['revenue'] += (float)$row['revenue'];
                $dailyData[$d]['payments'] += (int)$row['cnt'];
            }
            
            // Add down payments from payment_plans (exclude deleted accounts)
            $downPaymentSql = "SELECT DATE(pp.created_at) AS d, 
                                      COALESCE(SUM(pp.down_payment), 0) AS revenue, 
                                      COUNT(*) AS cnt
                               FROM payment_plans pp
                               JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                               JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                               LEFT JOIN blocks b ON b.id = l.block_id
                               LEFT JOIN sectors s ON s.id = b.sector_id
                               LEFT JOIN gardens g ON g.id = s.garden_id
                               WHERE pp.down_payment > 0 
                               AND pp.deleted_at IS NULL 
                               AND DATE(pp.created_at) BETWEEN ? AND ?" . 
                               ($garden !== 'all' ? " AND g.name = ?" : "") . 
                               ($sectionFilterSql ? " AND s.name = ?" : "") . 
                               " GROUP BY d ORDER BY d";
            $downPaymentStmt = $pdo->prepare($downPaymentSql);
            $params = [$startDateOnly, $endDateOnly];
            if ($garden !== 'all') { $params[] = $garden; }
            if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
            $downPaymentStmt->execute($params);
            while ($row = $downPaymentStmt->fetch(PDO::FETCH_ASSOC)) {
                $d = $row['d'];
                if (!isset($dailyData[$d])) {
                    $dailyData[$d] = ['revenue' => 0, 'payments' => 0];
                }
                $dailyData[$d]['revenue'] += (float)$row['revenue'];
                $dailyData[$d]['payments'] += (int)$row['cnt'];
            }
            
            // Add monthly payments from payment_plan_schedule when paid but not yet in payment_records (exclude deleted accounts)
            // This ensures all monthly payments are captured even if payment_records entry is missing
            $monthlyPaymentSql = "SELECT DATE(COALESCE(pr.payment_date, DATE(pr.created_at), pps.updated_at)) AS d,
                                         COALESCE(SUM(pps.amount_due), 0) AS revenue,
                                         COUNT(*) AS cnt
                                  FROM payment_plan_schedule pps
                                  JOIN payment_plans pp ON pp.id = pps.payment_plan_id AND pp.deleted_at IS NULL
                                  JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                                  JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                                  LEFT JOIN blocks b ON b.id = l.block_id
                                  LEFT JOIN sectors s ON s.id = b.sector_id
                                  LEFT JOIN gardens g ON g.id = s.garden_id
                                  LEFT JOIN payment_records pr ON pr.lot_id = l.id 
                                      AND DATE_FORMAT(pr.payment_date, '%Y-%m') = DATE_FORMAT(pps.due_date, '%Y-%m')
                                      AND pr.status = 'Paid' AND pr.deleted_at IS NULL
                                  WHERE pps.status = 'paid'
                                  AND (pr.id IS NULL OR DATE(COALESCE(pr.payment_date, DATE(pr.created_at), pps.updated_at)) BETWEEN ? AND ?)" . 
                                  ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                  ($sectionFilterSql ? " AND s.name = ?" : "") . 
                                  " GROUP BY d ORDER BY d";
            $monthlyPaymentStmt = $pdo->prepare($monthlyPaymentSql);
            $params = [$startDateOnly, $endDateOnly];
            if ($garden !== 'all') { $params[] = $garden; }
            if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
            $monthlyPaymentStmt->execute($params);
            while ($row = $monthlyPaymentStmt->fetch(PDO::FETCH_ASSOC)) {
                $d = $row['d'];
                if (!isset($dailyData[$d])) {
                    $dailyData[$d] = ['revenue' => 0, 'payments' => 0];
                }
                // Only add if date is within range (to avoid duplicates with payment_records)
                if ($d >= $startDateOnly && $d <= $endDateOnly) {
                    $dailyData[$d]['revenue'] += (float)$row['revenue'];
                    $dailyData[$d]['payments'] += (int)$row['cnt'];
                }
            }
            
            foreach ($dailyData as $d => $data) {
                $financialData[] = [
                    'month' => date('M d, Y', strtotime($d)),
                    'revenue' => $data['revenue'],
                    'payments' => $data['payments'],
                    'overdue' => 0
                ];
            }
        } elseif ($useYearly) {
            // Get all paid payments from payment_records (exclude deleted accounts)
            $sql = "SELECT YEAR(COALESCE(pr.payment_date, DATE(pr.created_at))) AS y, 
                           COALESCE(SUM(pr.payment_amount),0) AS revenue, COUNT(*) AS cnt 
                    FROM payment_records pr
                    LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id AND l.deleted_at IS NULL
                    LEFT JOIN blocks b ON b.id = l.block_id
                    LEFT JOIN sectors s ON s.id = b.sector_id
                    LEFT JOIN gardens g ON g.id = s.garden_id
                    WHERE pr.status='Paid' AND pr.deleted_at IS NULL 
                    AND COALESCE(pr.payment_date, DATE(pr.created_at)) BETWEEN ? AND ?" . 
                    ($garden !== 'all' ? " AND g.name = ?" : "") . 
                    ($sectionFilterSql ? " AND s.name = ?" : "") . 
                    " GROUP BY y ORDER BY y";
            $stmt = $pdo->prepare($sql);
            $params = [$startDateOnly, $endDateOnly];
            if ($garden !== 'all') { $params[] = $garden; }
            if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
            $stmt->execute($params);
            $yearlyData = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $y = (string)$row['y'];
                if (!isset($yearlyData[$y])) {
                    $yearlyData[$y] = ['revenue' => 0, 'payments' => 0];
                }
                $yearlyData[$y]['revenue'] += (float)$row['revenue'];
                $yearlyData[$y]['payments'] += (int)$row['cnt'];
            }
            
            // Add down payments (exclude deleted accounts)
            $downPaymentSql = "SELECT YEAR(pp.created_at) AS y, 
                                      COALESCE(SUM(pp.down_payment), 0) AS revenue, 
                                      COUNT(*) AS cnt
                               FROM payment_plans pp
                               JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                               JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                               LEFT JOIN blocks b ON b.id = l.block_id
                               LEFT JOIN sectors s ON s.id = b.sector_id
                               LEFT JOIN gardens g ON g.id = s.garden_id
                               WHERE pp.down_payment > 0 
                               AND pp.deleted_at IS NULL 
                               AND DATE(pp.created_at) BETWEEN ? AND ?" . 
                               ($garden !== 'all' ? " AND g.name = ?" : "") . 
                               ($sectionFilterSql ? " AND s.name = ?" : "") . 
                               " GROUP BY y ORDER BY y";
            $downPaymentStmt = $pdo->prepare($downPaymentSql);
            $params = [$startDateOnly, $endDateOnly];
            if ($garden !== 'all') { $params[] = $garden; }
            if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
            $downPaymentStmt->execute($params);
            while ($row = $downPaymentStmt->fetch(PDO::FETCH_ASSOC)) {
                $y = (string)$row['y'];
                if (!isset($yearlyData[$y])) {
                    $yearlyData[$y] = ['revenue' => 0, 'payments' => 0];
                }
                $yearlyData[$y]['revenue'] += (float)$row['revenue'];
                $yearlyData[$y]['payments'] += (int)$row['cnt'];
            }
            
            // Add monthly payments from payment_plan_schedule when paid but not yet in payment_records (exclude deleted accounts)
            $monthlyPaymentSql = "SELECT YEAR(COALESCE(pr.payment_date, DATE(pr.created_at), pps.updated_at)) AS y,
                                         COALESCE(SUM(pps.amount_due), 0) AS revenue,
                                         COUNT(*) AS cnt
                                  FROM payment_plan_schedule pps
                                  JOIN payment_plans pp ON pp.id = pps.payment_plan_id AND pp.deleted_at IS NULL
                                  JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                                  JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                                  LEFT JOIN blocks b ON b.id = l.block_id
                                  LEFT JOIN sectors s ON s.id = b.sector_id
                                  LEFT JOIN gardens g ON g.id = s.garden_id
                                  LEFT JOIN payment_records pr ON pr.lot_id = l.id 
                                      AND DATE_FORMAT(pr.payment_date, '%Y-%m') = DATE_FORMAT(pps.due_date, '%Y-%m')
                                      AND pr.status = 'Paid' AND pr.deleted_at IS NULL
                                  WHERE pps.status = 'paid'
                                  AND (pr.id IS NULL OR DATE(COALESCE(pr.payment_date, DATE(pr.created_at), pps.updated_at)) BETWEEN ? AND ?)" . 
                                  ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                  ($sectionFilterSql ? " AND s.name = ?" : "") . 
                                  " GROUP BY y ORDER BY y";
            $monthlyPaymentStmt = $pdo->prepare($monthlyPaymentSql);
            $params = [$startDateOnly, $endDateOnly];
            if ($garden !== 'all') { $params[] = $garden; }
            if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
            $monthlyPaymentStmt->execute($params);
            while ($row = $monthlyPaymentStmt->fetch(PDO::FETCH_ASSOC)) {
                $y = (string)$row['y'];
                if (!isset($yearlyData[$y])) {
                    $yearlyData[$y] = ['revenue' => 0, 'payments' => 0];
                }
                $yearlyData[$y]['revenue'] += (float)$row['revenue'];
                $yearlyData[$y]['payments'] += (int)$row['cnt'];
            }
            
            foreach ($yearlyData as $y => $data) {
                $financialData[] = [
                    'month' => $y,
                    'revenue' => $data['revenue'],
                    'payments' => $data['payments'],
                    'overdue' => 0
                ];
            }
        } else {
            // Monthly buckets from startDate..endDate
            // Ensure we include the current month by using today's date
            $cursor = date('Y-m-01', strtotime($startDate));
            $endCursor = date('Y-m-01'); // Current month's first day to ensure current month is included
            while ($cursor <= $endCursor) {
                $mStart = date('Y-m-01', strtotime($cursor));
                // For the current month, use today's date as end, otherwise use last day of month
                if ($cursor == $endCursor) {
                    $mEnd = date('Y-m-d'); // Use today for current month
                } else {
                    $mEnd = date('Y-m-t', strtotime($mStart)); // Last day of month for past months
                }
                
                // Revenue: Get all paid payments from payment_records (exclude deleted accounts)
                $revenueSql = "SELECT COALESCE(SUM(pr.payment_amount), 0) 
                               FROM payment_records pr
                               LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id AND l.deleted_at IS NULL
                               LEFT JOIN blocks b ON b.id = l.block_id
                               LEFT JOIN sectors s ON s.id = b.sector_id
                               LEFT JOIN gardens g ON g.id = s.garden_id
                               WHERE pr.status='Paid' AND pr.deleted_at IS NULL 
                               AND COALESCE(pr.payment_date, DATE(pr.created_at)) BETWEEN ? AND ?" . 
                               ($garden !== 'all' ? " AND g.name = ?" : "") . 
                               ($sectionFilterSql ? " AND s.name = ?" : "");
                $stmt = $pdo->prepare($revenueSql);
                $params = [$mStart, $mEnd];
                if ($garden !== 'all') { $params[] = $garden; }
                if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
                $stmt->execute($params);
                $revenue = (float)$stmt->fetchColumn();
                
                // Add down payments for this month (exclude deleted accounts)
                $downPaymentRevenueSql = "SELECT COALESCE(SUM(pp.down_payment), 0) 
                                          FROM payment_plans pp
                                          JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                                          JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                                          LEFT JOIN blocks b ON b.id = l.block_id
                                          LEFT JOIN sectors s ON s.id = b.sector_id
                                          LEFT JOIN gardens g ON g.id = s.garden_id
                                          WHERE pp.down_payment > 0 
                                          AND pp.deleted_at IS NULL 
                                          AND DATE(pp.created_at) BETWEEN ? AND ?" . 
                                          ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                          ($sectionFilterSql ? " AND s.name = ?" : "");
                $downPaymentStmt = $pdo->prepare($downPaymentRevenueSql);
                $params = [$mStart, $mEnd];
                if ($garden !== 'all') { $params[] = $garden; }
                if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
                $downPaymentStmt->execute($params);
                $downPaymentRevenue = (float)$downPaymentStmt->fetchColumn();
                $revenue += $downPaymentRevenue;
                
                // Payments count: Get all paid payments from payment_records (exclude deleted accounts)
                $paymentsSql = "SELECT COUNT(*) 
                                FROM payment_records pr
                                LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id AND l.deleted_at IS NULL
                                LEFT JOIN blocks b ON b.id = l.block_id
                                LEFT JOIN sectors s ON s.id = b.sector_id
                                LEFT JOIN gardens g ON g.id = s.garden_id
                                WHERE pr.status='Paid' AND pr.deleted_at IS NULL 
                                AND COALESCE(pr.payment_date, DATE(pr.created_at)) BETWEEN ? AND ?" . 
                                ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                ($sectionFilterSql ? " AND s.name = ?" : "");
                $paymentsStmt = $pdo->prepare($paymentsSql);
                $params = [$mStart, $mEnd];
                if ($garden !== 'all') { $params[] = $garden; }
                if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
                $paymentsStmt->execute($params);
                $payments = (int)$paymentsStmt->fetchColumn();
                
                // Add down payment count (exclude deleted accounts)
                $downPaymentCountSql = "SELECT COUNT(*) 
                                        FROM payment_plans pp
                                        JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                                        JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                                        LEFT JOIN blocks b ON b.id = l.block_id
                                        LEFT JOIN sectors s ON s.id = b.sector_id
                                        LEFT JOIN gardens g ON g.id = s.garden_id
                                        WHERE pp.down_payment > 0 
                                        AND pp.deleted_at IS NULL 
                                        AND DATE(pp.created_at) BETWEEN ? AND ?" . 
                                        ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                        ($sectionFilterSql ? " AND s.name = ?" : "");
                $downPaymentCountStmt = $pdo->prepare($downPaymentCountSql);
                $params = [$mStart, $mEnd];
                if ($garden !== 'all') { $params[] = $garden; }
                if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
                $downPaymentCountStmt->execute($params);
                $downPaymentCount = (int)$downPaymentCountStmt->fetchColumn();
                $payments += $downPaymentCount;
                
                // Add monthly payments from payment_plan_schedule when paid but not yet in payment_records (exclude deleted accounts)
                // This ensures all monthly payments are captured even if payment_records entry is missing
                $monthlyPaymentRevenueSql = "SELECT COALESCE(SUM(pps.amount_due), 0) 
                                            FROM payment_plan_schedule pps
                                            JOIN payment_plans pp ON pp.id = pps.payment_plan_id AND pp.deleted_at IS NULL
                                            JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                                            JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                                            LEFT JOIN blocks b ON b.id = l.block_id
                                            LEFT JOIN sectors s ON s.id = b.sector_id
                                            LEFT JOIN gardens g ON g.id = s.garden_id
                                            LEFT JOIN payment_records pr ON pr.lot_id = l.id 
                                                AND DATE_FORMAT(pr.payment_date, '%Y-%m') = DATE_FORMAT(pps.due_date, '%Y-%m')
                                                AND pr.status = 'Paid' AND pr.deleted_at IS NULL
                                            WHERE pps.status = 'paid'
                                            AND pr.id IS NULL
                                            AND DATE(pps.updated_at) BETWEEN ? AND ?" . 
                                            ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                            ($sectionFilterSql ? " AND s.name = ?" : "");
                $monthlyPaymentRevenueStmt = $pdo->prepare($monthlyPaymentRevenueSql);
                $params = [$mStart, $mEnd];
                if ($garden !== 'all') { $params[] = $garden; }
                if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
                $monthlyPaymentRevenueStmt->execute($params);
                $monthlyPaymentRevenue = (float)$monthlyPaymentRevenueStmt->fetchColumn();
                $revenue += $monthlyPaymentRevenue;
                
                // Add monthly payment count (only those not in payment_records)
                $monthlyPaymentCountSql = "SELECT COUNT(*) 
                                          FROM payment_plan_schedule pps
                                          JOIN payment_plans pp ON pp.id = pps.payment_plan_id AND pp.deleted_at IS NULL
                                          JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                                          JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                                          LEFT JOIN blocks b ON b.id = l.block_id
                                          LEFT JOIN sectors s ON s.id = b.sector_id
                                          LEFT JOIN gardens g ON g.id = s.garden_id
                                          LEFT JOIN payment_records pr ON pr.lot_id = l.id 
                                              AND DATE_FORMAT(pr.payment_date, '%Y-%m') = DATE_FORMAT(pps.due_date, '%Y-%m')
                                              AND pr.status = 'Paid' AND pr.deleted_at IS NULL
                                          WHERE pps.status = 'paid'
                                          AND pr.id IS NULL
                                          AND DATE(pps.updated_at) BETWEEN ? AND ?" . 
                                          ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                          ($sectionFilterSql ? " AND s.name = ?" : "");
                $monthlyPaymentCountStmt = $pdo->prepare($monthlyPaymentCountSql);
                $params = [$mStart, $mEnd];
                if ($garden !== 'all') { $params[] = $garden; }
                if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
                $monthlyPaymentCountStmt->execute($params);
                $monthlyPaymentCount = (int)$monthlyPaymentCountStmt->fetchColumn();
                $payments += $monthlyPaymentCount;
                $financialData[] = [
                    'month' => date('F Y', strtotime($mStart)),
                    'revenue' => $revenue,
                    'payments' => $payments,
                    'overdue' => 0
                ];
                $cursor = date('Y-m-01', strtotime('+1 month', strtotime($cursor)));
            }
        }
        $reports['financial'] = $financialData;
    }

    // Inventory (sold-installment vs sold-fully-paid; available/reserved/occupied) + Occupancy Rate
    if ($reportType === 'all' || $reportType === 'inventory') {
        // reserved/occupied counts (exclude deleted accounts)
        $invSql = "SELECT g.name AS garden, s.name AS sector,
                           COUNT(l.id) AS total_lots,
                           SUM(l.status='available') AS available_lots,
                           SUM(l.status='reserved') AS reserved_lots,
                           SUM(l.status='occupied') AS occupied_lots
                    FROM gardens g
                    JOIN sectors s ON s.garden_id = g.id
                    JOIN blocks b ON b.sector_id = s.id
                    LEFT JOIN lots l ON l.block_id = b.id AND l.deleted_at IS NULL
                    WHERE 1=1" . ($garden !== 'all' ? " AND g.name = ?" : "") . ($sectionFilterSql ? " AND s.name = ?" : "") .
                    " GROUP BY g.id, g.name, s.id, s.name ORDER BY g.name, s.name";
        $params = [];
        if ($garden !== 'all') { $params[] = $garden; }
        if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
        $soldStmt = $pdo->prepare($invSql);
        $soldStmt->execute($params);
        $dbByPair = [];
        while ($row = $soldStmt->fetch(PDO::FETCH_ASSOC)) {
            $gKey = strtoupper($row['garden']);
            $sKey = strtoupper($row['sector']);
            $pairKey = $gKey . '||' . $sKey;
            $dbByPair[$pairKey] = [
                'garden' => $row['garden'],
                'sector' => $row['sector'],
                'total_lots' => (int)($row['total_lots'] ?? 0),
                'available_lots' => (int)($row['available_lots'] ?? 0),
                'reserved_lots' => (int)($row['reserved_lots'] ?? 0),
                'occupied_lots' => (int)($row['occupied_lots'] ?? 0),
            ];
        }
        // sold by installment (active plan) - exclude deleted accounts
        $instSql = "SELECT g.name AS garden, s.name AS sector, COUNT(*) AS cnt
                    FROM payment_plans pp
                    JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
                    JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
                    JOIN blocks b ON b.id = l.block_id
                    JOIN sectors s ON s.id = b.sector_id
                    JOIN gardens g ON g.id = s.garden_id
                    WHERE pp.status='active' AND pp.deleted_at IS NULL" . ($garden !== 'all' ? " AND g.name = ?" : "") . ($sectionFilterSql ? " AND s.name = ?" : "") .
                    " GROUP BY g.id, g.name, s.id, s.name";
        $params2 = [];
        if ($garden !== 'all') { $params2[] = $garden; }
        if ($sectionFilterParam) { $params2[] = $sectionFilterParam; }
        $instStmt = $pdo->prepare($instSql);
        $instStmt->execute($params2);
        $installmentByKey = [];
        while ($row = $instStmt->fetch(PDO::FETCH_ASSOC)) {
            $key = strtoupper($row['garden']) . '||' . strtoupper($row['sector']);
            $installmentByKey[$key] = (int)$row['cnt'];
        }
        $inventory = [];
        // Include all garden+sector pairs from mapping; apply garden filter
        $pairsToInclude = [];
        foreach ($mappingTotalsByGardenSector as $pairKey => $tot) {
            if ($garden !== 'all') {
                $gardenKey = strtoupper($garden);
                if (strpos($pairKey, $gardenKey . '||') !== 0) continue;
            }
            $pairsToInclude[$pairKey] = true;
        }
        foreach ($dbByPair as $pairKey => $_) { $pairsToInclude[$pairKey] = true; }
        foreach (array_keys($pairsToInclude) as $pairKey) {
            [$gKey, $sKey] = explode('||', $pairKey);
            if ($sectionFilterParam && $sKey !== $sectionFilterParam) { continue; }
            $mapTotal = $mappingTotalsByGardenSector[$pairKey] ?? null;
            $origNames = $mappingPairOriginalNames[$pairKey] ?? null;
            $dbRow = $dbByPair[$pairKey] ?? null;
            $gardenName = $origNames['garden'] ?? ($dbRow['garden'] ?? ($mappingGardenNames[$gKey] ?? $gKey));
            $sectorName = $origNames['sector'] ?? ($dbRow['sector'] ?? $sKey);
            $reserved = (int)($dbRow['reserved_lots'] ?? 0);
            $occupied = (int)($dbRow['occupied_lots'] ?? 0);
            $sold = $reserved + $occupied;
            $soldInstallment = (int)($installmentByKey[$pairKey] ?? 0);
            $soldFullyPaid = max($sold - $soldInstallment, 0);
            $totalLots = $mapTotal !== null ? (int)$mapTotal : (int)($dbRow['total_lots'] ?? 0);
            $available = max($totalLots - $sold, 0);
            $occupancyRate = $totalLots > 0 ? round(($sold / $totalLots) * 100, 1) : 0;
            $inventory[] = [
                'garden' => $gardenName,
                'section' => $sectorName,
                'totalLots' => $totalLots,
                'availableLots' => $available,
                'reservedLots' => $reserved,
                'occupiedLots' => $occupied,
                'soldInstallment' => $soldInstallment,
                'soldFullyPaid' => $soldFullyPaid,
                'occupancyRate' => $occupancyRate
            ];
        }
        usort($inventory, function($a, $b) {
            if ($a['garden'] === $b['garden']) { return strcmp($a['section'], $b['section']); }
            return strcmp($a['garden'], $b['garden']);
        });
        $reports['inventory'] = $inventory;
    }

    // Sector summary (derive total lots from mapping; DB for status/interments)
    if ($reportType === 'all' || $reportType === 'sector_summary') {
        // interments and last burial per sector from DB (exclude deleted accounts)
        $sql = "
            SELECT g.name AS garden, s.name AS sector,
                   (
                       SELECT COUNT(*) FROM deceased_records d
                       JOIN lots l2 ON l2.id = d.lot_id AND l2.deleted_at IS NULL
                       JOIN blocks b2 ON b2.id = l2.block_id
                       WHERE b2.sector_id = s.id AND d.deleted_at IS NULL
                   ) AS interments,
                   (
                       SELECT MAX(d2.burial_date) FROM deceased_records d2
                       JOIN lots l3 ON l3.id = d2.lot_id AND l3.deleted_at IS NULL
                       JOIN blocks b3 ON b3.id = l3.block_id
                       WHERE b3.sector_id = s.id AND d2.deleted_at IS NULL
                   ) AS last_burial,
                   SUM(l.status = 'reserved') AS reserved_lots,
                   SUM(l.status = 'occupied') AS occupied_lots
            FROM sectors s
            JOIN gardens g ON g.id = s.garden_id
            LEFT JOIN blocks b ON b.sector_id = s.id
            LEFT JOIN lots l ON l.block_id = b.id AND l.deleted_at IS NULL
            WHERE 1=1" . ($garden !== 'all' ? " AND g.name = ?" : "") . ($sectionFilterSql ? " AND s.name = ?" : "") . "
            GROUP BY g.id, g.name, s.id, s.name
            ORDER BY g.name, s.name
        ";
        $stmt = $pdo->prepare($sql);
        $params = [];
        if ($garden !== 'all') { $params[] = $garden; }
        if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
        $stmt->execute($params);
        $sectorSummary = [];
        $dbSectorRows = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $gKey = strtoupper($row['garden']);
            $sKey = strtoupper($row['sector']);
            $pairKey = $gKey . '||' . $sKey;
            $dbSectorRows[$pairKey] = $row;
        }
        $pairsToInclude = [];
        foreach ($mappingTotalsByGardenSector as $pairKey => $tot) {
            if ($garden !== 'all') {
                $gKey = strtoupper($garden);
                if (strpos($pairKey, $gKey . '||') !== 0) continue;
            }
            $pairsToInclude[$pairKey] = true;
        }
        foreach ($dbSectorRows as $pairKey => $_) { $pairsToInclude[$pairKey] = true; }
        foreach (array_keys($pairsToInclude) as $pairKey) {
            [$gKey, $sKey] = explode('||', $pairKey);
            if ($sectionFilterParam && $sKey !== $sectionFilterParam) { continue; }
            $mapTotal = $mappingTotalsByGardenSector[$pairKey] ?? null;
            $origNames = $mappingPairOriginalNames[$pairKey] ?? null;
            $dbRow = $dbSectorRows[$pairKey] ?? null;
            $gardenName = $origNames['garden'] ?? ($dbRow['garden'] ?? ($mappingGardenNames[$gKey] ?? $gKey));
            $sectorName = $origNames['sector'] ?? ($dbRow['sector'] ?? $sKey);
            $reservedLots = (int)($dbRow['reserved_lots'] ?? 0);
            $occupiedLots = (int)($dbRow['occupied_lots'] ?? 0);
            $sold = $reservedLots + $occupiedLots;
            $totalLots = $mapTotal !== null ? (int)$mapTotal : (int)$sold; // fallback to sold if mapping missing
            $available = max($totalLots - $sold, 0);
            $sectorSummary[] = [
                'garden' => $gardenName,
                'sector' => $sectorName,
                'totalLots' => $totalLots,
                'availableLots' => $available,
                'reservedLots' => $reservedLots,
                'occupiedLots' => $occupiedLots,
                'interments' => (int)($dbRow['interments'] ?? 0),
                'lastBurial' => $dbRow['last_burial'] ?? null
            ];
        }
        usort($sectorSummary, function($a, $b) {
            if ($a['garden'] === $b['garden']) { return strcmp($a['sector'], $b['sector']); }
            return strcmp($a['garden'], $b['garden']);
        });
        $reports['sector_summary'] = $sectorSummary;
    }

    // Payment reports removed
    if (false) {
        $paymentData = [];
        // Simple query: Get all paid payments with date filtering (exclude deleted accounts)
        $sql = "SELECT pr.owner_name AS customerName,
                       pr.lot_id AS lotId,
                       pr.payment_amount AS paymentAmount,
                       pr.payment_date AS paymentDate,
                       pr.created_at AS createdAt,
                       pr.payment_method AS paymentMethod,
                       pr.status,
                       g.name AS garden,
                       s.name AS sector,
                       b.block_number AS block,
                       l.lot_number AS lot_number,
                       (
                         SELECT pp.id FROM payment_plans pp
                         WHERE pp.lot_id = l.id AND pp.customer_id = l.customer_id 
                         AND pp.status <> 'cancelled' AND pp.deleted_at IS NULL
                         ORDER BY FIELD(pp.status,'active','completed'), pp.id DESC LIMIT 1
                       ) AS pa_no
                FROM payment_records pr
                LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id AND l.deleted_at IS NULL
                LEFT JOIN blocks b ON b.id = l.block_id
                LEFT JOIN sectors s ON s.id = b.sector_id
                LEFT JOIN gardens g ON g.id = s.garden_id
                WHERE pr.status='Paid' 
                AND pr.deleted_at IS NULL
                AND COALESCE(pr.payment_date, DATE(pr.created_at)) BETWEEN ? AND ?" . 
                ($garden !== 'all' ? " AND g.name = ?" : "") . 
                ($sectionFilterSql ? " AND s.name = ?" : "") . "
                ORDER BY pr.created_at DESC
                LIMIT 5000";
        $params = [$startDateOnly, $endDateOnly];
        if ($garden !== 'all') { $params[] = $garden; }
        if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
        $paymentsStmt = $pdo->prepare($sql);
        $paymentsStmt->execute($params);
        while ($row = $paymentsStmt->fetch(PDO::FETCH_ASSOC)) {
            $lotLabel = ($row['garden'] && $row['sector'] && $row['block'] && $row['lot_number'])
              ? ($row['garden'] . ' ' . $row['sector'] . '-' . $row['block'] . '-' . $row['lot_number'])
              : (string)$row['lotId'];
            $paymentData[] = [
                'customerName' => $row['customerName'],
                'paNo' => $row['pa_no'] ? (int)$row['pa_no'] : null,
                'lot' => $lotLabel,
                'paymentAmount' => (float)$row['paymentAmount'],
                'paymentDate' => $row['paymentDate'] ?: date('Y-m-d', strtotime($row['createdAt'])),
                'createdAt' => $row['createdAt'],
                'paymentMethod' => $row['paymentMethod'],
                'status' => $row['status']
            ];
        }
        $reports['payments'] = $paymentData;
    }

    // Aging report (per PA/plan) + Interments
    if ($reportType === 'all' || $reportType === 'aging') {
        $sql = "
            SELECT pp.id AS pa_no,
                   CONCAT(u.first_name, ' ', u.last_name) AS buyer,
                   g.name AS garden, s.name AS sector, b.block_number AS block, l.lot_number AS lot_number,
                   pp.payment_term_months,
                   pp.monthly_amount,
                   pp.remaining_balance,
                   pp.start_date,
                   pp.end_date,
                   (
                     SELECT COUNT(*) FROM payment_plan_schedule s2 WHERE s2.payment_plan_id = pp.id
                   ) AS total_months,
                   (
                     SELECT COUNT(*) FROM payment_plan_schedule s2 WHERE s2.payment_plan_id = pp.id AND s2.status = 'paid'
                   ) AS months_paid,
                   (
                     SELECT COUNT(*) FROM payment_plan_schedule s2 WHERE s2.payment_plan_id = pp.id AND s2.status <> 'paid' AND s2.due_date < CURDATE()
                   ) AS months_overdue,
                   (
                    SELECT MAX(pr.created_at) FROM payment_records pr 
                    WHERE pr.status='Paid' AND pr.deleted_at IS NULL 
                    AND CAST(pr.lot_id AS UNSIGNED) = l.id
                   ) AS last_payment_date,
                   (
                     SELECT COUNT(*) FROM deceased_records d 
                     WHERE d.lot_id = l.id AND d.deleted_at IS NULL
                   ) AS interments
            FROM payment_plans pp
            JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
            JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
            JOIN blocks b ON b.id = l.block_id
            JOIN sectors s ON s.id = b.sector_id
            JOIN gardens g ON g.id = s.garden_id
            WHERE pp.status IN ('active','completed') AND pp.deleted_at IS NULL" . $gardenFilterSql . ($sectionFilterSql ? " AND s.name = ?" : "") . "
            ORDER BY pp.id DESC
        ";
        $stmt = $pdo->prepare($sql);
        $params = [];
        if ($gardenFilterParam) { $params[] = $gardenFilterParam; }
        if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
        $stmt->execute($params);
        $aging = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $totalMonths = (int)($row['total_months'] ?? 0);
            $monthsPaid = (int)($row['months_paid'] ?? 0);
            $monthsUnpaid = max($totalMonths - $monthsPaid, 0);
            $monthsOverdue = (int)($row['months_overdue'] ?? 0);
            $aging[] = [
                'paNo' => (int)$row['pa_no'],
                'buyer' => $row['buyer'],
                'garden' => $row['garden'],
                'sector' => $row['sector'],
                'lot' => $row['garden'] . ' ' . $row['sector'] . '-' . $row['block'] . '-' . $row['lot_number'],
                'termMonths' => (int)$row['payment_term_months'],
                'monthlyAmount' => (float)$row['monthly_amount'],
                'paidMonths' => $monthsPaid,
                'unpaidMonths' => $monthsUnpaid,
                'overdueMonths' => $monthsOverdue,
                'remainingBalance' => (float)$row['remaining_balance'],
                'lastPayment' => $row['last_payment_date'],
                'interments' => (int)($row['interments'] ?? 0)
            ];
        }
        $reports['aging'] = $aging;
    }

    // Cash position removed (redundant with payments summary)

    // Sales removed (merged with financial)

    // Fully paid (completed plans and spot cash records)
    if ($reportType === 'all' || $reportType === 'fully_paid') {
        $fullyPaid = [];
        $sql1 = "
            SELECT pp.id AS pa_no,
                   CONCAT(u.first_name, ' ', u.last_name) AS buyer,
                   g.name AS garden, s.name AS sector, b.block_number AS block, l.lot_number AS lot_number,
                   pp.end_date AS fully_paid_date,
                   pp.total_amount AS amount,
                   'Installment Completed' AS source
            FROM payment_plans pp
            JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
            JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
            JOIN blocks b ON b.id = l.block_id
            JOIN sectors s ON s.id = b.sector_id
            JOIN gardens g ON g.id = s.garden_id
            WHERE pp.status = 'completed' AND pp.deleted_at IS NULL" . ($sectionFilterSql ? " AND s.name = ?" : "") . "
            ORDER BY pp.end_date DESC
        ";
        $stmt1 = $pdo->prepare($sql1);
        if ($sectionFilterParam) { $stmt1->execute([$sectionFilterParam]); } else { $stmt1->execute(); }
        while ($row = $stmt1->fetch(PDO::FETCH_ASSOC)) {
            $fullyPaid[] = [
                'paNo' => (int)$row['pa_no'],
                'buyer' => $row['buyer'],
                'lot' => $row['garden'] . ' ' . $row['sector'] . '-' . $row['block'] . '-' . $row['lot_number'],
                'date' => $row['fully_paid_date'],
                'amount' => (float)$row['amount'],
                'method' => $row['source']
            ];
        }
        $sql2 = "
            SELECT pr.id,
                   COALESCE(CONCAT(u.first_name, ' ', u.last_name), pr.owner_name) AS buyer,
                   g.name AS garden, s.name AS sector, b.block_number AS block, l.lot_number AS lot_number,
                   pr.payment_date AS fully_paid_date,
                   pr.payment_amount AS amount,
                   pr.payment_method AS method
            FROM payment_records pr
            LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id AND l.deleted_at IS NULL
            LEFT JOIN blocks b ON b.id = l.block_id
            LEFT JOIN sectors s ON s.id = b.sector_id
            LEFT JOIN gardens g ON g.id = s.garden_id
            LEFT JOIN users u ON u.id = l.customer_id AND u.deleted_at IS NULL
            WHERE pr.status='Paid' AND pr.deleted_at IS NULL AND pr.notes LIKE 'Full payment%'" . ($sectionFilterSql ? " AND s.name = ?" : "") . "
            ORDER BY pr.payment_date DESC
        ";
        $stmt2 = $pdo->prepare($sql2);
        if ($sectionFilterParam) { $stmt2->execute([$sectionFilterParam]); } else { $stmt2->execute(); }
        while ($row = $stmt2->fetch(PDO::FETCH_ASSOC)) {
            $fullyPaid[] = [
                'paNo' => null,
                'buyer' => $row['buyer'],
                'lot' => $row['garden'] . ' ' . $row['sector'] . '-' . $row['block'] . '-' . $row['lot_number'],
                'date' => $row['fully_paid_date'],
                'amount' => (float)$row['amount'],
                'method' => $row['method']
            ];
        }
        $reports['fully_paid'] = $fullyPaid;
    }

    // Subsidiary ledger removed (interments moved to aging)

    // Statement of Accounts per buyer
    if ($reportType === 'all' || $reportType === 'soa') {
        $sql = "
            SELECT pp.id AS pa_no,
                   CONCAT(u.first_name, ' ', u.last_name) AS buyer,
                   g.name AS garden, s.name AS sector, b.block_number AS block, l.lot_number AS lot_number,
                   pp.total_amount,
                   pp.down_payment,
                   pp.monthly_amount,
                   pp.payment_term_months,
                   pp.start_date,
                   pp.end_date,
                   pp.status,
                   pp.remaining_balance,
                   (
                     SELECT COUNT(*) FROM payment_plan_schedule s2 WHERE s2.payment_plan_id = pp.id AND s2.status = 'paid'
                   ) AS months_paid,
                   (
                     SELECT COUNT(*) FROM payment_plan_schedule s2 WHERE s2.payment_plan_id = pp.id AND s2.status <> 'paid' AND s2.due_date < CURDATE()
                   ) AS months_overdue
            FROM payment_plans pp
            JOIN users u ON u.id = pp.customer_id AND u.deleted_at IS NULL
            JOIN lots l ON l.id = pp.lot_id AND l.deleted_at IS NULL
            JOIN blocks b ON b.id = l.block_id
            JOIN sectors s ON s.id = b.sector_id
            JOIN gardens g ON g.id = s.garden_id
            WHERE pp.deleted_at IS NULL" . $gardenFilterSql . ($sectionFilterSql ? " AND s.name = ?" : "") . "
            ORDER BY pp.id DESC
        ";
        $stmt = $pdo->prepare($sql);
        $params = [];
        if ($gardenFilterParam) { $params[] = $gardenFilterParam; }
        if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
        $stmt->execute($params);
        $soa = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $soa[] = [
                'paNo' => (int)$row['pa_no'],
                'buyer' => $row['buyer'],
                'garden' => $row['garden'],
                'sector' => $row['sector'],
                'lot' => $row['garden'] . ' ' . $row['sector'] . '-' . $row['block'] . '-' . $row['lot_number'],
                'totalAmount' => (float)$row['total_amount'],
                'downPayment' => (float)$row['down_payment'],
                'monthlyAmount' => (float)$row['monthly_amount'],
                'termMonths' => (int)$row['payment_term_months'],
                'startDate' => $row['start_date'],
                'endDate' => $row['end_date'],
                'status' => $row['status'],
                'remainingBalance' => (float)$row['remaining_balance'],
                'paidMonths' => (int)($row['months_paid'] ?? 0),
                'overdueMonths' => (int)($row['months_overdue'] ?? 0)
            ];
        }
        $reports['soa'] = $soa;
    }

    // Occupancy (derive from mapping + DB and include revenue by sector)
    if ($reportType === 'all' || $reportType === 'occupancy') {
        // reserved/occupied by garden+sector and totals
        $occSql = "SELECT g.name AS garden, s.name AS sector,
                          COUNT(l.id) AS total_lots,
                          SUM(l.status='reserved') AS reserved_lots,
                          SUM(l.status='occupied') AS occupied_lots,
                          SUM(l.status='available') AS available_lots
                    FROM gardens g
                    JOIN sectors s ON s.garden_id = g.id
                    JOIN blocks b ON b.sector_id = s.id
                    LEFT JOIN lots l ON l.block_id = b.id AND l.deleted_at IS NULL
                    WHERE 1=1" . ($garden !== 'all' ? " AND g.name = ?" : "") . ($sectionFilterSql ? " AND s.name = ?" : "") .
                    " GROUP BY g.id, g.name, s.id, s.name ORDER BY g.name, s.name";
        $occParams = [];
        if ($garden !== 'all') { $occParams[] = $garden; }
        if ($sectionFilterParam) { $occParams[] = $sectionFilterParam; }
        $occStmt = $pdo->prepare($occSql);
        $occStmt->execute($occParams);
        $occRows = $occStmt->fetchAll(PDO::FETCH_ASSOC);
        // Build DB map for occupancy by garden+sector
        $dbOccByPair = [];
        foreach ($occRows as $row) {
            $gKey = strtoupper($row['garden']);
            $sKey = strtoupper($row['sector']);
            $pairKey = $gKey . '||' . $sKey;
            $dbOccByPair[$pairKey] = $row;
        }
        // revenue by sector (within date range)
        // Revenue removed from occupancy per requirements; keep query for possible future use but do not attach.
        $revSql = "SELECT g.name AS garden, s.name AS sector, COALESCE(SUM(pr.payment_amount),0) AS revenue FROM payment_records pr LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id AND l.deleted_at IS NULL LEFT JOIN blocks b ON b.id = l.block_id LEFT JOIN sectors s ON s.id = b.sector_id LEFT JOIN gardens g ON g.id = s.garden_id WHERE pr.status='Paid' AND pr.deleted_at IS NULL AND pr.created_at BETWEEN ? AND ?" . ($garden !== 'all' ? " AND g.name = ?" : "") . ($sectionFilterSql ? " AND s.name = ?" : "") . " GROUP BY g.id, g.name, s.id, s.name";
        $revStmt = $pdo->prepare($revSql);
        $paramsRev = [$startDate, $endDate];
        if ($garden !== 'all') { $paramsRev[] = $garden; }
        if ($sectionFilterParam) { $paramsRev[] = $sectionFilterParam; }
        $revStmt->execute($paramsRev);
        $revBySector = [];
        while ($row = $revStmt->fetch(PDO::FETCH_ASSOC)) {
            $revBySector[strtoupper($row['sector'])] = (float)$row['revenue'];
        }
        // Include all garden+sector pairs from mapping; apply garden filter
        $pairsToInclude = [];
        foreach ($mappingTotalsByGardenSector as $pairKey => $tot) {
            if ($garden !== 'all') {
                $gKey = strtoupper($garden);
                if (strpos($pairKey, $gKey . '||') !== 0) continue;
            }
            $pairsToInclude[$pairKey] = true;
        }
        foreach ($dbOccByPair as $pairKey => $_) { $pairsToInclude[$pairKey] = true; }
        $occupancyData = [];
        foreach (array_keys($pairsToInclude) as $pairKey) {
            [$gKey, $sKey] = explode('||', $pairKey);
            if ($sectionFilterParam && $sKey !== $sectionFilterParam) { continue; }
            $mapTotal = $mappingTotalsByGardenSector[$pairKey] ?? null;
            $origNames = $mappingPairOriginalNames[$pairKey] ?? null;
            $dbRow = $dbOccByPair[$pairKey] ?? null;
            $gardenName = $origNames['garden'] ?? ($dbRow['garden'] ?? ($mappingGardenNames[$gKey] ?? $gKey));
            $sectorName = $origNames['sector'] ?? ($dbRow['sector'] ?? $sKey);
            $totalLots = $mapTotal !== null ? (int)$mapTotal : (int)($dbRow['total_lots'] ?? 0);
            $reservedLots = (int)($dbRow['reserved_lots'] ?? 0);
            $occupiedLots = (int)($dbRow['occupied_lots'] ?? 0);
            $soldLots = $reservedLots + $occupiedLots;
            $availableLots = max($totalLots - $soldLots, 0);
            $rate = $totalLots > 0 ? round(($soldLots / $totalLots) * 100, 1) : 0;
            $key = $pairKey;
            $occupancyData[] = [
                'garden' => $gardenName,
                'section' => $sectorName,
                'totalLots' => $totalLots,
                'soldLots' => $soldLots,
                'availableLots' => $availableLots,
                'occupancyRate' => $rate
            ];
        }
        usort($occupancyData, function($a, $b) {
            if ($a['garden'] === $b['garden']) { return strcmp($a['section'], $b['section']); }
            return strcmp($a['garden'], $b['garden']);
        });
        $reports['occupancy'] = $occupancyData;
    }

    // Summary cards: Get all paid payments from payment_records + down payments
    $startDateOnly = date('Y-m-d', strtotime($startDate));
    $endDateOnly = date('Y-m-d'); // Always use today to include latest payments
    $summarySql = "SELECT COALESCE(SUM(pr.payment_amount), 0) 
                   FROM payment_records pr
                   LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id
                   LEFT JOIN blocks b ON b.id = l.block_id
                   LEFT JOIN sectors s ON s.id = b.sector_id
                   LEFT JOIN gardens g ON g.id = s.garden_id
                   WHERE pr.status='Paid' AND pr.deleted_at IS NULL 
                   AND COALESCE(pr.payment_date, DATE(pr.created_at)) BETWEEN ? AND ?" . 
                   ($garden !== 'all' ? " AND g.name = ?" : "") . 
                   ($sectionFilterSql ? " AND s.name = ?" : "");
    $stmt = $pdo->prepare($summarySql);
    $params = [$startDateOnly, $endDateOnly];
    if ($garden !== 'all') { $params[] = $garden; }
    if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
    $stmt->execute($params);
    $totalRevenue = (float)$stmt->fetchColumn();
    
    // Add down payments to total revenue
    $downPaymentSummarySql = "SELECT COALESCE(SUM(pp.down_payment), 0) 
                              FROM payment_plans pp
                              JOIN lots l ON l.id = pp.lot_id
                              LEFT JOIN blocks b ON b.id = l.block_id
                              LEFT JOIN sectors s ON s.id = b.sector_id
                              LEFT JOIN gardens g ON g.id = s.garden_id
                              WHERE pp.down_payment > 0 
                              AND pp.deleted_at IS NULL 
                              AND DATE(pp.created_at) BETWEEN ? AND ?" . 
                              ($garden !== 'all' ? " AND g.name = ?" : "") . 
                              ($sectionFilterSql ? " AND s.name = ?" : "");
    $downPaymentStmt = $pdo->prepare($downPaymentSummarySql);
    $params = [$startDateOnly, $endDateOnly];
    if ($garden !== 'all') { $params[] = $garden; }
    if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
    $downPaymentStmt->execute($params);
    $downPaymentRevenue = (float)$downPaymentStmt->fetchColumn();
    $totalRevenue += $downPaymentRevenue;
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM payment_records WHERE status='Pending'");
    $stmt->execute();
    $pendingPayments = (int)$stmt->fetchColumn();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM lots");
    $stmt->execute();
    $totalLots = (int)$stmt->fetchColumn();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM lots WHERE status='occupied'");
    $stmt->execute();
    $soldLots = (int)$stmt->fetchColumn();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM lots WHERE status='available'");
    $stmt->execute();
    $availableLots = (int)$stmt->fetchColumn();
    $occupancyRate = $totalLots > 0 ? round(($soldLots / $totalLots) * 100, 1) : 0;

    // Total paid transactions: Get all from payment_records + down payments
    $transactionsSql = "SELECT COUNT(*) 
                        FROM payment_records pr
                        LEFT JOIN lots l ON CAST(pr.lot_id AS UNSIGNED) = l.id
                        LEFT JOIN blocks b ON b.id = l.block_id
                        LEFT JOIN sectors s ON s.id = b.sector_id
                        LEFT JOIN gardens g ON g.id = s.garden_id
                        WHERE pr.status='Paid' AND pr.deleted_at IS NULL 
                        AND COALESCE(pr.payment_date, DATE(pr.created_at)) BETWEEN ? AND ?" . 
                        ($garden !== 'all' ? " AND g.name = ?" : "") . 
                        ($sectionFilterSql ? " AND s.name = ?" : "");
    $stmt = $pdo->prepare($transactionsSql);
    $params = [$startDateOnly, $endDateOnly];
    if ($garden !== 'all') { $params[] = $garden; }
    if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
    $stmt->execute($params);
    $transactionsInRange = (int)$stmt->fetchColumn();
    
    // Add down payment transactions
    $downPaymentTransactionsSql = "SELECT COUNT(*) 
                                    FROM payment_plans pp
                                    JOIN lots l ON l.id = pp.lot_id
                                    LEFT JOIN blocks b ON b.id = l.block_id
                                    LEFT JOIN sectors s ON s.id = b.sector_id
                                    LEFT JOIN gardens g ON g.id = s.garden_id
                                    WHERE pp.down_payment > 0 
                                    AND pp.deleted_at IS NULL 
                                    AND DATE(pp.created_at) BETWEEN ? AND ?" . 
                                    ($garden !== 'all' ? " AND g.name = ?" : "") . 
                                    ($sectionFilterSql ? " AND s.name = ?" : "");
    $downPaymentTransactionsStmt = $pdo->prepare($downPaymentTransactionsSql);
    $params = [$startDateOnly, $endDateOnly];
    if ($garden !== 'all') { $params[] = $garden; }
    if ($sectionFilterParam) { $params[] = $sectionFilterParam; }
    $downPaymentTransactionsStmt->execute($params);
    $downPaymentTransactions = (int)$downPaymentTransactionsStmt->fetchColumn();
    $transactionsInRange += $downPaymentTransactions;

    $summary['financial'] = [
        'totalRevenue' => $totalRevenue,
        'pendingPayments' => $pendingPayments,
        'transactions' => $transactionsInRange
    ];
    $summary['occupancy'] = [
        'totalLots' => $totalLots,
        'soldLots' => $soldLots,
        'availableLots' => $availableLots,
        'occupancyRate' => $occupancyRate
    ];
    $summary['payments'] = [
        'totalPayments' => $transactionsInRange,
        'totalAmount' => $totalRevenue,
        'pendingPayments' => $pendingPayments,
        'averagePayment' => $transactionsInRange > 0 ? round($totalRevenue / $transactionsInRange, 2) : 0
    ];

    echo json_encode([
        'success' => true,
        'reports' => $reports,
        'summary' => $summary
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>


