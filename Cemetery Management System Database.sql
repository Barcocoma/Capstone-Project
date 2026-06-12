-- Cemetery Management System Database
-- Created for IT24 Capstone Project

-- Create database
DROP DATABASE IF EXISTS cemetery_management;
CREATE DATABASE cemetery_management;
USE cemetery_management;

-- Mapping core tables (aligned with mapping schema; created if missing)
CREATE TABLE IF NOT EXISTS gardens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    area DECIMAL(10,2) NULL,
    description TEXT NULL
);

CREATE TABLE IF NOT EXISTS sectors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garden_id INT NOT NULL,
    name CHAR(1) NOT NULL,
    FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sector_id INT NOT NULL,
    block_number INT NOT NULL,
    description TEXT NULL,
    FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
);

-- Dynamic lots table for mapping (do not duplicate static type; derive in code)
-- lots_map removed; use ownership_records and mapping code to compute availability

-- Users table (for authentication)
-- NOTE: username and email uniqueness is enforced at application level to allow reuse after soft delete
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NULL,
    account_type ENUM('admin', 'staff', 'cashier', 'customer') DEFAULT 'customer',
    default_password VARCHAR(100) NULL,
    using_default TINYINT(1) NOT NULL DEFAULT 1,
    first_name VARCHAR(50) NULL,
    middle_name VARCHAR(50) NULL,
    last_name VARCHAR(50) NULL,
    contact_number VARCHAR(30) NULL,
    sex_at_birth ENUM('male','female') NULL,
    nationality VARCHAR(50) NULL,
    civil_status ENUM('single', 'married', 'widowed', 'divorced') NULL,
    deleted_at TIMESTAMP NULL,
    deleted_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_deleted_at (deleted_at),
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Customers table (detailed customer information - general info moved to users)
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    
    -- Address Information
    street_address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Philippines',
    
    -- Emergency Contact
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    
    -- Additional Information
    occupation VARCHAR(100),
    employer VARCHAR(100),
    monthly_income DECIMAL(10,2),
    source_of_funds ENUM('salary', 'business', 'investment', 'inheritance', 'other'),
    notes TEXT,
    
    -- Account Information
    registration_date DATE DEFAULT (CURDATE()),
    last_payment_date DATE,
    
    deleted_at TIMESTAMP NULL,
    deleted_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Lots table (cemetery lots)
