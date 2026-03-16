# Plan: Robust Web Fetch & Iframe Proxy via Lightpanda Browser Sidecar

## Problem Statement

The current web fetch (`/api/chat/tools/executors.ts → executeWebFetch`) and iframe proxy (`/api/iframe-check.ts`) use Node/Bun's native `fetch()` to download pages. This approach has fundamental limitations:

| Issue | Impact |
|-------|--------|
| **No JavaScript execution** | SPA/CSR sites return empty shells (`<div id="root"></div>`) — content is invisible to both `webFetch` (AI chat) and the iframe proxy |
| **Regex-based HTML parsing** | Metadata extraction, tag stripping, and selector matching all use regex — fragile against malformed or complex HTML |
| **No real DOM** | `webFetch`'s `selector` param is accepted but effectively useless — there's no DOM to query |
| **Sub-resource CORS failures** | The injected `fetch`/`XHR` interceptor only covers same-origin GETs; cross-origin CSS/JS/images still break in the iframe |
| **Bot detection** | Despite header rotation, many sites serve degraded content or CAPTCHAs to raw `fetch()` requests (no cookie jar, no JS challenge solving) |
| **Full-page buffering** | `response.text()` loads entire pages into memory before injection — very large pages can spike RAM |
| **No cookie/session state** | Each request is stateless — sites that require login, cookie consent, or multi-step flows can't be handled |

## Proposed Solution: Lightpanda Browser Sidecar

[Lightpanda](https://github.com/lightpanda-io/browser) is an open-source headless browser written in Zig with a V8 JS engine:

- **10× faster** and **9× less memory** than Chrome headless
- **Sub-100ms cold start** — no warm-up penalty
- **Native CDP** (Chrome DevTools Protocol) — compatible with Playwright and Puppeteer
- **Docker image**: `lightpanda/browser:nightly` exposes CDP on port `9222`
- **Single binary, single process** — trivial to deploy as a sidecar

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                           │
│                                                                 │
│  ┌──────────────────────┐     CDP/WS      ┌──────────────────┐ │
│  │    ryOS API Server   │ ◄─────────────► │    Lightpanda    │ │
│  │    (Bun, port 3000)  │   :9222          │    Browser       │ │
│  │                      │                  │    (Zig + V8)    │ │
│  │  - /api/iframe-check │                  │                  │ │
│  │  - /api/link-preview │                  │  - JS execution  │ │
│  │  - webFetch (chat)   │                  │  - Real DOM      │ │
│  │                      │                  │  - Cookie jar    │ │
│  └──────────────────────┘                  └──────────────────┘ │
│              │                                                   │
│              │ Redis                                             │
│  ┌───────────▼──────────┐                                       │
│  │   Upstash Redis      │                                       │
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

The API server talks to Lightpanda over CDP WebSocket on an internal Docker network. Lightpanda is never exposed to the public internet.

### Graceful Degradation

The browser sidecar is **optional**. When `BROWSER_CDP_URL` is not set (or the sidecar is unreachable), all endpoints fall back to the current `safeFetchWithRedirects` behavior. This means:

- **Dev mode** works without Docker — no change to `bun run dev`
- **Vercel deployment** continues to work as-is (no sidecar available)
- **Self-hosted Docker** gets the full browser-backed experience

---

## Implementation Plan

### Phase 1: Infrastructure & Browser Client

**Goal:** Add Lightpanda as a sidecar container and create a shared browser client module.

#### 1a. Docker Compose setup

Create `docker-compose.yml`:

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - BROWSER_CDP_URL=ws://lightpanda:9222
      # ... other env vars from .env.local
    depends_on:
      lightpanda:
        condition: service_started

  lightpanda:
    image: lightpanda/browser:nightly
    command: ["serve", "--host", "0.0.0.0", "--port", "9222"]
    restart: unless-stopped
    # Internal only — not exposed to host
    expose:
      - "9222"
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
```

#### 1b. Browser client module

Create `api/_utils/_browser.ts` — a thin abstraction over CDP/Playwright:

```typescript
// api/_utils/_browser.ts

import { chromium, type Browser, type Page } from "playwright";

const BROWSER_CDP_URL = process.env.BROWSER_CDP_URL; // e.g. ws://lightpanda:9222
const BROWSER_TIMEOUT_MS = 25_000;
const BROWSER_MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB safety limit

let _browserPromise: Promise<Browser> | null = null;

/** Lazily connect to the CDP browser sidecar. Returns null if unconfigured. */
export async function getBrowser(): Promise<Browser | null> {
  if (!BROWSER_CDP_URL) return null;

  if (!_browserPromise) {
    _browserPromise = chromium.connectOverCDP(BROWSER_CDP_URL).catch((err) => {
      _browserPromise = null; // retry next call
      throw err;
    });
  }

  return _browserPromise;
}

/** Check if the browser sidecar is available. */
export function isBrowserAvailable(): boolean {
  return !!BROWSER_CDP_URL;
}

export interface BrowserFetchResult {
  html: string;
  finalUrl: string;
  title?: string;
  contentType: string;
  status: number;
}

export interface BrowserFetchOptions {
  timeoutMs?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  blockResources?: string[];  // e.g. ["image", "media", "font"] for webFetch
  userAgent?: string;
  extraHeaders?: Record<string, string>;
}

/**
 * Fetch a URL using the headless browser, returning fully-rendered HTML.
 * Falls back to null if the browser sidecar is unavailable.
 */
export async function browserFetch(
  url: string,
  options: BrowserFetchOptions = {}
): Promise<BrowserFetchResult | null> {
  const browser = await getBrowser();
  if (!browser) return null;

  const context = await browser.newContext({
    userAgent: options.userAgent,
    extraHTTPHeaders: options.extraHeaders,
    bypassCSP: true,
  });

  const page = await context.newPage();

  try {
    // Optionally block heavy resources to speed up fetch
    if (options.blockResources?.length) {
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (options.blockResources!.includes(type)) {
          return route.abort();
        }
        return route.continue();
      });
    }

    const response = await page.goto(url, {
      timeout: options.timeoutMs ?? BROWSER_TIMEOUT_MS,
      waitUntil: options.waitUntil ?? "load",
    });

    if (!response) {
      return null;
    }

    const html = await page.content();
    const title = await page.title();

    return {
      html,
      finalUrl: page.url(),
      title: title || undefined,
      contentType: response.headers()["content-type"] || "text/html",
      status: response.status(),
    };
  } finally {
    await page.close();
    await context.close();
  }
}

