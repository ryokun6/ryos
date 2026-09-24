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
 * Check if the current device is mobile Safari
 */
export function isMobileSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  
  const userAgent = navigator.userAgent;
  return (
    /Safari/.test(userAgent) &&
    /Mobile|iP(hone|ad|od)/.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(userAgent)
  );
}

export type IosWebKitDetectInput = {
  userAgent?: string;
  maxTouchPoints?: number;
};

/**
 * Fail-safe detector for iPhone / iPad / iPod WebKit, including Chrome/Firefox/
 * Edge on iOS (CriOS/FxiOS/EdgiOS) and iPadOS 13+ desktop-mode UAs
 * (`Macintosh` + multi-touch). Used to disable Motion 13 WAAPI paths that can
 * take down the Desktop error boundary.
 */
export function isIosWebKit(input?: IosWebKitDetectInput): boolean {
  const userAgent =
    input?.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!userAgent) return false;

  const maxTouchPoints =
    input?.maxTouchPoints ??
    (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);

  const isIphoneOrIpod = /iP(hone|od)/.test(userAgent);
  const isIpad =
    /iPad/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

  return (isIphoneOrIpod || isIpad) && /AppleWebKit/i.test(userAgent);
}