// NUCLEAR SECURITY - Runs immediately on page load, before React initializes
// This is the most aggressive security possible

// Check if user was logged out and block access immediately
const checkNuclearSecurity = () => {
  // Check if user was logged out (use localStorage for persistence)
  const wasLoggedOut = localStorage.getItem('userLoggedOut') === 'true';
  const hasUser = localStorage.getItem('user') !== null;
  
  // If logged out OR no user and trying to access dashboard, NUCLEAR REDIRECT
  if ((wasLoggedOut || !hasUser) && window.location.pathname.includes('/dashboard')) {
    // NUCLEAR: Completely destroy everything and redirect
    window.history.replaceState(null, '', '/auth/sign-in');
    window.location.replace('/auth/sign-in');
    
    // NUCLEAR: Force page reload to completely clear everything
    setTimeout(() => {
      window.location.href = '/auth/sign-in';
    }, 10);
    
    return true; // Access blocked
  }
  
  return false; // Access allowed
};

// NUCLEAR: Set up global history blocker that runs immediately
const setupNuclearHistoryBlocker = () => {
  const handlePopState = (event) => {
    const wasLoggedOut = localStorage.getItem('userLoggedOut') === 'true';
    const hasUser = localStorage.getItem('user') !== null;
    
    if ((wasLoggedOut || !hasUser) && window.location.pathname.includes('/dashboard')) {
      event.preventDefault();
      // NUCLEAR: Force page reload to completely clear everything
      window.location.href = '/auth/sign-in';
    }
  };

  // Add global listener immediately
  window.addEventListener('popstate', handlePopState);
  
  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
};

// NUCLEAR: Initialize security immediately
export const initNuclearSecurity = () => {
  // Check security immediately
  if (checkNuclearSecurity()) {
    return;
  }
  
  // Set up nuclear history blocker
  return setupNuclearHistoryBlocker();
};

// NUCLEAR: Force logout and block all access
export const nuclearLogout = () => {
  // Set logout state in localStorage
  localStorage.setItem('userLoggedOut', 'true');
  
  // NUCLEAR: Completely destroy everything
  window.history.replaceState(null, '', '/auth/sign-in');
  window.location.replace('/auth/sign-in');
  
  // NUCLEAR: Force page reload to completely clear everything
  setTimeout(() => {
    window.location.href = '/auth/sign-in';
  }, 10);
};
