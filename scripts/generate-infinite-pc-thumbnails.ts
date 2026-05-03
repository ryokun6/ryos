/**
 * Captures thumbnails for each Infinite PC preset by loading the v86 wrapper
 * directly in headless Chromium, waiting for boot, and saving a screenshot
 * cropped to the preset's native screen size.
 *
 * Usage:
 *   bun run dev                                    # in another terminal
 *   bun run generate:infinite-pc-thumbnails        # all presets in this file
 *   bun run generate:infinite-pc-thumbnails freedos msdos   # only those ids
 *
 * Optional env vars:
 *   INFINITE_PC_BASE  base URL for the wrapper (default http://localhost:5173)
 *
 * Requires: playwright (already in devDependencies). On first run, install
 * the Chromium binary with: bunx playwright install chromium
 */
type Preset = {
  /** preset.id from useInfinitePcStore — also the filename stem */
  id: string;
  /** v86 ?profile= param — usually equal to id, but can differ */
  profile: string;
  /** native screen size (matches PC_PRESETS.screenSize) */
  width: number;
  height: number;
  /**
   * Extra time after `emulator_loaded` fires for the OS to settle into a
   * representative state (past BIOS POST, into the desktop, etc.).
   */
  settleMs: number;
  /** Maximum total wait before considering the boot stuck. */
  loadTimeoutMs?: number;
};

const BASE = (process.env.INFINITE_PC_BASE ?? "http://localhost:5173").replace(
  /\/$/,
  ""
);
const OUT_DIR = "public/assets/infinite-pc-thumbnails";
const DEFAULT_LOAD_TIMEOUT_MS = 30_000;

/** Keep in sync with `PC_PRESETS` screen sizes in useInfinitePcStore.ts */
const PRESETS: Preset[] = [
  { id: "freedos", profile: "freedos", width: 640, height: 480, settleMs: 6_000 },
  { id: "msdos", profile: "msdos", width: 640, height: 480, settleMs: 8_000 },
  { id: "windows1", profile: "windows1", width: 640, height: 350, settleMs: 12_000 },
  { id: "windows30", profile: "windows30", width: 640, height: 480, settleMs: 12_000 },
  { id: "windows31", profile: "windows31", width: 1024, height: 768, settleMs: 12_000 },
  { id: "windows95", profile: "windows95", width: 1024, height: 768, settleMs: 12_000 },
  { id: "windows98", profile: "windows98", width: 640, height: 480, settleMs: 10_000 },
  { id: "windows-me", profile: "windows-me", width: 1024, height: 768, settleMs: 10_000 },
  { id: "windows2000", profile: "windows2000", width: 1024, height: 768, settleMs: 10_000 },
  { id: "linux26", profile: "linux26", width: 640, height: 480, settleMs: 8_000 },
  { id: "linux4", profile: "linux4", width: 640, height: 480, settleMs: 8_000 },
  { id: "archlinux", profile: "archlinux", width: 1024, height: 768, settleMs: 12_000 },
  { id: "dsl", profile: "dsl", width: 1024, height: 768, settleMs: 12_000 },
  { id: "buildroot", profile: "buildroot", width: 640, height: 480, settleMs: 8_000 },
  { id: "freebsd", profile: "freebsd", width: 640, height: 480, settleMs: 10_000 },
  { id: "openbsd", profile: "openbsd", width: 640, height: 480, settleMs: 10_000 },
  { id: "netbsd", profile: "netbsd", width: 640, height: 480, settleMs: 12_000 },
  { id: "haiku", profile: "haiku", width: 1024, height: 768, settleMs: 12_000 },
  { id: "beos", profile: "beos", width: 800, height: 600, settleMs: 15_000 },
  { id: "reactos", profile: "reactos", width: 800, height: 600, settleMs: 12_000 },
  { id: "kolibrios", profile: "kolibrios", width: 1024, height: 768, settleMs: 10_000 },
  { id: "oberon", profile: "oberon", width: 1280, height: 1024, settleMs: 12_000 },
  { id: "redox", profile: "redox", width: 1280, height: 1024, settleMs: 12_000 },
  { id: "minix", profile: "minix", width: 640, height: 480, settleMs: 12_000 },
  { id: "serenity", profile: "serenity", width: 1024, height: 768, settleMs: 12_000 },
  { id: "helenos", profile: "helenos", width: 1024, height: 768, settleMs: 12_000 },
  { id: "fiwix", profile: "fiwix", width: 640, height: 480, settleMs: 12_000 },
  { id: "solos", profile: "solos", width: 640, height: 480, settleMs: 8_000 },
  { id: "doof", profile: "doof", width: 320, height: 200, settleMs: 10_000 },
  { id: "mikeos", profile: "mikeos", width: 640, height: 480, settleMs: 10_000 },
];

