<?php
$sectors = ['A', 'B', 'C', 'D'];
$gardenInitial = 'H'; // Hope Garden

$firstNames = ['Juan','Maria','Jose','Ana','Pedro','Luisa','Ramon','Carmen','Miguel','Lourdes',
    'Antonio','Rosa','Carlos','Elena','Roberto','Gloria','Eduardo','Teresa','Paulo','Isabel',
    'Nicanor','Bea','Allan','Diana','Felix','Irene','Kevin','Lia','Mark','Nerissa'];
$lastNames = ['Dela Cruz','Reyes','Santos','Garcia','Mendoza','Torres','Fernandez','Gonzales','Ramos','Domingo',
    'Aquino','Castillo','Flores','Navarro','Villanueva','Cruz','Salazar','Morales','Aguilar','Santiago'];
$middleInits = ['A.','B.','C.','D.','E.','F.','G.','H.','I.','J.','K.','L.','M.','N.','O.','P.'];

$cities = [
    ['city' => 'Manila', 'province' => 'Metro Manila', 'postal' => '1000'],
    ['city' => 'Quezon City', 'province' => 'Metro Manila', 'postal' => '1100'],
    ['city' => 'Makati', 'province' => 'Metro Manila', 'postal' => '1200'],
    ['city' => 'Cebu City', 'province' => 'Cebu', 'postal' => '6000'],
    ['city' => 'Davao City', 'province' => 'Davao del Sur', 'postal' => '8000'],
];
$occupations = ['Engineer','Teacher','Nurse','Driver','Sales Agent','Office Staff','Accountant','IT Specialist','Business Owner','Manager'];
$employers   = ['ABC Corp','XYZ Trading','Mabuhay Enterprises','Philippine Bank','Golden Fields Inc.','City Hospital','Sunrise Retail'];
$sources     = ['salary','business','investment','inheritance','other'];

function pick(array $a) { return $a[array_rand($a)]; }
function randContact(): string {
    $n = str_pad((string)random_int(0, 9999999), 7, '0', STR_PAD_LEFT);
    return '0917' . $n;
}

$fh = fopen('php://output', 'w');

// Extended header to support payments and deceased import via import_users.php
fputcsv($fh, [
    'full_name',
    'lot_owned',
    'email',
    'contact_number',
    'gender',
    'middle_name',
    'user_type',
    'street_address',
    'city',
    'province',
    'postal_code',
    'country',
    'emergency_contact_name',
    'emergency_contact_phone',
    'emergency_contact_relationship',
    'occupation',
    'employer',
    'monthly_income',
    'source_of_funds',
    'notes',
    // Simple payment fields
    'payment_status',
    'start_month',
    'end_month',
    // Deceased fields
    'deceased_name',
    'deceased_date_of_birth',
    'deceased_date_of_death',
    'deceased_burial_date',
    'deceased_cause_of_death',
    'deceased_funeral_home',
    'deceased_status',
    'deceased_notes',
]);

$row = 1;

foreach ($sectors as $sector) {
    for ($block = 1; $block <= 100; $block++) {
        for ($lot = 1; $lot <= 4; $lot++, $row++) {

            $first = pick($firstNames);
            $last  = pick($lastNames);
            $mid   = pick($middleInits);
            $gender = (random_int(0, 1) === 0) ? 'Male' : 'Female';

            $lotCode = sprintf('%s%s%d-%d', $gardenInitial, $sector, $block, $lot); // e.g. HA5-3

            $emailLocal = strtolower(str_replace(' ', '.', $first . '.' . $last)) . str_pad((string)$row, 3, '0', STR_PAD_LEFT);
            $email = $emailLocal . '@example.com';

            $cityInfo = pick($cities);
            $street = random_int(10, 999) . ' ' . pick(['Rizal St','Bonifacio St','Mabini St','Luna St','Burgos St']);

            $ecFirst = pick($firstNames);
            $ecLast  = pick($lastNames);
            $ecName  = $ecFirst . ' ' . $ecLast;

            $occupation = pick($occupations);
            $employer   = pick($employers);
            $income     = random_int(15000, 80000);
            $source     = pick($sources);

            // Payment plan style: "6(12)" etc. Import expects this format.
            $termMonths = pick([12, 24, 36, 48, 60]);
            $doneMonths = random_int(0, $termMonths);
            $paymentStatus = $doneMonths . '(' . $termMonths . ')';

            // Random start month in 2024, end month = start + (termMonths - 1) months
            $startDate = new DateTime('2024-01-01');
            $startDate->modify('+' . random_int(0, 11) . ' months');
            $endDate = clone $startDate;
            $endDate->modify('+' . ($termMonths - 1) . ' months');
            // Excel-style M/D/YYYY, matches import_users.php parser
            $startMonthExcel = $startDate->format('n/j/Y');
            $endMonthExcel = $endDate->format('n/j/Y');

            fputcsv($fh, [
                $first . ' ' . $last,                 // full_name
                $lotCode,                              // lot_owned
                $email,
                randContact(),                         // contact_number
                $gender,
                $mid,                                  // middle_name
                'customer',                            // user_type
                $street,
                $cityInfo['city'],
                $cityInfo['province'],
                $cityInfo['postal'],
                'Philippines',
                $ecName,
                randContact(),
                'Relative',
                $occupation,
                $employer,
                $income,
                $source,
                'Hope Garden ' . $sector . ' test row ' . $row,
                // Simple payment data
                $paymentStatus,                        // payment_status e.g. 6(12)
                $startMonthExcel,                      // start_month (M/D/YYYY)
                $endMonthExcel,                        // end_month (M/D/YYYY)
                // Deceased data (one deceased per lot for testing)
                $first . ' ' . $last,                  // deceased_name
                date('Y-m-d', strtotime('-' . random_int(40, 80) . ' years')), // dob
                date('Y-m-d', strtotime('-' . random_int(1, 10) . ' years')),  // dod
                date('Y-m-d', strtotime('-' . random_int(0, 1) . ' years')),   // burial_date approx
                pick(['Natural causes','Heart attack','Pneumonia','Accident','Cancer']),
                pick(['St. Peter Chapels','Heavenly Peace Memorial','Eternal Rest Funeral','Divine Mercy Chapel']),
                'BURIED',
                'Test deceased record for ' . $lotCode,
            ]);
        }
    }
}

fclose($fh);