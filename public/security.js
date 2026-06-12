// NUCLEAR SECURITY SCRIPT - Runs immediately on page load, before React
// This is the most aggressive security possible

(function() {
  'use strict';
  
  // Check if user was logged out and block access immediately
  function checkNuclearSecurity() {
    // Check if user was logged out (use localStorage for persistence)
    const wasLoggedOut = localStorage.getItem('userLoggedOut') === 'true';
    const hasUser = localStorage.getItem('user') !== null;
    
    // If logged out OR no user and trying to access dashboard, NUCLEAR REDIRECT
    if ((wasLoggedOut || !hasUser) && window.location.pathname.includes('/dashboard')) {
      // NUCLEAR: Completely destroy everything and redirect
      window.history.replaceState(null, '', '/auth/sign-in');
      window.location.replace('/auth/sign-in');
      
      // NUCLEAR: Force page reload to completely clear everything
      setTimeout(function() {
        window.location.href = '/auth/sign-in';
      }, 10);
      
      return true; // Access blocked
    }
    
    return false; // Access allowed
  }
  
  // NUCLEAR: Set up global history blocker that runs immediately
  function setupNuclearHistoryBlocker() {
    function handlePopState(event) {
      const wasLoggedOut = localStorage.getItem('userLoggedOut') === 'true';
      const hasUser = localStorage.getItem('user') !== null;
      
      if ((wasLoggedOut || !hasUser) && window.location.pathname.includes('/dashboard')) {
        event.preventDefault();
        // NUCLEAR: Force page reload to completely clear everything
        window.location.href = '/auth/sign-in';
      }
    }

    // Add global listener immediately
    window.addEventListener('popstate', handlePopState);
  }
  
  // NUCLEAR: Initialize security immediately
  function initNuclearSecurity() {
    // Check security immediately
    if (checkNuclearSecurity()) {
      return;
    }
    
    // Set up nuclear history blocker
    setupNuclearHistoryBlocker();
  }
  
  // NUCLEAR: Initialize security immediately when script loads
  initNuclearSecurity();
  
  // NUCLEAR: Also run security check on every page load
  window.addEventListener('load', function() {
    checkNuclearSecurity();
  });
  
  // NUCLEAR: Run security check on every page show
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      checkNuclearSecurity();
    }
  });
  
})();
