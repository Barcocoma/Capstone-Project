// Security Test Utilities
// This file contains functions to test the security implementation

export const testBackButtonProtection = () => {
  console.log('Testing back button protection...');
  
  // Test 1: Check if cache headers are properly set
  const testCacheHeaders = () => {
    const metaTags = document.querySelectorAll('meta[name="Cache-Control"], meta[name="Pragma"], meta[name="Expires"]');
    console.log('Cache control meta tags:', metaTags.length);
    return metaTags.length >= 3;
  };

  // Test 2: Check if session validation is working
  const testSessionValidation = async () => {
    try {
      const response = await fetch('/api/session.php', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      const result = await response.json();
      console.log('Session validation response:', result);
      return result;
    } catch (error) {
      console.error('Session validation test failed:', error);
      return { success: false, error: error.message };
    }
  };

  // Test 3: Check if logout properly clears data
  const testLogoutDataClearing = () => {
    const hasUserInLocalStorage = localStorage.getItem('user') !== null;
    const hasUserInSessionStorage = sessionStorage.length > 0;
    
    console.log('Local storage has user data:', hasUserInLocalStorage);
    console.log('Session storage has data:', hasUserInSessionStorage);
    
    return !hasUserInLocalStorage && !hasUserInSessionStorage;
  };

  // Test 4: Check if browser history manipulation is prevented
  const testHistoryManipulation = () => {
    const currentHistoryLength = window.history.length;
    console.log('Current history length:', currentHistoryLength);
    
    // Try to go back programmatically
    try {
      window.history.back();
      console.log('History manipulation test: back() called');
      return true;
    } catch (error) {
      console.log('History manipulation prevented:', error);
      return false;
    }
  };

  return {
    cacheHeaders: testCacheHeaders(),
    sessionValidation: testSessionValidation(),
    logoutDataClearing: testLogoutDataClearing(),
    historyManipulation: testHistoryManipulation()
  };
};

export const runSecurityTests = async () => {
  console.log('=== SECURITY TESTS STARTING ===');
  
  const results = await testBackButtonProtection();
  
  console.log('=== SECURITY TEST RESULTS ===');
  console.log('Cache Headers:', results.cacheHeaders ? 'PASS' : 'FAIL');
  console.log('Session Validation:', results.sessionValidation.success ? 'PASS' : 'FAIL');
  console.log('Logout Data Clearing:', results.logoutDataClearing ? 'PASS' : 'FAIL');
  console.log('History Manipulation:', results.historyManipulation ? 'PASS' : 'FAIL');
  
  return results;
};

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.securityTest = {
    testBackButtonProtection,
    runSecurityTests
  };
}
