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

  useEffect(() => {
    const fetchActivityLogs = async () => {
      try {
        setLoading(true);
        // Get user ID from localStorage or context
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

  // Filter and search logic
  useEffect(() => {
    let filtered = activityLogs;

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

    setFilteredLogs(filtered);
  }, [activityLogs, searchTerm]);

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
                  {["Timestamp", "Action", "Type", "Details", "Performed By"].map((el) => (
                    <th
                      key={el}
                      className="border-b border-blue-gray-50 py-3 px-6 text-left bg-gray-50"
                    >
                      <Typography
                        variant="small"
                        className="text-[11px] font-medium uppercase text-blue-gray-400"
                      >
                        {el}
                      </Typography>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Typography variant="small" color="blue-gray" className="font-medium opacity-70">
                        {searchTerm ? "No results found" : "No activity logs available"}
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