import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

export const BASE = process.env.RYOS_URL || "http://localhost:5173";
/** `PROMO_DEVICE=phone` captures the mobile layout (390x844 CSS at 3x) for the vertical cut. */
export const DEVICE = process.env.PROMO_DEVICE === "phone" ? "phone" : "desktop";
export const VIEWPORT = DEVICE === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 810 };
export const DSF = DEVICE === "phone" ? 3 : 2;
/** Scratch dir for captures and renders (gitignored). */
export const WORK_DIR = process.env.PROMO_WORK_DIR || path.resolve(import.meta.dir, "../../tmp/promo");

/** Chrome won't size a window below ~500 DIP, so the phone viewport is emulated inside a wider window and the capture crops its top-left. */
const WINDOW = DEVICE === "phone" ? { width: 520, height: VIEWPORT.height } : VIEWPORT;

/** Headed Chrome in kiosk mode on a private Xvfb display sized to the window at DSF. */
export const X_DISPLAY = process.env.PROMO_DISPLAY || (DEVICE === "phone" ? ":98" : ":99");

export async function ensureXvfb() {
  const lock = `/tmp/.X${X_DISPLAY.slice(1)}-lock`;
  if (await Bun.file(lock).exists()) return;
  const size = `${WINDOW.width * DSF}x${WINDOW.height * DSF}x24`;
  Bun.spawn(["Xvfb", X_DISPLAY, "-screen", "0", size, "-nolisten", "tcp"], {
    stdout: "ignore",
    stderr: "ignore",
  }).unref();
  await sleep(1500);
}

export async function launch(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  if (process.env.PROMO_HEADLESS === "1") return launchHeadless();
  await ensureXvfb();
  const profile = `/tmp/promo-chrome-${Date.now()}`;
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    headless: false,
    ...(DEVICE === "phone" ? { viewport: VIEWPORT, deviceScaleFactor: DSF } : { viewport: null }),
    env: { ...process.env, DISPLAY: X_DISPLAY },
    args: [
      "--kiosk",
      "--window-position=0,0",
      `--window-size=${WINDOW.width},${WINDOW.height}`,
      `--force-device-scale-factor=${DSF}`,
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
      "--disable-infobars",
      "--no-first-run",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
  if (DEVICE === "phone") {
    // Kiosk is dropped when Playwright emulates the viewport; fullscreen hides the tab strip again.
    const cdp = await ctx.newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "fullscreen" } });
    await sleep(800);
  }
  const browser = { close: () => ctx.close() } as unknown as Browser;
  return { browser, ctx, page };
}

async function launchHeadless(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    headless: true,
    args: ["--font-render-hinting=none", "--force-color-profile=srgb"],
  });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DSF, hasTouch: DEVICE === "phone" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
  return { browser, ctx, page };
}

/** Boot ryOS at `/`, quiet the desktop, sign in, optionally set language. */
export async function boot(page: Page, opts: { language?: string } = {}) {
  await page.addInitScript((lang) => {
    try {
      sessionStorage.removeItem("ryos:nextBootMessage");
      localStorage.setItem("ryos:theme", "macosx");
      localStorage.setItem("ryos:assistant", JSON.stringify({ state: { enabled: false }, version: 2 }));
      const wp = "/wallpapers/photos/aqua/0-leopard-aqua_blue.jpg";
      localStorage.setItem(
        "ryos:display-settings",
        JSON.stringify({
          state: {
            displayMode: "color",
            shaderEffectEnabled: false,
            selectedShaderType: "aurora",
            currentWallpaper: wp,
            wallpaperSource: wp,
            screenSaverEnabled: false,
            screenSaverType: "starfield",
            screenSaverIdleTime: 5,
            debugMode: false,
            showResizers: false,
            htmlPreviewSplit: true,
          },
          version: 2,
        })
      );
      if (lang) {
        localStorage.setItem("ryos:language", lang);
        localStorage.setItem("ryos:language-initialized", "true");
      }
    } catch {}
  }, opts.language ?? "en");
  await page.goto(`${BASE}/?_ryo=1`);
  await page.waitForTimeout(5000);
}

export async function signIn(page: Page) {
  const username = `promo${Date.now().toString(36)}`;
  const password = `Promo-${Math.random().toString(36).slice(2)}!9`;
  const res = await page.evaluate(
    async ({ username, password }) => {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      return { status: r.status, body: (await r.text()).slice(0, 200) };
    },
    { username, password }
  );
  console.log("[signIn]", username, res.status);
}

