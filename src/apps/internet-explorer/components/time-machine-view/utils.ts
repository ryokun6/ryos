export function getMaskStyle(canScroll: boolean) {
  const isMobile = window.innerWidth < 640;
  if (!canScroll) return "none";
  if (isMobile) {
    return `linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)`;
  }
  return `linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%)`;
}

export function getHostname(targetUrl: string): string {
  try {
    return new URL(
      targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`
    ).hostname;
  } catch {
    return targetUrl;
  }
}

export function timeMachineGenerateShareUrl(
  identifier: string,
  secondary?: string
): string {
  const encodeData = (urlToEncode: string, yearToEncode: string): string => {
    const combined = `${urlToEncode}|${yearToEncode}`;
    return btoa(combined)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };
  const code = encodeData(identifier, secondary || "current");
  return `${window.location.origin}/internet-explorer/${code}`;
}
