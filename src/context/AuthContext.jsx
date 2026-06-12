import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '@/configs/api';
import { setLoggedOutState } from '@/utils/globalSecurity';
import { nuclearLogout } from '@/utils/nuclearSecurity';

const AuthContext = createContext(null);

// Demo users removed; login is backend-only

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wasLoggedOut, setWasLoggedOut] = useState(false);
  const navigate = useNavigate();

  // Validate session with backend
  const validateSession = async () => {
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
      return result.success && result.user;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  };

  // Load user data from localStorage on mount and validate session
  useEffect(() => {
    const initializeAuth = async () => {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          
          // Validate session with backend
          const isSessionValid = await validateSession();
          
          if (isSessionValid) {
            setUser(userData);
          } else {
            // Session invalid, clear local data
            localStorage.removeItem('user');
            setUser(null);
          }
        } catch (error) {
          console.error('Error parsing saved user data:', error);
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (username, password, options = {}) => {
    try {
      const skipEmail = !!options.skipEmail;
      
      const response = await fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({ username, password, skip_email: skipEmail })
      });
      const result = await response.json();
      if (!result.success) return { success: false, message: result.message || 'Invalid credentials' };

      // Check if email is required for customer accounts
      if (result.requires_email) {
        return {
          success: true,
          requires_email: true,
          user: result.user,
          message: result.message || 'Email address is required for customer accounts'
        };
      }

      // Complete login (2FA disabled)
      const backendUser = result.user || {};
      const normalizedUser = {
        ...backendUser,
        user_type: backendUser.user_type || backendUser.account_type || 'customer',
      };
      setUser(normalizedUser);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      
      // Clear any cached data from previous sessions
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }
      
      // Reset logout flag on successful login
      setWasLoggedOut(false);
      
      // Reset global logout state
      setLoggedOutState(false);
      
      // Clear logout flag from localStorage
      localStorage.removeItem('userLoggedOut');
      
      // Check if password change is required
      if (result.requires_password_change) {
        return { 
          success: true, 
          user: normalizedUser,
          requires_password_change: true
        };
      }
      
      switch (normalizedUser.user_type) {
        case 'admin':
        case 'cemetery_staff':
        case 'staff':
        case 'cashier':
          navigate('/dashboard', { replace: true });
          break;
        case 'customer':
          navigate('/dashboard', { replace: true });
          break;
        default:
          navigate('/auth/sign-in', { replace: true });
      }
      return { success: true, user: normalizedUser };
    } catch (e) {
      return { success: false, message: 'Unable to reach server' };
    }
  };

  const changePassword = async (userId, newPassword, confirmPassword) => {
    try {
      const response = await fetch(API_ENDPOINTS.CHANGE_PASSWORD, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': userId?.toString() || ''
        },
        body: JSON.stringify({ 
          user_id: userId,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });
      const result = await response.json();
      return result;
    } catch (e) {
      return { success: false, message: 'Unable to reach server' };
    }
  };

  const addEmailDuringLogin = async (userId, email) => {
    try {
      const response = await fetch(API_ENDPOINTS.ADD_EMAIL_DURING_LOGIN, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          user_id: userId,
          email: email
        })
      });
      const result = await response.json();
      return result;
    } catch (e) {
      return { success: false, message: 'Unable to reach server' };
    }
  };

  const logout = async () => {
    try {
      // Call logout API with cache-busting headers
      await fetch(API_ENDPOINTS.LOGOUT, { 
        method: 'POST',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    } catch (_) {}
    
    // Mark that user was logged out
    setWasLoggedOut(true);
    
    // Set global logout state
    setLoggedOutState(true);
    
    // Set logout flag in localStorage BEFORE clearing user data
    localStorage.setItem('userLoggedOut', 'true');
    
    // Clear all user data and cache
    setUser(null);
    localStorage.removeItem('user');
    sessionStorage.clear();
    
    // Clear browser cache for security
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }
    
    // NUCLEAR OPTION: Use nuclear logout to completely destroy everything
    nuclearLogout();
  };

  // Update user profile (email, contact, photo)
  const updateProfile = (updates) => {
    setUser((prev) => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  const value = {
    user,
    login,
    logout,
    loading,
    updateProfile,
    validateSession,
    wasLoggedOut,
    addEmailDuringLogin,
    changePassword
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 