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
  CurrencyDollarIcon,
  HomeIcon,
  CalendarIcon,
  EyeIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// Stat card component for dashboard metrics
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
          <Typography variant="small" color="blue-gray" className="font-medium">
            {title}
          </Typography>
          <Typography
            variant="h6"
            color="blue-gray"
            className="leading-snug text-left sm:text-right text-base sm:text-xl"
          >
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
  
  // State for dashboard data
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  console.log('Customer Dashboard Home rendering:', { user, userExists: !!user, userId: user?.id });

  // Load dashboard data
  const loadDashboardData = async () => {
    if (!user?.id) {
      console.log('No user ID available for loading dashboard data');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      console.log('Loading dashboard data for customer:', user.id);
      
      const response = await fetch('/api/get_customer_dashboard.php', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id.toString(),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Dashboard data response:', data);

      if (data.success) {
        setDashboardData(data);
        console.log('Dashboard data loaded successfully');
      } else {
        throw new Error(data.message || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load dashboard data on component mount
  useEffect(() => {
    console.log('Dashboard useEffect triggered:', { 
      user: user, 
      id: user?.id, 
      account_type: user?.account_type,
      user_type: user?.user_type 
    });
    
    if (user?.id) {
      console.log('User ID found, loading dashboard data...');
      loadDashboardData();
      
      // Check if user was redirected from PayMongo payment success
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('payment') === 'success') {
        console.log('User redirected from PayMongo with success, showing success message...');
        // Clean up URL immediately
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Show success message and refresh data
        setTimeout(() => {
          loadDashboardData();
          console.log('Payment completed successfully! Data refreshed.');
        }, 1000);
      }
    } else {
      console.log('No user ID found, setting loading to false');
      setLoading(false);
    }
  }, [user?.id]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Show login prompt if user is not authenticated
  if (!user) {
    return (
      <div className="mt-12 text-center">
        <Typography variant="h4" color="blue-gray" className="mb-4">
          Please Log In
        </Typography>
        <Typography variant="small" color="blue-gray" className="mb-6">
          You need to be logged in as a customer to access this dashboard.
        </Typography>
        <Button 
          color="blue" 
          onClick={() => navigate("/auth/sign-in")}
          className="flex items-center justify-center gap-2 mx-auto"
        >
          Go to Login
        </Button>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="mt-12 text-center">
        <Typography variant="h4" color="red" className="mb-4">
          Error Loading Dashboard
        </Typography>
        <Typography variant="small" color="blue-gray" className="mb-6">
          {error}
        </Typography>
        <Button 
          color="blue" 
          onClick={() => {
            setError(null);
            loadDashboardData();
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-12">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div className="space-y-1">
          <Typography variant="h4" color="blue-gray" className="font-bold">
            Welcome, {user?.username || 'Customer'}
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Divine Life Memorial Park - Dashboard
          </Typography>
        </div>
      </div>

      {user?.account_type === "customer" || user?.user_type === "customer" ? (
        <>
          {/* Stat cards */}
          <div className="mb-12 grid gap-6 sm:grid-cols-2">
            <StatCard 
              color="blue" 
              icon={<MapIcon className="h-6 w-6 text-blue-500" />} 
              title="My Lots" 
              value={loading ? "..." : (dashboardData?.summary?.total_lots || 0).toString()} 
            />
            <StatCard 
              color="green" 
              icon={<CurrencyDollarIcon className="h-6 w-6 text-green-500" />} 
              title="Total Paid" 
              value={loading ? "..." : formatCurrency(dashboardData?.payment_stats?.total_paid_amount || 0)} 
            />
          </div>
          
          {/* My Lots Widget */}
          <div className="mb-12">
            <Card>
              <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
                <Typography variant="h6" color="white">My Lots</Typography>
              </CardHeader>
              <CardBody className="px-4 md:px-6 pt-0">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Typography variant="small" color="blue-gray">Loading lots...</Typography>
                  </div>
                ) : dashboardData?.lots?.length > 0 ? (
                  <div className="space-y-4">
                    {dashboardData.lots.map((lot) => (
                      <div key={lot.lot_id} className="border border-blue-gray-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Typography variant="h6" color="blue-gray" className="font-bold">
                                {lot.lot_display}
                              </Typography>
                              <Chip
                                size="sm"
                                value={lot.status_display}
                                color={lot.status === 'occupied' ? 'green' : lot.status === 'reserved' ? 'orange' : 'blue-gray'}
                                className="font-medium"
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2">
                                <MapIcon className="h-4 w-4 text-blue-500" />
                                <Typography variant="small" color="blue-gray">
                                  {lot.garden_name}
                                </Typography>
                              </div>
                              <div className="flex items-center gap-2">
                                <HomeIcon className="h-4 w-4 text-blue-500" />
                                <Typography variant="small" color="blue-gray">
                                  Block {lot.block_number}
                                </Typography>
                              </div>
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4 text-blue-500" />
                                <Typography variant="small" color="blue-gray">
                                  Purchased: {lot.purchase_date ? new Date(lot.purchase_date).toLocaleDateString() : 'N/A'}
                                </Typography>
                              </div>
                              <div className="flex items-center gap-2">
                                <CubeIcon className="h-4 w-4 text-blue-500" />
                                <Typography variant="small" color="blue-gray">
                                  {lot.vault_display}
                                </Typography>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 md:w-40">
                            <Button 
                              size="sm" 
                              variant="outlined" 
                              color="blue"
                              onClick={() => navigate(`/dashboard/sector-on-map/${lot.garden_name}/${lot.sector_name}?block=${lot.block_number}&lot=${lot.lot_number}`)}
                              className="flex items-center justify-center gap-1 text-xs"
                            >
                              <EyeIcon className="h-3 w-3" />
                              View on Map
                            </Button>
                            <Button 
                              size="sm" 
                              color="green"
                              onClick={() => navigate("/dashboard/make-payment")}
                              className="flex items-center justify-center gap-1 text-xs"
                            >
                              <CurrencyDollarIcon className="h-3 w-3" />
                              Make Payment
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Summary */}
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            Total Lots: {dashboardData.lots.length}
                          </Typography>
                          <Typography variant="small" color="blue-gray" className="opacity-70">
                            Payment Rate: {dashboardData?.payment_stats?.payment_rate || 0}%
                          </Typography>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outlined" 
                            color="blue"
                            onClick={() => navigate("/dashboard/customer-lot-map")}
                          >
                            View All on Map
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <MapIcon className="h-16 w-16 text-blue-gray-300 mx-auto mb-4" />
                    <Typography variant="h6" color="blue-gray" className="mb-2">
                      No lots assigned
                    </Typography>
                    <Typography variant="small" color="blue-gray" className="opacity-70 mb-4">
                      Contact administration for lot assignment and purchase options
                    </Typography>
                    <Button 
                      color="blue" 
                      onClick={() => navigate("/dashboard/customer-lot-map")}
                      className="flex items-center justify-center gap-2 mx-auto"
                    >
                      <MapIcon className="h-4 w-4" />
                      Browse Available Lots
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Recent Payments */}
          <div className="mb-12">
            <Card>
              <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
                <Typography variant="h6" color="white">Recent Payments</Typography>
              </CardHeader>
              <CardBody className="px-4 md:px-6 pt-0">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Typography variant="small" color="blue-gray">Loading payments...</Typography>
                  </div>
                ) : dashboardData?.recent_payments?.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardData.recent_payments.map((payment) => (
                      <div key={payment.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-blue-gray-50 py-3 last:border-b-0">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              {formatCurrency(payment.payment_amount)}
                            </Typography>
                            <Typography variant="small" color="blue-gray" className="opacity-70">
                              • {payment.sector_name}-{payment.lot_number}
                            </Typography>
                          </div>
                          <Typography variant="small" color="blue-gray" className="opacity-70">
                            {payment.payment_method} • {new Date(payment.payment_date).toLocaleDateString()}
                          </Typography>
                        </div>
                        <div className="mt-2 md:mt-0">
                          <Chip
                            variant="ghost"
                            color="green"
                            value={payment.status || 'Paid'}
                            className="text-center font-medium w-fit"
                          />
                        </div>
                      </div>
                    ))}
                    <Button 
                      variant="text" 
                      color="blue" 
                      className="mt-4 flex items-center justify-center gap-2 sm:justify-start" 
                      onClick={() => navigate("/dashboard/make-payment")}
                    >
                      View All Payments
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Typography variant="h6" color="blue-gray" className="mb-2">
                      No payment history
                    </Typography>
                    <Typography variant="small" color="blue-gray" className="opacity-70">
                      Make your first payment to see history here
                    </Typography>
                    <Button 
                      color="blue" 
                      className="mt-4 flex items-center justify-center gap-2 sm:justify-start" 
                      onClick={() => navigate("/dashboard/make-payment")}
                    >
                      <CurrencyDollarIcon className="h-4 w-4" />
                      Make First Payment
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <Typography variant="h6" color="blue-gray" className="mb-2">
            Access Denied
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            This dashboard is only available for customer accounts.
          </Typography>
        </div>
      )}
    </div>
  );
}
