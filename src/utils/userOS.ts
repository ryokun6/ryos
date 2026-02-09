export const detectUserOS = (unknownLabel: string = "Unknown"): string => {
  if (typeof navigator === "undefined") {
    return unknownLabel;
  }

  const userAgent = navigator.userAgent;
  const platform = navigator.platform || "";

  // Check for iOS (iPhone, iPad, iPod)
  if (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "iOS";
  }

  // Check for Android
  if (/Android/.test(userAgent)) {
    return "Android";
  }

  // Check for Windows
  if (/Win/.test(platform)) {
    return "Windows";
  }

  // Check for macOS (not iOS)
  if (/Mac/.test(platform)) {
    return "macOS";
  }

  // Check for Linux
  if (/Linux/.test(platform)) {
    return "Linux";
  }

  return unknownLabel;
};