/**
 * Extract text content from a page using real DOM selectors.
 * Much more accurate than regex-based extraction.
 */
export async function browserExtractText(
  url: string,
  options: BrowserFetchOptions & { selector?: string } = {}
): Promise<{
  text: string;
  title?: string;
  description?: string;
  siteName?: string;
  finalUrl: string;
} | null> {
  const browser = await getBrowser();
  if (!browser) return null;

  const context = await browser.newContext({
    userAgent: options.userAgent,
    extraHTTPHeaders: options.extraHeaders,
    bypassCSP: true,
  });

  const page = await context.newPage();

  try {
    // Block images/media/fonts for faster text extraction
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(url, {
      timeout: options.timeoutMs ?? BROWSER_TIMEOUT_MS,
      waitUntil: options.waitUntil ?? "load",
    });

    const result = await page.evaluate((sel) => {
      const meta = (name: string) =>
        document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)
          ?.getAttribute("content") ?? undefined;

      let textContent: string;
      if (sel) {
        const el = document.querySelector(sel);
        textContent = el?.textContent ?? document.body.innerText;
      } else {
        // Prefer <main> or <article> if present
        const main =
          document.querySelector("main") ??
          document.querySelector("article") ??
          document.querySelector('[role="main"]');
        textContent = (main ?? document.body).innerText;
      }

      return {
        text: textContent,
        title: document.title || meta("og:title"),
        description: meta("og:description") || meta("description"),
        siteName: meta("og:site_name"),
      };
    }, options.selector ?? null);

    return {
      ...result,
      finalUrl: page.url(),
    };
  } finally {
    await page.close();
    await context.close();
  }
}
```

**Key design decisions:**
- Lazy connection — doesn't connect until first request
- Auto-reconnect on failure (nulls the promise so next call retries)
- `bypassCSP: true` — we're proxying, CSP should not restrict us
- Resource blocking for `webFetch` — skip images/fonts to keep extraction fast
- Real DOM `document.querySelector` replaces all regex-based selector/content extraction

#### 1c. Configuration

Add to `api/_utils/runtime-config.ts`:

```typescript
export const BROWSER_CDP_URL = process.env.BROWSER_CDP_URL || "";
export const BROWSER_ENABLED = !!BROWSER_CDP_URL;
```

Add `playwright` as a dependency (it's already in devDependencies, move to dependencies or add `playwright-core` for lighter install):

```bash
bun add playwright-core
```

> **Note:** `playwright-core` (no bundled browsers) is sufficient since we connect over CDP to an external browser. No need for `npx playwright install`.

---

### Phase 2: Upgrade `webFetch` (AI Chat Tool)

**Goal:** When the browser sidecar is available, use it for `webFetch` to get JS-rendered content with real DOM extraction.

**File:** `api/chat/tools/executors.ts`

Changes to `executeWebFetch()`:

```typescript
import { browserExtractText, isBrowserAvailable } from "../_utils/_browser.js";

