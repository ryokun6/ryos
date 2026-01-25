/**
 * Captures thumbnails for each Infinite Mac preset by loading the embed in a
 * browser, waiting for boot, and saving a cropped screenshot.
 *
 * Run: bun run generate:infinite-mac-thumbnails
 * Requires: bun add -d playwright && bunx playwright install chromium
 */

const EMBED_BASE = "https://infinitemac.org/embed";
const BOOT_WAIT_MS = 10_000;
const BOOT_WAIT_SLOW_MS = 120_000; // 2 min for Mac OS 8.5, 9, 10.1
const BOOT_WAIT_SLOWER_MS = 300_000; // 5 min for Mac OS X 10.2, 10.3, 10.4
const OUT_DIR = "public/assets/infinite-mac-thumbnails";

const PRESETS: {
  id: string;
  disk: string;
  machine?: string;
  width: number;
  height: number;
  bootWaitMs?: number;
}[] = [
  { id: "system-1", disk: "System 1.0", width: 512, height: 342 },
  { id: "system-6", disk: "System 6.0.8", width: 512, height: 342 },
  { id: "system-7-5", disk: "System 7.5.3", width: 640, height: 480 },
  { id: "kanjitalk-7-5", disk: "KanjiTalk 7.5.3", width: 640, height: 480 },
  { id: "macos-8", disk: "Mac OS 8.0", width: 640, height: 480 },
  { id: "macos-8-5", disk: "Mac OS 8.5", width: 640, height: 480, bootWaitMs: BOOT_WAIT_SLOW_MS },
  { id: "macos-9", disk: "Mac OS 9.0", width: 640, height: 480, bootWaitMs: BOOT_WAIT_SLOW_MS },
  { id: "macos-9-2", disk: "Mac OS 9.2.2", width: 640, height: 480, bootWaitMs: BOOT_WAIT_SLOW_MS },
  { id: "macosx-10-1", disk: "Mac OS X 10.1", machine: "Power Macintosh G3 (Beige)", width: 640, height: 480, bootWaitMs: BOOT_WAIT_SLOW_MS },
  { id: "macosx-10-2", disk: "Mac OS X 10.2", machine: "Power Macintosh G4 (PCI Graphics)", width: 640, height: 480, bootWaitMs: BOOT_WAIT_SLOWER_MS },
  { id: "macosx-10-3", disk: "Mac OS X 10.3", machine: "Power Macintosh G4 (PCI Graphics)", width: 640, height: 480, bootWaitMs: BOOT_WAIT_SLOWER_MS },
  { id: "macosx-10-4", disk: "Mac OS X 10.4", machine: "Power Macintosh G4 (PCI Graphics)", width: 640, height: 480, bootWaitMs: BOOT_WAIT_SLOWER_MS },
];

function buildEmbedUrl(p: (typeof PRESETS)[number]): string {
  const u = new URL(EMBED_BASE);
  u.searchParams.set("disk", p.disk);
  if (p.machine) u.searchParams.set("machine", p.machine);
  u.searchParams.set("infinite_hd", "true");
  u.searchParams.set("saved_hd", "true");
  u.searchParams.set("screen_scale", "1");
  u.searchParams.set("auto_pause", "true");
  u.searchParams.set("screen_update_messages", "true");
  return u.toString();
}

async function main() {
  const { chromium } = await import("playwright");
  const fs = await import("fs");
  const path = await import("path");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const onlyIds = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const presets = onlyIds.length
    ? PRESETS.filter((p) => onlyIds.includes(p.id))
    : PRESETS;
  if (onlyIds.length && presets.length === 0) {
    console.error("No matching presets. Valid ids:", PRESETS.map((p) => p.id).join(", "));
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  for (const preset of presets) {
    const context = await browser.newContext({ javaScriptEnabled: true });
    const page = await context.newPage();
    try {
      const url = buildEmbedUrl(preset);
      const outPath = path.join(OUT_DIR, `${preset.id}.png`);
      const waitMs = preset.bootWaitMs ?? BOOT_WAIT_MS;
      console.log(`[${preset.id}] ${preset.disk} (wait ${waitMs / 1000}s) …`);
      await page.setViewportSize({ width: preset.width, height: preset.height });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await new Promise((r) => setTimeout(r, waitMs));
      await page.screenshot({ path: outPath, type: "png" });
      console.log(`  -> ${outPath}`);
    } finally {
      await page.close();
      await context.close();
    }
  }

  await browser.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
