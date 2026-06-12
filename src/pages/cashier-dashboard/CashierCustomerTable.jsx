import React, { useState, useEffect } from "react";
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
  Chip,
  Select,
  Option,
  Avatar,
  Alert,
  Progress,
} from "@material-tailwind/react";
import {
  MagnifyingGlassIcon,
  EyeIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserIcon,
  XMarkIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ArrowPathIcon,
  BellAlertIcon,
} from "@heroicons/react/24/outline";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs/dist/exceljs.min.js";


export function CashierCustomerTable() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedCustomerDetails, setSelectedCustomerDetails] = useState(null);
  const [loadingCustomerDetails, setLoadingCustomerDetails] = useState(false);
  const [isPaymentHistoryDialogOpen, setIsPaymentHistoryDialogOpen] = useState(false);
  const [isMonthlyStatusDialogOpen, setIsMonthlyStatusDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isMakePaymentDialogOpen, setIsMakePaymentDialogOpen] = useState(false);
  const [isPaymentConfirmationDialogOpen, setIsPaymentConfirmationDialogOpen] = useState(false);
  const [isIntakeDialogOpen, setIsIntakeDialogOpen] = useState(false);
  const [intakePayments, setIntakePayments] = useState([]);
  const [intakeFilter, setIntakeFilter] = useState('all'); // 'today', '30days', 'all'
  const [loadingIntake, setLoadingIntake] = useState(false);
  const [intakeExportFormat, setIntakeExportFormat] = useState('excel');
  const [paymentWizard, setPaymentWizard] = useState({
    mode: 'monthly', // 'monthly' or 'general'
    method: 'Cash',  // 'Cash' | 'Online'
    months: [],      // array of YYYY-MM strings
    lotId: '',
    amount: '',      // total amount for selected months when monthly
    monthlyRate: 0,  // fixed monthly per plan for selected lot
  });
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
  const [isLotStatusDialogOpen, setIsLotStatusDialogOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  // const [statusFilter, setStatusFilter] = useState("active"); // Status filter removed
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('payment_page_size');
    return saved ? Number(saved) : 5;
  });
  // Default sort: by customer name ascending for the main Payments customer table
  const [sortConfig, setSortConfig] = useState({ key: 'customer', direction: 'asc' });
  const [paymentHistorySortConfig, setPaymentHistorySortConfig] = useState({ key: null, direction: 'asc' });
  const [paymentHistorySearchTerm, setPaymentHistorySearchTerm] = useState("");
  const [intakeSortConfig, setIntakeSortConfig] = useState({ key: null, direction: 'asc' });
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentMethod: "Cash",
    selectedMonth: "",
    selectedLot: "",
    notes: "",
  });
  const [successMessage, setSuccessMessage] = useState("");
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [reminderStatus, setReminderStatus] = useState(null);
  
  // Overdue payments state
  const [overdueLots, setOverdueLots] = useState([]);
  const [loadingOverdue, setLoadingOverdue] = useState(false);
  const [overdueSearchTerm, setOverdueSearchTerm] = useState("");
  const [overduePage, setOverduePage] = useState(1);
  const [overduePageSize, setOverduePageSize] = useState(5);
  const [isOverdueExpanded, setIsOverdueExpanded] = useState(false);
  const [overdueSortConfig, setOverdueSortConfig] = useState({ key: null, direction: 'asc' });

  const fetchMonthlyAmountForLot = async (customerId, lotId) => {
    try {
      const res = await fetch(`/api/get_customer_payment_plan.php?customer_id=${customerId}`, { headers: { 'X-User-Id': String(customerId) } });
      const data = await res.json();
      const plan = (data.payment_plans || []).find(p => String(p.lot_id) === String(lotId));
      if (plan) {
        // Return -1 to indicate fully paid (payment_term_months = 0)
        return plan.payment_term_months === 0 ? -1 : Number(plan.monthly_amount);
      }
      // If no plan exists, assume fully paid (legacy lots)
      return -1;
    } catch (_) { return -1; }
  };

  // Helper to check if lot is fully paid for filtering
  const isLotFullyPaid = (customerId, lotId) => {
    if (!selectedCustomerDetails?.monthly_status) return false;
    
    // Handle both structures: monthly_status can be the full response object or the array directly
    let monthlyStatusArray = null;
    if (Array.isArray(selectedCustomerDetails.monthly_status)) {
      monthlyStatusArray = selectedCustomerDetails.monthly_status;
    } else if (selectedCustomerDetails.monthly_status?.monthly_status && Array.isArray(selectedCustomerDetails.monthly_status.monthly_status)) {
      monthlyStatusArray = selectedCustomerDetails.monthly_status.monthly_status;
    }
    
    if (!monthlyStatusArray) return false;
    
    const lotStatus = monthlyStatusArray.find(ms => String(ms.lot_id) === String(lotId));
    if (!lotStatus) return true; // No status means fully paid
    
    // Check if there are any unpaid months
    const hasUnpaidMonths = lotStatus.monthly_payments?.some(mp => !mp.paid);
    return !hasUnpaidMonths;
  };

  // Load overdue payments
  const loadOverduePayments = async () => {
    try {
      setLoadingOverdue(true);
      const response = await fetch('/api/get_overdue_payments.php');
      const data = await response.json();
      
      if (data.success) {
        setOverdueLots(data.overdue_lots || []);
      } else {
        console.error('Failed to load overdue payments:', data.message);
        setOverdueLots([]);
      }
    } catch (err) {
      console.error('Error loading overdue payments:', err);
      setOverdueLots([]);
    } finally {
      setLoadingOverdue(false);
    }
  };

  // Load customers data
  const loadCustomers = async (showSpinner = true) => {
    try {
      if (showSpinner) {
        setLoading(true);
      }
      setError("");
      
      const response = await fetch('/api/get_cashier_customers.php', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setCustomers(data.customers);
      } else {
        setError(data.message || "Failed to load customers");
      }
    } catch (err) {
      console.error("Error loading customers:", err);
      setError("Failed to load customer data. Please try again.");
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  const sendDueTomorrowReminders = async () => {
    if (isSendingReminders) {
      return;
    }

    setReminderStatus(null);
    setIsSendingReminders(true);

    try {
      const response = await fetch('/api/send_due_reminders.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        // ignore parse errors; handled below
      }

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || `Failed to send reminders (status ${response.status})`);
      }

      const readableDate = data?.target_date
        ? new Date(`${data.target_date}T00:00:00`).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : 'the selected date';

      const totalDue = Number(data?.total_due ?? 0);
      const remindersSent = Number(data?.reminders_sent ?? 0);
      const failureCount = totalDue - remindersSent;
      const errorDetails = Array.isArray(data?.errors) ? data.errors.filter(Boolean) : [];

      if (totalDue === 0) {
        setReminderStatus({
          type: 'success',
          message: `No customers have payments due on ${readableDate}.`,
        });
        return;
      }

      if (failureCount > 0) {
        const detailMessage = errorDetails.length ? ` Details: ${errorDetails[0]}` : '';
        setReminderStatus({
          type: 'error',
          message: `Only ${remindersSent}/${totalDue} reminder${totalDue === 1 ? '' : 's'} were sent for payments due on ${readableDate}.${detailMessage}`,
        });
        return;
      }

      setReminderStatus({
        type: 'success',
        message: `Sent all ${totalDue} reminder${totalDue === 1 ? '' : 's'} for payments due on ${readableDate}.`,
      });
    } catch (err) {
      setReminderStatus({
        type: 'error',
        message: err?.message || 'Failed to send reminders. Please try again.',
      });
    } finally {
      setIsSendingReminders(false);
    }
  };

  // Load detailed customer information
  const loadCustomerDetails = async (customerId) => {
    try {
      setLoadingCustomerDetails(true);
      console.log('Loading customer details for ID:', customerId);
      
      const response = await fetch('/api/get_customer_details.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': customerId.toString(),
        },
        body: JSON.stringify({ customer_id: customerId }),
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Customer details response:', data);
      
      if (data.success) {
        setSelectedCustomerDetails(data.customer);
        return data.customer;
      } else {
        setError(data.message || "Failed to load customer details");
        return null;
      }
    } catch (err) {
      console.error("Error loading customer details:", err);
      setError("Failed to load customer details. Please try again.");
      return null;
    } finally {
      setLoadingCustomerDetails(false);
    }
  };

  // Load intake payments - simple and direct
  const loadIntakePayments = async (filter = 'all') => {
    try {
      setLoadingIntake(true);
      setError("");
      
      const response = await fetch(`/api/get_intake_payments.php?filter=${filter}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setIntakePayments(data.payments || []);
      } else {
        setError(data.message || "Failed to load payments");
      }
    } catch (err) {
      console.error("Error loading intake payments:", err);
      setError("Failed to load payment data. Please try again.");
    } finally {
      setLoadingIntake(false);
    }
  };

  // Helper function to convert string to title case (uppercase first letters)
  const toTitleCase = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str.toLowerCase().split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const resolvePerformerName = (payment) => {
    if (!payment) return 'Cashier';
    const direct = typeof payment.performed_by === 'string' ? payment.performed_by.trim() : '';
    if (direct) return toTitleCase(direct);

    const userName = typeof payment.user_name === 'string' ? payment.user_name.trim() : '';
    if (userName) return toTitleCase(userName);

    if (payment.notes?.includes?.('Session ID:') || payment.payment_method === 'Online' || payment.payment_method === 'GCash' || payment.payment_method === 'Maya') {
      return 'Online Payment';
    }

    return 'Cashier';
  };

  const exportIntake = async () => {
    const getIntakeFilterLabel = (filter) => {
      switch (filter) {
        case 'today': return 'Today';
        case '30days': return 'Last 30 Days';
        default: return 'All Time';
      }
    };
    const getIntakeFilterDescription = (filter) => {
      switch (filter) {
        case 'today':
          return 'Shows all paid receipts recorded today.';
        case '30days':
          return 'Shows all paid receipts from the last 30 days (including today).';
        default:
          return 'Shows all paid receipts on record.';
      }
    };
    const headers = ["Date/Time","Customer","Lot","Amount","Method","Status","Performed By"];
    const rows = (intakePayments || []).map((p) => [
      p.payment_date ? new Date(p.payment_date).toLocaleString() : '',
      p.owner_name || 'Unknown',
      p.lot_display || p.section || 'N/A',
      Number(p.payment_amount || 0),
      p.payment_method || '-',
      p.status || '-',
      resolvePerformerName(p)
    ]);
    const filterLabel = getIntakeFilterLabel(intakeFilter);
    const filterDesc = getIntakeFilterDescription(intakeFilter);
    const label = `Payment_Intake_${filterLabel.replace(/\s+/g,'_')}`;
    // Build protected presentational Excel with ExcelJS (match Reports style)
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Intake');
    sheet.pageSetup = Object.assign({}, sheet.pageSetup, { horizontalCentered: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } });
    const colCount = headers.length;
    const colToLetter = (i) => { let s = '', n = i; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    const fetchImageBase64 = async (url) => { try { const res = await fetch(url); const blob = await res.blob(); const dataUrl = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); }); return String(dataUrl).split(',')[1]; } catch { return null; } };
    const logoBase64 = await fetchImageBase64('/img/divine_life.png');
    const company = 'Divine Life Memorial Park';
    const title = `Payment Intake — ${filterLabel}`;
    const desc = filterDesc;
    const meta = `Generated: ${new Date().toLocaleString()}`;
    sheet.getRow(1).height = 30; sheet.getRow(2).height = 28; sheet.getRow(3).height = 22; sheet.getRow(4).height = 18;
    const hasLogo = !!logoBase64 && colCount >= 3;
    if (hasLogo) { const img = workbook.addImage({ base64: logoBase64, extension: 'png' }); sheet.addImage(img, { tl: { col: 0, row: 0 }, br: { col: 2, row: 4 } }); }
    const startCol = hasLogo ? 3 : 1;
    sheet.mergeCells(1, startCol, 1, colCount); sheet.getCell(1, startCol).value = company; sheet.getCell(1, startCol).alignment = { horizontal: 'center', vertical: 'middle' }; sheet.getCell(1, startCol).font = { bold: true, size: 14 };
    sheet.mergeCells(2, startCol, 2, colCount); sheet.getCell(2, startCol).value = title; sheet.getCell(2, startCol).alignment = { horizontal: 'center', vertical: 'middle' }; sheet.getCell(2, startCol).font = { bold: true, size: 20 };
    sheet.mergeCells(3, startCol, 3, colCount); sheet.getCell(3, startCol).value = desc; sheet.getCell(3, startCol).alignment = { horizontal: 'center', vertical: 'middle' }; sheet.getCell(3, startCol).font = { size: 13, color: { argb: 'FF374151' } };
    sheet.mergeCells(4, startCol, 4, colCount); sheet.getCell(4, startCol).value = meta; sheet.getCell(4, startCol).alignment = { horizontal: 'center', vertical: 'middle' }; sheet.getCell(4, startCol).font = { size: 12, color: { argb: 'FF374151' } };
    headers.forEach((h, idx) => { let w = 18; const lower = h.toLowerCase(); if (/(date|time)/.test(lower)) w = 22; if (/(customer|lot|performed)/.test(lower)) w = 28; if (/(method|status)/.test(lower)) w = 18; sheet.getColumn(idx + 1).width = w; });
    const headerRowIndex = 6; const headerRow = sheet.getRow(headerRowIndex);
    headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; }); headerRow.font = { bold: true, color: { argb: 'FF1F2937' } }; headerRow.alignment = { horizontal: 'center', vertical: 'middle' }; headerRow.height = 22; for (let c = 1; c <= colCount; c++) { const cell = headerRow.getCell(c); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } }; }
    const dataStartRow = headerRowIndex + 1; rows.forEach((r, rIdx) => { const row = sheet.getRow(dataStartRow + rIdx); r.forEach((v, i) => { const cell = row.getCell(i + 1); cell.value = v; const hdr = String(headers[i]).toLowerCase(); const isNum = /(amount)/.test(hdr) || typeof v === 'number'; cell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle', wrapText: true, indent: isNum ? 0 : 1 }; if (/(amount)/.test(hdr) && typeof v === 'number') { cell.numFmt = '"₱"#,##0'; } cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } }; }); });
    const dataLastRow = dataStartRow + Math.max(0, rows.length) - 1; const totalsRowIndex = dataLastRow + 1; sheet.getCell(totalsRowIndex, 1).value = 'Totals'; const amtIdx = headers.findIndex(h => h.toLowerCase() === 'amount'); if (amtIdx !== -1) { const L = colToLetter(amtIdx + 1); const c = sheet.getCell(`${L}${totalsRowIndex}`); c.value = { formula: `SUM(${L}${dataStartRow}:${L}${dataLastRow})` }; c.font = { bold: true }; c.alignment = { horizontal: 'right' }; c.numFmt = '"₱"#,##0'; }
    for (let c = 1; c <= colCount; c++) { const cell = sheet.getRow(totalsRowIndex).getCell(c); cell.border = cell.border || { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } }; cell.fill = cell.fill || { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }; }
    sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];
    // Auto-fit and adjust desc/meta row heights based on merged width
    for (let c = 1; c <= colCount; c++) { let maxLen = String(sheet.getRow(headerRowIndex).getCell(c).value ?? '').length; for (let r = dataStartRow; r <= dataLastRow; r++) { const val = sheet.getRow(r).getCell(c).value; const text = typeof val === 'object' && val && 'text' in val ? String(val.text) : String(val ?? ''); if (text.length > maxLen) maxLen = text.length; } sheet.getColumn(c).width = Math.min(Math.max(maxLen + 10, 18), 100); }
    const mergedWidthChars = (() => { let sum = 0; for (let c = startCol; c <= colCount; c++) { sum += Number(sheet.getColumn(c).width || 10); } return Math.max(sum - 2, 10); })();
    const descLenCalc = String(desc).length; const metaLenCalc = String(meta).length;
    const descLines = Math.max(1, Math.ceil(descLenCalc / mergedWidthChars));
    const metaLines = Math.max(1, Math.ceil(metaLenCalc / mergedWidthChars));
    sheet.getRow(3).height = Math.max(22, descLines * 16);
    sheet.getRow(4).height = Math.max(18, metaLines * 14);
    await sheet.protect('REPORT', { selectLockedCells: true, selectUnlockedCells: false, sort: false, autoFilter: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false });
    const buf = await workbook.xlsx.writeBuffer(); const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${label}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  // Load data on component mount
  useEffect(() => {
    loadCustomers();
    loadOverduePayments();
  }, []);

  // Load intake payments when dialog opens
  useEffect(() => {
    if (isIntakeDialogOpen) {
      loadIntakePayments(intakeFilter);
    }
  }, [isIntakeDialogOpen]);

  const openPaymentHistory = async (customer) => {
    try {
      console.log('Opening payment history for customer:', customer);
      setSelectedCustomer(customer);
      setError(""); // Clear any previous errors
      
      const details = await loadCustomerDetails(customer.id);
      console.log('Loaded customer details:', details);
      
      if (details) {
        setIsPaymentHistoryDialogOpen(true);
      } else {
        setError("Failed to load customer details");
      }
    } catch (err) {
      console.error('Error in openPaymentHistory:', err);
      setError("Error loading payment history: " + err.message);
    }
  };

  const openMonthlyStatus = async (customer) => {
    try {
      console.log('Opening monthly status for customer:', customer);
      setSelectedCustomer(customer);
      setError(""); // Clear any previous errors
      
      const details = await loadCustomerDetails(customer.id);
      console.log('Loaded customer details:', details);
      
      if (details) {
        setIsMonthlyStatusDialogOpen(true);
      } else {
        setError("Failed to load customer details");
      }
    } catch (err) {
      console.error('Error in openMonthlyStatus:', err);
      setError("Error loading monthly status: " + err.message);
    }
  };

  const closePaymentHistory = () => {
    setSelectedCustomer(null);
    setSelectedCustomerDetails(null);
    setPaymentHistorySearchTerm("");
    setIsPaymentHistoryDialogOpen(false);
  };

  // Helper function to generate receipt number from payment data
  const generateReceiptNumber = (payment) => {
    if (!payment.id || !payment.created_at) return '';
    const date = new Date(payment.created_at);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    const idStr = String(payment.id).padStart(5, '0');
    return `${dateStr}-${idStr}`;
  };

  const closeMonthlyStatus = () => {
    setSelectedCustomer(null);
    setSelectedCustomerDetails(null);
    setIsMonthlyStatusDialogOpen(false);
  };

  const openLotStatus = async (customer) => {
    try {
      console.log('Opening lot status for customer:', customer);
      setSelectedCustomer(customer);
      setError(""); // Clear any previous errors
      
      const details = await loadCustomerDetails(customer.id);
      console.log('Loaded customer details for lot status:', details);
      
      if (details) {
        setIsLotStatusDialogOpen(true);
      } else {
        setError("Failed to load customer details");
      }
    } catch (err) {
      console.error('Error in openLotStatus:', err);
      setError("Error loading customer details: " + err.message);
    }
  };

  const closeLotStatus = () => {
    setSelectedCustomer(null);
    setSelectedCustomerDetails(null);
    setIsLotStatusDialogOpen(false);
  };

  const openPaymentDialog = async (customer) => {
    try {
      console.log('Opening payment dialog for customer:', customer);
      setSelectedCustomer(customer);
      setError(""); // Clear any previous errors
      
      const details = await loadCustomerDetails(customer.id);
      console.log('Loaded customer details for payment:', details);
      
      if (details) {
        const firstLotId = details.lots.length > 0 ? String(details.lots[0].id) : "";
        let monthlyAmount = 0;
        if (firstLotId) {
          monthlyAmount = await fetchMonthlyAmountForLot(customer.id, firstLotId);
        }
        setPaymentForm({
          amount: monthlyAmount > 0 ? String(monthlyAmount) : (monthlyAmount === -1 ? "0" : "1000"),
          paymentMethod: "Cash",
          selectedMonth: "",
          selectedLot: firstLotId,
          notes: "",
        });
        setIsPaymentDialogOpen(true);
      } else {
        setError("Failed to load customer details");
      }
    } catch (err) {
      console.error('Error in openPaymentDialog:', err);
      setError("Error loading customer details: " + err.message);
    }
  };

  // Update payment amount when month is selected in payment dialog
  useEffect(() => {
    if (isPaymentDialogOpen && paymentForm.selectedMonth && paymentForm.selectedLot && selectedCustomerDetails) {
      const availableMonths = getAvailableMonths(selectedCustomerDetails, paymentForm.selectedLot);
      const selectedMonth = availableMonths.find(m => m.year_month === paymentForm.selectedMonth);
      if (selectedMonth) {
        const { totalAmount } = deriveMonthTotals(selectedMonth);
        setPaymentForm(prev => ({
          ...prev,
          amount: String(totalAmount)
        }));
      }
    }
  }, [paymentForm.selectedMonth, paymentForm.selectedLot, isPaymentDialogOpen, selectedCustomerDetails]);

  // Helper function to calculate total amount for selected months using actual scheduled amounts
  const calculateTotalForMonths = (customerDetails, lotId, selectedMonths) => {
    if (!customerDetails || !lotId || !selectedMonths || selectedMonths.length === 0) return 0;
    const availableMonths = getAvailableMonths(customerDetails, lotId);
    let total = 0;
    selectedMonths.forEach(ym => {
      const month = availableMonths.find(m => m.year_month === ym);
      if (month) {
        total += deriveMonthTotals(month).totalAmount;
      }
    });
    return roundToCent(total);
  };

  const openMakePayment = async (customer) => {
    try {
      setSelectedCustomer(customer);
      setError("");
      const details = await loadCustomerDetails(customer.id);
      if (details) {
        // Use the specific lot from the customer data instead of defaulting to first lot
        const specificLotId = customer.lot_id ? String(customer.lot_id) : (details.lots?.[0]?.id ? String(details.lots[0].id) : '');
        const monthlyAmt = specificLotId ? await fetchMonthlyAmountForLot(customer.id, specificLotId) : 0;
        // Preselect earliest unpaid month (sequential order)
        let defaultMonths = [];
        if (specificLotId) {
          const av = getAvailableMonths(details, specificLotId);
          if (av.length > 0) {
            // Sort months chronologically and select the earliest one
            const sortedMonths = av.sort((a, b) => a.year_month.localeCompare(b.year_month));
            defaultMonths = [sortedMonths[0].year_month];
          }
        }
        // Calculate initial amount using actual scheduled amounts (includes 2-split downpayment adjustment)
        const initialAmount = defaultMonths.length > 0 
          ? calculateTotalForMonths(details, specificLotId, defaultMonths)
          : (monthlyAmt > 0 ? monthlyAmt : 0);
        setPaymentWizard({
          mode: 'monthly',
          method: 'Cash',
          months: defaultMonths,
          lotId: specificLotId,
          amount: String(initialAmount),
          monthlyRate: monthlyAmt > 0 ? monthlyAmt : 0, // Keep for reference, but use actual amounts for calculation
        });
        setError(''); // Clear any previous errors
        setIsMakePaymentDialogOpen(true);
      }
    } catch (e) {
      setError('Failed to open make payment dialog');
    }
  };

  // Process payment from overdue payments table
  const processOverduePayment = async (overdueCustomer) => {
    try {
      setError("");
      // Find the customer in the customers list
      const customer = customers.find(c => c.id === overdueCustomer.customer_id);
      if (!customer) {
        // If customer not found, create a minimal customer object
        const mockCustomer = {
          id: overdueCustomer.customer_id,
          full_name: `${overdueCustomer.first_name} ${overdueCustomer.last_name}`,
          contact_number: overdueCustomer.contact_number,
          lot_id: null, // Will be determined from details
        };
        await openMakePayment(mockCustomer);
      } else {
        await openMakePayment(customer);
      }
      // Refresh overdue payments after processing
      loadOverduePayments();
    } catch (e) {
      setError('Failed to process overdue payment: ' + e.message);
    }
  };

  const closePaymentDialog = () => {
    setSelectedCustomer(null);
    setSelectedCustomerDetails(null);
    setPaymentForm({
      amount: "",
      paymentMethod: "Cash",
      selectedMonth: "",
      selectedLot: "",
      notes: "",
    });
    setIsPaymentDialogOpen(false);
  };

  const openPaymentConfirmation = () => {
    setIsPaymentConfirmationDialogOpen(true);
  };

  const closePaymentConfirmation = () => {
    setIsPaymentConfirmationDialogOpen(false);
  };

  const closeSuccessDialog = () => {
    setIsSuccessDialogOpen(false);
    setSuccessMessage("");
  };

  const generateReceipt = async (paymentId) => {
    try {
      const response = await fetch('/api/generate_receipt.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': '1' // Cashier ID
        },
        body: JSON.stringify({ payment_id: paymentId })
      });

      const result = await response.json();

      if (result.success) {
        setReceiptData(result.receipt);
        setIsReceiptDialogOpen(true);
      } else {
        setError('Failed to generate receipt: ' + result.message);
      }
    } catch (err) {
      console.error('Error generating receipt:', err);
      setError('Failed to generate receipt. Please try again.');
    }
  };

  const closeReceiptDialog = () => {
    setIsReceiptDialogOpen(false);
    setReceiptData(null);
  };

  const printReceipt = () => {
    // Add print styles
    const printStyles = `
      <style>
        @media print {
          body * { visibility: hidden; }
          #receipt-content, #receipt-content * { visibility: visible; }
          #receipt-content { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%;
            background: white;
            padding: 20px;
            font-family: 'Courier New', monospace;
          }
          .no-print { display: none !important; }
        }
      </style>
    `;
    
    // Add styles to head temporarily
    const styleSheet = document.createElement('style');
    styleSheet.innerHTML = printStyles;
    document.head.appendChild(styleSheet);
    
    // Print
    window.print();
    
    // Remove styles after printing
    setTimeout(() => {
      document.head.removeChild(styleSheet);
    }, 1000);
  };

  const handleFormChange = (field, value) => {
    setPaymentForm((prev) => ({ ...prev, [field]: value }));
  };

  const processPayment = async () => {
    try {
      if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
        setError('Please enter a valid payment amount');
        return;
      }

      if (!paymentForm.selectedLot || !paymentForm.selectedMonth) {
        setError('Please select both lot and month for payment');
        return;
      }

      setError('');
      console.log('Processing monthly payment:', {
        customer: selectedCustomer,
        payment: paymentForm,
        date: new Date().toISOString().split('T')[0],
      });

      const monthInfoDetails = getAvailableMonths(selectedCustomerDetails, paymentForm.selectedLot)
        .find(m => m.year_month === paymentForm.selectedMonth);
      const monthTotals = monthInfoDetails ? deriveMonthTotals(monthInfoDetails) : { totalAmount: parseFloat(paymentForm.amount) };

      const paymentData = {
        customer_id: selectedCustomer.id,
        amount: monthTotals.totalAmount,
        payment_method: paymentForm.paymentMethod,
        payment_type: 'monthly',
        lot_id: paymentForm.selectedLot,
        payment_month: paymentForm.selectedMonth,
        notes: paymentForm.notes
      };

      // Get current user ID from localStorage for activity log
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = currentUser?.id ? currentUser.id.toString() : '1';

      const response = await fetch('/api/process_cashier_payment.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify(paymentData)
      });

      const result = await response.json();

      if (result.success) {
        const monthInfo = (() => {
          const month = getAvailableMonths(selectedCustomerDetails, paymentForm.selectedLot)
            .find(m => m.year_month === paymentForm.selectedMonth);
          return month ? formatMonthWithDay(month) : paymentForm.selectedMonth;
        })();
        
        setSuccessMessage(
          `Monthly payment of ${formatCurrency(monthTotals.totalAmount)} processed successfully for ${selectedCustomer.full_name} for ${monthInfo}`
        );
        setIsSuccessDialogOpen(true);

        closePaymentDialog();

        // Trigger background updates without blocking the UI
        generateReceipt(result.payment_id).catch((err) => {
          console.error('Error generating receipt:', err);
          setError('Failed to generate receipt. Please try again.');
        });
        loadCustomers(false).catch((err) => {
          console.error('Error refreshing customers:', err);
        });
        loadOverduePayments().catch((err) => {
          console.error('Error refreshing overdue payments:', err);
        });
        
      } else {
        setError(result.message || 'Failed to process payment');
      }

    } catch (err) {
      console.error('Error processing payment:', err);
      setError('Network error. Please try again.');
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'green';
      case 'inactive':
        return 'red';
      case 'pending':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'green';
      case 'pending':
        return 'yellow';
      case 'overdue':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Format month display with due day
  const formatMonthWithDay = (month) => {
    if (month.due_date) {
      const date = new Date(month.due_date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (month.due_day) {
      // Fallback: construct from year_month and due_day
      const [year, monthNum] = month.year_month.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(monthNum) - 1]} ${month.due_day}, ${year}`;
    }
    // Final fallback: use original display
    return month.display || month.year_month;
  };

  const toNumber = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const roundToCent = (value) => Math.round(toNumber(value) * 100) / 100;

  const deriveMonthTotals = (month) => {
    if (!month) {
      return { baseAmount: 0, penaltyAmount: 0, totalAmount: 0 };
    }
    // Use backend-calculated values to preserve compound penalty logic
    // Backend already calculates compound penalties, so we should use those values
    const baseAmount = roundToCent(month.amount ?? 0);
    // Use penalty from backend if available (preserves compounding)
    const penaltyAmount = month.overdue 
      ? roundToCent(month.penalty ?? (month.amount_with_penalty ?? 0) - (month.amount ?? 0))
      : 0;
    // Use amount_with_penalty from backend if available (preserves compounding)
    const totalAmount = roundToCent(
      month.amount_with_penalty ?? (month.amount ?? 0) + penaltyAmount
    );
    return { baseAmount, penaltyAmount, totalAmount };
  };

  // Get available months for payment based on customer's monthly status
  const getAvailableMonths = (customerDetails, selectedLotId) => {
    if (!customerDetails?.monthly_status) {
      return [];
    }
    
    // Handle both structures: monthly_status can be the full response object or the array directly
    let monthlyStatusArray = null;
    if (Array.isArray(customerDetails.monthly_status)) {
      // If it's already an array, use it directly
      monthlyStatusArray = customerDetails.monthly_status;
    } else if (customerDetails.monthly_status?.monthly_status && Array.isArray(customerDetails.monthly_status.monthly_status)) {
      // If it's the full response object, extract the array
      monthlyStatusArray = customerDetails.monthly_status.monthly_status;
    }
    
    if (!monthlyStatusArray) {
      return [];
    }
    
    const lotStatus = monthlyStatusArray.find(lot => String(lot.lot_id) === String(selectedLotId));
    if (!lotStatus) {
      return [];
    }
    
    return lotStatus.monthly_payments?.filter(m => !m.paid) || [];
  };

  // Get selectable months (sequential from earliest unpaid month)
  const getSelectableMonths = (customerDetails, selectedLotId, selectedMonths = []) => {
    const availableMonths = getAvailableMonths(customerDetails, selectedLotId);
    if (availableMonths.length === 0) return [];
    
    // Sort months chronologically
    const sortedMonths = availableMonths.sort((a, b) => a.year_month.localeCompare(b.year_month));
    
    // Find the earliest unpaid month
    const earliestMonth = sortedMonths[0];
    
    // Return months that can be selected (sequential from earliest)
    return sortedMonths.map((month, index) => {
      const canSelect = index === 0 || // Always allow the first (earliest) month
                       (index === 1 && selectedMonths.includes(sortedMonths[0].year_month)) || // Allow second month only if first is selected
                       (index > 1 && selectedMonths.includes(sortedMonths[index - 1].year_month)); // Allow subsequent months only if previous is selected
      
      // Check if this month can be deselected (would not create gaps)
      const canDeselect = () => {
        if (!selectedMonths.includes(month.year_month)) return false; // Not selected, so can't deselect
        
        // If it's the last selected month in sequence, it can be deselected
        const selectedSorted = selectedMonths.sort();
        const currentIndex = selectedSorted.indexOf(month.year_month);
        
        // Can deselect if it's the last month in the selected sequence
        return currentIndex === selectedSorted.length - 1;
      };
      
      return {
        ...month,
        canSelect,
        canDeselect: canDeselect(),
        isSequential: canSelect
      };
    });
  };

  const getOutstandingMonths = (customer) => {
    return customer.payment_summary?.overdue_months || 0;
  };

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Intake sort handler
  const handleIntakeSort = (key) => {
    let direction = 'asc';
    if (intakeSortConfig.key === key && intakeSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setIntakeSortConfig({ key, direction });
  };

  let filteredCustomers = customers.filter(customer => {
    const fullName = (customer.full_name || '').toLowerCase();
    const email = (customer.email || '').toLowerCase();
    const lotDetails = (customer.lot_details || '').toLowerCase();
    const searchLower = (searchTerm || '').toLowerCase();
    const matchesSearch = fullName.includes(searchLower) ||
                         email.includes(searchLower) ||
                         lotDetails.includes(searchLower);
    // Status filter removed - show all customers
    return matchesSearch;
  });
  
  // Apply sorting
  if (sortConfig.key) {
    filteredCustomers = [...filteredCustomers].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortConfig.key) {
        case 'customer':
          aVal = (a.full_name || '').toLowerCase();
          bVal = (b.full_name || '').toLowerCase();
          break;
        case 'contact':
          aVal = (a.contact_number || '').toLowerCase();
          bVal = (b.contact_number || '').toLowerCase();
          break;
        case 'lotDetails':
          aVal = (a.lot_details || '').toLowerCase();
          bVal = (b.lot_details || '').toLowerCase();
          break;
        case 'status':
          aVal = (a.lot_status || '').toLowerCase();
          bVal = (b.lot_status || '').toLowerCase();
          break;
        case 'paymentSummary':
          // Sort by payment status first, then by amount
          const aStatus = (a.payment_summary?.status || 'No Payments').toLowerCase();
          const bStatus = (b.payment_summary?.status || 'No Payments').toLowerCase();
          if (aStatus !== bStatus) {
            aVal = aStatus;
            bVal = bStatus;
          } else {
            aVal = parseFloat(a.payment_summary?.paid_amount || 0);
            bVal = parseFloat(b.payment_summary?.paid_amount || 0);
          }
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  useEffect(() => { setPage(1); }, [searchTerm]);
  useEffect(() => { localStorage.setItem('payment_page_size', String(pageSize)); }, [pageSize]);
  useEffect(() => { setOverduePage(1); }, [overdueSearchTerm]);

  // Filter and sort overdue payments
  let filteredOverdueLots = overdueLots.filter(customer => {
    const fullName = `${customer.first_name} ${customer.last_name}`.toLowerCase();
    const contact = (customer.contact_number || '').toLowerCase();
    const lots = (customer.lot_display || '').toLowerCase();
    const searchLower = overdueSearchTerm.toLowerCase();
    return fullName.includes(searchLower) || contact.includes(searchLower) || lots.includes(searchLower);
  });

  // Apply sorting to overdue payments
  if (overdueSortConfig.key) {
    filteredOverdueLots = [...filteredOverdueLots].sort((a, b) => {
      let aVal, bVal;
      switch (overdueSortConfig.key) {
        case 'customer':
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case 'contact':
          aVal = (a.contact_number || '').toLowerCase();
          bVal = (b.contact_number || '').toLowerCase();
          break;
        case 'amount':
          aVal = parseFloat(a.total_monthly_amount || 0);
          bVal = parseFloat(b.total_monthly_amount || 0);
          break;
        case 'months':
          aVal = parseInt(a.total_overdue_months || 0);
          bVal = parseInt(b.total_overdue_months || 0);
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return overdueSortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return overdueSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const overdueTotalPages = Math.max(1, Math.ceil(filteredOverdueLots.length / Math.max(overduePageSize, 1)));
  const overdueCurrentPage = Math.min(overduePage, overdueTotalPages);
  const overdueStartIndex = (overdueCurrentPage - 1) * overduePageSize;
  const paginatedOverdueLots = filteredOverdueLots.slice(overdueStartIndex, overdueStartIndex + overduePageSize);

  // Auto-expand if there are 5 or fewer overdue payments
  useEffect(() => {
    if (overdueLots.length > 0) {
      // Auto-expand if there are 5 or fewer, otherwise keep collapsed
      if (overdueLots.length <= 5) {
        setIsOverdueExpanded(true);
      }
    } else {
      setIsOverdueExpanded(false);
    }
  }, [overdueLots.length]);

  // Auto-hide reminder status after 5 seconds
  useEffect(() => {
    if (reminderStatus) {
      const timer = setTimeout(() => {
        setReminderStatus(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [reminderStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / Math.max(pageSize, 1)));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + pageSize);
  const selectedMonthDetails = (paymentForm.selectedLot && paymentForm.selectedMonth && selectedCustomerDetails)
    ? getAvailableMonths(selectedCustomerDetails, paymentForm.selectedLot).find(m => m.year_month === paymentForm.selectedMonth)
    : null;
  const selectedMonthTotals = selectedMonthDetails ? deriveMonthTotals(selectedMonthDetails) : null;
  const wizardAvailableMonths = (paymentWizard.lotId && selectedCustomerDetails)
    ? getAvailableMonths(selectedCustomerDetails, paymentWizard.lotId)
    : [];
  const wizardMonthSummaries = wizardAvailableMonths.length
    ? paymentWizard.months.map((ym) => {
        const month = wizardAvailableMonths.find((m) => m.year_month === ym);
        if (!month) return null;
        const totals = deriveMonthTotals(month);
        return { ...month, ...totals };
      }).filter(Boolean)
    : [];
  const wizardTotals = wizardMonthSummaries.reduce(
    (acc, month) => {
      acc.base += month.baseAmount;
      acc.penalty += month.penaltyAmount;
      acc.final += month.totalAmount;
      return acc;
    },
    { base: 0, penalty: 0, final: 0 }
  );

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="mb-8">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Customer Management
        </Typography>
        <Typography variant="small" color="blue-gray" className="opacity-70">
          Monitor customer payments, view monthly status, and manage payment history
        </Typography>
      </div>

      {/* Error Display */}
      {error && (typeof window !== 'undefined' ? alert(error) : null)}
      {error && (
        <Alert color="red" className="mb-6">
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <Card className="overflow-hidden">
          <CardBody className="flex items-center justify-center p-12">
            <div className="text-center">
              <Typography variant="h6" color="blue-gray" className="mb-2">
                Loading customers...
              </Typography>
              <Typography variant="small" color="blue-gray" className="opacity-70">
                Please wait while we fetch customer data
              </Typography>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Overdue Payments Section */}
      {!loading && (
        <Card className="overflow-hidden mb-6">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="m-0 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between p-6"
          >
            <div className="flex items-center gap-3 flex-1">
              {overdueLots.length > 0 && (
                <IconButton
                  variant="text"
                  size="sm"
                  onClick={() => setIsOverdueExpanded(!isOverdueExpanded)}
                  className="rounded-full"
                >
                  {isOverdueExpanded ? (
                    <ChevronDownIcon className="h-5 w-5" />
                  ) : (
                    <ChevronRightIcon className="h-5 w-5" />
                  )}
                </IconButton>
              )}
              <div>
                <Typography variant="h5" color="blue-gray" className="mb-1">
                  Overdue Payments
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  {loadingOverdue ? 'Loading...' : overdueLots.length === 0 
                    ? 'No overdue payments' 
                    : `${filteredOverdueLots.length} customer${filteredOverdueLots.length !== 1 ? 's' : ''} with overdue payments`}
                </Typography>
              </div>
              {filteredOverdueLots.length > 0 && (
                <Chip
                  variant="ghost"
                  color="red"
                  value={filteredOverdueLots.length}
                  className="text-center font-medium w-fit"
                />
              )}
            </div>
            <div className="flex flex-col gap-3 w-full lg:w-auto">
              <div className="flex w-full justify-end">
                <Button
                  color="amber"
                  className="flex items-center justify-center gap-2"
                  onClick={sendDueTomorrowReminders}
                  disabled={isSendingReminders}
                >
                  <BellAlertIcon className={`h-5 w-5 ${isSendingReminders ? 'animate-pulse' : ''}`} />
                  {isSendingReminders ? 'Sending reminders...' : 'Send reminders'}
                </Button>
              </div>
              {isOverdueExpanded && overdueLots.length > 0 && (
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <div className="w-full sm:w-72">
                    <Input
                      label="Search overdue..."
                      icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                      value={overdueSearchTerm}
                      onChange={(e) => {
                        const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                        setOverdueSearchTerm(filtered);
                      }}
                    />
                  </div>
                  <Tooltip content="Refresh Overdue Payments">
                    <IconButton
                      variant="text"
                      color="blue"
                      onClick={loadOverduePayments}
                      disabled={loadingOverdue}
                      className="rounded-full"
                    >
                      <ArrowPathIcon className={`h-5 w-5 ${loadingOverdue ? 'animate-spin' : ''}`} />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
            </div>
          </CardHeader>
          {reminderStatus && (
            <div className="px-6 pb-4">
              <Alert
                color={reminderStatus.type === 'error' ? 'red' : 'green'}
                className="space-y-1"
              >
                <Typography variant="small" className="font-semibold text-blue-gray-900">
                  {reminderStatus.type === 'error' ? 'Reminder failed' : 'Reminders sent'}
                </Typography>
                <Typography variant="small" color="blue-gray">
                  {reminderStatus.message}
                </Typography>
              </Alert>
            </div>
          )}
          {isOverdueExpanded && (
            <CardBody className="px-0 pt-0 pb-2">
              {loadingOverdue ? (
                <div className="flex items-center justify-center p-12">
                  <Typography variant="small" color="blue-gray" className="opacity-70">
                    Loading overdue payments...
                  </Typography>
                </div>
              ) : overdueLots.length === 0 ? (
                <div className="text-center py-12">
                  <ExclamationTriangleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <Typography variant="h6" color="blue-gray" className="mb-2">
                    No Overdue Payments
                  </Typography>
                  <Typography variant="small" color="blue-gray" className="opacity-70">
                    All payments are up to date!
                  </Typography>
                </div>
              ) : filteredOverdueLots.length === 0 ? (
                <div className="text-center py-12">
                  <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                    {overdueSearchTerm ? "No overdue payments found" : "No overdue payments available"}
                  </Typography>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] table-auto">
                      <thead>
                        <tr>
                          {[
                            { key: 'customer', label: 'Customer' },
                            { key: 'lots', label: 'Lots' },
                            { key: 'contact', label: 'Contact Info' },
                            { key: 'amount', label: 'Total Monthly Amount' },
                            { key: 'months', label: 'Overdue Months' },
                            { key: null, label: 'Actions' }
                          ].map((col) => (
                            <th
                              key={col.key || 'actions'}
                              className={`border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 ${col.key ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                              onClick={col.key ? () => {
                                let direction = 'asc';
                                if (overdueSortConfig.key === col.key && overdueSortConfig.direction === 'asc') {
                                  direction = 'desc';
                                }
                                setOverdueSortConfig({ key: col.key, direction });
                              } : undefined}
                            >
                              <div className="flex items-center gap-1">
                                <Typography
                                  variant="small"
                                  className="text-[11px] font-medium uppercase text-blue-gray-400"
                                >
                                  {col.label}
                                </Typography>
                                {col.key && overdueSortConfig.key === col.key && (
                                  overdueSortConfig.direction === 'asc' ? 
                                    <ChevronUpIcon className="h-4 w-4 text-blue-gray-400" /> : 
                                    <ChevronDownIcon className="h-4 w-4 text-blue-gray-400" />
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedOverdueLots.map((customer, key) => {
                          const className = `py-3 px-6 ${
                            key === paginatedOverdueLots.length - 1
                              ? ""
                              : "border-b border-blue-gray-50"
                          }`;
                          return (
                            <tr key={customer.customer_id} className="bg-red-50 hover:bg-red-100 transition-colors">
                              <td className={className}>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-gray-100 flex items-center justify-center">
                                    <Typography
                                      variant="small"
                                      color="blue-gray"
                                      className="font-semibold text-xs"
                                    >
                                      {getInitials(`${customer.first_name} ${customer.last_name}`)}
                                    </Typography>
                                  </div>
                                  <div>
                                    <Typography
                                      variant="small"
                                      color="blue-gray"
                                      className="font-semibold"
                                    >
                                      {customer.first_name} {customer.last_name}
                                    </Typography>
                                  </div>
                                </div>
                              </td>
                              <td className={className}>
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-semibold"
                                >
                                  {customer.lot_display}
                                </Typography>
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-normal opacity-70 text-xs"
                                >
                                  ({customer.total_lots} lot{customer.total_lots > 1 ? 's' : ''})
                                </Typography>
                              </td>
                              <td className={className}>
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-normal"
                                >
                                  {customer.contact_number}
                                </Typography>
                              </td>
                              <td className={className}>
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-semibold"
                                >
                                  {formatCurrency(customer.total_monthly_amount)}
                                </Typography>
                              </td>
                              <td className={className}>
                                <Chip
                                  variant="ghost"
                                  color="red"
                                  value={`${customer.total_overdue_months} months`}
                                  className="text-center font-medium w-fit"
                                />
                              </td>
                              <td className={className}>
                                <div className="flex gap-1">
                                  <Tooltip content="Process Payment">
                                    <Button
                                      size="sm"
                                      variant="filled"
                                      color="blue"
                                      className="flex items-center gap-1 px-2"
                                      onClick={() => processOverduePayment(customer)}
                                    >
                                      <CurrencyDollarIcon className="h-3 w-3" />
                                      Pay
                                    </Button>
                                  </Tooltip>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Overdue Pagination */}
                  {overdueTotalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-center lg:justify-between gap-4 mt-6 px-6 pb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outlined"
                          color="blue-gray"
                          size="sm"
                          className="flex items-center justify-center"
                          disabled={overdueCurrentPage <= 1}
                          onClick={() => setOverduePage(p => Math.max(1, p - 1))}
                        >
                          &lt;
                        </Button>
                        <Button
                          variant="filled"
                          color="blue"
                          size="sm"
                          className="flex items-center justify-center"
                        >
                          {overdueCurrentPage}
                        </Button>
                        {overdueTotalPages > overdueCurrentPage && (
                          <Button
                            variant="outlined"
                            color="blue-gray"
                            size="sm"
                            className="flex items-center justify-center"
                            onClick={() => setOverduePage(p => Math.min(overdueTotalPages, p + 1))}
                          >
                            {overdueCurrentPage + 1}
                          </Button>
                        )}
                        <Button
                          variant="outlined"
                          color="blue-gray"
                          size="sm"
                          className="flex items-center justify-center"
                          disabled={overdueCurrentPage >= overdueTotalPages}
                          onClick={() => setOverduePage(p => Math.min(overdueTotalPages, p + 1))}
                        >
                          &gt;
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Typography variant="small" color="blue-gray" className="font-normal whitespace-nowrap">
                          Page {overdueCurrentPage} of {overdueTotalPages}
                        </Typography>
                        <div className="flex items-center gap-2">
                          <Typography variant="small" color="blue-gray" className="font-normal">
                            Rows per page:
                          </Typography>
                          <Select
                            label="Rows"
                            value={String(overduePageSize)}
                            onChange={(v) => { const n = Number(v); setOverduePageSize(n); setOverduePage(1); }}
                            containerProps={{ className: "min-w-[90px]" }}
                          >
                            {[5, 10, 20, 50].map(n => <Option key={n} value={String(n)}>{n}</Option>)}
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          )}
        </Card>
      )}

      {/* Main Content */}
      <Card className="overflow-hidden">
        <CardHeader
          floated={false}
          shadow={false}
          color="transparent"
          className="m-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6"
        >
          <Typography variant="h5" color="blue-gray" className="mb-1">
            Customer Information
          </Typography>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:w-auto">
            <div className="w-full sm:w-72">
              <Input
                label="Search customers..."
                icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                value={searchTerm}
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                  setSearchTerm(filtered);
                }}
              />
            </div>
            <Tooltip content="Refresh">
              <IconButton
                variant="text"
                color="blue"
                onClick={loadCustomers}
                disabled={loading}
                className="rounded-full"
              >
                <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              </IconButton>
            </Tooltip>
            {/* Status filter removed */}
          </div>
        </CardHeader>
        <CardBody className="px-0 pt-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-auto">
              <thead>
                <tr>
                  {[
                    { key: 'customer', label: 'Customer' },
                    { key: 'contact', label: 'Contact Info' },
                    { key: 'lotDetails', label: 'Lot Details' },
                    { key: 'status', label: 'Status' },
                    { key: 'paymentSummary', label: 'Payment Summary' },
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
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                        {searchTerm ? "No customers found" : "No customers available"}
                      </Typography>
                    </td>
                  </tr>
                ) : paginatedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                        No results found for this page
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map((customer, key) => {
                    const baseClass = `py-3 px-6 ${
                      key === filteredCustomers.length - 1
                        ? ""
                        : "border-b border-blue-gray-50"
                    }`;
                    const isOverdue = Number(customer.overdue_payments_count || 0) > 0 || Number(customer.overdue_amount || 0) > 0;
                    const rowClass = isOverdue ? "bg-red-50 hover:bg-red-100" : "hover:bg-blue-50";
                    const className = baseClass;
                    return (
                      <tr className={`${rowClass} transition-colors`} key={customer.row_key || `${customer.id}-${customer.lot_id || customer.lot_details || ''}`}>
                        <td className={className}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-gray-100 flex items-center justify-center">
                              <Typography
                                variant="small"
                                color="blue-gray"
                                className="font-semibold text-xs"
                              >
                                {getInitials(customer.full_name || '')}
                              </Typography>
                            </div>
                            <div>
                              <Typography
                                variant="small"
                                color="blue-gray"
                                className="font-semibold"
                              >
                                {customer.full_name || ''}
                              </Typography>
                              <Typography
                                variant="small"
                                color="blue-gray"
                                className="font-normal opacity-70"
                              >
                                {customer.email || ''}
                              </Typography>
                            </div>
                          </div>
                        </td>
                        <td className={className}>
                          <div>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal"
                            >
                              {customer.contact_number || ''}
                            </Typography>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal opacity-70 text-xs"
                            >
                              {customer.address || ''}
                            </Typography>
                          </div>
                        </td>
                        <td className={className}>
                          <div>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-semibold"
                            >
                              {customer.lot_details || ''}
                            </Typography>
                          </div>
                        </td>
                        <td className={className}>
                          <Chip
                            variant="ghost"
                            color={getStatusColor(customer.lot_status)}
                            value={customer.lot_status}
                            className="text-center font-medium w-fit"
                          />
                        </td>
                        <td className={className}>
                          <div className="space-y-1">
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-semibold"
                            >
                              {customer.payment_status}
                            </Typography>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-normal opacity-70"
                            >
                              {formatCurrency(customer.total_paid)} paid
                            </Typography>
                            {customer.pending_amount > 0 && (
                              <Typography
                                variant="small"
                                color="blue-gray"
                                className="font-normal opacity-70 text-xs"
                              >
                                {formatCurrency(customer.pending_amount)} pending
                              </Typography>
                            )}
                          </div>
                        </td>
                        <td className={className}>
                          <div className="flex gap-1">
                            <Tooltip content="Payment History">
                              <Button
                                size="sm"
                                variant="outlined"
                                color="blue"
                                className="flex items-center gap-1 px-2"
                                onClick={() => openPaymentHistory(customer)}
                              >
                                <CalendarIcon className="h-3 w-3" />
                                History
                              </Button>
                            </Tooltip>
                            <Tooltip content="Lot Status">
                              <Button
                                size="sm"
                                variant="outlined"
                                color="green"
                                className="flex items-center gap-1 px-2"
                                onClick={() => openLotStatus(customer)}
                              >
                                <ChartBarIcon className="h-3 w-3" />
                                Status
                              </Button>
                            </Tooltip>
                            {customer.payment_status === 'Fully Paid' ? (
                              <div className="flex items-center gap-1 px-2 py-1 bg-gray-500 text-white rounded border border-gray-600 shadow-sm">
                                <span className="text-xs font-bold">PAID</span>
                              </div>
                            ) : (
                              <Tooltip content="Make Payment">
                                <Button
                                  size="sm"
                                  variant="filled"
                                  color="blue"
                                  className="flex items-center gap-1 px-2"
                                  onClick={() => openMakePayment(customer)}
                                >
                                  <CurrencyDollarIcon className="h-3 w-3" />
                                  Pay
                                </Button>
                              </Tooltip>
                            )}
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

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-center lg:justify-between gap-4 mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outlined"
            color="blue-gray"
            size="sm"
            className="flex items-center justify-center"
            disabled={currentPage <= 1}
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
            {currentPage}
          </Button>
          {totalPages > currentPage && (
            <Button
              variant="outlined"
              color="blue-gray"
              size="sm"
              className="flex items-center justify-center"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              {currentPage + 1}
            </Button>
          )}
          <Button
            variant="outlined"
            color="blue-gray"
            size="sm"
            className="flex items-center justify-center"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            &gt;
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Typography variant="small" color="blue-gray" className="font-normal whitespace-nowrap">
            Page {currentPage} of {totalPages}
          </Typography>
          <div className="flex items-center gap-2">
            <Typography variant="small" color="blue-gray" className="font-normal">
              Rows per page:
            </Typography>
            <Select
              label="Rows"
              value={String(pageSize)}
              onChange={(v) => { const n = Number(v); setPageSize(n); localStorage.setItem('payment_page_size', String(n)); setPage(1); }}
              containerProps={{ className: "min-w-[90px]" }}
            >
              {[5,10,20,50].map(n => <Option key={n} value={String(n)}>{n}</Option>)}
            </Select>
          </div>
        </div>
      </div>

      {/* Payment History Dialog */}
      <Dialog
        open={isPaymentHistoryDialogOpen}
        handler={closePaymentHistory}
        size="lg"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
        dismiss={{ outsidePress: false, escapeKey: false }}
      >
        <DialogHeader className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-gray-100 flex items-center justify-center">
            <Typography
              variant="small"
              color="blue-gray"
              className="font-semibold text-sm"
            >
              {selectedCustomer ? getInitials(selectedCustomer.full_name) : ''}
            </Typography>
          </div>
          <div>
            <Typography variant="h5" color="blue-gray">
              Payment History
            </Typography>
            <Typography variant="small" color="blue-gray" className="opacity-70">
              {selectedCustomer?.full_name} - {selectedCustomer?.lot_details}
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          {loadingCustomerDetails ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  Loading customer details...
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please wait while we fetch payment history
                </Typography>
              </div>
            </div>
          ) : selectedCustomerDetails ? (
            <div>
              {/* Customer Info Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Total Payments
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {selectedCustomerDetails.payment_summary.total_payments}
                    </Typography>
                  </CardBody>
                </Card>
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Total Paid
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {formatCurrency(selectedCustomerDetails.payment_summary.total_paid_amount)}
                    </Typography>
                  </CardBody>
                </Card>
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Last Payment
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {selectedCustomerDetails.payment_summary.last_payment_date ? 
                        new Date(selectedCustomerDetails.payment_summary.last_payment_date).toLocaleDateString() : 'None'}
                    </Typography>
                  </CardBody>
                </Card>
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Payment Rate
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {selectedCustomerDetails.payment_summary.payment_rate?.toFixed(0) || 0}%
                    </Typography>
                  </CardBody>
                </Card>
              </div>

              {/* Payment History Table */}
              <div className="flex flex-col gap-4 mb-4">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Typography variant="h6" color="blue-gray">
                    Payment History ({(() => {
                      if (paymentHistorySearchTerm.trim()) {
                        const searchLower = paymentHistorySearchTerm.toLowerCase().trim();
                        const filtered = (selectedCustomerDetails.payment_history || []).filter(payment => {
                          const receiptNumber = generateReceiptNumber(payment);
                          const matchesReceiptNumber = receiptNumber.toLowerCase().includes(searchLower);
                          const matchesDate = payment.payment_date ? 
                            new Date(payment.payment_date).toLocaleDateString().toLowerCase().includes(searchLower) : false;
                          const matchesAmount = formatCurrency(payment.payment_amount).toLowerCase().includes(searchLower) ||
                            String(payment.payment_amount || '').includes(searchLower);
                          const matchesMethod = (payment.payment_method || '').toLowerCase().includes(searchLower);
                          const matchesStatus = (payment.status || '').toLowerCase().includes(searchLower);
                          const matchesLot = (payment.lot_display || `Lot ${payment.lot_number || ''}`).toLowerCase().includes(searchLower);
                          const matchesNotes = (payment.notes || '').toLowerCase().includes(searchLower);
                          return matchesReceiptNumber || matchesDate || matchesAmount || matchesMethod || 
                                 matchesStatus || matchesLot || matchesNotes;
                        });
                        return `${filtered.length} of ${selectedCustomerDetails.payment_history.length}`;
                      }
                      return selectedCustomerDetails.payment_history.length;
                    })()} records)
                  </Typography>
                  <div className="w-full sm:w-72">
                    <Input
                      label="Search payments..."
                      icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                      value={paymentHistorySearchTerm}
                      onChange={(e) => {
                        const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                        setPaymentHistorySearchTerm(filtered);
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr>
                      {[
                        { key: 'payment_date', label: 'Date' },
                        { key: null, label: 'Receipt #' },
                        { key: 'lot_display', label: 'Lot' },
                        { key: 'payment_amount', label: 'Amount' },
                        { key: 'payment_method', label: 'Method' },
                        { key: 'status', label: 'Status' },
                        { key: null, label: 'Notes' }
                      ].map((col, idx) => (
                        <th
                          key={col.key || `col-${idx}`}
                          className={`border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 ${col.key ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                          onClick={col.key ? () => {
                            let direction = 'asc';
                            if (paymentHistorySortConfig.key === col.key && paymentHistorySortConfig.direction === 'asc') {
                              direction = 'desc';
                            }
                            setPaymentHistorySortConfig({ key: col.key, direction });
                          } : undefined}
                        >
                          <div className="flex items-center gap-1">
                            <Typography
                              variant="small"
                              className="text-[11px] font-medium uppercase text-blue-gray-400"
                            >
                              {col.label}
                            </Typography>
                            {col.key && paymentHistorySortConfig.key === col.key && (
                              paymentHistorySortConfig.direction === 'asc' ? 
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
                      // Filter payments based on search term
                      let filteredPayments = selectedCustomerDetails.payment_history || [];
                      if (paymentHistorySearchTerm.trim()) {
                        const searchLower = paymentHistorySearchTerm.toLowerCase().trim();
                        filteredPayments = filteredPayments.filter(payment => {
                          // Generate receipt number for search
                          const receiptNumber = generateReceiptNumber(payment);
                          
                          // Search in various fields
                          const matchesReceiptNumber = receiptNumber.toLowerCase().includes(searchLower);
                          const matchesDate = payment.payment_date ? 
                            new Date(payment.payment_date).toLocaleDateString().toLowerCase().includes(searchLower) : false;
                          const matchesAmount = formatCurrency(payment.payment_amount).toLowerCase().includes(searchLower) ||
                            String(payment.payment_amount || '').includes(searchLower);
                          const matchesMethod = (payment.payment_method || '').toLowerCase().includes(searchLower);
                          const matchesStatus = (payment.status || '').toLowerCase().includes(searchLower);
                          const matchesLot = (payment.lot_display || `Lot ${payment.lot_number || ''}`).toLowerCase().includes(searchLower);
                          const matchesNotes = (payment.notes || '').toLowerCase().includes(searchLower);
                          
                          return matchesReceiptNumber || matchesDate || matchesAmount || matchesMethod || 
                                 matchesStatus || matchesLot || matchesNotes;
                        });
                      }

                      // Check if there are no payments or if search returns no results
                      const hasNoPayments = selectedCustomerDetails.payment_history?.length === 0;
                      const hasSearchNoResults = paymentHistorySearchTerm.trim() && 
                        filteredPayments.length === 0 && 
                        selectedCustomerDetails.payment_history?.length > 0;
                      
                      if (hasNoPayments || hasSearchNoResults) {
                        return (
                          <tr>
                            <td colSpan={7} className="py-12 text-center">
                              <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                                {hasNoPayments ? 'No payment history available' : 'No payments found matching your search'}
                              </Typography>
                            </td>
                          </tr>
                        );
                      }

                      // Group payments by lot
                      const groupedByLot = {};
                      filteredPayments.forEach(payment => {
                        const lotKey = payment.lot_display || `Lot ${payment.lot_number || 'Unknown'}`;
                        if (!groupedByLot[lotKey]) {
                          groupedByLot[lotKey] = [];
                        }
                        groupedByLot[lotKey].push(payment);
                      });

                      // Sort lots alphabetically
                      const sortedLots = Object.keys(groupedByLot).sort();

                      // Sort payments within each lot based on sortConfig
                      sortedLots.forEach(lot => {
                        groupedByLot[lot].sort((a, b) => {
                          if (!paymentHistorySortConfig.key) return 0;
                          
                          let aVal, bVal;
                          switch (paymentHistorySortConfig.key) {
                            case 'payment_date':
                              aVal = new Date(a.payment_date || '1970-01-01').getTime();
                              bVal = new Date(b.payment_date || '1970-01-01').getTime();
                              break;
                            case 'payment_amount':
                              aVal = parseFloat(a.payment_amount || 0);
                              bVal = parseFloat(b.payment_amount || 0);
                              break;
                            case 'payment_method':
                              aVal = (a.payment_method || '').toLowerCase();
                              bVal = (b.payment_method || '').toLowerCase();
                              break;
                            case 'status':
                              aVal = (a.status || '').toLowerCase();
                              bVal = (b.status || '').toLowerCase();
                              break;
                            case 'lot_display':
                              aVal = (a.lot_display || '').toLowerCase();
                              bVal = (b.lot_display || '').toLowerCase();
                              break;
                            default:
                              return 0;
                          }
                          
                          if (aVal < bVal) return paymentHistorySortConfig.direction === 'asc' ? -1 : 1;
                          if (aVal > bVal) return paymentHistorySortConfig.direction === 'asc' ? 1 : -1;
                          return 0;
                        });
                      });

                      // Render grouped payments
                      return sortedLots.map((lotKey, lotIndex) => {
                        const payments = groupedByLot[lotKey];
                        return payments.map((payment, paymentIndex) => (
                          <React.Fragment key={`${payment.id || payment.payment_date || ''}-${payment.lot_id || ''}`}>
                            {paymentIndex === 0 && (
                              <>
                                {lotIndex > 0 && (
                                  <tr>
                                    <td colSpan={7} className="py-3 bg-transparent"></td>
                                  </tr>
                                )}
                                <tr className="bg-blue-gray-100 border-t-2 border-blue-gray-200">
                                  <td colSpan={7} className="py-3 px-6">
                                    <Typography variant="small" color="blue-gray" className="font-bold text-sm">
                                      {lotKey}
                                    </Typography>
                                  </td>
                                </tr>
                                <tr className="bg-blue-gray-50 border-b border-blue-gray-200">
                                  <td colSpan={7} className="py-1"></td>
                                </tr>
                              </>
                            )}
                            <tr className="hover:bg-blue-50 transition-colors">
                              <td className="py-3 px-6">
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-medium"
                                >
                                  {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'N/A'}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-medium font-mono text-xs"
                                >
                                  {generateReceiptNumber(payment) || 'N/A'}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-medium"
                                >
                                  {payment.lot_display || `Lot ${payment.lot_number}`}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-medium"
                                >
                                  {formatCurrency(payment.payment_amount)}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-medium"
                                >
                                  {payment.payment_method}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Chip
                                  variant="ghost"
                                  color={getPaymentStatusColor(payment.status)}
                                  value={payment.status}
                                  className="text-center font-medium w-fit"
                                />
                              </td>
                              <td className="py-3 px-6">
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-normal opacity-70 text-xs"
                                >
                                  {payment.notes ? payment.notes.substring(0, 50) + (payment.notes.length > 50 ? '...' : '') : 'No notes'}
                                </Typography>
                              </td>
                            </tr>
                          </React.Fragment>
                        ));
                      }).flat();
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  No customer data available
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please try selecting the customer again
                </Typography>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={closePaymentHistory}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Monthly Status Dialog */}
      <Dialog
        open={isMonthlyStatusDialogOpen}
        handler={closeMonthlyStatus}
        size="xl"
        className="w-full max-w-5xl"
        dismiss={{ outsidePress: false, escapeKey: false }}
      >
        <DialogHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <ChartBarIcon className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="space-y-1">
            <Typography variant="h5" color="blue-gray">
              Monthly Payment Status
            </Typography>
            <Typography variant="small" color="blue-gray" className="opacity-70">
              {selectedCustomer?.full_name} - {selectedCustomer?.lot_details}
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="p-6 max-h-[80vh] overflow-y-auto">
          {loadingCustomerDetails ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  Loading monthly status...
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please wait while we fetch monthly payment data
                </Typography>
              </div>
            </div>
          ) : selectedCustomerDetails && selectedCustomerDetails.monthly_status ? (
            <div>
              {/* Summary Cards (without percentage) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Total Months
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {selectedCustomerDetails.monthly_status?.summary?.total_months || 0}
                    </Typography>
                  </CardBody>
                </Card>
                <Card className="border border-green-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="green" className="font-medium">
                      Paid Months
                    </Typography>
                    <Typography variant="h5" color="green" className="font-bold">
                      {selectedCustomerDetails.monthly_status?.summary?.total_paid_months || 0}
                    </Typography>
                  </CardBody>
                </Card>
                <Card className="border border-red-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="red" className="font-medium">
                      Unpaid Months
                    </Typography>
                    <Typography variant="h5" color="red" className="font-bold">
                      {selectedCustomerDetails.monthly_status?.summary?.total_unpaid_months || 0}
                    </Typography>
                  </CardBody>
                </Card>
              </div>

              {/* Monthly Status Grid */}
              <Typography variant="h6" color="blue-gray" className="mb-4">
                Monthly Payment Status (Starting from {selectedCustomerDetails.monthly_status?.summary?.account_created || 'N/A'})
              </Typography>
              
              {(selectedCustomerDetails.monthly_status?.monthly_status || []).map((lot, lotIndex) => (
                <div key={lotIndex} className="mb-6">
                  <Typography variant="h6" color="blue-gray" className="mb-3">
                    {lot.lot_display} ({lot.garden})
                  </Typography>
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2 min-w-[280px]">
                      {lot.monthly_payments.map((month, monthIndex) => (
                        <Card 
                          key={monthIndex} 
                          className={`border ${month.paid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
                        >
                          <CardBody className="p-3 text-center space-y-1">
                            <Typography variant="small" color="blue-gray" className="font-medium text-xs">
                              {formatMonthWithDay(month)}
                            </Typography>
                            <div className={`w-3 h-3 rounded-full mx-auto ${month.paid ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            {month.paid && (
                              <>
                                <Typography variant="small" color="green" className="font-bold text-xs">
                                  ₱{month.payment_amount}
                                </Typography>
                                <Typography variant="small" color="blue-gray" className="opacity-70 text-xs">
                                  {new Date(month.payment_date).toLocaleDateString()}
                                </Typography>
                              </>
                            )}
                          </CardBody>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-4 mt-6 p-4 bg-blue-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <Typography variant="small" color="blue-gray">Paid</Typography>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <Typography variant="small" color="blue-gray">Unpaid</Typography>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  No monthly status data available
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Monthly status data is not available for this customer
                </Typography>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={closeMonthlyStatus}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Payment Processing Dialog */}
      <Dialog
        open={isPaymentDialogOpen}
        handler={closePaymentDialog}
        size="lg"
        className="min-w-[600px]"
      >
        <DialogHeader className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-gray-100 flex items-center justify-center">
            <Typography
              variant="small"
              color="blue-gray"
              className="font-semibold text-sm"
            >
              {selectedCustomer ? getInitials(selectedCustomer.full_name) : ''}
            </Typography>
          </div>
          <div>
            <Typography variant="h5" color="blue-gray">
              Process Payment
            </Typography>
            <Typography variant="small" color="blue-gray" className="opacity-70">
              {selectedCustomer?.full_name} - {selectedCustomer?.lot_details}
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="p-6 max-h-[80vh] overflow-y-auto">
          {loadingCustomerDetails ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  Loading customer details...
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please wait while we prepare payment information
                </Typography>
              </div>
            </div>
          ) : selectedCustomerDetails ? (
            <div className="space-y-6">
              {/* Customer Info Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Total Paid
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {formatCurrency(selectedCustomerDetails.payment_summary.total_paid_amount)}
                    </Typography>
                  </CardBody>
                </Card>
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Overdue Months
                    </Typography>
                    <Typography variant="h5" color={selectedCustomerDetails.payment_summary.overdue_months > 0 ? "red" : "green"} className="font-bold">
                      {selectedCustomerDetails.payment_summary.overdue_months}
                    </Typography>
                  </CardBody>
                </Card>
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      Last Payment
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {selectedCustomerDetails.payment_summary.last_payment_date ? 
                        new Date(selectedCustomerDetails.payment_summary.last_payment_date).toLocaleDateString() : 'None'}
                    </Typography>
                  </CardBody>
                </Card>
              </div>

              {/* Payment Form */}
              <div className="space-y-4">
                <Typography variant="h6" color="blue-gray">
                  Monthly Payment Details
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Process monthly payment for a specific month and lot
                </Typography>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Lot Selection */}
                  <Select
                    label="Select Lot"
                    value={paymentForm.selectedLot}
                    onChange={(value) => {
                      handleFormChange('selectedLot', value);
                      handleFormChange('selectedMonth', ''); // Reset month when lot changes
                    }}
                  >
                    {selectedCustomerDetails.lots.map((lot) => (
                      <Option key={String(lot.id)} value={String(lot.id)}>
                        {lot.display_name}
                      </Option>
                    ))}
                  </Select>
                  
                  {/* Fully Paid Alert */}
                  {paymentForm.selectedLot && paymentForm.amount === "0" && (
                    <div className="md:col-span-2">
                      <Alert color="green" className="flex items-center gap-2">
                        <Typography variant="small" className="font-bold">
                          ✅ This lot is already fully paid! No monthly payments are required.
                        </Typography>
                      </Alert>
                    </div>
                  )}
                  
                  {/* Month Selection */}
                  {paymentForm.selectedLot && paymentForm.amount !== "0" && (
                    <Select
                      label="Select Month"
                      value={paymentForm.selectedMonth}
                      onChange={(value) => handleFormChange('selectedMonth', value)}
                    >
                    {getAvailableMonths(selectedCustomerDetails, paymentForm.selectedLot).map((month) => (
                      <Option key={String(month.year_month)} value={String(month.year_month)}>
                          {formatMonthWithDay(month)}
                        </Option>
                      ))}
                    </Select>
                  )}
                  
                {paymentForm.selectedLot && paymentForm.amount !== "0" && selectedMonthTotals && (
                  <>
                    <Input
                      label="Normal Amount (₱)"
                      type="number"
                      value={selectedMonthTotals.baseAmount.toFixed(2)}
                      readOnly
                      className="bg-gray-50"
                      icon={<CurrencyDollarIcon className="h-5 w-5" />}
                    />
                    {selectedMonthDetails?.overdue && (
                      <Input
                        label="3% Penalty (₱)"
                        type="number"
                        value={selectedMonthTotals.penaltyAmount.toFixed(2)}
                        readOnly
                        className="bg-red-50 text-red-700"
                        icon={<ExclamationTriangleIcon className="h-5 w-5 text-red-500" />}
                      />
                    )}
                    <Input
                      label="Final Amount To Charge (₱)"
                      type="number"
                      value={selectedMonthTotals.totalAmount.toFixed(2)}
                      readOnly
                      className="bg-blue-50 font-semibold"
                      icon={<CurrencyDollarIcon className="h-5 w-5" />}
                    />
                  </>
                )}
                {!paymentForm.selectedMonth && (
                  <Input
                    label="Payment Amount"
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => handleFormChange('amount', e.target.value)}
                    icon={<CurrencyDollarIcon className="h-5 w-5" />}
                  />
                )}
                  <Input
                    label="Payment Method"
                    value="Cash"
                    readOnly
                  />
                </div>

                <Input
                  label="Notes (Optional)"
                  value={paymentForm.notes}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                  placeholder="Add any additional notes..."
                />

                {/* Monthly Payment Info */}
                {paymentForm.selectedMonth && (
                  <Alert color="blue" className="flex items-center gap-2">
                    <Typography variant="small" className="font-medium">
                      Processing monthly payment for {(() => {
                        const month = getAvailableMonths(selectedCustomerDetails, paymentForm.selectedLot)
                          .find(m => m.year_month === paymentForm.selectedMonth);
                        return month ? formatMonthWithDay(month) : paymentForm.selectedMonth;
                      })()}
                    </Typography>
                  </Alert>
                )}

                {selectedCustomerDetails.payment_summary.overdue_months > 0 && (
                  <Alert color="yellow" className="flex items-center gap-2">
                    <Typography variant="small" className="font-medium">
                      This customer has {selectedCustomerDetails.payment_summary.overdue_months} overdue months.
                      Consider collecting overdue payments.
                    </Typography>
                  </Alert>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  No customer data available
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please try selecting the customer again
                </Typography>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={closePaymentDialog}>
            Cancel
          </Button>
          <Button 
            color="blue" 
            onClick={processPayment}
            disabled={
              !paymentForm.amount || 
              parseFloat(paymentForm.amount) <= 0 ||
              !paymentForm.selectedLot || 
              !paymentForm.selectedMonth
            }
            className="flex items-center gap-2"
          >
            <CheckCircleIcon className="h-4 w-4" />
            Process Payment
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Make Payment Wizard (Cash / Online, General / Monthly, Multi-month) */}
      <Dialog
        open={isMakePaymentDialogOpen}
        handler={() => setIsMakePaymentDialogOpen(false)}
        size="lg"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
        dismiss={{ outsidePress: false, escapeKey: false }}
      >
        <DialogHeader className="flex flex-col gap-1">
          <div>
            <Typography variant="h5" color="blue-gray">Make Payment</Typography>
            <Typography variant="small" color="blue-gray" className="opacity-70">
              {selectedCustomer?.full_name} - {selectedCustomer?.lot_details}
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          {/* Error Display */}
          {error && (
            <Alert color="red" className="mb-4">
              <Typography variant="small" color="red">
                {error}
              </Typography>
            </Alert>
          )}
          
          {selectedCustomerDetails ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Payment Method"
                  value="Cash"
                  readOnly
                />
                <Select 
                  label="Select Lot" 
                  value={paymentWizard.lotId} 
                  onChange={async (v)=> {
                    const monthlyAmt = await fetchMonthlyAmountForLot(selectedCustomer.id, v);
                    // preselect earliest unpaid month (sequential order)
                    let defaultMonths = [];
                    const av = getAvailableMonths(selectedCustomerDetails, v);
                    if (av.length > 0) {
                      // Sort months chronologically and select the earliest one
                      const sortedMonths = av.sort((a, b) => a.year_month.localeCompare(b.year_month));
                      defaultMonths = [sortedMonths[0].year_month];
                    }
                    // Calculate initial amount using actual scheduled amounts (includes 2-split downpayment adjustment)
                    const initialAmount = defaultMonths.length > 0 
                      ? calculateTotalForMonths(selectedCustomerDetails, v, defaultMonths)
                      : (monthlyAmt||0);
                    setPaymentWizard(p=> ({...p, lotId: v, months: defaultMonths, monthlyRate: monthlyAmt||0, amount: String(initialAmount) }));
                  }}
                  disabled={selectedCustomerDetails.lots?.filter(l => !isLotFullyPaid(selectedCustomer.id, l.id)).length === 0}
                >
                  {selectedCustomerDetails.lots?.filter(l => !isLotFullyPaid(selectedCustomer.id, l.id)).length === 0 ? (
                    <Option value="" disabled>
                      {selectedCustomerDetails.lots?.length === 0 
                        ? "No lots assigned" 
                        : "No lots available for payment"}
                    </Option>
                  ) : (
                    selectedCustomerDetails.lots?.filter(l => !isLotFullyPaid(selectedCustomer.id, l.id)).map(l => (
                      <Option key={String(l.id)} value={String(l.id)}>{l.display_name}</Option>
                    ))
                  )}
                </Select>
                <Input label="Total Amount (PHP)" type="number" value={paymentWizard.amount} readOnly className="bg-gray-50" icon={<CurrencyDollarIcon className="h-5 w-5" />} />
              </div>

              {/* All Lots Fully Paid Alert */}
              {selectedCustomerDetails.lots?.filter(l => !isLotFullyPaid(selectedCustomer.id, l.id)).length === 0 && (
                <Alert color={selectedCustomerDetails.lots?.length === 0 ? "amber" : "green"} className="flex items-center gap-2">
                  <Typography variant="small" className="font-bold">
                    {selectedCustomerDetails.lots?.length === 0 
                      ? "⚠️ No lots assigned. No payment required." 
                      : "✅ All lots are fully paid! No payments are required. 🔒"}
                  </Typography>
                </Alert>
              )}

              {/* Fully Paid Alert for Selected Lot */}
              {paymentWizard.lotId && isLotFullyPaid(selectedCustomer.id, paymentWizard.lotId) && getAvailableMonths(selectedCustomerDetails, paymentWizard.lotId).length === 0 && selectedCustomerDetails.lots?.filter(l => !isLotFullyPaid(selectedCustomer.id, l.id)).length > 0 && (
                <Alert color="green" className="flex items-center gap-2">
                  <Typography variant="small" className="font-bold">
                    ✅ This lot is already fully paid! No payments are required. 🔒
                  </Typography>
                </Alert>
              )}

              {paymentWizard.lotId && (() => {
                const availableMonths = getAvailableMonths(selectedCustomerDetails, paymentWizard.lotId);
                if (availableMonths.length === 0) {
                  // Show helpful message if no months available
                  const hasPaymentPlan = selectedCustomerDetails?.monthly_status && (
                    (Array.isArray(selectedCustomerDetails.monthly_status) && 
                     selectedCustomerDetails.monthly_status.some(ms => String(ms.lot_id) === String(paymentWizard.lotId))) ||
                    (selectedCustomerDetails.monthly_status?.monthly_status && 
                     Array.isArray(selectedCustomerDetails.monthly_status.monthly_status) &&
                     selectedCustomerDetails.monthly_status.monthly_status.some(ms => String(ms.lot_id) === String(paymentWizard.lotId)))
                  );
                  
                  if (!hasPaymentPlan && !isLotFullyPaid(selectedCustomer.id, paymentWizard.lotId)) {
                    return (
                      <Alert color="amber" className="flex items-center gap-2">
                        <Typography variant="small" className="font-bold">
                          ⚠️ No payment plan found for this lot. Please ensure the ownership was created with an installment plan.
                        </Typography>
                      </Alert>
                    );
                  }
                  return null;
                }
                return (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Select Months to Pay (Sequential Order Required)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {getSelectableMonths(selectedCustomerDetails, paymentWizard.lotId, paymentWizard.months).map(m => {
                      const isCurrent = m.year_month === new Date().toISOString().slice(0,7);
                      const isPaid = !!m.paid;
                      const isOverdue = !!(m.overdue || (!m.paid && new Date(m.due_date || `${m.year_month}-15`) < new Date()));
                      const selected = paymentWizard.months.includes(m.year_month);
                      const canSelect = m.canSelect;
                      const canDeselect = m.canDeselect;
                      
                      return (
                      <button
                        key={m.year_month}
                        onClick={() => {
                          if (isPaid) return; // cannot toggle paid months
                          
                          if (selected) {
                            // Trying to deselect
                            if (!canDeselect) {
                              setError('Cannot deselect this month as it would create a gap in the payment sequence. You can only deselect the last month in your selection.');
                              return;
                            }
                            // Safe to deselect
                            setError(''); // Clear any previous errors
                            const newMonths = (paymentWizard.months||[]).filter(x=>x!==m.year_month);
                            // Calculate total using actual scheduled amounts (includes 2-split downpayment adjustment)
                            const total = selectedCustomerDetails 
                              ? calculateTotalForMonths(selectedCustomerDetails, paymentWizard.lotId, newMonths)
                              : (paymentWizard.monthlyRate||0) * Math.max(newMonths.length, 1);
                            setPaymentWizard(p=> ({...p, months: newMonths, amount: String(total)}));
                          } else {
                            // Trying to select
                            if (!canSelect) {
                              setError('Must pay months in sequential order. Please select months in chronological order.');
                              return;
                            }
                            // Safe to select
                            setError(''); // Clear any previous errors
                            const newMonths = [ ...(paymentWizard.months||[]), m.year_month ].sort();
                            // Calculate total using actual scheduled amounts (includes 2-split downpayment adjustment)
                            const total = selectedCustomerDetails 
                              ? calculateTotalForMonths(selectedCustomerDetails, paymentWizard.lotId, newMonths)
                              : (paymentWizard.monthlyRate||0) * Math.max(newMonths.length, 1);
                            setPaymentWizard(p=> ({...p, months: newMonths, amount: String(total)}));
                          }
                        }}
                        className={`p-2 rounded border text-sm ${
                          selected && isOverdue ? 'bg-red-200 border-red-400' :
                          selected ? 'bg-blue-100 border-blue-300' : 
                          !canSelect ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-50' :
                          'bg-gray-50 border-gray-200'
                        } ${isPaid ? 'cursor-not-allowed bg-green-100 border-green-300' : ''} ${isOverdue && !selected ? 'bg-red-100 border-red-300' : ''} ${selected && !canDeselect ? 'ring-2 ring-orange-300 cursor-not-allowed opacity-75' : ''}`}
                        disabled={isPaid || (!canSelect && !selected) || (selected && !canDeselect)}
                        title={
                          isPaid ? 'Already paid' :
                          !canSelect ? 'Must pay months in sequential order' :
                          selected && !canDeselect ? 'Cannot deselect - would create gap in sequence' :
                          ''
                        }
                      >
                        {formatMonthWithDay(m)}
                      </button>
                      );
                    })}
                  </div>
                  <Typography variant="small" color="gray" className="text-xs">
                    💡 You must pay months in chronological order. You cannot skip months. You can only deselect the last month in your selection.
                  </Typography>
                </div>
                );
              })()}

          {paymentWizard.lotId && wizardMonthSummaries.length > 0 && (
            <div className="space-y-3">
              <Typography variant="small" className="font-semibold text-blue-gray-700">
                Selected Months Breakdown
              </Typography>
              <div className="rounded-lg border border-blue-gray-100 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-blue-gray-400">
                        <th className="py-2 px-3">Month</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3 text-right">Normal</th>
                        <th className="py-2 px-3 text-right">3% Penalty</th>
                        <th className="py-2 px-3 text-right">Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wizardMonthSummaries.map((month) => (
                        <tr key={month.year_month} className="border-t border-blue-gray-50">
                          <td className="py-2 px-3 font-medium">{formatMonthWithDay(month)}</td>
                          <td className="py-2 px-3">
                            <Chip
                              size="sm"
                              variant="ghost"
                              color={month.overdue ? "red" : "green"}
                              value={month.overdue ? "Overdue" : "On Schedule"}
                              className="text-[11px] font-semibold"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">{formatCurrency(month.baseAmount)}</td>
                          <td className="py-2 px-3 text-right text-red-600">
                            {month.overdue ? formatCurrency(month.penaltyAmount) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">{formatCurrency(month.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-blue-gray-50 p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Total Base</span>
                    <span className="font-semibold">{formatCurrency(wizardTotals.base)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total 3% Penalty</span>
                    <span className="font-semibold text-red-600">{formatCurrency(wizardTotals.penalty)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base">
                    <span className="font-semibold">Final Amount To Charge</span>
                    <span className="font-black text-blue-700">{formatCurrency(wizardTotals.final)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
            </div>
          ) : (
            <div className="text-center py-10">
              <Typography variant="small" color="blue-gray" className="opacity-70">Loading details...</Typography>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={()=> setIsMakePaymentDialogOpen(false)}>Cancel</Button>
          <Button 
            color="blue" 
            onClick={openPaymentConfirmation}
            disabled={
              !paymentWizard.lotId || 
              !paymentWizard.amount || 
              parseFloat(paymentWizard.amount) <= 0 ||
              paymentWizard.monthlyRate <= 0 || 
              paymentWizard.months.length === 0
            }
          >
            Proceed
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Payment Confirmation Dialog */}
      <Dialog
        open={isPaymentConfirmationDialogOpen}
        handler={closePaymentConfirmation}
        size="lg"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
            <Typography variant="h5" color="blue-gray">
              Confirm Payment
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="max-h-[80vh] overflow-y-auto">
          <div className="space-y-4">
            <Typography variant="small" color="blue-gray" className="font-normal">
              Please review the payment details before proceeding:
            </Typography>
            
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Customer:</span>
                <span>{selectedCustomer?.full_name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Lot:</span>
                <span>{selectedCustomer?.lot_details || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Payment Type:</span>
                <span>Monthly</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Payment Method:</span>
                <span>{paymentWizard.method}</span>
              </div>
              {paymentWizard.months.length > 0 && (
                <div className="flex justify-between">
                  <span className="font-medium">Months to Pay:</span>
                  <span>{paymentWizard.months.join(', ')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-medium">Total Amount:</span>
                <span className="font-bold text-green-600">₱{parseFloat(paymentWizard.amount || 0).toLocaleString()}</span>
              </div>
            </div>
            
            <Alert color="yellow" className="text-sm">
              This action will create a payment record and cannot be easily undone. Please ensure all details are correct.
            </Alert>
          </div>
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="gray" onClick={closePaymentConfirmation}>
            Cancel
          </Button>
          <Button color="green" onClick={async ()=> {
            try {
              if (!selectedCustomerDetails) return;
              if (!paymentWizard.lotId) { setError('Select a lot'); return; }
              
              // Validate sequential month selection for monthly payments
              const availableMonths = getAvailableMonths(selectedCustomerDetails, paymentWizard.lotId);
              const sortedAvailable = [...availableMonths].sort((a, b) => a.year_month.localeCompare(b.year_month));
              const selectedMonths = [...paymentWizard.months].sort();
              
              if (selectedMonths.length > sortedAvailable.length) {
                setError('You selected more months than are currently unpaid.');
                return;
              }
              
              // Check if selected months are sequential from the earliest unpaid month
              for (let i = 0; i < selectedMonths.length; i++) {
                if (!sortedAvailable[i]) {
                  setError('Selected months exceed the unpaid schedule.');
                  return;
                }
                const expectedMonth = sortedAvailable[i].year_month;
                if (selectedMonths[i] !== expectedMonth) {
                  setError(`You cannot skip months. Please pay months in sequential order starting from ${formatMonthWithDay(sortedAvailable[0])}.`);
                  return;
                }
              }
              
              // Get actual amounts for each selected month (includes 2-split downpayment adjustment)
              const monthAmounts = {};
              let totalExpectedAmount = 0;
              const monthLookup = new Map(availableMonths.map((m) => [m.year_month, m]));
              for (const ym of selectedMonths) {
                const month = monthLookup.get(ym);
                if (month) {
                  const totals = deriveMonthTotals(month);
                  monthAmounts[ym] = totals.totalAmount;
                  totalExpectedAmount += totals.totalAmount;
                } else {
                  // Fallback to monthlyRate if month not found
                  const fallbackAmount = (Number(paymentWizard.monthlyRate) > 0)
                    ? Number(paymentWizard.monthlyRate)
                    : (parseFloat(paymentWizard.amount||'0') / Math.max(paymentWizard.months.length, 1));
                  monthAmounts[ym] = fallbackAmount;
                  totalExpectedAmount += fallbackAmount;
                }
              }
              
              if (totalExpectedAmount <= 0) { setError('Enter valid monthly amount'); return; }
             
              
              // Monthly payments: pay selected months (multi)
              if (!paymentWizard.months.length) { setError('Select at least one month'); return; }
              // Get current user ID from localStorage for activity log
              const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
              const userId = currentUser?.id ? currentUser.id.toString() : null;
              const headers = { 'Content-Type': 'application/json' };
              if (userId) {
                headers['X-User-Id'] = userId;
              }

              if (paymentWizard.method === 'Cash') {
                const payload = {
                  lot_id: paymentWizard.lotId,
                  customer_id: selectedCustomer.id,
                  payment_method: 'Cash',
                  bulk_payments: selectedMonths.map((ym) => ({
                    payment_month: ym,
                    payment_amount: monthAmounts[ym] || (Number(paymentWizard.monthlyRate) > 0 ? Number(paymentWizard.monthlyRate) : 0)
                  }))
                };

                const res = await fetch('/api/create_f2f_payment.php', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(payload),
                });

                  const data = await res.json();
                if (!res.ok || !data.success) {
                  throw new Error(data.message || 'Failed to process payment');
                }

                const processedCount = data.processed_months?.length || selectedMonths.length;
                setSuccessMessage(`Payment of ${formatCurrency(totalExpectedAmount)} processed successfully for ${processedCount} month${processedCount === 1 ? '' : 's'} (${selectedCustomer?.full_name || 'customer'}).`);
                setIsSuccessDialogOpen(true);
                closePaymentConfirmation();
                setIsMakePaymentDialogOpen(false);
                await Promise.all([
                  loadCustomers(false).catch(() => {}),
                  loadOverduePayments().catch(() => {})
                ]);
              } else if (paymentWizard.method === 'Online') {
                // Online payments: create PayMongo checkout for each month
                const successUrl = `${window.location.origin}/dashboard/payments?payment=success`;
                const cancelUrl = `${window.location.origin}/dashboard/payments?payment=cancelled`;
                const checkoutUrls = [];
                const checkoutIds = [];
                
                for (const ym of selectedMonths) {
                  const monthAmount = monthAmounts[ym] || (Number(paymentWizard.monthlyRate) > 0 ? Number(paymentWizard.monthlyRate) : 0);
                  
                  const res = await fetch('/api/create_monthly_payment.php', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                      lot_id: paymentWizard.lotId,
                      payment_month: ym,
                      payment_amount: monthAmount,
                      customer_id: selectedCustomer.id,
                      success_url: successUrl,
                      cancel_url: cancelUrl,
                    }),
                  });
                  const data = await res.json();
                  if (!data.success) throw new Error(data.message || 'Failed');
                  
                  if (data.checkout_url && data.checkout_id) {
                    checkoutUrls.push(data.checkout_url);
                    checkoutIds.push(data.checkout_id);
                  }
                }
                
                // Open first PayMongo checkout in the same tab (avoid spawning new tabs)
                if (checkoutUrls.length > 0) {
                  window.open(checkoutUrls[0], '_self');
                }
                
                // Close dialogs
                closePaymentConfirmation();
                setIsMakePaymentDialogOpen(false);
                
                // Show info message
                setSuccessMessage(`PayMongo checkout ${checkoutUrls.length > 1 ? 'windows opened' : 'window opened'}. Please complete the payment${checkoutUrls.length > 1 ? 's' : ''} in the new window${checkoutUrls.length > 1 ? 's' : ''}.`);
                setIsSuccessDialogOpen(true);
                
                // Process pending payments after a short delay
                setTimeout(async () => {
                  try {
                    await fetch('/api/process_pending_payments.php');
                  } catch (e) {
                    console.error('Error processing pending payments:', e);
                  }
                }, 3000);
                
                // Poll for payment completion for all checkout IDs
                if (checkoutIds.length > 0) {
                  let pollCount = 0;
                  const maxPolls = 180; // Poll for up to 3 minutes (180 polls * 2 seconds)
                  const processedCheckoutIds = new Set();
                  
                  const pollInterval = setInterval(async () => {
                    pollCount++;
                    try {
                      // Check each checkout ID
                      for (const checkoutId of checkoutIds) {
                        if (processedCheckoutIds.has(checkoutId)) continue;
                        
                        const processRes = await fetch('/api/process_pending_payments.php?checkout_id=' + encodeURIComponent(checkoutId));
                        const processData = await processRes.json();
                        
                        if (processData.processed_count > 0) {
                          processedCheckoutIds.add(checkoutId);
                          // Send email receipt
                          try {
                            await fetch('/api/email_receipt.php', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ checkout_id: checkoutId })
                            });
                          } catch (e) { /* ignore */ }
                        }
                      }
                      
                      // If all payments are processed
                      if (processedCheckoutIds.size === checkoutIds.length) {
                        clearInterval(pollInterval);
                        // Refresh customer list after payment is processed
                        await Promise.all([
                          loadCustomers(false).catch(() => {}),
                          loadOverduePayments().catch(() => {})
                        ]);
                        setSuccessMessage(`Payment${checkoutIds.length > 1 ? 's' : ''} processed successfully! Receipt${checkoutIds.length > 1 ? 's have' : ' has'} been sent via email.`);
                        setIsSuccessDialogOpen(true);
                      } else if (pollCount >= maxPolls) {
                        clearInterval(pollInterval);
                        // Still refresh to show any payments that were processed
                        loadCustomers(false).catch(() => {});
                      }
                    } catch (e) {
                      console.error('Error polling payment status:', e);
                      if (pollCount >= maxPolls) {
                        clearInterval(pollInterval);
                      }
                    }
                  }, 2000); // Poll every 2 seconds
                }
              }
            } catch (e) {
              setError(e.message || 'Failed to process');
            }
          }}>
            Confirm Payment
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Success Dialog */}
      <Dialog
        open={isSuccessDialogOpen}
        handler={closeSuccessDialog}
        size="sm"
      >
        <DialogHeader className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircleIcon className="h-6 w-6 text-green-600" />
          </div>
          <Typography variant="h5" color="blue-gray">
            Payment Successful
          </Typography>
        </DialogHeader>
        <DialogBody className="p-6">
          <Typography variant="paragraph" color="blue-gray">
            {successMessage}
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70 mt-2">
            The customer's payment history has been updated. You can view the updated records in the customer table.
          </Typography>
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button color="blue" onClick={closeSuccessDialog}>
            Continue
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog
        open={isReceiptDialogOpen}
        handler={closeReceiptDialog}
        size="lg"
        className="min-w-[600px]"
      >
        <DialogHeader className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircleIcon className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <Typography variant="h5" color="blue-gray">
              Payment Receipt
            </Typography>
            <Typography variant="small" color="blue-gray" className="opacity-70">
              Transaction completed successfully
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="p-6 max-h-[80vh] overflow-y-auto">
          {receiptData ? (
            <div id="receipt-content" className="space-y-6">
              {/* Company Header */}
              <div className="text-center border-b pb-4">
                <Typography variant="h4" color="blue-gray" className="font-bold">
                  {receiptData.company_info.name}
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  {receiptData.company_info.address}
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  {receiptData.company_info.phone} | {receiptData.company_info.email}
                </Typography>
              </div>

              {/* Receipt Header */}
              <div className="flex justify-between items-center">
                <div>
                  <Typography variant="h6" color="blue-gray" className="font-bold">
                    PAYMENT RECEIPT
                  </Typography>
                  <Typography variant="small" color="blue-gray">
                    Receipt #: {receiptData.receipt_number}
                  </Typography>
                </div>
                <div className="text-right">
                  <Typography variant="small" color="blue-gray">
                    Date: {new Date(receiptData.transaction_date).toLocaleDateString()}
                  </Typography>
                  <Typography variant="small" color="blue-gray">
                    Time: {new Date(receiptData.transaction_date).toLocaleTimeString()}
                  </Typography>
                </div>
              </div>

              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Typography variant="h6" color="blue-gray" className="mb-2">
                    Customer Information
                  </Typography>
                  <div className="space-y-1">
                    <Typography variant="small" color="blue-gray">
                      <strong>Name:</strong> {receiptData.customer_info.name}
                    </Typography>
                    <Typography variant="small" color="blue-gray">
                      <strong>Email:</strong> {receiptData.customer_info.email}
                    </Typography>
                    <Typography variant="small" color="blue-gray">
                      <strong>Contact:</strong> {receiptData.customer_info.contact}
                    </Typography>
                    {receiptData.customer_info.address && (
                      <Typography variant="small" color="blue-gray">
                        <strong>Address:</strong> {receiptData.customer_info.address}
                      </Typography>
                    )}
                  </div>
                </div>

                <div>
                  <Typography variant="h6" color="blue-gray" className="mb-2">
                    Lot Information
                  </Typography>
                  <div className="space-y-1">
                    <Typography variant="small" color="blue-gray">
                      <strong>Lot:</strong> {receiptData.lot_info.lot_display}
                    </Typography>
                    <Typography variant="small" color="blue-gray">
                      <strong>Garden:</strong> {receiptData.lot_info.garden}
                    </Typography>
                    <Typography variant="small" color="blue-gray">
                      <strong>Sector:</strong> {receiptData.lot_info.sector}
                    </Typography>
                    <Typography variant="small" color="blue-gray">
                      <strong>Block:</strong> {receiptData.lot_info.block}
                    </Typography>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="border-t border-b py-4">
                <Typography variant="h6" color="blue-gray" className="mb-3">
                  Payment Details
                </Typography>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Typography variant="small" color="blue-gray">Description:</Typography>
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      {receiptData.payment_info.description}
                    </Typography>
                  </div>
                  <div className="flex justify-between">
                    <Typography variant="small" color="blue-gray">Payment Method:</Typography>
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      {receiptData.payment_info.method}
                    </Typography>
                  </div>
                  <div className="flex justify-between">
                    <Typography variant="small" color="blue-gray">Payment Date:</Typography>
                    <Typography variant="small" color="blue-gray" className="font-medium">
                      {new Date(receiptData.payment_date).toLocaleDateString()}
                    </Typography>
                  </div>
                  <div className="flex justify-between">
                    <Typography variant="small" color="blue-gray">Status:</Typography>
                    <Chip
                      variant="ghost"
                      color="green"
                      value={receiptData.payment_info.status}
                      className="text-center font-medium w-fit"
                    />
                  </div>
                  <div className="flex justify-between items-center border-t pt-2 mt-3">
                    <Typography variant="h6" color="blue-gray" className="font-bold">
                      Total Amount:
                    </Typography>
                    <Typography variant="h5" color="green" className="font-bold">
                      {formatCurrency(receiptData.payment_info.amount)}
                    </Typography>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {receiptData.payment_info.notes && (
                <div>
                  <Typography variant="h6" color="blue-gray" className="mb-2">
                    Notes
                  </Typography>
                  <Typography variant="small" color="blue-gray" className="opacity-70">
                    {receiptData.payment_info.notes}
                  </Typography>
                </div>
              )}

              {/* Footer */}
              <div className="text-center border-t pt-4">
                <Typography variant="small" color="blue-gray" className="font-medium">
                  {receiptData.receipt_footer.thank_you_message}
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70 mt-1">
                  {receiptData.receipt_footer.contact_info}
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-50 mt-2">
                  Generated: {new Date(receiptData.receipt_footer.generated_at).toLocaleString()}
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-50">
                  Processed by: {receiptData.receipt_footer.processed_by}
                </Typography>
              </div>
            </div>
          ) : (
            <div className="text-center py-10">
              <Typography variant="small" color="blue-gray" className="opacity-70">
                Preparing receipt...
              </Typography>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={closeReceiptDialog}>
            Close
          </Button>
          <Button color="blue" onClick={printReceipt} className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Receipt
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Lot Status Dialog */}
      <Dialog
        open={isLotStatusDialogOpen}
        handler={closeLotStatus}
        size="xl"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
        dismiss={{ outsidePress: false, escapeKey: false }}
      >
        <DialogHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <ChartBarIcon className="h-5 w-5 text-green-600" />
          </div>
          <div className="space-y-1">
            <Typography variant="h5" color="blue-gray">
              Lot Status
            </Typography>
            <Typography variant="small" color="blue-gray" className="opacity-70">
              {selectedCustomer?.full_name} - {selectedCustomer?.lot_details}
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          {loadingCustomerDetails ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  Loading lot status...
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please wait while we fetch lot information
                </Typography>
              </div>
            </div>
          ) : selectedCustomerDetails ? (
            <div>
              {/* Customer & Lot Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="h6" color="blue-gray" className="mb-3">
                      Customer Information
                    </Typography>
                    <div className="space-y-2">
                      <Typography variant="small" color="blue-gray">
                        <span className="font-semibold">Name:</span> {selectedCustomerDetails.full_name}
                      </Typography>
                      <Typography variant="small" color="blue-gray">
                        <span className="font-semibold">Contact:</span> {selectedCustomerDetails.contact_number}
                      </Typography>
                      <Typography variant="small" color="blue-gray">
                        <span className="font-semibold">Email:</span> {selectedCustomerDetails.email}
                      </Typography>
                      <Typography variant="small" color="blue-gray">
                        <span className="font-semibold">Address:</span> {selectedCustomerDetails.address}
                      </Typography>
                    </div>
                  </CardBody>
                </Card>

                <Card className="border border-blue-gray-100">
                  <CardBody className="p-4">
                    <Typography variant="h6" color="blue-gray" className="mb-3">
                      Lot Information
                    </Typography>
                    <div className="space-y-2">
                      {selectedCustomerDetails.lots && selectedCustomerDetails.lots.length > 0 ? (
                        selectedCustomerDetails.lots.map((lot) => (
                          <div key={String(lot.id)} className="p-3 bg-blue-gray-50 rounded-lg">
                            <Typography variant="small" color="blue-gray" className="font-semibold">
                              {lot.display_name}
                            </Typography>
                            <Typography variant="small" color="blue-gray">
                              <span className="font-semibold">Status:</span> 
                              <Chip 
                                variant="ghost" 
                                color={getStatusColor(lot.status)} 
                                value={lot.status}
                                className="ml-2"
                              />
                            </Typography>
                            <Typography variant="small" color="blue-gray">
                              <span className="font-semibold">Purchase Date:</span> {lot.purchase_date ? new Date(lot.purchase_date).toLocaleDateString() : 'N/A'}
                            </Typography>
                            {lot.vault_option && (
                              <Typography variant="small" color="blue-gray">
                                <span className="font-semibold">Vault Option:</span> {lot.vault_option}
                              </Typography>
                            )}
                          </div>
                        ))
                      ) : (
                        <Typography variant="small" color="blue-gray" className="opacity-70">
                          No lots assigned
                        </Typography>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  No customer data available
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please try selecting the customer again
                </Typography>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={closeLotStatus}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Intake Dialog */}
      <Dialog
        open={isIntakeDialogOpen}
        handler={() => setIsIntakeDialogOpen(false)}
        size="xl"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
        dismiss={{ outsidePress: false, escapeKey: false }}
      >
        <DialogHeader className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <Typography variant="h5" color="blue-gray">
              Payment Intake
            </Typography>
            <Typography variant="small" color="blue-gray" className="opacity-70">
              View all payment transactions and who performed them
            </Typography>
          </div>
        </DialogHeader>
        <DialogBody className="p-6 flex-1 overflow-y-auto">
          {/* Filter Controls */}
          <div className="flex gap-4 mb-6">
            <Select
              label="Filter by Date"
              value={intakeFilter}
              onChange={(value) => {
                setIntakeFilter(value);
                loadIntakePayments(value);
              }}
            >
              <Option value="today">Today</Option>
              <Option value="30days">Last 30 Days</Option>
              <Option value="all">All Time</Option>
            </Select>
            <Button 
              color="blue" 
              size="sm"
              onClick={() => loadIntakePayments(intakeFilter)}
              disabled={loadingIntake}
            >
              {loadingIntake ? 'Loading...' : 'Refresh'}
            </Button>
            <Button color="blue-gray" size="sm" variant="outlined" onClick={exportIntake} disabled={loadingIntake} className="min-w-[110px]">
              Export
            </Button>
          </div>

          {/* Payments Table */}
          {loadingIntake ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  Loading payments...
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  Please wait while we fetch payment data
                </Typography>
              </div>
            </div>
          ) : intakePayments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] table-auto">
                  <thead>
                    <tr>
                     {[
                       { key: 'payment_date', label: 'Date' },
                       { key: 'owner_name', label: 'Customer' },
                       { key: 'lot_display', label: 'Lot' },
                       { key: 'amount', label: 'Amount' },
                       { key: 'payment_method', label: 'Method' },
                       { key: 'status', label: 'Status' },
                       { key: 'performed_by', label: 'Performed By' }
                     ].map((col) => (
                       <th
                         key={col.key}
                         className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                         onClick={() => handleIntakeSort(col.key)}
                       >
                         <div className="flex items-center gap-1">
                           <Typography
                             variant="small"
                             className="text-[11px] font-medium uppercase text-blue-gray-400"
                           >
                             {col.label}
                           </Typography>
                           {intakeSortConfig.key === col.key && (
                             intakeSortConfig.direction === 'asc' ? 
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
                    let sortedIntakePayments = [...intakePayments];
                    
                    // Apply sorting
                    if (intakeSortConfig.key) {
                      sortedIntakePayments.sort((a, b) => {
                        let aVal, bVal;
                        
                        switch (intakeSortConfig.key) {
                          case 'payment_date':
                            aVal = new Date(a.payment_date || 0).getTime();
                            bVal = new Date(b.payment_date || 0).getTime();
                            break;
                          case 'owner_name':
                            aVal = (a.owner_name || '').toLowerCase();
                            bVal = (b.owner_name || '').toLowerCase();
                            break;
                          case 'lot_display':
                            aVal = (a.lot_display || a.section || '').toLowerCase();
                            bVal = (b.lot_display || b.section || '').toLowerCase();
                            break;
                          case 'amount':
                            aVal = parseFloat(a.amount || 0);
                            bVal = parseFloat(b.amount || 0);
                            break;
                          case 'payment_method':
                            aVal = (a.payment_method || '').toLowerCase();
                            bVal = (b.payment_method || '').toLowerCase();
                            break;
                          case 'status':
                            aVal = (a.status || '').toLowerCase();
                            bVal = (b.status || '').toLowerCase();
                            break;
                          case 'performed_by':
                            aVal = resolvePerformerName(a).toLowerCase();
                            bVal = resolvePerformerName(b).toLowerCase();
                            break;
                          default:
                            return 0;
                        }
                        
                        if (aVal < bVal) return intakeSortConfig.direction === 'asc' ? -1 : 1;
                        if (aVal > bVal) return intakeSortConfig.direction === 'asc' ? 1 : -1;
                        return 0;
                      });
                    }
                    
                    // Calculate total
                    const totalAmount = sortedIntakePayments.reduce((sum, payment) => {
                      return sum + parseFloat(payment.payment_amount || 0);
                    }, 0);
                    
                    return (
                      <>
                        {sortedIntakePayments.map((payment, key) => {
                          const className = `py-3 px-6 border-b border-blue-gray-50`;
                          return (
                            <tr key={key} className="hover:bg-blue-50 transition-colors">
                            <td className={className}>
                              <Typography variant="small" color="blue-gray" className="font-normal">
                                {new Date(payment.payment_date).toLocaleDateString()}
                              </Typography>
                              <Typography variant="small" color="blue-gray" className="font-normal opacity-70 text-xs">
                                {new Date(payment.payment_date).toLocaleTimeString()}
                              </Typography>
                            </td>
                            <td className={className}>
                              <Typography variant="small" color="blue-gray" className="font-semibold">
                                {payment.owner_name || 'Unknown'}
                              </Typography>
                              <Typography variant="small" color="blue-gray" className="font-normal opacity-70 text-xs">
                                {payment.contact || ''}
                              </Typography>
                            </td>
                            <td className={className}>
                              <Typography variant="small" color="blue-gray" className="font-semibold">
                                {payment.lot_display || payment.section || 'N/A'}
                              </Typography>
                            </td>
                            <td className={className}>
                              <Typography variant="small" color="blue-gray" className="font-semibold">
                                ₱{parseFloat(payment.payment_amount || 0).toLocaleString()}
                              </Typography>
                            </td>
                            <td className={className}>
                              <Chip
                                variant="ghost"
                                color="blue"
                                value={payment.payment_method || 'Unknown'}
                                className="text-center font-medium w-fit"
                              />
                            </td>
                            <td className={className}>
                              <Chip
                                variant="ghost"
                                color={payment.status === 'Paid' ? 'green' : payment.status === 'Pending' ? 'orange' : 'red'}
                                value={payment.status || 'Unknown'}
                                className="text-center font-medium w-fit"
                              />
                            </td>
                            <td className={className}>
                              <Typography variant="small" color="blue-gray" className="font-normal">
                                {resolvePerformerName(payment)}
                              </Typography>
                            </td>
                          </tr>
                          );
                        })}
                        {/* Total Row */}
                        <tr className="bg-gray-100 font-bold">
                          <td colSpan="3" className="py-3 px-6">
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              TOTAL
                            </Typography>
                          </td>
                          <td className="py-3 px-6">
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              ₱{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                          </td>
                          <td colSpan="3" className="py-3 px-6"></td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  No payments found
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  No payment records found for the selected filter
                </Typography>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex gap-3">
          <Button variant="text" color="red" onClick={() => setIsIntakeDialogOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
} 