export async function executeWebFetch(
  input: WebFetchInput,
  context: ServerToolContext
): Promise<WebFetchOutput> {
  const { url, selector } = input;

  // --- Try browser-based extraction first ---
  if (isBrowserAvailable()) {
    try {
      const result = await browserExtractText(url, {
        selector,
        blockResources: ["image", "media", "font"],
        timeoutMs: WEB_FETCH_TIMEOUT_MS,
      });

      if (result) {
        let textContent = result.text;
        const truncated = textContent.length > WEB_FETCH_MAX_CONTENT_LENGTH;
        if (truncated) {
          textContent = textContent.slice(0, WEB_FETCH_MAX_CONTENT_LENGTH) + "\n\n[...truncated]";
        }

        return {
          success: true,
          url,
          finalUrl: result.finalUrl,
          title: result.title,
          description: result.description,
          siteName: result.siteName || new URL(result.finalUrl).hostname,
          content: textContent,
          contentLength: textContent.length,
          truncated,
          message: `Fetched content from ${result.siteName || new URL(result.finalUrl).hostname}`,
        };
      }
    } catch (err) {
      context.log(`[webFetch] Browser extraction failed, falling back to fetch: ${err}`);
    }
  }

  // --- Fallback: existing fetch-based logic (unchanged) ---
  // ... current implementation ...
}
```

**What this fixes:**
- SPA/CSR sites now return actual rendered content
- `selector` parameter actually works via `document.querySelector()`
- Metadata extraction uses real DOM instead of regex
- Content extraction uses `innerText` (respects visibility, `<script>`/`<style>` excluded automatically)

---

### Phase 3: Upgrade Iframe Proxy

**Goal:** Use the browser to render pages before proxying them into the iframe, solving JS-dependent sites and improving sub-resource handling.

**File:** `api/iframe-check.ts`

The iframe proxy is the most complex integration point. The approach:

1. **For proxy mode:** Use the browser to get fully-rendered HTML, then apply the existing injection pipeline (base tag, navigation interceptor, font overrides)
2. **For check mode:** Use the browser to detect actual frame-blocking behavior (some sites only block via JS)
3. **Keep the existing `safeFetchWithRedirects` as fallback**

```typescript
// In the proxy section of iframe-check.ts:

import { browserFetch, isBrowserAvailable } from "./_utils/_browser.js";

// Inside the proxy mode handler:
let html: string;
let pageTitle: string | undefined;
let finalUrl: string;

if (isBrowserAvailable()) {
  try {
    const result = await browserFetch(targetUrl, {
      timeoutMs: 25_000,
      waitUntil: "load",
      userAgent: BROWSER_HEADERS["User-Agent"],
    });

    if (result && result.status < 400) {
      html = result.html;
      pageTitle = result.title;
      finalUrl = result.finalUrl;
    } else {
      // Fall through to fetch-based approach
      throw new Error("Browser fetch returned error status");
    }
  } catch (err) {
    logger.warn("Browser fetch failed, falling back to safeFetch", { err });
    // ... existing safeFetchWithRedirects logic ...
  }
} else {
  // ... existing safeFetchWithRedirects logic ...
}

