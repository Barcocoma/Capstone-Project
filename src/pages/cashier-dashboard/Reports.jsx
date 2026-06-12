import React, { useEffect, useMemo, useState } from "react";
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
} from "@heroicons/react/24/outline";
import { API_ENDPOINTS } from "@/configs/api";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs/dist/exceljs.min.js";

export function Reports() {
  const [selectedReport, setSelectedReport] = useState("intake");
  const [dateRange, setDateRange] = useState("last6months");
  const [section, setSection] = useState("all");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [granularity, setGranularity] = useState("daily");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [garden, setGarden] = useState("all");

  const [reportsData, setReportsData] = useState({
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
  });

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.set('type', 'all');
        params.set('date_range', dateRange);
        params.set('section', section);
        params.set('granularity', granularity);
        params.set('garden', garden);
        if (dateRange === 'custom') {
          if (!customStartDate || !customEndDate) return;
          params.set('start_date', customStartDate);
          params.set('end_date', customEndDate);
        }
        // Add cache busting to ensure fresh data
        params.set('_t', Date.now().toString());
        const res = await fetch(`${API_ENDPOINTS.GET_REPORTS_V2}?${params.toString()}`);
        const data = await res.json();
        if (data.success) {
          const defaults = { financial: [], occupancy: [], payments: [], customers: [], inventory: [], sector_summary: [], aging: [], cash_position: { summary: { totalAmount: 0, transactions: 0 }, records: [] }, sales: [], fully_paid: [], subsidiary_ledger: [], soa: [] };
          setReportsData({ ...defaults, ...(data.reports || {}) });
        }
      } catch (e) {
        // ignore
      }
    };
    load();
  }, [dateRange, section, granularity, garden, customStartDate, customEndDate]);

  const TABS = [
    { label: "Payments", value: "intake", icon: <CurrencyDollarIcon className="w-5 h-5" /> },
    { label: "Aging Report", value: "aging", icon: <ChartBarIcon className="w-5 h-5" /> },
    { label: "Statement of Account", value: "soa", icon: <ChartBarIcon className="w-5 h-5" /> },
  ];

  const [intakePayments, setIntakePayments] = useState([]);
  const [loadingIntake, setLoadingIntake] = useState(false);
  const [intakeFilter, setIntakeFilter] = useState("all");

  const showFilters = useMemo(() => ({
    financial: { garden: false, section: false, date: true, granularity: true },
    payments: { garden: false, section: false, date: true, granularity: false },
    intake: { garden: false, section: false, date: false, granularity: false },
    aging: { garden: true, section: false, date: true, granularity: false },
    soa: { garden: true, section: false, date: false, granularity: false }
  }), []);

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

  const buildReportDataset = () => {
    if (selectedReport === "financial") {
      return {
        title: "Financial Performance Overview",
        headers: ["Month", "Revenue", "Payments"],
        rows: (reportsData.financial || []).map((r) => [r.month, r.revenue, r.payments]),
      };
    }
    
    if (selectedReport === "inventory") {
      return {
        title: "Inventory Summary",
        headers: ["Garden", "Section", "Total Lots", "Available", "Reserved", "Occupied", "Sold (Installment)", "Sold (Fully Paid)", "Sold (Total)", "Occupancy Rate"],
        rows: (reportsData.inventory || []).map((r) => [r.garden || '-', r.section, r.totalLots, r.availableLots, r.reservedLots, r.occupiedLots, r.soldInstallment, r.soldFullyPaid, Number(r.soldInstallment || 0) + Number(r.soldFullyPaid || 0), `${r.occupancyRate ?? 0}%`]),
      };
    }
    if (selectedReport === "payments") {
      return {
        title: "Payment Transaction Report",
        headers: ["Customer", "PA No.", "Lot", "Amount", "Date/Time", "Method", "Status"],
        rows: (reportsData.payments || []).map((r) => [r.customerName, r.paNo || '-', r.lot || '-', r.paymentAmount, (r.paymentDate && r.createdAt) ? `${r.paymentDate} ${new Date(r.createdAt).toLocaleTimeString()}` : (r.paymentDate || '-') , r.paymentMethod, r.status]),
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

  const handleExport = async () => {
    const reportKey = selectedReport;
    const dataset = (() => {
      switch (reportKey) {
        case 'intake': {
          const totalAmount = intakePayments.reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0);
          return { 
            title: 'Payments', 
            headers: ["Date","Customer","Lot","Amount","Method","Status","Performed By"], 
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
        case 'financial': return { title: 'Financial Performance Overview', headers: ["Month","Revenue","Payments"], rows: (reportsData.financial || []).map((r)=>[r.month,r.revenue,r.payments]) };
        case 'inventory': return { title: 'Inventory Summary', headers: ["Garden","Section","Total Lots","Available","Reserved","Occupied","Sold (Installment)","Sold (Fully Paid)","Sold (Total)","Occupancy Rate"], rows: (reportsData.inventory || []).map((r)=>[r.garden || '-', r.section, r.totalLots, r.availableLots, r.reservedLots, r.occupiedLots, r.soldInstallment, r.soldFullyPaid, Number(r.soldInstallment || 0) + Number(r.soldFullyPaid || 0), `${r.occupancyRate ?? 0}%`]) };
        case 'payments': return { title: 'Payment Transaction Report', headers: ["PA No.","Customer","Lot","Amount","Date/Time","Method","Status"], rows: (reportsData.payments || []).map((r)=>[r.paNo || '-', r.customerName, r.lot || '-', r.paymentAmount, (r.paymentDate && r.createdAt) ? `${r.paymentDate} ${new Date(r.createdAt).toLocaleTimeString()}` : (r.paymentDate || '-') , r.paymentMethod, r.status]) };
        case 'customers': return { title: 'Customer Demographics & Behavior', headers: ["Category","Count","Percentage","Trend","Growth"], rows: (reportsData.customers || []).map((r)=>[r.category,r.count,`${r.percentage}%`,r.trend,r.trend]) };
        default: return { title: 'Report', headers: [], rows: [] };
      }
    })();
    const { title, headers, rows } = dataset;
    const label = (TABS.find((t) => t.value === reportKey)?.label || 'Report').replace(/\s+/g, '_');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet((reportKey || 'Report').slice(0, 31));
    const colCount = Math.max(1, headers.length);
    // Center the sheet on print like SoA
    worksheet.pageSetup = Object.assign({}, worksheet.pageSetup, { horizontalCentered: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } });

    const colToLetter = (i) => { let s = '', n = i; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    const fetchImageBase64 = async (url) => { try { const res = await fetch(url); const blob = await res.blob(); const dataUrl = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); }); return String(dataUrl).split(',')[1]; } catch { return null; } };
    const logoBase64 = await fetchImageBase64('/img/divine_life.png');
    const company = 'Divine Life Memorial Park';
    const generatedAt = new Date().toLocaleString();
    const getIntakeFilterLabel = (filter) => {
      switch (filter) {
        case 'today': return 'Today';
        case '30days': return 'Last 30 Days';
        default: return 'All Time';
      }
    };
    const displayRange = reportKey === 'intake'
      ? getIntakeFilterLabel(intakeFilter)
      : (dateRange === 'custom' && customStartDate && customEndDate) ? `${customStartDate} to ${customEndDate}` : dateRange;
    const meta = reportKey === 'intake'
      ? `Filter: ${displayRange} • Generated: ${generatedAt}`
      : `Range: ${displayRange} • Granularity: ${granularity.toUpperCase()} • Section: ${section.toUpperCase()}${garden && garden !== 'all' ? ` • Garden: ${garden}` : ''} • Generated: ${generatedAt}`;

    // SoA-style row heights and spacing
    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 26;
    worksheet.getRow(4).height = 12; // spacer row after meta

    // Add image with fixed size to avoid stretching
    const hasLogo = !!logoBase64 && colCount >= 3;
    const startColForText = hasLogo ? 3 : 1;
    if (hasLogo) { const imageId = workbook.addImage({ base64: logoBase64, extension: 'png' }); worksheet.addImage(imageId, { tl: { col: 0, row: 0 }, br: { col: startColForText - 1, row: 4 } }); }

    // Ensure header/meta merged width is wide enough (SoA-like) by merging extra blank columns
    const currentMergedWidth = () => { let sum = 0; for (let c = startColForText; c <= (startColForText + colCount - 1); c++) { sum += Number(worksheet.getColumn(c).width || 10); } return sum; };
    const targetMergedWidth = 110; // approx chars to fit meta on one line
    let extraCols = 0;
    if (!(reportKey === 'financial' || reportKey === 'sales')) {
      if (currentMergedWidth() < targetMergedWidth) {
        extraCols = Math.ceil((targetMergedWidth - currentMergedWidth()) / 18);
        for (let i = 1; i <= extraCols; i++) {
          worksheet.getColumn(startColForText + colCount - 1 + i).width = 18;
        }
      }
    }
    let mergeEndCol = startColForText + colCount - 1 + extraCols;

    // When exporting Financial/Sales, spread the 3 columns across C..I using column spans
    const isWide = reportKey === 'financial' || reportKey === 'sales';
    const spans = isWide ? [3, 2, 2] : Array(colCount).fill(1);
    const baseCols = [];
    { let acc = 0; for (let i = 0; i < colCount; i++) { baseCols[i] = startColForText + acc; acc += spans[i]; } }
    if (isWide) { mergeEndCol = baseCols[colCount - 1] + spans[colCount - 1] - 1; }
    const colIndex = (i) => (isWide ? baseCols[i] : (startColForText + i));

    // Company, Title, Meta centered and merged to mergeEndCol
    worksheet.mergeCells(1, startColForText, 1, mergeEndCol); worksheet.getCell(1, startColForText).value = company; worksheet.getCell(1, startColForText).alignment = { horizontal: 'center', vertical: 'middle' }; worksheet.getCell(1, startColForText).font = { bold: true, size: 16 };
    worksheet.mergeCells(2, startColForText, 2, mergeEndCol); worksheet.getCell(2, startColForText).value = title; worksheet.getCell(2, startColForText).alignment = { horizontal: 'center', vertical: 'middle' }; worksheet.getCell(2, startColForText).font = { bold: true, size: 20 };
    worksheet.mergeCells(3, startColForText, 3, mergeEndCol); worksheet.getCell(3, startColForText).value = meta; worksheet.getCell(3, startColForText).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; worksheet.getCell(3, startColForText).font = { size: 12, color: { argb: 'FF374151' } };

    // Column widths - widen Financial/Sales to fill header width C..I
    headers.forEach((h, idx) => {
      if (isWide) {
        // Distribute widths across the span for each column
        const perColWidth = [
          20, // Date block each sub-column
          18, // Revenue block each sub-column
          16  // Payments block each sub-column
        ];
        const span = spans[idx];
        const startC = colIndex(idx);
        for (let c = 0; c < span; c++) {
          const width = perColWidth[idx] || 18;
          worksheet.getColumn(startC + c).width = width;
        }
      } else {
        const lower = String(h).toLowerCase();
        let w = 18; if (lower.includes('date') || lower.includes('time')) w = 22; if (/(section|garden|buyer|customer|account)/.test(lower)) w = 28; if (/(status|method)/.test(lower)) w = 18; if (/(lot|pa\s?no\.?)/.test(lower)) w = 18;
        worksheet.getColumn(colIndex(idx)).width = w;
      }
    });

    // Dynamic meta row height based on merged width
    const mergedWidthChars = (() => { let sum = 0; for (let c = startColForText; c <= mergeEndCol; c++) { sum += Number(worksheet.getColumn(c).width || 10); } return Math.max(sum - 2, 10); })();
    const metaLen = String(meta).length; const metaLines = Math.max(1, Math.ceil(metaLen / mergedWidthChars)); worksheet.getRow(3).height = Math.max(20, metaLines * 14);

    // Header row at 5 (after spacer)
    const headerRowIndex = 5; const headerRow = worksheet.getRow(headerRowIndex);
    headers.forEach((h, i) => {
      const startC = colIndex(i);
      if (isWide) { worksheet.mergeCells(headerRowIndex, startC, headerRowIndex, startC + spans[i] - 1); }
      headerRow.getCell(startC).value = h;
    });
    headerRow.font = { bold: true, color: { argb: 'FF1F2937' } }; headerRow.alignment = { horizontal: 'center', vertical: 'middle' }; headerRow.height = 22;
    for (let i = 0; i < colCount; i++) { const cell = headerRow.getCell(colIndex(i)); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; cell.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } }; cell.protection = { locked: true }; }
    if (reportKey === 'financial' || reportKey === 'sales') { worksheet.getRow(headerRowIndex).height = 22; }

    // Data rows start after header
    const dataStartRow = headerRowIndex + 1;
    rows.forEach((r, rIdx) => {
      const rowIndex = dataStartRow + rIdx;
      const row = worksheet.getRow(rowIndex);
      row.height = 18; // SoA-style consistent row height
      r.forEach((v, i) => {
        if (isWide) { worksheet.mergeCells(rowIndex, colIndex(i), rowIndex, colIndex(i) + spans[i] - 1); }
        const hdr = String(headers[i]).toLowerCase();
        const isCurrency = /(amount|revenue|ncp|down|monthly|remaining|total(?!\s*(lots|payments|customers|transactions)))/.test(hdr) && !hdr.includes('sold (total)');
        let valueToWrite = v;
        if (typeof v === 'string') {
          const parsed = Number(v.replace?.(/[ ,]/g, '') ?? v);
          if (!Number.isNaN(parsed)) valueToWrite = parsed;
        }
        const cell = row.getCell(colIndex(i));
        cell.value = valueToWrite;
        const isNumeric = /(total|amount|revenue|payments|monthly|remaining|paid|overdue|transactions|ncp|interments)/.test(hdr) || typeof valueToWrite === 'number';
        cell.alignment = { horizontal: isNumeric ? 'right' : 'left', vertical: 'middle', wrapText: true, indent: isNumeric ? 0 : 1 };
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

    // Totals row styled like SoA
    const totalsRowIndex = dataLastRow + 1;
    worksheet.getRow(totalsRowIndex).height = 20;
    if (isWide) { for (let i = 0; i < colCount; i++) { worksheet.mergeCells(totalsRowIndex, colIndex(i), totalsRowIndex, colIndex(i) + spans[i] - 1); } }
    // Place 'Totals' label under the first column of the table
    { const totalsLabelCell = worksheet.getCell(totalsRowIndex, colIndex(0)); totalsLabelCell.value = 'Totals'; totalsLabelCell.font = { bold: true }; }
    headers.forEach((h, idx) => {
      const x = String(h).toLowerCase();
      if (!/(rate|percentage|percent|date|time|buyer|customer|method|status|pa\s?no\.?|lot|section|category|trend|growth|garden|account)/.test(x) && /(total|amount|revenue|payment|available|reserved|occupied|sold|count|transactions|ncp|interments|monthly|remaining|paid|overdue)/.test(x)) {
        const L = colToLetter(colIndex(idx));
        const c = worksheet.getCell(`${L}${totalsRowIndex}`);
        c.value = { formula: `SUM(${L}${dataStartRow}:${L}${dataLastRow})` };
        c.alignment = { horizontal: 'right', vertical: 'middle' };
        c.font = { bold: true };
        if (/(amount|revenue|ncp|down|monthly|remaining|total(?!\s*(lots|payments|customers|transactions)))/.test(x) && !x.includes('sold (total)')) { c.numFmt = '"₱"#,##0'; }
        c.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    });
    // Occupancy Rate recompute for inventory export totals
    if (reportKey === 'inventory') {
      const totalLotsIdx = headers.findIndex(h => String(h).toLowerCase().includes('total lots'));
      const soldTotalIdx = headers.findIndex(h => String(h).toLowerCase().includes('sold (total)'));
      const rateIdx = headers.findIndex(h => String(h).toLowerCase().includes('occupancy rate'));
      if (totalLotsIdx !== -1 && soldTotalIdx !== -1 && rateIdx !== -1) {
        const tl = colToLetter(colIndex(totalLotsIdx));
        const sl = colToLetter(colIndex(soldTotalIdx));
        const rc = colToLetter(colIndex(rateIdx));
        worksheet.getCell(`${rc}${totalsRowIndex}`).value = { formula: `IF(${tl}${totalsRowIndex}=0,0,ROUND((${sl}${totalsRowIndex}/${tl}${totalsRowIndex})*100,1))` };
      }
    }

    // Freeze panes and auto-fit columns (skip auto-fit for financial/sales to match SoA exact widths)
    const headerRowIndexFinal = headerRowIndex;
    worksheet.views = [{ state: 'frozen', ySplit: headerRowIndexFinal }];
    if (!(reportKey === 'financial' || reportKey === 'sales')) {
      for (let i = 0; i < colCount; i++) {
        const cIdx = colIndex(i);
        let maxLen = String(worksheet.getRow(headerRowIndexFinal).getCell(cIdx).value ?? '').length;
        for (let r = dataStartRow; r <= dataLastRow; r++) {
          const val = worksheet.getRow(r).getCell(cIdx).value;
          const text = typeof val === 'object' && val && 'text' in val ? String(val.text) : String(val ?? '');
          if (text.length > maxLen) maxLen = text.length;
        }
        const width = Math.min(Math.max(maxLen + 10, 18), 100);
        worksheet.getColumn(cIdx).width = width;
      }
    }

    // Protect the sheet like SoA
    await worksheet.protect('REPORT', { selectLockedCells: true, selectUnlockedCells: false, sort: false, autoFilter: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false });

    // Save
    const buf = await workbook.xlsx.writeBuffer(); const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${label}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
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
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
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
              {showFilters[selectedReport]?.date && (
                <div className="w-full sm:w-48">
                  <Select label="Date Range" value={dateRange} onChange={(value) => setDateRange(value)}>
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
                  <Select label="Granularity" value={granularity} onChange={(value) => setGranularity(value)}>
                    <Option value="daily">Daily</Option>
                    <Option value="monthly">Monthly</Option>
                    <Option value="yearly">Yearly</Option>
                  </Select>
                </div>
              )}
            </div>
            {showFilters[selectedReport]?.date && dateRange === 'custom' && (
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="w-full"><Input type="date" label="Start Date" value={customStartDate} onChange={(e)=>setCustomStartDate(e.target.value)} /></div>
                <div className="w-full"><Input type="date" label="End Date" value={customEndDate} onChange={(e)=>setCustomEndDate(e.target.value)} /></div>
              </div>
            )}
            <div className="flex gap-2 w-full lg:w-auto">
              <Button
                variant="outlined"
                color="blue-gray"
                className="flex items-center gap-2"
                onClick={handleExport}
              >
                <DocumentArrowDownIcon className="w-4 h-4" />
                Export
              </Button>
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
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead>
                        <tr>
                          {["Month", "Revenue", "Payments"].map((el) => (
                            <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                {el}
                              </Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(reportsData.financial || []).map((row, index) => (
                          <tr key={index}>
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
                        ))}
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
                        <CardBody className="p-4">
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            Paid Months
                          </Typography>
                          <Typography variant="h4" color="blue-gray" className="font-bold">
                            {intakeAgingTotals.paidMonths}
                          </Typography>
                        </CardBody>
                      </Card>
                      <Card className="border border-blue-gray-100">
                        <CardBody className="p-4">
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            Unpaid Months
                          </Typography>
                          <Typography variant="h4" color="blue-gray" className="font-bold">
                            {intakeAgingTotals.unpaidMonths}
                          </Typography>
                        </CardBody>
                      </Card>
                      <Card className="border border-blue-gray-100">
                        <CardBody className="p-4">
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            Total Payments
                          </Typography>
                          <Typography variant="h4" color="blue-gray" className="font-bold">
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
                  <Typography variant="h5" color="blue-gray" className="mb-4">Aging Report</Typography>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] table-auto">
                      <thead>
                        <tr>
                          {["PA No.", "Buyer", "Lot", "Term (mo)", "Monthly", "Paid Mo.", "Unpaid Mo.", "Overdue Mo.", "Remaining", "Last Payment", "Interments"].map((el) => (
                            <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">{el}</Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(reportsData.aging || []).map((r, idx) => (
                          <tr key={idx}>
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
                        ))}
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
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead>
                        <tr>
                          {["Customer", "Lot ID", "Amount", "Date", "Method", "Status"].map((el) => (
                            <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                {el}
                              </Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(reportsData.payments || []).map((row, index) => (
                          <tr key={index}>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.customerName}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.lotId}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {formatCurrency(row.paymentAmount)}
                              </Typography>
                            </td>
                            <td className="py-3 px-6">
                              <Typography variant="small" color="blue-gray" className="font-medium">
                                {row.paymentDate}
                              </Typography>
                            </td>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabPanel>

              {/* Statement of Account */}
              <TabPanel value="soa" className="p-6">
                <div className="mb-6">
                  <Typography variant="h5" color="blue-gray" className="mb-4">Statement of Account</Typography>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] table-auto">
                      <thead><tr>{["PA No.", "Buyer", "Lot", "Total", "Down", "Monthly", "Term", "Start", "End", "Status", "Remaining", "Paid Mo.", "Overdue Mo."].map((el)=>(<th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left"><Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">{el}</Typography></th>))}</tr></thead>
                      <tbody>
                        {(reportsData.soa || []).map((r, idx) => (
                          <tr key={idx}>
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
                        ))}
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
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-auto">
                      <thead>
                        <tr>
                          {["Category", "Count", "Percentage", "Trend", "Growth"].map((el) => (
                            <th key={el} className="border-b border-blue-gray-50 py-3 px-6 text-left">
                              <Typography variant="small" className="text-[11px] font-medium uppercase text-blue-gray-400">
                                {el}
                              </Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(reportsData.customers || []).map((row, index) => (
                          <tr key={index}>
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