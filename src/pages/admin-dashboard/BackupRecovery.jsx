import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Button,
  Input,
  Select,
  Option,
  Tabs,
  TabsHeader,
  TabsBody,
  Tab,
  TabPanel,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Chip,
  IconButton,
  Tooltip,
  Alert,
} from '@material-tailwind/react';
import {
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  UserIcon,
  HomeIcon,
  UserGroupIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/solid';
import { API_BASE_URL } from '@/configs/api';
import { useAuth } from '@/context/AuthContext';

export function BackupRecovery() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [deletedRecords, setDeletedRecords] = useState({
    users: [],
    lots: [],
    deceased: [],
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState(null);
  const [alternativeLots, setAlternativeLots] = useState([]);
  const [selectedAlternatives, setSelectedAlternatives] = useState({});
  const [restoringItems, setRestoringItems] = useState({});
  const [settings, setSettings] = useState({
    backup_retention_days: { value: '30' },
    auto_cleanup_enabled: { value: '1' },
  });
  const [stats, setStats] = useState({});
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [sortConfig, setSortConfig] = useState({
    users: { key: 'deleted_at', direction: 'desc' },
    lots: { key: 'deleted_at', direction: 'desc' },
    deceased: { key: 'deleted_at', direction: 'desc' },
  });

  useEffect(() => {
    fetchDeletedRecords();
    fetchSettings();
  }, []);

  const fetchDeletedRecords = async () => {
    setLoading(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.id) {
        headers['X-User-Id'] = user.id.toString();
      }
      
      const response = await fetch(`${API_BASE_URL}/get_deleted_records.php?record_type=all`, {
        method: 'GET',
        headers: headers,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setDeletedRecords(data.data);
      } else {
        console.error('Failed to fetch deleted records:', data.message);
      }
    } catch (error) {
      console.error('Error fetching deleted records:', error);
    }
    setLoading(false);
  };

  const fetchSettings = async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.id) {
        headers['X-User-Id'] = user.id.toString();
      }
      
      const response = await fetch(`${API_BASE_URL}/get_retention_settings.php`, {
        method: 'GET',
        headers: headers,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setStats(data.stats);
      } else {
        console.error('Failed to fetch settings:', data.message);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleRestore = async (record) => {
    setSelectedRecord(record);
    setShowRestoreDialog(true);
  };

  const confirmRestore = async () => {
    setLoading(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.id) {
        headers['X-User-Id'] = user.id.toString();
      }
      
      const response = await fetch(`${API_BASE_URL}/restore_deleted_record.php`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          backup_id: selectedRecord.backup_id,
        }),
      });
      const data = await response.json();

      if (data.requires_resolution) {
        setConflictData(data);
        setShowRestoreDialog(false);
        setShowConflictDialog(true);
      } else if (data.requires_alternative) {
        // Fetch alternative lots
        const altHeaders = {
          'Content-Type': 'application/json',
        };
        if (user?.id) {
          altHeaders['X-User-Id'] = user.id.toString();
        }
        
        const altResponse = await fetch(
          `${API_BASE_URL}/get_alternative_lots.php?original_lot_id=${selectedRecord.record_id}`,
          { headers: altHeaders }
        );
        const altData = await altResponse.json();
        if (altData.success) {
          setAlternativeLots(altData.available_lots);
          setConflictData(data);
          setShowRestoreDialog(false);
          setShowConflictDialog(true);
        }
      } else if (data.success) {
        setToast({ show: true, message: data.message, type: 'success' });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
        fetchDeletedRecords();
        setShowRestoreDialog(false);
      } else {
        setToast({ show: true, message: data.message, type: 'error' });
        setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
      }
    } catch (error) {
      setToast({ show: true, message: 'Error restoring record: ' + error.message, type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
    }
    setLoading(false);
  };

  const handleRestoreIndividualItem = async (itemType, itemId) => {
    setRestoringItems(prev => ({ ...prev, [`${itemType}_${itemId}`]: true }));
    try {
      const requestBody = {
        backup_id: selectedRecord.backup_id,
        conflict_resolution: 'restore_item',
        item_type: itemType,
        item_id: itemId,
        existing_user_id: conflictData?.existing_user_id || null,
      };

      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.id) {
        headers['X-User-Id'] = user.id.toString();
      }
      
      const response = await fetch(`${API_BASE_URL}/restore_deleted_record.php`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();

      if (data.success) {
        setToast({ show: true, message: data.message, type: 'success' });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
        
        // Refresh deleted records list
        await fetchDeletedRecords();
        
        // Re-trigger restore to get updated conflict data
        setTimeout(async () => {
          try {
            const refreshResponse = await fetch(`${API_BASE_URL}/restore_deleted_record.php`, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({
                backup_id: selectedRecord.backup_id,
              }),
            });
            const refreshData = await refreshResponse.json();
            if (refreshData.requires_resolution) {
              setConflictData(refreshData);
            } else {
              // All items restored, close dialog
              setShowConflictDialog(false);
              setConflictData(null);
              setShowRestoreDialog(false);
            }
          } catch (err) {
            console.error('Error refreshing conflict data:', err);
          }
        }, 500);
      } else {
        setToast({ show: true, message: data.message, type: 'error' });
        setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
      }
    } catch (error) {
      setToast({ show: true, message: 'Error restoring item: ' + error.message, type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
    } finally {
      setRestoringItems(prev => {
        const newState = { ...prev };
        delete newState[`${itemType}_${itemId}`];
        return newState;
      });
    }
  };

  const handleConflictResolution = async (resolution) => {
    setLoading(true);
    try {
      const requestBody = {
        backup_id: selectedRecord.backup_id,
        conflict_resolution: resolution,
      };

      if (resolution === 'migrate' && conflictData.conflicts) {
        // User needs to select which items to migrate
        // For simplicity, we'll migrate all by default
        const migrateItems = {
          lots: conflictData.old_data.related.lots.map((l) => l.id),
          deceased: conflictData.old_data.related.deceased.map((d) => d.id),
        };
        requestBody.migrate_items = migrateItems;
      }

      if (conflictData.requires_alternative && selectedAlternatives[selectedRecord.record_id]) {
        requestBody.alternative_lot_id = selectedAlternatives[selectedRecord.record_id];
      }

      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.id) {
        headers['X-User-Id'] = user.id.toString();
      }
      
      const response = await fetch(`${API_BASE_URL}/restore_deleted_record.php`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });
      const data = await response.json();

      if (data.success) {
        setToast({ show: true, message: data.message, type: 'success' });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
        fetchDeletedRecords();
        setShowConflictDialog(false);
        setConflictData(null);
        setAlternativeLots([]);
      } else {
        setToast({ show: true, message: data.message, type: 'error' });
        setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
      }
    } catch (error) {
      setToast({ show: true, message: 'Error resolving conflict: ' + error.message, type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
    }
    setLoading(false);
  };

  const handleUpdateSettings = async (key, value) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.id) {
        headers['X-User-Id'] = user.id.toString();
      }
      
      const response = await fetch(`${API_BASE_URL}/update_retention_settings.php`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ setting_key: key, setting_value: value }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ show: true, message: 'Settings updated successfully', type: 'success' });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
        fetchSettings();
      } else {
        setToast({ show: true, message: data.message, type: 'error' });
        setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
      }
    } catch (error) {
      setToast({ show: true, message: 'Error updating settings: ' + error.message, type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Are you sure you want to permanently delete all expired backups? This cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (user?.id) {
        headers['X-User-Id'] = user.id.toString();
      }
      
      const response = await fetch(`${API_BASE_URL}/cleanup_expired_backups.php`, {
        method: 'POST',
        headers: headers,
      });
      const data = await response.json();
      if (data.success) {
        setToast({ show: true, message: `Cleanup completed. ${data.deleted_count} records permanently deleted.`, type: 'success' });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
        fetchDeletedRecords();
        fetchSettings();
      } else {
        setToast({ show: true, message: data.message, type: 'error' });
        setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
      }
    } catch (error) {
      setToast({ show: true, message: 'Error during cleanup: ' + error.message, type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: 'error' }), 3000);
    }
    setLoading(false);
  };

  const filterRecords = (records) => {
    if (!searchQuery) return records;
    return records.filter((record) =>
      Object.values(record).some((value) =>
        String(value).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  };

  const handleSort = (tabKey, columnKey) => {
    setSortConfig((prev) => {
      const current = prev[tabKey] || { key: null, direction: 'asc' };
      const direction =
        current.key === columnKey && current.direction === 'asc' ? 'desc' : 'asc';
      return { ...prev, [tabKey]: { key: columnKey, direction } };
    });
  };

  const getValueForSort = (tabKey, columnKey, record) => {
    switch (tabKey) {
      case 'users':
        if (columnKey === 'username') return (record.username || '').toLowerCase();
        if (columnKey === 'full_name') {
          return `${record.full_name || ''}`.toLowerCase();
        }
        if (columnKey === 'email') return (record.email || '').toLowerCase();
        if (columnKey === 'account_type') return (record.account_type || '').toLowerCase();
        if (columnKey === 'deleted_at') return new Date(record.deleted_at || 0).getTime();
        return '';
      case 'lots':
        if (columnKey === 'lot_location') return (record.lot_location || '').toLowerCase();
        if (columnKey === 'owner_name') return (record.owner_name || '').toLowerCase();
        if (columnKey === 'owner_username') return (record.owner_username || '').toLowerCase();
        if (columnKey === 'owner_email') return (record.owner_email || '').toLowerCase();
        if (columnKey === 'deleted_at') return new Date(record.deleted_at || 0).getTime();
        return '';
      case 'deceased':
        if (columnKey === 'name') return (record.name || '').toLowerCase();
        if (columnKey === 'date_of_death') return new Date(record.date_of_death || 0).getTime();
        if (columnKey === 'burial_date') return new Date(record.burial_date || 0).getTime();
        if (columnKey === 'owner_username') return (record.owner_username || '').toLowerCase();
        if (columnKey === 'owner_email') return (record.owner_email || '').toLowerCase();
        if (columnKey === 'lot_location') return (record.lot_location || '').toLowerCase();
        if (columnKey === 'deleted_at') return new Date(record.deleted_at || 0).getTime();
        return '';
      default:
        return '';
    }
  };

  const getSortedRecords = (tabKey) => {
    const records = filterRecords(deletedRecords[tabKey] || []);
    const { key, direction } = sortConfig[tabKey] || {};
    if (!key) return records;
    return [...records].sort((a, b) => {
      const aVal = getValueForSort(tabKey, key, a);
      const bVal = getValueForSort(tabKey, key, b);

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const renderSortIcon = (tabKey, columnKey) => {
    if ((sortConfig[tabKey] || {}).key !== columnKey) return null;
    return sortConfig[tabKey].direction === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4 text-blue-gray-400" />
    ) : (
      <ChevronDownIcon className="h-4 w-4 text-blue-gray-400" />
    );
  };

  const getRetentionLabel = (days) => {
    if (days === '0') return 'Keep Forever';
    if (days === '7') return '1 Week';
    if (days === '30') return '1 Month';
    if (days === '365') return '1 Year';
    if (days === '1095') return '3 Years';
    return `${days} Days`;
  };

  const tabs = [
    { label: 'Users', value: 'users', icon: UserIcon },
    { label: 'Lot Ownership', value: 'lots', icon: HomeIcon },
    { label: 'Deceased Records', value: 'deceased', icon: UserGroupIcon },
  ];

  return (
    <div className="mt-12">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <Typography variant="h3" color="blue-gray">
            Backup & Recovery
          </Typography>
          <Typography color="gray" className="mt-1 font-normal">
            Manage and restore deleted records
          </Typography>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Button
            variant="outlined"
            size="sm"
            onClick={() => setShowSettingsDialog(true)}
            className="flex items-center justify-center gap-2"
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4" />
            Settings
          </Button>
          <Button
            variant="gradient"
            size="sm"
            onClick={fetchDeletedRecords}
            className="flex items-center justify-center gap-2"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardBody className="p-4">
            <Typography color="gray" className="text-sm font-medium">
              Total Backups
            </Typography>
            <Typography variant="h4" color="blue-gray">
              {stats.total_backups || 0}
            </Typography>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <Typography color="gray" className="text-sm font-medium">
              Expired Backups
            </Typography>
            <Typography variant="h4" color="orange">
              {stats.expired_backups || 0}
            </Typography>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <Typography color="gray" className="text-sm font-medium">
              Retention Period
            </Typography>
            <Typography variant="h5" color="blue-gray">
              {getRetentionLabel(settings.backup_retention_days?.value || '30')}
            </Typography>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Typography color="gray" className="text-sm font-medium">
                Auto Cleanup
              </Typography>
              <Chip
                value={settings.auto_cleanup_enabled?.value === '1' ? 'Enabled' : 'Disabled'}
                color={settings.auto_cleanup_enabled?.value === '1' ? 'green' : 'red'}
                size="sm"
                className="mt-2"
              />
            </div>
            {stats.expired_backups > 0 && (
              <Button size="sm" color="red" onClick={handleCleanup} className="w-full sm:w-auto">
                Cleanup Now
              </Button>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader floated={false} shadow={false} className="rounded-none">
          <div className="mb-4 flex flex-col justify-between gap-8 md:flex-row md:items-center">
            <div className="w-full md:w-72">
              <Input
                label="Search"
                icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardBody className="overflow-x-auto px-0 pt-0 pb-2">
          <Tabs value={activeTab} onChange={(value) => setActiveTab(value)}>
            <TabsHeader>
              {tabs.map(({ label, value, icon: Icon }) => (
                <Tab key={value} value={value}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {label}
                  </div>
                </Tab>
              ))}
            </TabsHeader>
            <TabsBody>
              {/* Users Tab */}
              <TabPanel value="users" className="p-0">
                <div className="max-h-[450px] overflow-y-auto">
                <table className="w-full min-w-max table-auto text-left">
                  <thead>
                    <tr>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('users', 'username')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Username
                          </Typography>
                          {renderSortIcon('users', 'username')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('users', 'full_name')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Full Name
                          </Typography>
                          {renderSortIcon('users', 'full_name')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('users', 'email')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Email
                          </Typography>
                          {renderSortIcon('users', 'email')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('users', 'account_type')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Account Type
                          </Typography>
                          {renderSortIcon('users', 'account_type')}
                        </div>
                      </th>
                      <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                        <Typography variant="small" color="blue-gray" className="font-bold">
                          Related Data
                        </Typography>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('users', 'deleted_at')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Deleted
                          </Typography>
                          {renderSortIcon('users', 'deleted_at')}
                        </div>
                      </th>
                      <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                        <Typography variant="small" color="blue-gray" className="font-bold">
                          Actions
                        </Typography>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedRecords('users').length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-8 text-center">
                          <Typography color="gray" variant="small">
                            {searchQuery ? 'No records match your search' : 'No deleted users found'}
                          </Typography>
                        </td>
                      </tr>
                    ) : (
                      getSortedRecords('users').map((record, index) => (
                      <tr key={index}>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.username}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.full_name || 'N/A'}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.email}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Chip 
                            value={record.account_type || 'customer'} 
                            size="sm"
                            color={
                              record.account_type === 'admin' ? 'red' : 
                              record.account_type === 'staff' ? 'blue' : 
                              record.account_type === 'cashier' ? 'green' : 
                              'gray'
                            }
                          />
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <div className="flex gap-2">
                            {record.account_type === 'customer' ? (
                              <>
                                <Chip value={`${record.related_records.lots_count} Lots`} size="sm" />
                                <Chip value={`${record.related_records.deceased_count} Deceased`} size="sm" />
                              </>
                            ) : (
                              <Chip value="No related records" size="sm" color="gray" />
                            )}
                          </div>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="gray">
                            {new Date(record.deleted_at).toLocaleString()}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Tooltip content="Restore">
                            <IconButton
                              variant="text"
                              color="blue"
                              onClick={() => handleRestore(record)}
                              disabled={!record.can_restore}
                            >
                              <ArrowPathIcon className="h-5 w-5" />
                            </IconButton>
                          </Tooltip>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
                </div>
              </TabPanel>

              {/* Lots Tab */}
              <TabPanel value="lots" className="p-0">
                <div className="max-h-[450px] overflow-y-auto">
                <table className="w-full min-w-max table-auto text-left">
                  <thead>
                    <tr>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('lots', 'lot_location')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Lot Location
                          </Typography>
                          {renderSortIcon('lots', 'lot_location')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('lots', 'owner_name')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Owner Name
                          </Typography>
                          {renderSortIcon('lots', 'owner_name')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('lots', 'owner_username')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Username
                          </Typography>
                          {renderSortIcon('lots', 'owner_username')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('lots', 'owner_email')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Email
                          </Typography>
                          {renderSortIcon('lots', 'owner_email')}
                        </div>
                      </th>
                      <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                        <Typography variant="small" color="blue-gray" className="font-bold">
                          Related Data
                        </Typography>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('lots', 'deleted_at')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Deleted
                          </Typography>
                          {renderSortIcon('lots', 'deleted_at')}
                        </div>
                      </th>
                      <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                        <Typography variant="small" color="blue-gray" className="font-bold">
                          Actions
                        </Typography>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedRecords('lots').length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-8 text-center">
                          <Typography color="gray" variant="small">
                            {searchQuery ? 'No records match your search' : 'No deleted lot ownerships found'}
                          </Typography>
                        </td>
                      </tr>
                    ) : (
                      getSortedRecords('lots').map((record, index) => (
                      <tr key={index}>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.lot_location}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.owner_name}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.owner_username || 'N/A'}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.owner_email || 'N/A'}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <div className="flex gap-2">
                            <Chip value={`${record.related_records.deceased_count} Deceased`} size="sm" />
                            <Chip value={`${record.related_records.payments_count} Payments`} size="sm" />
                          </div>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="gray">
                            {new Date(record.deleted_at).toLocaleString()}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Tooltip content="Restore">
                            <IconButton
                              variant="text"
                              color="blue"
                              onClick={() => handleRestore(record)}
                              disabled={!record.can_restore}
                            >
                              <ArrowPathIcon className="h-5 w-5" />
                            </IconButton>
                          </Tooltip>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
                </div>
              </TabPanel>

              {/* Deceased Tab */}
              <TabPanel value="deceased" className="p-0">
                <div className="max-h-[450px] overflow-y-auto">
                <table className="w-full min-w-max table-auto text-left">
                  <thead>
                    <tr>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('deceased', 'name')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Name
                          </Typography>
                          {renderSortIcon('deceased', 'name')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('deceased', 'date_of_death')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Date of Death
                          </Typography>
                          {renderSortIcon('deceased', 'date_of_death')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('deceased', 'burial_date')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Burial Date
                          </Typography>
                          {renderSortIcon('deceased', 'burial_date')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('deceased', 'owner_username')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Owner Username
                          </Typography>
                          {renderSortIcon('deceased', 'owner_username')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('deceased', 'owner_email')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Owner Email
                          </Typography>
                          {renderSortIcon('deceased', 'owner_email')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('deceased', 'lot_location')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Lot Location
                          </Typography>
                          {renderSortIcon('deceased', 'lot_location')}
                        </div>
                      </th>
                      <th
                        className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4 cursor-pointer hover:bg-blue-gray-50 transition-colors"
                        onClick={() => handleSort('deceased', 'deleted_at')}
                      >
                        <div className="flex items-center gap-1">
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            Deleted
                          </Typography>
                          {renderSortIcon('deceased', 'deleted_at')}
                        </div>
                      </th>
                      <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                        <Typography variant="small" color="blue-gray" className="font-bold">
                          Actions
                        </Typography>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedRecords('deceased').length === 0 ? (
                      <tr>
                        <td colSpan="8" className="p-8 text-center">
                          <Typography color="gray" variant="small">
                            {searchQuery ? 'No records match your search' : 'No deleted deceased records found'}
                          </Typography>
                        </td>
                      </tr>
                    ) : (
                      getSortedRecords('deceased').map((record, index) => (
                      <tr key={index}>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.name}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.date_of_death}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.burial_date || 'N/A'}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.owner_username || 'N/A'}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.owner_email || 'N/A'}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="blue-gray">
                            {record.lot_location || 'N/A'}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Typography variant="small" color="gray">
                            {new Date(record.deleted_at).toLocaleString()}
                          </Typography>
                        </td>
                        <td className="p-4 border-b border-blue-gray-50">
                          <Tooltip content="Restore">
                            <IconButton
                              variant="text"
                              color="blue"
                              onClick={() => handleRestore(record)}
                              disabled={!record.can_restore}
                            >
                              <ArrowPathIcon className="h-5 w-5" />
                            </IconButton>
                          </Tooltip>
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
                </div>
              </TabPanel>
            </TabsBody>
          </Tabs>
        </CardBody>
      </Card>

      {/* Restore Confirmation Dialog */}
      <Dialog open={showRestoreDialog} handler={() => setShowRestoreDialog(false)}>
        <DialogHeader>Confirm Restore</DialogHeader>
        <DialogBody>
          Are you sure you want to restore this record? All related data will be restored as well.
        </DialogBody>
        <DialogFooter>
          <Button variant="text" color="gray" onClick={() => setShowRestoreDialog(false)} className="mr-2">
            Cancel
          </Button>
          <Button variant="gradient" color="green" onClick={confirmRestore} disabled={loading}>
            {loading ? 'Restoring...' : 'Restore'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Conflict Resolution Dialog */}
      <Dialog
        open={showConflictDialog}
        handler={() => setShowConflictDialog(false)}
        size="lg"
      >
        <DialogHeader>
          {conflictData?.conflicts ? 'Account Conflict Detected' : 'Lot Not Available'}
        </DialogHeader>
        <DialogBody divider className="max-h-[60vh] overflow-y-auto">
          {conflictData?.conflicts && (
            <div>
              <Typography color="red" className="mb-4">
                There is already an existing user created with the same username and email. Please review the lots and deceased records below. If there is any related data, you can restore it to that user.
              </Typography>
              
              {/* Lots Section */}
              {conflictData.old_data?.lots && conflictData.old_data.lots.length > 0 && (
                <div className="mb-4">
                  <Typography variant="h6" className="mb-2">
                    Lots ({conflictData.old_data.lots.length}):
                  </Typography>
                  <div className="space-y-2">
                    {conflictData.old_data.lots.map((lot) => (
                      <div
                        key={lot.id}
                        className={`p-3 border rounded ${
                          lot.can_restore ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Typography variant="small" className="font-semibold">
                              {lot.lot_location || lot.display_name}
                            </Typography>
                            {!lot.can_restore && lot.reason && (
                              <Typography variant="small" color="red" className="mt-1">
                                {lot.reason}
                              </Typography>
                            )}
                          </div>
                          <Button
                            size="sm"
                            color={lot.can_restore ? 'green' : 'gray'}
                            onClick={() => handleRestoreIndividualItem('lot', lot.id)}
                            disabled={!lot.can_restore || restoringItems[`lot_${lot.id}`]}
                            className="ml-2"
                          >
                            {restoringItems[`lot_${lot.id}`] ? 'Restoring...' : 'Restore'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Deceased Section */}
              {conflictData.old_data?.deceased && conflictData.old_data.deceased.length > 0 && (
                <div className="mb-4">
                  <Typography variant="h6" className="mb-2">
                    Deceased Records ({conflictData.old_data.deceased.length}):
                  </Typography>
                  <div className="space-y-2">
                    {conflictData.old_data.deceased.map((deceased) => (
                      <div
                        key={deceased.id}
                        className={`p-3 border rounded ${
                          deceased.can_restore ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Typography variant="small" className="font-semibold">
                              {deceased.name}
                            </Typography>
                            {deceased.lot_location && (
                              <Typography variant="small" color="gray" className="mt-1">
                                Location: {deceased.lot_location}
                              </Typography>
                            )}
                            {!deceased.can_restore && deceased.reason && (
                              <Typography variant="small" color="red" className="mt-1">
                                {deceased.reason}
                              </Typography>
                            )}
                          </div>
                          <Button
                            size="sm"
                            color={deceased.can_restore ? 'green' : 'gray'}
                            onClick={() => handleRestoreIndividualItem('deceased', deceased.id)}
                            disabled={!deceased.can_restore || restoringItems[`deceased_${deceased.id}`]}
                            className="ml-2"
                          >
                            {restoringItems[`deceased_${deceased.id}`] ? 'Restoring...' : 'Restore'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {( !conflictData.old_data?.lots || conflictData.old_data.lots.length === 0 ) &&
               ( !conflictData.old_data?.deceased || conflictData.old_data.deceased.length === 0 ) && (
                <Typography color="gray" className="mb-4">
                  No related data to restore.
                </Typography>
              )}
            </div>
          )}
          {conflictData?.requires_alternative && alternativeLots.length > 0 && (
            <div>
              <Typography color="orange" className="mb-4">
                The original lot is no longer available. Please select an alternative lot of the same type.
              </Typography>
              <Select
                label="Select Alternative Lot"
                value={selectedAlternatives[selectedRecord?.record_id] || ''}
                onChange={(value) =>
                  setSelectedAlternatives({
                    ...selectedAlternatives,
                    [selectedRecord.record_id]: value,
                  })
                }
              >
                {alternativeLots.map((lot) => (
                  <Option key={lot.id} value={lot.id.toString()}>
                    {lot.display_name} ({lot.lot_type})
                  </Option>
                ))}
              </Select>
            </div>
          )}
          {conflictData?.requires_alternative && alternativeLots.length === 0 && (
            <Typography color="red">
              No alternative lots of the same type are available. Cannot restore this lot ownership.
            </Typography>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="text"
            color="gray"
            onClick={() => setShowConflictDialog(false)}
            disabled={loading}
          >
            Close
          </Button>
          {conflictData?.requires_alternative && alternativeLots.length > 0 && (
            <Button
              variant="gradient"
              color="green"
              onClick={() => handleConflictResolution('restore')}
              disabled={loading || !selectedAlternatives[selectedRecord?.record_id]}
            >
              Restore to Selected Lot
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} handler={() => setShowSettingsDialog(false)}>
        <DialogHeader>Backup & Recovery Settings</DialogHeader>
        <DialogBody divider>
          <div className="space-y-4">
            <div>
              <Typography variant="h6" className="mb-2">
                Retention Period
              </Typography>
              <Select
                label="How long to keep deleted records"
                value={settings.backup_retention_days?.value || '30'}
                onChange={(value) => handleUpdateSettings('backup_retention_days', value)}
              >
                <Option value="7">1 Week</Option>
                <Option value="30">1 Month</Option>
                <Option value="365">1 Year</Option>
                <Option value="1095">3 Years</Option>
                <Option value="0">Keep Forever</Option>
              </Select>
              <Typography variant="small" color="gray" className="mt-1">
                Records older than this period will be permanently deleted.
              </Typography>
            </div>
            <div>
              <Typography variant="h6" className="mb-2">
                Auto Cleanup
              </Typography>
              <Select
                label="Automatically delete expired backups"
                value={settings.auto_cleanup_enabled?.value || '1'}
                onChange={(value) => handleUpdateSettings('auto_cleanup_enabled', value)}
              >
                <Option value="1">Enabled</Option>
                <Option value="0">Disabled</Option>
              </Select>
              <Typography variant="small" color="gray" className="mt-1">
                When enabled, expired backups will be automatically deleted.
              </Typography>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="gradient" color="blue" onClick={() => setShowSettingsDialog(false)}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Toast Notification */}
      {toast.show && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setToast({ show: false, message: '', type: 'success' })}
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

export default BackupRecovery;