// Continue with existing HTML injection pipeline...
```

**What this fixes:**
- JS-rendered content appears in the iframe (React/Vue/Angular sites)
- Pages that use JS-based frame-busting are neutralized at the browser level
- Cookie consent dialogs and JS challenges may be handled
- Sub-resources are fetched by the real browser, reducing CORS issues

**Important:** The navigation interceptor script and font overrides still get injected into the rendered HTML. The browser renders the page first, then we inject our overrides.

---

### Phase 4: Upgrade Link Preview

**Goal:** Extract OpenGraph metadata from JS-rendered pages.

**File:** `api/link-preview.ts`

Many modern sites inject OG meta tags via JavaScript. Using the browser:

```typescript
import { browserFetch, isBrowserAvailable } from "./_utils/_browser.js";

// In the metadata extraction section:
if (isBrowserAvailable()) {
  try {
    const result = await browserFetch(url, {
      blockResources: ["image", "media", "font"],
      timeoutMs: 8_000, // Shorter timeout for previews
      waitUntil: "domcontentloaded",
    });

    if (result) {
      // Extract OG metadata from the fully-rendered HTML
      // ... same regex extraction, but on rendered HTML ...
    }
  } catch {
    // Fall back to current approach
  }
}
```

---

### Phase 5: Connection Pooling & Health Checks

**Goal:** Make the browser connection production-grade.

#### 5a. Connection pool with health monitoring

Enhance `api/_utils/_browser.ts`:

```typescript
let _lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

export async function ensureBrowserHealthy(): Promise<boolean> {
  if (!BROWSER_CDP_URL) return false;

  const now = Date.now();
  if (now - _lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) return true;

  try {
    const browser = await getBrowser();
    if (!browser?.isConnected()) {
      _browserPromise = null; // force reconnect
      return false;
    }
    _lastHealthCheck = now;
    return true;
  } catch {
    _browserPromise = null;
    return false;
  }
}
```

#### 5b. Page timeout & cleanup

Guard against leaked pages/contexts:

```typescript
// Enforce a hard timeout on all page operations
const HARD_TIMEOUT_MS = 30_000;

async function withPage<T>(
  fn: (page: Page) => Promise<T>,
  options?: BrowserFetchOptions
): Promise<T | null> {
  const browser = await getBrowser();
  if (!browser) return null;

  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();

  const timer = setTimeout(async () => {
    try { await page.close(); } catch {}
    try { await context.close(); } catch {}
  }, HARD_TIMEOUT_MS);

  try {
    return await fn(page);
  } finally {
    clearTimeout(timer);
    try { await page.close(); } catch {}
    try { await context.close(); } catch {}
  }
}
```

#### 5c. Concurrency limiting

Prevent the sidecar from being overwhelmed:

```typescript
const MAX_CONCURRENT_PAGES = 10;
let _activePagesCount = 0;

async function acquirePage(): Promise<boolean> {
  if (_activePagesCount >= MAX_CONCURRENT_PAGES) return false;
  _activePagesCount++;
  return true;
}

function releasePage(): void {
  _activePagesCount = Math.max(0, _activePagesCount - 1);
}
```

---

### Phase 6: SSRF Protection for Browser Fetches

**Goal:** Ensure the browser sidecar can't be used for SSRF attacks.

The browser makes its own network requests, bypassing our `safeFetchWithRedirects`. We need defense-in-depth:

1. **Pre-validate URLs** before sending to the browser (existing `validatePublicUrl`)
2. **Network isolation** — the Lightpanda container only gets external network access, not internal Docker network access to other services
3. **Request interception** via Playwright to validate every URL the browser tries to fetch:

```typescript
await page.route("**/*", async (route) => {
  const url = route.request().url();
  try {
    await validatePublicUrl(url);
    await route.continue();
  } catch {
    await route.abort("blockedbyclient");
  }
});
```

Docker network isolation:

```yaml
# docker-compose.yml
networks:
  internal:
    driver: bridge
  external:
    driver: bridge