/** Import a Vite module from inside the page – resolves to the same instance the app uses. */
export async function store<T = unknown>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ({ fn, arg }) => {
      // eslint-disable-next-line no-new-func
      const f = new Function("arg", `return (async () => { ${fn} })()`);
      return f(arg);
    },
    { fn, arg }
  );
}

export async function launchApp(page: Page, appId: string) {
  await store(page, `const m = await import("/src/stores/useAppStore.ts"); m.useAppStore.getState().launchApp(arg);`, appId);
  await page.waitForTimeout(2500);
}

/** Move + resize the newest window with real mouse drags (title bar, then the SE resize handle). */
export async function placeWindow(page: Page, box: { x: number; y: number; w: number; h: number }) {
  const win = page.locator("[data-window-instance-id]").last();
  let b = (await win.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + b.width / 2, box.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  b = (await win.boundingBox())!;
  const se = win.locator(".cursor-se-resize").first();
  const h = (await se.boundingBox())!;
  const sx = h.x + h.width / 2;
  const sy = h.y + h.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + (box.x + box.w - (b.x + b.width)), sy + (box.y + box.h - (b.y + b.height)), { steps: 10 });
  await page.mouse.up();
  await page.mouse.move(VIEWPORT.width - 5, VIEWPORT.height / 2);
  await page.waitForTimeout(500);
}

/** 30 fps x11grab of the Xvfb display; marks are wall-clock and aligned via the mkv's epoch start_time. */
export class X11Recorder {
  private proc?: ReturnType<typeof Bun.spawn>;
  private marks: { name: string; ts: number; box?: Box }[] = [];
  constructor(private dir: string, private fps = 30) {}

  async start() {
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    const size = `${VIEWPORT.width * DSF}x${VIEWPORT.height * DSF}`;
    this.proc = Bun.spawn(
      [
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-f", "x11grab", "-draw_mouse", "0", "-framerate", String(this.fps), "-video_size", size, "-i", `${X_DISPLAY}.0`,
        "-copyts", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p",
        path.join(this.dir, "capture.mkv"),
      ],
      { stdin: "pipe", stdout: "inherit", stderr: "inherit" }
    );
    await sleep(1200);
    this.mark("start");
  }

  mark(name: string, box?: Box | null) {
    this.marks.push({ name, ts: Date.now() / 1000, ...(box ? { box } : {}) });
    console.log(`[mark] ${name}`);
  }

  /** Click with a recorded `tap` mark so the compositor can draw a tap indicator there. */
  async tap(target: Locator, label = "tap") {
    const b = await target.first().boundingBox();
    if (b) this.mark(`tap:${label}`, b);
    await target.first().click();
  }

  async stop() {
    this.mark("end");
    await sleep(800);
    const stdin = this.proc!.stdin as import("bun").FileSink;
    stdin.write("q");
    stdin.end();
    await this.proc!.exited;
    const probe = Bun.spawnSync([
      "ffprobe", "-v", "error", "-show_entries", "format=start_time,duration", "-of", "json", path.join(this.dir, "capture.mkv"),
    ]);
    const fmt = JSON.parse(probe.stdout.toString()).format;
    const t0 = Number(fmt.start_time);
    if (Number(fmt.duration) > t0) fmt.duration = Number(fmt.duration) - t0;
    await writeFile(
      path.join(this.dir, "marks.json"),
      JSON.stringify(
        { source: "capture.mkv", startTime: t0, duration: Number(fmt.duration), dsf: DSF,
          marks: this.marks.map((m) => ({ ...m, t: +(m.ts - t0).toFixed(3) })) },
        null,
        2
      )
    );
    console.log(`[rec] start_time=${t0} duration=${fmt.duration}`);
  }
}

export type Box = { x: number; y: number; width: number; height: number };

export function union(boxes: (Box | null)[]): Box | null {
  const bs = boxes.filter((b): b is Box => !!b);
  if (!bs.length) return null;
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  const r = Math.max(...bs.map((b) => b.x + b.width));
  const btm = Math.max(...bs.map((b) => b.y + b.height));
  return { x, y, width: r - x, height: btm - y };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
