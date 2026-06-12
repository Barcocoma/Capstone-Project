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
  CalendarIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const iconBgMap = {
  blue: "bg-blue-100",
  green: "bg-green-100",
  purple: "bg-purple-100",
  red: "bg-red-100",
};

function StatCard({ color, icon, title, value, subtitle }) {
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
          <div className="text-left sm:text-right">
            <Typography variant="h5" color="blue-gray" className="font-bold leading-snug text-base sm:text-xl">
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="small" color="blue-gray" className="opacity-70">
                {subtitle}
              </Typography>
            )}
          </div>
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

  console.log('Cashier Dashboard Home rendering:', { user, userExists: !!user, userId: user?.id });

  // Load dashboard data
  const loadDashboardData = async () => {
    if (!user?.id) {
      console.log('No user ID available for loading cashier dashboard data');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      console.log('Loading cashier dashboard data for user:', user.id);
      
      const response = await fetch('/api/get_cashier_dashboard.php', {
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
      console.log('Cashier dashboard data response:', data);

      if (data.success) {
        setDashboardData(data);
        console.log('Cashier dashboard data loaded successfully');
      } else {
        throw new Error(data.message || 'Failed to load cashier dashboard data');
      }
    } catch (error) {
      console.error('Error loading cashier dashboard data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load dashboard data on component mount
  useEffect(() => {
    console.log('Cashier Dashboard useEffect triggered:', { 
      user: user, 
      id: user?.id, 
      account_type: user?.account_type,
      user_type: user?.user_type 
    });
    
    if (user?.id) {
      console.log('User ID found, loading cashier dashboard data...');
      loadDashboardData();
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
          You need to be logged in as a cashier to access this dashboard.
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
            Welcome, {user?.username || 'Cashier'}
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Divine Life Memorial Park - Cashier Dashboard
          </Typography>
        </div>
        <div className="text-left md:text-right">
          <Typography variant="small" color="blue-gray" className="opacity-70 block">
            {dashboardData?.date_info?.current_month || 'Loading...'}
          </Typography>
          <Typography variant="small" color="blue-gray" className="opacity-70">
            Today: {dashboardData?.date_info?.today || 'Loading...'}
          </Typography>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          color="green"
          icon={<CurrencyDollarIcon className="h-6 w-6 text-green-500" />}
          title="Total Collected Today"
          value={loading ? "..." : formatCurrency(dashboardData?.stats?.total_collected_today || 0)}
          subtitle="On-site payments"
        />
        <StatCard
          color="blue"
          icon={<UserGroupIcon className="h-6 w-6 text-blue-500" />}
          title="Customers Served"
          value={loading ? "..." : (dashboardData?.stats?.customers_served_today || 0).toString()}
          subtitle="Today"
        />
        <StatCard
          color="purple"
          icon={<ClipboardDocumentListIcon className="h-6 w-6 text-purple-500" />}
          title="Transactions"
          value={loading ? "..." : (dashboardData?.stats?.transactions_today || 0).toString()}
          subtitle="Today"
        />
      </div>

      {/* Main content: Transaction Summary and Quick Links */}
      <div className="mb-12 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Transaction Summary */}
        <Card>
          <CardHeader variant="gradient" color="green" className="mb-6 p-6">
            <Typography variant="h6" color="white">Transaction Summary</Typography>
          </CardHeader>
          <CardBody className="px-4 md:px-6 pt-0 pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Typography variant="small" color="blue-gray">Loading transaction summary...</Typography>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <Typography variant="small" color="blue-gray" className="opacity-70 mb-1">
                      This Week
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {formatCurrency(dashboardData?.stats?.total_collected_week || 0)}
                    </Typography>
                    <Typography variant="small" color="blue-gray" className="opacity-70 mt-1">
                      {dashboardData?.stats?.transactions_week || 0} transactions
                    </Typography>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <Typography variant="small" color="blue-gray" className="opacity-70 mb-1">
                      This Month
                    </Typography>
                    <Typography variant="h5" color="blue-gray" className="font-bold">
                      {formatCurrency(dashboardData?.stats?.total_collected_month || 0)}
                    </Typography>
                    <Typography variant="small" color="blue-gray" className="opacity-70 mt-1">
                      {dashboardData?.stats?.total_transactions_month || 0} transactions
                    </Typography>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-blue-gray-100">
                  <Typography variant="small" color="blue-gray" className="font-medium mb-3">
                    Payment Methods (Today)
                  </Typography>
                  {dashboardData?.payment_methods?.length > 0 ? (
                    <div className="space-y-2">
                      {dashboardData.payment_methods.map((method) => (
                        <div key={method.payment_method} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <Typography variant="small" color="blue-gray">
                            {method.payment_method}
                          </Typography>
                          <div className="flex items-center gap-2">
                            <Typography variant="small" color="blue-gray" className="opacity-70">
                              {method.count}
                            </Typography>
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              {formatCurrency(method.total_amount)}
                            </Typography>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Typography variant="small" color="blue-gray" className="opacity-70">
                      No payments recorded today
                    </Typography>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Quick Links */}
        <Card className="mt-6 xl:mt-0">
          <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
            <Typography variant="h6" color="white">Quick Links</Typography>
          </CardHeader>
          <CardBody className="px-6 pt-0 flex flex-col gap-3">
            <Button color="green" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/cashier-customers")}>
              <CurrencyDollarIcon className="h-5 w-5" />
              Process Payment
            </Button>
            <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/cashier-customers")}>
              <UserGroupIcon className="h-5 w-5" />
              Customer Table
            </Button>
            <Button color="purple" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/reports")}>
              <ClipboardDocumentListIcon className="h-5 w-5" />
              View Reports
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* Recent Payments */}
      <div className="mb-12">
        <Card>
          <CardHeader variant="gradient" color="blue" className="mb-6 p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <Typography variant="h6" color="white">Recent Payments</Typography>
              <Typography variant="small" color="white" className="opacity-80">
                On-site transactions only
              </Typography>
            </div>
          </CardHeader>
          <CardBody className="px-4 md:px-6 pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Typography variant="small" color="blue-gray">Loading recent payments...</Typography>
              </div>
            ) : dashboardData?.recent_payments?.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.recent_payments.map((payment, idx) => (
                  <div key={payment.id || idx} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-blue-gray-50 py-3 last:border-b-0">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Typography variant="small" color="blue-gray" className="font-bold">
                          {formatCurrency(payment.payment_amount)}
                        </Typography>
                        <Typography variant="small" color="blue-gray" className="opacity-70">
                          • {payment.owner_name}
                        </Typography>
                        {payment.lot_display && (
                          <Typography variant="small" color="blue-gray" className="opacity-70">
                            • Lot {payment.lot_display}
                          </Typography>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CalendarIcon className="h-3 w-3 text-blue-gray-400" />
                        <Typography variant="small" color="blue-gray" className="opacity-70">
                          {(() => {
                            // Use created_at for accurate time (when payment was actually processed)
                            // Fallback to payment_date if created_at is not available
                            const dateTime = payment.created_at || payment.payment_date;
                            if (!dateTime) return 'N/A';
                            
                            try {
                              const date = new Date(dateTime);
                              // Format: MM/DD/YYYY HH:MM:SS AM/PM (with seconds)
                              const dateStr = date.toLocaleDateString('en-US', {
                                month: '2-digit',
                                day: '2-digit',
                                year: 'numeric'
                              });
                              const timeStr = date.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                              });
                              return `${dateStr} ${timeStr}`;
                            } catch (e) {
                              return dateTime;
                            }
                          })()}
                        </Typography>
                        <Typography variant="small" color="blue-gray" className="opacity-70">
                          • {payment.payment_method}
                        </Typography>
                      </div>
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
                
                {/* Monthly Summary */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Typography variant="small" color="blue-gray" className="font-medium">
                        This Month: {formatCurrency(dashboardData?.stats?.total_collected_month || 0)}
                      </Typography>
                      <Typography variant="small" color="blue-gray" className="opacity-70">
                        {dashboardData?.stats?.total_transactions_month || 0} transactions
                      </Typography>
                    </div>
                    <Button
                      variant="text"
                      color="blue"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate("/dashboard/cashier-customers");
                      }}
                      className="flex items-center justify-center gap-2 sm:justify-start"
                    >
                      View All Payments
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <ClockIcon className="h-16 w-16 text-blue-gray-300 mx-auto mb-4" />
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  No recent payments
                </Typography>
                <Typography variant="small" color="blue-gray" className="opacity-70">
                  On-site payments will appear here
                </Typography>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

    </div>
  );
}

export default Home;
