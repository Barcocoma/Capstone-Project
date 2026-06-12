<?php
// generate_peace_garden_800.php
// Peace Garden sectors C & D, 400 rows each (800 total)
// Format matches screenshot: DD/MM/YYYY dates, X(Y) payment_status, etc.

$sectors = ['C', 'D']; // Peace Garden C and D only
$gardenInitial = 'P'; // Peace Garden

$firstNames = [
    'Daniel','Ariel','Carlos','Maria','Pedro','Luisa','Ramon','Carmen','Miguel','Lourdes',
    'Antonio','Rosa','Jose','Elena','Roberto','Gloria','Eduardo','Teresa','Paulo','Isabel',
    'Nicanor','Bea','Allan','Diana','Felix','Irene','Kevin','Lia','Mark','Nerissa',
    'Oscar','Patricia','Quincy','Rhea','Samuel','Tina','Ulrich','Veronica','Wilfred','Xenia'
];
$lastNames = [
    'Llamas','Ramos','Ortiz','Dela Cruz','Reyes','Santos','Garcia','Mendoza','Torres','Fernandez',
    'Gonzales','Ramos','Domingo','Aquino','Castillo','Flores','Navarro','Villanueva','Cruz','Salazar',
    'Morales','Aguilar','Santiago','Bautista','Castro','Dizon','Enriquez','Fuentes','Guevarra','Herrera'
];
$middleInits = ['I','II','L','C','G','J','N','A','B','D','E','F','H','K','M','O','P','Q','R','S','T'];

$cities = [
    ['city' => 'Caloocan', 'province' => 'Metro Manila', 'postal' => '1400'],
    ['city' => 'Pasig', 'province' => 'Metro Manila', 'postal' => '1600'],
    ['city' => 'Quezon City', 'province' => 'Metro Manila', 'postal' => '1100'],
    ['city' => 'Mandaluyong', 'province' => 'Metro Manila', 'postal' => '1550'],
    ['city' => 'Makati', 'province' => 'Metro Manila', 'postal' => '1200'],
    ['city' => 'Manila', 'province' => 'Metro Manila', 'postal' => '1000'],
    ['city' => 'Cabuyao', 'province' => 'Cavite', 'postal' => '4025'],
    ['city' => 'Sta. Rosa', 'province' => 'Laguna', 'postal' => '4026'],
    ['city' => 'Biñan', 'province' => 'Laguna', 'postal' => '4024'],
];

$occupations = ['Salesperson','Driver','Technician','Nurse','Business Owner','Beautician','Teacher','Engineer','Accountant','Office Staff'];
$employers   = ['ABC Corp','Govt Dept','Family Business','Private Clinic','Sunrise Co.','Metro Trading','City Hospital','Prime Builders'];
$sources     = ['Salary','Savings','Pension','Business','Investment','Inheritance'];
$userTypes   = ['representative','relative','client','customer'];
$relationships = ['Neighbor','Child','Mother','Father','Friend','Sibling','Spouse','Relative'];

$funeralHomes = ['St. Peter Chapels','Heavenly Peace Memorial','Eternal Rest Funeral','Divine Mercy Chapel'];
$causesOfDeath = ['Natural causes','Heart attack','Pneumonia','Accident','Cancer','Stroke'];

function pick(array $a) { return $a[array_rand($a)]; }
function randContact(): string {
    $n = str_pad((string)random_int(0, 999999999), 9, '0', STR_PAD_LEFT);
    return $n;
}

$fh = fopen('php://output', 'w');

// Header EXACTLY like screenshot
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
    'payment_status',
    'start_month',
    'end_month',
    'full_name',          // deceased full_name (before date_of_birth)
    'date_of_birth',
    'date_of_death',
    'burial_date',
    'lot_id',
    'vault_option',
]);

$row = 1;

// Max blocks per sector from lot_type_config.php
$maxBlocksPerSector = ['A' => 66, 'B' => 67, 'C' => 63, 'D' => 66];

