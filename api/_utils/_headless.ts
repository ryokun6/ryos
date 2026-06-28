/**
 * Optional headless-browser rendering used as a fallback by the Internet
 * Explorer proxy (`api/iframe-check.ts`) when a site can't be fetched as plain
 * HTML — typically because it is bot-blocked (Cloudflare/Akamai 403/429) or
 * requires client-side JavaScript to render any content.
 *
 * This is entirely env-gated and pluggable, so the default deployment behaves
 * exactly as before. Two providers are supported:
 *
 *   1. `HEADLESS_RENDER_URL_TEMPLATE` — a simple HTTP render service. The
 *      template must contain `{url}` (URL-encoded target) and/or `{rawUrl}`
 *      (un-encoded). A GET to the expanded template must return the rendered
 *      HTML. Optionally send an auth header via `HEADLESS_RENDER_AUTH_HEADER`
 *      (e.g. "Authorization") + `HEADLESS_RENDER_AUTH_TOKEN`.
 *      Works with most "render"/"screenshot-to-html" SaaS endpoints.
 *
 *   2. `HEADLESS_BROWSER_WS_ENDPOINT` — a Chrome DevTools Protocol websocket
 *      endpoint (e.g. browserless `wss://chrome.browserless.io?token=...`).
 *      Connected to with `puppeteer-core`, which is imported dynamically so it
 *      remains an optional dependency: if it isn't installed the provider is
 *      simply skipped.
 *
 * Every target URL is re-validated through the same SSRF guard used by the
 * proxy before any network call is made.
 */
import { validatePublicUrl } from "./_ssrf.js";

export interface HeadlessRenderResult {
  html: string;
  finalUrl: string;
  provider: "http-template" | "cdp";
}

interface RenderOptions {
  timeoutMs?: number;
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

const DEFAULT_TIMEOUT_MS = 25000;

/** True when at least one headless render provider is configured. */
export function isHeadlessRenderConfigured(): boolean {
  return Boolean(
    process.env.HEADLESS_RENDER_URL_TEMPLATE?.trim() ||
      process.env.HEADLESS_BROWSER_WS_ENDPOINT?.trim()
  );
}

/**
 * Render a URL to fully-hydrated HTML via the configured provider. Returns
 * `null` when no provider is configured, the URL is blocked, or rendering
 * fails (caller falls back to its normal error handling).
 */
export async function renderUrlToHtml(
  rawUrl: string,
  options: RenderOptions = {}
): Promise<HeadlessRenderResult | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, logger } = options;

  if (!isHeadlessRenderConfigured()) return null;

  // SSRF guard — never let the render provider be pointed at internal hosts.
  let target: string;
  try {
    target = (await validatePublicUrl(rawUrl)).toString();
  } catch (err) {
    logger?.warn?.("Headless render target blocked by SSRF guard", err);
    return null;
  }

  const template = process.env.HEADLESS_RENDER_URL_TEMPLATE?.trim();
  if (template) {
    const result = await renderViaHttpTemplate(
      template,
      target,
      timeoutMs,
      logger
    );
    if (result) return result;
  }

  const wsEndpoint = process.env.HEADLESS_BROWSER_WS_ENDPOINT?.trim();
  if (wsEndpoint) {
    const result = await renderViaCdp(wsEndpoint, target, timeoutMs, logger);
    if (result) return result;
  }

  return null;
}

async function renderViaHttpTemplate(
  template: string,
  target: string,
  timeoutMs: number,
  logger: RenderOptions["logger"]
): Promise<HeadlessRenderResult | null> {
  const expanded = template
    .replace(/\{url\}/g, encodeURIComponent(target))
    .replace(/\{rawUrl\}/g, target);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "text/html,*/*" };
    const authHeader = process.env.HEADLESS_RENDER_AUTH_HEADER?.trim();
    const authToken = process.env.HEADLESS_RENDER_AUTH_TOKEN?.trim();
    if (authHeader && authToken) headers[authHeader] = authToken;

    const res = await fetch(expanded, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      logger?.warn?.(`Headless HTTP render failed: HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    if (!html || html.length < 20) {
      logger?.warn?.("Headless HTTP render returned empty body");
      return null;
    }
    logger?.info?.(`Headless HTTP render succeeded (${html.length} bytes)`);
    return { html, finalUrl: target, provider: "http-template" };
  } catch (err) {
    logger?.warn?.("Headless HTTP render error", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function renderViaCdp(
  wsEndpoint: string,
  target: string,
  timeoutMs: number,
  logger: RenderOptions["logger"]
): Promise<HeadlessRenderResult | null> {
  let puppeteer: unknown;
  try {
    // Dynamic, optional import: puppeteer-core is only needed for the CDP
    // provider, so installs that don't use it aren't forced to bundle it.
    puppeteer = (await import(/* @vite-ignore */ "puppeteer-core")).default;
  } catch {
    logger?.warn?.(
      "HEADLESS_BROWSER_WS_ENDPOINT is set but puppeteer-core is not installed"
    );
    return null;
  }

  type MinimalBrowser = {
    newPage: () => Promise<MinimalPage>;
    disconnect: () => Promise<void>;
  };
  type MinimalPage = {
    setViewport: (v: { width: number; height: number }) => Promise<void>;
    goto: (
      url: string,
      opts: { waitUntil: string; timeout: number }
    ) => Promise<unknown>;
    content: () => Promise<string>;
    url: () => string;
    close: () => Promise<void>;
  };

  const connectable = puppeteer as {
    connect: (opts: {
      browserWSEndpoint: string;
    }) => Promise<MinimalBrowser>;
  };

  let browser: MinimalBrowser | null = null;
  try {
    browser = await connectable.connect({ browserWSEndpoint: wsEndpoint });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(target, { waitUntil: "networkidle2", timeout: timeoutMs });
    const html = await page.content();
    const finalUrl = page.url() || target;
    await page.close();
    logger?.info?.(`Headless CDP render succeeded (${html.length} bytes)`);
    return { html, finalUrl, provider: "cdp" };
  } catch (err) {
    logger?.warn?.("Headless CDP render error", err);
    return null;
  } finally {
    try {
      await browser?.disconnect();
    } catch {
      /* ignore */
    }
  }
}
