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
    
    $reports = [];
    
    // Financial Reports
    if ($reportType === 'all' || $reportType === 'financial') {
        // Get monthly financial data
        $financialData = [];
        $months = [];
        
        // Generate last 6 months
        for ($i = 5; $i >= 0; $i--) {
            $date = date('Y-m', strtotime("-$i months"));
            $months[] = $date;
        }
        
        foreach ($months as $month) {
            $startDate = $month . '-01';
            $endDate = date('Y-m-t', strtotime($startDate));
            
            // Revenue (total payments received) - Use created_at to include installment payments
            $revenueStmt = $pdo->prepare("
                SELECT COALESCE(SUM(payment_amount), 0) as revenue 
                FROM payment_records 
                WHERE status = 'Paid' 
                AND DATE(created_at) BETWEEN ? AND ?
            ");
            $revenueStmt->execute([$startDate, $endDate]);
            $revenue = $revenueStmt->fetchColumn();
            
            // Expenses (placeholder - you might have an expenses table)
            $expenses = $revenue * 0.3; // Assume 30% expenses
            
            // Count payments - Use created_at to include installment payments
            $paymentsStmt = $pdo->prepare("
                SELECT COUNT(*) as count 
                FROM payment_records 
                WHERE status = 'Paid' 
                AND DATE(created_at) BETWEEN ? AND ?
            ");
            $paymentsStmt->execute([$startDate, $endDate]);
            $payments = $paymentsStmt->fetchColumn();
            
            // Overdue payments
            $overdueStmt = $pdo->prepare("
                SELECT COUNT(*) as count 
                FROM payment_records 
                WHERE status = 'Pending' 
                AND payment_due_date < CURDATE()
            ");
            $overdueStmt->execute();
            $overdue = $overdueStmt->fetchColumn();
            
            $financialData[] = [
                'month' => date('F Y', strtotime($startDate)),
                'revenue' => floatval($revenue),
                'expenses' => floatval($expenses),
                'profit' => floatval($revenue - $expenses),
                'payments' => intval($payments),
                'overdue' => intval($overdue)
            ];
        }
        
        $reports['financial'] = $financialData;
    }
    
    // Occupancy Reports
    if ($reportType === 'all' || $reportType === 'occupancy') {
        $occupancyData = [];
        
        // Get sector-wise occupancy data using correct table relationships
        $sectorsStmt = $pdo->prepare("
            SELECT s.name as section, 
                   COUNT(l.id) as total_lots,
                   SUM(CASE WHEN l.status = 'occupied' THEN 1 ELSE 0 END) as sold_lots,
                   SUM(CASE WHEN l.status = 'available' THEN 1 ELSE 0 END) as available_lots
            FROM sectors s
            LEFT JOIN blocks b ON s.id = b.sector_id
            LEFT JOIN lots l ON b.id = l.block_id
            GROUP BY s.id, s.name
            ORDER BY s.name
        ");
        $sectorsStmt->execute();
        
        while ($row = $sectorsStmt->fetch(PDO::FETCH_ASSOC)) {
            $totalLots = intval($row['total_lots']);
            $soldLots = intval($row['sold_lots']);
            $availableLots = intval($row['available_lots']);
            $occupancyRate = $totalLots > 0 ? round(($soldLots / $totalLots) * 100, 1) : 0;
            
            // Calculate revenue (estimate based on sold lots)
            $revenue = $soldLots * 50000; // Assume average lot price
            
            $occupancyData[] = [
                'section' => $row['section'],
                'totalLots' => $totalLots,
                'soldLots' => $soldLots,
                'availableLots' => $availableLots,
                'occupancyRate' => $occupancyRate,
                'revenue' => $revenue
            ];
        }
        
        $reports['occupancy'] = $occupancyData;
    }
    
    // Payment Reports
    if ($reportType === 'all' || $reportType === 'payments') {
        $paymentData = [];
        
        $paymentsStmt = $pdo->prepare("
            SELECT pr.owner_name as customerName,
                   pr.lot_id as lotId,
                   pr.payment_amount as paymentAmount,
                   pr.payment_date as paymentDate,
                   pr.payment_method as paymentMethod,
                   pr.status
            FROM payment_records pr
            ORDER BY pr.payment_date DESC
            LIMIT 50
        ");
        $paymentsStmt->execute();
        
        while ($row = $paymentsStmt->fetch(PDO::FETCH_ASSOC)) {
            $paymentData[] = [
                'customerName' => $row['customerName'],
                'lotId' => $row['lotId'],
                'paymentAmount' => floatval($row['paymentAmount']),
                'paymentDate' => $row['paymentDate'],
                'paymentMethod' => $row['paymentMethod'],
                'status' => $row['status']
            ];
        }
        
        $reports['payments'] = $paymentData;
    }
    
    // Customer Analytics
    if ($reportType === 'all' || $reportType === 'customers') {
        $customerData = [];
        
        // Total customers
        $totalCustomersStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE account_type = 'customer'");
        $totalCustomersStmt->execute();
        $totalCustomers = $totalCustomersStmt->fetchColumn();
        
        // Active customers (with recent activity)
        $activeCustomersStmt = $pdo->prepare("
            SELECT COUNT(DISTINCT u.id) 
            FROM users u
            INNER JOIN payment_records pr ON u.first_name = pr.owner_name
            WHERE u.account_type = 'customer' 
            AND pr.payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ");
        $activeCustomersStmt->execute();
        $activeCustomers = $activeCustomersStmt->fetchColumn();
        
        // New customers this month
        $newCustomersStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM users 
            WHERE account_type = 'customer' 
            AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
        ");
        $newCustomersStmt->execute();
        $newCustomers = $newCustomersStmt->fetchColumn();
        
        // Customer categories
        $customerData = [
            [
                'category' => 'New Customers',
                'count' => intval($newCustomers),
                'percentage' => $totalCustomers > 0 ? round(($newCustomers / $totalCustomers) * 100, 1) : 0,
                'trend' => '+12%',
                'color' => 'green'
            ],
            [
                'category' => 'Active Customers',
                'count' => intval($activeCustomers),
                'percentage' => $totalCustomers > 0 ? round(($activeCustomers / $totalCustomers) * 100, 1) : 0,
                'trend' => '+8%',
                'color' => 'blue'
            ],
            [
                'category' => 'Inactive Customers',
                'count' => intval($totalCustomers - $activeCustomers),
                'percentage' => $totalCustomers > 0 ? round((($totalCustomers - $activeCustomers) / $totalCustomers) * 100, 1) : 0,
                'trend' => '-3%',
                'color' => 'red'
            ],
            [
                'category' => 'Premium Customers',
                'count' => intval($activeCustomers * 0.3),
                'percentage' => $totalCustomers > 0 ? round((($activeCustomers * 0.3) / $totalCustomers) * 100, 1) : 0,
                'trend' => '+18%',
                'color' => 'purple'
            ],
            [
                'category' => 'Standard Customers',
                'count' => intval($totalCustomers - ($activeCustomers * 0.3)),
                'percentage' => $totalCustomers > 0 ? round((($totalCustomers - ($activeCustomers * 0.3)) / $totalCustomers) * 100, 1) : 0,
                'trend' => '+5%',
                'color' => 'orange'
            ]
        ];
        
        $reports['customers'] = $customerData;
    }
    
    // Summary statistics
    $summary = [];
    
    // Financial summary
    $totalRevenueStmt = $pdo->prepare("SELECT COALESCE(SUM(payment_amount), 0) FROM payment_records WHERE status = 'Paid'");
    $totalRevenueStmt->execute();
    $totalRevenue = $totalRevenueStmt->fetchColumn();
    
    $totalExpenses = $totalRevenue * 0.3; // 30% expenses
    $netProfit = $totalRevenue - $totalExpenses;
    
    $pendingPaymentsStmt = $pdo->prepare("SELECT COUNT(*) FROM payment_records WHERE status = 'Pending'");
    $pendingPaymentsStmt->execute();
    $pendingPayments = $pendingPaymentsStmt->fetchColumn();
    
    $summary['financial'] = [
        'totalRevenue' => floatval($totalRevenue),
        'totalExpenses' => floatval($totalExpenses),
        'netProfit' => floatval($netProfit),
        'pendingPayments' => intval($pendingPayments)
    ];
    
    // Occupancy summary
    $totalLotsStmt = $pdo->prepare("SELECT COUNT(*) FROM lots");
    $totalLotsStmt->execute();
    $totalLots = $totalLotsStmt->fetchColumn();
    
    $soldLotsStmt = $pdo->prepare("SELECT COUNT(*) FROM lots WHERE status = 'occupied'");
    $soldLotsStmt->execute();
    $soldLots = $soldLotsStmt->fetchColumn();
    
    $availableLotsStmt = $pdo->prepare("SELECT COUNT(*) FROM lots WHERE status = 'available'");
    $availableLotsStmt->execute();
    $availableLots = $availableLotsStmt->fetchColumn();
    
    $occupancyRate = $totalLots > 0 ? round(($soldLots / $totalLots) * 100, 1) : 0;
    
    $summary['occupancy'] = [
        'totalLots' => intval($totalLots),
        'soldLots' => intval($soldLots),
        'availableLots' => intval($availableLots),
        'occupancyRate' => $occupancyRate
    ];
    
    // Payment summary
    $totalPaymentsStmt = $pdo->prepare("SELECT COUNT(*) FROM payment_records");
    $totalPaymentsStmt->execute();
    $totalPayments = $totalPaymentsStmt->fetchColumn();
    
    $avgPaymentStmt = $pdo->prepare("SELECT COALESCE(AVG(payment_amount), 0) FROM payment_records WHERE status = 'Paid'");
    $avgPaymentStmt->execute();
    $avgPayment = $avgPaymentStmt->fetchColumn();
    
    $summary['payments'] = [
        'totalPayments' => intval($totalPayments),
        'totalAmount' => floatval($totalRevenue),
        'averagePayment' => floatval($avgPayment),
        'pendingPayments' => intval($pendingPayments)
    ];
    
    // Customer summary
    $summary['customers'] = [
        'totalCustomers' => intval($totalCustomers),
        'activeCustomers' => intval($activeCustomers),
        'newThisMonth' => intval($newCustomers),
        'retentionRate' => $totalCustomers > 0 ? round(($activeCustomers / $totalCustomers) * 100, 1) : 0
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
