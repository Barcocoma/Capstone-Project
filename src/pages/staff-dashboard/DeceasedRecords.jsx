import React, { useState, useEffect, useRef } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Input,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Select,
  Option,
  Alert,
} from "@material-tailwind/react";
import { MagnifyingGlassIcon, PlusCircleIcon, PencilIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { API_ENDPOINTS } from "@/configs/api";
import { sanitizeName } from "@/utils/nameValidation";
import { useAuth } from "@/context/AuthContext";

// Helper function to convert string to title case (first letter of each word capitalized)
const toTitleCase = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str.toLowerCase().split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

const defaultForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  name: "",
  date_of_birth: "",
  date_of_death: "",
  burial_date: "",
  customer_id: "",
  lot_id: "",
  status: "BURIED",
  cause_of_death: "",
  funeral_home: "",
  notes: "",
};

const DropdownField = ({
  label = "",
  value = "",
  options = [],
  onSelect,
  error = false,
  disabled = false,
  placeholder = "",
  emptyMessage = "No options available",
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [menuStyles, setMenuStyles] = useState({});

  useEffect(() => {
    if (!open) return;
    const handleClick = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setFilter('');
  }, [value, disabled]);

  useEffect(() => {
    if (!open) {
      setFilter('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    const updatePosition = () => {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = typeof window !== "undefined" ? window.innerHeight || 0 : 0;
      const viewportWidth = typeof window !== "undefined" ? window.innerWidth || 0 : 0;
      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const MIN_HEIGHT = 150;
      const MAX_HEIGHT = 320;

      const clampHeight = (space) => Math.max(MIN_HEIGHT, Math.min(space - 8, MAX_HEIGHT));

      let placement = "bottom";
      let availableSpace = spaceBelow;
      if (spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow) {
        placement = "top";
        availableSpace = spaceAbove;
      } else if (spaceBelow < MIN_HEIGHT && spaceAbove < MIN_HEIGHT) {
        placement = spaceBelow >= spaceAbove ? "bottom" : "top";
        availableSpace = placement === "bottom" ? spaceBelow : spaceAbove;
      }
      const maxHeight = clampHeight(availableSpace || MAX_HEIGHT);
      const top =
        placement === "bottom"
          ? Math.min(rect.bottom + 8, viewportHeight - 8)
          : Math.max(8, rect.top - 8 - maxHeight);
      const left = Math.max(8, Math.min(rect.left, viewportWidth - rect.width - 8));

      setMenuStyles({
        position: "fixed",
        top,
        left,
        width: rect.width,
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const normalized = options.map((opt) =>
    typeof opt === "object"
      ? { value: String(opt.value), label: opt.label ?? String(opt.value), description: opt.description }
      : { value: String(opt), label: String(opt) }
  );

  const filteredOptions = filter ? normalized.filter((opt) => {
    const labelUpper = opt.label.toUpperCase();
    const filterUpper = filter.toUpperCase();
    return labelUpper.startsWith(filterUpper) || labelUpper.includes(filterUpper);
  }) : normalized;

  const selected = normalized.find((opt) => String(opt.value) === String(value));

  return (
    <div className="relative" ref={containerRef}>
      <Input
        label={label}
        value={selected ? selected.label : ""}
        placeholder={placeholder}
        readOnly
        error={error}
        inputRef={inputRef}
        disabled={disabled}
        size="md"
        containerProps={{ className: "text-sm" }}
        labelProps={{ className: "text-xs" }}
        className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} select-none text-sm`}
        onClick={() => {
          if (disabled) return;
          inputRef.current?.focus();
          setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (disabled || !open) return;
          const key = e.key;
          if (key.length === 1 && /[A-Za-z0-9\s]/.test(key)) {
            const newFilter = filter + key;
            setFilter(newFilter);
            const filtered = normalized.filter((opt) => {
              const labelUpper = opt.label.toUpperCase();
              const filterUpper = newFilter.toUpperCase();
              return labelUpper.startsWith(filterUpper) || labelUpper.includes(filterUpper);
            });
            if (filtered.length > 0) {
              onSelect(String(filtered[0].value));
            }
          } else if (key === 'Backspace') {
            setFilter(filter.slice(0, -1));
          } else if (key === 'Escape') {
            setOpen(false);
            setFilter('');
          }
        }}
      />
      <ChevronDownIcon
        className={`h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-blue-gray-400 pointer-events-none transition-transform ${
          open ? "rotate-180" : ""
        }`}
      />
      {open && (
        <div
          className="fixed z-[1000] max-h-48 overflow-y-auto rounded-lg border border-blue-gray-100 bg-white shadow-xl text-sm"
          style={menuStyles}
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-blue-gray-400">{emptyMessage}</div>
          ) : (
            filteredOptions.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => {
                  onSelect(String(opt.value));
                  setOpen(false);
                  setFilter('');
                }}
                className={`w-full px-3 py-2 text-left hover:bg-blue-50 transition ${
                  String(opt.value) === String(value) ? "bg-blue-50 text-blue-700 font-semibold" : "text-blue-gray-700"
                }`}
              >
                <span>{opt.label}</span>
                {opt.description && (
                  <span className="block text-[11px] text-blue-gray-500">{opt.description}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const DeceasedRecords = () => {
  const { user: currentUser } = useAuth();
  const [deceasedRecords, setDeceasedRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('deceased_page_size');
    return saved ? Number(saved) : 5;
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [customers, setCustomers] = useState([]);
  const [customerLots, setCustomerLots] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [addStep, setAddStep] = useState(1);
  const [lotVault, setLotVault] = useState({ option: '', availableOptions: [], allowedSwitchTargets: [], locked: false });
  const [vaultSelection, setVaultSelection] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  // Interment type and tier selection removed from UI; tier is auto-determined by backend stacking rules

  // Toast functions
  const showToast = (message, type = 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'error' });
    }, 5000);
  };

  const getVaultDescription = (opt) => {
    switch ((opt || '').toLowerCase()) {
      case 'option1':
        return 'Double-tier: 1 body per tier (Lower & Upper) + up to 4 total bone riders.';
      case 'option2':
        return 'Double-tier: Lower has 1 body vault; Upper has up to 5 bone slots.';
      case 'option3':
        return 'Double-tier: Bones only; up to 3 bones in Lower and 3 bones in Upper.';
      default:
        return '';
    }
  };

  const getVaultAvailability = (opt, v) => {
    const lb = v?.lower_body ? 1 : 0;
    const ub = v?.upper_body ? 1 : 0;
    const lbn = Number(v?.lower_bone || 0);
    const ubn = Number(v?.upper_bone || 0);
    switch ((opt || '').toLowerCase()) {
      case 'option1':
        return `Lower body ${lb}/1, Upper body ${ub}/1, Bones ${lbn + ubn}/4`;
      case 'option2':
        return `Lower body ${lb}/1, Upper bones ${ubn}/5`;
      case 'option3':
        return `Lower bones ${lbn}/3, Upper bones ${ubn}/3`;
      default:
        return 'No vault selected yet';
    }
  };

  // Filter customers based on search
  useEffect(() => {
    if (customerSearch.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      const filtered = customers.filter(customer => {
        const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.toLowerCase();
        const username = (customer.username || '').toLowerCase();
        const search = customerSearch.toLowerCase();
        return fullName.includes(search) || username.includes(search);
      });
      setFilteredCustomers(filtered);
    }
  }, [customers, customerSearch]);

  const fetchDeceasedRecords = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.GET_DECEASED_RECORDS);
      const data = await response.json();
      if (data.success) {
        setDeceasedRecords(data.deceased_records);
      } else {
        console.error('Failed to fetch deceased records:', data.message);
      }
    } catch (error) {
      console.error('Error fetching deceased records:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.GET_CUSTOMER_USERS);
        const data = await res.json();
        setCustomers(data.customers || []);
      } catch (_) {}
    };

    fetchDeceasedRecords();
    fetchCustomers();
  }, []);

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const norm = (v) => String(v || '').toLowerCase();
  let filtered = deceasedRecords.filter(d =>
    norm(d.name).includes(query.toLowerCase()) ||
    norm(d.lot_label).includes(query.toLowerCase()) ||
    norm(d.status).includes(query.toLowerCase())
  );
  
  // Apply sorting
  if (sortConfig.key) {
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortConfig.key) {
        case 'name':
          aVal = (a.name || '').toLowerCase();
          bVal = (b.name || '').toLowerCase();
          break;
        case 'date_of_birth':
          aVal = new Date(a.date_of_birth || '1970-01-01').getTime();
          bVal = new Date(b.date_of_birth || '1970-01-01').getTime();
          break;
        case 'date_of_death':
          aVal = new Date(a.date_of_death || '1970-01-01').getTime();
          bVal = new Date(b.date_of_death || '1970-01-01').getTime();
          break;
        case 'burial_date':
          aVal = new Date(a.burial_date || '1970-01-01').getTime();
          bVal = new Date(b.burial_date || '1970-01-01').getTime();
          break;
        case 'location':
          aVal = (a.lot_label || '').toLowerCase();
          bVal = (b.lot_label || '').toLowerCase();
          break;
        case 'status':
          aVal = (a.status || '').toLowerCase();
          bVal = (b.status || '').toLowerCase();
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

  const openAddDialog = () => {
    setForm(defaultForm);
    setCustomerLots([]);
    setAddStep(1);
    setLotVault({ option: '', availableOptions: [], allowedSwitchTargets: [] });
    setVaultSelection('');
    setCustomerSearch('');
    setIsAddDialogOpen(true);
  };
  
  const closeAddDialog = () => {
    setFieldErrors({});
    setTouchedFields({});
    setIsAddDialogOpen(false);
  };

  const openEditDialog = async (record) => {
    setEditingRecord(record);
    // Split name into first/middle/last (best-effort)
    const parts = String(record.name || '').trim().split(/\s+/);
    const first_name = parts[0] || '';
    const last_name = parts.length > 1 ? parts[parts.length - 1] : '';
    const middle_name = parts.length > 2 ? parts.slice(1, parts.length - 1).join(' ') : '';
    setForm({
      ...defaultForm,
      first_name,
      middle_name,
      last_name,
      date_of_birth: record.date_of_birth || '',
      date_of_death: record.date_of_death || '',
      burial_date: record.burial_date || '',
      customer_id: String(record.customer_id || ''),
      lot_id: String(record.lot_id || ''),
      status: record.status || 'BURIED',
      cause_of_death: record.cause_of_death || '',
      funeral_home: record.funeral_home || '',
      contact_person: record.contact_person || '',
      contact_phone: record.contact_phone || '',
      notes: record.notes || '',
    });
    try {
      const res = await fetch(`${API_ENDPOINTS.GET_OWNERSHIPS}`);
      const data = await res.json();
      if (data.success) {
        const myLots = (data.ownerships || []).filter(o => String(o.customerId) === String(record.customer_id || ''));
        const mapped = myLots.map(o => ({ id: o.id, label: `${o.garden} / Sector ${o.sector} / Block ${o.block} / Lot ${o.lotNumber}` }));
        setCustomerLots(mapped);
      } else {
        setCustomerLots([]);
      }
    } catch (_) {
      setCustomerLots([]);
    }
    setIsEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditingRecord(null);
    setForm(defaultForm);
    setIsEditDialogOpen(false);
  };

  const openDeleteDialog = (record) => {
    setRecordToDelete(record);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setRecordToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const handleAddRecord = async () => {
    // Validate required fields
    const errors = {};
    const missingFields = [];
    const today = new Date().toISOString().split('T')[0];
    
    if (!form.customer_id) {
      errors.customer_id = 'Customer is required';
      missingFields.push('Customer');
    }
    if (!form.lot_id) {
      errors.lot_id = 'Owned lot is required';
      missingFields.push('Owned Lot');
    }
    if (!String(form.first_name || '').trim()) {
      errors.first_name = 'First name is required';
      missingFields.push('First Name');
    }
    if (!String(form.last_name || '').trim()) {
      errors.last_name = 'Last name is required';
      missingFields.push('Last Name');
    }
    if (!form.date_of_birth) {
      errors.date_of_birth = 'Date of birth is required';
      missingFields.push('Date of Birth');
    } else if (form.date_of_birth > today) {
      errors.date_of_birth = 'Date of birth cannot be in the future';
      missingFields.push('Valid Date of Birth');
    }
    if (!form.date_of_death) {
      errors.date_of_death = 'Date of death is required';
      missingFields.push('Date of Death');
    } else if (form.date_of_death > today) {
      errors.date_of_death = 'Date of death cannot be in the future';
      missingFields.push('Valid Date of Death');
    } else if (form.date_of_birth && form.date_of_death < form.date_of_birth) {
      errors.date_of_death = 'Date of death cannot be before date of birth';
      missingFields.push('Valid Date of Death');
    }
    if (!form.burial_date) {
      errors.burial_date = 'Burial date is required';
      missingFields.push('Burial Date');
    } else if (form.date_of_birth && form.burial_date < form.date_of_birth) {
      errors.burial_date = 'Burial date cannot be before date of birth';
      missingFields.push('Valid Burial Date');
    } else if (form.date_of_death && form.burial_date < form.date_of_death) {
      errors.burial_date = 'Burial date cannot be before date of death';
      missingFields.push('Valid Burial Date');
    }
    
    setFieldErrors(errors);
    setTouchedFields({
      customer_id: true,
      lot_id: true,
      first_name: true,
      last_name: true,
      date_of_birth: true,
      date_of_death: true,
      burial_date: true
    });
    
    if (missingFields.length > 0) {
      showToast(`Please fix the following: ${missingFields.join(', ')}`, 'error');
      return;
    }
    try {
      const payload = {
        first_name: toTitleCase(String(form.first_name || '').trim()),
        middle_name: toTitleCase(String(form.middle_name || '').trim()),
        last_name: toTitleCase(String(form.last_name || '').trim()),
        date_of_birth: form.date_of_birth || '',
        date_of_death: form.date_of_death || '',
        burial_date: form.burial_date || '',
        customer_id: form.customer_id,
        lot_id: form.lot_id,
        status: 'BURIED',
        cause_of_death: form.cause_of_death || '',
        funeral_home: form.funeral_home || '',
        notes: form.notes || '',
        vault_option: vaultSelection || lotVault.option || '',
        // interment_type defaults to body when not specified; user won't pick tier; server assigns by rule
        interment_type: 'body'
      };
      const response = await fetch(API_ENDPOINTS.CREATE_DECEASED_RECORD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser?.id?.toString() || '',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.success) {
        // refresh list
        try {
          const refreshResponse = await fetch(API_ENDPOINTS.GET_DECEASED_RECORDS);
          const refreshData = await refreshResponse.json();
          if (refreshData.success) {
            setDeceasedRecords(refreshData.deceased_records);
          }
        } catch (_) {}
        showToast('Deceased record created successfully!', 'success');
        closeAddDialog();
        setForm(defaultForm);
        setAddStep(1);
        setVaultSelection('');
        setPage(1);
        // Clear search query to prevent auto-search after adding record
        setQuery('');
      } else {
        console.error('Failed to create deceased record:', data.message);
        showToast('Failed to create deceased record: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Error creating deceased record:', error);
      showToast('Error creating deceased record: ' + error.message, 'error');
    }
  };

  const handleEditRecord = async () => {
    // Build payload merging split names
    const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ').trim() || form.name;
    const payload = {
      name: toTitleCase(fullName),
      date_of_birth: form.date_of_birth || '',
      date_of_death: form.date_of_death || '',
      burial_date: form.burial_date || '',
      customer_id: form.customer_id,
      lot_id: form.lot_id,
      status: 'BURIED',
      cause_of_death: form.cause_of_death || '',
      funeral_home: form.funeral_home || '',
      contact_person: form.contact_person || '',
      contact_phone: form.contact_phone || '',
      notes: form.notes || '',
    };
    try {
      const response = await fetch(`${API_ENDPOINTS.UPDATE_DECEASED_RECORD}?id=${editingRecord.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser?.id?.toString() || '',
        },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh the deceased records list
        const refreshResponse = await fetch(API_ENDPOINTS.GET_DECEASED_RECORDS);
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setDeceasedRecords(refreshData.deceased_records);
        }
        showToast('Deceased record updated successfully!', 'success');
        closeEditDialog();
      } else {
        console.error('Failed to update deceased record:', data.message);
        showToast('Failed to update deceased record: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Error updating deceased record:', error);
      showToast('Error updating deceased record: ' + error.message, 'error');
    }
  };

  const handleDeleteRecord = async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.DELETE_DECEASED_RECORD}?id=${recordToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'X-User-Id': currentUser?.id?.toString() || '',
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        setDeceasedRecords((prev) => prev.filter((record) => String(record.id) !== String(recordToDelete.id)));
        showToast('Deceased record deleted successfully!', 'success');
        closeDeleteDialog();
      } else {
        console.error('Failed to delete deceased record:', data.message);
        showToast('Failed to delete deceased record: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Error deleting deceased record:', error);
      showToast('Error deleting deceased record: ' + error.message, 'error');
    }
  };

  const handleCustomerChange = async (val) => {
    setForm(f => ({ ...f, customer_id: val, lot_id: "" }));
    try {
      const res = await fetch(`${API_ENDPOINTS.GET_OWNERSHIPS}`);
      const data = await res.json();
      if (data.success) {
        const myLots = (data.ownerships || []).filter(o => String(o.customerId) === String(val));
        // Map to {id,label} with vault summary appended (short)
        const mapped = myLots.map(o => ({ id: o.id, label: `${o.garden} / Sector ${o.sector} / Block ${o.block} / Lot ${o.lotNumber}${o.vaultSummary ? ` — ${o.vaultSummary}` : ''}` }));
        setCustomerLots(mapped);
      } else {
        setCustomerLots([]);
      }
    } catch (_) {
      setCustomerLots([]);
    }
  };

  const handleLotChange = async (val) => {
    setForm(f => ({ ...f, lot_id: val }));
    try {
      const res = await fetch(`${API_ENDPOINTS.GET_LOT_VAULT}?lot_id=${val}`);
      const data = await res.json();
      if (data.success) {
        setLotVault({
          option: data.lot_vault?.option || '',
          availableOptions: data.availableOptions || [],
          allowedSwitchTargets: data.allowedSwitchTargets || [],
          locked: Boolean(data.locked)
        });
        setVaultSelection(data.lot_vault?.option || '');
      } else {
        setLotVault({ option: '', availableOptions: [], allowedSwitchTargets: [] });
      }
    } catch (_) {
      setLotVault({ option: '', availableOptions: [], allowedSwitchTargets: [] });
    }
  };

  return (
    <div className="mt-12">
      <div className="mb-8">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Deceased Records
        </Typography>
        <Typography variant="small" color="blue-gray" className="opacity-70">
          Manage deceased records and burial information
        </Typography>
      </div>
      
      {/* Loading State */}
      {loading && (
        <div className="mb-8">
          <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
            Loading deceased records...
          </Typography>
        </div>
      )}

      {/* Main Content */}
      {!loading && (
        <Card className="overflow-hidden">
        <CardHeader
          floated={false}
          shadow={false}
          color="transparent"
          className="m-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6"
        >
          <Typography variant="h5" color="blue-gray" className="mb-1">
            Deceased Records
          </Typography>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:w-auto">
            <div className="w-full sm:w-72">
              <Input
                label="Search deceased records..."
                icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                value={query}
                onChange={e => {
                  const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                  setQuery(filtered);
                }}
              />
            </div>
            <Button 
              className="flex items-center justify-center gap-3 w-full sm:w-auto" 
              color="blue" 
              onClick={openAddDialog}
            >
              <PlusCircleIcon strokeWidth={2} className="h-4 w-4" /> 
              Add Record
            </Button>
          </div>
        </CardHeader>
        <CardBody className="px-0 pt-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] table-auto">
              <thead>
                <tr>
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'date_of_birth', label: 'Date of Birth' },
                    { key: 'date_of_death', label: 'Date of Death' },
                    { key: 'burial_date', label: 'Burial Date' },
                    { key: 'location', label: 'Location' },
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
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                        {query ? "No results found" : "No deceased records available"}
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  paged.map((d, key) => {
                    const className = `py-3 px-6 ${
                      key === paged.length - 1 ? "" : "border-b border-blue-gray-50"
                    }`;
                    return (
                      <tr key={d.id} className="hover:bg-blue-50 transition-colors">
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            {toTitleCase(d.name)}
                          </Typography>
                        </td>
                        <td className={className}>{d.date_of_birth || 'N/A'}</td>
                        <td className={className}>{d.date_of_death}</td>
                        <td className={className}>{d.burial_date || 'N/A'}</td>
                        <td className={className}>{d.lot_label || `Lot ${d.lot_id}`}</td>
                        <td className={className}>
                          <div className="flex gap-2">
                            <Tooltip content="Edit Record">
                              <IconButton 
                                variant="text" 
                                color="blue-gray"
                                onClick={() => openEditDialog(d)}
                              >
                                <PencilIcon className="h-4 w-4" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip content="Delete Record">
                              <IconButton 
                                variant="text" 
                                color="red"
                                onClick={() => openDeleteDialog(d)}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </IconButton>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
        </Card>
      )}
      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-center lg:justify-between gap-4 mt-6">
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
          {totalPages > page && (
            <Button
              variant="outlined"
              color="blue-gray"
              size="sm"
              className="flex items-center justify-center"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              {page + 1}
            </Button>
          )}
          <Button
            variant="outlined"
            color="blue-gray"
            size="sm"
            className="flex items-center justify-center"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            &gt;
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Typography variant="small" color="blue-gray" className="font-normal whitespace-nowrap">
            Page {page} of {totalPages}
          </Typography>
          <div className="flex items-center gap-2">
            <Typography variant="small" color="blue-gray" className="font-normal">
              Rows per page:
            </Typography>
            <Select
              label="Rows"
              value={String(pageSize)}
              onChange={(v) => { const n = Number(v); setPageSize(n); localStorage.setItem('deceased_page_size', String(n)); setPage(1); }}
              containerProps={{ className: "min-w-[90px]" }}
            >
              {[5,10,20,50].map(n => <Option key={n} value={String(n)}>{n}</Option>)}
            </Select>
          </div>
        </div>
      </div>
      {/* Add Deceased Dialog */}
      <Dialog
        open={isAddDialogOpen}
        handler={() => {}}
        dismiss={{ enabled: false }}
        size="lg"
        className="w-full max-w-4xl max-h-[98vh] flex flex-col"
      >
        <DialogHeader>{addStep === 1 ? 'Select Lot and Vault Option' : 'Deceased Details'}</DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          {addStep === 1 ? (
            <div className="grid grid-cols-1 gap-4">
              <DropdownField
                label="Customer"
                value={form.customer_id}
                options={filteredCustomers.map((c) => ({
                  value: String(c.id),
                  label: `${c.last_name ?? ''}, ${c.first_name ?? ''} (${c.username})`,
                }))}
                onSelect={(customerId) => {
                  setTouchedFields({ ...touchedFields, customer_id: true });
                  handleCustomerChange(customerId);
                  if (fieldErrors.customer_id) {
                    setFieldErrors({ ...fieldErrors, customer_id: '' });
                  }
                }}
                error={touchedFields.customer_id && (!form.customer_id || form.customer_id.trim() === '')}
                disabled={filteredCustomers.length === 0}
                emptyMessage="No customers available"
              />
              <DropdownField
                label="Owned Lot"
                value={form.lot_id}
                options={customerLots.map((lot) => ({ value: String(lot.id), label: lot.label }))}
                onSelect={(lotId) => {
                  setTouchedFields({ ...touchedFields, lot_id: true });
                  handleLotChange(lotId);
                  if (fieldErrors.lot_id) {
                    setFieldErrors({ ...fieldErrors, lot_id: '' });
                  }
                }}
                error={touchedFields.lot_id && (!form.lot_id || form.lot_id.trim() === "")}
                disabled={customerLots.length === 0}
                emptyMessage={form.customer_id ? 'No owned lots for this customer' : 'Select a customer first'}
              />
              {form.lot_id && (
                <div className="grid grid-cols-1 gap-4">
                  {/* Always show all vault options with full, human-friendly details */}
                  <div className="p-3 border rounded">
                    <Typography variant="small" className="font-semibold">Vault Options Overview</Typography>
                    <Typography variant="small" className="text-blue-gray-600 mt-1">
                      Choose the vault option that matches what will be interred.
                    </Typography>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {/* Option 1 */}
                      <div className={`p-2 rounded border ${ (vaultSelection || lotVault.option) === 'option1' ? 'border-blue-400 ring-1 ring-blue-300' : 'border-blue-gray-100' }`}>
                        <Typography variant="small" className="font-semibold">Option 1 — Bodies + Bones</Typography>
                        <div className="mt-1 text-sm text-blue-gray-700">
                          <div>• Lower: 1 body</div>
                          <div>• Upper: 1 body</div>
                          <div>• Bones: 4 total</div>
                        </div>
                        <Typography variant="small" className="text-blue-gray-600 mt-1 text-sm">
                          Usage: {getVaultAvailability('option1', lotVault)}
                        </Typography>
                        <Button size="sm" className="mt-2 w-full sm:w-auto" variant={(vaultSelection || lotVault.option) === 'option1' ? 'filled' : 'outlined'} onClick={() => setVaultSelection('option1')} disabled={lotVault.locked}>Select</Button>
                      </div>
                      {/* Option 2 */}
                      <div className={`p-2 rounded border ${ (vaultSelection || lotVault.option) === 'option2' ? 'border-blue-400 ring-1 ring-blue-300' : 'border-blue-gray-100' }`}>
                        <Typography variant="small" className="font-semibold">Option 2 — Body + Bones</Typography>
                        <div className="mt-1 text-sm text-blue-gray-700">
                          <div>• Lower: 1 body</div>
                          <div>• Upper: 5 bones</div>
                        </div>
                        <Typography variant="small" className="text-blue-gray-600 mt-1 text-sm">
                          Usage: {getVaultAvailability('option2', lotVault)}
                        </Typography>
                        <Button size="sm" className="mt-2 w-full sm:w-auto" variant={(vaultSelection || lotVault.option) === 'option2' ? 'filled' : 'outlined'} onClick={() => setVaultSelection('option2')} disabled={lotVault.locked}>Select</Button>
                      </div>
                      {/* Option 3 */}
                      <div className={`p-2 rounded border ${ (vaultSelection || lotVault.option) === 'option3' ? 'border-blue-400 ring-1 ring-blue-300' : 'border-blue-gray-100' }`}>
                        <Typography variant="small" className="font-semibold">Option 3 — Bones Only</Typography>
                        <div className="mt-1 text-sm text-blue-gray-700">
                          <div>• Lower: 3 bones</div>
                          <div>• Upper: 3 bones</div>
                        </div>
                        <Typography variant="small" className="text-blue-gray-600 mt-1 text-sm">
                          Usage: {getVaultAvailability('option3', lotVault)}
                        </Typography>
                        <Button size="sm" className="mt-2 w-full sm:w-auto" variant={(vaultSelection || lotVault.option) === 'option3' ? 'filled' : 'outlined'} onClick={() => setVaultSelection('option3')} disabled={lotVault.locked}>Select</Button>
                      </div>
                    </div>

                    {/* Selected or switching UI */}
                    <div className="mt-3">
                      {lotVault.option ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="p-2 rounded border border-green-200 bg-green-50">
                            <Typography variant="small" className="font-semibold text-sm text-green-800">✅ Vault option already set</Typography>
                            <Typography variant="small" className="mt-1 text-sm font-bold text-green-900">{String(lotVault.option || '').toUpperCase()}</Typography>
                            <Typography variant="small" className="text-green-700 mt-1 text-sm">{getVaultDescription(lotVault.option)}</Typography>
                            <Typography variant="small" className="text-green-600 mt-2 text-xs italic">You can proceed to the next step or select a different option below.</Typography>
                          </div>
                          <div className="p-2 rounded border border-blue-gray-100">
                            {lotVault.locked ? (
                              <Typography variant="small" className="text-orange-700 text-sm">🔒 Vault option is locked. To change it, remove all interments for this lot and reset.</Typography>
                            ) : (
                              <>
                                <Typography variant="small" className="font-semibold text-sm">Want to change?</Typography>
                                <Typography variant="small" className="text-blue-gray-600 mt-1 text-sm">Select a different option above and save it.</Typography>
                                <div className="mt-2">
                                  <Button size="sm" disabled={!vaultSelection || vaultSelection === lotVault.option} onClick={async () => {
                                    try {
                                      const resp = await fetch(API_ENDPOINTS.SET_LOT_VAULT_OPTION, {
                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ lot_id: form.lot_id, option: vaultSelection })
                                      });
                                      const d = await resp.json();
                                      if (d.success) {
                                        showToast('Vault option updated', 'success');
                                        handleLotChange(form.lot_id);
                                      } else {
                                        showToast(d.message || 'Failed to update vault option', 'error');
                                      }
                                    } catch (_) { showToast('Error updating option', 'error'); }
                                  }}>Save New Selection</Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded border border-orange-200 bg-orange-50">
                          <Typography variant="small" className="font-semibold text-sm text-orange-800">⚠️ Vault option required</Typography>
                          <Typography variant="small" className="text-orange-700 mt-1 text-sm">Please click one of the options above to select it for this lot.</Typography>
                        </div>
                      )}
                    </div>
                </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input 
                  label="First Name" 
                  required 
                  value={form.first_name} 
                  onChange={e => {
                    const sanitized = sanitizeName(e.target.value);
                    setTouchedFields({...touchedFields, first_name: true});
                    setForm(f => ({ ...f, first_name: sanitized }));
                    if (fieldErrors.first_name) {
                      setFieldErrors({...fieldErrors, first_name: ''});
                    }
                  }}
                  error={touchedFields.first_name && (!form.first_name || form.first_name.trim() === '')}
                />
                <Input label="Middle Name (optional)" value={form.middle_name} onChange={e => setForm(f => ({ ...f, middle_name: sanitizeName(e.target.value) }))} />
                <Input 
                  label="Last Name" 
                  required 
                  value={form.last_name} 
                  onChange={e => {
                    const sanitized = sanitizeName(e.target.value);
                    setTouchedFields({...touchedFields, last_name: true});
                    setForm(f => ({ ...f, last_name: sanitized }));
                    if (fieldErrors.last_name) {
                      setFieldErrors({...fieldErrors, last_name: ''});
                    }
                  }}
                  error={touchedFields.last_name && (!form.last_name || form.last_name.trim() === '')}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input 
                  label="Date of Birth" 
                  required 
                  type="date" 
                  max={new Date().toISOString().split('T')[0]}
                  value={form.date_of_birth} 
                  onChange={e => {
                    setTouchedFields({...touchedFields, date_of_birth: true});
                    setForm(f => ({ ...f, date_of_birth: e.target.value }));
                    if (fieldErrors.date_of_birth) {
                      setFieldErrors({...fieldErrors, date_of_birth: ''});
                    }
                  }}
                  error={touchedFields.date_of_birth && (fieldErrors.date_of_birth || !form.date_of_birth || form.date_of_birth.trim() === '')}
                />
                <Input 
                  label="Date of Death" 
                  required 
                  type="date" 
                  min={form.date_of_birth || undefined}
                  max={new Date().toISOString().split('T')[0]}
                  value={form.date_of_death} 
                  onChange={e => {
                    setTouchedFields({...touchedFields, date_of_death: true});
                    setForm(f => ({ ...f, date_of_death: e.target.value }));
                    if (fieldErrors.date_of_death) {
                      setFieldErrors({...fieldErrors, date_of_death: ''});
                    }
                  }}
                  error={touchedFields.date_of_death && (fieldErrors.date_of_death || !form.date_of_death || form.date_of_death.trim() === '')}
                />
                <Input 
                  label="Burial Date" 
                  required
                  type="date" 
                  min={form.date_of_death || form.date_of_birth || undefined}
                  value={form.burial_date} 
                  onChange={e => {
                    setTouchedFields({...touchedFields, burial_date: true});
                    setForm(f => ({ ...f, burial_date: e.target.value }));
                    if (fieldErrors.burial_date) {
                      setFieldErrors({...fieldErrors, burial_date: ''});
                    }
                  }}
                  error={touchedFields.burial_date && (fieldErrors.burial_date || !form.burial_date || form.burial_date.trim() === '')}
                />
              </div>
              <Input label="Cause of Death (optional)" value={form.cause_of_death || ''} onChange={e => {
                const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                setForm(f => ({ ...f, cause_of_death: filtered }));
              }} />
              <Input label="Funeral Home (optional)" value={form.funeral_home || ''} onChange={e => {
                const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                setForm(f => ({ ...f, funeral_home: filtered }));
              }} />
              <Input label="Notes (optional)" value={form.notes || ''} onChange={e => {
                const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
                setForm(f => ({ ...f, notes: filtered }));
              }} />
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="text" color="red" onClick={addStep === 1 ? closeAddDialog : () => setAddStep(1)}>
            {addStep === 1 ? 'Cancel' : 'Back'}
          </Button>
          {addStep === 1 ? (
            <Button onClick={() => {
              const errors = {};
              const missingFields = [];
              
              if (!form.customer_id) {
                errors.customer_id = 'Customer is required';
                missingFields.push('Customer');
              }
              if (!form.lot_id) {
                errors.lot_id = 'Owned lot is required';
                missingFields.push('Owned Lot');
              }
              // Accept if lot has existing vault OR user made a selection
              const hasVault = lotVault.option || vaultSelection;
              if (!hasVault) {
                errors.vault_option = 'Vault option is required';
                missingFields.push('Vault Option');
              }
              
              setFieldErrors(errors);
              setTouchedFields({
                customer_id: true,
                lot_id: true,
                vault_option: true
              });
              
              if (missingFields.length > 0) {
                showToast(`Missing required fields: ${missingFields.join(', ')}`, 'error');
                return;
              }
              
              // Proceed to next step
              setAddStep(2);
            }}>
              Next
            </Button>
          ) : (
            <Button onClick={handleAddRecord}>
              Add Record
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Edit Deceased Dialog */}
      <Dialog
        open={isEditDialogOpen}
        handler={() => {}}
        dismiss={{ enabled: false }}
        size="lg"
        className="w-full max-w-4xl max-h-[95vh] flex flex-col"
      >
        <DialogHeader>Edit Deceased Record</DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="First Name" value={form.first_name || ''} onChange={e => setForm(f => ({ ...f, first_name: sanitizeName(e.target.value) }))} />
            <Input label="Middle Name" value={form.middle_name || ''} onChange={e => setForm(f => ({ ...f, middle_name: sanitizeName(e.target.value) }))} />
            <Input label="Last Name" value={form.last_name || ''} onChange={e => setForm(f => ({ ...f, last_name: sanitizeName(e.target.value) }))} />
            <Input 
              label="Date of Birth" 
              type="date" 
              max={new Date().toISOString().split('T')[0]}
              value={form.date_of_birth} 
              onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} 
            />
            <Input 
              label="Date of Death" 
              type="date" 
              min={form.date_of_birth || undefined}
              max={new Date().toISOString().split('T')[0]}
              value={form.date_of_death} 
              onChange={e => setForm(f => ({ ...f, date_of_death: e.target.value }))} 
            />
            <Input 
              label="Burial Date" 
              type="date" 
              min={form.date_of_death || form.date_of_birth || undefined}
              value={form.burial_date} 
              onChange={e => setForm(f => ({ ...f, burial_date: e.target.value }))} 
            />
            <DropdownField
              label="Customer"
              value={form.customer_id}
              options={customers.map((c) => ({
                value: String(c.id),
                label: `${c.last_name ?? ''}, ${c.first_name ?? ''} (${c.username})`,
              }))}
              onSelect={(val) => handleCustomerChange(val)}
              emptyMessage="No customers found"
            />
            <DropdownField
              label="Owned Lot"
              value={form.lot_id}
              options={customerLots.map((lot) => ({ value: String(lot.id), label: lot.label }))}
              onSelect={(val) => setForm((f) => ({ ...f, lot_id: val }))}
              emptyMessage={form.customer_id ? "No lots found" : "Select a customer first"}
            />
            <Input label="Cause of Death" value={form.cause_of_death} onChange={e => {
              const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
              setForm(f => ({ ...f, cause_of_death: filtered }));
            }} />
            <Input label="Funeral Home" value={form.funeral_home} onChange={e => {
              const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
              setForm(f => ({ ...f, funeral_home: filtered }));
            }} />
            <Input label="Notes" value={form.notes} onChange={e => {
              const filtered = e.target.value.replace(/[^A-Za-z\s]/g, '');
              setForm(f => ({ ...f, notes: filtered }));
            }} />
          </div>
        </DialogBody>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="text" color="red" onClick={closeEditDialog}>
            Cancel
          </Button>
          <Button onClick={handleEditRecord}>
            Save Changes
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} handler={() => {}} dismiss={{ enabled: false }} size="sm">
        <DialogHeader>Delete Deceased Record</DialogHeader>
        <DialogBody className="p-6">
          <Typography variant="small" color="blue-gray" className="font-normal">
            Are you sure you want to delete the deceased record for{" "}
            <strong>{toTitleCase(recordToDelete?.name || '')}</strong>? This action cannot be undone.
          </Typography>
        </DialogBody>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="text" color="red" onClick={closeDeleteDialog}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDeleteRecord}>
            Delete
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
              color={toast.type === 'error' ? 'red' : 'green'}
              className="max-w-sm text-sm shadow-2xl"
            >
              {toast.message}
            </Alert>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeceasedRecords; 