function buildEmbedUrl(p: Preset): string {
  const u = new URL(`${BASE}/embed/pc`);
  u.searchParams.set("profile", p.profile);
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
    console.error(
      "No matching presets. Valid ids:",
      PRESETS.map((p) => p.id).join(", ")
    );
    process.exit(1);
  }

  // SharedArrayBuffer is required by v86 in some builds. The wrapper page
  // already sets COEP: credentialless / COOP: same-origin via the dev plugin
  // in vite.config.ts, so cross-origin isolation Just Works in the headless
  // browser without extra flags.
  const browser = await chromium.launch({ headless: true });

  const failures: string[] = [];

  for (const preset of presets) {
    const context = await browser.newContext({
      javaScriptEnabled: true,
      viewport: { width: preset.width, height: preset.height },
      // The wrapper sets <meta name="referrer" content="no-referrer"> to
      // bypass i.copy.sh hotlink protection, but be explicit at the context
      // level too in case the meta isn't honored before the first request.
      extraHTTPHeaders: { Referer: "" },
    });
    const page = await context.newPage();

    // Bridge the wrapper's `_infinite_pc_bridge` postMessages back to Node.
    // When the wrapper loads at the top level (no parent iframe),
    // `window.parent === window` so messages bubble back to the same window.
    let resolveLoaded!: () => void;
    let rejectLoaded!: (err: Error) => void;
    const loadedPromise = new Promise<void>((resolve, reject) => {
      resolveLoaded = resolve;
      rejectLoaded = reject;
    });

    await page.exposeFunction("__infinitePcThumbBridge", (payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        (payload as { type?: string }).type === "emulator_loaded"
      ) {
        resolveLoaded();
      } else if (
        payload &&
        typeof payload === "object" &&
        (payload as { type?: string }).type === "emulator_error"
      ) {
        const message =
          (payload as { message?: string }).message ?? "emulator_error";
        rejectLoaded(new Error(message));
      }
    });
    await page.addInitScript(() => {
      window.addEventListener("message", (e: MessageEvent) => {
        const data = e.data as { type?: string; payload?: unknown } | undefined;
        if (data?.type === "_infinite_pc_bridge") {
          // @ts-expect-error injected by exposeFunction
          window.__infinitePcThumbBridge?.(data.payload);
        }
      });
    });

    try {
      const url = buildEmbedUrl(preset);
      const outPath = path.join(OUT_DIR, `${preset.id}.png`);
      const loadTimeout = preset.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
      console.log(
        `[${preset.id}] ${url}  size=${preset.width}x${preset.height}  ` +
          `loadTimeout=${loadTimeout / 1000}s  settle=${preset.settleMs / 1000}s`
      );

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("emulator_loaded timeout")), loadTimeout);
      });
      await Promise.race([loadedPromise, timeoutPromise]);
      console.log(`  emulator_loaded — settling for ${preset.settleMs}ms`);

      // Hide the click-to-capture pill so it doesn't appear in the screenshot.
      await page.evaluate(() => {
        const hint = document.getElementById("grab_hint");
        if (hint) hint.style.display = "none";
      });

      await new Promise((r) => setTimeout(r, preset.settleMs));

      await page.screenshot({
        path: outPath,
        type: "png",
        clip: {
          x: 0,
          y: 0,
          width: preset.width,
          height: preset.height,
        },
      });
      console.log(`  -> ${outPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED [${preset.id}]: ${message}`);
      failures.push(`${preset.id}: ${message}`);
    } finally {
      await page.close();
      await context.close();
    }
  }

  await browser.close();

  if (failures.length) {
    console.error("\nDone with errors:");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
