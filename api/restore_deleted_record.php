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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Check if user is authenticated
$actorId = get_actor_user_id();
if (!$actorId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// Only admin can restore deleted records
$stmt = $pdo->prepare('SELECT account_type FROM users WHERE id = ?');
$stmt->execute([$actorId]);
$actorRole = strtolower($stmt->fetchColumn() ?: '');

if ($actorRole !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden: Admin access required']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['backup_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing backup_id']);
    exit;
}

$backupId = intval($data['backup_id']);
$userId = $actorId;

// Check if MySQLi connection is available
if (!isset($conn) || $conn === null) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection error. Please check server configuration.']);
    exit;
}

try {
    $conn->begin_transaction();
    
    // Get backup record
    $stmt = $conn->prepare("SELECT * FROM deleted_records_backup WHERE id = ?");
    $stmt->bind_param("i", $backupId);
    $stmt->execute();
    $result = $stmt->get_result();
    $backup = $result->fetch_assoc();
    
    if (!$backup) {
        throw new Exception('Backup record not found');
    }
    
    if (!$backup['can_restore']) {
        throw new Exception('This record cannot be restored: ' . $backup['restore_notes']);
    }
    
    $recordType = $backup['record_type'];
    $snapshot = json_decode($backup['snapshot_data'], true);
    $related = json_decode($backup['related_data'], true);
    
    switch ($recordType) {
        case 'user':
            $result = restoreUser($conn, $backup, $snapshot, $related, $userId, $data);
            break;
        case 'lot':
            $result = restoreLot($conn, $backup, $snapshot, $related, $userId, $data);
            break;
        case 'deceased':
            $result = restoreDeceased($conn, $backup, $snapshot, $userId);
            break;
        case 'payment':
            $result = restorePayment($conn, $backup, $snapshot, $userId);
            break;
        default:
            throw new Exception('Invalid record type');
    }
    
    if ($result['success']) {
        // Log recovery in history
        $recoveryDetails = json_encode($result);
        
        // Ensure recovery_status and restored_id are set (required fields)
        $recoveryStatus = $result['recovery_status'] ?? 'success';
        $restoredId = $result['restored_id'] ?? $backup['record_id'];
        
        $stmt = $conn->prepare("
            INSERT INTO recovery_history 
            (backup_id, record_type, original_record_id, restored_record_id, recovery_status, recovery_details, performed_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->bind_param("isiissi", 
            $backupId, 
            $recordType, 
            $backup['record_id'], 
            $restoredId,
            $recoveryStatus,
            $recoveryDetails,
            $userId
        );
        $stmt->execute();
        
        // Only delete backup if it's a full restore, not individual item restore
        // For individual item restores, keep the backup until all items are restored
        $isIndividualItemRestore = isset($data['conflict_resolution']) && $data['conflict_resolution'] === 'restore_item';
        
        if (!$isIndividualItemRestore || $recordType !== 'user') {
            // Full restore - delete backup
            $stmt = $conn->prepare("DELETE FROM deleted_records_backup WHERE id = ?");
            $stmt->bind_param("i", $backupId);
            $stmt->execute();
        } else {
            // Individual item restore - check if there are more items to restore
            // Get remaining related data from backup
            $stmt = $conn->prepare("SELECT related_data FROM deleted_records_backup WHERE id = ?");
            $stmt->bind_param("i", $backupId);
            $stmt->execute();
            $result_check = $stmt->get_result();
            $backup_check = $result_check->fetch_assoc();
            
            if ($backup_check) {
                $remainingRelated = json_decode($backup_check['related_data'], true);
                $targetUserId = $data['existing_user_id'] ?? null;
                $restoredLotId = isset($result['lot_id']) ? $result['lot_id'] : null;
                $restoredDeceasedId = isset($result['deceased_id']) ? $result['deceased_id'] : null;
                
                // Check if there are still lots or deceased that need restoration
                $hasRemainingItems = false;
                
                // Check lots
                if (isset($remainingRelated['lots'])) {
                    foreach ($remainingRelated['lots'] as $lot) {
                        if ($restoredLotId == $lot['id']) {
                            continue; // Skip the one we just restored
                        }
                        
                        // Check if lot still needs restoration (deleted or no customer ownership)
                        $stmt_check = $conn->prepare("SELECT deleted_at, customer_id FROM lots WHERE id = ?");
                        $stmt_check->bind_param("i", $lot['id']);
                        $stmt_check->execute();
                        $lot_result = $stmt_check->get_result();
                        $lot_data = $lot_result->fetch_assoc();
                        
                        // If lot doesn't exist, doesn't have customer, or is deleted - needs restoration
                        if (!$lot_data || $lot_data['customer_id'] != $targetUserId || $lot_data['deleted_at'] !== null) {
                            $hasRemainingItems = true;
                            break;
                        }
                    }
                }
                
                // Check deceased (only if no remaining lots)
                if (!$hasRemainingItems && isset($remainingRelated['deceased'])) {
                    foreach ($remainingRelated['deceased'] as $deceased) {
                        if ($restoredDeceasedId == $deceased['id']) {
                            continue; // Skip the one we just restored
                        }
                        
                        // Check if deceased still needs restoration (still deleted)
                        $stmt_check = $conn->prepare("SELECT deleted_at FROM deceased_records WHERE id = ?");
                        $stmt_check->bind_param("i", $deceased['id']);
                        $stmt_check->execute();
                        $deceased_result = $stmt_check->get_result();
                        $deceased_data = $deceased_result->fetch_assoc();
                        
                        // If deceased is still deleted - needs restoration
                        if ($deceased_data && $deceased_data['deleted_at'] !== null) {
                            $hasRemainingItems = true;
                            break;
                        }
                    }
                }
                
                // Only delete backup if no remaining items need restoration
                if (!$hasRemainingItems) {
                    $stmt = $conn->prepare("DELETE FROM deleted_records_backup WHERE id = ?");
                    $stmt->bind_param("i", $backupId);
                    $stmt->execute();
                }
            }
        }
        
        // Log activity
        $activityType = ucfirst($recordType);
        $activityDescription = "Restored {$activityType} record";
        if (isset($result['message'])) {
            $activityDescription = $result['message'];
        }
        
        // Insert activity log using PDO
        global $pdo;
        if ($pdo) {
            $activityStmt = $pdo->prepare("
                INSERT INTO activity_log (action, type, details, performed_by, ip_address, user_agent) 
                VALUES ('Restored', 'Recovery', ?, ?, ?, ?)
            ");
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'Unknown';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
            $activityStmt->execute([$activityDescription, $userId, $ipAddress, $userAgent]);
        }
        
        $conn->commit();
        echo json_encode($result);
    } else {
        $conn->rollback();
        http_response_code(400);
        echo json_encode($result);
    }
    
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}

function restoreUser($conn, $backup, $snapshot, $related, $performedBy, $requestData) {
    $user = $snapshot['user'];
    $customer = $snapshot['customer'];
    
    // Check for conflicts
    $conflicts = [];
    
    // Check username conflict - check if ANY user with same username exists (not deleted)
    // If the backup record_id matches the existing user, it's the same user, so no conflict
    $stmt = $conn->prepare("SELECT id, username, email, deleted_at FROM users WHERE username = ? AND deleted_at IS NULL");
    $stmt->bind_param("s", $user['username']);
    $stmt->execute();
    $result = $stmt->get_result();
    $existingUser = $result->fetch_assoc();
    
    if ($existingUser && $existingUser['id'] != $backup['record_id']) {
        $conflicts['username'] = $existingUser;
    }
    
    // Check email conflict - check if ANY user with same email exists (not deleted and not null)
    // If the backup record_id matches the existing user, it's the same user, so no conflict
    if (!empty($user['email'])) {
        $stmt = $conn->prepare("SELECT id, username, email, deleted_at FROM users WHERE email = ? AND deleted_at IS NULL AND email IS NOT NULL");
        $stmt->bind_param("s", $user['email']);
        $stmt->execute();
        $result = $stmt->get_result();
        $existingEmail = $result->fetch_assoc();
        
        if ($existingEmail && $existingEmail['id'] != $backup['record_id']) {
            // If username conflict already found and it's the same user, don't duplicate
            if (empty($conflicts['username']) || $conflicts['username']['id'] != $existingEmail['id']) {
                $conflicts['email'] = $existingEmail;
            }
        }
    }
    
    // If conflicts exist and no resolution provided
    if (!empty($conflicts) && !isset($requestData['conflict_resolution'])) {
        $targetUserId = $conflicts['username']['id'] ?? $conflicts['email']['id'];
        
        // Validate and get lots info with restore status
        // Only include lots that haven't been restored yet
        $lotsInfo = [];
        if (isset($related['lots'])) {
            foreach ($related['lots'] as $lot) {
                $lotId = $lot['id'];
                
                // Check if lot already exists and is restored to the target user
                $stmt = $conn->prepare("SELECT id, customer_id, deleted_at, block_id, lot_number FROM lots WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
                $result = $stmt->get_result();
                $currentLot = $result->fetch_assoc();
                
                // Skip if lot is already restored (exists, not deleted, and owned by target user)
                if ($currentLot && $currentLot['deleted_at'] === null && $currentLot['customer_id'] == $targetUserId) {
                    continue; // Already restored, don't show it
                }
                
                $canRestore = true;
                $reason = null;
                
                // Check if lot exists - if it's deleted, that's fine (we're restoring it)
                // Only prevent if lot exists (not deleted) and is already owned by someone else
                if (!$currentLot) {
                    // Lot doesn't exist at all (hard deleted) - can't restore
                    $canRestore = false;
                    $reason = 'Lot does not exist';
                } else if ($currentLot['deleted_at'] === null && $currentLot['customer_id'] !== null && $currentLot['customer_id'] != $targetUserId) {
                    // Lot exists (not deleted) and is already owned by someone else
                    $canRestore = false;
                    $reason = 'Lot already exists and is owned by someone else';
                }
                // If lot is soft deleted (deleted_at IS NOT NULL), that's fine - we can restore it!
                
                // Get lot location for display
                $lotLocation = 'Lot ID: ' . $lotId;
                if ($currentLot && $currentLot['block_id']) {
                    $stmt2 = $conn->prepare("
                        SELECT b.block_number, s.name as sector_name, g.name as garden_name
                        FROM blocks b
                        JOIN sectors s ON b.sector_id = s.id
                        JOIN gardens g ON s.garden_id = g.id
                        WHERE b.id = ?
                    ");
                    $stmt2->bind_param("i", $currentLot['block_id']);
                    $stmt2->execute();
                    $locResult = $stmt2->get_result();
                    if ($locData = $locResult->fetch_assoc()) {
                        $lotLocation = $locData['garden_name'] . ' / Sector ' . $locData['sector_name'] . ' / Block ' . $locData['block_number'] . ' / Lot ' . $currentLot['lot_number'];
                    }
                }
                
                $lotsInfo[] = [
                    'id' => $lotId,
                    'display_name' => $lot['display_name'] ?? $lotLocation,
                    'lot_location' => $lotLocation,
                    'can_restore' => $canRestore,
                    'reason' => $reason,
                    'lot_data' => $lot
                ];
            }
        }
        
        // Validate and get deceased info with restore status
        // Only include deceased records that haven't been restored yet
        $deceasedInfo = [];
        if (isset($related['deceased'])) {
            foreach ($related['deceased'] as $deceased) {
                $deceasedId = $deceased['id'];
                
                // Check if deceased is already restored (not deleted)
                $stmt_check = $conn->prepare("SELECT deleted_at FROM deceased_records WHERE id = ?");
                $stmt_check->bind_param("i", $deceasedId);
                $stmt_check->execute();
                $result_check = $stmt_check->get_result();
                $deceased_check = $result_check->fetch_assoc();
                
                // Skip if deceased is already restored (not deleted)
                if ($deceased_check && $deceased_check['deleted_at'] === null) {
                    continue; // Already restored, don't show it
                }
                
                $lotId = $deceased['lot_id'] ?? null;
                $canRestore = true;
                $reason = null;
                
                if (!$lotId) {
                    $canRestore = false;
                    $reason = 'Lot ID not found in deceased record';
                } else {
                // Check if lot exists and is not deleted
                $stmt = $conn->prepare("SELECT id, customer_id, vault_option, lower_body, upper_body, lower_bone, upper_bone, deleted_at, block_id, lot_number FROM lots WHERE id = ?");
                    $stmt->bind_param("i", $lotId);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    $lot = $result->fetch_assoc();
                    
                    if (!$lot) {
                        $canRestore = false;
                        $reason = 'Lot not found';
                    } else if ($lot['deleted_at'] !== null) {
                        $canRestore = false;
                        $reason = 'The lot located to the deceased person is deleted so it cant restore';
                    } else if ($lot['customer_id'] === null) {
                        // Lot exists but has no active ownership yet
                        $canRestore = false;
                        $reason = 'Cannot restore deceased record because the lot ownership is not restored yet. Please restore the lot ownership first.';
                    } else {
                        // Check if vault is full
                        $vaultOption = $lot['vault_option'];
                        $lb = (int)$lot['lower_body'];
                        $ub = (int)$lot['upper_body'];
                        $lbn = (int)$lot['lower_bone'];
                        $ubn = (int)$lot['upper_bone'];
                        
                        if ($vaultOption === 'option1') {
                            // Option 1: 2 bodies + 4 bones total
                            if ($lb === 1 && $ub === 1 && ($lbn + $ubn) >= 4) {
                                $canRestore = false;
                                $reason = 'Cannot restore since the vault is fully occupied now';
                            }
                        } else if ($vaultOption === 'option2') {
                            // Option 2: 1 body (lower) + 5 bones (upper)
                            if ($lb === 1 && $ubn >= 5) {
                                $canRestore = false;
                                $reason = 'Cannot restore since the vault is fully occupied now';
                            }
                        } else if ($vaultOption === 'option3') {
                            // Option 3: Bones only - 3 lower + 3 upper
                            if ($lbn >= 3 && $ubn >= 3) {
                                $canRestore = false;
                                $reason = 'Cannot restore since the vault is fully occupied now';
                            }
                        }
                    }
                    
                    // Get lot location for display
                    $lotLocation = 'Lot ID: ' . $lotId;
                    if ($lot && $lot['block_id']) {
                        $stmt2 = $conn->prepare("
                            SELECT b.block_number, s.name as sector_name, g.name as garden_name
                            FROM blocks b
                            JOIN sectors s ON b.sector_id = s.id
                            JOIN gardens g ON s.garden_id = g.id
                            WHERE b.id = ?
                        ");
                        $stmt2->bind_param("i", $lot['block_id']);
                        $stmt2->execute();
                        $locResult = $stmt2->get_result();
                        if ($locData = $locResult->fetch_assoc()) {
                            $lotLocation = $locData['garden_name'] . ' / Sector ' . $locData['sector_name'] . ' / Block ' . $locData['block_number'] . ' / Lot ' . $lot['lot_number'];
                        }
                    }
                }
                
                $deceasedInfo[] = [
                    'id' => $deceasedId,
                    'name' => $deceased['name'] ?? 'Unknown',
                    'lot_id' => $lotId,
                    'lot_location' => $lotLocation,
                    'can_restore' => $canRestore,
                    'reason' => $reason,
                    'deceased_data' => $deceased
                ];
            }
        }
        
        return [
            'success' => false,
            'requires_resolution' => true,
            'conflicts' => $conflicts,
            'existing_user_id' => $targetUserId,
            'old_data' => [
                'user' => $user,
                'customer' => $customer,
                'related' => $related,
                'lots' => $lotsInfo,
                'deceased' => $deceasedInfo
            ],
            'message' => "There is already an existing user created with the same username and email. Please review the lots and deceased records below. If there is any related data, you can restore it to that user."
        ];
    }
    
    // Handle conflict resolution - never create duplicate user, only restore related records
    if (!empty($conflicts) && isset($requestData['conflict_resolution'])) {
        $targetUserId = $conflicts['username']['id'] ?? $conflicts['email']['id'];
        
        // Handle individual item restoration
        if ($requestData['conflict_resolution'] === 'restore_item') {
            $itemType = $requestData['item_type'] ?? '';
            $itemId = intval($requestData['item_id'] ?? 0);
            
            if ($itemType === 'lot' && $itemId > 0) {
                return restoreIndividualLot($conn, $itemId, $targetUserId, $related, $performedBy);
            } else if ($itemType === 'deceased' && $itemId > 0) {
                return restoreIndividualDeceased($conn, $itemId, $targetUserId, $related, $performedBy);
            }
            
            return [
                'success' => false,
                'message' => 'Invalid item type or ID'
            ];
        }
        
        if ($requestData['conflict_resolution'] === 'migrate' || $requestData['conflict_resolution'] === 'skip') {
            // Only restore related records to existing user, don't restore the user itself
            return restoreRelatedToExistingUser($conn, $targetUserId, $related, $performedBy, $requestData);
        }
        
        // If resolution is 'cancel' or anything else, return failure
        return [
            'success' => false,
            'message' => 'Restoration cancelled.'
        ];
    }
    
    // No conflicts, restore user normally
    // Double-check: ensure no duplicate exists before restoring
    $stmt = $conn->prepare("SELECT id, deleted_at FROM users WHERE id = ?");
    $stmt->bind_param("i", $backup['record_id']);
    $stmt->execute();
    $result = $stmt->get_result();
    $userToRestore = $result->fetch_assoc();
    
    if (!$userToRestore) {
        return [
            'success' => false,
            'message' => 'User record not found'
        ];
    }
    
    // Final check: if user is not deleted, it might already be active
    if ($userToRestore['deleted_at'] === null) {
        return [
            'success' => false,
            'message' => 'User is already active and not deleted'
        ];
    }
    
    // Additional safety check: verify no active user with same username/email exists
    $stmt = $conn->prepare("SELECT id FROM users WHERE (username = ? OR (email = ? AND email IS NOT NULL)) AND deleted_at IS NULL AND id != ?");
    $emailCheck = $user['email'] ?? '';
    $stmt->bind_param("ssi", $user['username'], $emailCheck, $backup['record_id']);
    $stmt->execute();
    $result = $stmt->get_result();
    $duplicate = $result->fetch_assoc();
    
    if ($duplicate) {
        return [
            'success' => false,
            'requires_resolution' => true,
            'conflicts' => ['duplicate_detected' => true],
            'message' => 'An active user with the same username or email already exists. Cannot restore to avoid duplicates.'
        ];
    }
    
    // Now safe to restore
    $stmt = $conn->prepare("
        UPDATE users SET 
            deleted_at = NULL,
            deleted_by = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $stmt->bind_param("i", $backup['record_id']);
    $stmt->execute();
    
    // Restore customer if exists
    if ($customer) {
        $stmt = $conn->prepare("
            UPDATE customers SET 
                deleted_at = NULL,
                deleted_by = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        ");
        $stmt->bind_param("i", $backup['record_id']);
        $stmt->execute();
    }
    
    // Restore related records
    $restored = restoreUserRelatedRecords($conn, $backup['record_id'], $related, $performedBy, $requestData);
    
    return [
        'success' => true,
        'recovery_status' => 'success',
        'restored_id' => $backup['record_id'],
        'message' => 'User and related records restored successfully',
        'details' => $restored
    ];
}

function migrateToExistingUser($conn, $conflicts, $related, $performedBy, $requestData) {
    $targetUserId = $conflicts['username']['id'] ?? $conflicts['email']['id'];
    
    if (!isset($requestData['migrate_items'])) {
        return [
            'success' => false,
            'message' => 'No items selected for migration'
        ];
    }
    
    $migrateItems = $requestData['migrate_items'];
    $restored = [];
    
    // Restore selected lots
    if (isset($migrateItems['lots']) && is_array($migrateItems['lots'])) {
        foreach ($migrateItems['lots'] as $lotId) {
            // Check if lot is still available
            $stmt = $conn->prepare("SELECT * FROM lots WHERE id = ? AND deleted_at IS NOT NULL");
            $stmt->bind_param("i", $lotId);
            $stmt->execute();
            $result = $stmt->get_result();
            $lot = $result->fetch_assoc();
            
            if ($lot) {
                // Restore lot to the existing user
                $stmt = $conn->prepare("
                    UPDATE lots SET 
                        customer_id = ?,
                        status = ?,
                        deleted_at = NULL,
                        deleted_by = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $status = $lot['status'] === 'available' ? 'occupied' : $lot['status'];
                $stmt->bind_param("isi", $targetUserId, $status, $lotId);
                $stmt->execute();
                
                $restored['lots'][] = $lotId;
                
                // Restore payments for this lot
                foreach ($related['payment_records'] as $payment) {
                    if ($payment['lot_id'] == $lotId) {
                        $stmt = $conn->prepare("
                            UPDATE payment_records SET 
                                deleted_at = NULL,
                                deleted_by = NULL,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        ");
                        $stmt->bind_param("i", $payment['id']);
                        $stmt->execute();
                        $restored['payments'][] = $payment['id'];
                    }
                }
                
                // Restore payment plans for this lot
                foreach ($related['payment_plans'] as $plan) {
                    if ($plan['lot_id'] == $lotId) {
                        $stmt = $conn->prepare("
                            UPDATE payment_plans SET 
                                customer_id = ?,
                                deleted_at = NULL,
                                deleted_by = NULL,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        ");
                        $stmt->bind_param("ii", $targetUserId, $plan['id']);
                        $stmt->execute();
                        $restored['payment_plans'][] = $plan['id'];
                    }
                }
            }
        }
    }
    
    // Restore selected deceased records
    if (isset($migrateItems['deceased']) && is_array($migrateItems['deceased'])) {
        foreach ($migrateItems['deceased'] as $deceasedId) {
            $stmt = $conn->prepare("
                UPDATE deceased_records SET 
                    customer_id = ?,
                    deleted_at = NULL,
                    deleted_by = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $stmt->bind_param("ii", $targetUserId, $deceasedId);
            $stmt->execute();
            $restored['deceased'][] = $deceasedId;
        }
    }
    
    return [
        'success' => true,
        'recovery_status' => 'migrated',
        'restored_id' => $targetUserId,
        'message' => 'Records migrated to existing user successfully',
        'details' => $restored
    ];
}

function restoreRelatedToExistingUser($conn, $targetUserId, $related, $performedBy, $requestData) {
    $restored = restoreUserRelatedRecords($conn, $targetUserId, $related, $performedBy, $requestData);
    
    return [
        'success' => true,
        'recovery_status' => 'migrated',
        'restored_id' => $targetUserId,
        'message' => 'Related records restored to existing user',
        'details' => $restored
    ];
}

function restoreUserRelatedRecords($conn, $userId, $related, $performedBy, $requestData) {
    $restored = [
        'lots' => [],
        'deceased' => [],
        'payments' => [],
        'payment_plans' => [],
        'lot_conflicts' => []
    ];
    
    // Restore lots
    if (isset($related['lots'])) {
        foreach ($related['lots'] as $lot) {
            $lotId = $lot['id'];
            
            // Check if lot is still available
            $stmt = $conn->prepare("SELECT status, customer_id FROM lots WHERE id = ? AND deleted_at IS NULL");
            $stmt->bind_param("i", $lotId);
            $stmt->execute();
            $result = $stmt->get_result();
            $currentLot = $result->fetch_assoc();
            
            if ($currentLot && $currentLot['customer_id'] !== null) {
                // Lot is now occupied by someone else
                // Check if it's the same customer (from previous ownership)
                if ($currentLot['customer_id'] == $userId) {
                    // Same user owns it now - allow restoration (maybe they restored the user separately)
                    // But we still need to restore ownership and related records
                } else {
                    // Different user owns it - cannot restore
                    $restored['lot_conflicts'][] = [
                        'original_lot_id' => $lotId,
                        'message' => 'Cannot recover because it\'s already own by someone',
                        'needs_alternative' => false,
                        'original_lot_data' => $lot
                    ];
                    continue; // Skip this lot
                }
                
                // If alternative lot provided
                if (isset($requestData['alternative_lots'][$lotId])) {
                    $newLotId = $requestData['alternative_lots'][$lotId];
                    
                    // Verify new lot is available and same type
                    $stmt = $conn->prepare("SELECT * FROM lots WHERE id = ? AND status = 'available' AND deleted_at IS NULL");
                    $stmt->bind_param("i", $newLotId);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    $newLot = $result->fetch_assoc();
                    
                    if ($newLot) {
                        // Assign new lot to user
                        $stmt = $conn->prepare("
                            UPDATE lots SET 
                                customer_id = ?,
                                status = 'occupied',
                                purchase_date = ?,
                                vault_option = ?,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        ");
                        $stmt->bind_param("issi", 
                            $userId, 
                            $lot['purchase_date'], 
                            $lot['vault_option'],
                            $newLotId
                        );
                        $stmt->execute();
                        
                        $restored['lots'][] = ['old' => $lotId, 'new' => $newLotId];
                        
                        // Update payment records to new lot
                        foreach ($related['payment_records'] as $payment) {
                            if ($payment['lot_id'] == $lotId) {
                                $stmt = $conn->prepare("
                                    UPDATE payment_records SET 
                                        lot_id = ?,
                                        deleted_at = NULL,
                                        deleted_by = NULL,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                ");
                                $stmt->bind_param("ii", $newLotId, $payment['id']);
                                $stmt->execute();
                                $restored['payments'][] = $payment['id'];
                            }
                        }
                        
                        // Update payment plans to new lot
                        foreach ($related['payment_plans'] as $plan) {
                            if ($plan['lot_id'] == $lotId) {
                                $stmt = $conn->prepare("
                                    UPDATE payment_plans SET 
                                        lot_id = ?,
                                        customer_id = ?,
                                        deleted_at = NULL,
                                        deleted_by = NULL,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                ");
                                $stmt->bind_param("iii", $newLotId, $userId, $plan['id']);
                                $stmt->execute();
                                $restored['payment_plans'][] = $plan['id'];
                            }
                        }
                        
                        // Update deceased records to new lot
                        foreach ($related['deceased'] as $deceased) {
                            if ($deceased['lot_id'] == $lotId) {
                                $stmt = $conn->prepare("
                                    UPDATE deceased_records SET 
                                        lot_id = ?,
                                        customer_id = ?,
                                        deleted_at = NULL,
                                        deleted_by = NULL,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                ");
                                $stmt->bind_param("iii", $newLotId, $userId, $deceased['id']);
                                $stmt->execute();
                                $restored['deceased'][] = $deceased['id'];
                            }
                        }
                    }
                }
            } else {
                // Lot is available, restore it
                $stmt = $conn->prepare("
                    UPDATE lots SET 
                        customer_id = ?,
                        status = ?,
                        purchase_date = ?,
                        vault_option = ?,
                        deleted_at = NULL,
                        deleted_by = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $status = $lot['status'];
                $stmt->bind_param("isssi", $userId, $status, $lot['purchase_date'], $lot['vault_option'], $lotId);
                $stmt->execute();
                
                $restored['lots'][] = $lotId;
                
                // Restore payments
                foreach ($related['payment_records'] as $payment) {
                    if ($payment['lot_id'] == $lotId) {
                        $stmt = $conn->prepare("
                            UPDATE payment_records SET 
                                deleted_at = NULL,
                                deleted_by = NULL,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        ");
                        $stmt->bind_param("i", $payment['id']);
                        $stmt->execute();
                        $restored['payments'][] = $payment['id'];
                    }
                }
                
                // Restore payment plans
                foreach ($related['payment_plans'] as $plan) {
                    if ($plan['lot_id'] == $lotId) {
                        $stmt = $conn->prepare("
                            UPDATE payment_plans SET 
                                deleted_at = NULL,
                                deleted_by = NULL,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        ");
                        $stmt->bind_param("i", $plan['id']);
                        $stmt->execute();
                        $restored['payment_plans'][] = $plan['id'];
                    }
                }
                
                // Restore deceased
                foreach ($related['deceased'] as $deceased) {
                    if ($deceased['lot_id'] == $lotId) {
                        $stmt = $conn->prepare("
                            UPDATE deceased_records SET 
                                deleted_at = NULL,
                                deleted_by = NULL,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        ");
                        $stmt->bind_param("i", $deceased['id']);
                        $stmt->execute();
                        $restored['deceased'][] = $deceased['id'];
                    }
                }
            }
        }
    }
    
    return $restored;
}

/**
 * Helper to resolve the active customer account when restoring ownership.
 * Priority: original customer_id → username → email (gmail, etc.).
 */
function findActiveCustomerForSnapshot(mysqli $conn, array $snapshot) {
    $originalCustomerId = $snapshot['customer_id'] ?? null;
    $snapshotUsername   = $snapshot['username'] ?? null;
    $snapshotEmail      = $snapshot['email'] ?? null;
    
    // 1) Try original customer_id
    if ($originalCustomerId) {
        $stmt = $conn->prepare("SELECT id, deleted_at FROM users WHERE id = ?");
        $stmt->bind_param("i", $originalCustomerId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            if ($row['deleted_at'] === null) {
                return [$row['id'], 'id'];
            }
        }
    }
    
    // 2) Try username (first priority for merged/renamed accounts)
    if ($snapshotUsername) {
        $stmt = $conn->prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL");
        $stmt->bind_param("s", $snapshotUsername);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            return [$row['id'], 'username'];
        }
    }
    
    // 3) Try email (e.g., gmail) if present in snapshot
    if ($snapshotEmail) {
        $stmt = $conn->prepare("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL");
        $stmt->bind_param("s", $snapshotEmail);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            return [$row['id'], 'email'];
        }
    }
    
    return [null, null];
}

function restoreLot($conn, $backup, $snapshot, $related, $performedBy, $requestData) {
    $lotId = $backup['record_id'];
    
    // Resolve active customer account (handles merged accounts via username/email)
    list($targetUserId, $matchSource) = findActiveCustomerForSnapshot($conn, $snapshot);
    
    if (!$targetUserId) {
        return [
            'success' => false,
            'message' => 'Cannot restore lot ownership: Linked customer account could not be found by ID, username, or email. Please restore or recreate the customer first.'
        ];
    }
    
    // Check if lot is still available
    $stmt = $conn->prepare("SELECT status, customer_id FROM lots WHERE id = ? AND deleted_at IS NULL");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $result = $stmt->get_result();
    $currentLot = $result->fetch_assoc();
    
    if ($currentLot && $currentLot['customer_id'] !== null) {
        // Lot is occupied, need alternative
        if (!isset($requestData['alternative_lot_id'])) {
            return [
                'success' => false,
                'requires_alternative' => true,
                'original_lot' => $snapshot,
                'message' => 'Original lot is no longer available. Please select an alternative lot.'
            ];
        }
        
        $newLotId = intval($requestData['alternative_lot_id']);
        
        // Verify new lot availability
        $stmt = $conn->prepare("SELECT * FROM lots WHERE id = ? AND status = 'available' AND deleted_at IS NULL");
        $stmt->bind_param("i", $newLotId);
        $stmt->execute();
        $result = $stmt->get_result();
        $newLot = $result->fetch_assoc();
        
        if (!$newLot) {
            return [
                'success' => false,
                'message' => 'Selected alternative lot is not available'
            ];
        }
        
        // Restore to new lot
        $stmt = $conn->prepare("
            UPDATE lots SET 
                customer_id = ?,
                status = ?,
                purchase_date = ?,
                vault_option = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ");
        $status = 'occupied';
        $stmt->bind_param("isssi", 
            $targetUserId, 
            $status,
            $snapshot['purchase_date'],
            $snapshot['vault_option'],
            $newLotId
        );
        $stmt->execute();
        
        // Restore related records to new lot
        foreach ($related['deceased'] as $deceased) {
            $stmt = $conn->prepare("
                UPDATE deceased_records SET 
                    lot_id = ?,
                    deleted_at = NULL,
                    deleted_by = NULL
                WHERE id = ?
            ");
            $stmt->bind_param("ii", $newLotId, $deceased['id']);
            $stmt->execute();
        }
        
        foreach ($related['payment_records'] as $payment) {
            $stmt = $conn->prepare("
                UPDATE payment_records SET 
                    lot_id = ?,
                    deleted_at = NULL,
                    deleted_by = NULL
                WHERE id = ?
            ");
            $stmt->bind_param("ii", $newLotId, $payment['id']);
            $stmt->execute();
        }
        
        foreach ($related['payment_plans'] as $plan) {
            $stmt = $conn->prepare("
                UPDATE payment_plans SET 
                    lot_id = ?,
                    deleted_at = NULL,
                    deleted_by = NULL
                WHERE id = ?
            ");
            $stmt->bind_param("ii", $newLotId, $plan['id']);
            $stmt->execute();
        }
        
        return [
            'success' => true,
            'recovery_status' => 'partial',
            'restored_id' => $newLotId,
            'message' => 'Lot ownership restored to alternative location',
            'original_lot_id' => $lotId,
            'new_lot_id' => $newLotId
        ];
    }
    
    // Original lot available, restore normally
    $stmt = $conn->prepare("
        UPDATE lots SET 
            deleted_at = NULL,
            deleted_by = NULL,
            customer_id = ?,
            status = ?,
            purchase_date = ?,
            vault_option = ?
        WHERE id = ?
    ");
    $stmt->bind_param("isssi", $targetUserId, $snapshot['status'], $snapshot['purchase_date'], $snapshot['vault_option'], $lotId);
    $stmt->execute();
    
    // Restore related records
    foreach ($related['deceased'] as $deceased) {
        $stmt = $conn->prepare("UPDATE deceased_records SET deleted_at = NULL, deleted_by = NULL WHERE id = ?");
        $stmt->bind_param("i", $deceased['id']);
        $stmt->execute();
    }
    
    foreach ($related['payment_records'] as $payment) {
        $stmt = $conn->prepare("UPDATE payment_records SET deleted_at = NULL, deleted_by = NULL WHERE id = ?");
        $stmt->bind_param("i", $payment['id']);
        $stmt->execute();
    }
    
    foreach ($related['payment_plans'] as $plan) {
        $stmt = $conn->prepare("UPDATE payment_plans SET deleted_at = NULL, deleted_by = NULL WHERE id = ?");
        $stmt->bind_param("i", $plan['id']);
        $stmt->execute();
    }
    
    return [
        'success' => true,
        'recovery_status' => 'success',
        'restored_id' => $lotId,
        'message' => 'Lot ownership and all related records restored successfully'
    ];
}

function restoreDeceased($conn, $backup, $snapshot, $performedBy) {
    $deceasedId = $backup['record_id'];
    $lotId = $snapshot['lot_id'];
    
    // Check if lot still exists, is not deleted, has active ownership, and get current vault state.
    // IMPORTANT: we now rely on the CURRENT lot owner (customer_id) instead of the snapshot customer,
    // so migrated/merged accounts (same email) will still work.
    $stmt = $conn->prepare("SELECT id, customer_id, vault_option, lower_body, upper_body, lower_bone, upper_bone, deleted_at FROM lots WHERE id = ?");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $result = $stmt->get_result();
    $lot = $result->fetch_assoc();
    
    if (!$lot) {
        return [
            'success' => false,
            'message' => 'Cannot restore deceased record: The linked lot does not exist.'
        ];
    }
    
    // Check if lot is deleted
    if ($lot['deleted_at'] !== null) {
        return [
            'success' => false,
            'message' => 'The lot located to the deceased person is deleted so it cant restore.'
        ];
    }
    
    // Require that lot ownership is already restored/active (customer_id set)
    if ($lot['customer_id'] === null) {
        return [
            'success' => false,
            'message' => 'Cannot restore deceased record: The lot ownership is not restored yet. Please restore the lot ownership first.'
        ];
    }
    
    // Get current vault state
    $targetCustomerId   = (int)$lot['customer_id'];
    $currentVaultOption = $lot['vault_option'];
    $lb = (int)$lot['lower_body'];
    $ub = (int)$lot['upper_body'];
    $lbn = (int)$lot['lower_bone'];
    $ubn = (int)$lot['upper_bone'];
    
    // Determine the vault option to use
    // If lot has NO vault option, we need one. Check how many deceased records exist for this lot
    if (!$currentVaultOption) {
        // No vault option set - this will be the first deceased, so we can set any option
        // Since we don't have the original vault option from the snapshot, we'll need to pick one
        // Default to option1 if not specified
        $currentVaultOption = 'option1';
        $needsVaultOptionSet = true;
    } else {
        $needsVaultOptionSet = false;
    }
    
    // Auto-determine interment type and tier based on vault option and current occupancy
    $interment_type = null;
    $assignedTier = null;
    
    if ($currentVaultOption === 'option1') {
        // Option 1: 2 bodies + 4 bones total
        if ($lb === 0) {
            $interment_type = 'body';
            $assignedTier = 'lower';
        } else if ($ub === 0) {
            $interment_type = 'body';
            $assignedTier = 'upper';
        } else {
            // Both bodies occupied, try bones
            $totalBones = $lbn + $ubn;
            if ($totalBones >= 4) {
                return [
                    'success' => false,
                    'message' => 'Cannot restore since the vault is fully occupied now.'
                ];
            }
            $interment_type = 'bone';
            $assignedTier = ($lbn < 4) ? 'lower' : 'upper';
        }
    } else if ($currentVaultOption === 'option2') {
        // Option 2: 1 body (lower) + 5 bones (upper)
        if ($lb === 0) {
            $interment_type = 'body';
            $assignedTier = 'lower';
        } else {
            // Body occupied, try bones in upper
            if ($ubn >= 5) {
                return [
                    'success' => false,
                    'message' => 'Cannot restore since the vault is fully occupied now.'
                ];
            }
            $interment_type = 'bone';
            $assignedTier = 'upper';
        }
    } else if ($currentVaultOption === 'option3') {
        // Option 3: Bones only - 3 lower + 3 upper
        if ($lbn < 3) {
            $interment_type = 'bone';
            $assignedTier = 'lower';
        } else if ($ubn < 3) {
            $interment_type = 'bone';
            $assignedTier = 'upper';
        } else {
            return [
                'success' => false,
                'message' => 'Cannot restore since the vault is fully occupied now.'
            ];
        }
    }
    
    // Restore deceased record and re-link to the CURRENT lot owner
    $stmt = $conn->prepare("
        UPDATE deceased_records SET 
            customer_id = ?,
            deleted_at = NULL,
            deleted_by = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $stmt->bind_param("ii", $targetCustomerId, $deceasedId);
    if (!$stmt->execute()) {
        return [
            'success' => false,
            'message' => 'Failed to restore deceased record'
        ];
    }
    
    // Update vault counters
    try {
        // Set vault option if needed
        if ($needsVaultOptionSet) {
            $stmt = $conn->prepare("UPDATE lots SET vault_option = ? WHERE id = ?");
            $stmt->bind_param("si", $currentVaultOption, $lotId);
            $stmt->execute();
        }
        
        // Update the appropriate counter
        if ($interment_type === 'body') {
            if ($assignedTier === 'lower') {
                $stmt = $conn->prepare("UPDATE lots SET lower_body = 1 WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            } else {
                $stmt = $conn->prepare("UPDATE lots SET upper_body = 1 WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            }
        } else if ($interment_type === 'bone') {
            if ($assignedTier === 'lower') {
                $stmt = $conn->prepare("UPDATE lots SET lower_bone = LEAST(lower_bone + 1, 99) WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            } else {
                $stmt = $conn->prepare("UPDATE lots SET upper_bone = LEAST(upper_bone + 1, 99) WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            }
        }
        
        // Mark lot as occupied
        $stmt = $conn->prepare("UPDATE lots SET status = 'occupied' WHERE id = ?");
        $stmt->bind_param("i", $lotId);
        $stmt->execute();
        
    } catch (Exception $e) {
        return [
            'success' => false,
            'message' => 'Failed to update vault counters: ' . $e->getMessage()
        ];
    }
    
    return [
        'success' => true,
        'recovery_status' => 'success',
        'restored_id' => $deceasedId,
        'message' => 'Deceased record restored successfully with vault counters updated',
        'vault_info' => [
            'option' => $currentVaultOption,
            'interment_type' => $interment_type,
            'tier' => $assignedTier
        ],
        'customer_id' => $targetCustomerId,
        'lot_id' => $lotId
    ];
}

function restoreIndividualLot($conn, $lotId, $targetUserId, $related, $performedBy) {
    // Find the lot in related data
    $lotToRestore = null;
    if (isset($related['lots'])) {
        foreach ($related['lots'] as $lot) {
            if ($lot['id'] == $lotId) {
                $lotToRestore = $lot;
                break;
            }
        }
    }
    
    if (!$lotToRestore) {
        return [
            'success' => false,
            'message' => 'Lot not found in related data'
        ];
    }
    
    // Check if lot exists - if it's deleted, that's fine (we're restoring it)
    // Only prevent if lot exists (not deleted) and is already owned by someone else
    $stmt = $conn->prepare("SELECT status, customer_id, deleted_at FROM lots WHERE id = ?");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $result = $stmt->get_result();
    $currentLot = $result->fetch_assoc();
    
    if (!$currentLot) {
        // Lot doesn't exist at all (hard deleted) - can't restore
        return [
            'success' => false,
            'message' => 'Lot does not exist'
        ];
    }
    
    // Only prevent restore if lot exists (not deleted) and is already owned by someone else
    if ($currentLot['deleted_at'] === null && $currentLot['customer_id'] !== null && $currentLot['customer_id'] != $targetUserId) {
        return [
            'success' => false,
            'message' => 'Lot already exists and is owned by someone else'
        ];
    }
    
    // If lot is soft deleted (deleted_at IS NOT NULL), that's fine - we can restore it!
    
      // Restore lot ownership
      // If lot was deleted, also restore it (clear deleted_at)
      $stmt = $conn->prepare("
          UPDATE lots SET 
              customer_id = ?,
              status = ?,
              purchase_date = ?,
              vault_option = ?,
              deleted_at = NULL,
              deleted_by = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
      ");
    $status = $lotToRestore['status'] ?? 'occupied';
    $purchaseDate = $lotToRestore['purchase_date'] ?? null;
    $vaultOption = $lotToRestore['vault_option'] ?? null;
    
    $stmt->bind_param("isssi", 
        $targetUserId, 
        $status,
        $purchaseDate,
        $vaultOption,
        $lotId
    );
    $stmt->execute();
    
    // Restore related payment records
    $restoredPayments = [];
    if (isset($related['payment_records'])) {
        foreach ($related['payment_records'] as $payment) {
            if ($payment['lot_id'] == $lotId) {
                $stmt = $conn->prepare("
                    UPDATE payment_records SET 
                        deleted_at = NULL,
                        deleted_by = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $stmt->bind_param("i", $payment['id']);
                $stmt->execute();
                $restoredPayments[] = $payment['id'];
            }
        }
    }
    
    // Restore related payment plans
    $restoredPlans = [];
    if (isset($related['payment_plans'])) {
        foreach ($related['payment_plans'] as $plan) {
            if ($plan['lot_id'] == $lotId) {
                $stmt = $conn->prepare("
                    UPDATE payment_plans SET 
                        customer_id = ?,
                        deleted_at = NULL,
                        deleted_by = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $stmt->bind_param("ii", $targetUserId, $plan['id']);
                $stmt->execute();
                $restoredPlans[] = $plan['id'];
            }
        }
    }
    
    return [
        'success' => true,
        'recovery_status' => 'partial',
        'restored_id' => $lotId,
        'message' => 'Lot ownership restored successfully',
        'lot_id' => $lotId,
        'restored_payments' => $restoredPayments,
        'restored_plans' => $restoredPlans
    ];
}

function restoreIndividualDeceased($conn, $deceasedId, $targetUserId, $related, $performedBy) {
    // Find the deceased in related data
    $deceasedToRestore = null;
    if (isset($related['deceased'])) {
        foreach ($related['deceased'] as $deceased) {
            if ($deceased['id'] == $deceasedId) {
                $deceasedToRestore = $deceased;
                break;
            }
        }
    }
    
    if (!$deceasedToRestore) {
        return [
            'success' => false,
            'message' => 'Deceased record not found in related data'
        ];
    }
    
    $lotId = $deceasedToRestore['lot_id'] ?? null;
    if (!$lotId) {
        return [
            'success' => false,
            'message' => 'Lot ID not found in deceased record'
        ];
    }
    
    // Check if lot exists and is not deleted, and ownership is active
    $stmt = $conn->prepare("SELECT id, customer_id, vault_option, lower_body, upper_body, lower_bone, upper_bone, deleted_at FROM lots WHERE id = ?");
    $stmt->bind_param("i", $lotId);
    $stmt->execute();
    $result = $stmt->get_result();
    $lot = $result->fetch_assoc();
    
    if (!$lot) {
        return [
            'success' => false,
            'message' => 'Lot not found'
        ];
    }
    
    if ($lot['deleted_at'] !== null) {
        return [
            'success' => false,
            'message' => 'The lot located to the deceased person is deleted so it cant restore.'
        ];
    }
    
    // Require that lot ownership is already restored/active (customer_id set)
    if ($lot['customer_id'] === null) {
        return [
            'success' => false,
            'message' => 'Cannot restore deceased record: The lot ownership is not restored yet. Please restore the lot ownership first.'
        ];
    }
    
    // Check if vault is full
    $currentVaultOption = $lot['vault_option'];
    $lb = (int)$lot['lower_body'];
    $ub = (int)$lot['upper_body'];
    $lbn = (int)$lot['lower_bone'];
    $ubn = (int)$lot['upper_bone'];
    
    // Auto-determine interment type and tier
    $interment_type = null;
    $assignedTier = null;
    
    if (!$currentVaultOption) {
        $currentVaultOption = 'option1';
        $needsVaultOptionSet = true;
    } else {
        $needsVaultOptionSet = false;
    }
    
    if ($currentVaultOption === 'option1') {
        if ($lb === 0) {
            $interment_type = 'body';
            $assignedTier = 'lower';
        } else if ($ub === 0) {
            $interment_type = 'body';
            $assignedTier = 'upper';
        } else {
            $totalBones = $lbn + $ubn;
            if ($totalBones >= 4) {
                return [
                    'success' => false,
                    'message' => 'Cannot restore since the vault is fully occupied now.'
                ];
            }
            $interment_type = 'bone';
            $assignedTier = ($lbn < 4) ? 'lower' : 'upper';
        }
    } else if ($currentVaultOption === 'option2') {
        if ($lb === 0) {
            $interment_type = 'body';
            $assignedTier = 'lower';
        } else {
            if ($ubn >= 5) {
                return [
                    'success' => false,
                    'message' => 'Cannot restore since the vault is fully occupied now.'
                ];
            }
            $interment_type = 'bone';
            $assignedTier = 'upper';
        }
    } else if ($currentVaultOption === 'option3') {
        if ($lbn < 3) {
            $interment_type = 'bone';
            $assignedTier = 'lower';
        } else if ($ubn < 3) {
            $interment_type = 'bone';
            $assignedTier = 'upper';
        } else {
            return [
                'success' => false,
                'message' => 'Cannot restore since the vault is fully occupied now.'
            ];
        }
    }
    
    // Restore deceased record
    $stmt = $conn->prepare("
        UPDATE deceased_records SET 
            customer_id = ?,
            deleted_at = NULL,
            deleted_by = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $stmt->bind_param("ii", $targetUserId, $deceasedId);
    if (!$stmt->execute()) {
        return [
            'success' => false,
            'message' => 'Failed to restore deceased record'
        ];
    }
    
    // Update vault counters
    try {
        if ($needsVaultOptionSet) {
            $stmt = $conn->prepare("UPDATE lots SET vault_option = ? WHERE id = ?");
            $stmt->bind_param("si", $currentVaultOption, $lotId);
            $stmt->execute();
        }
        
        if ($interment_type === 'body') {
            if ($assignedTier === 'lower') {
                $stmt = $conn->prepare("UPDATE lots SET lower_body = 1 WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            } else {
                $stmt = $conn->prepare("UPDATE lots SET upper_body = 1 WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            }
        } else if ($interment_type === 'bone') {
            if ($assignedTier === 'lower') {
                $stmt = $conn->prepare("UPDATE lots SET lower_bone = LEAST(lower_bone + 1, 99) WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            } else {
                $stmt = $conn->prepare("UPDATE lots SET upper_bone = LEAST(upper_bone + 1, 99) WHERE id = ?");
                $stmt->bind_param("i", $lotId);
                $stmt->execute();
            }
        }
        
        $stmt = $conn->prepare("UPDATE lots SET status = 'occupied' WHERE id = ?");
        $stmt->bind_param("i", $lotId);
        $stmt->execute();
        
    } catch (Exception $e) {
        return [
            'success' => false,
            'message' => 'Failed to update vault counters: ' . $e->getMessage()
        ];
    }
    
    return [
        'success' => true,
        'recovery_status' => 'partial',
        'restored_id' => $deceasedId,
        'message' => 'Deceased record restored successfully',
        'deceased_id' => $deceasedId,
        'lot_id' => $lotId
    ];
}

function restorePayment($conn, $backup, $snapshot, $performedBy) {
    $paymentId = $backup['record_id'];
    
    // Check if lot still exists
    $stmt = $conn->prepare("SELECT id FROM lots WHERE id = ?");
    $stmt->bind_param("i", $snapshot['lot_id']);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if (!$result->fetch_assoc()) {
        return [
            'success' => false,
            'message' => 'Associated lot no longer exists. Cannot restore payment record.'
        ];
    }
    
    // Restore payment record
    $stmt = $conn->prepare("
        UPDATE payment_records SET 
            deleted_at = NULL,
            deleted_by = NULL
        WHERE id = ?
    ");
    $stmt->bind_param("i", $paymentId);
    $stmt->execute();
    
    return [
        'success' => true,
        'recovery_status' => 'success',
        'restored_id' => $paymentId,
        'message' => 'Payment record restored successfully'
    ];
}
?>

