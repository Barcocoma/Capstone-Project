import React, { useState, useEffect } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Input,
  Button,
  Chip,
  Tooltip,
  IconButton,
  Select,
  Option,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Alert,
} from "@material-tailwind/react";
import {
  MagnifyingGlassIcon,
  PlusCircleIcon,
  PencilIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { API_ENDPOINTS } from "@/configs/api";
import { useAuth } from "@/context/AuthContext";
import { sanitizeName } from "@/utils/nameValidation";

const PHILIPPINE_PROVINCES = [
  'Abra', 'Agusan del Norte', 'Agusan del Sur', 'Aklan', 'Albay', 'Antique', 'Apayao', 'Aurora',
  'Basilan', 'Bataan', 'Batanes', 'Batangas', 'Benguet', 'Biliran', 'Bohol', 'Bukidnon', 'Bulacan',
  'Cagayan', 'Camarines Norte', 'Camarines Sur', 'Camiguin', 'Capiz', 'Catanduanes', 'Cavite', 'Cebu',
  'Cotabato', 'Davao de Oro', 'Davao del Norte', 'Davao del Sur', 'Davao Occidental', 'Davao Oriental',
  'Dinagat Islands', 'Eastern Samar', 'Guimaras', 'Ifugao', 'Ilocos Norte', 'Ilocos Sur', 'Iloilo',
  'Isabela', 'Kalinga', 'La Union', 'Laguna', 'Lanao del Norte', 'Lanao del Sur', 'Leyte',
  'Maguindanao', 'Marinduque', 'Masbate', 'Misamis Occidental', 'Misamis Oriental', 'Mountain Province',
  'Negros Occidental', 'Negros Oriental', 'Northern Samar', 'Nueva Ecija', 'Nueva Vizcaya', 'Occidental Mindoro',
  'Oriental Mindoro', 'Palawan', 'Pampanga', 'Pangasinan', 'Quezon', 'Quirino', 'Rizal', 'Romblon',
  'Samar', 'Sarangani', 'Siquijor', 'Sorsogon', 'South Cotabato', 'Southern Leyte', 'Sultan Kudarat',
  'Sulu', 'Surigao del Norte', 'Surigao del Sur', 'Tarlac', 'Tawi-Tawi', 'Zambales', 'Zamboanga del Norte',
  'Zamboanga del Sur', 'Zamboanga Sibugay'
].sort();

const PHILIPPINE_CITIES = [
  'Alaminos', 'Angeles', 'Antipolo', 'Bacolod', 'Bacoor', 'Bago', 'Baguio', 'Bais', 'Balanga', 'Batangas City',
  'Bayawan', 'Baybay', 'Bayugan', 'Biñan', 'Bislig', 'Bogo', 'Borongan', 'Butuan', 'Cabadbaran', 'Cabanatuan',
  'Cabuyao', 'Cadiz', 'Cagayan de Oro', 'Calamba', 'Calapan', 'Calbayog', 'Caloocan', 'Candon', 'Canlaon', 'Carcar',
  'Catbalogan', 'Cauayan', 'Cavite City', 'Cebu City', 'Cotabato City', 'Dagupan', 'Danao', 'Dapitan', 'Dasmarinas',
  'Davao City', 'Digos', 'Dipolog', 'Dumaguete', 'El Salvador', 'Escalante', 'Gapan', 'General Santos', 'Gingoog',
  'Guihulngan', 'Himamaylan', 'Ilagan', 'Iligan', 'Iloilo City', 'Imus', 'Iriga', 'Isabela', 'Kabankalan', 'Kidapawan',
  'Koronadal', 'La Carlota', 'Lamitan', 'Laoag', 'Lapu-Lapu', 'Las Piñas', 'Legazpi', 'Ligao', 'Lipa', 'Lucena',
  'Maasin', 'Mabalacat', 'Makati', 'Malabon', 'Malaybalay', 'Malolos', 'Mandaluyong', 'Mandaue', 'Manila', 'Marawi',
  'Marikina', 'Masbate City', 'Mati', 'Meycauayan', 'Muntinlupa', 'Naga', 'Navotas', 'Olongapo', 'Ormoc', 'Oroquieta',
  'Ozamiz', 'Pagadian', 'Palayan', 'Panabo', 'Parañaque', 'Pasay', 'Pasig', 'Passi', 'Puerto Princesa', 'Quezon City',
  'Roxas', 'Sagay', 'Samal', 'San Carlos (Negros Occidental)', 'San Carlos (Pangasinan)', 'San Fernando (La Union)',
  'San Fernando (Pampanga)', 'San Jose', 'San Jose del Monte', 'San Juan', 'San Pablo', 'Santa Rosa', 'Santiago',
  'Silay', 'Sipalay', 'Sorsogon City', 'Surigao', 'Tabaco', 'Tacloban', 'Taguig', 'Tagum', 'Talisay (Cebu)', 'Talisay (Negros Occidental)',
  'Tanauan', 'Tandag', 'Tangub', 'Tanjay', 'Tarlac City', 'Tayabas', 'Toledo', 'Trece Martires', 'Tuguegarao', 'Urdaneta',
  'Valencia', 'Valenzuela', 'Victorias', 'Vigan', 'Zamboanga City'
].sort();

export function AccountManagement() {
  const { user: currentUser } = useAuth();
  // State for data and loading
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('account_page_size');
    return saved ? Number(saved) : 5;
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  
  // State for modals and form data
  const [editingUser, setEditingUser] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [addStep, setAddStep] = useState(1);
  const [editStep, setEditStep] = useState(1);
  const [customerForm, setCustomerForm] = useState({
    street_address: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'Philippines',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    occupation: '',
    employer: '',
    monthly_income: '',
    source_of_funds: '',
    notes: ''
  });
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [provinceFilter, setProvinceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [userForm, setUserForm] = useState({ email: '', role: '', first_name: '', middle_name: '', last_name: '', contact_number: '', sex_at_birth: '' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.com$/i;
  const isValidPhNumber = (v) => /^\+639\d{9}$/.test((v || '').replace(/\s/g, ''));

  const formatContact = (val) => {
    const digits = String(val || '').replace(/\D/g, '');
    const tail = digits.replace(/^639?/, '').replace(/^09?/, '');
    const limited = tail.slice(0, 9);
    return `+639${limited}`;
  };
  const [staffForm, setStaffForm] = useState({ name: '', position: '', email: '', status: '', password: '' });
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  const [validationErrors, setValidationErrors] = useState({});
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Toast functions
  const showToast = (message, type = 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'error' });
    }, 5000);
  };

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Validation function
  const validateForm = () => {
    const errors = {};
    const missingFields = [];
    
    // Username is now auto-generated, no need to validate
    // Email is optional, but if provided, it must be valid
    if (userForm.email && userForm.email.trim() !== '' && !emailRegex.test(userForm.email)) {
      errors.email = 'Email must be a valid format';
    }
    if (!userForm.first_name || userForm.first_name.trim() === '') {
      errors.first_name = 'First name is required';
      missingFields.push('First Name');
    }
    if (!userForm.last_name || userForm.last_name.trim() === '') {
      errors.last_name = 'Last name is required';
      missingFields.push('Last Name');
    }
    if (!userForm.contact_number || userForm.contact_number === '+639' || userForm.contact_number.trim() === '') {
      errors.contact_number = 'Contact number is required';
      missingFields.push('Contact Number');
    } else if (userForm.contact_number.length < 13 || !isValidPhNumber(userForm.contact_number)) {
      errors.contact_number = 'Contact number must be +639XXXXXXXXX';
      missingFields.push('Contact Number');
    }
    if (!userForm.sex_at_birth || userForm.sex_at_birth.trim() === '') {
      errors.sex_at_birth = 'Gender is required';
      missingFields.push('Gender');
    }
    if (!userForm.role || userForm.role.trim() === '') {
      errors.role = 'Role is required';
      missingFields.push('Role');
    }
    
    setValidationErrors(errors);
    
    // Only show toast if there are actual missing fields
    if (missingFields.length > 0) {
      setToast({ 
        show: true, 
        message: `Missing required fields: ${missingFields.join(', ')}`, 
        type: 'error' 
      });
    }
    
    return Object.keys(errors).length === 0;
  };

  // Validation function for customer details
  const validateCustomerDetails = () => {
    const errors = {};
    const missingFields = [];
    
    // Check for empty or whitespace-only fields in customer details
    if (!customerForm.street_address || customerForm.street_address.trim() === '') {
      errors.street_address = 'Street address is required';
      missingFields.push('Street Address');
    }
    if (!customerForm.city || customerForm.city.trim() === '') {
      errors.city = 'City is required';
      missingFields.push('City');
    }
    if (!customerForm.province || customerForm.province.trim() === '') {
      errors.province = 'Province is required';
      missingFields.push('Province');
    }
    if (!customerForm.postal_code || customerForm.postal_code.trim() === '') {
      errors.postal_code = 'Postal code is required';
      missingFields.push('Postal Code');
    }
    if (!customerForm.emergency_contact_name || customerForm.emergency_contact_name.trim() === '') {
      errors.emergency_contact_name = 'Emergency contact name is required';
      missingFields.push('Emergency Contact Name');
    }
    if (!customerForm.emergency_contact_phone || customerForm.emergency_contact_phone.trim() === '') {
      errors.emergency_contact_phone = 'Emergency contact phone is required';
      missingFields.push('Emergency Contact Phone');
    } else if (customerForm.emergency_contact_phone.length < 13 || !isValidPhNumber(customerForm.emergency_contact_phone)) {
      errors.emergency_contact_phone = 'Emergency contact phone must be +639XXXXXXXXX';
      missingFields.push('Emergency Contact Phone');
    }
    if (!customerForm.emergency_contact_relationship || customerForm.emergency_contact_relationship.trim() === '') {
      errors.emergency_contact_relationship = 'Emergency contact relationship is required';
      missingFields.push('Emergency Contact Relationship');
    }
    
    setValidationErrors(errors);
    
    // Only show toast if there are actual missing fields
    if (missingFields.length > 0) {
      setToast({ 
        show: true, 
        message: `Missing required fields: ${missingFields.join(', ')}`, 
        type: 'error' 
      });
    }
    
    return Object.keys(errors).length === 0;
  };

  // Fetch users from backend
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.GET_USERS);
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        console.error('Failed to fetch users:', data.message);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Handlers for User
  const openEditUser = async (user) => { 
    setEditStep(1);
    setEditingUser(user); 
    setUserForm({
      username: user.username,
      email: user.email,
      role: user.user_type || user.account_type,
      password: '',
      first_name: user.first_name || '',
      middle_name: user.middle_name || '',
      last_name: user.last_name || '',
      contact_number: user.contact_number || '',
      sex_at_birth: (user.sex_at_birth || '').toLowerCase()
    }); 
    try {
      const role = (user.user_type || user.account_type || '').toLowerCase();
      if (role === 'customer' && user.id) {
        const res = await fetch(`${API_ENDPOINTS.GET_PROFILE}?user_id=${user.id}`);
        const data = await res.json();
        const cust = data?.profile?.customer || {};
        setCustomerForm({
          street_address: cust.street_address || '',
          city: cust.city || '',
          province: cust.province || '',
          postal_code: cust.postal_code || '',
          country: cust.country || 'Philippines',
          emergency_contact_name: cust.emergency_contact_name || '',
          emergency_contact_phone: cust.emergency_contact_phone || '',
          emergency_contact_relationship: cust.emergency_contact_relationship || '',
          occupation: cust.occupation || '',
          employer: cust.employer || '',
          monthly_income: cust.monthly_income || '',
          source_of_funds: cust.source_of_funds || '',
          notes: cust.notes || ''
        });
      }
    } catch (_) {}
  };
  const closeEditUser = () => { 
    setEditingUser(null); 
    setEditStep(1);
    setUserForm({ email: '', role: '', first_name: '', middle_name: '', last_name: '', contact_number: '', sex_at_birth: '' }); 
    setShowEditUserPassword(false);
    setProvinceFilter('');
    setCityFilter('');
  };
  const openAddUser = () => { 
    setIsAddUserOpen(true); 
    setAddStep(1);
    setValidationErrors({}); // Clear validation errors when opening dialog
    setToast({ show: false, message: '', type: 'error' }); // Clear any existing toast
    setCustomerForm({
      street_address: '', city: '', province: '', postal_code: '', country: 'Philippines',
      emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
      occupation: '', employer: '', monthly_income: '', source_of_funds: '', notes: ''
    });
    setUserForm({ email: '', role: '', first_name: '', middle_name: '', last_name: '', contact_number: '+639', sex_at_birth: '' }); 
    setProvinceFilter('');
    setCityFilter('');
  };
  const closeAddUser = () => { 
    setIsAddUserOpen(false); 
    setAddStep(1);
    setUserForm({ username: '', email: '', role: '', first_name: '', middle_name: '', last_name: '', contact_number: '', sex_at_birth: '' }); 
    setShowAddUserPassword(false);
    setProvinceFilter('');
    setCityFilter('');
  };
  const handleUserFormChange = (field, value) => {
    // Sanitize name fields to remove special characters
    if (field === 'first_name' || field === 'last_name' || field === 'middle_name') {
      value = sanitizeName(value);
    }
    setUserForm((prev) => ({ ...prev, [field]: value }));
  };
  const handleContactChange = (value) => setUserForm((prev) => ({ ...prev, contact_number: formatContact(value) }));
  
  const openDeleteUser = (user) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };
  
  const closeDeleteUser = () => {
    setUserToDelete(null);
    setIsDeleteDialogOpen(false);
  };
  
  const saveUser = async () => {
    try {
      if (currentUser?.user_type === 'staff' && userForm.role && userForm.role !== 'customer') {
        alert('Staff can update customers only.');
        return;
      }
      // Email is optional, but if provided, it must be valid
      if (userForm.email && userForm.email.trim() !== '' && !emailRegex.test(userForm.email)) { alert('Email must be a .com address (e.g. name@gmail.com).'); return; }
      if (!userForm.first_name) { alert('First name is required'); return; }
      if (!userForm.last_name) { alert('Last name is required'); return; }
      if (!userForm.contact_number) { alert('Contact number is required'); return; }
      if (userForm.contact_number && !isValidPhNumber(userForm.contact_number)) { alert('Contact number must be +639XXXXXXXXX'); return; }
      if (!userForm.sex_at_birth) { alert('Gender is required'); return; }
      const response = await fetch(API_ENDPOINTS.UPDATE_USER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
          body: JSON.stringify({
          id: editingUser.id,
          username: userForm.username,
          user_type: userForm.role,
          email: userForm.email,
          first_name: userForm.first_name,
          middle_name: userForm.middle_name,
          last_name: userForm.last_name,
          contact_number: userForm.contact_number,
          sex_at_birth: userForm.sex_at_birth
        })
      });
      const data = await response.json();
      if (data.success) {
        // Persist customer details as well if role is customer
        if ((userForm.role || '').toLowerCase() === 'customer') {
          // Validate required customer details
          const requiredCustomer = ['street_address','city','province','postal_code','emergency_contact_name','emergency_contact_phone','emergency_contact_relationship'];
          for (const f of requiredCustomer) {
            if (!String(customerForm[f] || '').trim()) {
              alert(`Please fill out required customer field: ${f.replace(/_/g,' ')}`);
              return;
            }
          }
          try {
            const res2 = await fetch(API_ENDPOINTS.UPDATE_PROFILE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
              body: JSON.stringify({
                id: editingUser.id,
                username: userForm.username,
                email: userForm.email,
                contact_number: userForm.contact_number,
                sex_at_birth: userForm.sex_at_birth,
                ...customerForm
              })
            });
            const r2 = await res2.json();
            if (!r2.success) {
              alert(r2.message || 'Failed to update customer details');
              return;
            }
          } catch (e) {
            alert('Error updating customer details');
            return;
          }
        }
        showToast('User updated successfully!', 'success');
        closeEditUser();
        fetchUsers(); // Refresh the list
      } else {
        showToast(data.message || 'Failed to update user', 'error');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      showToast('Error updating user', 'error');
    }
  };
  
  const addUser = async () => {
    try {
      // Clear previous validation errors and toast
      setValidationErrors({});
      setToast({ show: false, message: '', type: 'error' });
      
      // Validate form
      if (!validateForm()) {
        return; // Don't close dialog, validation function already shows specific toast
      }
      
      const payload = {
        // Username is auto-generated on backend, don't send it
        user_type: userForm.role,
        email: userForm.email,
        first_name: userForm.first_name,
        middle_name: userForm.middle_name,
        last_name: userForm.last_name,
        contact_number: userForm.contact_number,
        sex_at_birth: userForm.sex_at_birth,
      };
      if ((userForm.role || '').toLowerCase() === 'customer') {
        Object.assign(payload, customerForm);
      }
      const response = await fetch(API_ENDPOINTS.CREATE_USER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
          body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        let message = `User created successfully!`;
        if (data.username) {
          message += ` Username: ${data.username}`;
        }
        if (data.default_password) {
          message += ` Default password: ${data.default_password}`;
        }
        showToast(message, 'success');
        // Only close dialog on success
        closeAddUser();
        fetchUsers(); // Refresh the list
        setPage(1);
      } else {
        showToast(data.message || 'Failed to create user', 'error');
        // Don't close dialog on error, keep it open
      }
    } catch (error) {
      console.error('Error creating user:', error);
      showToast('Error creating user', 'error');
      // Don't close dialog on error, keep it open
    }
  };

  const deleteUser = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.DELETE_USER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
        body: JSON.stringify({ id: userToDelete.id })
      });
      const data = await response.json();
      if (data.success) {
        closeDeleteUser();
        fetchUsers(); // Refresh the list
      } else {
        alert(data.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error deleting user');
    }
  };

  const handleImportUsers = async () => {
    if (!importFile) {
      showToast('Please select an Excel file', 'error');
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      // Helper to call an endpoint and return parsed JSON or throw
      const callImport = async (endpoint) => {
        let response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'X-User-Id': currentUser?.id?.toString() || '' },
            body: formData
          });
        } catch (networkError) {
          console.error('Network error:', networkError);
          throw new Error(`Network error: ${networkError.message}. Please check your connection and try again.`);
        }

        if (!response.ok) {
          let errorText = '';
          try {
            errorText = await response.text();
            console.error('Import response error:', errorText);
            try {
              const errorData = JSON.parse(errorText);
              throw new Error(errorData.message || `Server error (${response.status})`);
            } catch {
              throw new Error(`Server error (${response.status}): ${errorText.substring(0, 100)}`);
            }
          } catch (e) {
            throw new Error(`Server error (${response.status}). Please check browser console for details.`);
          }
        }

        const data = await response.json();
        return data;
      };

      let usersResult = null;
      let deceasedResult = null;

      // Automatically try all import types with the same file.
      // 1) Try accounts import (users + ownership)
      usersResult = await callImport(API_ENDPOINTS.IMPORT_USERS);

      // 2) Try deceased import, but ignore it completely if it fails due to missing/invalid columns.
      try {
        deceasedResult = await callImport(API_ENDPOINTS.IMPORT_DECEASED_RECORDS);
      } catch (e) {
        // Deceased import is optional; just log and continue.
        console.warn('Deceased import skipped or failed:', e);
        deceasedResult = null;
      }

      // Build a simple summary message similar to the previous "both" mode.
      const u = usersResult || { total: 0, created: 0, failed: 0, errors: [] };
      const d = deceasedResult || { total: 0, created: 0, failed: 0, errors: [] };

      if (!u.success && !d.success) {
        const primaryError =
          (u && u.message) ||
          (d && d.message) ||
          'Import failed. Please check the console for details.';
        console.error('Import errors (both failed):', { usersResult: u, deceasedResult: d });
        showToast(primaryError, 'error');
        return;
      }

      // Calculate totals
      const totalAccounts = (u && u.total) || 0;
      const createdAccounts = (u && u.created) || 0;
      const failedAccounts = (u && u.failed) || 0;
      const totalDeceased = (d && d.total) || 0;
      const createdDeceased = (d && d.created) || 0;
      const failedDeceased = (d && d.failed) || 0;
      
      const totalCreated = createdAccounts + createdDeceased;
      const totalFailed = failedAccounts + failedDeceased;
      const hasFailures = totalFailed > 0;

      // Build success message
      let successMessage = '';
      if (totalCreated > 0) {
        successMessage = `✅ Import Successful!\n\n`;
        if (createdAccounts > 0) {
          successMessage += `📋 Accounts: ${createdAccounts} created`;
          if (totalAccounts > createdAccounts) {
            successMessage += ` (${totalAccounts} total)`;
          }
          successMessage += '\n';
        }
        if (createdDeceased > 0) {
          successMessage += `🕊️ Deceased: ${createdDeceased} created`;
          if (totalDeceased > createdDeceased) {
            successMessage += ` (${totalDeceased} total)`;
          }
          successMessage += '\n';
        }
        if (hasFailures) {
          successMessage += `\n⚠️ Note: ${totalFailed} row(s) failed (see console for details)`;
        }
      } else {
        successMessage = 'Import completed, but no records were created.';
      }

      // Show success toast first
      showToast(successMessage, hasFailures ? 'warning' : 'success');

      // Show detailed errors in console and as a separate toast if there are failures
      const allErrors = [
        ...(u && u.errors ? u.errors.map(e => `Account: ${e}`) : []),
        ...(d && d.errors ? d.errors.map(e => `Deceased: ${e}`) : []),
      ];
      if (allErrors.length > 0 && hasFailures) {
        console.error('Combined import errors:', allErrors);
        // Show error details after a short delay so success message is seen first
        setTimeout(() => {
          const errorMessage =
            `⚠️ ${totalFailed} row(s) failed:\n\n` +
            allErrors.slice(0, 10).join('\n') +
            (allErrors.length > 10 ? `\n... and ${allErrors.length - 10} more (check console)` : '');
          showToast(errorMessage, 'error');
        }, 3000); // Show error after 3 seconds so user sees success message first
      }

      setIsImportDialogOpen(false);
      setImportFile(null);
      fetchUsers(); // Refresh the list
    } catch (error) {
      console.error('Error importing users:', error);
      showToast(`Network error: ${error.message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  // Handlers for Staff
  const openEditStaff = (staff) => { setEditingStaff(staff); setStaffForm(staff); };
  const closeEditStaff = () => { setEditingStaff(null); setStaffForm({ name: '', position: '', email: '', status: '', password: '' }); };
  const openAddStaff = () => { setIsAddStaffOpen(true); setStaffForm({ name: '', position: '', email: '', status: '', password: '' }); };
  const closeAddStaff = () => { setIsAddStaffOpen(false); setStaffForm({ name: '', position: '', email: '', status: '', password: '' }); };
  const handleStaffFormChange = (field, value) => setStaffForm((prev) => ({ ...prev, [field]: value }));
  const saveStaff = () => { /* TODO: API call */ closeEditStaff(); };
  const addStaff = () => { /* TODO: API call */ closeAddStaff(); };

  const getRoleColor = (role) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'red';
      case 'staff':
        return 'blue';
      case 'cashier':
        return 'green';
      case 'customer':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const getStatusColor = (status) => {
    return status === 'Active' ? 'green' : 'red';
  };

  if (loading) {
    return (
      <div className="mt-12">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Loading users...
        </Typography>
      </div>
    );
  }

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="mb-8">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Account Management
        </Typography>
        <Typography variant="small" color="blue-gray" className="opacity-70">
          Manage user accounts and system access
        </Typography>
      </div>

      {/* Users Management */}
      <Card className="mb-6">
        <CardHeader
          floated={false}
          shadow={false}
          color="transparent"
          className="m-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6"
        >
          <Typography variant="h5" color="blue-gray" className="mb-1">
            Users Management
          </Typography>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:w-auto">
            <div className="w-full sm:w-72">
              <Input
                label="Search users..."
                icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                value={query}
                onChange={(e) => { 
                  const filtered = e.target.value.replace(/[^A-Za-z0-9\s\/\-\:]/g, '');
                  setQuery(filtered); 
                  setPage(1); 
                }}
              />
            </div>
            <Button 
              className="flex items-center justify-center gap-3 w-full sm:w-auto" 
              color="green" 
              onClick={() => setIsImportDialogOpen(true)}
            >
              <ArrowUpTrayIcon strokeWidth={2} className="h-4 w-4" /> 
              Import Users
            </Button>
            <Button 
              className="flex items-center justify-center gap-3 w-full sm:w-auto" 
              color="blue" 
              onClick={openAddUser}
            >
              <PlusCircleIcon strokeWidth={2} className="h-4 w-4" /> 
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardBody className="px-0 pt-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr>
                  {[
                    { key: 'username', label: 'Username' },
                    { key: 'name', label: 'Name' },
                    { key: 'email', label: 'Email' },
                    { key: 'role', label: 'Role' },
                    { key: 'contact', label: 'Contact #' },
                    { key: 'created', label: 'Created' },
                    { key: null, label: 'Actions' }
                  ].map((col) => (
                    <th
                      key={col.key || 'actions'}
                      className={`border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 ${col.key ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      onClick={col.key ? () => handleSort(col.key) : undefined}
                    >
                      <div className="flex items-center gap-1">
                        <Typography
                          variant="small"
                          className="text-[11px] font-medium uppercase text-blue-gray-400"
                        >
                          {col.label}
                        </Typography>
                        {col.key && sortConfig.key === col.key && (
                          sortConfig.direction === 'asc' ? 
                            <ChevronUpIcon className="h-4 w-4 text-blue-gray-400" /> : 
                            <ChevronDownIcon className="h-4 w-4 text-blue-gray-400" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const norm = (v) => String(v || '').toLowerCase();
                  const base = users.filter(u => (currentUser?.user_type === 'staff' ? (u.user_type || '').toLowerCase() === 'customer' : true));
                  const queryLower = query.toLowerCase();
                  let filtered = base.filter(u => {
                    const dateStr = new Date(u.created_at || '').toLocaleDateString().toLowerCase();
                    return norm(u.username).includes(queryLower) ||
                      norm(`${u.first_name || ''} ${u.middle_name || ''} ${u.last_name || ''}`.replace(/\s+/g,' ').trim()).includes(queryLower) ||
                      norm(u.email).includes(queryLower) ||
                      norm(u.user_type).includes(queryLower) ||
                      dateStr.includes(queryLower);
                  });
                  
                  // Apply sorting
                  if (sortConfig.key) {
                    filtered = [...filtered].sort((a, b) => {
                      let aVal, bVal;
                      
                      switch (sortConfig.key) {
                        case 'username':
                          aVal = (a.username || '').toLowerCase();
                          bVal = (b.username || '').toLowerCase();
                          break;
                        case 'name':
                          aVal = `${a.first_name || ''} ${a.middle_name || ''} ${a.last_name || ''}`.replace(/\s+/g,' ').trim().toLowerCase();
                          bVal = `${b.first_name || ''} ${b.middle_name || ''} ${b.last_name || ''}`.replace(/\s+/g,' ').trim().toLowerCase();
                          break;
                        case 'email':
                          aVal = (a.email || '').toLowerCase();
                          bVal = (b.email || '').toLowerCase();
                          break;
                        case 'role':
                          aVal = (a.user_type || '').toLowerCase();
                          bVal = (b.user_type || '').toLowerCase();
                          break;
                        case 'contact':
                          aVal = a.contact_number || '';
                          bVal = b.contact_number || '';
                          break;
                        case 'created':
                          aVal = new Date(a.created_at || '1970-01-01').getTime();
                          bVal = new Date(b.created_at || '1970-01-01').getTime();
                          break;
                        default:
                          return 0;
                      }
                      
                      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                      return 0;
                    });
                  }
                  
                  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                  const paged = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
                  
                  if (paged.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="py-12 text-center">
                          <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                            {query ? "No results found" : "No accounts available"}
                          </Typography>
                        </td>
                      </tr>
                    );
                  }
                  
                  return paged.map(({ id, username, email, user_type, first_name, middle_name, last_name, contact_number, sex_at_birth, created_at }, key) => {
                    const className = `py-3 px-6 ${key === paged.length - 1 ? "" : "border-b border-blue-gray-50"}`;
                    const isMaster = String(username).toLowerCase() === 'admin' || String(email).toLowerCase() === 'admin@cemetery.com';
                    return (
                      <tr key={id} className="hover:bg-blue-50 transition-colors">
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-semibold"
                          >
                            {username}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-normal"
                          >
                            {`${first_name || ''} ${middle_name || ''} ${last_name || ''}`.replace(/\s+/g,' ').trim()}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-normal"
                          >
                            {email}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Chip
                            variant="ghost"
                            color={getRoleColor(user_type)}
                            value={(user_type || '').replace('_', ' ')}
                            className="text-center font-medium w-fit"
                          />
                        </td>
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-normal"
                          >
                            {contact_number || ''}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-normal"
                          >
                            {new Date(created_at).toLocaleDateString()}
                          </Typography>
                        </td>
                        <td className={className}>
                          <div className="flex gap-2">
                            <Tooltip content="Edit User">
                              <IconButton 
                                variant="text" 
                                color="blue-gray"
                                onClick={() => openEditUser({ id, username, email, user_type, first_name, middle_name, last_name, contact_number, sex_at_birth })}
                              >
                                <PencilIcon className="h-4 w-4" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip content="Reset Password">
                              <IconButton 
                                variant="text" 
                                color="green"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(API_ENDPOINTS.RESET_PASSWORD, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
                                      body: JSON.stringify({ id })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      const newPassword = data.default_password;
                                      // Automatically copy password to clipboard
                                      try {
                                        await navigator.clipboard.writeText(newPassword);
                                      } catch (clipboardError) {
                                        // Clipboard copy failed, but continue anyway
                                      }
                                      alert(`Password reset successful!\n\nNew password: ${newPassword}`);
                                    } else {
                                      alert(data.message || 'Failed to reset password');
                                    }
                                  } catch (e) {
                                    alert('Error resetting password');
                                  }
                                }}
                              >
                                <span className="h-4 w-4">RP</span>
                              </IconButton>
                            </Tooltip>
                            <Tooltip content={isMaster ? "Master admin cannot be deleted" : "Delete User"}>
                              <span>
                                <IconButton 
                                  variant="text" 
                                  color="red"
                                  onClick={() => openDeleteUser({ id, username, email, user_type })}
                                  disabled={isMaster}
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-center md:justify-between gap-4 mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outlined"
            color="blue-gray"
            size="sm"
            className="flex items-center justify-center"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            &lt;
          </Button>
          <Button
            variant="filled"
            color="blue"
            size="sm"
            className="flex items-center justify-center"
          >
            {page}
          </Button>
          {(() => {
            const norm=(v)=>String(v||'').toLowerCase();
            const base = users.filter(u => (currentUser?.user_type === 'staff' ? (u.user_type || '').toLowerCase() === 'customer' : true));
            const queryLower = query.toLowerCase();
            const filtered=base.filter(u=>{
              const dateStr = new Date(u.created_at || '').toLocaleDateString().toLowerCase();
              return norm(u.username).includes(queryLower)||norm(`${u.first_name || ''} ${u.middle_name || ''} ${u.last_name || ''}`.replace(/\s+/g,' ').trim()).includes(queryLower)||norm(u.email).includes(queryLower)||norm(u.user_type).includes(queryLower)||dateStr.includes(queryLower);
            });
            const totalPages=Math.max(1, Math.ceil(filtered.length / pageSize));
            return totalPages > page;
          })() && (
            <Button
              variant="outlined"
              color="blue-gray"
              size="sm"
              className="flex items-center justify-center"
              onClick={() => setPage(p => Math.min((() => {
                const norm=(v)=>String(v||'').toLowerCase();
                const base = users.filter(u => (currentUser?.user_type === 'staff' ? (u.user_type || '').toLowerCase() === 'customer' : true));
                const filtered=base.filter(u=>norm(u.username).includes(query.toLowerCase())||norm(`${u.first_name || ''} ${u.middle_name || ''} ${u.last_name || ''}`.replace(/\s+/g,' ').trim()).includes(query.toLowerCase())||norm(u.email).includes(query.toLowerCase())||norm(u.user_type).includes(query.toLowerCase()));
                return Math.max(1, Math.ceil(filtered.length / pageSize));
              })(), p + 1))}
            >
              {page + 1}
            </Button>
          )}
          <Button
            variant="outlined"
            color="blue-gray"
            size="sm"
            className="flex items-center justify-center"
            disabled={page >= (() => {
              const norm=(v)=>String(v||'').toLowerCase();
              const base = users.filter(u => (currentUser?.user_type === 'staff' ? (u.user_type || '').toLowerCase() === 'customer' : true));
              const filtered=base.filter(u=>norm(u.username).includes(query.toLowerCase())||norm(`${u.first_name || ''} ${u.middle_name || ''} ${u.last_name || ''}`.replace(/\s+/g,' ').trim()).includes(query.toLowerCase())||norm(u.email).includes(query.toLowerCase())||norm(u.user_type).includes(query.toLowerCase()));
              return Math.max(1, Math.ceil(filtered.length / pageSize));
            })()}
            onClick={() => setPage(p => Math.min((() => {
              const norm=(v)=>String(v||'').toLowerCase();
              const base = users.filter(u => (currentUser?.user_type === 'staff' ? (u.user_type || '').toLowerCase() === 'customer' : true));
              const filtered=base.filter(u=>norm(u.username).includes(query.toLowerCase())||norm(`${u.first_name || ''} ${u.middle_name || ''} ${u.last_name || ''}`.replace(/\s+/g,' ').trim()).includes(query.toLowerCase())||norm(u.email).includes(query.toLowerCase())||norm(u.user_type).includes(query.toLowerCase()));
              return Math.max(1, Math.ceil(filtered.length / pageSize));
            })(), p + 1))}
          >
            &gt;
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Typography variant="small" color="blue-gray" className="font-normal whitespace-nowrap">
            Page {page} of {(() => { 
              const norm=(v)=>String(v||'').toLowerCase();
              const base = users.filter(u => (currentUser?.user_type === 'staff' ? (u.user_type || '').toLowerCase() === 'customer' : true));
              const filtered=base.filter(u=>norm(u.username).includes(query.toLowerCase())||norm(`${u.first_name || ''} ${u.middle_name || ''} ${u.last_name || ''}`.replace(/\s+/g,' ').trim()).includes(query.toLowerCase())||norm(u.email).includes(query.toLowerCase())||norm(u.user_type).includes(query.toLowerCase()));
              return Math.max(1, Math.ceil(filtered.length / pageSize)); 
            })()}
          </Typography>
          <div className="flex items-center gap-2">
            <Typography variant="small" color="blue-gray" className="font-normal">
              Rows per page:
            </Typography>
            <Select
              label="Rows"
              value={String(pageSize)}
              onChange={(v) => { const n = Number(v); setPageSize(n); localStorage.setItem('account_page_size', String(n)); setPage(1); }}
              containerProps={{ className: "min-w-[90px]" }}
            >
              {[5,10,20,50].map(n => <Option key={n} value={String(n)}>{n}</Option>)}
            </Select>
          </div>
        </div>
      </div>


      {/* Add User Dialog */}
      <Dialog
        open={isAddUserOpen}
        handler={() => {}}
        size="lg"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
      >
        <DialogHeader>
          {addStep === 1 ? 'Add New User' : 'Customer Details'}
        </DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          {addStep === 1 && (
            <div className="space-y-6">
              {/* Auto-generated Credentials Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <Typography variant="small" className="font-semibold text-blue-900 mb-1">
                      Auto-Generated Credentials
                  </Typography>
                    <Typography variant="small" className="text-blue-700">
                      Username will be auto-generated using the last name plus 5 random numbers, e.g.{" "}
                      <span className="font-mono font-semibold">BARIRING00301</span>.
                    </Typography>
                    <Typography variant="small" className="text-blue-700 mt-1">
                      Password will also be auto-generated and displayed after account creation.
                    </Typography>
              </div>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input 
                  label="Email (optional)" 
                  type="email" 
                  value={userForm.email} 
                  onChange={(e) => handleUserFormChange('email', e.target.value)} 
                  error={!!validationErrors.email}
                  className={validationErrors.email ? 'border-red-500' : ''}
                />
                {validationErrors.email && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.email}
                  </Typography>
                )}
              </div>
              <div>
                <Input 
                  label="First Name (required)" 
                  value={userForm.first_name} 
                  onChange={(e) => handleUserFormChange('first_name', e.target.value)} 
                  required 
                  error={!!validationErrors.first_name}
                  className={validationErrors.first_name ? 'border-red-500' : ''}
                />
                {validationErrors.first_name && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.first_name}
                  </Typography>
                )}
              </div>
              <div>
                <Input 
                  label="Middle Name (optional)" 
                  value={userForm.middle_name} 
                  onChange={(e) => handleUserFormChange('middle_name', e.target.value)} 
                  disabled={!userForm.first_name || userForm.first_name.trim() === ''}
                />
              </div>
              <div>
                <Input 
                  label="Last Name (required)" 
                  value={userForm.last_name} 
                  onChange={(e) => handleUserFormChange('last_name', e.target.value)} 
                  required 
                  disabled={!userForm.first_name || userForm.first_name.trim() === ''}
                  error={!!validationErrors.last_name}
                  className={validationErrors.last_name ? 'border-red-500' : ''}
                />
                {validationErrors.last_name && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.last_name}
                  </Typography>
                )}
              </div>
              <div>
                <Input 
                  label="Contact Number (+639XXXXXXXXX)" 
                  value={userForm.contact_number} 
                  onChange={(e) => handleContactChange(e.target.value)} 
                  required={userForm.last_name && userForm.last_name.trim() !== ''}
                  disabled={!userForm.last_name || userForm.last_name.trim() === ''}
                  error={!!validationErrors.contact_number}
                  className={validationErrors.contact_number ? 'border-red-500' : ''}
                />
                {validationErrors.contact_number && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.contact_number}
                  </Typography>
                )}
              </div>
              <div>
                <Select 
                  label="Gender" 
                  value={userForm.sex_at_birth || ''} 
                  onChange={(value) => handleUserFormChange('sex_at_birth', value)}
                  required={userForm.contact_number && userForm.contact_number !== '+639' && userForm.contact_number.trim() !== '' && isValidPhNumber(userForm.contact_number)}
                  disabled={!userForm.contact_number || userForm.contact_number === '+639' || userForm.contact_number.trim() === '' || !isValidPhNumber(userForm.contact_number)}
                  error={!!validationErrors.sex_at_birth}
                >
                <Option value="male">Male</Option>
                <Option value="female">Female</Option>
              </Select>
                {validationErrors.sex_at_birth && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.sex_at_birth}
                  </Typography>
                )}
              </div>
              {(() => {
                const roleOptions = (currentUser?.user_type === 'admin')
                  ? [
                      { value: 'admin', label: 'Admin' },
                      { value: 'staff', label: 'Staff' },
                      { value: 'cashier', label: 'Cashier' },
                      { value: 'customer', label: 'Customer' },
                    ]
                  : [ { value: 'customer', label: 'Customer' } ];
                const selected = userForm.role || '';
                const isRoleDisabled = !userForm.sex_at_birth || userForm.sex_at_birth.trim() === '';
                const isRoleRequired = !isRoleDisabled;
                return (
                  <div>
                    <Select 
                      label="Role" 
                      value={selected} 
                      onChange={(value) => handleUserFormChange('role', value)}
                      required={isRoleRequired}
                      disabled={isRoleDisabled}
                      error={!!validationErrors.role}
                    >
                    {roleOptions.map(opt => (
                      <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                    ))}
                  </Select>
                    {validationErrors.role && (
                      <Typography variant="small" color="red" className="mt-1">
                        {validationErrors.role}
                      </Typography>
                    )}
                  </div>
                );
              })()}
            </div>
            </div>
          )}
          {addStep === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input 
                  label="Street Address (required)" 
                  value={customerForm.street_address} 
                  onChange={e => {
                    const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                    setCustomerForm(prev => ({ ...prev, street_address: filtered }));
                  }} 
                  required 
                  error={!!validationErrors.street_address}
                  className={validationErrors.street_address ? 'border-red-500' : ''}
                />
                {validationErrors.street_address && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.street_address}
                  </Typography>
                )}
              </div>
              <div>
                <Select 
                  label="Province (required)" 
                  value={customerForm.province || ''} 
                  onChange={(value) => {
                    setCustomerForm(prev => ({ ...prev, province: value }));
                    setProvinceFilter('');
                  }} 
                  required 
                  error={!!validationErrors.province}
                  onKeyDown={(e) => {
                    const key = e.key.toUpperCase();
                    if (key >= 'A' && key <= 'Z') {
                      setProvinceFilter(key);
                      const filtered = PHILIPPINE_PROVINCES.filter(p => p.toUpperCase().startsWith(key));
                      if (filtered.length > 0) {
                        setCustomerForm(prev => ({ ...prev, province: filtered[0] }));
                      }
                    }
                  }}
                >
                  {(provinceFilter ? PHILIPPINE_PROVINCES.filter(p => p.toUpperCase().startsWith(provinceFilter)) : PHILIPPINE_PROVINCES).map(province => (
                    <Option key={province} value={province}>{province}</Option>
                  ))}
                </Select>
                {validationErrors.province && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.province}
                  </Typography>
                )}
              </div>
              <div>
                <Select 
                  label="City (required)" 
                  value={customerForm.city || ''} 
                  onChange={(value) => {
                    setCustomerForm(prev => ({ ...prev, city: value }));
                    setCityFilter('');
                  }} 
                  required 
                  error={!!validationErrors.city}
                  onKeyDown={(e) => {
                    const key = e.key.toUpperCase();
                    if (key >= 'A' && key <= 'Z') {
                      setCityFilter(key);
                      const filtered = PHILIPPINE_CITIES.filter(c => c.toUpperCase().startsWith(key));
                      if (filtered.length > 0) {
                        setCustomerForm(prev => ({ ...prev, city: filtered[0] }));
                      }
                    }
                  }}
                >
                  {(cityFilter ? PHILIPPINE_CITIES.filter(c => c.toUpperCase().startsWith(cityFilter)) : PHILIPPINE_CITIES).map(city => (
                    <Option key={city} value={city}>{city}</Option>
                  ))}
                </Select>
                {validationErrors.city && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.city}
                  </Typography>
                )}
              </div>
              <div>
                <Input 
                  label="Postal Code (required)" 
                  value={customerForm.postal_code} 
                  onChange={e => {
                    const filtered = e.target.value.replace(/[^0-9]/g, '');
                    setCustomerForm(prev => ({ ...prev, postal_code: filtered }));
                  }} 
                  required 
                  error={!!validationErrors.postal_code}
                  className={validationErrors.postal_code ? 'border-red-500' : ''}
                />
                {validationErrors.postal_code && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.postal_code}
                  </Typography>
                )}
              </div>
              <Input label="Country" value={customerForm.country} onChange={e => {
                const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                setCustomerForm(prev => ({ ...prev, country: filtered }));
              }} />
              <div>
                <Input 
                  label="Emergency Contact Name (required)" 
                  value={customerForm.emergency_contact_name} 
                  onChange={e => setCustomerForm(prev => ({ ...prev, emergency_contact_name: sanitizeName(e.target.value) }))} 
                  required 
                  error={!!validationErrors.emergency_contact_name}
                  className={validationErrors.emergency_contact_name ? 'border-red-500' : ''}
                />
                {validationErrors.emergency_contact_name && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.emergency_contact_name}
                  </Typography>
                )}
              </div>
              <div>
                <Input 
                  label="Emergency Contact Phone (+639XXXXXXXXX) (required)" 
                  value={customerForm.emergency_contact_phone} 
                  onChange={e => setCustomerForm(prev => ({ ...prev, emergency_contact_phone: formatContact(e.target.value) }))} 
                  required 
                  error={!!validationErrors.emergency_contact_phone}
                  className={validationErrors.emergency_contact_phone ? 'border-red-500' : ''}
                />
                {validationErrors.emergency_contact_phone && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.emergency_contact_phone}
                  </Typography>
                )}
              </div>
              <div>
                <Input 
                  label="Emergency Contact Relationship (required)" 
                  value={customerForm.emergency_contact_relationship} 
                  onChange={e => {
                    const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                    setCustomerForm(prev => ({ ...prev, emergency_contact_relationship: filtered }));
                  }} 
                  required 
                  error={!!validationErrors.emergency_contact_relationship}
                  className={validationErrors.emergency_contact_relationship ? 'border-red-500' : ''}
                />
                {validationErrors.emergency_contact_relationship && (
                  <Typography variant="small" color="red" className="mt-1">
                    {validationErrors.emergency_contact_relationship}
                  </Typography>
                )}
              </div>
              <Input label="Occupation (optional)" value={customerForm.occupation} onChange={e => {
                const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                setCustomerForm(prev => ({ ...prev, occupation: filtered }));
              }} />
              <Input label="Employer (optional)" value={customerForm.employer} onChange={e => {
                const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                setCustomerForm(prev => ({ ...prev, employer: filtered }));
              }} />
              <Input label="Monthly Income (optional)" type="number" value={customerForm.monthly_income} onChange={e => setCustomerForm(prev => ({ ...prev, monthly_income: e.target.value }))} />
              <Select label="Source of Funds (optional)" value={customerForm.source_of_funds || ''} onChange={(value) => setCustomerForm(prev => ({ ...prev, source_of_funds: value }))}>
                <Option value="salary">Salary</Option>
                <Option value="business">Business</Option>
                <Option value="investment">Investment</Option>
                <Option value="inheritance">Inheritance</Option>
                <Option value="other">Other</Option>
              </Select>
              <Input label="Notes (optional)" value={customerForm.notes} onChange={e => {
                const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                setCustomerForm(prev => ({ ...prev, notes: filtered }));
              }} />
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={addStep === 1 ? closeAddUser : () => setAddStep(1)}>
            {addStep === 1 ? 'Cancel' : 'Back'}
          </Button>
          {(userForm.role || '').toLowerCase() === 'customer' ? (
            addStep === 1 ? (
              <Button onClick={() => {
                // Validate step 1 before proceeding
                if (validateForm()) {
                  setAddStep(2);
                }
              }}>
                Next
              </Button>
            ) : (
              <Button onClick={() => {
                // Validate customer details before creating
                if (validateCustomerDetails()) {
                  addUser();
                }
              }}>
                Create Customer
              </Button>
            )
          ) : (
            <Button onClick={addUser}>
              Add User
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editingUser !== null} handler={closeEditUser} size="lg">
        <DialogHeader>{editStep === 1 ? 'Edit User' : 'Customer Details'}</DialogHeader>
        <DialogBody>
          {editStep === 1 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Typography variant="small" color="blue-gray" className="opacity-70 mb-2">
                Username: {editingUser?.username || 'N/A'}
              </Typography>
            </div>
            <Input
              label="Email (optional)"
              type="email"
              value={userForm.email}
              onChange={(e) => handleUserFormChange('email', e.target.value)}
            />
            <Input
              label="First Name"
              required
              value={userForm.first_name}
              onChange={(e) => handleUserFormChange('first_name', e.target.value)}
            />
            <Input
              label="Middle Name (optional)"
              value={userForm.middle_name}
              onChange={(e) => handleUserFormChange('middle_name', e.target.value)}
              disabled={!userForm.first_name || userForm.first_name.trim() === ''}
            />
            <Input
              label="Last Name"
              required
              value={userForm.last_name}
              onChange={(e) => handleUserFormChange('last_name', e.target.value)}
              disabled={!userForm.first_name || userForm.first_name.trim() === ''}
            />
            <Input
              label="Contact Number"
              required
              value={userForm.contact_number}
              onChange={(e) => handleContactChange(e.target.value)}
              disabled={!userForm.last_name || userForm.last_name.trim() === ''}
            />
            <Select 
              label="Gender" 
              value={userForm.sex_at_birth || ''} 
              onChange={(value) => handleUserFormChange('sex_at_birth', value)}
              disabled={!userForm.contact_number || userForm.contact_number === '+639' || userForm.contact_number.trim() === '' || !isValidPhNumber(userForm.contact_number)}
            >
              <Option value="male">Male</Option>
              <Option value="female">Female</Option>
            </Select>
            {(() => {
              const roleOptions = (currentUser?.user_type === 'admin')
                ? [
                    { value: 'admin', label: 'Admin' },
                    { value: 'staff', label: 'Staff' },
                    { value: 'cashier', label: 'Cashier' },
                    { value: 'customer', label: 'Customer' },
                  ]
                : [ { value: 'customer', label: 'Customer' } ];
              const selected = userForm.role || '';
              const isRoleDisabled = !userForm.sex_at_birth || userForm.sex_at_birth.trim() === '';
              return (
                <div>
                  <Select 
                    label="Role" 
                    value={selected} 
                    onChange={(value) => handleUserFormChange('role', value)}
                    disabled={isRoleDisabled}
                  >
                    {roleOptions.map(opt => (
                      <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                    ))}
                  </Select>
                </div>
              );
            })()}
            {/* Password cannot be edited here. Use Reset Password action instead. */}
          </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input 
                label="Street Address (required)" 
                value={customerForm.street_address} 
                onChange={e => {
                  const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                  setCustomerForm(prev => ({ ...prev, street_address: filtered }));
                }} 
                required 
                error={!!validationErrors.street_address}
                className={validationErrors.street_address ? 'border-red-500' : ''}
              />
              {validationErrors.street_address && (
                <Typography variant="small" color="red" className="mt-1">
                  {validationErrors.street_address}
                </Typography>
              )}
            </div>
            <div>
              <Select 
                label="Province (required)" 
                value={customerForm.province || ''} 
                onChange={(value) => {
                  setCustomerForm(prev => ({ ...prev, province: value }));
                  setProvinceFilter('');
                }} 
                required 
                error={!!validationErrors.province}
                onKeyDown={(e) => {
                  const key = e.key.toUpperCase();
                  if (key >= 'A' && key <= 'Z') {
                    setProvinceFilter(key);
                    const filtered = PHILIPPINE_PROVINCES.filter(p => p.toUpperCase().startsWith(key));
                    if (filtered.length > 0) {
                      setCustomerForm(prev => ({ ...prev, province: filtered[0] }));
                    }
                  }
                }}
              >
                {(provinceFilter ? PHILIPPINE_PROVINCES.filter(p => p.toUpperCase().startsWith(provinceFilter)) : PHILIPPINE_PROVINCES).map(province => (
                  <Option key={province} value={province}>{province}</Option>
                ))}
              </Select>
              {validationErrors.province && (
                <Typography variant="small" color="red" className="mt-1">
                  {validationErrors.province}
                </Typography>
              )}
            </div>
            <div>
              <Select 
                label="City (required)" 
                value={customerForm.city || ''} 
                onChange={(value) => {
                  setCustomerForm(prev => ({ ...prev, city: value }));
                  setCityFilter('');
                }} 
                required 
                error={!!validationErrors.city}
                onKeyDown={(e) => {
                  const key = e.key.toUpperCase();
                  if (key >= 'A' && key <= 'Z') {
                    setCityFilter(key);
                    const filtered = PHILIPPINE_CITIES.filter(c => c.toUpperCase().startsWith(key));
                    if (filtered.length > 0) {
                      setCustomerForm(prev => ({ ...prev, city: filtered[0] }));
                    }
                  }
                }}
              >
                {(cityFilter ? PHILIPPINE_CITIES.filter(c => c.toUpperCase().startsWith(cityFilter)) : PHILIPPINE_CITIES).map(city => (
                  <Option key={city} value={city}>{city}</Option>
                ))}
              </Select>
              {validationErrors.city && (
                <Typography variant="small" color="red" className="mt-1">
                  {validationErrors.city}
                </Typography>
              )}
            </div>
            <div>
              <Input 
                label="Postal Code (required)" 
                value={customerForm.postal_code} 
                onChange={e => {
                  const filtered = e.target.value.replace(/[^0-9]/g, '');
                  setCustomerForm(prev => ({ ...prev, postal_code: filtered }));
                }} 
                required 
                error={!!validationErrors.postal_code}
                className={validationErrors.postal_code ? 'border-red-500' : ''}
              />
              {validationErrors.postal_code && (
                <Typography variant="small" color="red" className="mt-1">
                  {validationErrors.postal_code}
                </Typography>
              )}
            </div>
            <Input label="Country" value={customerForm.country} onChange={e => {
              const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
              setCustomerForm(prev => ({ ...prev, country: filtered }));
            }} />
            <div>
              <Input 
                label="Emergency Contact Name (required)" 
                value={customerForm.emergency_contact_name} 
                onChange={e => setCustomerForm(prev => ({ ...prev, emergency_contact_name: sanitizeName(e.target.value) }))} 
                required 
                error={!!validationErrors.emergency_contact_name}
                className={validationErrors.emergency_contact_name ? 'border-red-500' : ''}
              />
              {validationErrors.emergency_contact_name && (
                <Typography variant="small" color="red" className="mt-1">
                  {validationErrors.emergency_contact_name}
                </Typography>
              )}
            </div>
            <div>
              <Input 
                label="Emergency Contact Phone (+639XXXXXXXXX) (required)" 
                value={customerForm.emergency_contact_phone} 
                onChange={e => setCustomerForm(prev => ({ ...prev, emergency_contact_phone: e.target.value }))} 
                required 
                error={!!validationErrors.emergency_contact_phone}
                className={validationErrors.emergency_contact_phone ? 'border-red-500' : ''}
              />
              {validationErrors.emergency_contact_phone && (
                <Typography variant="small" color="red" className="mt-1">
                  {validationErrors.emergency_contact_phone}
                </Typography>
              )}
            </div>
            <div>
              <Input 
                label="Emergency Contact Relationship (required)" 
                value={customerForm.emergency_contact_relationship} 
                onChange={e => {
                  const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                  setCustomerForm(prev => ({ ...prev, emergency_contact_relationship: filtered }));
                }} 
                required 
                error={!!validationErrors.emergency_contact_relationship}
                className={validationErrors.emergency_contact_relationship ? 'border-red-500' : ''}
              />
              {validationErrors.emergency_contact_relationship && (
                <Typography variant="small" color="red" className="mt-1">
                  {validationErrors.emergency_contact_relationship}
                </Typography>
              )}
            </div>
            <Input label="Occupation (optional)" value={customerForm.occupation} onChange={e => {
              const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
              setCustomerForm(prev => ({ ...prev, occupation: filtered }));
            }} />
            <Input label="Employer (optional)" value={customerForm.employer} onChange={e => {
              const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
              setCustomerForm(prev => ({ ...prev, employer: filtered }));
            }} />
            <Input label="Monthly Income (optional)" type="number" value={customerForm.monthly_income} onChange={e => setCustomerForm(prev => ({ ...prev, monthly_income: e.target.value }))} />
            <Select label="Source of Funds (optional)" value={customerForm.source_of_funds || ''} onChange={(value) => setCustomerForm(prev => ({ ...prev, source_of_funds: value }))}>
              <Option value="salary">Salary</Option>
              <Option value="business">Business</Option>
              <Option value="investment">Investment</Option>
              <Option value="inheritance">Inheritance</Option>
              <Option value="other">Other</Option>
            </Select>
            <Input label="Notes (optional)" value={customerForm.notes} onChange={e => {
              const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
              setCustomerForm(prev => ({ ...prev, notes: filtered }));
            }} />
          </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={editStep === 1 ? closeEditUser : () => setEditStep(1)}>
            {editStep === 1 ? 'Cancel' : 'Back'}
          </Button>
          {((userForm.role || '').toLowerCase() === 'customer') ? (
            editStep === 1 ? (
              <Button onClick={() => setEditStep(2)}>Next</Button>
            ) : (
              <Button onClick={saveUser}>Save Changes</Button>
            )
          ) : (
            <Button onClick={saveUser}>Save Changes</Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} handler={closeDeleteUser} size="sm">
        <DialogHeader>Delete User Account</DialogHeader>
        <DialogBody>
          <Typography variant="small" color="blue-gray" className="font-normal">
            Are you sure you want to delete the user account for{" "}
            <strong>{userToDelete?.username}</strong> ({userToDelete?.email})?
            This action cannot be undone.
          </Typography>
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={closeDeleteUser}>
            Cancel
          </Button>
          <Button color="red" onClick={deleteUser}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Import Users Dialog */}
      <Dialog open={isImportDialogOpen} handler={() => setIsImportDialogOpen(false)} size="md">
        <DialogHeader>Import from Excel</DialogHeader>
        <DialogBody>
          <Typography variant="small" color="blue-gray" className="mb-4">
            Upload an Excel file (.xlsx or .xls). The system will automatically import any accounts
            and/or deceased records that match the supported templates.
          </Typography>

          <Typography variant="small" color="blue-gray" className="mb-4 font-semibold">
            File
          </Typography>
          <div className="mt-4">
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              label="Select Excel File"
            />
          </div>
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={() => {
            setIsImportDialogOpen(false);
            setImportFile(null);
          }}>
            Cancel
          </Button>
          <Button 
            color="green" 
            onClick={handleImportUsers}
            disabled={!importFile || importing}
          >
            {importing ? 'Importing...' : 'Start Import'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Toast Notification */}
      {toast.show && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setToast({ show: false, message: '', type: 'error' })}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Alert
              color={
                toast.type === 'error' ? 'red' : 
                toast.type === 'warning' ? 'amber' : 
                'green'
              }
              className="max-w-md text-sm shadow-2xl"
            >
              <div className="whitespace-pre-line">{toast.message}</div>
            </Alert>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountManagement; 