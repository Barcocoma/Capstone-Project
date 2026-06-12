// Global Security Utilities
// This file provides global security functions that run on every page load

// Check if user was logged out (stored in localStorage for persistence)
export const getLoggedOutState = () => {
  return localStorage.getItem('userLoggedOut') === 'true';
};

export const setLoggedOutState = (loggedOut) => {
  if (loggedOut) {
    localStorage.setItem('userLoggedOut', 'true');
  } else {
    localStorage.removeItem('userLoggedOut');
  }
};

// Block any access to protected pages after logout
export const blockHistoryAfterLogout = () => {
  // NUCLEAR OPTION: Check if user was logged out
  if (getLoggedOutState()) {
    // If trying to access dashboard, immediately redirect
    if (window.location.pathname.includes('/dashboard')) {
      window.location.replace('/auth/sign-in');
      return;
    }
  }

  // NUCLEAR OPTION: Set up global history blocker
  const handlePopState = (event) => {
    if (getLoggedOutState() && window.location.pathname.includes('/dashboard')) {
      event.preventDefault();
      // NUCLEAR: Force page reload to completely clear everything
      window.location.href = '/auth/sign-in';
    }
  };

  // Add global listener
  window.addEventListener('popstate', handlePopState);

  // NUCLEAR: Also block beforeunload to prevent any navigation
  const handleBeforeUnload = (event) => {
    if (getLoggedOutState() && window.location.pathname.includes('/dashboard')) {
      event.preventDefault();
      window.location.href = '/auth/sign-in';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  // Return cleanup function
  return () => {
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
};

// Check for protected access and block immediately
export const checkProtectedAccess = () => {
  if (getLoggedOutState() && window.location.pathname.includes('/dashboard')) {
    window.location.replace('/auth/sign-in');
    return true; // Access blocked
  }
  return false; // Access allowed
};

// Ultra aggressive security - runs on every page load
export const initGlobalSecurity = () => {
  // NUCLEAR OPTION: Check for protected access immediately
  if (checkProtectedAccess()) {
    return;
  }

  // Set up global history blocker
  const cleanup = blockHistoryAfterLogout();

  // NUCLEAR OPTION: Block any access to dashboard after logout
  if (getLoggedOutState() && window.location.pathname.includes('/dashboard')) {
    // Clear ALL history and force redirect
    window.history.replaceState(null, '', '/auth/sign-in');
    window.location.replace('/auth/sign-in');
    
    // NUCLEAR: Force page reload to completely clear everything
    setTimeout(() => {
      window.location.href = '/auth/sign-in';
    }, 50);
  }

  return cleanup;
};
