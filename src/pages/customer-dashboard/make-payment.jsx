import React, { useState, useEffect, useRef } from "react";
import { Typography, Card, Button, Select, Option, Input, Alert } from "@material-tailwind/react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const paymentMethods = ["GCash", "Maya"];

// Helper function to format month with custom due day (consistent with admin/staff side)
const formatMonthWithDay = (month) => {
  if (month.due_date) {
    const date = new Date(month.due_date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } else if (month.due_day) {
    const [year, monthNum] = month.year_month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(monthNum) - 1]} ${month.due_day}, ${year}`;
  }
  return month.display || month.year_month;
};

export function MakePayment(props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedLot, setSelectedLot] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("GCash");
  const [paymentAmount, setPaymentAmount] = useState(5000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [customerLots, setCustomerLots] = useState([]);
  const [customerLotsData, setCustomerLotsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [monthlyStatus, setMonthlyStatus] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [selectedLotForPayment, setSelectedLotForPayment] = useState("");
  const [selectedMonthsForPayment, setSelectedMonthsForPayment] = useState([]);
  const [monthPaymentAmount, setMonthPaymentAmount] = useState(1000);
  const [paymentType, setPaymentType] = useState("monthly"); // "monthly" or "general"
  const [customerPaymentPlans, setCustomerPaymentPlans] = useState([]);
  const [receiptVisibility, setReceiptVisibility] = useState({});
  const activeMonitorsRef = useRef(new Set());
  const PENDING_PAYMENTS_KEY = 'pending_paymongo_checkouts';

  const addPendingPayments = (entries) => {
    try {
      const existing = JSON.parse(localStorage.getItem(PENDING_PAYMENTS_KEY) || '[]');
      const filtered = existing.filter(e => !entries.some(n => n.checkoutId === e.checkoutId));
      localStorage.setItem(PENDING_PAYMENTS_KEY, JSON.stringify([...filtered, ...entries]));
    } catch (e) {
      console.warn('Failed to persist pending payments', e);
    }
  };

  const getPendingPayments = () => {
    try {
      return JSON.parse(localStorage.getItem(PENDING_PAYMENTS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  };

  const removePendingPayment = (checkoutId) => {
    try {
      const existing = JSON.parse(localStorage.getItem(PENDING_PAYMENTS_KEY) || '[]');
      const updated = existing.filter(p => p.checkoutId !== checkoutId);
      localStorage.setItem(PENDING_PAYMENTS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to remove pending payment', e);
    }
  };

  const selectedLotStatus = selectedLotForPayment
    ? monthlyStatus.find((lot) => lot.lot_id == selectedLotForPayment)
    : null;
  const nextUnpaidMonthForSelectedLot = selectedLotStatus?.monthly_payments?.find((month) => !month.paid) || null;
  const nextMonthIsOverdue = !!nextUnpaidMonthForSelectedLot?.overdue;
  const nextMonthBaseAmount = nextUnpaidMonthForSelectedLot ? toNumber(nextUnpaidMonthForSelectedLot.amount) : 0;
  const nextMonthAmountWithPenalty = nextUnpaidMonthForSelectedLot
    ? toNumber(nextUnpaidMonthForSelectedLot.amount_with_penalty ?? nextMonthBaseAmount)
    : 0;
  const nextMonthPenaltyAmount = nextMonthIsOverdue
    ? Math.max(nextMonthAmountWithPenalty - nextMonthBaseAmount, 0)
    : 0;
  const isMonthlyPaymentBlocked = paymentType === "monthly" && nextMonthIsOverdue;

  // Helper: get next unpaid month's amount (handles 2-split DP and overdue penalty)
  const getNextDueAmountFromSchedule = (lotId) => {
    const plan = customerPaymentPlans.find(p => p.lot_id == lotId);
    if (!plan) return monthPaymentAmount;
    const sched = Array.isArray(plan.schedule) ? plan.schedule : [];
    const next = sched.find(s => String((s.status || '').toLowerCase()) !== 'paid');
    // Prefer frontend monthlyStatus data for penalty-aware amount
    const lot = monthlyStatus.find(l => l.lot_id == lotId);
    const msNext = lot?.monthly_payments?.find(m => !m.paid);
    if (msNext) {
      if (msNext.overdue) {
        return toNumber(msNext.amount);
      }
      const penaltyAwareAmount = toNumber(msNext.amount_with_penalty ?? msNext.amount);
      if (penaltyAwareAmount > 0) {
        return penaltyAwareAmount;
      }
    }
    if (next && Number.isFinite(parseFloat(next.amount_due))) {
      return toNumber(next.amount_due);
    }
    // fallback to plan monthly amount
    return Number.isFinite(parseFloat(plan.monthly_amount)) ? toNumber(plan.monthly_amount) : monthPaymentAmount;
  };

  // Ensure monthly amount reflects the NEXT schedule amount when plans or lot selection load
  useEffect(() => {
    if (paymentType === "monthly" && selectedLotForPayment) {
      const amt = getNextDueAmountFromSchedule(selectedLotForPayment);
      setMonthPaymentAmount(amt);
    }
  }, [customerPaymentPlans, selectedLotForPayment, paymentType]);

  useEffect(() => {
    const pending = getPendingPayments();
    if (pending.length) {
      pending.forEach(entry => startPaymentMonitoring(entry.checkoutId, entry.lotId || null));
    }

    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success') {
      setSuccess('Payment completed. Syncing latest records…');
    } else if (paymentStatus === 'cancelled') {
      setError('Payment checkout cancelled.');
    }
    if (paymentStatus) {
      params.delete('payment');
      const newQuery = params.toString();
      const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Load payment history and customer lots
  const loadPaymentData = async (forceRefresh = false) => {
    if (!user?.id) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }
    
    try {
      if (forceRefresh) {
        setLoading(true);
      }
      setError("");
      
      console.log('Loading data for user ID:', user.id, forceRefresh ? '(force refresh)' : '');
      
      // Load customer lots first
      const lotsResponse = await fetch('/api/get_customer_lots.php', {
        method: 'GET',
        headers: {
          'X-User-Id': user.id.toString(),
          'Content-Type': 'application/json'
        }
      });
      
      if (!lotsResponse.ok) {
        throw new Error(`Lots API error: ${lotsResponse.status} ${lotsResponse.statusText}`);
      }
      
      const lotsData = await lotsResponse.json();
      console.log('Lots API response:', lotsData);
      
      if (lotsData.success) {
        setCustomerLotsData(lotsData.customerLots);
        setCustomerLots(lotsData.customerLots.map(lot => lot.id));
        
        if (lotsData.customerLots.length > 0 && !selectedLot) {
          setSelectedLot(lotsData.customerLots[0].id);
        }
      } else {
        console.error('Lots API error:', lotsData.message);
      }
      
      // Load all payments (including Paymongo)
      const historyResponse = await fetch(`/api/get_all_payments.php?t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'X-User-Id': user.id.toString(),
          'Content-Type': 'application/json'
        }
      });
      
      if (!historyResponse.ok) {
        throw new Error(`Payment history API error: ${historyResponse.status} ${historyResponse.statusText}`);
      }
      
      const historyData = await historyResponse.json();
      console.log('Payment history API response:', historyData);
      
      if (historyData.success) {
        // Remove duplicates based on ID and lot_id combination
        const uniquePayments = historyData.payments.filter((payment, index, self) => 
          index === self.findIndex(p => p.id === payment.id && p.lot_id === payment.lot_id)
        );
        setPaymentHistory(uniquePayments);
      } else {
        console.error('Payment history API error:', historyData.message);
        setPaymentHistory([]);
      }
      
      // Load monthly payment status
      await loadMonthlyPaymentStatus();
      
      // Load customer payment plans
      await loadCustomerPaymentPlans();
      
    } catch (err) {
      console.error('Error loading data:', err);
      setError(`Failed to load payment data: ${err.message}`);
      // Set empty arrays to prevent undefined errors
      setPaymentHistory([]);
      setCustomerLots([]);
      setCustomerLotsData([]);
      setMonthlyStatus([]);
      setCustomerPaymentPlans([]);
    } finally {
      setLoading(false);
    }
  };

  // Load customer payment plans to get fixed monthly amounts
  const loadCustomerPaymentPlans = async () => {
    try {
      const response = await fetch(`/api/get_customer_payment_plan.php?t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'X-User-Id': user.id.toString(),
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCustomerPaymentPlans(data.payment_plans || []);
        }
      }
    } catch (err) {
      console.error('Error loading payment plans:', err);
    }
  };

  const loadMonthlyPaymentStatus = async () => {
    try {
      console.log('Loading monthly payment status for user:', user?.id);
      
      const response = await fetch(`/api/get_monthly_payment_status.php?t=${Date.now()}&refresh=1`, {
        method: 'GET',
        headers: {
          'X-User-Id': user.id.toString(),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Monthly status API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Monthly status API response:', data);
      
      if (data.success) {
        setMonthlyStatus(data.monthly_status);
        setMonthlySummary(data.summary);
        // Initialize collapse state: default collapsed for 24/36/48/60 months schedules
        try {
          const initialCollapsed = {};
          (data.monthly_status || []).forEach((lot) => {
            const count = (lot.monthly_payments || []).length;
            if ([24, 36, 48, 60].includes(count)) {
              initialCollapsed[lot.lot_id] = true;
            }
          });
          setCollapsedLots(initialCollapsed);
        } catch (e) { /* noop */ }
        // Auto-populate lot selection if empty
        if (!selectedLotForPayment && Array.isArray(data.monthly_status) && data.monthly_status.length > 0) {
          const firstLotId = data.monthly_status[0].lot_id;
          setSelectedLotForPayment(firstLotId);
          // Also set fixed amount
          const plan = customerPaymentPlans.find(p => p.lot_id == firstLotId);
          if (plan) setMonthPaymentAmount(parseFloat(plan.monthly_amount));
        }
      } else {
        console.error('Failed to load monthly status:', data.message);
      }
      
    } catch (err) {
      console.error('Error loading monthly status:', err);
    }
  };

  const syncPaymongoPayments = async () => {
    try {
      setError("");
      setSuccess("");
      
      const response = await fetch('/api/sync_paymongo_payments.php', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(data.message);
        // Force reload payment data and monthly status to show synced payments
        await loadPaymentData(true);
        await loadMonthlyPaymentStatus();
      } else {
        setError(data.message || "Failed to sync Paymongo payments");
      }
    } catch (err) {
      setError("Network error while syncing payments. Please try again.");
      console.error('Sync error:', err);
    }
  };

  const autoSyncPaymongoPayments = async (showNotification = false) => {
    try {
      console.log('Auto-syncing Paymongo payments...');
      
      const response = await fetch('/api/auto_sync_paymongo.php', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success && data.synced_count > 0) {
        console.log(`Auto-synced ${data.synced_count} new payments from Paymongo`);
        // Force reload payment data and monthly status to show new payments
        await loadPaymentData(true);
        await loadMonthlyPaymentStatus();
        
        // Show a subtle notification for new payments
        if (data.new_payments && data.new_payments.length > 0) {
          const paymentList = data.new_payments.map(p => `${p.owner_name}: ₱${p.amount.toFixed(2)}`).join(', ');
          setSuccess(`New payments detected: ${paymentList}`);
          // Clear the success message after 5 seconds
          setTimeout(() => setSuccess(""), 5000);
        }
      } else if (data.success) {
        console.log('No new Paymongo payments found');
      } else {
        console.error('Auto-sync error:', data.message);
      }
      
      // Update last sync time
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Auto-sync network error:', err);
    }
  };

  const handleUnifiedPayment = async () => {
    if (paymentType === "monthly") {
      return handleMonthlyPayment();
    } else {
      return handleGeneralPayment();
    }
  };

  const handleGeneralPayment = async () => {
    // Validate amount
    if (paymentAmount < 20) {
      setError('Minimum payment amount is ₱20.00');
      return;
    }

    setIsProcessing(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch('/api/create_paymongo_checkout.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: paymentAmount,
          lot_id: selectedLot,
          customer_id: user?.id,
          description: `General Payment for Lot ${selectedLot}`
        })
      });

      const data = await response.json();

      if (data.success) {
        setPaymentUrl(data.checkout_url);
        addPendingPayments([{ checkoutId: data.checkout_id, lotId: selectedLot }]);
        window.open(data.checkout_url, '_self');
        setSuccess("Redirecting to PayMongo checkout. After completing payment, you'll be returned here automatically.");
        
        // Start automatic payment monitoring
        startPaymentMonitoring(data.checkout_id, selectedLot);
      } else {
        setError(data.message || "Failed to create payment session");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error('Payment error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMonthlyPayment = async () => {
    if (!selectedLotForPayment) {
      setError('Please select a lot for payment.');
      return;
    }
    
    // Only allow payment for one month at a time (the next unpaid month)
    if (selectedMonthsForPayment.length === 0) {
      setError('No month selected. Please select a lot first.');
      return;
    }
    
    // Ensure only one month is selected
    const paymentMonth = selectedMonthsForPayment[0];

    if (monthPaymentAmount <= 0) {
      const plan = customerPaymentPlans.find(p => p.lot_id == selectedLotForPayment);
      if (plan && plan.payment_term_months === 0) {
        setError('✅ This lot is already fully paid! No monthly payments are required.');
      } else {
        setError('Invalid payment amount. Please select a valid lot with an active payment plan.');
      }
      return;
    }

    setError("");
    setSuccess("");

    const lotStatus = monthlyStatus.find(lot => lot.lot_id == selectedLotForPayment);
    const selectedMonth = lotStatus?.monthly_payments?.find((m) => m.year_month === paymentMonth);

    // Check if the selected month is overdue
    if (selectedMonth?.overdue) {
      setError('Online payments for overdue months are disabled. Please visit the office for onsite payment so we can apply the 3% penalty correctly.');
      return;
    }

    try {
      setIsProcessing(true);
      
      const successUrl = `${window.location.origin}/dashboard/make-payment?payment=success`;
      const cancelUrl = `${window.location.origin}/dashboard/make-payment?payment=cancelled`;

      const response = await fetch('/api/create_monthly_payment.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lot_id: selectedLotForPayment,
          payment_month: paymentMonth,
          payment_amount: monthPaymentAmount,
          customer_id: user?.id,
          success_url: successUrl,
          cancel_url: cancelUrl,
        })
      });

      const data = await response.json();

      if (data.success) {
        addPendingPayments([{ checkoutId: data.checkout_id, lotId: selectedLotForPayment }]);
        window.open(data.checkout_url, '_self');
        
        setSuccess(`Redirecting to payment for ${selectedMonth?.display || paymentMonth}. After completing payment, you'll be returned here automatically.`);

        // Start monitoring for the payment
        startPaymentMonitoring(data.checkout_id, selectedLotForPayment);
        
        // Clear form selections after initiating payment
        setSelectedMonthsForPayment([]);
        setSelectedLotForPayment("");
      } else {
        setError(data.message || "Failed to create payment session");
      }
    } catch (err) {
      setError("Network error. Please try again.");
      console.error('Monthly payment error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const startPaymentMonitoring = (checkoutId, lotId) => {
    if (!checkoutId) return;
    if (activeMonitorsRef.current.has(checkoutId)) {
      return;
    }
    activeMonitorsRef.current.add(checkoutId);
    console.log('Starting payment monitoring for checkout:', checkoutId);
    
    // Check payment status every 5 seconds for up to 3 minutes
    let attempts = 0;
    const maxAttempts = 36; // 3 minutes at 5-second intervals
    
    const checkPaymentStatus = async () => {
      attempts++;
      
      try {
        // Check this specific checkout session status with PayMongo
        const checkResponse = await fetch(`/api/check_payment_status.php?checkout_id=${checkoutId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          console.log('Payment status check:', checkData);
          
          if (checkData.success && checkData.is_paid) {
            console.log('Payment completed successfully!');
            setSuccess('Payment completed successfully! Updating records...');
            removePendingPayment(checkoutId);
            // Immediately ask backend to process paid sessions to create records and mark schedule as paid
            try {
              await fetch(`/api/process_pending_payments.php?checkout_id=${checkoutId}`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
            } catch (e) { /* non-blocking */ }
            // Fire-and-forget: email receipt to customer (resolve by checkout_id)
            try {
              fetch('/api/email_receipt.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkout_id: checkoutId })
              }).catch(() => {});
            } catch (e) { /* ignore */ }
            // Then force refresh ALL data with cache busting
            await loadPaymentData(true);
            await loadMonthlyPaymentStatus();
            await loadCustomerPaymentPlans();
            // Reset selections and redirect to monthly status tab
            setSelectedMonthsForPayment([]);
            setSelectedLotForPayment("");
            setStep(0);
            activeMonitorsRef.current.delete(checkoutId);
            return; // Stop monitoring
          }
        }

        // Continue monitoring if not paid and within time limit
        if (attempts < maxAttempts) {
          setTimeout(checkPaymentStatus, 5000); // Check again in 5 seconds
        } else {
          console.log('Payment monitoring timeout');
          setError('Payment monitoring timed out. Please refresh the page to check your payment status.');
          removePendingPayment(checkoutId);
          activeMonitorsRef.current.delete(checkoutId);
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
        if (attempts < maxAttempts) {
          setTimeout(checkPaymentStatus, 5000);
        } else {
          setError('Error checking payment status. Please refresh the page to check your payment status.');
          removePendingPayment(checkoutId);
          activeMonitorsRef.current.delete(checkoutId);
        }
      }
    };
    
    // Start monitoring immediately
    setTimeout(checkPaymentStatus, 2000);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  };

  // Get fixed monthly payment amount for selected lot
  const getFixedPaymentAmount = (lotId) => {
    console.log('Getting fixed amount for lot:', lotId);
    console.log('Available payment plans:', customerPaymentPlans);
    
    const plan = customerPaymentPlans.find(p => p.lot_id == lotId);
    console.log('Found plan for lot:', plan);
    
    if (plan) {
      if (plan.payment_term_months === 0) {
        console.log('Lot is fully paid, returning 0');
        return 0; // Fully paid - no monthly payment
      }
      console.log('Returning monthly amount:', plan.monthly_amount);
      return parseFloat(plan.monthly_amount);
    }
    console.log('No plan found, using default 1000');
    return 1000; // Default fallback
  };

  // Update payment amount when lot is selected
  const handleLotSelection = (lotId) => {
    console.log('=== LOT SELECTION DEBUG ===');
    console.log('Selected Lot ID:', lotId);
    
    setSelectedLotForPayment(lotId);
    const fixedAmount = getFixedPaymentAmount(lotId);
    
    console.log('Fixed amount for lot:', fixedAmount);
    console.log('Payment plans:', customerPaymentPlans);
    
    setMonthPaymentAmount(fixedAmount);
  };

  useEffect(() => {
    console.log('useEffect triggered, user:', user);
    if (user?.id) {
      loadPaymentData();
      // Auto-sync Paymongo payments on page load
      autoSyncPaymongoPayments(true); // Show notifications for initial sync
      
      // Check if user was redirected from Paymongo (look for URL parameters)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('payment') === 'success') {
        console.log('User redirected from Paymongo with success, forcing refresh...');
        // Clean up URL immediately
        window.history.replaceState({}, document.title, window.location.pathname);
        
        setTimeout(() => {
          loadPaymentData(true);
          loadMonthlyPaymentStatus();
          setSuccess('Payment completed successfully! Your monthly status has been updated.');
          setStep(0); // Ensure we're on the monthly status tab
        }, 1000);
      } else if (urlParams.get('payment') === 'cancelled') {
        console.log('User cancelled payment on Paymongo');
        // Clean up URL immediately
        window.history.replaceState({}, document.title, window.location.pathname);
        setError('Payment was cancelled. You can try again anytime.');
        setStep(2); // Go to payment form
      }
    } else {
      console.log('No user ID found, not loading data');
    }
    
  }, [user?.id]);

  // Set up periodic auto-sync every 2 minutes
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      console.log('Periodic auto-sync check...');
      autoSyncPaymongoPayments(false); // Don't show notifications for background sync
    }, 120000); // 2 minutes

    return () => {
      clearInterval(interval);
    };
  }, [user?.id]);

  // Reset month selection when payment type changes
  useEffect(() => {
    if (paymentType === "general") {
      setSelectedMonthsForPayment([]);
      setSelectedLotForPayment("");
    }
  }, [paymentType]);

  // Auto-select next unpaid month when lot is selected (one month at a time)
  useEffect(() => {
    if (selectedLotForPayment && monthlyStatus.length > 0) {
      const lotStatus = monthlyStatus.find(ls => ls.lot_id == selectedLotForPayment);
      if (lotStatus && lotStatus.monthly_payments) {
        const nextUnpaidMonth = lotStatus.monthly_payments.find(month => !month.paid);
        if (nextUnpaidMonth && !selectedMonthsForPayment.includes(nextUnpaidMonth.year_month)) {
          // Only select the next unpaid month (one at a time)
          setSelectedMonthsForPayment([nextUnpaidMonth.year_month]);
          // Set amount for this single month
          const amount = nextUnpaidMonth.overdue && nextUnpaidMonth.amount_with_penalty 
            ? toNumber(nextUnpaidMonth.amount_with_penalty)
            : toNumber(nextUnpaidMonth.amount);
          setMonthPaymentAmount(amount);
        }
      }
    }
  }, [selectedLotForPayment, monthlyStatus]);

  // No search or entries controls, just show all data for now
  const paginated = paymentHistory;
  
  console.log('Payment history state:', paymentHistory);
  console.log('Paginated data:', paginated);
  console.log('Selected months for payment:', selectedMonthsForPayment);
  console.log('Payment type:', paymentType);

  return (
    <div className="flex min-h-screen bg-gray-50 px-3 sm:px-6">
      <div className="flex-1 flex flex-col items-center py-6 w-full">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6 w-full max-w-6xl">
          <Typography variant="h4" className="text-2xl sm:text-3xl">PAYMENTS</Typography>
          <div className="flex flex-col gap-3 w-full lg:w-auto">
            <Typography variant="small" className="text-gray-500">
              User ID: {user?.id || 'Not logged in'} | Records: {paymentHistory.length} | 
              <span className="text-green-600 ml-1">🔄 Auto-sync enabled</span>
              {lastSyncTime && <span className="text-blue-600 ml-2">Last sync: {lastSyncTime}</span>}
            </Typography>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                variant="outlined"
                size="sm"
                onClick={() => {
                  console.log('Force refreshing all payment data...');
                  loadPaymentData(true);
                  loadMonthlyPaymentStatus();
                  loadCustomerPaymentPlans();
                }}
                disabled={loading}
                className="px-4 py-2"
              >
                {loading ? "Loading..." : "🔄 Force Refresh"}
              </Button>
              <Button
                variant="filled"
                size="sm"
                onClick={syncPaymongoPayments}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white"
              >
                Manual Sync
              </Button>
            </div>
          </div>
        </div>
        
        <Card className="w-full max-w-6xl p-4 sm:p-6 shadow-none border-none bg-white">
          {step === 0 && (
            <>
              {/* Monthly Payment Status */}
              <div className="mb-6">
                <Typography variant="h5" className="mb-4">Monthly Payment Status</Typography>
                
                {monthlySummary && (
                  <div className="space-y-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <Typography variant="h6" className="text-blue-800 mb-2">Account Information</Typography>
                      <Typography variant="small" className="text-blue-700">
                        Account created: {monthlySummary.account_created} | 
                        Showing: {monthlySummary.months_displayed} months from creation
                      </Typography>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <Typography variant="h6" className="text-gray-800">Total Lots</Typography>
                        <Typography variant="h4" className="text-gray-600">{monthlySummary.total_lots}</Typography>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <Typography variant="h6" className="text-green-800">Paid Months</Typography>
                        <Typography variant="h4" className="text-green-600">{monthlySummary.total_paid_months}</Typography>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg">
                        <Typography variant="h6" className="text-red-800">Pending Months</Typography>
                        <Typography variant="h4" className="text-red-600">{monthlySummary.total_pending_months}</Typography>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <Typography variant="h6" className="text-purple-800">Payment Rate</Typography>
                        <Typography variant="h4" className="text-purple-600">{monthlySummary.payment_rate}%</Typography>
                      </div>
                    </div>
                  </div>
                )}
                
                {monthlyStatus.length > 0 ? (
                  <div className="space-y-4">
                    {monthlyStatus.map((lotStatus, lotIndex) => {
                      const months = Array.isArray(lotStatus.monthly_payments) ? lotStatus.monthly_payments : [];
                      const totalMonths = months.length;
                      const paidMonths = months.filter((m) => m.paid).length;
                      const totalPrice = months.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
                      const nextDue = months.find((m) => !m.paid);
                      const nextDueText = nextDue ? formatMonthWithDay(nextDue) : 'All payments complete';
                      const overdueMonths = months.filter((m) => !m.paid && m.overdue);
                      const overdueText = overdueMonths.length > 0
                        ? overdueMonths.map((m) => formatMonthWithDay(m)).join(', ')
                        : '';

                      const paidReceipts = months.filter((m) => m.paid && m.receipt_url);
                      const lotIdKey = lotStatus.lot_id || lotIndex;
                      const isReceiptsOpen = !!receiptVisibility[lotIdKey];

                      return (
                        <div
                          key={lotIndex}
                          className="border rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                        >
                          <div className="flex-1">
                            <Typography variant="h6" className="text-gray-800">
                              {lotStatus.lot_display} ({lotStatus.garden})
                            </Typography>
                            <Typography variant="small" className="text-gray-600">
                              Total Contract Price: {formatCurrency(totalPrice)}
                            </Typography>
                            {totalMonths > 0 && (
                              <Typography variant="small" className="text-gray-500">
                                Next Due: {nextDueText}
                              </Typography>
                            )}
                            {overdueText && (
                              <Typography variant="small" className="text-red-600 font-semibold">
                                Overdue: {overdueText}
                              </Typography>
                            )}
                            {paidReceipts.length > 0 && (
                              <div className="mt-2">
                                <Button
                                  size="sm"
                                  color="blue"
                                  variant="text"
                                  onClick={() =>
                                    setReceiptVisibility((prev) => ({
                                      ...prev,
                                      [lotIdKey]: !prev[lotIdKey],
                                    }))
                                  }
                                >
                                  {isReceiptsOpen ? 'Hide Receipts' : 'View Receipts'}
                                </Button>
                              </div>
                            )}
                            {isReceiptsOpen && paidReceipts.length > 0 && (
                              <div className="mt-3 border-t pt-3 space-y-2 md:max-w-sm">
                                {paidReceipts.map((receiptMonth, idx) => (
                                  <div
                                    key={`${lotIdKey}-receipt-${idx}`}
                                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm"
                                  >
                                    <span>
                                      {receiptMonth.due_date
                                        ? formatMonthWithDay(receiptMonth)
                                        : (receiptMonth.display || `Payment ${idx + 1}`)}
                                    </span>
                                    <div className="shrink-0">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded border border-blue-500 px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                                        onClick={() => window.open(receiptMonth.receipt_url, '_blank', 'noopener')}
                                      >
                                        <ArrowDownTrayIcon className="h-4 w-4" />
                                        Download
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-left md:text-right md:ml-6">
                            <Typography variant="h4" className="text-blue-600 font-bold">
                              {paidMonths}/{totalMonths || 0}
                            </Typography>
                            <Typography variant="small" className="text-gray-500">
                              {totalMonths === 0
                                ? 'No payment yet'
                                : paidMonths === 0
                                  ? 'No payment yet'
                                  : paidMonths === totalMonths
                                    ? 'Payment completed'
                                    : `${paidMonths} month${paidMonths === 1 ? '' : 's'} paid`}
                            </Typography>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Typography variant="h6" className="text-gray-500 mb-2">No lots found</Typography>
                    <Typography variant="small" className="text-gray-400">
                      Please contact the administrator to assign lots to your account.
                    </Typography>
                  </div>
                )}
              </div>
              
              {/* Unified Payment Form */}
              <div className="border rounded-lg p-6 mb-6">
                <Typography variant="h6" className="mb-2">Make Payment</Typography>
                <Typography variant="small" className="text-gray-600 mb-4 block">
                  Choose between monthly payment (for specific months) or general payment (any amount).
                </Typography>
                
                {/* Payment Type Selector */}
                <div className="mb-4">
                  <Typography variant="small" className="mb-2 block">Payment Type</Typography>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentType"
                        value="monthly"
                        checked={paymentType === "monthly"}
                        onChange={(e) => setPaymentType(e.target.value)}
                        className="rounded"
                      />
                      <Typography variant="small">Monthly Payment (for specific months)</Typography>
                    </label>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  {/* Lot Selection */}
                  <div>
                    <Typography variant="small" className="mb-2 block">Select Lot</Typography>
                    <select
                      value={paymentType === "monthly" ? selectedLotForPayment : selectedLot}
                      onChange={(e) => {
                        if (paymentType === "monthly") {
                          handleLotSelection(e.target.value); // Use new function to set fixed amount
                          setSelectedMonthsForPayment([]); // Reset month selection when lot changes
                        } else {
                          setSelectedLot(e.target.value);
                        }
                      }}
                      className="w-full border rounded p-2"
                    >
                      <option value="">Choose a lot</option>
                      {paymentType === "monthly" ? (
                        monthlyStatus && monthlyStatus.length > 0 ? (
                          monthlyStatus
                            .filter(lotStatus => {
                              // Only show lots with active payment plans
                              const plan = customerPaymentPlans.find(p => p.lot_id == lotStatus.lot_id);
                              return plan && plan.payment_term_months > 0 && plan.status === 'active';
                            })
                            .map((lotStatus) => (
                              <option key={lotStatus.lot_id} value={lotStatus.lot_id}>
                                {lotStatus.lot_display} ({lotStatus.garden}) - ₱{getFixedPaymentAmount(lotStatus.lot_id)}/month
                              </option>
                            ))
                        ) : (
                          customerLotsData.map(lot => (
                            <option key={lot.id} value={lot.id}>{lot.display_name}</option>
                          ))
                        )
                      ) : (
                        customerLotsData.map(lot => (
                          <option key={lot.id} value={lot.id}>{lot.display_name}</option>
                        ))
                      )}
                    </select>
                  </div>
                  
                  {/* Next Payment Due (Sequential Payment Enforcement) */}
                  {paymentType === "monthly" && (
                    <div className="md:col-span-2">
                      <Typography variant="small" className="mb-2 block">Next Payment Due</Typography>
                      {selectedLotForPayment ? (
                        <div className="border rounded p-3">
                          {(() => {
                            if (!selectedLotStatus) {
                              return <Typography variant="small" color="gray">No payment data available</Typography>;
                            }
                            
                            if (!nextUnpaidMonthForSelectedLot) {
                              return (
                                <div className="text-center p-3 bg-green-50 rounded">
                                  <Typography variant="small" color="green" className="font-bold">
                                    ✅ All payments are up to date!
                                  </Typography>
                                </div>
                              );
                            }
                            
                            const containerClasses = nextMonthIsOverdue
                              ? 'bg-red-50 border border-red-200'
                              : 'bg-blue-50 border-blue-200';
                            const amountToShow = nextMonthIsOverdue
                              ? nextMonthBaseAmount
                              : monthPaymentAmount;
                            
                            return (
                              <div className={`p-3 rounded ${containerClasses}`}>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <Typography variant="small" className={`font-bold ${nextMonthIsOverdue ? 'text-red-600' : 'text-blue-600'}`}>
                                      {nextMonthIsOverdue ? '⚠️ OVERDUE: ' : '📅 DUE: '}{formatMonthWithDay(nextUnpaidMonthForSelectedLot)}
                                    </Typography>
                                    <Typography variant="small" color="gray">
                                      Due Date: {nextUnpaidMonthForSelectedLot.due_date ? new Date(nextUnpaidMonthForSelectedLot.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : formatMonthWithDay(nextUnpaidMonthForSelectedLot)}
                                    </Typography>
                                    <Typography variant="small" color="gray">
                                      Amount: {formatCurrency(amountToShow)}
                                    </Typography>
                                  </div>
                                  <div className="text-right">
                                    {nextMonthIsOverdue ? (
                                      <Typography variant="small" color="red" className="font-bold text-xs">
                                        PAYMENT MISSED
                                      </Typography>
                                    ) : (
                                      <Typography variant="small" color="blue" className="font-bold text-xs">
                                        PENDING
                                      </Typography>
                                    )}
                                  </div>
                                </div>
                                {nextMonthIsOverdue && (
                                  <div className="mt-3 rounded border border-red-200 bg-white/90 p-3 text-xs text-red-700">
                                    <div className="font-semibold">Overdue months must be paid onsite.</div>
                                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                      <div>
                                        <div className="uppercase text-[11px] text-gray-500">Normal amount</div>
                                        <div className="text-sm font-bold text-gray-900">{formatCurrency(nextMonthBaseAmount)}</div>
                                      </div>
                                      <div>
                                        <div className="uppercase text-[11px] text-gray-500">3% penalty</div>
                                        <div className="text-sm font-bold text-red-600">{formatCurrency(nextMonthPenaltyAmount)}</div>
                                      </div>
                                      <div>
                                        <div className="uppercase text-[11px] text-gray-500">Onsite total</div>
                                        <div className="text-sm font-black text-red-700">{formatCurrency(nextMonthBaseAmount + nextMonthPenaltyAmount)}</div>
                                      </div>
                                    </div>
                                    <div className="mt-2">
                                      Please visit the office so our cashier can apply the 3% penalty properly. Online checkout remains disabled for overdue months to prevent incorrect amounts.
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="border rounded p-3 text-gray-500 text-sm">
                          Please select a lot first
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Payment Amount (only shown for general payments; hidden since general option is removed) */}
                  {paymentType === "general" && (
                    <div className="md:col-span-3">
                      <Typography variant="small" className="mb-2 block">Payment Amount (PHP)</Typography>
                      <Input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0;
                          setPaymentAmount(amount);
                        }}
                        placeholder="Enter amount"
                        className="!border !border-gray-300"
                        labelProps={{
                          className: "hidden",
                        }}
                      />
                      <Typography variant="small" color="gray" className="mt-1">
                        Minimum amount: ₱20.00
                      </Typography>
                    </div>
                  )}
                </div>
                
                {/* Payment Plan Info */}
                {paymentType === "monthly" && selectedLotForPayment && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    {(() => {
                      const plan = customerPaymentPlans.find(p => p.lot_id == selectedLotForPayment);
                      if (plan) {
                        if (plan.payment_term_months === 0) {
                          return (
                            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                              <Typography variant="small" color="green" className="font-bold">
                                ✅ This lot is FULLY PAID - No monthly payments required
                              </Typography>
                              <Typography variant="small" color="green" className="mt-1">
                                You have already completed all payments for this lot.
                              </Typography>
                            </div>
                          );
                        } else {
                          return (
                            <div>
                              <Typography variant="small" color="blue-gray" className="font-medium mb-2">
                                Payment Plan for {plan.lot_display}:
                              </Typography>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>Payment Term: <strong>{plan.payment_term_months} months</strong></div>
                                <div>Monthly Amount: <strong>{formatCurrency(plan.monthly_amount)}</strong></div>
                                <div>Total Amount: <strong>{formatCurrency(plan.total_amount)}</strong></div>
                                <div>Remaining: <strong>{formatCurrency(plan.progress.remaining_balance)}</strong></div>
                              </div>
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}
                  </div>
                )}
                
                <div className="flex justify-center">
                  <Button
                    color="blue"
                    onClick={handleUnifiedPayment}
                    disabled={
                      isProcessing || 
                      (paymentType === "monthly" ? 
                        (!selectedLotForPayment || selectedMonthsForPayment.length === 0 || monthPaymentAmount <= 0 || isMonthlyPaymentBlocked) :
                        (!selectedLot || paymentAmount < 20)
                      )
                    }
                    className="px-8 py-3"
                  >
                    {isProcessing ? "Processing..." : 
                     paymentType === "monthly" ? (
                       isMonthlyPaymentBlocked ? 
                       "Overdue payments must be paid onsite" :
                       selectedMonthsForPayment.length === 0 ? 
                         "Select a lot to pay" :
                         `Pay ${formatCurrency(monthPaymentAmount)}`
                     ) : (
                       `Pay ${formatCurrency(paymentAmount)}`
                     )
                    }
                  </Button>
                </div>
              </div>
              
            </>
          )}
          
          {step === 1 && (
            <>
              {/* Payment History */}
              <div className="mb-6">
                <Typography variant="h5" className="mb-4">Payment History</Typography>
              </div>
              
              {/* Error Message */}
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <Typography variant="small" color="red">
                    {error}
                  </Typography>
                </div>
              )}
              
              {/* Table */}
              <div className="overflow-x-auto mb-8 w-full">
                <table className="w-full border text-left text-base">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-3 px-6">Payment Date</th>
                      <th className="py-3 px-6">Lot No.</th>
                      <th className="py-3 px-6">Amount</th>
                      <th className="py-3 px-6">Method</th>
                      <th className="py-3 px-6">Status</th>
                      <th className="py-3 px-6">Source</th>
                      <th className="py-3 px-6">Ref. No.</th>
                      <th className="py-3 px-6">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="8" className="py-8 px-6 text-center text-gray-500">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            Loading payment history...
                          </div>
                        </td>
                      </tr>
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-8 px-6 text-center text-gray-500">
                          <div className="flex flex-col items-center gap-2">
                            <Typography variant="h6" color="gray">
                              No payment history found
                            </Typography>
                            <Typography variant="small" color="gray">
                              Your payment records will appear here once you make a payment.
                            </Typography>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginated.map((payment, i) => (
                        <tr key={`${payment.id}-${i}`} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-6">
                            {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3 px-6">
                            {payment.lot_display || `${payment.sector_name}${payment.block_number}-${payment.lot_number}`}
                          </td>
                          <td className="py-3 px-6">{formatCurrency(payment.payment_amount)}</td>
                          <td className="py-3 px-6">{payment.payment_method}</td>
                          <td className="py-3 px-6">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              payment.status === 'Paid' ? 'bg-green-100 text-green-800' :
                              payment.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {payment.status}
                            </span>
                          </td>
                          <td className="py-3 px-6">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              payment.is_paymongo ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {payment.is_paymongo ? 'Paymongo' : 'Local'}
                            </span>
                          </td>
                          <td className="py-3 px-6">{payment.id}</td>
                          <td className="py-3 px-6">
                            {payment.receipt_url ? (
                              <Button
                                variant="text"
                                color="blue"
                                size="sm"
                                className="p-0 font-medium underline-offset-4"
                                onClick={() => window.open(payment.receipt_url, "_blank", "noopener")}
                              >
                                Download
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Navigation Buttons */}
              <div className="flex justify-center mt-6 gap-4">
                <Button
                  variant="outlined"
                  color="gray"
                  onClick={() => setStep(0)}
                  className="px-6 py-2"
                >
                  Monthly Status
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
} 

