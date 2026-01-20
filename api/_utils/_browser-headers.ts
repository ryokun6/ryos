/**
 * Browser header utilities for web proxy operations
 * 
 * Provides randomized, realistic browser fingerprints for fetching
 * web content in a way that appears like normal browser traffic.
 */

// ============================================================================
// User Agent Samples
// ============================================================================

/**
 * Curated list of realistic desktop browser fingerprints to rotate through.
 * Each entry includes User-Agent, Sec-CH-UA hints, and platform info.
 */
const USER_AGENT_SAMPLES = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    secChUa: '"Not_A Brand";v="8", "Chromium";v="122", "Google Chrome";v="122"',
    platform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    // Safari does not currently send Sec-CH-UA headers
    secChUa: "",
    platform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    secChUa: '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
    platform: '"Linux"',
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    // Firefox also omits Sec-CH-UA headers
    secChUa: "",
    platform: '"Windows"',
  },
] as const;

const ACCEPT_LANGUAGE_SAMPLES = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.8",
  "en-US,en;q=0.8,fr;q=0.6",
  "en-US,en;q=0.8,de;q=0.6",
] as const;

const SEC_FETCH_SITE_SAMPLES = ["none", "same-origin", "cross-site"] as const;

// ============================================================================
// Utilities
// ============================================================================

/**
 * Pick a random element from an array
 */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Generates a pseudo-random, yet realistic, browser header set.
 * 
 * We purposefully limit the pool to a handful of common fingerprints so that
 * the generated headers stay coherent and pass basic heuristics.
 * 
 * @returns A record of HTTP headers that simulate a real browser
 */
export function generateRandomBrowserHeaders(): Record<string, string> {
  const fp = pickRandom(USER_AGENT_SAMPLES);

  const headers: Record<string, string> = {
    "User-Agent": fp.ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": pickRandom(ACCEPT_LANGUAGE_SAMPLES),
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": pickRandom(SEC_FETCH_SITE_SAMPLES),
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  // Only attach Client-Hint headers if present in the selected fingerprint
  if (fp.secChUa) {
    headers["Sec-Ch-Ua"] = fp.secChUa;
    headers["Sec-Ch-Ua-Mobile"] = "?0";
    headers["Sec-Ch-Ua-Platform"] = fp.platform;
  }

  return headers;
}

/**
 * List of domains that should be automatically proxied (e.g., because they
 * block iframe embedding). Domains should be lowercase and without protocol.
 */
export const AUTO_PROXY_DOMAINS = [
  "wikipedia.org",
  "wikimedia.org",
  "wikipedia.com",
  "cursor.com",
] as const;

/**
 * Check if a URL's domain matches or is a subdomain of any auto-proxy domain
 */
export function shouldAutoProxy(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return AUTO_PROXY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    // Return false if URL parsing fails
    return false;
  }
}
