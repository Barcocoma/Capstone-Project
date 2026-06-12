import React, { useState, useEffect, useMemo } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  Option,
  IconButton,
  Tooltip,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Tabs,
  TabsHeader,
  Tab,
  TabsBody,
  TabPanel,
} from "@material-tailwind/react";
import {
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  EyeIcon,
  CalendarIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  MapIcon,
  FunnelIcon,
  PrinterIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { API_ENDPOINTS } from "@/configs/api";
import { useAuth } from "@/context/AuthContext";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs/dist/exceljs.min.js";

// Reports data will be loaded from API

export function Reports() {
  const { user } = useAuth();
  const [selectedReport, setSelectedReport] = useState("intake");
  const [dateRange, setDateRange] = useState("last6months");
  const [section, setSection] = useState("all");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [granularity, setGranularity] = useState("daily");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [garden, setGarden] = useState("all");
  
  // Visibility rules per report
  const showFilters = useMemo(() => {
    return {
      // Only date range and granularity
      financial: { garden: false, section: false, date: true, granularity: true },
      // Hide date and granularity
      inventory: { garden: true, section: true, date: false, granularity: false },
      // Hide granularity, date range works
      payments: { garden: true, section: true, date: true, granularity: false },
      // Garden, section, date range work; hide granularity
      aging: { garden: true, section: true, date: true, granularity: false },
      // Garden works; hide only date range and granularity (keep Section visible)
      soa: { garden: true, section: true, date: false, granularity: false },
      // Payments - no filters
      intake: { garden: false, section: false, date: false, granularity: false },
      // Defaults (if any other tab appears)
      customers: { garden: true, section: true, date: true, granularity: true },
      occupancy: { garden: true, section: true, date: false, granularity: false },
      sales: { garden: true, section: true, date: true, granularity: true },
      cash_position: { garden: true, section: true, date: true, granularity: false },
      subsidiary_ledger: { garden: true, section: true, date: true, granularity: false }
    };
  }, []);
  
  // API data state
  const [reportsData, setReportsData] = useState({
    financial: [],
    occupancy: [],
    payments: [],
    customers: []
  });
  const [summaryData, setSummaryData] = useState({
    financial: {},
    occupancy: {},
    payments: {},
    customers: {}
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [intakePayments, setIntakePayments] = useState([]);
  const [loadingIntake, setLoadingIntake] = useState(false);
  const [intakeFilter, setIntakeFilter] = useState("all");

  const loadIntakePayments = async (filter = 'all') => {
    try {
      setLoadingIntake(true);
      const response = await fetch(`/api/get_intake_payments.php?filter=${filter}`);
      const data = await response.json();
      if (data.success) {
        setIntakePayments(data.payments || []);
      }
    } catch (err) {
      console.error("Error loading intake payments:", err);
    } finally {
      setLoadingIntake(false);
    }
  };

  useEffect(() => {
    if (selectedReport === "intake") {
      loadIntakePayments(intakeFilter);
    }
  }, [selectedReport, intakeFilter]);

  const intakeAgingTotals = useMemo(() => {
    const rows = reportsData.aging || [];
    const totals = {
      paidMonths: 0,
      unpaidMonths: 0,
    };
    for (const r of rows) {
      totals.paidMonths += Number(r.paidMonths || 0);
      totals.unpaidMonths += Number(r.unpaidMonths || 0);
    }
    return totals;
  }, [reportsData.aging]);

  // Fetch reports data from API
  useEffect(() => {
    const fetchReportsData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams();
        params.set('type', 'all');
        params.set('date_range', dateRange);
        params.set('section', section);
        params.set('granularity', granularity);
        params.set('garden', garden);
        if (dateRange === 'custom') {
          if (!customStartDate || !customEndDate) {
            setLoading(false);
            return;
          }
          params.set('start_date', customStartDate);
          params.set('end_date', customEndDate);
        }
        // Add cache busting to ensure fresh data
        params.set('_t', Date.now().toString());
        const response = await fetch(`${API_ENDPOINTS.GET_REPORTS_V2}?${params.toString()}`);
        const data = await response.json();
        
        if (data.success) {
          const defaultReports = {
            financial: [],
            occupancy: [],
            payments: [],
            customers: [],
            inventory: [],
            sector_summary: [],
            aging: [],
            cash_position: { summary: { totalAmount: 0, transactions: 0 }, records: [] },
            sales: [],
            fully_paid: [],
            subsidiary_ledger: [],
            soa: []
          };
          const defaultSummary = {
            financial: {},
            occupancy: {},
            payments: {},
            customers: {}
          };
          setReportsData({ ...defaultReports, ...(data.reports || {}) });
          setSummaryData({ ...defaultSummary, ...(data.summary || {}) });
        } else {
          setError(data.message || 'Failed to fetch reports data');
        }
      } catch (err) {
        setError('Unable to reach server');
        console.error('Error fetching reports data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReportsData();
  }, [dateRange, section, granularity, garden]);

  // Helpers: date range bounds and filtering
  const parseDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const getRangeBounds = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let start;
    switch (dateRange) {
      case 'all':
        return { start: null, end: null }; // no filtering
      case 'last30days':
        start = new Date(end); start.setDate(start.getDate() - 29); start.setHours(0,0,0,0); break;
      case 'last3months':
        start = new Date(end); start.setMonth(start.getMonth() - 3); start.setDate(start.getDate() + 1); start.setHours(0,0,0,0); break;
      case 'last6months':
        start = new Date(end); start.setMonth(start.getMonth() - 6); start.setDate(start.getDate() + 1); start.setHours(0,0,0,0); break;
      case 'lastyear':
        start = new Date(end); start.setFullYear(start.getFullYear() - 1); start.setDate(start.getDate() + 1); start.setHours(0,0,0,0); break;
      case 'custom': {
        const cs = parseDate(customStartDate);
        const ce = parseDate(customEndDate);
        if (cs && ce) {
          const s = new Date(cs); s.setHours(0,0,0,0);
          const e = new Date(ce); e.setHours(23,59,59,999);
          return { start: s, end: e };
        }
        return { start: null, end: null };
      }
      default:
        start = new Date(end); start.setMonth(start.getMonth() - 6); start.setDate(start.getDate() + 1); start.setHours(0,0,0,0);
    }
    return { start, end };
  }, [dateRange, customStartDate, customEndDate]);

  const withinRange = (dateStr) => {
    const { start, end } = getRangeBounds;
    if (!start || !end) return true; // if custom not fully set yet, don't filter out
    const d = parseDate(dateStr);
    if (!d) return false;
    return d >= start && d <= end;
  };

  // Filtered datasets for UI-level refinement (ensures Payments/Aging date filters work as requested)
  const uiFiltered = useMemo(() => {
    const copy = { ...reportsData };
    try {
      if (selectedReport === 'payments' && Array.isArray(copy.payments)) {
        copy.payments = copy.payments.filter((r) => withinRange(r.paymentDate || r.date || r.createdAt));
      }
      if (selectedReport === 'aging' && Array.isArray(copy.aging)) {
        // Filter aging by last payment date
        copy.aging = copy.aging.filter((r) => withinRange(r.lastPayment));
      }
      if (selectedReport === 'soa' && Array.isArray(copy.soa)) {
        // Ensure garden filter applies client-side as well
        if (garden && garden !== 'all') {
          copy.soa = copy.soa.filter((r) => (r.garden || '').toLowerCase() === String(garden).toLowerCase());
        }
      }
    } catch (_) { /* ignore */ }
    return copy;
  }, [reportsData, selectedReport, getRangeBounds, garden]);

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const ALL_TABS = [
    { label: "Payments", value: "intake", icon: <CurrencyDollarIcon className="w-5 h-5" /> },
    { label: "Inventory", value: "inventory", icon: <MapIcon className="w-5 h-5" /> },
    { label: "Aging Report", value: "aging", icon: <ChartBarIcon className="w-5 h-5" /> },
    { label: "Statement of Account", value: "soa", icon: <ChartBarIcon className="w-5 h-5" /> },
  ];
  const role = (user && (user.user_type || user.role)) || "admin";
  const TABS = useMemo(() => {
    if (role === "cashier") return ALL_TABS.filter(t => t.value === "intake" || t.value === "aging" || t.value === "soa");
    if (role === "cemetery_staff" || role === "staff") return ALL_TABS.filter(t => t.value === "inventory");
    return ALL_TABS; // admin
  }, [role]);

  useEffect(() => {
    // Ensure selected report is valid for role
    if (!TABS.find(t => t.value === selectedReport)) {
      setSelectedReport(TABS[0]?.value || "aging");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TABS.length]);

  const buildReportDataset = () => {
    if (selectedReport === "financial") {
      return {
        title: "Financial Performance Overview",
        headers: [
          (granularity === 'daily' || dateRange === 'last30days') ? "Date" : (granularity === 'yearly' ? "Year" : "Month"),
          "Revenue",
          "Payments"
        ],
        rows: (uiFiltered.financial || []).map((r) => [r.month, r.revenue, r.payments]),
      };
    }
    
    if (selectedReport === "inventory") {
      return {
        title: "Inventory Summary",
        headers: ["Garden", "Section", "Total Lots", "Available", "Reserved", "Occupied", "Sold (Installment)", "Sold (Fully Paid)", "Sold (Total)", "Occupancy Rate"],
        rows: (uiFiltered.inventory || []).map((r) => [
          r.garden || '-',
          r.section,
          r.totalLots,
          r.availableLots,
          r.reservedLots,
          r.occupiedLots,
          r.soldInstallment,
          r.soldFullyPaid,
          Number(r.soldInstallment || 0) + Number(r.soldFullyPaid || 0),
          `${r.occupancyRate ?? 0}%`
        ]),
      };
    }
    if (selectedReport === "payments") {
      return {
        title: "Payment Transaction Report",
        headers: ["PA No.", "Customer", "Lot", "Amount", "Date/Time", "Method", "Status"],
        rows: (uiFiltered.payments || []).map((r) => [r.paNo || '-', r.customerName, r.lot, r.paymentAmount, (r.paymentDate && r.createdAt) ? `${r.paymentDate} ${new Date(r.createdAt).toLocaleTimeString()}` : (r.paymentDate || '-') , r.paymentMethod, r.status]),
      };
    }
    if (selectedReport === "aging") {
      return {
        title: "Aging Report",
        headers: ["PA No.", "Buyer", "Lot", "Term (mo)", "Monthly", "Paid Mo.", "Unpaid Mo.", "Overdue Mo.", "Remaining", "Last Payment", "Interments"],
        rows: (uiFiltered.aging || []).map((r) => [r.paNo, r.buyer, r.lot, r.termMonths, r.monthlyAmount, r.paidMonths, r.unpaidMonths, r.overdueMonths, r.remainingBalance, r.lastPayment || "-", r.interments ?? 0])
      };
    }
    
    if (selectedReport === "soa") {
      return {
        title: "Statement of Account",
        headers: ["PA No.", "Buyer", "Lot", "Total", "Down", "Monthly", "Term", "Start", "End", "Status", "Remaining", "Paid Mo.", "Overdue Mo."],
        rows: (uiFiltered.soa || []).map((r) => [r.paNo, r.buyer, r.lot, r.totalAmount, r.downPayment, r.monthlyAmount, r.termMonths, r.startDate, r.endDate, r.status, r.remainingBalance, r.paidMonths, r.overdueMonths])
      };
    }
    if (selectedReport === "customers") {
      return {
        title: "Customer Demographics & Behavior",
        headers: ["Category", "Count", "Percentage", "Trend", "Growth"],
        rows: (reportsData.customers || []).map((r) => [r.category, r.count, `${r.percentage}%`, r.trend, r.trend]),
      };
    }
    return { title: "Report", headers: [], rows: [] };
  };

  const toCSV = (headers, rows) => {
    const escape = (val) => {
      const s = String(val ?? "");
      const needsQuotes = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };
    const headerLine = headers.map(escape).join(',');
    const rowLines = rows.map((row) => row.map(escape).join(',')).join('\n');
    return `${headerLine}\n${rowLines}`;
  };

  const printReport = () => {};

  const fetchExportData = async () => {
    const params = new URLSearchParams();
    params.set('type', selectedReport);
    params.set('section', section);
    params.set('granularity', granularity);
    params.set('date_range', dateRange);
    params.set('garden', garden);
    if (dateRange === 'custom') {
      if (customStartDate) params.set('start_date', customStartDate);
      if (customEndDate) params.set('end_date', customEndDate);
    }
    const res = await fetch(`${API_ENDPOINTS.GET_REPORTS_V2}?${params.toString()}`);
    const data = await res.json();
    if (data?.success) return data.reports || {};
    return {};
  };

  const handleExport = async () => {
    const exportReports = await fetchExportData();
    const using = exportReports && Object.keys(exportReports).length ? exportReports : reportsData;
    const activeKey = selectedReport;
    const label = (TABS.find((t) => t.value === activeKey)?.label || 'Report').replace(/\s+/g, '_');
    // Build dataset from the data set we plan to export
    const datasetFrom = (reportKey) => {
      switch (reportKey) {
        case 'intake': {
          const totalAmount = intakePayments.reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0);
          return {
            title: 'Payments',
            headers: ['Date','Customer','Lot','Amount','Method','Status','Performed By'],
            rows: [
              ...(intakePayments || []).map((p) => [
                p.payment_date ? new Date(p.payment_date).toLocaleString() : '',
                p.owner_name || 'Unknown',
                p.lot_display || 'N/A',
                parseFloat(p.payment_amount || 0),
                p.payment_method || '-',
                p.status || '-',
                p.performed_by || 'Cashier'
              ]),
              ['TOTAL', '', '', totalAmount, '', '', '']
            ]
          };
        }
        case 'financial':
          return {
            title: 'Financial Performance Overview',
            headers: [
              (granularity === 'daily' || dateRange === 'last30days') ? 'Date' : (granularity === 'yearly' ? 'Year' : 'Month'),
              'Revenue',
              'Payments'
            ],
            rows: (using.financial || []).map((r) => [r.month, r.revenue, r.payments])
          };
        case 'inventory':
          return {
            title: 'Inventory Summary',
            headers: ['Garden','Section','Total Lots','Available','Reserved','Occupied','Sold (Installment)','Sold (Fully Paid)','Sold (Total)','Occupancy Rate'],
            rows: (using.inventory || []).map((r) => [
              r.garden || '-',
              r.section,
              r.totalLots,
              r.availableLots,
              r.reservedLots,
              r.occupiedLots,
              r.soldInstallment,
              r.soldFullyPaid,
              Number(r.soldInstallment || 0) + Number(r.soldFullyPaid || 0),
              `${r.occupancyRate ?? 0}%`
            ])
          };
        case 'payments':
          return {
            title: 'Payment Transaction Report',
            headers: ['PA No.','Customer','Lot','Amount','Date/Time','Method','Status'],
            rows: (using.payments || []).map((r) => [r.paNo || '-', r.customerName, r.lot, r.paymentAmount, (r.paymentDate && r.createdAt) ? `${r.paymentDate} ${new Date(r.createdAt).toLocaleTimeString()}` : (r.paymentDate || '-') , r.paymentMethod, r.status])
          };
        case 'aging':
          return {
            title: 'Aging Report',
            headers: ['PA No.','Buyer','Lot','Term (mo)','Monthly','Paid Mo.','Unpaid Mo.','Overdue Mo.','Remaining','Last Payment','Interments'],
            rows: (using.aging || []).map((r) => [r.paNo, r.buyer, r.lot, r.termMonths, r.monthlyAmount, r.paidMonths, r.unpaidMonths, r.overdueMonths, r.remainingBalance, r.lastPayment || '-', r.interments ?? 0])
          };
        
        case 'soa':
          return {
            title: 'Statement of Account',
            headers: ['PA No.','Buyer','Lot','Total','Down','Monthly','Term','Start','End','Status','Remaining','Paid Mo.','Overdue Mo.'],
            rows: (using.soa || []).map((r) => [r.paNo, r.buyer, r.lot, r.totalAmount, r.downPayment, r.monthlyAmount, r.termMonths, r.startDate, r.endDate, r.status, r.remainingBalance, r.paidMonths, r.overdueMonths])
          };
        default:
          return { title: 'Report', headers: [], rows: [] };
      }
    };
    const { title, headers, rows } = datasetFrom(activeKey);
    const colCount = Math.max(1, headers.length);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet((activeKey || 'Report').slice(0, 31));
    // Center the sheet on print for a more presentational look
    worksheet.pageSetup = Object.assign({}, worksheet.pageSetup, { horizontalCentered: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } });

    // Helper: convert column index to letter
    const colToLetter = (i) => { let s = '', n = i; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

    // Fetch logo if available
    const fetchImageBase64 = async (url) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
        return String(dataUrl).split(',')[1];
      } catch { return null; }
    };
    const logoBase64 = await fetchImageBase64('/img/divine_life.png');

    // Layout constants
    const company = 'Divine Life Memorial Park';
    const getIntakeFilterLabel = (filter) => {
      switch (filter) {
        case 'today': return 'Today';
        case '30days': return 'Last 30 Days';
        default: return 'All Time';
      }
    };
    const displayRange = activeKey === 'intake'
      ? getIntakeFilterLabel(intakeFilter)
      : (dateRange === 'custom' && customStartDate && customEndDate) ? `${customStartDate} to ${customEndDate}` : dateRange;
    const generatedAt = new Date().toLocaleString();
    const desc = activeKey === 'financial'
      ? 'Revenue and count of paid transactions aggregated by selected granularity.'
      : title;
    const meta = activeKey === 'intake'
      ? `Filter: ${displayRange} • Generated: ${generatedAt}`
      : `Range: ${displayRange} • Granularity: ${granularity.toUpperCase()} • Section: ${section.toUpperCase()}${garden && garden !== 'all' ? ` • Garden: ${garden}` : ''} • Generated: ${generatedAt}`;
    const hasLogo = !!logoBase64 && colCount >= 3;
    const startColForText = hasLogo ? 3 : 1;

    // Ensure header/meta merged width is wide enough (SoA-like) by merging extra blank columns
    const currentMergedWidth = () => { let sum = 0; for (let c = startColForText; c <= (startColForText + colCount - 1); c++) { sum += Number(worksheet.getColumn(c).width || 10); } return sum; };
    const targetMergedWidth = 110; // approx chars to fit meta on one line
    let extraCols = 0;
    if (currentMergedWidth() < targetMergedWidth) {
      extraCols = Math.ceil((targetMergedWidth - currentMergedWidth()) / 18);
      for (let i = 1; i <= extraCols; i++) {
        worksheet.getColumn(startColForText + colCount - 1 + i).width = 18;
      }
    }
    let mergeEndCol = startColForText + colCount - 1 + extraCols;

    // For Financial/Sales, we will span columns so the table reaches the same width (up to column I)
    const isWide = activeKey === 'financial' || activeKey === 'sales';
    const spans = isWide ? [3, 2, 2] : Array(colCount).fill(1);
    const baseCols = [];
    { let acc = 0; for (let i = 0; i < colCount; i++) { baseCols[i] = startColForText + acc; acc += spans[i]; } }
    if (isWide) { mergeEndCol = baseCols[colCount - 1] + spans[colCount - 1] - 1; }
    const colIndex = (i) => (isWide ? baseCols[i] : (startColForText + i));

    // Row heights (SoA-style)
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 26;
    worksheet.getRow(4).height = 12; // spacer row after meta

    // Add image with fixed size to avoid stretching, only when we have enough columns
    if (hasLogo) {
      const imageId = workbook.addImage({ base64: logoBase64, extension: 'png' });
      worksheet.addImage(imageId, { tl: { col: 0, row: 0 }, br: { col: startColForText - 1, row: 4 } });
    }

    // Company, Title, Meta (SoA-style; merged from startColForText..mergeEndCol)
    worksheet.mergeCells(1, startColForText, 1, mergeEndCol);
    worksheet.getCell(1, startColForText).value = company;
    worksheet.getCell(1, startColForText).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell(1, startColForText).font = { bold: true, size: 16 };

    worksheet.mergeCells(2, startColForText, 2, mergeEndCol);
    worksheet.getCell(2, startColForText).value = title;
    worksheet.getCell(2, startColForText).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell(2, startColForText).font = { bold: true, size: 20 };

    worksheet.mergeCells(3, startColForText, 3, mergeEndCol);
    worksheet.getCell(3, startColForText).value = meta;
    worksheet.getCell(3, startColForText).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    worksheet.getCell(3, startColForText).font = { size: 12, color: { argb: 'FF374151' } };

    // Column widths (Financial/Sales widened across spans)
    headers.forEach((h, idx) => {
      if (isWide) {
        const perColWidth = [20, 18, 16];
        const span = spans[idx];
        const startC = colIndex(idx);
        for (let c = 0; c < span; c++) {
          const width = perColWidth[idx] || 18;
          worksheet.getColumn(startC + c).width = width;
        }
      } else {
        const lower = String(h).toLowerCase();
        let w = 18;
        if (lower.includes('date') || lower.includes('time')) w = 22;
        if (/(section|garden|buyer|customer|account)/.test(lower)) w = 28;
        if (/(status|method)/.test(lower)) w = 18;
        if (/(lot|pa\s?no\.?)/.test(lower)) w = 18;
        worksheet.getColumn(colIndex(idx)).width = w;
      }
    });

    // Dynamic meta row height based on merged width
    const mergedWidthChars = (() => { let sum = 0; for (let c = startColForText; c <= mergeEndCol; c++) { sum += Number(worksheet.getColumn(c).width || 10); } return Math.max(sum - 2, 10); })();
    const metaLen = String(meta).length;
    const metaLines = Math.max(1, Math.ceil(metaLen / mergedWidthChars));
    worksheet.getRow(3).height = Math.max(20, metaLines * 14);

    // Header row at 5 (after spacer)
    const headerRowIndex = 5;
    const headerRow = worksheet.getRow(headerRowIndex);
    headers.forEach((h, i) => {
      const startC = colIndex(i);
      if (isWide) { worksheet.mergeCells(headerRowIndex, startC, headerRowIndex, startC + spans[i] - 1); }
      headerRow.getCell(startC).value = h;
    });
    headerRow.font = { bold: true, color: { argb: 'FF1F2937' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 22;
    if (isWide) {
      worksheet.getRow(headerRowIndex).height = 22;
    }
    for (let i = 0; i < colCount; i++) {
      const cell = headerRow.getCell(colIndex(i));
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // light gray like sample
      cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      // Keep header cells locked (no sorting/filter UI changes on protected sheet)
      cell.protection = { locked: true };
    }

    // Data rows start after header
    const dataStartRow = headerRowIndex + 1;
    rows.forEach((r, rIdx) => {
      const rowIndex = dataStartRow + rIdx;
      const row = worksheet.getRow(rowIndex);
      row.height = 18; // SoA-style consistent row height
      r.forEach((v, i) => {
        const hdr = String(headers[i]).toLowerCase();
        const isCurrency = /(amount|revenue|ncp|down|monthly|remaining|total(?!\s*(lots|payments|customers|transactions)))/.test(hdr) && !hdr.includes('sold (total)');
        let valueToWrite = v;
        if (typeof v === 'string') {
          const parsed = Number(v.replace?.(/[\,\s]/g, '') ?? v);
          if (!Number.isNaN(parsed)) valueToWrite = parsed;
        }
        if (isWide) { worksheet.mergeCells(rowIndex, colIndex(i), rowIndex, colIndex(i) + spans[i] - 1); }
        const cell = row.getCell(colIndex(i));
        cell.value = valueToWrite;
        // Left align text, right align numbers
        const isNumeric = /(total|amount|revenue|payments|monthly|remaining|paid|overdue|transactions|ncp|interments)/.test(hdr) || typeof valueToWrite === 'number';
        cell.alignment = { horizontal: isNumeric ? 'right' : 'left', vertical: 'middle', wrapText: true, indent: isNumeric ? 0 : 1 };
        // SoA-style number formatting
        if (typeof valueToWrite === 'number') {
          if (isCurrency) {
            cell.numFmt = '"₱"#,##0';
          } else {
            cell.numFmt = '#,##0';
          }
        }
        cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        cell.protection = { locked: true };
      });
    });
    const dataLastRow = dataStartRow + Math.max(0, rows.length) - 1;

    // Totals row
    const totalsRowIndex = dataLastRow + 1;
    const shouldSum = (header) => {
      const h = String(header).toLowerCase();
      if (/(rate|percentage|percent)/.test(h)) return false;
      if (/(date|time|account|buyer|customer|method|status|pa\s?no\.?|lot|garden|section|sector|term|start|end)/.test(h)) return false;
      return /(total|amount|revenue|payment|available|reserved|occupied|sold|monthly|remaining|paid|overdue|ncp|interments|transactions)/.test(h);
    };
    const gardenIdx = headers.findIndex((h) => String(h).toLowerCase() === 'garden');
    const sectionIdx = headers.findIndex((h) => String(h).toLowerCase() === 'section');
    if (gardenIdx !== -1 && sectionIdx !== -1) {
      const labelCell = worksheet.getCell(totalsRowIndex, colIndex(sectionIdx));
      labelCell.value = 'Totals';
      labelCell.font = { bold: true };
    } else {
      const labelCell = worksheet.getCell(totalsRowIndex, colIndex(0));
      labelCell.value = 'Totals';
      labelCell.font = { bold: true };
    }
    worksheet.getRow(totalsRowIndex).height = 20;
    if (isWide) { for (let i = 0; i < colCount; i++) { worksheet.mergeCells(totalsRowIndex, colIndex(i), totalsRowIndex, colIndex(i) + spans[i] - 1); } }
    headers.forEach((h, idx) => {
      if (shouldSum(h)) {
        const L = colToLetter(colIndex(idx));
        const c = worksheet.getCell(`${L}${totalsRowIndex}`);
        c.value = { formula: `SUM(${L}${dataStartRow}:${L}${dataLastRow})` };
        c.alignment = { horizontal: 'right', vertical: 'middle' };
        c.font = { bold: true };
        c.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        // Currency formatting on totals if applicable
        const hdr = String(h).toLowerCase();
        const isCurrency = /(amount|revenue|ncp|down|monthly|remaining|total(?!\s*(lots|payments|customers|transactions)))/.test(hdr) && !hdr.includes('sold (total)');
        if (isCurrency) {
          c.numFmt = '"₱"#,##0';
        } else {
          c.numFmt = '#,##0';
        }
      }
    });
    // Explicitly ensure Aging totals: do not sum Last Payment; sum Interments
    if (activeKey === 'aging') {
      const lastPaymentIdx = headers.findIndex((h) => String(h).toLowerCase().includes('last payment'));
      const intermentsIdx = headers.findIndex((h) => String(h).toLowerCase().includes('interments'));
      if (lastPaymentIdx !== -1) {
        const lpCell = worksheet.getCell(`${colToLetter(colIndex(lastPaymentIdx))}${totalsRowIndex}`);
        lpCell.value = '';
      }
      if (intermentsIdx !== -1) {
        const L = colToLetter(colIndex(intermentsIdx));
        const c = worksheet.getCell(`${L}${totalsRowIndex}`);
        c.value = { formula: `SUM(${L}${dataStartRow}:${L}${dataLastRow})` };
        c.alignment = { horizontal: 'right', vertical: 'middle' };
        c.font = { bold: true };
        c.numFmt = '#,##0';
        c.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    }
    // Shade entire totals row per SoA style and ensure borders
    for (let i = 0; i < colCount; i++) {
      const cell = worksheet.getRow(totalsRowIndex).getCell(colIndex(i));
      cell.border = cell.border || { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      cell.fill = cell.fill || { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    }
    if (activeKey === 'occupancy' || activeKey === 'inventory') {
      const totalLotsIdx = headers.findIndex((h) => String(h).toLowerCase().includes('total lots'));
      // Prefer Sold (Total) if present; otherwise fall back to Sold Lots
      const soldTotalIdx = headers.findIndex((h) => String(h).toLowerCase().includes('sold (total)'));
      const soldLotsIdx = soldTotalIdx !== -1 ? soldTotalIdx : headers.findIndex((h) => String(h).toLowerCase().includes('sold lots'));
      const rateIdx = headers.findIndex((h) => String(h).toLowerCase().includes('occupancy rate'));
      if (totalLotsIdx !== -1 && soldLotsIdx !== -1 && rateIdx !== -1) {
        const tl = colToLetter(colIndex(totalLotsIdx));
        const sl = colToLetter(colIndex(soldLotsIdx));
        const rc = colToLetter(colIndex(rateIdx));
        worksheet.getCell(`${rc}${totalsRowIndex}`).value = { formula: `IF(${tl}${totalsRowIndex}=0,0,ROUND((${sl}${totalsRowIndex}/${tl}${totalsRowIndex})*100,1))` };
      }
    }

    // Freeze panes (no autofilter to avoid confusion on protected sheet)
    worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

    // Auto-fit columns based on content (skip for financial/sales to match SoA widths)
    if (!isWide) {
      for (let i = 0; i < colCount; i++) {
        const cIdx = colIndex(i);
        let maxLen = String(worksheet.getRow(headerRowIndex).getCell(cIdx).value ?? '').length;
        for (let r = dataStartRow; r <= dataLastRow; r++) {
          const val = worksheet.getRow(r).getCell(cIdx).value;
          const text = typeof val === 'object' && val && 'text' in val ? String(val.text) : String(val ?? '');
          if (text.length > maxLen) maxLen = text.length;
        }
        const width = Math.min(Math.max(maxLen + 10, 18), 100);
        worksheet.getColumn(cIdx).width = width;
      }
    }

    // Protect
    await worksheet.protect('REPORT', {
      selectLockedCells: true,
      selectUnlockedCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
      objects: true,
      scenarios: true
    });

    // Save
    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${label}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    // Direct download (no dialog)
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status) => {
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

  // Totals for on-screen financial table
  const financialTotals = useMemo(() => {
    const rows = reportsData.financial || [];
    let totalRevenue = 0;
    let totalPayments = 0;
    for (const r of rows) {
      totalRevenue += Number(r.revenue || 0);
      totalPayments += Number(r.payments || 0);
    }
    return { totalRevenue, totalPayments };
  }, [reportsData.financial]);

  // Totals for inventory and aging
  const inventoryTotals = useMemo(() => {
    const rows = reportsData.inventory || [];
    const totals = {
      totalLots: 0,
      availableLots: 0,
      reservedLots: 0,
      occupiedLots: 0,
      soldInstallment: 0,
      soldFullyPaid: 0,
    };
    for (const r of rows) {
      totals.totalLots += Number(r.totalLots || 0);
      totals.availableLots += Number(r.availableLots || 0);
      totals.reservedLots += Number(r.reservedLots || 0);
      totals.occupiedLots += Number(r.occupiedLots || 0);
      totals.soldInstallment += Number(r.soldInstallment || 0);
      totals.soldFullyPaid += Number(r.soldFullyPaid || 0);
    }
    return totals;
  }, [reportsData.inventory]);

  const agingTotals = useMemo(() => {
    const rows = reportsData.aging || [];
    const totals = {
      plans: rows.length,
      monthlyAmount: 0,
      paidMonths: 0,
      unpaidMonths: 0,
      overdueMonths: 0,
      remainingBalance: 0,
      interments: 0,
    };
    for (const r of rows) {
      totals.monthlyAmount += Number(r.monthlyAmount || 0);
      totals.paidMonths += Number(r.paidMonths || 0);
      totals.unpaidMonths += Number(r.unpaidMonths || 0);
      totals.overdueMonths += Number(r.overdueMonths || 0);
      totals.remainingBalance += Number(r.remainingBalance || 0);
      totals.interments += Number(r.interments || 0);
    }
    return totals;
  }, [reportsData.aging]);

  const salesTotals = useMemo(() => {
    const rows = reportsData.sales || [];
    let total = 0;
    let transactions = 0;
    for (const r of rows) {
      total += Number(r.total || 0);
      transactions += Number(r.transactions || 0);
    }
    return { total, transactions };
  }, [reportsData.sales]);

  const ledgerTotals = useMemo(() => {
    const rows = reportsData.subsidiary_ledger || [];
    let ncp = 0; let interments = 0;
    for (const r of rows) { ncp += Number(r.ncp || 0); interments += Number(r.interments || 0); }
    return { ncp, interments };
  }, [reportsData.subsidiary_ledger]);

  const soaTotals = useMemo(() => {
    const rows = reportsData.soa || [];
    const totals = { totalAmount: 0, downPayment: 0, monthlyAmount: 0, remainingBalance: 0, paidMonths: 0, overdueMonths: 0 };
    for (const r of rows) {
      totals.totalAmount += Number(r.totalAmount || 0);
      totals.downPayment += Number(r.downPayment || 0);
      totals.monthlyAmount += Number(r.monthlyAmount || 0);
      totals.remainingBalance += Number(r.remainingBalance || 0);
      totals.paidMonths += Number(r.paidMonths || 0);
      totals.overdueMonths += Number(r.overdueMonths || 0);
    }
    return totals;
  }, [reportsData.soa]);

  

  const cashPositionTotals = useMemo(() => {
    const recs = (reportsData.cash_position && reportsData.cash_position.records) || [];
    let totalAmount = 0;
    for (const r of recs) totalAmount += Number(r.amount || 0);
    return { totalAmount, transactions: recs.length };
  }, [reportsData.cash_position]);

  if (loading) {
    return (
      <div className="mt-12">
        <div className="mb-8">
          <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
            Reports & Analytics
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Loading reports data...
          </Typography>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12">
        <div className="mb-8">
          <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
            Reports & Analytics
          </Typography>
          <Typography variant="small" color="red" className="opacity-70">
            Error: {error}
          </Typography>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="mb-8">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Reports
        </Typography>
        <Typography variant="small" color="blue-gray" className="opacity-70">
          Generate comprehensive reports for Divine Life Memorial Park operations
        </Typography>
      </div>

      {/* Filters and Export */}
      <Card className="mb-6">
        <CardBody className="p-6">
            <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-full sm:w-48">
                <Select
                  label="Report Type"
                  value={selectedReport}
                  onChange={(value) => setSelectedReport(value)}
                >
                  {TABS.map((tab) => (
                    <Option key={tab.value} value={tab.value}>{tab.label}</Option>
                  ))}
                </Select>
              </div>
              {selectedReport === "intake" && (
                <div className="w-full sm:w-48">
                  <Select
                    label="Filter by Date"
                    value={intakeFilter}
                    onChange={(value) => setIntakeFilter(value)}
                  >
                    <Option value="today">Today</Option>
                    <Option value="30days">Last 30 Days</Option>
                    <Option value="all">All Time</Option>
                  </Select>
                </div>
              )}
              {showFilters[selectedReport]?.garden && (
                <div className="w-full sm:w-48">
                  <Select
                    label="Garden"
                    value={garden}
                    onChange={(value) => setGarden(value)}
                  >
                    <Option value="all">All Gardens</Option>
                    <Option value="Joy Garden">Joy Garden</Option>
                    <Option value="Peace Garden">Peace Garden</Option>
                    <Option value="Hope Garden">Hope Garden</Option>
                    <Option value="Faith Garden">Faith Garden</Option>
                    <Option value="Love Garden">Love Garden</Option>
                  </Select>
                </div>
              )}
              {showFilters[selectedReport]?.section && (
                <div className="w-full sm:w-48">
                  <Select
                    label="Section"
                    value={section}
                    onChange={(value) => setSection(value)}
                  >
                    <Option value="all">All Sections</Option>
                    <Option value="section-a">Section A</Option>
                    <Option value="section-b">Section B</Option>
                    <Option value="section-c">Section C</Option>
                    <Option value="section-d">Section D</Option>
                  </Select>
                </div>
              )}
              {showFilters[selectedReport]?.date && (
                <div className="w-full sm:w-48">
                  <Select
                    label="Date Range"
                    value={dateRange}
                    onChange={(value) => setDateRange(value)}
                  >
                    <Option value="all">All Time</Option>
                    <Option value="last30days">Last 30 Days</Option>
                    <Option value="last3months">Last 3 Months</Option>
                    <Option value="last6months">Last 6 Months</Option>
                    <Option value="lastyear">Last Year</Option>
                    <Option value="custom">Custom Range</Option>
                  </Select>
                </div>
              )}
              {showFilters[selectedReport]?.granularity && (
                <div className="w-full sm:w-48">
                  <Select
                    label="Granularity"
                    value={granularity}
                    onChange={(value) => setGranularity(value)}
                  >
                    <Option value="daily">Daily</Option>
                    <Option value="monthly">Monthly</Option>
                    <Option value="yearly">Yearly</Option>
                  </Select>
                </div>
              )}
            </div>
            {/* Custom Range Inputs in their own container for clarity */}
            {showFilters[selectedReport]?.date && dateRange === 'custom' && (
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="w-full">
                  <Input type="date" label="Start Date" value={customStartDate} onChange={(e)=>setCustomStartDate(e.target.value)} />
                </div>
                <div className="w-full">
                  <Input type="date" label="End Date" value={customEndDate} onChange={(e)=>setCustomEndDate(e.target.value)} />
                </div>
              </div>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outlined"
                color="blue-gray"
                className="flex items-center gap-2"
                onClick={handleExport}
              >
                <DocumentArrowDownIcon className="w-4 h-4" />
                Export
              </Button>
              {/* Print removed as requested */}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Report Tabs */}
      <Card>
        <CardBody className="p-0">
          <Tabs key={selectedReport} value={selectedReport}>
            <TabsHeader className="hidden">
              {TABS.map(({ label, value, icon }) => (
                <Tab key={value} value={value} className="hidden">
                  {icon}
                  {label}
                </Tab>
              ))}
            </TabsHeader>
            <TabsBody>
              {/* Financial Reports */}
              <TabPanel value="financial" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Financial Performance Overview
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Total Revenue
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {formatCurrency(summaryData.financial.totalRevenue || 0)}
                        </Typography>
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Paid transactions within range
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Transactions
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {summaryData.financial.transactions || 0}
                        </Typography>
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Count of paid receipts
                        </Typography>
                      </CardBody>
                    </Card>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] table-auto">
                      <thead>
                        <tr>
                          {[
                            { key: 'date', label: (granularity === 'daily' || dateRange === 'last30days' ? "Date" : (granularity === 'yearly' ? "Year" : "Month")) },
                            { key: 'revenue', label: "Revenue" },
                            { key: 'payments', label: "Payments" }
                          ].map((col) => (
                            <th 
                              key={col.key} 
                              className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort(col.key)}
                            >
                              <div className="flex items-center gap-1">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                  {col.label}
                              </Typography>
                                {sortConfig.key === col.key && (
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
                          let sortedData = [...(uiFiltered.financial || [])];
                          
                          // Apply sorting
                          if (sortConfig.key) {
                            sortedData.sort((a, b) => {
                              let aVal, bVal;
                              
                              switch (sortConfig.key) {
                                case 'date':
                                  aVal = (a.month || '').toLowerCase();
                                  bVal = (b.month || '').toLowerCase();
                                  break;
                                case 'revenue':
                                  aVal = parseFloat(a.revenue || 0);
                                  bVal = parseFloat(b.revenue || 0);
                                  break;
                                case 'payments':
                                  aVal = parseFloat(a.payments || 0);
                                  bVal = parseFloat(b.payments || 0);
                                  break;
                                default:
                                  return 0;
                              }
                              
                              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                              return 0;
                            });
                          }
                          
                          return sortedData.map((row, index) => (
                          <tr key={index} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.month}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {formatCurrency(row.revenue)}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.payments}
                              </Typography>
                            </td>
                          </tr>
                          ));
                        })()}
                        {(!uiFiltered.financial || uiFiltered.financial.length === 0) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={3}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-3 px-6">
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              Totals
                            </Typography>
                          </td>
                          <td className="py-3 px-6">
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              {formatCurrency(financialTotals.totalRevenue)}
                            </Typography>
                          </td>
                          <td className="py-3 px-6">
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              {financialTotals.totalPayments}
                            </Typography>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Inventory */}
              <TabPanel value="inventory" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Inventory Summary
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Total Lots</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{inventoryTotals.totalLots}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Available</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{inventoryTotals.availableLots}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Reserved</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{inventoryTotals.reservedLots}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Occupied</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{inventoryTotals.occupiedLots}</Typography></CardBody></Card>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead>
                        <tr>
                          {[
                            { key: 'garden', label: 'Garden' },
                            { key: 'section', label: 'Section' },
                            { key: 'totalLots', label: 'Total Lots' },
                            { key: 'available', label: 'Available' },
                            { key: 'reserved', label: 'Reserved' },
                            { key: 'occupied', label: 'Occupied' },
                            { key: 'soldInstallment', label: 'Sold (Installment)' },
                            { key: 'soldFullyPaid', label: 'Sold (Fully Paid)' },
                            { key: 'soldTotal', label: 'Sold (Total)' },
                            { key: 'occupancyRate', label: 'Occupancy Rate' }
                          ].map((col) => (
                            <th 
                              key={col.key} 
                              className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort(col.key)}
                            >
                              <div className="flex items-center gap-1">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                  {col.label}
                              </Typography>
                                {sortConfig.key === col.key && (
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
                          let sortedData = [...(uiFiltered.inventory || [])];
                          
                          // Apply sorting
                          if (sortConfig.key) {
                            sortedData.sort((a, b) => {
                              let aVal, bVal;
                              
                              switch (sortConfig.key) {
                                case 'garden':
                                  aVal = (a.garden || '').toLowerCase();
                                  bVal = (b.garden || '').toLowerCase();
                                  break;
                                case 'section':
                                  aVal = (a.section || '').toLowerCase();
                                  bVal = (b.section || '').toLowerCase();
                                  break;
                                case 'totalLots':
                                  aVal = parseInt(a.totalLots || 0);
                                  bVal = parseInt(b.totalLots || 0);
                                  break;
                                case 'available':
                                  aVal = parseInt(a.available || 0);
                                  bVal = parseInt(b.available || 0);
                                  break;
                                case 'reserved':
                                  aVal = parseInt(a.reserved || 0);
                                  bVal = parseInt(b.reserved || 0);
                                  break;
                                case 'occupied':
                                  aVal = parseInt(a.occupied || 0);
                                  bVal = parseInt(b.occupied || 0);
                                  break;
                                case 'soldInstallment':
                                  aVal = parseInt(a.soldInstallment || 0);
                                  bVal = parseInt(b.soldInstallment || 0);
                                  break;
                                case 'soldFullyPaid':
                                  aVal = parseInt(a.soldFullyPaid || 0);
                                  bVal = parseInt(b.soldFullyPaid || 0);
                                  break;
                                case 'soldTotal':
                                  aVal = parseInt(a.soldTotal || 0);
                                  bVal = parseInt(b.soldTotal || 0);
                                  break;
                                case 'occupancyRate':
                                  aVal = parseFloat(a.occupancyRate || 0);
                                  bVal = parseFloat(b.occupancyRate || 0);
                                  break;
                                default:
                                  return 0;
                              }
                              
                              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                              return 0;
                            });
                          }
                          
                          return sortedData.map((row, index) => (
                          <tr key={index} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.garden || '-'}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.section}
                              </Typography>
                            </td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.totalLots}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.availableLots}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.reservedLots}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.occupiedLots}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.soldInstallment}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.soldFullyPaid}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{Number(row.soldInstallment || 0) + Number(row.soldFullyPaid || 0)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{(row.occupancyRate ?? 0)}%</Typography></td>
                          </tr>
                          ));
                        })()}
                        {(!uiFiltered.inventory || uiFiltered.inventory.length === 0) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={10}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6">
                            <Typography variant="small" color="blue-gray" className="font-bold">Totals</Typography>
                          </td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{inventoryTotals.totalLots}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{inventoryTotals.availableLots}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{inventoryTotals.reservedLots}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{inventoryTotals.occupiedLots}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{inventoryTotals.soldInstallment}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{inventoryTotals.soldFullyPaid}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{Number(inventoryTotals.soldInstallment || 0) + Number(inventoryTotals.soldFullyPaid || 0)}</Typography></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Payments */}
              <TabPanel value="intake" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Payments
                  </Typography>
                  {!loadingIntake && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card className="border border-blue-gray-100">
                        <CardBody className="p-4 min-w-0">
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            Paid Months
                          </Typography>
                          <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                            {intakeAgingTotals.paidMonths}
                          </Typography>
                        </CardBody>
                      </Card>
                      <Card className="border border-blue-gray-100">
                        <CardBody className="p-4 min-w-0">
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            Unpaid Months
                          </Typography>
                          <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                            {intakeAgingTotals.unpaidMonths}
                          </Typography>
                        </CardBody>
                      </Card>
                      <Card className="border border-blue-gray-100">
                        <CardBody className="p-4 min-w-0">
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            Total Payments
                          </Typography>
                          <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                            {formatCurrency(intakePayments.reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0))}
                          </Typography>
                        </CardBody>
                      </Card>
                    </div>
                  )}
                  {loadingIntake ? (
                    <div className="text-center p-12">
                      <Typography variant="small" color="blue-gray">Loading...</Typography>
                    </div>
                  ) : intakePayments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[800px] table-auto">
                        <thead>
                          <tr>
                            {["Date", "Customer", "Lot", "Amount", "Method", "Status", "Performed By"].map((el) => (
                              <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left">
                                <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                  {el}
                                </Typography>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {intakePayments.map((payment, index) => (
                            <tr key={index}>
                              <td className="py-3 px-6">
                                <Typography variant="small" color="blue-gray" className="font-normal">
                                  {new Date(payment.payment_date).toLocaleDateString()}
                                </Typography>
                                <Typography variant="small" color="blue-gray" className="font-normal opacity-70 text-xs">
                                  {new Date(payment.payment_date).toLocaleTimeString()}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography variant="small" color="blue-gray" className="font-semibold">
                                  {payment.owner_name || 'Unknown'}
                                </Typography>
                                <Typography variant="small" color="blue-gray" className="font-normal opacity-70 text-xs">
                                  {payment.contact || ''}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography variant="small" color="blue-gray" className="font-semibold">
                                  {payment.lot_display || 'N/A'}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography variant="small" color="blue-gray" className="font-semibold">
                                  ₱{parseFloat(payment.payment_amount || 0).toLocaleString()}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography variant="small" color="blue-gray" className="font-medium">
                                  {payment.payment_method || 'Unknown'}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography variant="small" color="blue-gray" className="font-medium">
                                  {payment.status || 'Unknown'}
                                </Typography>
                              </td>
                              <td className="py-3 px-6">
                                <Typography variant="small" color="blue-gray" className="font-normal">
                                  {payment.performed_by || 'Cashier'}
                                </Typography>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-100 font-bold">
                            <td colSpan="3" className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-bold">TOTAL</Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-bold">
                                ₱{intakePayments.reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Typography>
                            </td>
                            <td colSpan="3" className="py-3 px-6"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center p-12">
                      <Typography variant="small" color="blue-gray">No payments found</Typography>
                    </div>
                  )}
                </div>
              </TabPanel>

              {/* Aging Report */}
              <TabPanel value="aging" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Aging Report
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Lots (Owned)</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{agingTotals.plans}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Monthly</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(agingTotals.monthlyAmount)}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Paid Mo.</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{agingTotals.paidMonths}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Unpaid Mo.</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{agingTotals.unpaidMonths}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Overdue Mo.</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{agingTotals.overdueMonths}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Remaining</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(agingTotals.remainingBalance)}</Typography></CardBody></Card>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] table-auto">
                      <thead>
                        <tr>
                          {[
                            { key: 'paNo', label: 'PA No.' },
                            { key: 'buyer', label: 'Buyer' },
                            { key: 'lot', label: 'Lot' },
                            { key: 'termMonths', label: 'Term (mo)' },
                            { key: 'monthlyAmount', label: 'Monthly' },
                            { key: 'paidMonths', label: 'Paid Mo.' },
                            { key: 'unpaidMonths', label: 'Unpaid Mo.' },
                            { key: 'overdueMonths', label: 'Overdue Mo.' },
                            { key: 'remaining', label: 'Remaining' },
                            { key: 'lastPayment', label: 'Last Payment' },
                            { key: 'interments', label: 'Interments' }
                          ].map((col) => (
                            <th 
                              key={col.key} 
                              className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort(col.key)}
                            >
                              <div className="flex items-center gap-1">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                  {col.label}
                              </Typography>
                                {sortConfig.key === col.key && (
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
                          let sortedData = [...(uiFiltered.aging || [])];
                          
                          // Apply sorting
                          if (sortConfig.key) {
                            sortedData.sort((a, b) => {
                              let aVal, bVal;
                              
                              switch (sortConfig.key) {
                                case 'paNo':
                                  aVal = (a.paNo || '').toString().toLowerCase();
                                  bVal = (b.paNo || '').toString().toLowerCase();
                                  // Handle empty values - put them at the end
                                  if (aVal === '' && bVal !== '') return 1;
                                  if (bVal === '' && aVal !== '') return -1;
                                  break;
                                case 'buyer':
                                  aVal = (a.buyer || '').toLowerCase();
                                  bVal = (b.buyer || '').toLowerCase();
                                  break;
                                case 'lot':
                                  aVal = (a.lot || '').toLowerCase();
                                  bVal = (b.lot || '').toLowerCase();
                                  break;
                                case 'termMonths':
                                  aVal = parseInt(a.termMonths || 0);
                                  bVal = parseInt(b.termMonths || 0);
                                  break;
                                case 'monthlyAmount':
                                  aVal = parseFloat(a.monthlyAmount || 0);
                                  bVal = parseFloat(b.monthlyAmount || 0);
                                  break;
                                case 'paidMonths':
                                  aVal = parseInt(a.paidMonths || 0);
                                  bVal = parseInt(b.paidMonths || 0);
                                  break;
                                case 'unpaidMonths':
                                  aVal = parseInt(a.unpaidMonths || 0);
                                  bVal = parseInt(b.unpaidMonths || 0);
                                  break;
                                case 'overdueMonths':
                                  aVal = parseInt(a.overdueMonths || 0);
                                  bVal = parseInt(b.overdueMonths || 0);
                                  break;
                                case 'remaining':
                                  aVal = parseFloat(a.remaining || 0);
                                  bVal = parseFloat(b.remaining || 0);
                                  break;
                                case 'lastPayment':
                                  aVal = new Date(a.lastPayment || '1970-01-01').getTime();
                                  bVal = new Date(b.lastPayment || '1970-01-01').getTime();
                                  break;
                                case 'interments':
                                  aVal = parseInt(a.interments || 0);
                                  bVal = parseInt(b.interments || 0);
                                  break;
                                default:
                                  return 0;
                              }
                              
                              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                              return 0;
                            });
                          }
                          
                          return sortedData.map((r, idx) => (
                          <tr key={idx} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.paNo}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.buyer}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.lot}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.termMonths}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.monthlyAmount)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.paidMonths}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.unpaidMonths}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.overdueMonths}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.remainingBalance)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.lastPayment || '-'}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.interments ?? 0}</Typography></td>
                          </tr>
                          ));
                        })()}
                        {(!uiFiltered.aging || uiFiltered.aging.length === 0) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={11}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">Totals</Typography></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(agingTotals.monthlyAmount)}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{agingTotals.paidMonths}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{agingTotals.unpaidMonths}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{agingTotals.overdueMonths}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(agingTotals.remainingBalance)}</Typography></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{agingTotals.interments}</Typography></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Occupancy Reports */}
              <TabPanel value="occupancy" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Lot Occupancy Analysis
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Total Lots
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {summaryData.occupancy.totalLots || 0}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Sold Lots
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {summaryData.occupancy.soldLots || 0}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Available Lots
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {summaryData.occupancy.availableLots || 0}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Occupancy Rate
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {summaryData.occupancy.occupancyRate || 0}%
                        </Typography>
                      </CardBody>
                    </Card>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead>
                        <tr>
                          {["Garden", "Section", "Total Lots", "Sold Lots", "Available", "Occupancy Rate"].map((el) => (
                            <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                {el}
                              </Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(reportsData.occupancy || []).map((row, index) => (
                          <tr key={index} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.garden || 'All'}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.section}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.totalLots.toLocaleString()}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.soldLots.toLocaleString()}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.availableLots.toLocaleString()}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.occupancyRate}%
                              </Typography>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              

              {/* Cash Position */}
              <TabPanel value="cash_position" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Cash Position (Turn-in)
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">Total Amount</Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(cashPositionTotals.totalAmount || 0)}</Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">Transactions</Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{cashPositionTotals.transactions || 0}</Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">Average Receipt</Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency((cashPositionTotals.totalAmount || 0) / Math.max(cashPositionTotals.transactions || 1, 1))}</Typography>
                      </CardBody>
                    </Card>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] table-auto">
                      <thead>
                        <tr>
                          {["Date/Time", "Account", "PA No.", "Lot", "Method", "Amount"].map((el) => (
                            <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">{el}</Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {((uiFiltered.cash_position && uiFiltered.cash_position.records) || (reportsData.cash_position && reportsData.cash_position.records) || []).map((r, idx) => (
                          <tr key={idx} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{`${r.date} ${r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : ''}`.trim()}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.account}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.paNo || '-'}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.lot || '-'}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.method}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.amount)}</Typography></td>
                          </tr>
                        ))}
                        {(!reportsData.cash_position || !(reportsData.cash_position.records || []).length) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={6}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">Totals</Typography></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(cashPositionTotals.totalAmount)}</Typography></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Sales */}
              <TabPanel value="sales" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Sales
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Total Sales</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(salesTotals.total || 0)}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Transactions</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{salesTotals.transactions || 0}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Average</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency((salesTotals.total || 0) / Math.max(salesTotals.transactions || 1, 1))}</Typography></CardBody></Card>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead><tr>{[(granularity === 'daily' || dateRange === 'last30days' ? "Date" : (granularity === 'yearly' ? "Year" : "Month")), "Total Amount", "Transactions"].map((el)=>(<th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50"><Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">{el}</Typography></th>))}</tr></thead>
                      <tbody>
                        {(uiFiltered.sales || reportsData.sales || []).map((r, idx) => (
                          <tr key={idx} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.month}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.total)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.transactions}</Typography></td>
                          </tr>
                        ))}
                        {(!reportsData.sales || reportsData.sales.length === 0) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={3}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">Totals</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(salesTotals.total)}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{salesTotals.transactions}</Typography></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              

              {/* Subsidiary Ledger */}
              <TabPanel value="subsidiary_ledger" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">Subsidiary Ledger</Typography>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] table-auto">
                      <thead><tr>{["PA No.", "Date", "Buyer", "NCP", "Lot", "Last Payment", "Interments"].map((el)=>(<th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50"><Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">{el}</Typography></th>))}</tr></thead>
                      <tbody>
                        {(uiFiltered.subsidiary_ledger || reportsData.subsidiary_ledger || []).map((r, idx) => (
                          <tr key={idx} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.paNo}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.date}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.buyer}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.ncp)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.lot}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.lastPayment || '-'}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.interments}</Typography></td>
                          </tr>
                        ))}
                        {(!reportsData.subsidiary_ledger || reportsData.subsidiary_ledger.length === 0) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={7}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">Totals</Typography></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(ledgerTotals.ncp)}</Typography></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{ledgerTotals.interments}</Typography></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Statement of Account */}
              <TabPanel value="soa" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">Statement of Account</Typography>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Total</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(soaTotals.totalAmount)}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Down</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(soaTotals.downPayment)}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Monthly</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(soaTotals.monthlyAmount)}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Remaining</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{formatCurrency(soaTotals.remainingBalance)}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Paid Mo.</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{soaTotals.paidMonths}</Typography></CardBody></Card>
                    <Card className="border border-blue-gray-100"><CardBody className="p-4 min-w-0"><Typography variant="small" color="blue-gray" className="font-medium">Overdue Mo.</Typography><Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">{soaTotals.overdueMonths}</Typography></CardBody></Card>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] table-auto">
                      <thead>
                        <tr>
                          {[
                            { key: 'paNo', label: 'PA No.' },
                            { key: 'buyer', label: 'Buyer' },
                            { key: 'lot', label: 'Lot' },
                            { key: 'totalAmount', label: 'Total' },
                            { key: 'downPayment', label: 'Down' },
                            { key: 'monthlyAmount', label: 'Monthly' },
                            { key: 'termMonths', label: 'Term' },
                            { key: 'startDate', label: 'Start' },
                            { key: 'endDate', label: 'End' },
                            { key: 'status', label: 'Status' },
                            { key: 'remainingBalance', label: 'Remaining' },
                            { key: 'paidMonths', label: 'Paid Mo.' },
                            { key: 'overdueMonths', label: 'Overdue Mo.' }
                          ].map((col) => (
                            <th 
                              key={col.key} 
                              className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort(col.key)}
                            >
                              <div className="flex items-center gap-1">
                                <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                  {col.label}
                                </Typography>
                                {sortConfig.key === col.key && (
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
                          let sortedData = [...(uiFiltered.soa || [])];
                          
                          // Apply sorting
                          if (sortConfig.key) {
                            sortedData.sort((a, b) => {
                              let aVal, bVal;
                              
                              switch (sortConfig.key) {
                                case 'paNo':
                                  aVal = (a.paNo || '').toString().toLowerCase();
                                  bVal = (b.paNo || '').toString().toLowerCase();
                                  // Handle empty values - put them at the end
                                  if (aVal === '' && bVal !== '') return 1;
                                  if (bVal === '' && aVal !== '') return -1;
                                  break;
                                case 'buyer':
                                  aVal = (a.buyer || '').toLowerCase();
                                  bVal = (b.buyer || '').toLowerCase();
                                  break;
                                case 'lot':
                                  aVal = (a.lot || '').toLowerCase();
                                  bVal = (b.lot || '').toLowerCase();
                                  break;
                                case 'totalAmount':
                                  aVal = parseFloat(a.totalAmount || 0);
                                  bVal = parseFloat(b.totalAmount || 0);
                                  break;
                                case 'downPayment':
                                  aVal = parseFloat(a.downPayment || 0);
                                  bVal = parseFloat(b.downPayment || 0);
                                  break;
                                case 'monthlyAmount':
                                  aVal = parseFloat(a.monthlyAmount || 0);
                                  bVal = parseFloat(b.monthlyAmount || 0);
                                  break;
                                case 'termMonths':
                                  aVal = parseInt(a.termMonths || 0);
                                  bVal = parseInt(b.termMonths || 0);
                                  break;
                                case 'startDate':
                                  aVal = new Date(a.startDate || '1970-01-01').getTime();
                                  bVal = new Date(b.startDate || '1970-01-01').getTime();
                                  break;
                                case 'endDate':
                                  aVal = new Date(a.endDate || '1970-01-01').getTime();
                                  bVal = new Date(b.endDate || '1970-01-01').getTime();
                                  break;
                                case 'status':
                                  aVal = (a.status || '').toLowerCase();
                                  bVal = (b.status || '').toLowerCase();
                                  break;
                                case 'remainingBalance':
                                  aVal = parseFloat(a.remainingBalance || 0);
                                  bVal = parseFloat(b.remainingBalance || 0);
                                  break;
                                case 'paidMonths':
                                  aVal = parseInt(a.paidMonths || 0);
                                  bVal = parseInt(b.paidMonths || 0);
                                  break;
                                case 'overdueMonths':
                                  aVal = parseInt(a.overdueMonths || 0);
                                  bVal = parseInt(b.overdueMonths || 0);
                                  break;
                                default:
                                  return 0;
                              }
                              
                              if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                              if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                              return 0;
                            });
                          }
                          
                          return sortedData.map((r, idx) => (
                          <tr key={idx} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.paNo}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.buyer}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.lot}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.totalAmount)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.downPayment)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.monthlyAmount)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.termMonths}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.startDate}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.endDate || '-'}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.status}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{formatCurrency(r.remainingBalance)}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.paidMonths}</Typography></td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{r.overdueMonths}</Typography></td>
                          </tr>
                          ));
                        })()}
                        {(!uiFiltered.soa || uiFiltered.soa.length === 0) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={13}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">Totals</Typography></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(soaTotals.totalAmount)}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(soaTotals.downPayment)}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(soaTotals.monthlyAmount)}</Typography></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{formatCurrency(soaTotals.remainingBalance)}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{soaTotals.paidMonths}</Typography></td>
                          <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-bold">{soaTotals.overdueMonths}</Typography></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Payment Reports */}
              <TabPanel value="payments" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Payment Transaction Report
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Total Payments
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {summaryData.payments.totalPayments || 0}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Total Amount
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {formatCurrency(summaryData.payments.totalAmount || 0)}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4 min-w-0">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Average Payment
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold break-words overflow-hidden">
                          {formatCurrency(summaryData.payments.averagePayment || 0)}
                        </Typography>
                      </CardBody>
                    </Card>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead>
                        <tr>
                          {[
                            { key: 'paNo', label: 'PA No.' },
                            { key: 'customer', label: 'Customer' },
                            { key: 'lot', label: 'Lot' },
                            { key: 'amount', label: 'Amount' },
                            { key: 'dateTime', label: 'Date/Time' },
                            { key: 'method', label: 'Method' },
                            { key: 'status', label: 'Status' }
                          ].map((col) => (
                            <th 
                              key={col.key} 
                              className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                              onClick={() => handleSort(col.key)}
                            >
                              <div className="flex items-center gap-1">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                  {col.label}
                              </Typography>
                                {sortConfig.key === col.key && (
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
                          let sortedData = [...(uiFiltered.payments || [])];
                          
                          // Apply sorting
                          if (sortConfig.key) {
                            sortedData.sort((a, b) => {
                              let aVal, bVal;
                              
                              switch (sortConfig.key) {
                                case 'paNo':
                                  aVal = (a.paNo || '').toString().toLowerCase();
                                  bVal = (b.paNo || '').toString().toLowerCase();
                                  // Handle empty values - put them at the end
                                  if (aVal === '' && bVal !== '') return 1;
                                  if (bVal === '' && aVal !== '') return -1;
                                  break;
                                case 'customer':
                                  aVal = (a.customerName || '').toLowerCase();
                                  bVal = (b.customerName || '').toLowerCase();
                                  break;
                                case 'lot':
                                  aVal = (a.lot || '').toLowerCase();
                                  bVal = (b.lot || '').toLowerCase();
                                  break;
                                case 'amount':
                                  aVal = parseFloat(a.amount || 0);
                                  bVal = parseFloat(b.amount || 0);
                                  break;
                                case 'dateTime':
                                  aVal = new Date(a.paymentDate || a.date || a.createdAt || '1970-01-01').getTime();
                                  bVal = new Date(b.paymentDate || b.date || b.createdAt || '1970-01-01').getTime();
                                  break;
                                case 'method':
                                  aVal = (a.method || '').toLowerCase();
                                  bVal = (b.method || '').toLowerCase();
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
                          
                          return sortedData.map((row, index) => (
                          <tr key={index} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.paNo || '-'}</Typography></td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.customerName}
                              </Typography>
                            </td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{row.lot || '-'}</Typography></td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {formatCurrency(row.paymentAmount)}
                              </Typography>
                            </td>
                            <td className="py-3 px-6"><Typography variant="small" color="blue-gray" className="font-medium">{(row.paymentDate && row.createdAt) ? `${row.paymentDate} ${new Date(row.createdAt).toLocaleTimeString()}` : (row.paymentDate || '-')}</Typography></td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.paymentMethod}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography
                                variant="small"
                                color={getStatusColor(row.status)}
                                className="font-medium"
                              >
                                {row.status}
                              </Typography>
                            </td>
                          </tr>
                          ));
                        })()}
                        {(!uiFiltered.payments || uiFiltered.payments.length === 0) && (
                          <tr>
                            <td className="py-6 px-6 text-center" colSpan={7}>
                              <Typography variant="small" color="blue-gray" className="font-medium">No data found for the selected filters.</Typography>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Customer Analytics */}
              <TabPanel value="customers" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">
                    Customer Demographics & Behavior
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Total Customers
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold">
                          {summaryData.customers.totalCustomers || 0}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Active Customers
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold">
                          {summaryData.customers.activeCustomers || 0}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          New This Month
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-bold">
                          {summaryData.customers.newThisMonth || 0}
                        </Typography>
                      </CardBody>
                    </Card>
                    <Card className="border border-blue-gray-100">
                      <CardBody className="p-4">
                        <Typography variant="small" color="blue-gray" className="font-medium">
                          Retention Rate
                        </Typography>
                        <Typography variant="h4" color="blue-gray" className="font-medium">
                          {summaryData.customers.retentionRate || 0}%
                        </Typography>
                      </CardBody>
                    </Card>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead>
                        <tr>
                          {["Category", "Count", "Percentage", "Trend", "Growth"].map((el) => (
                            <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                {el}
                              </Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(reportsData.customers || []).map((row, index) => (
                          <tr key={index} className="hover:bg-blue-50 transition-colors">
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.category}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.count}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.percentage}%
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.trend}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography
                                variant="small"
                                color={row.color}
                                className="font-medium"
                              >
                                {row.trend}
                              </Typography>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>
            </TabsBody>
          </Tabs>
        </CardBody>
      </Card>

      {/* Export Dialog removed: direct download on click */}
    </div>
  );
}

export default Reports; 