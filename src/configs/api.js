// API Configuration
// Dynamically resolve base to support XAMPP subfolder like /ManagementSystem
const resolveApiBase = () => {
  if (typeof window === 'undefined') return '/api';
  const path = window.location.pathname || '';
  const port = window.location.port || '';
  const host = window.location.hostname || 'localhost';
  // If the app is under /ManagementSystem, prefix API with that base
  const marker = '/ManagementSystem';
  if (path.startsWith(marker) || path.includes(`${marker}/`)) {
    return `${marker}/api`;
  }
  // If running via Vite dev server, prefer proxying via /api → vite.config.js
  if (port === '5173' || port === '5174') {
    return '/api';
  }
  // Fallback to relative /api
  return '/api';
};

export const API_BASE_URL = resolveApiBase();

// API endpoints
export const API_ENDPOINTS = {
  // Authentication
  LOGIN: `${API_BASE_URL}/login.php`,
  LOGOUT: `${API_BASE_URL}/logout.php`,
  SESSION: `${API_BASE_URL}/session.php`,
  SEND_OTP: `${API_BASE_URL}/send_otp.php`,
  VERIFY_OTP: `${API_BASE_URL}/verify_otp.php`,
  ADD_EMAIL_DURING_LOGIN: `${API_BASE_URL}/add_email_during_login.php`,
  
  // Users
  GET_USERS: `${API_BASE_URL}/get_users.php`,
  CREATE_USER: `${API_BASE_URL}/create_user.php`,
  UPDATE_USER: `${API_BASE_URL}/update_user.php`,
  DELETE_USER: `${API_BASE_URL}/delete_user.php`,
  RESET_PASSWORD: `${API_BASE_URL}/reset_password.php`,
  FORGOT_PASSWORD: `${API_BASE_URL}/forgot_password.php`,
  CHANGE_PASSWORD: `${API_BASE_URL}/change_password.php`,
  IMPORT_USERS: `${API_BASE_URL}/import_users.php`,
  
  // Customers - removed legacy customer records endpoints
  
  // Lots
  GET_MY_LOTS: `${API_BASE_URL}/get_my_lots.php`,
  
  // Ownership
  GET_OWNERSHIPS: `${API_BASE_URL}/get_ownerships.php`,
  CREATE_OWNERSHIP: `${API_BASE_URL}/create_ownership.php`,
  UPDATE_OWNERSHIP: `${API_BASE_URL}/update_ownership.php`,
  DELETE_OWNERSHIP: `${API_BASE_URL}/delete_ownership.php`,
  GET_CUSTOMER_USERS: `${API_BASE_URL}/get_customer_users.php`,
  // Mapping-driven selectors
  MAP_GARDENS: `${API_BASE_URL}/get_mapping_gardens.php`,
  MAP_SECTORS: `${API_BASE_URL}/get_mapping_sectors.php`,
  MAP_BLOCKS: `${API_BASE_URL}/get_mapping_blocks.php`,
  MAP_AVAILABLE_LOTS: `${API_BASE_URL}/get_mapping_available_lots.php`,
  // Mapping pages data
  MAP_SECTORS_POLY: `${API_BASE_URL}/get_lots.php`,
  MAP_SECTOR_LOTS: `${API_BASE_URL}/get_lots_by_sector.php`,
  MAP_SECTOR_PATHS: `${API_BASE_URL}/sector_paths.php`,
  MAP_UI_CONFIG: `${API_BASE_URL}/ui_config.php`,
  MAP_MARKERS: `${API_BASE_URL}/map_markers.php`,
  
        // Payments
        GET_PAYMENT_RECORDS: `${API_BASE_URL}/get_payment_records.php`,
        CREATE_PAYMENT_RECORD: `${API_BASE_URL}/create_payment_record.php`,
        UPDATE_PAYMENT_RECORD: `${API_BASE_URL}/update_payment_record.php`,
        DELETE_PAYMENT_RECORD: `${API_BASE_URL}/delete_payment_record.php`,
        
  
  // Reports
  GET_DASHBOARD_STATS: `${API_BASE_URL}/get_dashboard_stats.php`,
  GET_REPORTS_DATA: `${API_BASE_URL}/get_reports_data.php`,
  GET_REPORTS_V2: `${API_BASE_URL}/get_reports_v2.php`,
  
  // Activity Logs
  GET_ACTIVITY_LOGS: `${API_BASE_URL}/get_activity_logs.php`,
  RECORD_ACTIVITY: `${API_BASE_URL}/record_activity.php`,
  
  // Deceased Records
  GET_DECEASED_RECORDS: `${API_BASE_URL}/get_deceased_records.php`,
  CREATE_DECEASED_RECORD: `${API_BASE_URL}/create_deceased_record.php`,
  UPDATE_DECEASED_RECORD: `${API_BASE_URL}/update_deceased_record.php`,
  DELETE_DECEASED_RECORD: `${API_BASE_URL}/delete_deceased_record.php`,
  IMPORT_DECEASED_RECORDS: `${API_BASE_URL}/import_deceased_records.php`,
  // Lot vault usage
  GET_LOT_VAULT: `${API_BASE_URL}/get_lot_vault.php`,
  SET_LOT_VAULT_OPTION: `${API_BASE_URL}/set_lot_vault_option.php`,
  
  // Profile
  GET_PROFILE: `${API_BASE_URL}/get_profile.php`,
  UPDATE_PROFILE: `${API_BASE_URL}/update_profile.php`,
  
  // Search
  SEARCH_LOTS: `${API_BASE_URL}/search_lots.php`,
};
