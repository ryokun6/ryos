/**
 * Records short browser demos for March 2026 changelog highlights.
 * Requires: `bun run dev:vite` on port 5173 (or set RYOS_DEMO_BASE).
 * Run from repo root: `bun run scripts/record-march-demo-reel.ts`
 */
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";

/** Vite defaults to localhost (::1); 127.0.0.1 may refuse if not bound. */
const BASE = process.env.RYOS_DEMO_BASE ?? "http://localhost:5173";
const OUT_DIR = path.join(
  import.meta.dirname,
  "..",
  "remotion-demo-reel",
  "public",
  "clips"
);

const VIEWPORT = { width: 1920, height: 1080 };

async function waitForDesktop(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120_000 });
  // Finder is not always on the desktop (e.g. macOS X theme); Macintosh HD is.
  await page
    .locator('[data-desktop-item-id="app:macintosh-hd"]')
    .waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);
}

async function openViaSpotlight(page: Page, query: string) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("toggleSpotlight"));
  });
  await page.waitForTimeout(350);
  const input = page.locator("input.spotlight-input").first();
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await input.fill(query);
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  type Segment = { file: string; run: (page: Page) => Promise<void> };

  const segments: Segment[] = [
    {
      file: "calendar.webm",
      async run(page) {
        await openViaSpotlight(page, "calendar");
        await page.waitForTimeout(3500);
      },
    },
    {
      file: "dashboard.webm",
      async run(page) {
        await page.keyboard.press("F4");
        await page.waitForTimeout(4500);
      },
    },
    {
      file: "candybar.webm",
      async run(page) {
        await openViaSpotlight(page, "candybar");
        await page.waitForTimeout(3500);
      },
    },
    {
      file: "finder-airdrop.webm",
      async run(page) {
        await openViaSpotlight(page, "finder");
        await page.waitForTimeout(1500);
        await page.getByRole("button", { name: /airdrop/i }).click();
        await page.waitForTimeout(5000);
      },
    },
    {
      file: "cloud-sync.webm",
      async run(page) {
        await openViaSpotlight(page, "control");
        await page.waitForTimeout(1200);
        await page.getByRole("tab", { name: /^sync$/i }).click();
        await page.waitForTimeout(4500);
      },
    },
    {
      file: "theme-ui.webm",
      async run(page) {
        await openViaSpotlight(page, "control");
        await page.waitForTimeout(1200);
        await page.getByRole("tab", { name: /^appearance$/i }).click();
        await page.waitForTimeout(4500);
      },
    },
  ];

  for (const seg of segments) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    });
    const page = await context.newPage();
    let tmpPath: string | undefined;
    try {
      await waitForDesktop(page);
      await seg.run(page);
      await page.waitForTimeout(800);
      const video = page.video();
      tmpPath = video ? await video.path() : undefined;
    } finally {
      await page.close();
      await context.close();
    }

    if (!tmpPath) {
      throw new Error(`No video recorded for ${seg.file}`);
    }
    const dest = path.join(OUT_DIR, seg.file);
    await rename(tmpPath, dest);
    console.log("wrote", dest);
  }

  await browser.close();
  console.log("Done. Clips in", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
