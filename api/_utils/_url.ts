export function normalizeUrlForCacheKey(url: string | undefined | null): string | null {
  if (!url) return null;

  let tempUrl = url.trim();
  // Ensure URL has a protocol for the URL constructor
  if (!tempUrl.startsWith('http://') && !tempUrl.startsWith('https://')) {
    tempUrl = `https://${tempUrl}`;
  }

  try {
    const parsed = new URL(tempUrl);
    // Key is based on origin + pathname.
    let keyPath = parsed.pathname;
    if (keyPath.endsWith('/')) {
      keyPath = keyPath.slice(0, -1); // Remove trailing slash from all paths
    }
    if (keyPath === '') {
      keyPath = ''; // Empty path for consistency with previous behavior
    }

    // Reconstruct the normalized URL including query params and hash
    const keyBase = `${parsed.origin}${keyPath}${parsed.search}${parsed.hash}`;
    return keyBase;

  } catch (e) {
    console.error(`[URL Normalization Error] Failed for URL: ${url}`, e);
    // Fallback to the https-prefixed version if URL parsing failed
    // This might happen with invalid URLs.
    return tempUrl;
  }
}  