import React, { useEffect, useMemo, useState } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Input,
  Button,
  Select,
  Option,
  Chip,
} from "@material-tailwind/react";
import { 
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { API_ENDPOINTS } from "@/configs/api";

const GARDEN_PREFIX = {
  "Joy Garden": "J",
  "Peace Garden": "P",
  "Hope Garden": "H",
  "Faith Garden": "F",
  "Love Garden": "L",
};

const statusColors = {
  Available: "green",
  Sold: "red",
};

const LotSearch = () => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Sold");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [gardens, setGardens] = useState([]);
  const [sectors, setSectors] = useState([]); // sector names for a specific garden
  const [sectorPairs, setSectorPairs] = useState([]); // {garden, sector} pairs for All Gardens mode
  const [selectedGarden, setSelectedGarden] = useState("ALL");
  const [sectorLoadIndex, setSectorLoadIndex] = useState(0);
  const SECTORS_PAGE_SIZE = 3;
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Debounce query to reduce renders
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Load gardens on mount
  useEffect(() => {
    const loadGardens = async () => {
      try {
        setLoading(true);
        const res = await fetch(API_ENDPOINTS.MAP_GARDENS);
        const data = await res.json();
        setGardens(Array.isArray(data.gardens) ? data.gardens : []);
      } catch (_) {
        setGardens([]);
      } finally {
        setLoading(false);
      }
    };
    loadGardens();
  }, []);

  // When garden changes, load sectors list or all sector pairs and reset rows
  useEffect(() => {
    const loadSectors = async () => {
      if (!selectedGarden) {
        setSectors([]);
        setSectorPairs([]);
        setRows([]);
        return;
      }
      if (selectedGarden === 'ALL') {
        try {
          setLoading(true);
          // Load all gardens, then fetch their sectors to build full pairs
          const gRes = await fetch(API_ENDPOINTS.MAP_GARDENS);
          const gData = await gRes.json();
          const gList = Array.isArray(gData.gardens) ? gData.gardens : [];
          const sectorLists = await Promise.all(gList.map(async (g) => {
            try {
              const sRes = await fetch(`${API_ENDPOINTS.MAP_SECTORS}?garden=${encodeURIComponent(g)}`);
              const sData = await sRes.json();
              const secs = Array.isArray(sData.sectors) ? sData.sectors : [];
              return secs.map(s => ({ garden: g, sector: s }));
            } catch (_) {
              return [];
            }
          }));
          const pairs = sectorLists.flat();
          setSectorPairs(pairs);
          setSectors([]);
          setRows([]);
          setSectorLoadIndex(0);
        } catch (_) {
          setSectorPairs([]);
          setRows([]);
        } finally {
          setLoading(false);
        }
        return;
      }
      try {
        setLoading(true);
        const res = await fetch(`${API_ENDPOINTS.MAP_SECTORS}?garden=${encodeURIComponent(selectedGarden)}`);
        const data = await res.json();
        const secs = Array.isArray(data.sectors) ? data.sectors : [];
        setSectors(secs);
        setSectorPairs([]);
        setRows([]);
        setSectorLoadIndex(0);
      } catch (_) {
        setSectors([]);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    loadSectors();
  }, [selectedGarden]);

  // Reset rows when status changes to avoid showing stale items
  useEffect(() => {
    setRows([]);
    setSectorLoadIndex(0);
  }, [statusFilter]);

  // Helper to build rows from sector lots
  const buildRowsFromSector = (garden, sector, lots) => {
    const prefix = GARDEN_PREFIX[garden] || (garden?.[0] || "");
    const built = [];
    lots.forEach(l => {
      const code = `${prefix}${sector}${l.blockNumber}-${l.lotNumber}`;
      const s = String(l.status || '').toLowerCase();
      const status = (s === 'reserved' || s === 'occupied') ? 'Sold' : 'Available';
      const deceased = Array.isArray(l.deceasedRecords) && l.deceasedRecords.length > 0 ? l.deceasedRecords.map(x => x.name).join(', ') : '-';
      built.push({
        lotId: code,
        status,
        owner: l.owner || '-',
        deceased,
        garden,
        sector,
        blockNumber: l.blockNumber,
        lotNumber: l.lotNumber,
      });
    });
    return built;
  };

  const dedupeRows = (arr) => {
    const byId = new Map();
    for (const item of arr) {
      if (!byId.has(item.lotId)) {
        byId.set(item.lotId, item);
      }
    }
    return Array.from(byId.values());
  };

  // Load initial results for selected garden or all gardens
  useEffect(() => {
    const loadBatch = async () => {
      if (!selectedGarden) return;
      // All Gardens mode: query server-side search for a fast first page
      if (selectedGarden === 'ALL') {
        // For Available, rely on sector-based mapping data (DB may not store available rows)
        if (statusFilter === 'Available') {
          if (sectorPairs.length === 0) return; // wait until sectors ready
          try {
            setLoading(true);
            const start = 0;
            const end = Math.min(SECTORS_PAGE_SIZE, sectorPairs.length);
            const slice = sectorPairs.slice(start, end);
            let all = [];
            for (const { garden, sector } of slice) {
              try {
                const r = await fetch(`${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(garden)}&sector=${encodeURIComponent(sector)}`);
                const d = await r.json();
                const lots = Array.isArray(d.lots) ? d.lots : [];
                all = all.concat(buildRowsFromSector(garden, sector, lots));
              } catch (_) {}
            }
            all.sort((a,b) => a.lotId.localeCompare(b.lotId, undefined, { numeric: true }));
            setRows(all);
            setSectorLoadIndex(end);
          } finally {
            setLoading(false);
          }
          return;
        }
        try {
          setLoading(true);
          const url = new URL(API_ENDPOINTS.SEARCH_LOTS, window.location.origin);
          url.searchParams.set('garden', 'ALL');
          if (statusFilter) url.searchParams.set('status', statusFilter);
          if (debouncedQuery) url.searchParams.set('q', debouncedQuery);
          url.searchParams.set('limit', '200');
          const r = await fetch(url.toString());
          const d = await r.json();
          const lots = Array.isArray(d.lots) ? d.lots : [];
          let all = [];
          for (const l of lots) {
            all = all.concat(buildRowsFromSector(l.garden, l.sector, [l]));
          }
          // If sector pairs are available, also include the first batch of mapping data so Available lots show up in All
          if (sectorPairs.length > 0) {
            const start = 0;
            const end = Math.min(SECTORS_PAGE_SIZE, sectorPairs.length);
            const slice = sectorPairs.slice(start, end);
            for (const { garden, sector } of slice) {
              try {
                const rr = await fetch(`${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(garden)}&sector=${encodeURIComponent(sector)}`);
                const dd = await rr.json();
                const lots2 = Array.isArray(dd.lots) ? dd.lots : [];
                all = all.concat(buildRowsFromSector(garden, sector, lots2));
              } catch (_) {}
            }
            setSectorLoadIndex(end);
          }
          all = dedupeRows(all);
          all.sort((a,b) => a.lotId.localeCompare(b.lotId, undefined, { numeric: true }));
          setRows(all);
          // Keep sectorPairs path as a fallback to continue loading remaining sectors in background
          if (sectorPairs.length === 0) setSectorLoadIndex(0);
        } catch (_) {
          setRows([]);
        } finally {
          setLoading(false);
        }
        return;
      }
      // Single garden mode: load first few sectors
      if (sectors.length === 0) return;
      try {
        setLoading(true);
        const start = 0;
        const end = Math.min(SECTORS_PAGE_SIZE, sectors.length);
        const slice = sectors.slice(start, end);
        let all = [];
        for (const sec of slice) {
          try {
            const r = await fetch(`${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(selectedGarden)}&sector=${encodeURIComponent(sec)}`);
            const d = await r.json();
            const lots = Array.isArray(d.lots) ? d.lots : [];
            all = all.concat(buildRowsFromSector(selectedGarden, sec, lots));
          } catch (_) {}
        }
        all = dedupeRows(all);
        all.sort((a,b) => a.lotId.localeCompare(b.lotId, undefined, { numeric: true }));
        all = dedupeRows(all);
        all.sort((a,b) => a.lotId.localeCompare(b.lotId, undefined, { numeric: true }));
        setRows(all);
        setSectorLoadIndex(end);
      } finally {
        setLoading(false);
      }
    };
    loadBatch();
  }, [selectedGarden, sectors, sectorPairs, statusFilter, debouncedQuery]);

  // Note: Removed "Load more" behavior per request; initial batch loads only to avoid lag.

  const filteredLots = useMemo(() => {
    const q = debouncedQuery;
    let filtered = rows.filter(lot => {
      const matchesQuery =
        !q || lot.lotId.toLowerCase().includes(q) || lot.owner.toLowerCase().includes(q);
      const matchesStatus = statusFilter ? lot.status === statusFilter : true;
      return matchesQuery && matchesStatus;
    });

    // Apply sorting
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal, bVal;
        
        switch (sortConfig.key) {
          case 'lotId':
            aVal = (a.lotId || '').toLowerCase();
            bVal = (b.lotId || '').toLowerCase();
            break;
          case 'status':
            aVal = (a.status || '').toLowerCase();
            bVal = (b.status || '').toLowerCase();
            break;
          case 'owner':
            aVal = (a.owner || '').toLowerCase();
            bVal = (b.owner || '').toLowerCase();
            break;
          case 'deceased':
            aVal = (a.deceased || '').toLowerCase();
            bVal = (b.deceased || '').toLowerCase();
            break;
          default:
            return 0;
        }
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [rows, debouncedQuery, statusFilter, sortConfig]);

  // Auto-load all sectors in All Gardens as a fallback to backend search
  useEffect(() => {
    const shouldRun = selectedGarden === 'ALL'
      && sectorPairs.length > 0
      && sectorLoadIndex < sectorPairs.length
      && !isAutoLoading;
    if (!shouldRun) return;
    let cancelled = false;
    const BATCH = 8;
    const run = async () => {
      try {
        setIsAutoLoading(true);
        setLoading(true);
        let idx = sectorLoadIndex;
        while (!cancelled && idx < sectorPairs.length) {
          const end = Math.min(idx + BATCH, sectorPairs.length);
          const slice = sectorPairs.slice(idx, end);
          const results = await Promise.all(slice.map(async ({ garden, sector }) => {
            try {
              const r = await fetch(`${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(garden)}&sector=${encodeURIComponent(sector)}`);
              const d = await r.json();
              const lots = Array.isArray(d.lots) ? d.lots : [];
              return buildRowsFromSector(garden, sector, lots);
            } catch (_) {
              return [];
            }
          }));
          const appended = results.flat();
          if (cancelled) break;
          setRows(prev => {
            let merged = prev.concat(appended);
            merged = dedupeRows(merged);
            merged.sort((a,b) => a.lotId.localeCompare(b.lotId, undefined, { numeric: true }));
            return merged;
          });
          idx = end;
          setSectorLoadIndex(idx);
        }
      } finally {
        if (!cancelled) {
          setIsAutoLoading(false);
          setLoading(false);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [selectedGarden, sectorPairs, isAutoLoading, sectorLoadIndex]);

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="mb-8">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Lot Search
        </Typography>
        <Typography variant="small" color="blue-gray" className="opacity-70">
          Search and view lot information
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
            Lot Search Results
          </Typography>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:w-auto">
            <div className="w-full sm:w-72 sm:flex-shrink-0">
              <Input
                label="Enter Owner Name or Lot ID"
                icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                value={query}
                onChange={e => {
                  const filtered = e.target.value.replace(/[^A-Za-z0-9\s]/g, '');
                  setQuery(filtered);
                }}
                className="!border !border-blue-gray-200 !rounded-md !bg-white"
                labelProps={{ className: "!text-blue-gray-400" }}
              />
            </div>
            <div className="w-full sm:w-52 sm:flex-shrink-0">
              <select
                value={selectedGarden}
                onChange={e => setSelectedGarden(e.target.value)}
                className="block w-full h-12 px-3 py-2 border border-blue-gray-200 rounded-md bg-white text-blue-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="ALL">All Gardens</option>
                {gardens.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-48 flex items-center sm:flex-shrink-0">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="block w-full h-12 px-3 py-2 border border-blue-gray-200 rounded-md bg-white text-blue-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All</option>
                <option value="Available">Available</option>
                <option value="Sold">Sold</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardBody className="px-0 pt-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] table-auto">
              <thead>
                <tr>
                  {[
                    { key: 'lotId', label: 'Lot ID' },
                    { key: 'status', label: 'Status' },
                    { key: 'owner', label: 'Owner' },
                    { key: 'deceased', label: 'Deceased' },
                    { key: null, label: 'View' }
                  ].map((col) => (
                    <th
                      key={col.key || 'view'}
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
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-gray-500">Loading lots...</td>
                  </tr>
                ) : filteredLots.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                        {query ? "No results found" : "No lots available"}
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  filteredLots.map((lot, key) => {
                    const className = `py-3 px-6 ${
                      key === filteredLots.length - 1 ? "" : "border-b border-blue-gray-50"
                    }`;
                    return (
                      <tr key={key} className="hover:bg-blue-50 transition-colors">
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-semibold">
                            {lot.lotId}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Chip
                            variant="ghost"
                            color={statusColors[lot.status]}
                            value={lot.status}
                            className="text-center font-medium w-fit"
                          />
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">
                            {lot.owner}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Typography variant="small" color="blue-gray" className="font-normal">
                            {lot.deceased}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Button color="blue" size="sm" className="font-bold" onClick={() => {
                            window.location.href = `/dashboard/sector-on-map/${encodeURIComponent(lot.garden)}/${encodeURIComponent(lot.sector)}?block=${encodeURIComponent(lot.blockNumber)}&lot=${encodeURIComponent(lot.lotNumber)}`;
                          }}>VIEW ON MAP</Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Load more button removed as requested */}
        </CardBody>
      </Card>
    </div>
  );
};

export default LotSearch; 