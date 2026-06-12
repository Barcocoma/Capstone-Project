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
  ExclamationCircleIcon,
  UsersIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  CalendarIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { API_ENDPOINTS } from "@/configs/api";

// Helper function to capitalize first letter
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Stat card component for dashboard metrics
function StatCard({ color, icon, title, value }) {
  return (
    <Card className="border border-blue-gray-100 shadow-sm">
      <CardBody className="p-4 flex items-center gap-3">
        <div className={`rounded-lg bg-${color}-100 p-3 flex items-center justify-center h-12 w-12 shrink-0`}>{icon}</div>
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
  
  // State for recent payments
  const [recentPayments, setRecentPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // State for payment plans
  const [paymentPlans, setPaymentPlans] = useState([]);
  const [loadingPaymentPlans, setLoadingPaymentPlans] = useState(false);

  console.log('Customer Dashboard Home rendering:', { user, userExists: !!user, userId: user?.id });
  
  // Load recent payments for customer
  const loadRecentPayments = async () => {
    if (!user?.id) {
      console.log('No user ID available for loading payments');
      return;
    }
    
    try {
      setLoadingPayments(true);
      console.log('Loading recent payments for customer:', user.id);
      
      const response = await fetch('/api/get_customer_payment_history.php', {
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
      
      if (data.success && data.paymentHistory) {
        // Get last 5 payments
        setRecentPayments(data.paymentHistory.slice(0, 5));
        console.log('Loaded recent payments:', data.paymentHistory.slice(0, 5));
      } else {
        console.log('No payments found or API error:', data.message);
        setRecentPayments([]);
      }
    } catch (err) {
      console.error("Error loading recent payments:", err);
      setRecentPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  };
  
  // Load customer payment plans
  const loadPaymentPlans = async () => {
    if (!user?.id) {
      console.log('No user ID available for loading payment plans');
      return;
    }
    
    try {
      setLoadingPaymentPlans(true);
      console.log('Loading payment plans for customer:', user.id);
      
      const response = await fetch(`/api/get_customer_payment_plan.php?t=${Date.now()}`, {
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
      
      if (data.success && data.payment_plans) {
        setPaymentPlans(data.payment_plans);
        console.log('Loaded payment plans:', data.payment_plans);
      } else {
        console.log('No payment plans found or API error:', data.message);
        setPaymentPlans([]);
      }
    } catch (err) {
      console.error("Error loading payment plans:", err);
      setPaymentPlans([]);
    } finally {
      setLoadingPaymentPlans(false);
    }
  };

  // Load payments and payment plans on component mount
  useEffect(() => {
    console.log('Dashboard useEffect triggered:', { 
      user: user, 
      id: user?.id, 
      account_type: user?.account_type,
      user_type: user?.user_type 
    });
    
    if (user?.id) {
      console.log('User ID found, loading recent payments and payment plans...');
      loadRecentPayments();
      loadPaymentPlans();
      loadRecentActivities();
      
      // Check if user was redirected from PayMongo payment success
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('payment') === 'success') {
        console.log('User redirected from PayMongo with success, showing success message...');
        // Clean up URL immediately
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Show success message and refresh data
        setTimeout(() => {
          loadRecentPayments();
          loadPaymentPlans();
          // You can add a success notification here if needed
          console.log('Payment completed successfully! Data refreshed.');
        }, 1000);
      }
    } else {
      console.log('No user ID found, setting loading to false');
      setLoadingPayments(false);
      setLoadingPaymentPlans(false);
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

  // Example stats - replace with API data in production
  const statistics = [
    {
      color: "blue",
      icon: <MapIcon className="h-6 w-6 text-blue-500" />,
      title: "Total Lots",
      value: "14,000",
    },
    {
      color: "green",
      icon: <MapIcon className="h-6 w-6 text-green-500" />,
      title: "Available Lots",
      value: "7,500",
    },
    {
      color: "purple",
      icon: <UserGroupIcon className="h-6 w-6 text-purple-500" />,
      title: "Sold Lots",
      value: "6,200",
    },
    {
      color: "red",
      icon: <ExclamationCircleIcon className="h-6 w-6 text-red-500" />,
      title: "Overdue Payments",
      value: "12",
    },
  ];

  // Recent activities from API
  const [recentActivities, setRecentActivities] = useState([]);

  // Load recent activities
  const loadRecentActivities = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.GET_ACTIVITY_LOGS);
      const data = await response.json();
      if (data.success) {
        // Get the 3 most recent activities
        const recent = data.activityLogs.slice(0, 3).map(log => ({
          time: new Date(log.timestamp).toLocaleString(),
          message: capitalizeFirst(log.details)
        }));
        setRecentActivities(recent);
      }
    } catch (error) {
      console.error('Error loading recent activities:', error);
    }
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
          <div className="mb-12 grid gap-y-10 gap-x-6 md:grid-cols-2 xl:grid-cols-4">
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
            <StatCard 
              color="orange" 
              icon={<ClockIcon className="h-6 w-6 text-orange-500" />} 
              title="Payments Due" 
              value={loading ? "..." : ((dashboardData?.payments_due?.upcoming_count || 0) + (dashboardData?.payments_due?.overdue_count || 0)).toString()} 
            />
            <StatCard 
              color="red" 
              icon={<ExclamationTriangleIcon className="h-6 w-6 text-red-500" />} 
              title="Overdue" 
              value={loading ? "..." : (dashboardData?.payments_due?.overdue_count || 0).toString()} 
            />
          </div>
          
          {/* My Lots Widget */}
          <div className="mb-12">
            <Card>
              <CardHeader variant="gradient" color="blue" className="mb-8 p-6">
                <Typography variant="h6" color="white">My Lots</Typography>
              </CardHeader>
              <CardBody className="px-6 pt-0">
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
                          <div className="flex flex-col gap-2">
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
                        
                        {/* Lot Capacity Information */}
                        <div className="mt-3 pt-3 border-t border-blue-gray-50">
                          <Typography variant="small" color="blue-gray" className="font-medium mb-2">
                            Capacity Status:
                          </Typography>
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="flex justify-between">
                              <span>Lower Body:</span>
                              <span className={lot.lower_body ? 'text-red-500 font-medium' : 'text-green-500'}>
                                {lot.lower_body ? 'Occupied' : 'Available'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Upper Body:</span>
                              <span className={lot.upper_body ? 'text-red-500 font-medium' : 'text-green-500'}>
                                {lot.upper_body ? 'Occupied' : 'Available'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Lower Bone:</span>
                              <span className={lot.lower_bone >= 2 ? 'text-red-500 font-medium' : 'text-green-500'}>
                                {lot.lower_bone}/2
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Upper Bone:</span>
                              <span className={lot.upper_bone >= 2 ? 'text-red-500 font-medium' : 'text-green-500'}>
                                {lot.upper_bone}/2
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Summary and Actions */}
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

          {/* Payment Plans Widget */}
          {paymentPlans.length > 0 && (
            <div className="mb-12">
              <Card>
                <CardHeader variant="gradient" color="purple" className="mb-8 p-6">
                  <Typography variant="h6" color="white">My Payment Plans</Typography>
                </CardHeader>
                <CardBody className="px-6 pt-0">
                  {loadingPaymentPlans ? (
                    <div className="flex items-center justify-center py-8">
                      <Typography variant="small" color="blue-gray">Loading payment plans...</Typography>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {paymentPlans.map((plan) => (
                        <div key={plan.id} className="border border-blue-gray-100 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <Typography variant="h6" color="blue-gray" className="font-bold">
                                  {plan.lot_display}
                                </Typography>
                                <Chip
                                  size="sm"
                                  value={plan.status}
                                  color={plan.status === 'active' ? 'green' : plan.status === 'completed' ? 'blue' : 'red'}
                                  className="font-medium capitalize"
                                />
                              </div>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span>Total Amount:</span>
                                  <span className="font-bold">{formatCurrency(plan.total_amount)}</span>
                                </div>
                                
                                {plan.down_payment > 0 && (
                                  <div className="flex justify-between">
                                    <span>Down Payment:</span>
                                    <span className="text-blue-600">{formatCurrency(plan.down_payment)}</span>
                                  </div>
                                )}
                                
                                {plan.payment_term_months === 0 ? (
                                  <div className="text-center p-3 bg-green-50 rounded-lg">
                                    <Typography variant="small" color="green" className="font-bold text-lg">
                                      ✅ FULLY PAID
                                    </Typography>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex justify-between">
                                      <span>Payment Term:</span>
                                      <span className="font-bold">{plan.payment_term_months} months</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Monthly Payment:</span>
                                      <span className="font-bold text-orange-600">{formatCurrency(plan.monthly_amount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Progress:</span>
                                      <span className="text-purple-600">{plan.progress.percentage_complete}% Complete</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              {plan.payment_term_months > 0 && (
                                <Button 
                                  size="sm" 
                                  color="green"
                                  onClick={() => navigate("/dashboard/make-payment")}
                                  className="flex items-center justify-center gap-1 text-xs"
                                >
                                  <CurrencyDollarIcon className="h-3 w-3" />
                                  Pay Now
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* Payment Progress */}
                          <div className="mt-4 pt-4 border-t border-blue-gray-50">
                            {plan.payment_term_months === 0 ? (
                              <div className="text-center py-4 bg-green-50 rounded-lg">
                                <Typography variant="h6" color="green" className="font-bold">
                                  🎉 LOT FULLY PAID
                                </Typography>
                                <Typography variant="small" color="blue-gray" className="mt-1">
                                  No monthly payments required
                                </Typography>
                              </div>
                            ) : (
                              <>
                                <div className="flex justify-between items-center mb-3">
                                  <Typography variant="small" color="blue-gray" className="font-medium">
                                    Payment Schedule: {plan.payment_term_months} months
                                  </Typography>
                                  <Typography variant="small" color="blue-gray">
                                    {plan.progress.months_paid} of {plan.progress.total_months} paid
                                  </Typography>
                                </div>
                                
                                <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                                  <div 
                                    className="bg-green-600 h-3 rounded-full transition-all duration-300" 
                                    style={{ width: `${plan.progress.percentage_complete}%` }}
                                  ></div>
                                </div>
                                
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span>Amount Paid:</span>
                                    <span className="text-green-600 font-medium">
                                      {formatCurrency(plan.progress.amount_paid)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Remaining Balance:</span>
                                    <span className="text-orange-600 font-medium">
                                      {formatCurrency(plan.progress.remaining_balance)}
                                    </span>
                                  </div>
                                </div>
                                
                                {plan.next_payment && (
                                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                                    <Typography variant="small" color="blue-gray" className="font-medium">
                                      Next Payment: {formatCurrency(plan.next_payment.amount_due)}
                                    </Typography>
                                    <Typography variant="small" color="blue-gray">
                                      Due: {new Date(plan.next_payment.due_date).toLocaleDateString()}
                                    </Typography>
                                  </div>
                                )}
                                
                                {plan.overdue_payments > 0 && (
                                  <div className="mt-3 p-3 bg-red-50 rounded-lg">
                                    <Typography variant="small" color="red" className="font-medium">
                                      ⚠️ {plan.overdue_payments} overdue payment(s)
                                    </Typography>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* Main content: Cemetery Map View and Quick Links */}
          <div className="mb-12 grid grid-cols-1 gap-y-12 gap-x-6 lg:grid-cols-2">
            {/* Cemetery Map View */}
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
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/my-lot")}>My Lots</Button>
                <Button color="blue" className="flex w-full items-center justify-center gap-3 sm:justify-start" onClick={() => navigate("/dashboard/make-payment")}>Make Payment</Button>
              </CardBody>
            </Card>
          </div>
          {/* Recent Payments */}
          <div className="mb-12">
            <Card>
              <CardHeader variant="gradient" color="blue" className="mb-8 p-6">
                <Typography variant="h6" color="white">Recent Payments</Typography>
              </CardHeader>
              <CardBody className="px-6 pt-0">
                {loadingPayments ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <Typography variant="h6" color="blue-gray" className="mb-2">
                        Loading payments...
                      </Typography>
                      <Typography variant="small" color="blue-gray" className="opacity-70">
                        Please wait while we fetch your payment history
                      </Typography>
                    </div>
                  </div>
                ) : recentPayments.length > 0 ? (
                  <div className="space-y-3">
                    {recentPayments.map((payment) => (
                      <div key={payment.id} className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-blue-gray-50 py-3 last:border-b-0">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Typography variant="small" color="blue-gray" className="font-bold">
                              {formatCurrency(payment.payment_amount)}
                            </Typography>
                            <Typography variant="small" color="blue-gray" className="opacity-70">
                              • {payment.sector_name}-{payment.lot_number}
                            </Typography>
                          </div>
                          <Typography variant="small" color="blue-gray" className="opacity-70">
                            {payment.payment_method} • {new Date(payment.payment_date).toLocaleDateString()} • {new Date(payment.payment_date).toLocaleTimeString()}
                          </Typography>
                        </div>
                        <div className="mt-2 md:mt-0 flex items-center gap-3">
                          <Chip
                            variant="ghost"
                            color="green"
                            value={payment.status}
                            className="text-center font-medium w-fit"
                          />
                          {payment.receipt_url ? (
                            <Button
                              variant="text"
                              color="blue"
                              size="sm"
                              className="p-0 font-medium underline-offset-4"
                              onClick={() => window.open(payment.receipt_url, "_blank", "noopener")}
                            >
                              Download Receipt
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    <Button 
                      variant="text" 
                      color="blue" 
                      className="mt-4 flex items-center gap-2" 
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
                      className="mt-4 flex items-center gap-2" 
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
        <>
          {/* Admin/staff dashboard as before */}
          {/* Stat cards */}
          <div className="mb-12 grid gap-y-10 gap-x-6 md:grid-cols-2 xl:grid-cols-4">
            {statistics.map((props) => (
              <StatCard key={props.title} {...props} />
            ))}
          </div>
          {/* Main content: Map and Quick Links */}
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
              <CardHeader variant="gradient" color="blue" className="mb-8 p-6">
                <Typography variant="h6" color="white">Recent Activity</Typography>
              </CardHeader>
              <CardBody className="px-6 pt-0 flex flex-col gap-4">
                {recentActivities.length > 0 ? recentActivities.map((activity, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center md:gap-4 border-b border-blue-gray-50 py-2 last:border-b-0">
                    <Typography variant="small" color="blue-gray" className="font-medium w-48">{activity.time}</Typography>
                    <Typography variant="small" color="blue-gray">{activity.message}</Typography>
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
        </>
      )}

      
    </div>
  );
}

export default Home;
