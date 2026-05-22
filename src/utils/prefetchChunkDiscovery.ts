/**
 * Discover hashed Vite asset URLs from built bundles for offline prefetch.
 * Used by prefetch.ts after reading index.html + the main entry chunk.
 */

/** Normalize a path from a bundle string to a same-origin URL under /assets/. */
export function normalizeViteAssetPath(raw: string): string | null {
  const trimmed = raw.replace(/^["']|["']$/g, "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("assets/")) {
    return `/${trimmed}`;
  }
  if (trimmed.startsWith("./")) {
    return `/assets/${trimmed.slice(2)}`;
  }
  if (trimmed.startsWith("/assets/")) {
    return trimmed;
  }
  return null;
}

/** Parse __vite__mapDeps(..., d=(m.f||(m.f=[...]))) asset list from the main bundle. */
export function extractUrlsFromViteMapDeps(bundleCode: string): string[] {
  const marker = "m.f=[";
  const start = bundleCode.indexOf(marker);
  if (start === -1) return [];

  let i = start + marker.length;
  let depth = 1;
  const urls: string[] = [];

  while (i < bundleCode.length && depth > 0) {
    const ch = bundleCode[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    i++;
  }

  if (depth !== 0) return urls;

  const slice = bundleCode.slice(start + marker.length, i - 1);
  const entryPattern = /["'](assets\/[^"']+)["']/g;
  for (const match of slice.matchAll(entryPattern)) {
    const url = normalizeViteAssetPath(match[1]);
    if (url) urls.push(url);
  }

  return urls;
}

/** Extract ./foo.js and assets/foo.js references (JS + CSS) from bundle source text. */
export function extractAssetUrlsFromBundle(bundleCode: string): string[] {
  const urls: string[] = [];
  const pattern =
    /["'](?:\.\/|assets\/)([^"']+\.(?:js|css))["']/gi;

  for (const match of bundleCode.matchAll(pattern)) {
    const raw = match[0];
    const url = normalizeViteAssetPath(raw);
    if (url) urls.push(url);
  }

  return urls;
}

/** Lazy app entry chunks referenced via import("./ChunkName-….js") in the main bundle. */
export function extractLazyEntryChunkPaths(bundleCode: string): string[] {
  const paths: string[] = [];
  const pattern = /import\(["'](\.\/[^"']+\.js)["']\)/g;
  for (const match of bundleCode.matchAll(pattern)) {
    const url = normalizeViteAssetPath(match[1]);
    if (url) paths.push(url);
  }
  return paths;
}

export function mergeDiscoveredAssetUrls(...lists: readonly string[][]): string[] {
  return [...new Set(lists.flat())];
}

/**
 * Collect prefetch targets from the main bundle and optional follow-up chunks
 * (lazy app entries and shared chunks like mermaid).
 */
export function discoverPrefetchAssetUrls(
  mainBundleCode: string,
  additionalBundleCodes: readonly string[] = []
): string[] {
  const fromMain = mergeDiscoveredAssetUrls(
    extractUrlsFromViteMapDeps(mainBundleCode),
    extractAssetUrlsFromBundle(mainBundleCode)
  );

  const entryChunks = extractLazyEntryChunkPaths(mainBundleCode);
  const fromEntries: string[] = [];
  for (const code of additionalBundleCodes) {
    fromEntries.push(
      ...extractUrlsFromViteMapDeps(code),
      ...extractAssetUrlsFromBundle(code)
    );
  }

  return mergeDiscoveredAssetUrls(fromMain, entryChunks, fromEntries);
}
