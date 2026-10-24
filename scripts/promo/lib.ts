import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

export const BASE = process.env.RYOS_URL || "http://localhost:5173";
/**
 * Viewports match the screens of the bezels build.py frames them in:
 * desktop = MacBook Air 13" (1280x832 CSS at 2x = 2560x1664), `PROMO_DEVICE=phone` = iPhone 18 Pro (402x874 at 3x = 1206x2622).
 */
export const DEVICE = process.env.PROMO_DEVICE === "phone" ? "phone" : "desktop";
export const VIEWPORT = DEVICE === "phone" ? { width: 402, height: 874 } : { width: 1280, height: 832 };
export const DSF = DEVICE === "phone" ? 3 : 2;
/** iPhone 18 Pro portrait safe-area insets (CSS px): status bar / Dynamic Island on top, home indicator below. */
export const PHONE_SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 };
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
  if (process.platform === "darwin") return launchDarwin();
  await ensureXvfb();
  const profile = `/tmp/promo-chrome-${Date.now()}`;
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    headless: false,
    ...(DEVICE === "phone" ? { viewport: VIEWPORT, deviceScaleFactor: DSF, hasTouch: true } : { viewport: null }),
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

/** Headed Google Chrome on this Mac. CDP screencast records the emulated viewport at device pixels, so the display can be smaller than the capture. */
async function launchDarwin(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
  const profile = `/tmp/promo-chrome-${Date.now()}`;
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: false,
    viewport: VIEWPORT,
    deviceScaleFactor: DSF,
    hasTouch: DEVICE === "phone",
    args: [
      "--window-position=40,40",
      `--window-size=${Math.max(WINDOW.width, 540)},${VIEWPORT.height + 88}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-blink-features=AutomationControlled",
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
  if (DEVICE === "phone") await emulateIosShell(page);
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
    } catch {
      // storage unavailable – the app falls back to its defaults
    }
  }, opts.language ?? "en");
  await page.goto(`${BASE}/?_ryo=1`);
  await page.waitForTimeout(5000);
}

/**
 * Look like ryOS in its iOS app on an iPhone 18 Pro: CDP makes env(safe-area-inset-*) report the device's insets,
 * and <html data-ios-shell> is the marker the app sets so ryOS consumes the top inset (the browser leaves it at 0).
 * Only the attribute is set – no window.ryosDesktop bridge, so no native calls are attempted.
 */
async function emulateIosShell(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: PHONE_SAFE_AREA } as never);
  await page.addInitScript(() => {
    const mark = () => document.documentElement?.setAttribute("data-ios-shell", "");
    if (document.documentElement) mark();
    else new MutationObserver((_, o) => document.documentElement && (mark(), o.disconnect())).observe(document, { childList: true });
  });
}

export async function signIn(page: Page) {
  const username = `promo${Date.now().toString(36)}`;
  const password = `Promo-${crypto.randomUUID()}!9`;
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
  console.log("[signIn]", username, res.status, res.status >= 400 ? res.body : "");
}

/**
 * Run `fn` in the page with `import("/src/…")` resolved to the URL the app itself loaded. After an HMR update Vite
 * serves the app `…?t=<ts>`, and importing the bare path would create a second, disconnected store instance.
 */
export async function store<T = unknown>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ({ fn, arg }) => {
      const loaded = (p: string) => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        const hit = urls.reverse().find((u) => new URL(u).pathname === p);
        return hit ?? p;
      };
      const f = new Function("arg", "__load", `return (async () => { ${fn.replace(/import\(\s*"(\/src\/[^"]+)"\s*\)/g, 'import(__load("$1"))')} })()`);
      return f(arg, loaded);
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

/** Place the newest window centred on the screen (both axes) and log how far off the result is. */
export async function centerWindow(page: Page, w: number, h: number) {
  await placeWindow(page, { x: Math.round((VIEWPORT.width - w) / 2), y: Math.round((VIEWPORT.height - h) / 2), w, h });
  const b = (await page.locator("[data-window-instance-id]").last().boundingBox())!;
  const dx = b.x + b.width / 2 - VIEWPORT.width / 2;
  const dy = b.y + b.height / 2 - VIEWPORT.height / 2;
  console.log(`[window] ${Math.round(b.width)}x${Math.round(b.height)} at ${Math.round(b.x)},${Math.round(b.y)} (centre off by ${dx.toFixed(1)}, ${dy.toFixed(1)})`);
}

/** The mobile layout has no resize handle: grow the newest window to fill the space between the menubar and the dock. */
export async function fillPhoneWindow(page: Page, gap = 8) {
  const win = page.locator("[data-window-instance-id]").last();
  const id = await win.getAttribute("data-window-instance-id");
  const top = (await win.boundingBox())!.y;
  const dockTop = (await page.locator("[data-dock-placement]").first().boundingBox())?.y ?? VIEWPORT.height - 100;
  const height = Math.floor(dockTop - gap - top);
  await store(
    page,
    `const s = (await import("/src/stores/useAppStore.ts")).useAppStore.getState();
     s.updateInstanceWindowState(arg.id, s.instances[arg.id].position, { width: ${VIEWPORT.width}, height: arg.height });`,
    { id, height }
  );
  console.log(`[window] ${VIEWPORT.width}x${height} at y ${Math.round(top)}, dock top ${Math.round(dockTop)}`);
  await page.waitForTimeout(500);
}

/** 30 fps capture. Linux: x11grab of the Xvfb display. macOS: Chrome screencast of the emulated viewport at device pixels. */
export class X11Recorder {
  private proc?: ReturnType<typeof Bun.spawn>;
  private marks: { name: string; ts: number; box?: Box }[] = [];
  private cdp?: import("playwright").CDPSession;
  private frameTimes: number[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private framesDir = "";
  private t0 = 0;
  private stopLoop = false;
  private loopDone: Promise<void> = Promise.resolve();
  constructor(private dir: string, private page?: Page, private fps = 30) {}

  async start() {
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    if (process.platform === "darwin") {
      await this.startScreencast();
      return;
    }
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

  /**
   * Page.startScreencast on this Mac delivered one CSS-pixel frame and then stalled
   * (the ack deadlocks inside the CDP event). Capture the emulated viewport the same
   * way Playwright's screenshot does: a clip in CSS pixels at `scale: DSF`, so the
   * jpeg is the bezel's device-pixel size (2560×1664 or 1206×2622).
   */
  private async startScreencast() {
    if (!this.page) throw new Error("macOS capture needs the Playwright page");
    this.framesDir = path.join(this.dir, "frames");
    await mkdir(this.framesDir, { recursive: true });
    this.stopLoop = false;
    this.cdp = await this.page.context().newCDPSession(this.page);
    const sw = VIEWPORT.width * DSF;
    const sh = VIEWPORT.height * DSF;

    const shoot = async () => {
      const started = Date.now() / 1000;
      const shot = await this.cdp!.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 90,
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: DSF },
      });
      const n = this.frameTimes.length + 1;
      const file = path.join(this.framesDir, `${String(n).padStart(5, "0")}.jpg`);
      this.frameTimes.push(started);
      const buf = Buffer.from(shot.data, "base64");
      this.writeChain = this.writeChain.then(() => Bun.write(file, buf)).then(() => undefined);
    };

    await shoot();
    const first = path.join(this.framesDir, "00001.jpg");
    await this.writeChain;
    const dim = Bun.spawnSync([
      "ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", first,
    ]);
    const [w, h] = dim.stdout.toString().trim().split(",").map(Number);
    if (w !== sw || h !== sh) {
      throw new Error(`capture frame is ${w}x${h}, bezel screen is ${sw}x${sh}`);
    }
    this.t0 = this.frameTimes[0];
    this.mark("start");

    this.loopDone = (async () => {
      let lastLog = Date.now();
      while (!this.stopLoop) {
        const t = Date.now();
        try {
          await shoot();
        } catch (e) {
          if (this.stopLoop) break;
          console.warn("[rec] frame failed", e instanceof Error ? e.message : e);
          await sleep(40);
          continue;
        }
        const wait = 1000 / this.fps - (Date.now() - t);
        if (wait > 2) await sleep(wait);
        if (Date.now() - lastLog > 5000) {
          const n = this.frameTimes.length;
          const span = this.frameTimes[n - 1] - this.frameTimes[0];
          console.log(`[rec] ${n} frames, ${span > 0 ? (n / span).toFixed(1) : "?"} fps`);
          lastLog = Date.now();
        }
      }
    })();
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
    await sleep(500);
    if (process.platform === "darwin") {
      await this.stopScreencast();
      return;
    }
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

  private async stopScreencast() {
    this.stopLoop = true;
    await this.loopDone;
    await this.cdp?.detach().catch(() => {});
    await this.writeChain;
    const n = this.frameTimes.length;
    const sw = VIEWPORT.width * DSF;
    const sh = VIEWPORT.height * DSF;
    const lines = ["ffconcat version 1.0"];
    for (let i = 0; i < n; i++) {
      const dur = i + 1 < n ? Math.max(1 / 120, this.frameTimes[i + 1] - this.frameTimes[i]) : 1 / this.fps;
      lines.push(`file '${path.join(this.framesDir, `${String(i + 1).padStart(5, "0")}.jpg`)}'`);
      lines.push(`duration ${dur.toFixed(4)}`);
    }
    lines.push(`file '${path.join(this.framesDir, `${String(n).padStart(5, "0")}.jpg`)}'`);
    const list = path.join(this.dir, "frames.txt");
    await writeFile(list, lines.join("\n") + "\n");
    console.log(`[rec] ${n} frames at ${sw}x${sh}`);
    const enc = Bun.spawnSync([
      "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
      "-f", "concat", "-safe", "0", "-i", list,
      "-fps_mode", "cfr", "-r", String(this.fps),
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p",
      path.join(this.dir, "capture.mkv"),
    ]);
    if (enc.exitCode !== 0) {
      console.error(enc.stderr.toString().slice(-2000));
      throw new Error(`ffmpeg encode failed (${enc.exitCode})`);
    }
    await rm(this.framesDir, { recursive: true, force: true });
    const probe = Bun.spawnSync([
      "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(this.dir, "capture.mkv"),
    ]);
    const duration = Number(probe.stdout.toString().trim());
    await writeFile(
      path.join(this.dir, "marks.json"),
      JSON.stringify(
        { source: "capture.mkv", startTime: 0, duration, dsf: DSF,
          marks: this.marks.map((m) => ({ ...m, t: +(m.ts - this.t0).toFixed(3) })) },
        null,
        2
      )
    );
    console.log(`[rec] duration=${duration.toFixed(2)}s`);
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