CREATE TABLE lots (
    id INT PRIMARY KEY AUTO_INCREMENT,
    block_id INT NOT NULL,
    lot_number INT NOT NULL,
    status ENUM('available', 'reserved', 'occupied') NOT NULL DEFAULT 'available',
    customer_id INT NULL,
    purchase_date DATE NULL,
    -- Vault tracking per lot
    vault_option ENUM('option1','option2','option3') NULL,
    lower_body TINYINT(1) NOT NULL DEFAULT 0,
    upper_body TINYINT(1) NOT NULL DEFAULT 0,
    lower_bone TINYINT(2) NOT NULL DEFAULT 0,
    upper_bone TINYINT(2) NOT NULL DEFAULT 0,
    deleted_at TIMESTAMP NULL,
    deleted_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_block_lot (block_id, lot_number),
    FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Deceased records table
CREATE TABLE deceased_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    date_of_death DATE NOT NULL,
    burial_date DATE,
    lot_id INT NOT NULL,
    customer_id INT NULL,
    status ENUM('BURIED', 'SCHEDULED') DEFAULT 'BURIED',
    cause_of_death TEXT,
    funeral_home VARCHAR(100),
    notes TEXT,
    
    deleted_at TIMESTAMP NULL,
    deleted_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_deceased_lot FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
    CONSTRAINT fk_deceased_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Ownership records table (for managing lot ownership)
-- ownership_records removed: lots + customers store ownership

-- Payment records table (for monitoring payments)
CREATE TABLE payment_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    lot_id INT NOT NULL,
    owner_name VARCHAR(100) NOT NULL,
    contact VARCHAR(20),
    section VARCHAR(50),
    payment_amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('Cash', 'GCash', 'Maya') DEFAULT 'Cash',
    payment_due_date DATE,
    last_payment_date DATE,
    status ENUM('Paid', 'Pending', 'Overdue') DEFAULT 'Pending',
    payment_date DATE,
    notes TEXT,
    
    -- Optional gateway tracking (used by online payments)
    checkout_id VARCHAR(255) NULL,
    request_reference_number VARCHAR(255) NULL,
    payment_gateway ENUM('cash','gcash','maya') DEFAULT 'cash',
    transaction_id VARCHAR(255) NULL,
    webhook_data TEXT NULL,
    
    deleted_at TIMESTAMP NULL,
    deleted_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_checkout_id (checkout_id),
    INDEX idx_request_reference (request_reference_number),
    INDEX idx_payment_month (lot_id, payment_date),
    FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Payment plans for installment purchases
CREATE TABLE IF NOT EXISTS payment_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lot_id INT NOT NULL,
    customer_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    down_payment DECIMAL(10,2) NOT NULL DEFAULT 0,
    monthly_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_term_months INT NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    status ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
    remaining_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_by INT NULL,
    notes TEXT NULL,
    due_day INT NULL DEFAULT NULL COMMENT 'Preferred day of month (1-31) for due dates',
    delinquency_start_month CHAR(7) NULL DEFAULT NULL COMMENT 'YYYY-MM format: first month when account became delinquent',
    deleted_at TIMESTAMP NULL,
    deleted_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_plan_lot_customer (lot_id, customer_id),
    FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Monthly schedule rows per plan (generated for installment plans)
CREATE TABLE IF NOT EXISTS payment_plan_schedule (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_plan_id INT NOT NULL,
    month_number INT NOT NULL,
    due_date DATE NOT NULL,
    amount_due DECIMAL(10,2) NOT NULL,
    status ENUM('pending','paid','overdue') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_schedule_plan (payment_plan_id),
    FOREIGN KEY (payment_plan_id) REFERENCES payment_plans(id) ON DELETE CASCADE
);

-- Online checkout sessions (Paymongo)
CREATE TABLE IF NOT EXISTS payment_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    checkout_id VARCHAR(255) NOT NULL,
    lot_id INT NOT NULL,
    customer_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_month CHAR(7) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_checkout (checkout_id),
    INDEX idx_sessions_lot (lot_id),
    INDEX idx_sessions_customer (customer_id),
    FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Activity log table
CREATE TABLE activity_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    action VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    details TEXT NOT NULL,
    performed_by INT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_user FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Backup/Recovery System Tables

-- System settings for retention policy
CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT NULL,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Backup snapshots table (stores complete context of deleted records)
CREATE TABLE IF NOT EXISTS deleted_records_backup (
    id INT PRIMARY KEY AUTO_INCREMENT,
    record_type ENUM('user', 'lot', 'deceased', 'payment') NOT NULL,
    record_id INT NOT NULL,
    snapshot_data JSON NOT NULL,
    related_data JSON NULL,
    deleted_by INT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    can_restore TINYINT(1) DEFAULT 1,
    restore_notes TEXT NULL,
    INDEX idx_backup_type_id (record_type, record_id),
    INDEX idx_backup_deleted_at (deleted_at),
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Recovery history table (tracks restoration attempts and results)
CREATE TABLE IF NOT EXISTS recovery_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    backup_id INT NOT NULL,
    record_type ENUM('user', 'lot', 'deceased', 'payment') NOT NULL,
    original_record_id INT NOT NULL,
    restored_record_id INT NULL,
    recovery_status ENUM('success', 'partial', 'failed', 'migrated') NOT NULL,
    recovery_details JSON NULL,
    conflict_resolution TEXT NULL,
    performed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recovery_backup (backup_id),
    INDEX idx_recovery_status (recovery_status),
    FOREIGN KEY (backup_id) REFERENCES deleted_records_backup(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert sample data for testing

-- Essential users only
-- Default seed password for all sample users below is: password
INSERT INTO users (username, password, email, account_type, default_password, using_default, first_name, middle_name, last_name, contact_number, sex_at_birth, nationality, civil_status) VALUES
('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@cemetery.com', 'admin', 'Admin@123!', 1, 'System', NULL, 'Administrator', '+639906853001', 'male', 'Philippines', 'single'),
('staff1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'staff1@cemetery.com', 'staff', 'Staff@123!', 1, 'Cemetery', NULL, 'Staff', '+639900852902', 'male', 'Philippines', 'single'),
('cashier1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'cashier1@cemetery.com', 'cashier', 'Cashier@123!', 1, 'Cashier', NULL, 'One', '+639909137003', 'female', 'Philippines', 'single');



-- Seed minimal mapping to support lots from lot_positions.php (Joy Garden / Sector A / Blocks 1 and 2)
INSERT INTO gardens (name) VALUES ('Joy Garden');
INSERT INTO sectors (garden_id, name) VALUES
((SELECT id FROM gardens WHERE name='Joy Garden'), 'A');
INSERT INTO blocks (sector_id, block_number) VALUES
((SELECT id FROM sectors WHERE name='A' AND garden_id=(SELECT id FROM gardens WHERE name='Joy Garden')), 1),
((SELECT id FROM sectors WHERE name='A' AND garden_id=(SELECT id FROM gardens WHERE name='Joy Garden')), 2),
((SELECT id FROM sectors WHERE name='A' AND garden_id=(SELECT id FROM gardens WHERE name='Joy Garden')), 3),
((SELECT id FROM sectors WHERE name='A' AND garden_id=(SELECT id FROM gardens WHERE name='Joy Garden')), 4),
((SELECT id FROM sectors WHERE name='A' AND garden_id=(SELECT id FROM gardens WHERE name='Joy Garden')), 5),
((SELECT id FROM sectors WHERE name='A' AND garden_id=(SELECT id FROM gardens WHERE name='Joy Garden')), 6);

-- Insert default system settings for backup retention
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('backup_retention_days', '30', 'Number of days to keep deleted records before permanent deletion (7=1week, 30=1month, 365=1year, 1095=3years, 0=keep forever)'),
('auto_cleanup_enabled', '1', 'Enable automatic cleanup of expired backups (1=yes, 0=no)');

-- Two-Factor Authentication (2FA) Tables

-- OTP codes table (for temporary storage of verification codes)
CREATE TABLE IF NOT EXISTS otp_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    device_fingerprint VARCHAR(255) NULL,
    expires_at TIMESTAMP NOT NULL,
    used TINYINT(1) NOT NULL DEFAULT 0,
    pending_email VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_otp (user_id, otp_code),
    INDEX idx_expires (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trusted devices table (tracks devices that have completed 2FA)
CREATE TABLE IF NOT EXISTS trusted_devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_info TEXT NULL,
    first_verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_device (user_id, device_fingerprint),
    INDEX idx_user_device (user_id, device_fingerprint),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
