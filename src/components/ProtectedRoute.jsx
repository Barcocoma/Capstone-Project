import { Navigate } from "react-router-dom";
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '@/configs/api';

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading, logout, wasLoggedOut } = useAuth();
  const [sessionValid, setSessionValid] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // NUCLEAR: Aggressive session validation - block access immediately if logged out
  useEffect(() => {
    // NUCLEAR: Check localStorage for logout state
    const localStorageLoggedOut = localStorage.getItem('userLoggedOut') === 'true';
    const hasUserInStorage = localStorage.getItem('user') !== null;
    
    // If user was logged out OR no user in storage, immediately block access
    if (wasLoggedOut || localStorageLoggedOut || !hasUserInStorage) {
      setSessionValid(false);
      setCheckingSession(false);
      // NUCLEAR: Force redirect immediately
      window.location.replace('/auth/sign-in');
      return;
    }

    const validateSession = async () => {
      if (!user) {
        setSessionValid(false);
        setCheckingSession(false);
        return;
      }

      try {
        const response = await fetch(API_ENDPOINTS.SESSION, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        const result = await response.json();
        
        if (result.success && result.user) {
          setSessionValid(true);
        } else {
          // Session invalid, force logout
          await logout();
          setSessionValid(false);
        }
      } catch (error) {
        console.error('Session validation error:', error);
        // On network error, be more aggressive - assume invalid if no user
        if (!user) {
          setSessionValid(false);
        } else {
          setSessionValid(true); // Allow if user exists and just network issue
        }
      } finally {
        setCheckingSession(false);
      }
    };

    // Only validate session on initial load or when user changes
    validateSession();
  }, [user, logout, wasLoggedOut]);

  // Show loading while checking session
  if (loading || checkingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Validating session...</p>
        </div>
      </div>
    );
  }

  // ULTRA AGGRESSIVE: Redirect to login if no user or session invalid
  if (!user || !sessionValid) {
    // Use window.location.replace to completely bypass React Router
    window.location.replace('/auth/sign-in');
    return null;
  }

  // Role-based access control
  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.user_type)) {
    // Redirect to appropriate dashboard based on user role
    switch (user.user_type) {
      case 'admin':
        window.location.replace('/dashboard');
        return null;
      case 'cemetery_staff':
        window.location.replace('/dashboard/plots');
        return null;
      case 'cashier':
        window.location.replace('/dashboard/payments');
        return null;
      case 'customer':
        window.location.replace('/dashboard/my-plots');
        return null;
      default:
        window.location.replace('/dashboard');
        return null;
    }
  }

  return children;
}

export default ProtectedRoute; 