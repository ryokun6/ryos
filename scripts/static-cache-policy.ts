/**
 * Cache-Control policy for static files served from `dist/` by the
 * standalone Bun server (Coolify / Docker / plain-Bun deploys).
 *
 * On Vercel these headers come from `vercel.json`; the standalone server must
 * emit them itself. Without an explicit Cache-Control, CDNs in front of the
 * origin (e.g. Cloudflare) apply their extension-based default TTL (~4h) to
 * `.js` files — including `sw.js`. A stale edge-cached `sw.js` references
 * hashed assets that no longer exist after a deploy, which makes the Workbox
 * precache install fail (404 → service worker goes redundant) and breaks
 * offline support for every client until the edge entry expires.
 *
 * Mirrors the `headers` section of `vercel.json`.
 */

const NO_CACHE = "no-cache, no-store, must-revalidate";
const IMMUTABLE = "public, max-age=31536000, immutable";
/** Vercel's default for static files: cache in the browser but revalidate. */
const DEFAULT = "public, max-age=0, must-revalidate";

/**
 * Rollup emits content-hashed bundles directly under `assets/` (e.g.
 * `index-DtdH3Hje.js`, `Sun.es-CFTCQksY.js`). Files in `assets/` sub-
 * directories come from `public/assets` and are NOT hashed.
 */
const HASHED_BUNDLE = /^assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

/** Content-hashed Workbox runtime emitted next to `sw.js` at the dist root. */
const HASHED_WORKBOX = /^workbox-[a-f0-9]{8}\.js$/;

const NO_CACHE_FILES = new Set([
  "index.html",
  "404.html",
  "sw.js",
  "registerSW.js",
  "manifest.json",
  "version.json",
  "theme-bootstrap-config.js",
  "app-config.js",
  "icons/manifest.json",
  "wallpapers/manifest.json",
]);

const IMMUTABLE_PREFIXES = [
  "wallpapers/tiles/",
  "wallpapers/photos/",
  "wallpapers/thumbs/",
  "wallpapers/videos/",
  "icons/default/",
  "icons/macosx/",
  "icons/system7/",
  "icons/win98/",
  "icons/xp/",
  "sounds/",
  "patterns/",
  "assets/games/jsdos/",
];

const IMMUTABLE_FILES = new Set(["apple-touch-icon.png", "favicon.ico"]);

/**
 * Returns the response headers (always including `Cache-Control`) for a
 * dist-relative static file path (no leading slash, posix separators).
 */
export function getStaticCacheHeaders(
  relativePath: string
): Record<string, string> {
  if (NO_CACHE_FILES.has(relativePath) || relativePath.startsWith("data/")) {
    return { "Cache-Control": NO_CACHE };
  }

  if (relativePath === "wallpapers/placeholders.json") {
    return {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    };
  }

  if (relativePath.startsWith("fonts/")) {
    return {
      "Cache-Control": IMMUTABLE,
      "Access-Control-Allow-Origin": "*",
    };
  }

  if (
    HASHED_BUNDLE.test(relativePath) ||
    HASHED_WORKBOX.test(relativePath) ||
    IMMUTABLE_FILES.has(relativePath) ||
    IMMUTABLE_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
  ) {
    return { "Cache-Control": IMMUTABLE };
  }

  return { "Cache-Control": DEFAULT };
}
