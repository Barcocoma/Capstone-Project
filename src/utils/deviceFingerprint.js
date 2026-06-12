/**
 * Generate a device fingerprint based on browser characteristics
 * This helps identify if a user is logging in from a new device
 */
export const generateDeviceFingerprint = () => {
  try {
    const components = [];
    
    // Screen resolution
    if (window.screen) {
      components.push(`screen:${window.screen.width}x${window.screen.height}`);
      components.push(`avail:${window.screen.availWidth}x${window.screen.availHeight}`);
    }
    
    // Timezone
    if (Intl && Intl.DateTimeFormat) {
      components.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    }
    
    // Language
    components.push(`lang:${navigator.language || navigator.userLanguage || 'unknown'}`);
    
    // Platform
    components.push(`platform:${navigator.platform || 'unknown'}`);
    
    // User agent (hashed for privacy)
    if (navigator.userAgent) {
      let hash = 0;
      const str = navigator.userAgent;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      components.push(`ua:${Math.abs(hash)}`);
    }
    
    // Canvas fingerprint (if available)
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        const canvasData = canvas.toDataURL();
        let hash = 0;
        for (let i = 0; i < canvasData.length; i++) {
          const char = canvasData.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        components.push(`canvas:${Math.abs(hash)}`);
      }
    } catch (e) {
      // Canvas fingerprinting not available
    }
    
    // Combine all components
    const fingerprint = components.join('|');
    
    // Create a simple hash of the fingerprint
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return `fp_${Math.abs(hash).toString(36)}`;
  } catch (error) {
    // Fallback to a random ID if fingerprinting fails
    return `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