foreach ($sectors as $sector) {
    // 400 rows per sector - use actual blocks from config
    $maxBlock = $maxBlocksPerSector[$sector];
    $rowsPerSector = 0;
    $targetRows = 400;
    
    // Cycle through blocks to reach 400 rows (4 lots per block)
    while ($rowsPerSector < $targetRows) {
        for ($block = 1; $block <= $maxBlock && $rowsPerSector < $targetRows; $block++) {
            for ($lot = 1; $lot <= 4 && $rowsPerSector < $targetRows; $lot++, $row++, $rowsPerSector++) {

                $first = pick($firstNames);
                $last  = pick($lastNames);
                $mid   = pick($middleInits);
                $gender = (random_int(0, 1) === 0) ? 'Male' : 'Female';

                // Lot code: PC5-3, PD10-2, etc. (using actual blocks from config)
                $lotCode = sprintf('%s%s%d-%d', $gardenInitial, $sector, $block, $lot);

            $emailLocal = strtolower(str_replace(' ', '.', $first . '.' . $last)) . $row;
            $email = $emailLocal . '@example.com';

            $cityInfo = pick($cities);
            $streetNum = random_int(1, 999);
            $streetName = pick(['Camia St.','Maharlika Rd','Rizal St','Bonifacio St','Mabini St','Luna St','Burgos St','Orchid St']);
            $street = $streetNum . ' ' . $streetName;

            $ecFirst = pick($firstNames);
            $ecLast  = pick($lastNames);
            $ecName  = $ecFirst . ' ' . $ecLast;

            $occupation = pick($occupations);
            $employer   = pick($employers);
            $income     = random_int(10000, 50000);
            $source     = pick($sources);
            $userType   = pick($userTypes);
            $relationship = pick($relationships);

            // Payment: X(Y) format like 0(12), 12(12), 4(6), 3(12)
            $termMonths = pick([6, 12, 24, 36, 48, 60]);
            $doneMonths = random_int(0, $termMonths);
            $paymentStatus = $doneMonths . '(' . $termMonths . ')';

            // Start date: random past date, format DD/MM/YYYY
            $startYear = random_int(2020, 2025);
            $startMonth = random_int(1, 12);
            $startDay = random_int(1, 28);
            $startDate = new DateTime();
            $startDate->setDate($startYear, $startMonth, $startDay);
            $startMonthExcel = $startDate->format('d/m/Y'); // DD/MM/YYYY

            // End date: start + termMonths, format DD/MM/YYYY
            $endDate = clone $startDate;
            $endDate->modify('+' . $termMonths . ' months');
            $endMonthExcel = $endDate->format('d/m/Y'); // DD/MM/YYYY

            // Deceased dates: DD/MM/YYYY format
            $dobYear = random_int(1940, 1985);
            $dobMonth = random_int(1, 12);
            $dobDay = random_int(1, 28);
            $dobDate = new DateTime();
            $dobDate->setDate($dobYear, $dobMonth, $dobDay);
            $dateOfBirth = $dobDate->format('d/m/Y');

            $dodYear = random_int(2015, 2024);
            $dodMonth = random_int(1, 12);
            $dodDay = random_int(1, 28);
            $dodDate = new DateTime();
            $dodDate->setDate($dodYear, $dodMonth, $dodDay);
            $dateOfDeath = $dodDate->format('d/m/Y');

            // Burial: 1-7 days after death
            $burialDate = clone $dodDate;
            $burialDate->modify('+' . random_int(1, 7) . ' days');
            $burialDateStr = $burialDate->format('d/m/Y');

            $vaultOption = pick(['option1','option2','option3']);
            $causeOfDeath = pick($causesOfDeath);
            $funeralHome = pick($funeralHomes);

            // Random lot_id from same sectors only (C and D only, not A or B)
            // Use actual blocks from lot_type_config.php:
            // Peace Garden A: blocks 1-66, B: blocks 1-67, C: blocks 1-63, D: blocks 1-66
            $randomSector = pick($sectors); // Use same sectors array (C and D)
            $maxBlockForLotId = $maxBlocksPerSector[$randomSector]; // Use same mapping
            $randomBlock = random_int(1, $maxBlockForLotId);
            $randomLot = random_int(1, 4);
            $randomLotId = sprintf('%s%s%d-%d', $gardenInitial, $randomSector, $randomBlock, $randomLot);

            fputcsv($fh, [
                $first . ' ' . $last,                 // full_name
                $lotCode,                             // lot_owned (PC... or PD...)
                $email,
                randContact(),                        // contact_number (10 digits)
                $gender,
                $mid,                                 // middle_name
                $userType,                            // user_type
                $street,                              // street_address
                $cityInfo['city'],
                $cityInfo['province'],
                $cityInfo['postal'],
                'Philippines',
                $ecName,                              // emergency_contact_name
                randContact(),                        // emergency_contact_phone
                $relationship,                        // emergency_contact_relationship
                $occupation,
                $employer,
                $income,
                $source,
                pick(['Promo','Imported','Auto-generated data','Manual entry']), // notes
                $paymentStatus,                       // payment_status: X(Y)
                $startMonthExcel,                     // start_month: DD/MM/YYYY
                $endMonthExcel,                       // end_month: DD/MM/YYYY
                $first . ' ' . $last,                 // full_name (deceased) - before date_of_birth
                $dateOfBirth,                         // date_of_birth: DD/MM/YYYY
                $dateOfDeath,                         // date_of_death: DD/MM/YYYY
                $burialDateStr,                       // burial_date: DD/MM/YYYY
                $randomLotId,                         // lot_id (random from PA/PB/PC/PD)
                $vaultOption,                         // vault_option
            ]);
            }
        }
    }
}

fclose($fh);

