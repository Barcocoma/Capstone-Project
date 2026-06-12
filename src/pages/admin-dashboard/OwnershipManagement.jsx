import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Chip,
  Alert,
} from "@material-tailwind/react";
import {
  MagnifyingGlassIcon,
  ArrowsRightLeftIcon,
  TrashIcon,
  PlusCircleIcon,
  XMarkIcon,
  CurrencyDollarIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PencilIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { API_ENDPOINTS } from "@/configs/api";
import { useAuth } from "@/context/AuthContext";

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

  const normalized = options.map((opt) => {
    if (typeof opt === "object") {
      return {
        value: String(opt.value),
        label: opt.label ?? String(opt.value),
        description: opt.description,
      };
    }
    return { value: String(opt), label: String(opt) };
  });

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
        <div className="absolute left-0 right-0 top-full mt-2 z-[1000] max-h-48 overflow-y-auto rounded-lg border border-blue-gray-100 bg-white shadow-xl text-sm">
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
                <span className="text-sm">{opt.label}</span>
                {opt.description && (
                  <span className="text-[11px] text-blue-gray-500 block">
                    {opt.description}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export function OwnershipManagement() {
  const { user: currentUser } = useAuth();
  const [ownerships, setOwnerships] = useState([]);
  const [groupedOwnerships, setGroupedOwnerships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingOwnership, setEditingOwnership] = useState(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPriceDialogOpen, setIsPriceDialogOpen] = useState(false);
  const [isViewLotsDialogOpen, setIsViewLotsDialogOpen] = useState(false);
  const [selectedCustomerLots, setSelectedCustomerLots] = useState([]);
  const [ownershipToDelete, setOwnershipToDelete] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});

  // Toast functions
  const showToast = (message, type = 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'error' });
    }, 5000);
  };

  // Activity logging function
  const recordActivity = async (action, type, details) => {
    try {
      await fetch(API_ENDPOINTS.RECORD_ACTIVITY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          type,
          details,
          performed_by: currentUser?.id || null
        })
      });
    } catch (error) {
      console.error('Failed to record activity:', error);
    }
  };

  const [priceConfig, setPriceConfig] = useState({
    standard_price: '76000',
    deluxe_price: '78000',
    premium_price: '80000',
    interest_1year: '16',
    interest_2year: '17',
    interest_3year: '18',
    interest_4year: '19',
    interest_5year: '20',
    spot_cash_discount: '8',
    atneed_markup: '30',
    down_payment_percentage: '20',
  });
  const [ownershipForm, setOwnershipForm] = useState({
    customer_id: '',
    garden: '',
    sector: '',
    block: '',
    lotNumber: '',
    lotType: 'standard',
    // Payment plan fields
    total_amount: '',
    down_payment_option: '', // '1dp' or '2split' - 20% of total
    payment_term_months: 'atneed', // 'atneed', 'spotcash', 12, 24, 36, 48, 60 - admin must choose
    due_day: '', // 1-31 for custom due date each month
  });
  const [gardens, setGardens] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [blockLotTypes, setBlockLotTypes] = useState({}); // Store lot type for each block
  const [availableLots, setAvailableLots] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [selectedLots, setSelectedLots] = useState([]); // Array of selected lots for batch purchase
  const [lotEditingIndex, setLotEditingIndex] = useState(null);
  const [lotEditingDraft, setLotEditingDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('ownership_page_size');
    return saved ? Number(saved) : 5;
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const formatCurrency = useCallback((amount = 0, options = {}) => {
    const value = Number(amount || 0);
    return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...options })}`;
  }, []);

  const getPriceByType = useCallback((lotType = 'standard') => {
    const fallback = parseFloat(priceConfig.standard_price) || 70000;
    const map = {
      standard: parseFloat(priceConfig.standard_price) || fallback,
      deluxe: parseFloat(priceConfig.deluxe_price) || fallback,
      premium: parseFloat(priceConfig.premium_price) || fallback,
    };
    return map[lotType] || fallback;
  }, [priceConfig]);

  const describePaymentTerm = useCallback((term) => {
    if (!term || term === 'atneed') return 'At Need';
    if (term === 'spotcash') return 'Spot Cash';
    return `${term} Months`;
  }, []);

  const computeLotPricing = useCallback((lot) => {
    const lotType = lot.lotType || 'standard';
    const paymentTerm = lot.payment_term_months || 'atneed';
    const basePrice = getPriceByType(lotType);
    const markupPercent = parseFloat(priceConfig.atneed_markup) || 0;
    const discountPercent = parseFloat(priceConfig.spot_cash_discount) || 0;
    const downPaymentPercent = (parseFloat(priceConfig.down_payment_percentage) || 0) / 100;

    const result = {
      lotType,
      paymentTerm,
      basePrice,
      markupAmount: 0,
      discountAmount: 0,
      downPayment: 0,
      interestAmount: 0,
      installmentBalance: 0,
      monthlyPayment: 0,
      finalTotal: basePrice,
      dueTodayPortion: basePrice,
    };

    if (paymentTerm === 'atneed') {
      const markupAmount = basePrice * (markupPercent / 100);
      result.markupAmount = markupAmount;
      result.finalTotal = basePrice + markupAmount;
      result.dueTodayPortion = result.finalTotal;
      return result;
    }

    if (paymentTerm === 'spotcash') {
      const discountAmount = basePrice * (discountPercent / 100);
      result.discountAmount = discountAmount;
      result.finalTotal = Math.max(0, basePrice - discountAmount);
      result.dueTodayPortion = result.finalTotal;
      return result;
    }

    const termMonths = parseInt(paymentTerm, 10) || 0;
    const hasInstallment = termMonths > 0;
    const downPaymentApplicable = hasInstallment && (lot.down_payment_option || ownershipForm.down_payment_option);
    const downPayment = downPaymentApplicable ? basePrice * downPaymentPercent : 0;
    const remainingAmount = Math.max(0, basePrice - downPayment);

    // Determine interest based on years (mapping months to config interest)
    let years = 1;
    if (termMonths === 12) years = 1;
    else if (termMonths === 24) years = 2;
    else if (termMonths === 36) years = 3;
    else if (termMonths === 48) years = 4;
    else if (termMonths === 60) years = 5;
    else years = Math.ceil(termMonths / 12);

    const annualInterestRates = {
      1: parseFloat(priceConfig.interest_1year) || 0,
      2: parseFloat(priceConfig.interest_2year) || 0,
      3: parseFloat(priceConfig.interest_3year) || 0,
      4: parseFloat(priceConfig.interest_4year) || 0,
      5: parseFloat(priceConfig.interest_5year) || 0,
    };

    const annualInterestPercent = annualInterestRates[years] || 0;
    const totalInterestPercent = (annualInterestPercent * years) / 100;
    const interestAmount = remainingAmount * totalInterestPercent;
    const installmentBalance = remainingAmount + interestAmount;
    const monthlyPayment = termMonths > 0 ? installmentBalance / termMonths : 0;

    result.downPayment = downPayment;
    result.interestAmount = interestAmount;
    result.installmentBalance = installmentBalance;
    result.monthlyPayment = monthlyPayment;
    result.finalTotal = downPayment + installmentBalance;
    result.dueTodayPortion = downPayment;

    return result;
  }, [getPriceByType, priceConfig, ownershipForm.down_payment_option]);

  const cartSummary = useMemo(() => {
    return selectedLots.reduce(
      (acc, lot) => {
        const breakdown = computeLotPricing(lot);
        acc.lotCount += 1;
        acc.baseTotal += breakdown.basePrice;
        acc.markupTotal += breakdown.markupAmount;
        acc.discountTotal += breakdown.discountAmount;
        acc.downPaymentTotal += breakdown.downPayment;
        acc.interestTotal += breakdown.interestAmount;
        acc.installmentBalance += breakdown.installmentBalance;
        acc.monthlyTotal += breakdown.monthlyPayment;
        acc.grandTotal += breakdown.finalTotal;
        acc.dueToday += breakdown.dueTodayPortion;
        return acc;
      },
      {
        lotCount: 0,
        baseTotal: 0,
        markupTotal: 0,
        discountTotal: 0,
        downPaymentTotal: 0,
        interestTotal: 0,
        installmentBalance: 0,
        monthlyTotal: 0,
        grandTotal: 0,
        dueToday: 0,
      }
    );
  }, [selectedLots, computeLotPricing]);

  // Load price configuration
  const loadPriceConfig = async () => {
    try {
      const response = await fetch('/api/get_lot_prices.php');
      const data = await response.json();
      if (data.success && data.config) {
        setPriceConfig(data.config);
      }
    } catch (e) {
      console.error('Error loading price config:', e);
    }
  };

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Group ownerships by customer ID
  const groupOwnershipsByCustomer = (ownerships) => {
    const grouped = {};
    
    ownerships.forEach(ownership => {
      // Use customerId as the key, fallback to customer name if customerId is null
      const key = ownership.customerId || ownership.customer || 'Unknown';
      
      if (!grouped[key]) {
        grouped[key] = {
          customerId: ownership.customerId,
          customerName: ownership.customer || 'Unknown',
          totalLots: 0,
          lots: [],
          status: 'Reserved'
        };
      }
      
      grouped[key].totalLots += 1;
      grouped[key].lots.push(ownership);
    });
    
    // Determine overall status
    return Object.values(grouped).map(customer => {
      // Check if all lots are occupied
      const allOccupied = customer.lots.every(l => l.status?.toLowerCase() === 'occupied');
      const hasOccupied = customer.lots.some(l => l.status?.toLowerCase() === 'occupied');
      
      customer.status = allOccupied ? 'Occupied' : hasOccupied ? 'Mixed' : 'Reserved';
      
      return customer;
    });
  };

  // Fetch ownership data from backend
  const fetchOwnerships = async (showSpinner = true) => {
    try {
      if (showSpinner) {
        setLoading(true);
      }
      const response = await fetch(API_ENDPOINTS.GET_OWNERSHIPS);
      const data = await response.json();
      console.log('API Response:', data); // Debug log
      if (data.success) {
        console.log('Setting ownerships:', data.ownerships); // Debug log
        setOwnerships(data.ownerships);
        
        // Group ownerships by customer
        const grouped = groupOwnershipsByCustomer(data.ownerships);
        setGroupedOwnerships(grouped);
      } else {
        console.error('Failed to fetch ownerships:', data.message);
      }
    } catch (error) {
      console.error('Error fetching ownerships:', error);
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchOwnerships();
    loadPriceConfig();
  }, []);

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

  // Get selected customer name for display
  const getSelectedCustomerName = () => {
    if (!ownershipForm.customer_id) return '';
    const selectedCustomer = customers.find(c => String(c.id) === String(ownershipForm.customer_id));
    return selectedCustomer ? `${selectedCustomer.last_name ?? ''}, ${selectedCustomer.first_name ?? ''} (${selectedCustomer.username})` : '';
  };

  const openEditOwnership = async (ownership) => {
    setEditingOwnership(ownership);
    setOwnershipForm({
      customer_id: ownership.customerId ? String(ownership.customerId) : '',
      garden: ownership.garden || '',
      sector: ownership.sector || '',
      block: String(ownership.block ?? ''),
      lotNumber: String(ownership.lotNumber ?? ''),
      lotType: ownership.lotType || 'standard',
    });
    setCustomerSearch('');
    try {
      const cu = await fetch(API_ENDPOINTS.GET_CUSTOMER_USERS);
      const cud = await cu.json();
      const filtered = (cud.customers || []).filter(c => String(c.id) !== String(ownership.customerId || ''));
      setCustomers(filtered);
    } catch (_) {}
    setIsEditDialogOpen(true);
  };

  const closeEditOwnership = () => {
    setEditingOwnership(null);
    setOwnershipForm({
      customer_id: '',
      garden: '',
      sector: '',
      block: '',
      lotNumber: '',
      lotType: 'standard',
    });
    setIsEditDialogOpen(false);
  };


  const openAddOwnership = async () => {
    setOwnershipForm({ 
      customer_id: '', 
      garden: '', 
      sector: '', 
      block: '', 
      lotNumber: '', 
      lotType: 'standard',
      total_amount: '',
      down_payment_option: '',
      payment_term_months: 'atneed',
      due_day: ''
    });
    setSelectedLots([]);
    setCustomerSearch('');
    try {
      const cu = await fetch(API_ENDPOINTS.GET_CUSTOMER_USERS);
      const cud = await cu.json();
      setCustomers(cud.customers || []);
      const res = await fetch(API_ENDPOINTS.MAP_GARDENS);
      const data = await res.json();
      setGardens(data.gardens || []);
    } catch (_) {}
    setSectors([]); setBlocks([]); setAvailableLots([]);
    setIsAddDialogOpen(true);
  };

  const closeAddOwnership = () => {
    setOwnershipForm({ 
      customer_id: '', 
      garden: '', 
      sector: '', 
      block: '', 
      lotNumber: '', 
      lotType: 'standard',
      total_amount: '',
      down_payment_option: '',
      payment_term_months: 'atneed',
      due_day: ''
    });
    setSelectedLots([]);
    setFieldErrors({});
    setTouchedFields({});
    setIsAddDialogOpen(false);
  };

  const openDeleteOwnership = (ownership) => {
    setOwnershipToDelete(ownership);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteOwnership = () => {
    setOwnershipToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const openViewLots = (customerOwnerships) => {
    setSelectedCustomerLots(customerOwnerships.lots);
    setIsViewLotsDialogOpen(true);
  };

  const closeViewLots = () => {
    setSelectedCustomerLots([]);
    setIsViewLotsDialogOpen(false);
  };

  const handleFormChange = async (field, value) => {
    try {
      if (field === 'customer_id') {
        setOwnershipForm((p) => ({ ...p, customer_id: value }));
        return;
      }
      if (field === 'garden') {
        setOwnershipForm((p) => ({ ...p, garden: value, sector: '', block: '', lotNumber: '' }));
        const res = await fetch(`${API_ENDPOINTS.MAP_SECTORS}?garden=${encodeURIComponent(value)}`);
        const data = await res.json();
        setSectors(data.sectors || []);
        setBlocks([]);
        setAvailableLots([]);
        return;
      }
      if (field === 'sector') {
        // Update form state first
        setOwnershipForm((p) => ({ ...p, sector: value, block: '', lotNumber: '' }));
        
        // Use the updated garden value from the form state
        const currentGarden = ownershipForm.garden;
        
        const res = await fetch(`${API_ENDPOINTS.MAP_BLOCKS}?garden=${encodeURIComponent(currentGarden)}&sector=${encodeURIComponent(value)}`);
        const data = await res.json();
        setBlocks(data.blocks || []);
        setAvailableLots([]);
        
        // Pre-fetch lot type for each block in parallel for speed
        if (data.blocks && data.blocks.length > 0) {
          const fetchBlockTypes = async () => {
            // Fetch all blocks in parallel
            const promises = data.blocks.map(async (block) => {
              try {
                const lotsRes = await fetch(`${API_ENDPOINTS.MAP_AVAILABLE_LOTS}?garden=${encodeURIComponent(currentGarden)}&sector=${encodeURIComponent(value)}&block=${encodeURIComponent(block)}`);
                const lotsData = await lotsRes.json();
                return { block, lotType: lotsData.lotType || 'standard' };
              } catch {
                return { block, lotType: 'standard' };
              }
            });
            
            // Wait for all requests to complete
            const results = await Promise.all(promises);
            
            // Convert to object format
            const types = {};
            results.forEach(({ block, lotType }) => {
              types[block] = lotType;
            });
            
            // Update once all lot types are fetched
            setBlockLotTypes(types);
          };
          
          fetchBlockTypes();
        } else {
          // If no blocks, clear the lot types
          setBlockLotTypes({});
        }
        return;
      }
      if (field === 'block') {
        // Extract the lot type from the blockLotTypes mapping
        const lotType = blockLotTypes[value] || 'standard';
        
        setOwnershipForm((p) => ({ ...p, block: value }));
        const res = await fetch(`${API_ENDPOINTS.MAP_AVAILABLE_LOTS}?garden=${encodeURIComponent(ownershipForm.garden)}&sector=${encodeURIComponent(ownershipForm.sector)}&block=${encodeURIComponent(value)}`);
        const data = await res.json();
        setAvailableLots(data.lots || []);
        const fetchedLotType = data.lotType || lotType || 'standard';
        
        // Set lot type and auto-set total amount based on lot type
        const fixedAmounts = {
          'standard': 70000,
          'deluxe': 73000,
          'premium': 76000
        };
        
        setOwnershipForm((p) => ({ 
          ...p, 
          lotNumber: '', 
          lotType: fetchedLotType,
          total_amount: fixedAmounts[fetchedLotType] || 70000
        }));
        return;
      }
      if (field === 'lotNumber') {
        setOwnershipForm((p) => ({ ...p, lotNumber: value }));
        return;
      }
    } catch (_) {}
  };

  // Check if all required fields are filled, including payment plan requirements
  const canAddLot = (() => {
    // Basic required fields
    if (!ownershipForm.customer_id || !ownershipForm.garden || !ownershipForm.sector || 
        !ownershipForm.block || !ownershipForm.lotNumber) {
      return false;
    }
    
    // For installment plans, down payment option is required
    const paymentTerm = ownershipForm.payment_term_months || 'atneed';
    const isInstallment = paymentTerm !== 'atneed' && paymentTerm !== 'spotcash';
    
    if (isInstallment) {
      const term = parseInt(paymentTerm || '0');
      if (term > 0 && (!ownershipForm.down_payment_option || ownershipForm.down_payment_option.trim() === '')) {
        return false;
      }
    }
    
    return true;
  })();

  // Add current lot selection to the selected lots list
  const addLotToSelection = () => {
    if (!ownershipForm.customer_id || ownershipForm.customer_id.trim() === '') {
      showToast('Please select a customer first', 'error');
      return;
    }

    if (!ownershipForm.garden || !ownershipForm.sector || !ownershipForm.block || !ownershipForm.lotNumber) {
      showToast('Please complete Garden, Sector, Block, and Lot fields first', 'error');
      return;
    }

    // Validate payment plan requirements for installment plans
    const paymentTerm = ownershipForm.payment_term_months || 'atneed';
    const isInstallment = paymentTerm !== 'atneed' && paymentTerm !== 'spotcash';
    
    if (isInstallment) {
      const term = parseInt(paymentTerm || '0');
      if (term > 0 && (!ownershipForm.down_payment_option || ownershipForm.down_payment_option.trim() === '')) {
        showToast('Please select Down Payment Option before adding this lot', 'error');
        return;
      }
    }

    // Check if lot is already in the list
    if (selectedLots.some(lot => 
      lot.garden === ownershipForm.garden && 
      lot.sector === ownershipForm.sector && 
      lot.block === ownershipForm.block && 
      lot.lotNumber === ownershipForm.lotNumber
    )) {
      showToast('This lot is already in the selection list', 'error');
      return;
    }

    const lotKey = `${ownershipForm.garden}-${ownershipForm.sector}-${ownershipForm.block}-${ownershipForm.lotNumber}`;
    const newLot = {
      garden: ownershipForm.garden,
      sector: ownershipForm.sector,
      block: ownershipForm.block,
      lotNumber: ownershipForm.lotNumber,
      lotType: ownershipForm.lotType,
      // Each lot has its own payment plan settings
      payment_term_months: ownershipForm.payment_term_months || 'atneed',
      down_payment_option: ownershipForm.down_payment_option || '',
      due_day: ownershipForm.due_day || '',
      key: lotKey
    };

    setSelectedLots([...selectedLots, newLot]);
    
    // Remove the added lot from available lots list
    setAvailableLots(availableLots.filter(lot => String(lot) !== String(ownershipForm.lotNumber)));
    
    // Clear the lot selection field but keep garden, sector, block for convenience
    setOwnershipForm((p) => ({ ...p, lotNumber: '' }));
  };

  // Remove a lot from the selection list
  const removeLotFromSelection = (index) => {
    const removedLot = selectedLots[index];
    setSelectedLots(selectedLots.filter((_, i) => i !== index));
    
    // If the removed lot is from the current block, refresh available lots
    if (removedLot && ownershipForm.garden === removedLot.garden && 
        ownershipForm.sector === removedLot.sector && 
        ownershipForm.block === removedLot.block) {
      // The lot should now appear in available lots again (if it wasn't purchased)
      // Refresh the available lots list
      handleFormChange('block', ownershipForm.block);
    }
  };

  const openLotEditorDialog = (index) => {
    const lot = selectedLots[index];
    if (!lot) return;
    setLotEditingIndex(index);
    setLotEditingDraft({ ...lot });
  };

  const closeLotEditorDialog = () => {
    setLotEditingIndex(null);
    setLotEditingDraft(null);
  };

  const handleLotEditorFieldChange = (field, value) => {
    setLotEditingDraft((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };

      if (field === 'payment_term_months') {
        if (value === 'atneed' || value === 'spotcash') {
          updated.down_payment_option = '';
          updated.due_day = '';
        }
      }

      if (field === 'down_payment_option' && (!value || value.trim() === '')) {
        updated.due_day = '';
      }

      return updated;
    });
  };

  const saveLotEditorChanges = () => {
    if (lotEditingIndex === null || !lotEditingDraft) return;
    const paymentTerm = lotEditingDraft.payment_term_months || 'atneed';
    const isInstallment = paymentTerm !== 'atneed' && paymentTerm !== 'spotcash';
    if (isInstallment && (!lotEditingDraft.down_payment_option || lotEditingDraft.down_payment_option.trim() === '')) {
      showToast('Down payment option is required for installment plans', 'error');
      return;
    }
    const updatedLots = [...selectedLots];
    updatedLots[lotEditingIndex] = { ...updatedLots[lotEditingIndex], ...lotEditingDraft };
    setSelectedLots(updatedLots);
    closeLotEditorDialog();
  };

  const lotEditorPaymentTerm = lotEditingDraft?.payment_term_months || 'atneed';
  const lotEditorNeedsDP = lotEditingDraft ? (lotEditorPaymentTerm !== 'atneed' && lotEditorPaymentTerm !== 'spotcash') : false;
  const canSaveLotEditor = lotEditingDraft ? (!lotEditorNeedsDP || (lotEditingDraft.down_payment_option && lotEditingDraft.down_payment_option.trim() !== '')) : false;

  const saveOwnership = async () => {
    try {
      // Validate required fields
      const errors = {};
      const missingFields = [];
      
      if (!ownershipForm.customer_id || ownershipForm.customer_id.trim() === '') {
        errors.customer_id = 'Customer is required';
        missingFields.push('Customer');
      }
      
      // Check if we have lots to process (either in selectedLots or current form)
      const lotsToProcess = selectedLots.length > 0 
        ? selectedLots 
        : (ownershipForm.garden && ownershipForm.sector && ownershipForm.block && ownershipForm.lotNumber
          ? [{
              garden: ownershipForm.garden,
              sector: ownershipForm.sector,
              block: ownershipForm.block,
              lotNumber: ownershipForm.lotNumber,
              lotType: ownershipForm.lotType
            }]
          : []);
      
      if (lotsToProcess.length === 0) {
        errors.lotNumber = 'Please add at least one lot to purchase';
        missingFields.push('Lot');
      }
      
      // Validate required fields for installment plans - check each lot individually
      if (selectedLots.length > 0) {
        for (let i = 0; i < selectedLots.length; i++) {
          const lot = selectedLots[i];
          const lotPaymentTerm = lot.payment_term_months || ownershipForm.payment_term_months || 'atneed';
          const lotTerm = parseInt(lotPaymentTerm === 'atneed' || lotPaymentTerm === 'spotcash' ? '0' : (lotPaymentTerm || '0'));
          
          if (lotTerm > 0 && !lot.down_payment_option && !ownershipForm.down_payment_option) {
            errors[`lot_${i}_down_payment`] = `Lot ${lot.garden} ${lot.sector}${lot.block}-${lot.lotNumber} requires down payment option`;
            missingFields.push(`Lot ${lot.garden} ${lot.sector}${lot.block}-${lot.lotNumber} - Down Payment Option`);
          }
        }
      } else {
        // Single lot validation (backward compatibility)
        const termValue = ownershipForm.payment_term_months;
        const term = parseInt(termValue || '0');
        
        if (term > 0 && !ownershipForm.down_payment_option) {
          errors.down_payment_option = 'Down Payment Option is required';
          missingFields.push('Down Payment Option');
        }
      }
      
      setFieldErrors(errors);
      
      // Determine if we need to mark down_payment_option as touched
      let needsDownPayment = false;
      if (selectedLots.length > 0) {
        for (const lot of selectedLots) {
          const lotPaymentTerm = lot.payment_term_months || ownershipForm.payment_term_months || 'atneed';
          const lotTerm = parseInt(lotPaymentTerm === 'atneed' || lotPaymentTerm === 'spotcash' ? '0' : (lotPaymentTerm || '0'));
          if (lotTerm > 0) {
            needsDownPayment = true;
            break;
          }
        }
      } else {
        const termValue = ownershipForm.payment_term_months;
        const term = parseInt(termValue || '0');
        needsDownPayment = term > 0;
      }
      
      setTouchedFields({
        customer_id: true,
        down_payment_option: needsDownPayment ? true : touchedFields.down_payment_option
      });
      
      if (missingFields.length > 0) {
        showToast(`Missing required fields: ${missingFields.join(', ')}`, 'error');
        return;
      }
      
      // Process all lots
      let successCount = 0;
      let failCount = 0;
      const failedLots = [];
      
      for (const lot of lotsToProcess) {
        try {
          const response = await fetch(API_ENDPOINTS.CREATE_OWNERSHIP, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
            body: JSON.stringify({
              customer_id: ownershipForm.customer_id,
              garden: lot.garden,
              sector: lot.sector,
              block: Number(lot.block),
              lotNumber: Number(lot.lotNumber),
              lotType: lot.lotType
            })
          });
          const data = await response.json();
          
          if (data.success) {
            successCount++;
            const lotId = data.lot_id;
            
            // Record activity
            try {
              await recordActivity(
                'Created',
                'Lot',
                `Created ownership for customer ID ${ownershipForm.customer_id} - Lot ${lot.garden} ${lot.sector}${lot.block}-${lot.lotNumber} (${lot.lotType})`
              );
            } catch (activityError) {
              console.error('Failed to record ownership creation activity:', activityError);
            }

            // Create payment plan for this lot using its own payment settings
            const baseByType = { 
              standard: parseFloat(priceConfig.standard_price) || 70000, 
              deluxe: parseFloat(priceConfig.deluxe_price) || 73000, 
              premium: parseFloat(priceConfig.premium_price) || 76000 
            };
            const totalAmount = baseByType[lot.lotType] || parseFloat(priceConfig.standard_price) || 70000;
            
            // Use payment settings from the lot object (if it has its own) or from form
            const lotPaymentTerm = lot.payment_term_months || ownershipForm.payment_term_months || 'atneed';
            const lotDownPaymentOption = lot.down_payment_option || ownershipForm.down_payment_option || '';
            const lotDueDay = lot.due_day || ownershipForm.due_day || '';
            const lotTerm = parseInt(lotPaymentTerm === 'atneed' || lotPaymentTerm === 'spotcash' ? '0' : (lotPaymentTerm || '0'));
            const downPaymentPercentage = parseFloat(priceConfig.down_payment_percentage) / 100 || 0.20;
            const down = lotDownPaymentOption ? totalAmount * downPaymentPercentage : 0;

            if (lotId) {
              if (lotPaymentTerm === 'atneed' || lotPaymentTerm === 'spotcash') {
                try {
                  let finalAmount = totalAmount;
                  let notes = '';
                  
                  if (lotPaymentTerm === 'spotcash') {
                    const discountPercent = parseFloat(priceConfig.spot_cash_discount) || 0;
                    const discountAmount = totalAmount * (discountPercent / 100);
                    finalAmount = totalAmount - discountAmount;
                    notes = `Spot Cash (${discountPercent}% discount)`;
                  } else if (lotPaymentTerm === 'atneed') {
                    const markupPercent = parseFloat(priceConfig.atneed_markup) || 30;
                    const markupAmount = totalAmount * (markupPercent / 100);
                    finalAmount = totalAmount + markupAmount;
                    notes = `At Need (${markupPercent}% markup)`;
                  }
                  
                  const planPayload = {
                    lot_id: lotId,
                    customer_id: parseInt(ownershipForm.customer_id),
                    total_amount: finalAmount,
                    down_payment: finalAmount,
                    payment_term_months: 0,
                    notes: notes
                  };
                  const planRes = await fetch('/api/create_payment_plan.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
                    body: JSON.stringify(planPayload)
                  });
                  const planJson = await planRes.json();
                  if (!planJson.success && !(planJson.message||'').toLowerCase().includes('already exists')) {
                    console.error('Failed to create payment plan:', planJson.message);
                  }
                } catch (e) {
                  console.error('Error creating payment plan:', e);
                }
              } else if (lotTerm > 0) {
                try {
                  const planPayload = {
                    lot_id: lotId,
                    customer_id: parseInt(ownershipForm.customer_id),
                    total_amount: totalAmount,
                    down_payment: down,
                    payment_term_months: lotTerm,
                    down_payment_split: lotDownPaymentOption === '2split',
                    due_day: lotDueDay ? parseInt(lotDueDay) : null
                  };
                  const planRes = await fetch('/api/create_payment_plan.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
                    body: JSON.stringify(planPayload)
                  });
                  const planJson = await planRes.json();
                  if (!planJson.success && !(planJson.message||'').toLowerCase().includes('already exists')) {
                    console.error('Failed to create payment plan:', planJson.message);
                  }
                  
                  if (down > 0) {
                    try {
                      if (lotDownPaymentOption === '2split') {
                        const splitAmount = down / 2;
                        await fetch('/api/create_f2f_payment.php', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ lot_id: lotId, customer_id: parseInt(ownershipForm.customer_id), payment_amount: splitAmount, payment_method: 'Cash', notes: 'Down payment (1st half)' })
                        });
                      } else {
                        await fetch('/api/create_f2f_payment.php', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ lot_id: lotId, customer_id: parseInt(ownershipForm.customer_id), payment_amount: down, payment_method: 'Cash', notes: 'Down payment' })
                        });
                      }
                    } catch (_) {
                      // Swallow DP logging errors
                    }
                  }
                } catch (e) {
                  console.error('Error creating payment plan:', e);
                }
              }
            }
          } else {
            failCount++;
            const errorMsg = data.message || 'Unknown error';
            failedLots.push(`${lot.garden} ${lot.sector}${lot.block}-${lot.lotNumber} (${errorMsg})`);
            console.error(`Failed to create ownership for lot ${lot.garden} ${lot.sector}${lot.block}-${lot.lotNumber}:`, errorMsg);
          }
        } catch (error) {
          failCount++;
          const errorMsg = error.message || 'Network error';
          failedLots.push(`${lot.garden} ${lot.sector}${lot.block}-${lot.lotNumber} (${errorMsg})`);
          console.error(`Error creating ownership for lot ${lot.garden} ${lot.sector}${lot.block}-${lot.lotNumber}:`, error);
        }
      }
      
      // Show results
      if (successCount > 0) {
        if (failCount > 0) {
          showToast(`Successfully created ${successCount} ownership(s). Failed: ${failCount} (${failedLots.join(', ')})`, 'error');
        } else {
          showToast(`Successfully created ${successCount} ownership record(s)!`, 'success');
        }
        closeAddOwnership();
        fetchOwnerships(false);
        setPage(1);
        
        // Refresh available lots if dialog is still open (shouldn't be, but just in case)
        if (ownershipForm.garden && ownershipForm.sector && ownershipForm.block) {
          try {
            const res = await fetch(`${API_ENDPOINTS.MAP_AVAILABLE_LOTS}?garden=${encodeURIComponent(ownershipForm.garden)}&sector=${encodeURIComponent(ownershipForm.sector)}&block=${encodeURIComponent(ownershipForm.block)}`);
            const data = await res.json();
            setAvailableLots(data.lots || []);
          } catch (_) {
            // Ignore refresh errors
          }
        }
      } else {
        showToast(`Failed to create ownership records. ${failedLots.length > 0 ? 'Failed lots: ' + failedLots.join(', ') : ''}`, 'error');
      }
    } catch (error) {
      console.error('Error saving ownership:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      showToast(`Error saving ownership: ${errorMessage}`, 'error');
    }
  };

  const saveEditOwnership = async () => {
    try {
      // Prevent transferring to self
      if (String(ownershipForm.customer_id || '') === String(editingOwnership?.customerId || '')) {
        showToast('Cannot transfer to the same customer', 'error');
        return;
      }
      // Probe if backend requires confirm due to buried deceased
      const probe = await fetch(API_ENDPOINTS.UPDATE_OWNERSHIP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
        body: JSON.stringify({ id: editingOwnership?.id, customer_id: Number(ownershipForm.customer_id) })
      });
      const probeData = await probe.json();
      if (probeData.blocked) {
        showToast(probeData.message || '🚫 TRANSFER BLOCKED: Cannot transfer lot with buried deceased. Ownership transfer is prohibited when there is a buried person in this lot.', 'error');
        return;
      }
      // Check for old needs_confirm response and block it
      if (probeData.needs_confirm) {
        showToast('🚫 TRANSFER BLOCKED: Cannot transfer lot with buried deceased. Ownership transfer is prohibited when there is a buried person in this lot.', 'error');
        return;
      } else if (!probeData.success) {
        showToast(probeData.message || 'Failed to update ownership', 'error');
        return;
      } else {
        // already succeeded without confirm
        closeEditOwnership();
        fetchOwnerships(false);
        return;
      }

      const response = await fetch(API_ENDPOINTS.UPDATE_OWNERSHIP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
        body: JSON.stringify({
          id: editingOwnership?.id,
          customer_id: Number(ownershipForm.customer_id),
          confirm_with_deceased: true
        })
      });
      const data = await response.json();
      if (data.success) {
        // Record activity
        await recordActivity(
          'Updated',
          'Lot',
          `Transferred ownership from customer ID ${editingOwnership?.customerId} to customer ID ${ownershipForm.customer_id} - Lot ${editingOwnership?.garden} ${editingOwnership?.sector}${editingOwnership?.block}-${editingOwnership?.lotNumber}`
        );
        
        closeEditOwnership();
        fetchOwnerships(false);
      } else {
        showToast(data.message || 'Failed to update ownership', 'error');
      }
    } catch (error) {
      console.error('Error updating ownership:', error);
      showToast('Error updating ownership', 'error');
    }
  };

  const deleteOwnership = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.DELETE_OWNERSHIP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUser?.id?.toString() || '' },
        body: JSON.stringify({ id: ownershipToDelete.id })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Ownership deleted successfully!', 'success');
        
        // Record activity
        await recordActivity(
          'Deleted',
          'Lot',
          `Deleted ownership for customer ${ownershipToDelete.customer} - Lot ${ownershipToDelete.garden} ${ownershipToDelete.sector}${ownershipToDelete.block}-${ownershipToDelete.lotNumber}`
        );

        setOwnerships((prev) => {
          const next = prev.filter((o) => String(o.id) !== String(ownershipToDelete.id));
          setGroupedOwnerships(groupOwnershipsByCustomer(next));
          return next;
        });
        
        closeDeleteOwnership();
        fetchOwnerships(false); // Refresh the list
        setPage(1);
      } else {
        showToast(data.message || 'Failed to delete ownership', 'error');
      }
    } catch (error) {
      console.error('Error deleting ownership:', error);
      showToast('Error deleting ownership', 'error');
    }
  };

  // Reserved for future status-based UI styling if needed

  console.log('Current ownerships state:', ownerships); // Debug log
  console.log('Loading state:', loading); // Debug log
  
  if (loading) {
    return (
      <div className="mt-12">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Loading ownership records...
        </Typography>
      </div>
    );
  }

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="mb-8">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Ownership Management
        </Typography>
        <Typography variant="small" color="blue-gray" className="opacity-70">
          Manage lot ownership records and customer information
        </Typography>
      </div>

      {/* Main Content */}
      <Card className="overflow-hidden">
        <CardHeader
          floated={false}
          shadow={false}
          color="transparent"
          className="m-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6"
        >
          <Typography variant="h5" color="blue-gray" className="mb-1">
            Lot Ownership Records
          </Typography>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:w-auto">
            <div className="w-full sm:w-72 sm:flex-shrink-0">
              <Input
                label="Search ownership records..."
                icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                value={query}
                onChange={e => { 
                  const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                  setQuery(filtered); 
                  setPage(1); 
                }}
              />
            </div>
            <Button 
              className="flex items-center justify-center gap-3 w-full sm:w-auto sm:flex-shrink-0" 
              color="green" 
              onClick={() => setIsPriceDialogOpen(true)}
            >
              <CurrencyDollarIcon strokeWidth={2} className="h-4 w-4" /> 
              Set Price
            </Button>
            <Button 
              className="flex items-center justify-center gap-3 w-full sm:w-auto sm:flex-shrink-0" 
              color="blue" 
              onClick={openAddOwnership}
            >
              <PlusCircleIcon strokeWidth={2} className="h-4 w-4" /> 
              Add Ownership
            </Button>
          </div>
        </CardHeader>
        <CardBody className="px-0 pt-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr>
                  <th
                    className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('customerName')}
                  >
                    <div className="flex items-center gap-1">
                      <Typography
                        variant="small"
                        className="text-[11px] font-medium uppercase text-blue-gray-400"
                      >
                        Customer
                      </Typography>
                      {sortConfig.key === 'customerName' && (
                        sortConfig.direction === 'asc' ? 
                          <ChevronUpIcon className="h-4 w-4 text-blue-gray-400" /> : 
                          <ChevronDownIcon className="h-4 w-4 text-blue-gray-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('totalLots')}
                  >
                    <div className="flex items-center gap-1">
                      <Typography
                        variant="small"
                        className="text-[11px] font-medium uppercase text-blue-gray-400"
                      >
                        Total Lots
                      </Typography>
                      {sortConfig.key === 'totalLots' && (
                        sortConfig.direction === 'asc' ? 
                          <ChevronUpIcon className="h-4 w-4 text-blue-gray-400" /> : 
                          <ChevronDownIcon className="h-4 w-4 text-blue-gray-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-1">
                      <Typography
                        variant="small"
                        className="text-[11px] font-medium uppercase text-blue-gray-400"
                      >
                        Ownership Status
                      </Typography>
                      {sortConfig.key === 'status' && (
                        sortConfig.direction === 'asc' ? 
                          <ChevronUpIcon className="h-4 w-4 text-blue-gray-400" /> : 
                          <ChevronDownIcon className="h-4 w-4 text-blue-gray-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="border-b border-blue-gray-50 py-3 px-6 text-left"
                  >
                    <Typography
                      variant="small"
                      className="text-[11px] font-medium uppercase text-blue-gray-400"
                    >
                      Actions
                    </Typography>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const norm = (v) => String(v || '').toLowerCase();
                  let filtered = groupedOwnerships.filter(o =>
                    norm(o.customerName).includes(query.toLowerCase()) ||
                    norm(o.status).includes(query.toLowerCase())
                  );
                  
                  // Apply sorting
                  if (sortConfig.key) {
                    filtered = [...filtered].sort((a, b) => {
                      let aVal, bVal;
                      
                      switch (sortConfig.key) {
                        case 'customerName':
                          aVal = (a.customerName || '').toLowerCase();
                          bVal = (b.customerName || '').toLowerCase();
                          break;
                        case 'totalLots':
                          aVal = a.totalLots || 0;
                          bVal = b.totalLots || 0;
                          break;
                        case 'status':
                          aVal = a.status || '';
                          bVal = b.status || '';
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
                        <td colSpan={4} className="py-12 text-center">
                          <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                            {query ? "No results found" : "No ownership records available"}
                          </Typography>
                        </td>
                      </tr>
                    );
                  }
                  
                  return paged.map((customer, key) => {
                    const className = `py-3 px-6 ${key === paged.length - 1 ? "" : "border-b border-blue-gray-50"}`;
                    return (
                      <tr key={key} className="hover:bg-blue-50 transition-colors">
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-semibold"
                          >
                            {customer.customerName}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">
                            {customer.totalLots} {customer.totalLots === 1 ? 'lot' : 'lots'}
                          </Typography>
                        </td>
                        <td className={className}>
                          {customer.status === 'Occupied' ? (
                            <Chip variant="ghost" color="green" value="OCCUPIED" className="text-center font-medium w-fit bg-green-100 text-green-800 border-green-200" />
                          ) : customer.status === 'Mixed' ? (
                            <Chip variant="ghost" color="yellow" value="MIXED" className="text-center font-medium w-fit bg-yellow-100 text-yellow-800 border-yellow-200" />
                          ) : (
                            <Chip variant="ghost" color="blue" value="RESERVED" className="text-center font-medium w-fit bg-blue-100 text-blue-800 border-blue-200" />
                          )}
                        </td>
                        <td className={className}>
                          <div className="flex gap-2">
                            <Tooltip content="View All Lots">
                              <Button
                                variant="outlined"
                                color="blue"
                                size="sm"
                                onClick={() => openViewLots(customer)}
                              >
                                Owned Lots
                              </Button>
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
            const filtered=groupedOwnerships.filter(o=>norm(o.customerName).includes(query.toLowerCase())||norm(o.status).includes(query.toLowerCase()));
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
                const filtered=groupedOwnerships.filter(o=>norm(o.customerName).includes(query.toLowerCase())||norm(o.status).includes(query.toLowerCase()));
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
              const filtered=groupedOwnerships.filter(o=>norm(o.customerName).includes(query.toLowerCase())||norm(o.status).includes(query.toLowerCase()));
              return Math.max(1, Math.ceil(filtered.length / pageSize));
            })()}
            onClick={() => setPage(p => Math.min((() => {
              const norm=(v)=>String(v||'').toLowerCase();
              const filtered=groupedOwnerships.filter(o=>norm(o.customerName).includes(query.toLowerCase())||norm(o.status).includes(query.toLowerCase()));
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
              const filtered=groupedOwnerships.filter(o=>norm(o.customerName).includes(query.toLowerCase())||norm(o.status).includes(query.toLowerCase()));
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
              onChange={(v) => { const n = Number(v); setPageSize(n); localStorage.setItem('ownership_page_size', String(n)); setPage(1); }}
              containerProps={{ className: "min-w-[90px]" }}
            >
              {[5,10,20,50].map(n => <Option key={n} value={String(n)}>{n}</Option>)}
            </Select>
          </div>
        </div>
      </div>


      {/* Add Ownership Dialog */}
      <Dialog
        open={isAddDialogOpen}
        handler={() => {}}
        dismiss={{ enabled: false }}
        size="lg"
        className="w-full max-w-4xl max-h-[95vh] flex flex-col"
      >
        <DialogHeader>Add New Ownership Record</DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-8">
            <section className="rounded-2xl border border-blue-gray-100 bg-white shadow-sm p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Typography variant="h6" color="blue-gray">
                    1. Customer & Lot Selection
                  </Typography>
                  <Typography variant="small" color="blue-gray" className="opacity-70">
                    Choose a customer, browse the map, then add each cemetery lot to the cart. You can mix gardens, sectors, blocks, and even payment terms—each lot is tracked separately.
                  </Typography>
                </div>
                <Chip
                  color="blue"
                  variant="ghost"
                  value={`${selectedLots.length} in cart`}
                  className="flex items-center gap-2"
                  icon={<ShoppingCartIcon className="h-4 w-4" />}
                />
              </div>
              <Alert color="blue" variant="ghost" className="text-xs md:text-sm">
                All lots in this cart will be assigned to the same customer. Clear the cart first if you need to switch customers.
              </Alert>

              <div className="space-y-4">
                <DropdownField
                  label="Customer"
                  value={ownershipForm.customer_id}
                  options={filteredCustomers.map((c) => ({
                    value: String(c.id),
                    label: `${c.last_name ?? ''}, ${c.first_name ?? ''} (${c.username})`,
                  }))}
                  onSelect={(customerId) => {
                    if (selectedLots.length > 0 && ownershipForm.customer_id && ownershipForm.customer_id !== customerId) {
                      showToast('Please clear the lot cart before switching to a different customer.', 'error');
                      return;
                    }
                    setTouchedFields({ ...touchedFields, customer_id: true });
                    handleFormChange('customer_id', customerId);
                    if (!customerId || customerId.trim() === '') {
                      setFieldErrors({ ...fieldErrors, customer_id: 'Customer is required' });
                    } else {
                      setFieldErrors({ ...fieldErrors, customer_id: '' });
                    }
                  }}
                  error={touchedFields.customer_id && (!ownershipForm.customer_id || ownershipForm.customer_id.trim() === '')}
                  emptyMessage="No customers available"
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <DropdownField
                    label="Garden"
                    value={ownershipForm.garden}
                    options={gardens.map((g) => ({ value: g, label: g }))}
                    onSelect={(v) => {
                      setTouchedFields({ ...touchedFields, garden: true });
                      handleFormChange('garden', v);
                      if (!v || v.trim() === '') {
                        setFieldErrors({ ...fieldErrors, garden: 'Garden is required' });
                      } else {
                        setFieldErrors({ ...fieldErrors, garden: '' });
                      }
                    }}
                    error={touchedFields.garden && (!ownershipForm.garden || ownershipForm.garden.trim() === '')}
                    emptyMessage="No gardens available"
                  />
                  <DropdownField
                    label="Sector"
                    value={ownershipForm.sector}
                    options={sectors.map((s) => ({ value: s, label: s }))}
                    onSelect={(v) => {
                      setTouchedFields({ ...touchedFields, sector: true });
                      handleFormChange('sector', v);
                      if (!v || v.trim() === '') {
                        setFieldErrors({ ...fieldErrors, sector: 'Sector is required' });
                      } else {
                        setFieldErrors({ ...fieldErrors, sector: '' });
                      }
                    }}
                    error={touchedFields.sector && (!ownershipForm.sector || ownershipForm.sector.trim() === '')}
                    emptyMessage={ownershipForm.garden ? "No sectors available" : "Select a garden first"}
                  />
                  <DropdownField
                    label="Block"
                    value={ownershipForm.block}
                    options={blocks.map((blockNum) => {
                      const lotType = blockLotTypes[blockNum];
                      const typeLabel = lotType ? lotType.charAt(0).toUpperCase() + lotType.slice(1) : '';
                      return {
                        value: String(blockNum),
                        label: typeLabel ? `${blockNum} - ${typeLabel}` : String(blockNum),
                      };
                    })}
                    onSelect={(v) => {
                      setTouchedFields({ ...touchedFields, block: true });
                      handleFormChange('block', v);
                      if (!v || v.trim() === '') {
                        setFieldErrors({ ...fieldErrors, block: 'Block is required' });
                      } else {
                        setFieldErrors({ ...fieldErrors, block: '' });
                      }
                    }}
                    error={touchedFields.block && (!ownershipForm.block || ownershipForm.block.trim() === '')}
                    emptyMessage={ownershipForm.sector ? "No blocks available" : "Select a sector first"}
                  />
                  <DropdownField
                    label="Lot Number"
                    value={ownershipForm.lotNumber}
                    options={availableLots
                      .filter((ln) => {
                        if (!ownershipForm.garden || !ownershipForm.sector || !ownershipForm.block) return true;
                        return !selectedLots.some(lot => 
                          lot.garden === ownershipForm.garden && 
                          lot.sector === ownershipForm.sector && 
                          lot.block === ownershipForm.block && 
                          lot.lotNumber === String(ln)
                        );
                      })
                      .map((ln) => ({ value: String(ln), label: String(ln) }))}
                    onSelect={(v) => {
                      setTouchedFields({ ...touchedFields, lotNumber: true });
                      handleFormChange('lotNumber', v);
                      if (!v || v.trim() === '') {
                        setFieldErrors({ ...fieldErrors, lotNumber: 'Lot Number is required' });
                      } else {
                        setFieldErrors({ ...fieldErrors, lotNumber: '' });
                      }
                    }}
                    error={touchedFields.lotNumber && (!ownershipForm.lotNumber || ownershipForm.lotNumber.trim() === '')}
                    emptyMessage={ownershipForm.block ? "No lots available for this block" : "Select a block first"}
                  />
                </div>

                <div className="rounded-xl border border-blue-gray-100 bg-blue-50/60 p-3">
                  <Typography variant="small" color="blue-gray" className="font-medium">
                    Current Lot Type
                  </Typography>
                  <Typography variant="small" color="blue-gray" className="mt-1 font-semibold">
                    {ownershipForm.lotType ? ownershipForm.lotType.charAt(0).toUpperCase() + ownershipForm.lotType.slice(1) : '—'}
                  </Typography>
                  <Typography variant="small" color="blue-gray" className="text-xs opacity-80">
                    Determined automatically from the selected block and garden.
                  </Typography>
                </div>

                <div className="rounded-2xl border border-blue-gray-100 bg-white shadow-sm p-4 space-y-4">
                  <div>
                    <Typography variant="h6" color="blue-gray">
                      Payment Plan for This Lot
                    </Typography>
                    <Typography variant="small" color="blue-gray" className="opacity-70">
                      Select the term before adding to the cart. Each lot can follow a different schedule.
                    </Typography>
                  </div>

                  <DropdownField
                    label="Payment Term"
                    value={ownershipForm.payment_term_months}
                    options={[
                      { value: "atneed", label: "At Need" },
                      { value: "spotcash", label: "Spot Cash" },
                      { value: "12", label: "12 Months" },
                      { value: "24", label: "24 Months" },
                      { value: "36", label: "36 Months" },
                      { value: "48", label: "48 Months" },
                      { value: "60", label: "60 Months" },
                    ]}
                    onSelect={(v) => setOwnershipForm((p) => ({
                      ...p,
                      payment_term_months: v,
                      down_payment_option: (v === 'atneed' || v === 'spotcash') ? '' : p.down_payment_option,
                      due_day: (v === 'atneed' || v === 'spotcash') ? '' : p.due_day,
                    }))}
                    emptyMessage="No payment terms available"
                  />
                  {ownershipForm.payment_term_months !== 'atneed' && ownershipForm.payment_term_months !== 'spotcash' && (
                    <>
                      <DropdownField
                        label="Down Payment Option (Required)"
                        value={ownershipForm.down_payment_option}
                        options={[
                          { value: "1dp", label: "1 DP", description: `${priceConfig.down_payment_percentage}% upfront` },
                          { value: "2split", label: "2 Split DP", description: `${priceConfig.down_payment_percentage}% split into 2 payments` },
                        ]}
                        onSelect={(v) => {
                          setTouchedFields({ ...touchedFields, down_payment_option: true });
                          setOwnershipForm((p) => ({ ...p, down_payment_option: v }));
                          if (!v || v.trim() === '') {
                            setFieldErrors({ ...fieldErrors, down_payment_option: 'Down Payment Option is required' });
                          } else {
                            setFieldErrors({ ...fieldErrors, down_payment_option: '' });
                          }
                        }}
                        error={touchedFields.down_payment_option && (!ownershipForm.down_payment_option || ownershipForm.down_payment_option.trim() === '')}
                        emptyMessage="Select a payment term first"
                      />
                      {ownershipForm.down_payment_option && (
                        <DropdownField
                          label="Due Date Day of Month (1-31)"
                          value={ownershipForm.due_day}
                          options={Array.from({ length: 31 }, (_, i) => ({
                            value: String(i + 1),
                            label: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} of each month`
                          }))}
                          onSelect={(v) => {
                            setOwnershipForm((p) => ({ ...p, due_day: v }));
                          }}
                          emptyMessage="Select a day"
                        />
                      )}
                    </>
                  )}

                  {ownershipForm.lotType && (
                    <div className="mt-2 p-4 bg-blue-50 rounded-xl space-y-2">
                      <Typography variant="small" color="blue-gray" className="font-bold">
                        Live Preview for {ownershipForm.lotType.charAt(0).toUpperCase() + ownershipForm.lotType.slice(1)} lot
                      </Typography>
                      {ownershipForm.payment_term_months === 'atneed' ? (
                        (() => {
                          const breakdown = computeLotPricing({
                            lotType: ownershipForm.lotType,
                            payment_term_months: 'atneed',
                          });
                          return (
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between">
                                <span>Base Price</span>
                                <span>{formatCurrency(breakdown.basePrice)}</span>
                              </div>
                              {breakdown.markupAmount > 0 && (
                                <div className="flex justify-between text-orange-600">
                                  <span>Markup ({priceConfig.atneed_markup}%)</span>
                                  <span>+{formatCurrency(breakdown.markupAmount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-semibold">
                                <span>Total Due Today</span>
                                <span>{formatCurrency(breakdown.finalTotal)}</span>
                              </div>
                            </div>
                          );
                        })()
                      ) : ownershipForm.payment_term_months === 'spotcash' ? (
                        (() => {
                          const breakdown = computeLotPricing({
                            lotType: ownershipForm.lotType,
                            payment_term_months: 'spotcash',
                          });
                          return (
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between">
                                <span>Base Price</span>
                                <span>{formatCurrency(breakdown.basePrice)}</span>
                              </div>
                              {breakdown.discountAmount > 0 && (
                                <div className="flex justify-between text-green-600">
                                  <span>Discount ({priceConfig.spot_cash_discount}%)</span>
                                  <span>-{formatCurrency(breakdown.discountAmount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-semibold">
                                <span>Total Due Today</span>
                                <span>{formatCurrency(breakdown.finalTotal)}</span>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        (() => {
                          const breakdown = computeLotPricing({
                            lotType: ownershipForm.lotType,
                            payment_term_months: ownershipForm.payment_term_months,
                            down_payment_option: ownershipForm.down_payment_option || '',
                          });
                          const balanceBeforeInterest = breakdown.basePrice - breakdown.downPayment;
                          return (
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between">
                                <span>Base Price</span>
                                <span>{formatCurrency(breakdown.basePrice)}</span>
                              </div>
                              {breakdown.downPayment > 0 && (
                                <>
                                  <div className="flex justify-between">
                                    <span>Down Payment ({priceConfig.down_payment_percentage}%)
                                      {ownershipForm.down_payment_option === '2split' ? ' (split into 2)' : ''}
                                    </span>
                                    <span>{formatCurrency(breakdown.downPayment)}</span>
                                  </div>
                                  {ownershipForm.down_payment_option === '2split' && (
                                    <div className="flex justify-between text-xs text-blue-gray-600 pl-4">
                                      <span>Per DP installment</span>
                                      <span>{formatCurrency(breakdown.downPayment / 2)}</span>
                                    </div>
                                  )}
                                </>
                              )}
                              <div className="flex justify-between">
                                <span>Balance before interest</span>
                                <span>{formatCurrency(balanceBeforeInterest)}</span>
                              </div>
                              {breakdown.interestAmount > 0 && (
                                <div className="flex justify-between text-orange-600">
                                  <span>Projected Interest</span>
                                  <span>+{formatCurrency(breakdown.interestAmount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span>Installment Balance</span>
                                <span>{formatCurrency(breakdown.installmentBalance)}</span>
                              </div>
                              {breakdown.monthlyPayment > 0 && (
                                <div className="flex justify-between font-semibold text-blue-600">
                                  <span>Monthly Payment ({describePaymentTerm(ownershipForm.payment_term_months)})</span>
                                  <span>{formatCurrency(breakdown.monthlyPayment)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center pt-4 border-t border-blue-gray-100">
                <Button
                  variant="outlined"
                  color="blue"
                  className="flex items-center gap-2 w-full md:w-auto"
                  onClick={addLotToSelection}
                  disabled={!canAddLot}
                >
                  <PlusCircleIcon className="h-4 w-4" />
                  Add Lot to Cart
                </Button>
                <Typography variant="small" color="blue-gray" className="opacity-70 md:ml-3">
                  Add each cemetery lot after confirming its payment term. You can repeat for other gardens, sectors, or blocks under the same customer.
                </Typography>
              </div>
            </section>

            <section className="rounded-2xl border border-blue-gray-100 bg-white shadow-sm p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Typography variant="h6" color="blue-gray">
                    3. Review Cart & Totals
                  </Typography>
                  <Typography variant="small" color="blue-gray" className="opacity-70">
                    Fine-tune each lot like an e-commerce cart. Edit or remove items and review the automatic computation before submitting.
                  </Typography>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-3">
                  {selectedLots.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-blue-gray-200 rounded-2xl bg-blue-50/40">
                      <ShoppingCartIcon className="w-10 h-10 mx-auto text-blue-300" />
                      <Typography variant="small" color="blue-gray" className="mt-3 font-semibold">
                        Cart is empty
                      </Typography>
                      <Typography variant="small" color="blue-gray" className="opacity-70">
                        Add at least one lot to see the detailed breakdown here.
                      </Typography>
                    </div>
                  ) : (
                    selectedLots.map((lot, index) => {
                      const breakdown = computeLotPricing(lot);
                      const paymentTermLabel = describePaymentTerm(lot.payment_term_months || ownershipForm.payment_term_months || 'atneed');
                      return (
                        <div
                          key={lot.key || `${lot.garden}-${lot.sector}-${lot.block}-${lot.lotNumber}-${index}`}
                          className="border border-blue-gray-100 rounded-2xl p-4 bg-gradient-to-br from-white to-blue-50/30"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <Typography variant="small" color="blue-gray" className="font-semibold">
                                {lot.garden} {lot.sector}{lot.block}-{lot.lotNumber}
                              </Typography>
                              <Typography variant="small" color="blue-gray" className="text-xs">
                                {lot.lotType?.charAt(0).toUpperCase() + lot.lotType?.slice(1)} • Base price {formatCurrency(breakdown.basePrice)}
                              </Typography>
                            </div>
                            <div className="flex gap-1">
                              <Tooltip content="Edit lot payment plan">
                                <IconButton
                                  variant="text"
                                  color="blue"
                                  size="sm"
                                  onClick={() => openLotEditorDialog(index)}
                                >
                                  <PencilIcon className="h-4 w-4" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip content="Remove lot from cart">
                                <IconButton
                                  variant="text"
                                  color="red"
                                  size="sm"
                                  onClick={() => removeLotFromSelection(index)}
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </IconButton>
                              </Tooltip>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2 mt-3 text-sm">
                            <div className="space-y-1">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                Payment Plan
                              </Typography>
                              <ul className="space-y-1 text-blue-gray-600">
                                <li>Term: <strong>{paymentTermLabel}</strong></li>
                                {lot.payment_term_months !== 'atneed' && lot.payment_term_months !== 'spotcash' && (
                                  <>
                                    <li>
                                      Down Payment: <strong>{lot.down_payment_option === '2split' ? '2 Split DP' : '1 DP'}</strong>
                                    </li>
                                    {lot.due_day && (
                                      <li>Due every {lot.due_day}{Number(lot.due_day) === 1 ? 'st' : Number(lot.due_day) === 2 ? 'nd' : Number(lot.due_day) === 3 ? 'rd' : 'th'}</li>
                                    )}
                                  </>
                                )}
                              </ul>
                            </div>
                            <div className="space-y-1">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                Price Breakdown
                              </Typography>
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <span>Base Price</span>
                                  <span>{formatCurrency(breakdown.basePrice)}</span>
                                </div>
                                {breakdown.markupAmount > 0 && (
                                  <div className="flex justify-between text-orange-600">
                                    <span>Markup</span>
                                    <span>+{formatCurrency(breakdown.markupAmount)}</span>
                                  </div>
                                )}
                                {breakdown.discountAmount > 0 && (
                                  <div className="flex justify-between text-green-600">
                                    <span>Discount</span>
                                    <span>-{formatCurrency(breakdown.discountAmount)}</span>
                                  </div>
                                )}
                                {breakdown.downPayment > 0 && (
                                  <div className="flex justify-between">
                                    <span>Down Payment</span>
                                    <span>{formatCurrency(breakdown.downPayment)}</span>
                                  </div>
                                )}
                                {breakdown.interestAmount > 0 && (
                                  <div className="flex justify-between text-orange-600">
                                    <span>Interest</span>
                                    <span>+{formatCurrency(breakdown.interestAmount)}</span>
                                  </div>
                                )}
                                {breakdown.installmentBalance > 0 && (
                                  <div className="flex justify-between">
                                    <span>Installment Balance</span>
                                    <span>{formatCurrency(breakdown.installmentBalance)}</span>
                                  </div>
                                )}
                                {breakdown.monthlyPayment > 0 && (
                                  <div className="flex justify-between text-blue-600">
                                    <span>Monthly Payment</span>
                                    <span>{formatCurrency(breakdown.monthlyPayment)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-semibold text-blue-gray-900">
                                  <span>Total per lot</span>
                                  <span>{formatCurrency(breakdown.finalTotal)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="lg:col-span-1">
                  <div className="rounded-2xl border border-blue-gray-100 bg-blue-gray-50/70 p-4 space-y-3">
                    <Typography variant="h6" color="blue-gray" className="flex items-center justify-between">
                      Order Summary
                      <span className="text-sm font-normal">({cartSummary.lotCount} lot{cartSummary.lotCount === 1 ? '' : 's'})</span>
                    </Typography>
                    {cartSummary.lotCount === 0 ? (
                      <Typography variant="small" color="blue-gray" className="opacity-70">
                        Add at least one lot to enable checkout.
                      </Typography>
                    ) : (
                      <div className="space-y-1 text-sm text-blue-gray-700">
                        <div className="flex justify-between">
                          <span>Base Total</span>
                          <span>{formatCurrency(cartSummary.baseTotal)}</span>
                        </div>
                        {cartSummary.markupTotal > 0 && (
                          <div className="flex justify-between text-orange-600">
                            <span>Markups</span>
                            <span>+{formatCurrency(cartSummary.markupTotal)}</span>
                          </div>
                        )}
                        {cartSummary.discountTotal > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discounts</span>
                            <span>-{formatCurrency(cartSummary.discountTotal)}</span>
                          </div>
                        )}
                        {cartSummary.interestTotal > 0 && (
                          <div className="flex justify-between text-orange-600">
                            <span>Interest (installments)</span>
                            <span>+{formatCurrency(cartSummary.interestTotal)}</span>
                          </div>
                        )}
                        {cartSummary.downPaymentTotal > 0 && (
                          <div className="flex justify-between">
                            <span>Down Payments</span>
                            <span>{formatCurrency(cartSummary.downPaymentTotal)}</span>
                          </div>
                        )}
                        {cartSummary.installmentBalance > 0 && (
                          <div className="flex justify-between">
                            <span>Installment Balance</span>
                            <span>{formatCurrency(cartSummary.installmentBalance)}</span>
                          </div>
                        )}
                        <hr className="my-2 border-blue-gray-200" />
                        <div className="flex justify-between text-base font-semibold">
                          <span>Grand Total</span>
                          <span>{formatCurrency(cartSummary.grandTotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Due Today</span>
                          <span>{formatCurrency(cartSummary.dueToday)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Estimated Monthly</span>
                          <span>{cartSummary.monthlyTotal > 0 ? formatCurrency(cartSummary.monthlyTotal) : '—'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex gap-3">
            <Button variant="text" color="red" onClick={closeAddOwnership}>
              Cancel
            </Button>
            <Button onClick={saveOwnership}>
              {selectedLots.length > 0 
                ? `Purchase ${selectedLots.length} Lot${selectedLots.length > 1 ? 's' : ''}` 
                : 'Add Ownership'}
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      {/* Edit Lot Plan Dialog */}
      <Dialog
        open={lotEditingIndex !== null && !!lotEditingDraft}
        handler={closeLotEditorDialog}
        dismiss={{ enabled: false }}
        size="md"
        className="w-full max-w-2xl"
      >
        <DialogHeader>Adjust Lot Payment Plan</DialogHeader>
        <DialogBody className="space-y-5">
          {lotEditingDraft ? (
            <>
              <div className="rounded-xl border border-blue-gray-100 bg-blue-50/60 p-3">
                <Typography variant="small" color="blue-gray" className="font-semibold">
                  {lotEditingDraft.garden} {lotEditingDraft.sector}{lotEditingDraft.block}-{lotEditingDraft.lotNumber}
                </Typography>
                <Typography variant="small" color="blue-gray" className="text-xs">
                  {lotEditingDraft.lotType?.charAt(0).toUpperCase() + lotEditingDraft.lotType?.slice(1)} • Base price {formatCurrency(getPriceByType(lotEditingDraft.lotType))}
                </Typography>
              </div>
              <DropdownField
                label="Payment Term"
                value={lotEditingDraft.payment_term_months || 'atneed'}
                options={[
                  { value: "atneed", label: "At Need" },
                  { value: "spotcash", label: "Spot Cash" },
                  { value: "12", label: "12 Months" },
                  { value: "24", label: "24 Months" },
                  { value: "36", label: "36 Months" },
                  { value: "48", label: "48 Months" },
                  { value: "60", label: "60 Months" },
                ]}
                onSelect={(v) => handleLotEditorFieldChange('payment_term_months', v)}
                emptyMessage="No payment terms available"
              />
              {lotEditorNeedsDP && (
                <>
                  <DropdownField
                    label="Down Payment Option"
                    value={lotEditingDraft.down_payment_option || ''}
                    options={[
                      { value: "1dp", label: "1 DP", description: `${priceConfig.down_payment_percentage}% upfront` },
                      { value: "2split", label: "2 Split DP", description: `${priceConfig.down_payment_percentage}% split into 2 payments` },
                    ]}
                    onSelect={(v) => handleLotEditorFieldChange('down_payment_option', v)}
                    emptyMessage="Select an option"
                  />
                  {lotEditingDraft.down_payment_option && (
                    <DropdownField
                      label="Due Date Day of Month (1-31)"
                      value={lotEditingDraft.due_day || ''}
                      options={Array.from({ length: 31 }, (_, i) => ({
                        value: String(i + 1),
                        label: `${i + 1}${i + 1 === 1 ? 'st' : i + 1 === 2 ? 'nd' : i + 1 === 3 ? 'rd' : 'th'} of each month`
                      }))}
                      onSelect={(v) => handleLotEditorFieldChange('due_day', v)}
                      emptyMessage="Select a billing day"
                    />
                  )}
                </>
              )}
              <div className="rounded-xl border border-blue-gray-100 p-3 bg-white">
                <Typography variant="small" color="blue-gray" className="font-medium mb-1">
                  Instant Preview
                </Typography>
                {(() => {
                  const preview = computeLotPricing(lotEditingDraft);
                  return (
                    <div className="space-y-1 text-sm text-blue-gray-700">
                      <div className="flex justify-between">
                        <span>Base Price</span>
                        <span>{formatCurrency(preview.basePrice)}</span>
                      </div>
                      {preview.downPayment > 0 && (
                        <div className="flex justify-between">
                          <span>Down Payment</span>
                          <span>{formatCurrency(preview.downPayment)}</span>
                        </div>
                      )}
                      {preview.interestAmount > 0 && (
                        <div className="flex justify-between text-orange-600">
                          <span>Projected Interest</span>
                          <span>+{formatCurrency(preview.interestAmount)}</span>
                        </div>
                      )}
                      {preview.installmentBalance > 0 && (
                        <div className="flex justify-between">
                          <span>Installment Balance</span>
                          <span>{formatCurrency(preview.installmentBalance)}</span>
                        </div>
                      )}
                      {preview.monthlyPayment > 0 && (
                        <div className="flex justify-between text-blue-600">
                          <span>Monthly Payment</span>
                          <span>{formatCurrency(preview.monthlyPayment)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold">
                        <span>Total per lot</span>
                        <span>{formatCurrency(preview.finalTotal)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <Typography variant="small" color="blue-gray">
              Select a lot to edit its plan.
            </Typography>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="text" color="red" onClick={closeLotEditorDialog}>
            Cancel
          </Button>
          <Button onClick={saveLotEditorChanges} disabled={!lotEditingDraft || !canSaveLotEditor}>
            Save Lot Plan
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Ownership Dialog */}
      <Dialog open={isEditDialogOpen} handler={() => {}} dismiss={{ enabled: false }} size="lg">
        <DialogHeader>Edit Ownership Record</DialogHeader>
        <DialogBody className="p-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="From (Current Owner)" value={editingOwnership?.customer || ''} readOnly />
            <Select 
              label="To (New Owner)" 
              value={getSelectedCustomerName()} 
              onChange={(v) => {
                // Find customer by display name and set the ID
                const selectedCustomer = customers.find(c => 
                  `${c.last_name ?? ''}, ${c.first_name ?? ''} (${c.username})` === v
                );
                if (selectedCustomer) {
                  setOwnershipForm((p) => ({ ...p, customer_id: String(selectedCustomer.id) }));
                }
              }}
            >
              {filteredCustomers.length === 0 ? (
                <Option value="" disabled>
                  Select a customer
                </Option>
              ) : (
                filteredCustomers.map((c) => (
                  <Option key={c.id} value={`${c.last_name ?? ''}, ${c.first_name ?? ''} (${c.username})`}>
                    {`${c.last_name ?? ''}, ${c.first_name ?? ''} (${c.username})`}
                  </Option>
                ))
              )}
            </Select>
            <Input label="Garden" value={ownershipForm.garden} readOnly />
            <Input label="Sector" value={ownershipForm.sector} readOnly />
            <Input label="Block" value={ownershipForm.block} readOnly />
            <Input label="Lot Number" value={ownershipForm.lotNumber} readOnly />
            <Input label="Lot Type" value={ownershipForm.lotType} readOnly />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="text" color="red" onClick={closeEditOwnership}>
            Cancel
          </Button>
          <Button onClick={saveEditOwnership}>
            Save Changes
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} handler={() => {}} dismiss={{ enabled: false }} size="sm">
        <DialogHeader>Delete Ownership Record</DialogHeader>
        <DialogBody className="max-h-[80vh] overflow-y-auto">
          <Typography variant="small" color="blue-gray" className="font-normal">
            Are you sure you want to delete the ownership record for{" "}
            <strong>{ownershipToDelete?.customer}</strong> (Lot {ownershipToDelete?.lotNumber})?
            This action cannot be undone.
          </Typography>
        </DialogBody>
        <DialogFooter>
          <Button variant="text" color="red" onClick={closeDeleteOwnership}>
            Cancel
          </Button>
          <Button color="red" onClick={deleteOwnership}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Price Configuration Dialog */}
      <Dialog
        open={isPriceDialogOpen}
        handler={() => {}}
        dismiss={{ enabled: false }}
        size="lg"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
      >
        <DialogHeader>Set Lot Prices & Interest</DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4">
            <Typography variant="h6" color="blue-gray" className="mb-2">
              Lot Prices (₱)
            </Typography>
            <Input 
              label="Standard Lot Price" 
              type="number"
              step="1000"
              min="0"
              value={priceConfig.standard_price} 
              onChange={(e) => setPriceConfig(p => ({ ...p, standard_price: e.target.value }))}
            />
            <Input 
              label="Deluxe Lot Price" 
              type="number"
              step="1000"
              min="0"
              value={priceConfig.deluxe_price} 
              onChange={(e) => setPriceConfig(p => ({ ...p, deluxe_price: e.target.value }))}
            />
            <Input 
              label="Premium Lot Price" 
              type="number"
              step="1000"
              min="0"
              value={priceConfig.premium_price} 
              onChange={(e) => setPriceConfig(p => ({ ...p, premium_price: e.target.value }))}
            />
            <Typography variant="h6" color="blue-gray" className="mb-2 mt-4">
              Special Pricing
            </Typography>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input 
                label="Spot Cash Discount (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.spot_cash_discount} 
                onChange={(e) => setPriceConfig(p => ({ ...p, spot_cash_discount: e.target.value }))}
              />
              <Input 
                label="At Need Markup (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.atneed_markup} 
                onChange={(e) => setPriceConfig(p => ({ ...p, atneed_markup: e.target.value }))}
              />
              <Input 
                label="Down Payment Percentage (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.down_payment_percentage} 
                onChange={(e) => setPriceConfig(p => ({ ...p, down_payment_percentage: e.target.value }))}
              />
            </div>
            
            <Typography variant="h6" color="blue-gray" className="mb-2 mt-4">
              Interest Rates by Payment Term
            </Typography>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input 
                label="1 Year Interest (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.interest_1year} 
                onChange={(e) => setPriceConfig(p => ({ ...p, interest_1year: e.target.value }))}
              />
              <Input 
                label="2 Year Interest (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.interest_2year} 
                onChange={(e) => setPriceConfig(p => ({ ...p, interest_2year: e.target.value }))}
              />
              <Input 
                label="3 Year Interest (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.interest_3year} 
                onChange={(e) => setPriceConfig(p => ({ ...p, interest_3year: e.target.value }))}
              />
              <Input 
                label="4 Year Interest (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.interest_4year} 
                onChange={(e) => setPriceConfig(p => ({ ...p, interest_4year: e.target.value }))}
              />
              <Input 
                label="5 Year Interest (%)" 
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={priceConfig.interest_5year} 
                onChange={(e) => setPriceConfig(p => ({ ...p, interest_5year: e.target.value }))}
              />
            </div>
            <div className="mt-2 p-3 bg-blue-50 rounded-lg">
              <Typography variant="small" color="blue-gray">
                <strong>Current Configuration:</strong>
              </Typography>
              <Typography variant="small" color="blue-gray" className="mt-1">
                <strong>Prices:</strong><br/>
                Standard: ₱{parseFloat(priceConfig.standard_price || 0).toLocaleString()}<br/>
                Deluxe: ₱{parseFloat(priceConfig.deluxe_price || 0).toLocaleString()}<br/>
                Premium: ₱{parseFloat(priceConfig.premium_price || 0).toLocaleString()}<br/>
                <strong className="mt-2 inline-block">Spot Cash Discount:</strong> {priceConfig.spot_cash_discount}%<br/>
                <strong>At Need Markup:</strong> {priceConfig.atneed_markup}%<br/>
                <strong className="mt-2 inline-block">Interest Rates:</strong><br/>
                1 Year: {priceConfig.interest_1year}% | 2 Years: {priceConfig.interest_2year}%<br/>
                3 Years: {priceConfig.interest_3year}% | 4 Years: {priceConfig.interest_4year}%<br/>
                5 Years: {priceConfig.interest_5year}%
              </Typography>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="text" color="red" onClick={() => setIsPriceDialogOpen(false)}>
            Cancel
          </Button>
          <Button color="green" onClick={async () => {
            try {
              const response = await fetch('/api/set_lot_prices.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(priceConfig)
              });
              const data = await response.json();
              if (data.success) {
                showToast('Prices updated successfully!', 'success');
                
                // Record activity
                await recordActivity(
                  'Updated',
                  'System',
                  `Updated lot prices: Standard ₱${parseFloat(priceConfig.standard_price || 0).toLocaleString()}, Deluxe ₱${parseFloat(priceConfig.deluxe_price || 0).toLocaleString()}, Premium ₱${parseFloat(priceConfig.premium_price || 0).toLocaleString()}, Spot Cash Discount ${priceConfig.spot_cash_discount}%, At Need Markup ${priceConfig.atneed_markup}%`
                );
                
                setIsPriceDialogOpen(false);
              } else {
                showToast('Failed to update prices: ' + (data.message || ''), 'error');
              }
            } catch (e) {
              showToast('Error updating prices: ' + e.message, 'error');
            }
          }}>
            Save Configuration
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Owned Lots Dialog */}
      <Dialog
        open={isViewLotsDialogOpen}
        handler={() => {}}
        dismiss={{ enabled: false }}
        size="xl"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
      >
        <DialogHeader>Lot Details</DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          {selectedCustomerLots.length > 0 && (
            <div className="mb-4">
              <Typography variant="h6" color="blue-gray" className="mb-2">
                Customer: {selectedCustomerLots[0]?.customer}
              </Typography>
              <Typography variant="small" color="blue-gray" className="mb-4">
                Total Lots: {selectedCustomerLots.length}
              </Typography>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr>
                  {[
                    { key: 'garden', label: 'Garden' },
                    { key: 'sector', label: 'Sector' },
                    { key: 'block', label: 'Block' },
                    { key: 'lotNumber', label: 'Lot' },
                    { key: 'vault', label: 'Vault' },
                    { key: 'lotType', label: 'Lot Type' },
                    { key: 'status', label: 'Status' },
                    { key: 'purchaseDate', label: 'Purchase Date' },
                    { key: null, label: 'Actions' }
                  ].map((col) => (
                    <th
                      key={col.key || 'actions'}
                      className={`border-b border-blue-gray-50 py-3 px-4 text-left bg-gray-50 ${col.key ? 'cursor-pointer hover:bg-gray-100' : ''}`}
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
                  let sortedLots = [...selectedCustomerLots];
                  
                  // Apply sorting if a column is being sorted
                  if (sortConfig.key && ['garden', 'sector', 'block', 'lotNumber', 'vault', 'lotType', 'status', 'purchaseDate'].includes(sortConfig.key)) {
                    sortedLots.sort((a, b) => {
                      let aVal, bVal;
                      
                      switch (sortConfig.key) {
                        case 'garden':
                          aVal = (a.garden || '').toLowerCase();
                          bVal = (b.garden || '').toLowerCase();
                          break;
                        case 'sector':
                          aVal = (a.sector || '').toLowerCase();
                          bVal = (b.sector || '').toLowerCase();
                          break;
                        case 'block':
                          aVal = Number(a.block) || 0;
                          bVal = Number(b.block) || 0;
                          break;
                        case 'lotNumber':
                          aVal = Number(a.lotNumber) || 0;
                          bVal = Number(b.lotNumber) || 0;
                          break;
                        case 'vault':
                          aVal = (a.vaultSummary || 'No vault selected').toLowerCase();
                          bVal = (b.vaultSummary || 'No vault selected').toLowerCase();
                          break;
                        case 'lotType':
                          aVal = (a.lotType || '').toLowerCase();
                          bVal = (b.lotType || '').toLowerCase();
                          break;
                        case 'status':
                          aVal = (a.status || '').toLowerCase();
                          bVal = (b.status || '').toLowerCase();
                          break;
                        case 'purchaseDate':
                          aVal = new Date(a.purchaseDate || '1970-01-01').getTime();
                          bVal = new Date(b.purchaseDate || '1970-01-01').getTime();
                          break;
                        default:
                          return 0;
                      }
                      
                      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                      return 0;
                    });
                  }
                  
                  return sortedLots.map((lot, key) => {
                    const className = `py-3 px-4 ${
                      key === sortedLots.length - 1
                        ? ""
                        : "border-b border-blue-gray-50"
                    }`;
                    return (
                      <tr key={lot.id} className="hover:bg-blue-50 transition-colors">
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">{lot.garden}</Typography>
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">{lot.sector}</Typography>
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">{lot.block}</Typography>
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">{lot.lotNumber}</Typography>
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">{lot.vaultSummary || 'No vault selected'}</Typography>
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">{lot.lotType}</Typography>
                        </td>
                        <td className={className}>
                          {lot.status?.toLowerCase() === 'occupied' ? (
                            <Chip variant="ghost" color="green" value="OCCUPIED" className="text-center font-medium w-fit bg-green-100 text-green-800 border-green-200" />
                          ) : (
                            <Chip variant="ghost" color="blue" value="RESERVED" className="text-center font-medium w-fit bg-blue-100 text-blue-800 border-blue-200" />
                          )}
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">{lot.purchaseDate}</Typography>
                        </td>
                        <td className={className}>
                          <div className="flex gap-2">
                            <Tooltip content="Transfer Ownership">
                              <IconButton 
                                variant="text" 
                                color="blue-gray"
                                onClick={() => {
                                  closeViewLots();
                                  openEditOwnership(lot);
                                }}
                              >
                                <ArrowsRightLeftIcon className="h-4 w-4" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip content="Delete Ownership">
                              <IconButton 
                                variant="text" 
                                color="red"
                                onClick={() => {
                                  closeViewLots();
                                  openDeleteOwnership(lot);
                                }}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </IconButton>
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
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="blue-gray" onClick={closeViewLots}>
            Close
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
}

export default OwnershipManagement; 