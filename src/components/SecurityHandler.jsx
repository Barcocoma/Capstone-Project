import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { getLoggedOutState, blockHistoryAfterLogout, checkProtectedAccess } from '@/utils/globalSecurity';

export function SecurityHandler() {
  const { user, validateSession, wasLoggedOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for protected access immediately
    if (checkProtectedAccess()) {
      return;
    }

    // Set up global history blocker
    const cleanup = blockHistoryAfterLogout();

    // ULTRA AGGRESSIVE: Block any access to dashboard after logout
    if (wasLoggedOut || getLoggedOutState() || (!user && location.pathname.includes('/dashboard'))) {
      // Clear ALL history and force redirect
      window.history.replaceState(null, '', '/auth/sign-in');
      window.location.replace('/auth/sign-in');
    }

    // Cleanup
    return cleanup;
  }, [user, navigate, location, wasLoggedOut]);

  // Add security headers to prevent caching
  useEffect(() => {
    // Set meta tags to prevent caching
    const metaTags = [
      { name: 'Cache-Control', content: 'no-cache, no-store, must-revalidate' },
      { name: 'Pragma', content: 'no-cache' },
      { name: 'Expires', content: '0' }
    ];

    metaTags.forEach(tag => {
      let meta = document.querySelector(`meta[name="${tag.name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = tag.name;
        document.head.appendChild(meta);
      }
      meta.content = tag.content;
    });

    // ULTRA AGGRESSIVE: Block access to dashboard if logged out
    if ((wasLoggedOut || getLoggedOutState() || !user) && location.pathname.includes('/dashboard')) {
      // Immediately redirect and clear history using window.location
      window.location.replace('/auth/sign-in');
    }

    // Prevent right-click context menu on sensitive pages
    const handleContextMenu = (e) => {
      if (location.pathname.includes('/dashboard')) {
        e.preventDefault();
      }
    };

    // Prevent F12, Ctrl+Shift+I, etc.
    const handleKeyDown = (e) => {
      if (location.pathname.includes('/dashboard')) {
        // Allow F5 for refresh
        if (e.key === 'F5') return;
        
        // Block common dev tools shortcuts
        if (
          e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && e.key === 'I') ||
          (e.ctrlKey && e.shiftKey && e.key === 'C') ||
          (e.ctrlKey && e.shiftKey && e.key === 'J') ||
          (e.ctrlKey && e.key === 'U')
        ) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [location.pathname, wasLoggedOut, user, navigate]);

  return null; // This component doesn't render anything
}

export default SecurityHandler;
