import React, { useState, useEffect } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Input,
  Chip,
} from "@material-tailwind/react";
import {
  ClockIcon,
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { API_ENDPOINTS } from "@/configs/api";
import { useAuth } from "@/context/AuthContext";

// Helper function to capitalize first letter
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export function ActivityLog() {
  const { user } = useAuth();
  const [activityLogs, setActivityLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortFilter, setSortFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  useEffect(() => {
    const fetchActivityLogs = async () => {
      try {
        setLoading(true);
        // Get user ID from localStorage or context (admin can see all, but still pass ID for consistency)
        const currentUser = user || JSON.parse(localStorage.getItem('user') || '{}');
        const userId = currentUser?.id;
        
        const headers = {};
        if (userId) {
          headers['X-User-Id'] = userId.toString();
        }
        
        const response = await fetch(API_ENDPOINTS.GET_ACTIVITY_LOGS, {
          headers: headers
        });
        const data = await response.json();
        if (data.success) {
          setActivityLogs(data.activityLogs);
          setFilteredLogs(data.activityLogs);
        } else {
          console.error('Failed to fetch activity logs:', data.message);
        }
      } catch (error) {
        console.error('Error fetching activity logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivityLogs();
  }, [user]);

  // Sort handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Filter and search logic
  useEffect(() => {
    let filtered = activityLogs;

    // Filter by role/type
    if (sortFilter !== "all") {
      if (sortFilter === "login") {
        filtered = filtered.filter(log => 
          log.action === "Logged In" ||
          log.action === "Logged Out" ||
          log.type.toLowerCase().includes("user") && log.details.toLowerCase().includes("logged")
        );
      } else {
        filtered = filtered.filter(log => 
          log.user.toLowerCase().includes(sortFilter) ||
          log.type.toLowerCase().includes(sortFilter)
        );
      }
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(log => {
        const dateStr = new Date(log.timestamp).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }).toLowerCase();
        const timeStr = new Date(log.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).toLowerCase();
        return log.action.toLowerCase().includes(searchLower) ||
          log.type.toLowerCase().includes(searchLower) ||
          log.details.toLowerCase().includes(searchLower) ||
          log.user.toLowerCase().includes(searchLower) ||
          dateStr.includes(searchLower) ||
          timeStr.includes(searchLower);
      });
    }

    // Apply sorting
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal, bVal;
        
        switch (sortConfig.key) {
          case 'timestamp':
            aVal = new Date(a.timestamp || '1970-01-01').getTime();
            bVal = new Date(b.timestamp || '1970-01-01').getTime();
            break;
          case 'action':
            aVal = (a.action || '').toLowerCase();
            bVal = (b.action || '').toLowerCase();
            break;
          case 'type':
            aVal = (a.type || '').toLowerCase();
            bVal = (b.type || '').toLowerCase();
            break;
          case 'details':
            aVal = (a.details || '').toLowerCase();
            bVal = (b.details || '').toLowerCase();
            break;
          case 'user':
            aVal = (a.user || '').toLowerCase();
            bVal = (b.user || '').toLowerCase();
            break;
          default:
            return 0;
        }
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredLogs(filtered);
  }, [activityLogs, searchTerm, sortFilter, sortConfig]);

  if (loading) {
    return (
      <div className="mt-12">
        <Typography variant="h4" color="blue-gray" className="font-bold mb-2">
          Loading activity logs...
        </Typography>
      </div>
    );
  }

  return (
    <div className="mt-12 mb-8 flex flex-col gap-12">
      {/* Activity Log Card */}
      <Card>
        <CardHeader
          floated={false}
          shadow={false}
          color="transparent"
          className="m-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6"
        >
          <Typography variant="h5" color="blue-gray" className="mb-1">
            Activity Log
          </Typography>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:w-auto">
            <div className="w-full sm:w-48">
              <select
                value={sortFilter}
                onChange={(e) => setSortFilter(e.target.value)}
                className="w-full px-3 py-2 border border-blue-gray-200 rounded-lg bg-white text-blue-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All</option>
                <option value="admin">Admin</option>
                <option value="cashier">Cashier</option>
                <option value="staff">Staff</option>
                <option value="login">Logged</option>
              </select>
            </div>
            <div className="w-full sm:w-72">
              <Input
                label="Search Activities"
                icon={<MagnifyingGlassIcon className="h-5 w-5" />}
                value={searchTerm}
                onChange={(e) => {
                  const filtered = e.target.value.replace(/[^A-Za-z0-9\s\/\-\:]/g, '');
                  setSearchTerm(filtered);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardBody className="px-0 pt-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] table-auto">
              <thead>
                <tr>
                  {[
                    { key: 'timestamp', label: 'Timestamp' },
                    { key: 'action', label: 'Action' },
                    { key: 'type', label: 'Type' },
                    { key: 'details', label: 'Details' },
                    { key: 'user', label: 'Performed By' }
                  ].map((col) => (
                    <th
                      key={col.key}
                      className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center gap-1">
                        <Typography
                          variant="small"
                          className="text-[11px] font-medium uppercase text-blue-gray-400"
                        >
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
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                        {searchTerm || sortFilter !== "all" ? "No results found" : "No activity logs available"}
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(
                    ({ id, timestamp, action, type, details, user }, key) => {
                    const performerName = capitalizeFirst(user || 'System');
                    const performerInitial = performerName.charAt(0).toUpperCase() || 'S';
                    const className = `py-3 px-5 ${
                      key === filteredLogs.length - 1
                        ? ""
                        : "border-b border-blue-gray-50"
                    }`;
                    // Color for action chip
                    let chipColor = "gray";
                    if (action === "Created") chipColor = "green";
                    else if (action === "Updated") chipColor = "amber";
                    else if (action === "Deleted") chipColor = "red";
                    else if (action === "Logged In") chipColor = "blue";
                    else if (action === "Logged Out") chipColor = "purple";
                    else if (action === "Payment") chipColor = "green";
                    else if (action === "Pay") chipColor = "green";
                    else if (action === "Search") chipColor = "blue";
                    else if (action === "Export") chipColor = "indigo";
                    return (
                      <tr key={id} className="hover:bg-blue-50 transition-colors">
                        <td className={className}>
                            <div className="flex items-center gap-4">
                              <ClockIcon className="h-4 w-4 text-blue-gray-500" />
                              <div>
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-normal"
                                >
                                  {new Date(timestamp).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </Typography>
                                <Typography
                                  variant="small"
                                  color="blue-gray"
                                  className="font-normal opacity-70 text-xs"
                                >
                                  {new Date(timestamp).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </Typography>
                              </div>
                            </div>
                        </td>
                        <td className={className + " text-center"}>
                          <Chip
                            variant="filled"
                            color={chipColor}
                            value={capitalizeFirst(action)}
                            className="w-20 mx-auto text-xs font-semibold shadow-sm border border-blue-gray-100"
                          />
                        </td>
                        <td className={className}>
                            <Typography
                              variant="small"
                              className="text-xs font-medium text-blue-gray-600"
                            >
                              {type === 'User' ? 'User Account' : 
                               type === 'Customer' ? 'Customer Record' :
                               type === 'Lot' ? 'Lot Management' :
                               type === 'Ownership' ? 'Lot Management' :
                               type === 'Deceased' ? 'Deceased Record' :
                               type === 'Staff' ? 'Staff Account' :
                               type === 'System' ? 'System Activity' :
                               type === 'Payment' ? 'Payment Transaction' :
                               type === 'Payment Monitoring' ? 'Payment Monitoring' :
                               type === 'Payment Plan' ? 'Payment Transaction' :
                               type === 'Report' ? 'Report Generation' :
                               type === 'Login' ? 'Authentication' :
                               type === 'Configuration' ? 'System Configuration' :
                               type === 'Payment Session' ? 'Payment Session' :
                               type === 'F2F Payment Processed' ? 'Payment Transaction' :
                               type === 'Payment Processed' ? 'Payment Transaction' :
                               type === 'Payment Completed' ? 'Payment Transaction' :
                               type === 'Payment Synced from Paymongo' ? 'Payment Transaction' :
                               type === 'Payment Auto-Synced from Paymongo' ? 'Payment Transaction' :
                               type === 'Logged In' ? 'Authentication' :
                               type === 'Logged Out' ? 'Authentication' :
                               type || 'Unknown'}
                            </Typography>
                        </td>
                        <td className={className}>
                          <Typography
                            variant="small"
                            className="text-xs font-medium text-blue-gray-600 max-w-xs truncate"
                            title={details}
                          >
                            {capitalizeFirst(details)}
                          </Typography>
                        </td>
                        <td className={className}>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-gray-100 flex items-center justify-center">
                              <Typography
                                variant="small"
                                className="text-xs font-bold text-blue-gray-600"
                              >
                                {performerInitial}
                              </Typography>
                            </div>
                            <Typography
                              variant="small"
                              className="text-xs font-medium text-blue-gray-600"
                            >
                              {performerName}
                            </Typography>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default ActivityLog; 