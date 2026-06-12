import React, { useEffect, useState } from "react";
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
  ExclamationCircleIcon,
  UsersIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/configs/api";

const iconBgMap = {
  blue: "bg-blue-100",
  green: "bg-green-100",
  purple: "bg-purple-100",
  red: "bg-red-100",
  indigo: "bg-indigo-100",
};

// Stat card component for dashboard metrics
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
  const [statistics, setStatistics] = useState([
    { color: "blue",   icon: <MapIcon className="h-6 w-6 text-blue-500" />,  title: "Total Lots",      value: "..." },
    { color: "green",  icon: <MapIcon className="h-6 w-6 text-green-500" />, title: "Available Lots",  value: "..." },
    { color: "purple", icon: <UserGroupIcon className="h-6 w-6 text-purple-500" />, title: "Sold Lots", value: "..." },
    { color: "red",    icon: <ExclamationCircleIcon className="h-6 w-6 text-red-500" />, title: "Overdue Payments", value: "0" },
  ]);

  useEffect(() => {
    const computeFromMap = async () => {
      try {
        const sectorsRes = await fetch(API_ENDPOINTS.MAP_SECTORS_POLY);
        const sectors = await sectorsRes.json();
        const pairs = Array.isArray(sectors) ? sectors.map(s => ({ garden: s.garden, sector: s.sector })) : [];
        let total = 0, available = 0, sold = 0;
        await Promise.all(pairs.map(async ({ garden, sector }) => {
          try {
            const r = await fetch(`${API_ENDPOINTS.MAP_SECTOR_LOTS}?garden=${encodeURIComponent(garden)}&sector=${encodeURIComponent(sector)}`);
            const d = await r.json();
            const lots = Array.isArray(d.lots) ? d.lots : [];
            total += lots.length;
            lots.forEach(l => {
              const st = String(l.status || '').toLowerCase();
              if (st === 'reserved' || st === 'occupied') sold += 1; else available += 1;
            });
          } catch {}
        }));
        // Get overdue payments count
        let overdueCount = 0;
        try {
          const overdueRes = await fetch(`/api/get_overdue_count.php?t=${Date.now()}`);
          const overdueData = await overdueRes.json();
          if (overdueData.success) {
            overdueCount = overdueData.overdue_count || 0;
          }
        } catch (err) {
          console.error('Overdue API Error:', err);
        }

        setStatistics(prev => [
          { ...prev[0], value: String(total) },
          { ...prev[1], value: String(available) },
          { ...prev[2], value: String(sold) },
          { ...prev[3], value: String(overdueCount) },
        ]);
      } catch {}
    };
    computeFromMap();
  }, []);

  // Dummy recent activity - replace with API data
  const recentActivities = [
    {
      time: "2024-06-01 10:30 AM",
      message: "Payment received for Lot #A-101 (Customer: John D.)",
    },
    {
      time: "2024-06-01 09:50 AM",
      message: "Ownership record updated for Lot #B-202 (Staff: Alice W.)",
    },
    {
      time: "2024-05-31 04:15 PM",
      message: "New customer registered: Maria S.",
    },
  ];

  

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div className="space-y-1">
          <Typography variant="h4" color="blue-gray" className="font-bold">
            Welcome, {user?.username || 'User'}
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Divine Life Memorial Park - Dashboard
          </Typography>
        </div>
      </div>

      {user?.user_type === "customer" ? (
        <>
          {/* Stat cards */}
          <div className="mb-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard color="blue" icon={<MapIcon className="h-6 w-6 text-blue-500" />} title="My Lots" value="2" />
            <StatCard color="green" icon={<CurrencyDollarIcon className="h-6 w-6 text-green-500" />} title="Payments Due" value="1" />
          </div>
          {/* Main content: Cemetery Map View and Quick Links */}
          <div className="mb-12 grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Cemetery Map View */}
            <Card>
              <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
                <Typography variant="h6" color="white">Cemetery Map View</Typography>
              </CardHeader>
              <CardBody className="p-0 px-6 pb-6">
                <div className="relative h-64 w-full overflow-hidden rounded-xl bg-blue-gray-50 flex items-center justify-center md:h-80">
                  <img src="/img/MAP WITH LABEL.png" alt="Cemetery Map" className="h-full w-full object-contain" />
                  <div className="absolute bottom-4 left-4">
                    <Button color="blue" size="sm" onClick={() => navigate("/dashboard/lot-map")} className="flex items-center gap-2">
                      Open Full Map View
                    </Button>
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
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/my-lot")}>My Lots</Button>
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/make-payment")}>Make Payment</Button>
              </CardBody>
            </Card>
          </div>
          {/* Recent Payments */}
          <div className="mb-12">
            <Card>
              <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
                <Typography variant="h6" color="white">Recent Payments</Typography>
              </CardHeader>
              <CardBody className="px-4 md:px-6 pt-0 flex flex-col gap-4">
                {/* Example static data for recent payments */}
                <div className="flex flex-col md:flex-row md:items-center md:gap-4 border-b border-blue-gray-50 py-2 last:border-b-0">
                  <Typography variant="small" color="blue-gray" className="font-medium md:w-48">2024-06-01 10:30 AM</Typography>
                  <Typography variant="small" color="blue-gray">Paid PHP 5,000 for Lot #C-14 (TXN-2024-0014)</Typography>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:gap-4 border-b border-blue-gray-50 py-2 last:border-b-0">
                  <Typography variant="small" color="blue-gray" className="font-medium md:w-48">2024-05-15 02:15 PM</Typography>
                  <Typography variant="small" color="blue-gray">Paid PHP 5,000 for Lot #C-14 (TXN-2024-0009)</Typography>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:gap-4 border-b border-blue-gray-50 py-2 last:border-b-0">
                  <Typography variant="small" color="blue-gray" className="font-medium md:w-48">2024-04-10 09:00 AM</Typography>
                  <Typography variant="small" color="blue-gray">Paid PHP 5,000 for Lot #C-14 (TXN-2024-0005)</Typography>
                </div>
                <Button variant="text" color="blue" className="mt-2 flex items-center justify-center gap-2 sm:justify-start" onClick={() => navigate("/dashboard/make-payment")}>View All Payments</Button>
              </CardBody>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* Admin/staff dashboard as before */}
          {/* Stat cards */}
          <div className="mb-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {statistics.map((props) => (
              <StatCard key={props.title} {...props} />
            ))}
          </div>
          {/* Main content: Map and Quick Links */}
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
                    <Button color="blue" size="sm" onClick={() => navigate("/dashboard/lot-map")} className="flex items-center gap-2">
                      Open Full Map View
                    </Button>
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
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/ownership")}> <ClipboardDocumentListIcon className="h-5 w-5" /> Ownership Management </Button>
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/accounts")}> <UsersIcon className="h-5 w-5" /> User & Account Management </Button>
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/payments")}> <CurrencyDollarIcon className="h-5 w-5" /> Payment Monitoring </Button>
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/activity-log")}> <DocumentTextIcon className="h-5 w-5" /> Activity Log </Button>
              </CardBody>
            </Card>
          </div>
          {/* Recent Activity */}
          <div className="mb-12">
            <Card>
              <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
                <Typography variant="h6" color="white">Recent Activity</Typography>
              </CardHeader>
              <CardBody className="px-4 md:px-6 pt-0 flex flex-col gap-4">
                {recentActivities.map((activity, idx) => (
                  <div key={idx} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 border-b border-blue-gray-50 py-2 last:border-b-0">
                    <Typography variant="small" color="blue-gray" className="font-medium md:w-48">{activity.time}</Typography>
                    <Typography variant="small" color="blue-gray">{activity.message}</Typography>
                  </div>
                ))}
                <Button variant="text" color="blue" className="mt-2 flex items-center justify-center gap-2 sm:justify-start" onClick={() => navigate("/dashboard/activity-log")}>View All Activity Logs</Button>
              </CardBody>
            </Card>
          </div>
        </>
      )}

      
    </div>
  );
}

export default Home;