services:
  app:
    networks:
      - internal
      - external

  lightpanda:
    networks:
      - internal   # Can talk to app
      - external   # Can fetch public websites
    # But NOT connected to any network with databases, Redis, etc.
```

---

## File Change Summary

| File | Change | Phase |
|------|--------|-------|
| `docker-compose.yml` | **New** — defines app + lightpanda sidecar | 1 |
| `api/_utils/_browser.ts` | **New** — browser client module | 1 |
| `api/_utils/runtime-config.ts` | Add `BROWSER_CDP_URL` / `BROWSER_ENABLED` | 1 |
| `package.json` | Add `playwright-core` dependency | 1 |
| `api/chat/tools/executors.ts` | Use `browserExtractText` in `executeWebFetch` with fallback | 2 |
| `api/iframe-check.ts` | Use `browserFetch` in proxy mode with fallback | 3 |
| `api/link-preview.ts` | Use `browserFetch` for OG metadata with fallback | 4 |
| `api/_utils/_browser.ts` | Add health checks, pooling, concurrency limits | 5 |
| `api/_utils/_browser.ts` | Add SSRF protection via request interception | 6 |
| `Dockerfile` | No change needed (browser is a separate container) | — |
| `.env.local` | Add `BROWSER_CDP_URL=ws://lightpanda:9222` example | 1 |
| `AGENTS.md` | Document `BROWSER_CDP_URL` env var | 1 |

## Deployment Topologies

### Local Development (no Docker)

```
BROWSER_CDP_URL not set → all endpoints use safeFetchWithRedirects (current behavior)
```

### Local Development (with Docker)

```bash
docker compose up
# App on :3000, Lightpanda on :9222 (internal only)
# BROWSER_CDP_URL=ws://lightpanda:9222 set automatically
```

### Self-Hosted Production (Docker)

Same as above but with production env vars. Lightpanda runs as a sidecar.

### Vercel Deployment

```
BROWSER_CDP_URL not set → safeFetchWithRedirects fallback
# OR
BROWSER_CDP_URL=wss://cloud.lightpanda.io/ws?token=... → use Lightpanda Cloud
```

### Fly.io / Railway / Similar

Lightpanda runs as a separate service on the same internal network.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Lightpanda crashes or hangs | Health checks + auto-reconnect + graceful fallback to `fetch()` |
| Memory leak from unclosed pages | Hard timeout + `finally` cleanup + concurrency limit |
| SSRF through browser | Pre-validation + request interception + network isolation |
| Lightpanda doesn't support a site | Graceful fallback to `safeFetchWithRedirects` |
| Added latency from browser rendering | Only ~100-500ms overhead for most sites; configurable `waitUntil` |
| Playwright dependency size | Use `playwright-core` (no bundled browsers) — ~5MB |
| Lightpanda API instability (nightly) | Pin to a specific tag once stable releases begin; fallback ensures no breakage |

## Success Metrics

After implementation, these should be measurably improved:

1. **webFetch coverage** — sites like Twitter/X, React SPAs, etc. return actual content instead of empty shells
2. **Iframe proxy fidelity** — JS-rendered sites display correctly in the Internet Explorer app
3. **Link preview accuracy** — OG metadata is extracted from JS-injected meta tags
4. **Selector support** — `webFetch` `selector` param actually queries the DOM
5. **Zero regression** — all existing tests pass; Vercel/dev-only deployments work exactly as before

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Phase 1: Infrastructure & Client | 1-2 days | None |
| Phase 2: webFetch upgrade | 0.5 day | Phase 1 |
| Phase 3: Iframe proxy upgrade | 1 day | Phase 1 |
| Phase 4: Link preview upgrade | 0.5 day | Phase 1 |
| Phase 5: Production hardening | 1 day | Phases 1-4 |
| Phase 6: SSRF protection | 0.5 day | Phase 1 |
| **Total** | **~5 days** | |
