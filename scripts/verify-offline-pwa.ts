/*
 * Verifies the PWA cold-launches offline against a running server:
 * 1. Persistent Chromium profile: load online, wait for the service worker
 *    to activate and finish precaching.
 * 2. Close the browser entirely.
 * 3. Relaunch the same profile offline, navigate, and require the desktop
 *    shell to render. Exits non-zero when the offline launch fails.
 *
 * Usage: bun run verify:offline-pwa [--url=http://127.0.0.1:4173]
 * (serve a production build first, e.g. `bun run build && bunx vite preview`)
 */
import { existsSync, rmSync } from "node:fs";
import { chromium } from "playwright";

const targetUrl = process.argv.find((a) => a.startsWith("--url="))?.slice(6) ??
  "http://127.0.0.1:4173";
const profileDir = "/tmp/pwa-offline-profile";
rmSync(profileDir, { recursive: true, force: true });

const installedChromium = chromium.executablePath();
const executablePath = existsSync(installedChromium)
  ? undefined
  : ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(existsSync);

// ---- phase 1: online priming ----
{
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "load" });
  await page.locator("#root > *").first().waitFor({ state: "visible", timeout: 30000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForTimeout(4000);
  const cacheInfo = await page.evaluate(async () => {
    const names = await caches.keys();
    const out: Record<string, number> = {};
    for (const n of names) out[n] = (await (await caches.open(n)).keys()).length;
    return out;
  });
  console.log("caches after online prime:", JSON.stringify(cacheInfo));
  await context.close();
}

// ---- phase 2: cold offline launch ----
{
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath,
    viewport: { width: 1440, height: 900 },
    offline: true,
  });
  const page = await context.newPage();
  const consoleLines: string[] = [];
  page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));

  let navOk = true;
  try {
    await page.goto(targetUrl, { waitUntil: "load", timeout: 30000 });
  } catch (e) {
    navOk = false;
    console.log("navigation failed:", (e as Error).message.split("\n")[0]);
  }

  let rendered = false;
  if (navOk) {
    try {
      await page.locator("#root > *").first().waitFor({ state: "visible", timeout: 20000 });
      rendered = true;
    } catch {
      rendered = false;
    }
  }
  console.log("cold offline shell rendered:", rendered);
  console.log("== console ==");
  for (const line of consoleLines.slice(0, 60)) console.log(line);
  await page.screenshot({ path: "/tmp/offline-cold-after.png" });
  await context.close();
  process.exit(rendered ? 0 : 1);
}
