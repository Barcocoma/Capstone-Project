import React, { useState, useEffect } from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
} from "@material-tailwind/react";
import {
  MapIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ExclamationCircleIcon,
  CalendarIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/configs/api";

// Helper function to capitalize first letter
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const iconBgMap = {
  blue: "bg-blue-100",
  green: "bg-green-100",
  purple: "bg-purple-100",
  red: "bg-red-100",
};

function StatCard({ color, icon, title, value }) {
  const iconWrapperClass = iconBgMap[color] || "bg-blue-100";
  return (
    <Card className="border border-blue-gray-100 shadow-sm">
      <CardBody className="p-4 flex items-center gap-4">
        <div
          className={`rounded-lg ${iconWrapperClass} p-3 flex items-center justify-center h-12 w-12 shrink-0`}
        >
          {icon}
        </div>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <Typography variant="small" color="blue-gray" className="font-medium truncate">
            {title}
          </Typography>
          <Typography variant="h5" color="blue-gray" className="font-bold leading-snug text-left sm:text-right text-base sm:text-xl">
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
  const [dashboardData, setDashboardData] = useState({ totalLots: 0, availableLots: 0, occupiedLots: 0 });
  const [loading, setLoading] = useState(true);

  // Fetch dashboard data from map
  useEffect(() => {
    const fetchFromMap = async () => {
      try {
        setLoading(true);
        const sectorsRes = await fetch(API_ENDPOINTS.MAP_SECTORS_POLY);
        const sectors = await sectorsRes.json();
        const pairs = Array.isArray(sectors) ? sectors.map(s => ({ garden: s.garden, sector: s.sector })) : [];
        let total = 0, available = 0, occupied = 0;
        await Promise.all(pairs.map(async ({ garden, sector }) => {
          try {
            const r = await fetch(`${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(garden)}&sector=${encodeURIComponent(sector)}`);
            const d = await r.json();
            const lots = Array.isArray(d.lots) ? d.lots : [];
            total += lots.length;
            lots.forEach(l => {
              const st = String(l.status || '').toLowerCase();
              if (st === 'occupied') occupied += 1; else if (st === 'reserved') occupied += 1; else available += 1;
            });
          } catch {}
        }));
        setDashboardData({ totalLots: total, availableLots: available, occupiedLots: occupied });
      } catch (e) {
        console.error('Error computing staff dashboard stats from map:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchFromMap();
  }, []);

  // Staff-specific statistics
  const statistics = [
    {
      color: "blue",
      icon: <MapIcon className="h-6 w-6 text-blue-500" />,
      title: "Total Lots",
      value: loading ? "..." : dashboardData.totalLots.toString(),
    },
    {
      color: "green",
      icon: <ClipboardDocumentListIcon className="h-6 w-6 text-green-500" />,
      title: "Available Lots",
      value: loading ? "..." : dashboardData.availableLots.toString(),
    },
    {
      color: "purple",
      icon: <UserGroupIcon className="h-6 w-6 text-purple-500" />,
      title: "Occupied Lots",
      value: loading ? "..." : dashboardData.occupiedLots.toString(),
    },
    // Removed Pending Records box per requirements
  ];

  // Recent activities from API
  const [recentActivities, setRecentActivities] = useState([]);

  // Load recent activities
  const loadRecentActivities = async () => {
    try {
      // Get user ID to filter activities (staff should only see their own)
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
        setRecentActivities(recent);
      }
    } catch (error) {
      console.error('Error loading recent activities:', error);
    }
  };

  useEffect(() => {
    loadRecentActivities();
  }, [user]);

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div className="space-y-1">
          <Typography variant="h4" color="blue-gray" className="font-bold">
            Welcome, {user?.username || 'Staff'}
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Divine Life Memorial Park - Staff Dashboard
          </Typography>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {statistics.map((props) => (
          <StatCard key={props.title} {...props} />
        ))}
      </div>

      {/* Main content: Map View and Quick Links */}
      <div className="mb-12 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Map View */}
        <Card>
          <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
            <Typography variant="h6" color="white">Cemetery Map View</Typography>
          </CardHeader>
          <CardBody className="p-0 px-6 pb-6">
            <div className="relative h-64 w-full overflow-hidden rounded-xl bg-blue-gray-50 flex items-center justify-center md:h-80">
              <img src="/img/MAP WITH LABEL.png" alt="Cemetery Map" className="h-full w-full object-contain" />
              <div className="absolute bottom-4 left-4">
                <Button color="blue" size="sm" className="flex items-center gap-2" onClick={() => navigate("/dashboard/lot-map")}>Open Full Map View</Button>
              </div>
            </div>
          </CardBody>
        </Card>
        {/* Quick Links */}
        <Card className="mt-6 xl:mt-0">
          <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
            <Typography variant="h6" color="white">Quick Links</Typography>
          </CardHeader>
          <CardBody className="px-6 pt-0 flex flex-col gap-3">
            <Button color="green" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/lot-search")}>
              <MapIcon className="h-5 w-5" />
              Search Lots
            </Button>
            <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/deceased-records")}>
              <DocumentTextIcon className="h-5 w-5" />
              Deceased Records
            </Button>
            <Button color="purple" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/activity-log")}>
              <CalendarIcon className="h-5 w-5" />
              Activity Log
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* Recent Activities */}
      <div className="mb-12">
        <Card>
          <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
            <Typography variant="h6" color="white">Recent Activities</Typography>
          </CardHeader>
          <CardBody className="px-4 md:px-6 pt-0 flex flex-col gap-4">
            {recentActivities.length > 0 ? recentActivities.map((activity, idx) => (
              <div key={idx} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 border-b border-blue-gray-50 py-2 last:border-b-0">
                <Typography variant="small" color="blue-gray" className="font-medium md:w-48">{activity.time}</Typography>
                <Typography variant="small" color="blue-gray">{activity.message}</Typography>
              </div>
            )) : (
              <div className="py-4 text-center text-gray-500">
                No recent activities found
              </div>
            )}
            <Button variant="text" color="blue" className="mt-2 flex items-center justify-center gap-2 sm:justify-start" onClick={() => navigate("/dashboard/activity-log")}>View All Activities</Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default Home;
