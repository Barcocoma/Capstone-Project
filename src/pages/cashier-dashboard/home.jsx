import React, { useState, useEffect } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  Chip,
} from "@material-tailwind/react";
import {
  MapIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ClipboardDocumentListIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/configs/api";

// Helper function to capitalize first letter
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

function StatCard({ color, icon, title, value }) {
  return (
    <Card className="border border-blue-gray-100 shadow-sm">
      <CardBody className="p-4 flex items-center gap-3">
        <div className={`rounded-lg bg-${color}-100 p-3`}>{icon}</div>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <Typography variant="small" color="blue-gray" className="font-medium truncate">
            {title}
          </Typography>
          <Typography variant="h5" color="blue-gray" className="font-bold text-left sm:text-right text-base sm:text-xl">
            {value}
          </Typography>
        </div>
      </CardBody>
    </Card>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueLots, setOverdueLots] = useState([]);

  // Load overdue payments count
  useEffect(() => {
    const loadOverdueCount = async () => {
      try {
        const response = await fetch('/api/get_overdue_count.php');
        const data = await response.json();
        if (data.success) {
          setOverdueCount(data.overdue_count || 0);
        }
      } catch (error) {
        console.error('Error loading overdue count:', error);
      }
    };

    const loadOverdueLots = async () => {
      try {
        const response = await fetch('/api/get_overdue_payments.php');
        const data = await response.json();
        if (data.success) {
          setOverdueLots(data.overdue_lots || []);
        }
      } catch (error) {
        console.error('Error loading overdue lots:', error);
      }
    };

    loadOverdueCount();
    loadOverdueLots();
    loadRecentActivities();
  }, []);

  // Load recent activities
  const loadRecentActivities = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.GET_ACTIVITY_LOGS);
      const data = await response.json();
      if (data.success) {
        // Get the 3 most recent activities
        const recent = data.activityLogs.slice(0, 3).map(log => {
          // Format date and time
          const date = new Date(log.timestamp);
          const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          const formattedTime = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });

          return {
            time: `${formattedDate} ${formattedTime}`,
            message: capitalizeFirst(log.details),
            action: capitalizeFirst(log.action),
            user: log.user || 'System'
          };
        });
        setRecentPayments(recent);
      }
    } catch (error) {
      console.error('Error loading recent activities:', error);
    }
  };

  // Example stats for cashier
  const statistics = [
    {
      color: "green",
      icon: <CurrencyDollarIcon className="h-6 w-6 text-green-500" />,
      title: "Total Collected Today",
      value: "₱15,000",
    },
    {
      color: "blue",
      icon: <UserGroupIcon className="h-6 w-6 text-blue-500" />,
      title: "Customers Served",
      value: "8",
    },
    {
      color: "red",
      icon: <ExclamationCircleIcon className="h-6 w-6 text-red-500" />,
      title: "Overdue Payments",
      value: overdueCount.toString(),
    },
    {
      color: "purple",
      icon: <ClipboardDocumentListIcon className="h-6 w-6 text-purple-500" />,
      title: "Transactions",
      value: "12",
    },
  ];

  // Recent payments from API
  const [recentPayments, setRecentPayments] = useState([]);

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div className="space-y-1">
          <Typography variant="h4" color="blue-gray" className="font-bold">
            Welcome, {user?.username || 'Cashier'}
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Divine Life Memorial Park - Cashier Dashboard
          </Typography>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-12 grid gap-y-10 gap-x-6 md:grid-cols-2 xl:grid-cols-4">
        {statistics.map((props) => (
          <StatCard key={props.title} {...props} />
        ))}
      </div>

      {/* Main content: Map View and Quick Links */}
      <div className="mb-12 grid grid-cols-1 gap-y-12 gap-x-6 lg:grid-cols-2">
        {/* Map View */}
        <Card>
          <CardHeader variant="gradient" color="blue" className="mb-8 p-6">
            <Typography variant="h6" color="white">Cemetery Map View</Typography>
          </CardHeader>
          <CardBody className="p-0 px-6 pb-6">
            <div className="relative h-80 w-full overflow-hidden rounded-xl bg-blue-gray-50 flex items-center justify-center">
              <img src="/img/MAP WITH LABEL.png" alt="Cemetery Map" className="h-full w-full object-contain" style={{ maxHeight: 320 }} />
              <div className="absolute bottom-4 left-4">
                <Button color="blue" size="sm" onClick={() => navigate("/dashboard/lot-map")}>Open Full Map View</Button>
              </div>
            </div>
          </CardBody>
        </Card>
        {/* Quick Links */}
        <Card>
          <CardHeader variant="gradient" color="blue" className="mb-8 p-6">
            <Typography variant="h6" color="white">Quick Links</Typography>
          </CardHeader>
          <CardBody className="px-6 pt-0 flex flex-col gap-4">
            <Button color="green" className="flex items-center gap-3" onClick={() => navigate("/dashboard/payments")}>Process Payment</Button>
            <Button color="blue" className="flex items-center gap-3" onClick={() => navigate("/cashier-customers")}>Find Customer</Button>
            <Button color="purple" className="flex items-center gap-3" onClick={() => navigate("/dashboard/reports")}>View Reports</Button>
          </CardBody>
        </Card>
      </div>

      {/* Overdue Payments Alert */}
      {overdueCount > 0 && (
        <div className="mb-12">
          <Card>
            <CardHeader variant="gradient" color="red" className="mb-8 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Typography variant="h6" color="white">Overdue Payments Alert</Typography>
                <Chip value={`${overdueCount} overdue`} color="white" className="font-bold" />
              </div>
            </CardHeader>
            <CardBody className="px-6 pt-0">
              <Typography variant="small" color="blue-gray" className="mb-4">
                There are {overdueCount} customers with overdue payments that need attention.
              </Typography>
              <Button 
                color="red" 
                variant="outlined" 
                className="flex items-center gap-2" 
                onClick={() => navigate("/cashier-customers")}
              >
                <ExclamationTriangleIcon className="h-4 w-4" />
                View Payment Monitoring
              </Button>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Recent Payments */}
      <div className="mb-12">
        <Card>
          <CardHeader variant="gradient" color="blue" className="mb-8 p-6">
            <Typography variant="h6" color="white">Recent Payments</Typography>
          </CardHeader>
          <CardBody className="px-6 pt-0 flex flex-col gap-4">
            {recentPayments.length > 0 ? recentPayments.map((payment, idx) => (
              <div key={idx} className="flex flex-col md:flex-row md:items-center md:gap-4 border-b border-blue-gray-50 py-2 last:border-b-0">
                <Typography variant="small" color="blue-gray" className="font-medium w-48">{payment.time}</Typography>
                <Typography variant="small" color="blue-gray">{payment.message}</Typography>
              </div>
            )) : (
              <div className="py-4 text-center text-gray-500">
                No recent activities found
              </div>
            )}
            <Button variant="text" color="blue" className="mt-4 flex items-center gap-2" onClick={() => navigate("/dashboard/activity-log")}>View All Activity Logs</Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default Home;
