/**
 * Device detection utilities
 */

/**
 * Check if the current device is mobile based on screen width and user agent
 */
export function isMobileDevice(): boolean {
  // Screen width check
  const isMobileScreen = window.innerWidth < 768;
  
  // User agent check for mobile devices
  const userAgent =
    navigator.userAgent ||
    navigator.vendor ||
    (window as unknown as { opera?: string }).opera || "";
  const isMobileUserAgent = /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(userAgent);
  
  // Touch capability check
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Consider it mobile if screen is small OR it's a mobile user agent with touch capability
  return isMobileScreen || (isMobileUserAgent && hasTouchScreen);
}

/**
 * Check if the device has touch capabilities
 */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Check if the device is a tablet (larger mobile device)
 */
export function isTabletDevice(): boolean {
  const isLargeScreen = window.innerWidth >= 768 && window.innerWidth <= 1024;
  const userAgent =
    navigator.userAgent ||
    navigator.vendor ||
    (window as unknown as { opera?: string }).opera || "";
  const isTabletUserAgent = /ipad|tablet|playbook|silk/i.test(userAgent);
  
  return (isLargeScreen && isTouchDevice()) || isTabletUserAgent;
}