/**
 * Capture real ryOS footage for the Dictionary + Fitness promo.
 *   bun scripts/promo/shoot.ts desktop|dictionary|fitness|dict-extra|fitness-extra|exercises
 *   PROMO_DEVICE=phone bun scripts/promo/shoot.ts …   # mobile layout for the vertical cut
 * `desktop` is a few seconds of the idle ryOS desktop for the opening shot. Every session first puts the
 * Dictionary and Fitness shortcuts on the desktop. The last three sessions feed only the 60 s cut.
 * Writes capture.mkv + marks.json to $PROMO_WORK_DIR/rec/<device>-<session>/ (default tmp/promo).
 * Marks named `tap:*` carry the clicked element's box (CSS px) for tap indicators.
 */
import type { Locator, Page } from "playwright";
import { boot, centerWindow, DEVICE, fillPhoneWindow, launch, launchApp, quietDesktop, signIn, sleep, union, WORK_DIR, X11Recorder } from "./lib";
import { runIpod } from "./ipod";
import { fitnessView, seedDesktopShortcuts, seedFitness } from "./seed";

const session = process.argv[2] ?? "dictionary";
const dir = `${WORK_DIR}/rec/${DEVICE}-${session}`;
const phone = DEVICE === "phone";

const box = async (l: Locator) => ((await l.count()) ? l.first().boundingBox() : null);

async function retype(page: Page, input: Locator, text: string, delay = 95) {
  // Type over the selected query; an empty query shows the welcome screen (its sample chips must stay off camera).
  await input.click();
  await page.keyboard.press("Control+A");
  await sleep(120);
  await input.pressSequentially(text, { delay });
  await sleep(180);
  await input.press("Enter");
}

async function dictionary(page: Page) {
  await launchApp(page, "dictionary");
  await sleep(1000);
  if (phone) await fillPhoneWindow(page);
  else await centerWindow(page, 700, 676);
  const input = page.getByPlaceholder("Look up a word");
  const win = page.locator("[data-window-instance-id]").last();
  await retype(page, input, "serendipity", 20);
  await sleep(2000);
  const rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(900);

  rec.mark("en", await box(win));
  await sleep(1200);
  for (const [name, word] of [["ja", "食べる"], ["ko", "사랑"]] as const) {
    await retype(page, input, word, 60);
    await sleep(1300);
    rec.mark(name);
    await sleep(1200);
  }

  rec.mark("zh-type");
  await retype(page, input, "豆腐", 200);
  await sleep(1500);
  rec.mark("zh-result");
  const cards = page.locator("[data-hanzi-key]");
  await cards.first().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await sleep(900);
  rec.mark("cards", union([await box(cards.first()), await box(cards.last())]));
  // Only the stroke box replays; the rest of a hanzi card looks that character up.
  await rec.tap(page.getByRole("button", { name: "replay 豆", exact: true }), "hanzi1");
  await sleep(120);
  await page.getByRole("button", { name: "replay 腐", exact: true }).first().click();
  rec.mark("hanzi-start", union([await box(cards.first()), await box(cards.last())]));
  await sleep(5200);
  rec.mark("hanzi-end");

  await retype(page, input, process.env.PROMO_AI_WORD || "halcyon");
  await sleep(1500);
  const explain = page.getByRole("button", { name: /explain usage/i }).first();
  await explain.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await sleep(500);
  rec.mark("ai-ready", await box(explain));
  await sleep(600);
  await rec.tap(explain, "explain");
  const t0 = Date.now();
  const aiSection = page.getByText("AI Notes", { exact: true }).first().locator("xpath=ancestor::div[2]");
  let last = "";
  let stableSince = Date.now();
  let marked = false;
  while (Date.now() - t0 < 45000) {
    const text = (await aiSection.innerText().catch(() => "")) || "";
    if (text !== last) {
      if (!marked && text.length > 40) {
        rec.mark("ai-stream", await box(aiSection));
        marked = true;
      }
      last = text;
      stableSince = Date.now();
      await aiSection.evaluate((el) => el.scrollIntoView({ block: "nearest" })).catch(() => {});
    } else if (text.length > 300 && Date.now() - stableSince > 1200) break;
    await sleep(120);
  }
  console.log(`[ai] notes done in ${Date.now() - t0}ms (${last.length} chars)`);
  if (Date.now() - t0 < 3000) console.warn("[ai] notes were probably cached – pick a fresh PROMO_AI_WORD to show streaming");
  rec.mark("ai-end", await box(aiSection));
  await sleep(1000);
  await rec.stop();
}

async function fitness(page: Page) {
  await seedFitness(page);
  await launchApp(page, "fitness");
  await sleep(1000);
  if (phone) await fillPhoneWindow(page);
  else await centerWindow(page, 660, 676);
  await fitnessView(page, "food");
  await sleep(1500);
  const win = page.locator("[data-window-instance-id]").last();
  const rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(900);

  const desc = page.getByPlaceholder(/Describe what you ate/);
  rec.mark("food-start", union([await box(desc), await box(page.getByRole("button", { name: "Estimate with AI" }))]));
  await rec.tap(desc, "describe");
  await desc.pressSequentially("tonkotsu ramen with chashu and a soft egg, 6 gyoza", { delay: 40 });
  await sleep(400);
  const estimate = page.getByRole("button", { name: "Estimate with AI" });
  rec.mark("food-typed", await box(estimate));
  await rec.tap(estimate, "estimate");
  const t0 = Date.now();
  await page.getByRole("button", { name: "Save to Log" }).waitFor({ timeout: 60000 });
  console.log(`[food] estimate in ${Date.now() - t0}ms`);
  await sleep(300);
  const review = page.getByText("Review & Save", { exact: true }).first().locator("xpath=ancestor::div[1]");
  rec.mark("food-review", await box(review));
  await sleep(1500);
  const split = page.getByRole("combobox", { name: "split" });
  await split.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await sleep(300);
  rec.mark("split-ready", union([await box(split), await box(page.getByText(/^total$/i))]));
  await sleep(500);
  await rec.tap(split, "split");
  await sleep(800);
  await rec.tap(page.getByRole("option", { name: "÷2" }), "half");
  await sleep(300);
  rec.mark("split-done", union([await box(split), await box(page.getByText(/^your share$/i))]));
  await sleep(2000);
  await page.getByRole("button", { name: "Save to Log" }).click();
  await sleep(800);

  await fitnessView(page, "body");
  await sleep(700);
  const chart = page.getByText("Weight", { exact: true }).first().locator("xpath=ancestor::div[2]");
  rec.mark("body", await box(chart));
  await sleep(3500);
  rec.mark("body-end", await box(win));
  await rec.stop();
}

/** Pronunciation playback (the entry's recorded audio) and the Readings menu (Zhuyin on 豆腐), for the 60 s cut. */
async function dictExtra(page: Page) {
  await launchApp(page, "dictionary");
  await sleep(1000);
  if (phone) await fillPhoneWindow(page);
  else await centerWindow(page, 700, 676);
  const input = page.getByPlaceholder("Look up a word");
  await retype(page, input, "serendipity", 20);
  await sleep(2500);
  // dictionaryapi.dev mirrors Wikimedia Commons recordings (…/en/serendipity-au.mp3 = File:En-au-serendipity.ogg).
  // When the mirror is down, serve the same Commons file so playback is real; keep the bytes for the soundtrack.
  const clips = new Map<string, { url: string; body: Buffer; type: string }>();
  const resolveClip = async (url: string) => {
    if (clips.has(url)) return clips.get(url)!;
    const up = await fetch(url, { signal: AbortSignal.timeout(4000) }).catch(() => null);
    let clip: { url: string; body: Buffer; type: string } | null = null;
    if (up?.ok) clip = { url, body: Buffer.from(await up.arrayBuffer()), type: up.headers.get("content-type") ?? "audio/mpeg" };
    else {
      const m = url.match(/pronunciations\/([a-z]+)\/(.+)-([a-z]+)\.mp3$/i);
      const file = m ? `${m[1][0].toUpperCase()}${m[1].slice(1)}-${m[3]}-${m[2]}.ogg` : null;
      const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(file ?? "")}&prop=imageinfo&iiprop=url&format=json`;
      // Wikimedia answers requests without a descriptive User-Agent with an HTML error page.
      const headers = { "User-Agent": "ryOS-promo/1.0 (https://os.ryo.lu)" };
      const info = file ? await (await fetch(api, { headers })).json() : null;
      const src = info && (Object.values(info.query.pages)[0] as { imageinfo?: { url: string }[] }).imageinfo?.[0]?.url;
      const res = src ? await fetch(src, { headers }) : null;
      if (res?.ok && res.headers.get("content-type")?.startsWith("audio/"))
        clip = { url: src, body: Buffer.from(await res.arrayBuffer()), type: "audio/ogg" };
      console.log(`[listen] mirror ${up?.status ?? "timeout"} for ${url}; Commons ${file}: ${src ? "ok" : "missing"}`);
    }
    if (clip) clips.set(url, clip);
    return clip;
  };
  let played: { url: string; body: Buffer; type: string } | null = null;
  // Chromium won't play a fulfilled media body (MEDIA_ERR_SRC_NOT_SUPPORTED), so redirect to the source instead.
  await page.route("https://api.dictionaryapi.dev/media/pronunciations/**", async (route) => {
    const url = route.request().url();
    const clip = await resolveClip(url);
    if (!clip) return route.continue();
    played = clip;
    return clip.url === url ? route.continue() : route.fulfill({ status: 302, headers: { location: clip.url } });
  });
  await resolveClip("https://api.dictionaryapi.dev/media/pronunciations/en/serendipity-au.mp3"); // warm: no wait on camera
  // Wall-clock marks for when the recording actually starts and stops, to line the clip up in the soundtrack.
  let rec: X11Recorder | null = null;
  await page.exposeFunction("__promoAudio", (ev: string) => rec?.mark(`audio-${ev}`));
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const w = window as unknown as { __promoAudio: (ev: string) => void };
      this.addEventListener("playing", () => w.__promoAudio("playing"), { once: true });
      this.addEventListener("ended", () => w.__promoAudio("ended"), { once: true });
      return play.call(this);
    };
  });
  rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(900);

  const listen = page.getByRole("button", { name: "Listen", exact: true }).first();
  rec.mark("listen-ready", union([await box(page.locator("h2").first()), await box(listen)]));
  await sleep(1200);
  // The label flips to "Stop" while it plays, so poll the element itself rather than the "Listen" locator.
  const btn = (await listen.elementHandle())!;
  await rec.tap(listen, "listen");
  const t0 = Date.now();
  let on = false;
  while (Date.now() - t0 < 6000) {
    const pressed = (await btn.getAttribute("aria-pressed").catch(() => null)) === "true";
    if (pressed && !on) {
      rec.mark("listen-on", await btn.boundingBox());
      on = true;
    } else if (!pressed && on) break;
    await sleep(40);
  }
  rec.mark("listen-off");
  console.log(`[listen] active ${on} for ${Date.now() - t0}ms`);
  await sleep(900);

  rec.mark("zh-type");
  await retype(page, input, "豆腐", 200);
  await sleep(1600);
  const head = page.locator('h2[lang^="zh"]').first();
  rec.mark("zh-result", await box(head));
  await sleep(900);
  await rec.tap(page.getByRole("menuitem", { name: /^Reading/ }), "readings");
  await sleep(700);
  await rec.tap(page.getByRole("menuitem", { name: "Chinese", exact: true }), "zh-menu");
  await sleep(700);
  await rec.tap(page.getByRole("menuitemcheckbox", { name: /Zhuyin/ }), "zhuyin");
  await sleep(400);
  await page.keyboard.press("Escape").catch(() => {});
  rec.mark("zhuyin-on", await box(head));
  await sleep(3000);
  rec.mark("zhuyin-end", await box(head));
  await rec.stop();
  const clip = played as { url: string; body: Buffer; type: string } | null;
  if (clip) {
    const ext = clip.type.includes("ogg") ? "ogg" : "mp3";
    await Bun.write(`${dir}/listen.${ext}`, clip.body);
    await Bun.write(`${dir}/listen.json`, JSON.stringify({ url: clip.url, file: `listen.${ext}` }));
    console.log(`[listen] saved listen.${ext} from ${clip.url}`);
  }
}

/** The week plan, then Start Workout and a set-by-set log of one lift. */
async function fitnessExtra(page: Page) {
  await seedFitness(page);
  await launchApp(page, "fitness");
  await sleep(1000);
  if (phone) await fillPhoneWindow(page);
  else await centerWindow(page, 660, 676);
  await fitnessView(page, "schedule");
  await sleep(2500);
  const win = page.locator("[data-window-instance-id]").last();
  const rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(900);

  const week = page.getByText("This Week", { exact: true }).first().locator("xpath=ancestor::div[2]");
  rec.mark("schedule", await box(week));
  await sleep(2600);
  await rec.tap(page.getByRole("button", { name: "Start Workout" }), "start");
  await sleep(1300);
  rec.mark("workouts", await box(win));
  await rec.tap(page.getByRole("button", { name: /Barbell Bench Press - Medium Grip/ }).first(), "lift");
  await sleep(1100);
  const entry = page.getByRole("button", { name: "Add Set" }).first().locator("xpath=ancestor::section[1]");
  const entryBox = async () => (await box(entry)) ?? (await box(page.getByRole("button", { name: "Add Set" })));
  rec.mark("entry", await entryBox());
  for (let i = 1; i <= 3; i++) {
    await sleep(700);
    await rec.tap(page.getByRole("button", { name: "Add Set" }), `set${i}`);
  }
  await sleep(600);
  rec.mark("sets-done", await entryBox());
  await sleep(2200);
  await rec.stop();
}

/** The exercise library in Japanese: localized names, muscles and instructions (session boots in ja). */
async function exercises(page: Page) {
  await seedFitness(page);
  await launchApp(page, "fitness");
  await sleep(1000);
  if (phone) await fillPhoneWindow(page);
  else await centerWindow(page, 660, 676);
  await fitnessView(page, "exercises");
  await page.getByRole("option").first().waitFor({ timeout: 30000 });
  await sleep(1500);
  const win = page.locator("[data-window-instance-id]").last();
  const rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(900);

  const search = page.locator("[data-window-instance-id] input[data-os-search-input]").first();
  rec.mark("ex-start", await box(win));
  await rec.tap(search, "search");
  await search.pressSequentially("ベンチプレス", { delay: 140 });
  await sleep(900);
  rec.mark("ex-results", await box(page.getByRole("listbox")));
  await rec.tap(page.getByRole("option").filter({ hasText: "Barbell Bench Press - Medium Grip" }).first(), "pick");
  await page.locator("ol li").first().waitFor({ timeout: 20000 });
  await sleep(600);
  const detail = page.locator("ol").first().locator("xpath=ancestor::div[contains(@class,'overflow-y-auto')][1]");
  rec.mark("ex-detail", await box(detail));
  await sleep(3800);
  rec.mark("ex-end", await box(detail));
  await rec.stop();
}

async function desktop() {
  await sleep(1500);
  const rec = new X11Recorder(dir, page);
  await rec.start();
  // The 60s title holds this shot for ~5.6s from the start mark. Leave slack so the last frames are real.
  await sleep(7000);
  await rec.stop();
}

const { browser, page } = await launch();
await boot(page, { language: session === "exercises" ? "ja" : "en" });
await signIn(page);
await quietDesktop(page);
const forIpod = session.startsWith("ipod") || (session === "desktop" && process.env.PROMO_APP === "ipod");
await seedDesktopShortcuts(page, forIpod ? [["ipod", "iPod"]] : [["dictionary", "Dictionary"], ["fitness", "Fitness"]]);
const sessions: Record<string, (page: Page) => Promise<void>> = {
  desktop, dictionary, fitness, "dict-extra": dictExtra, "fitness-extra": fitnessExtra, exercises,
  ipod: (p) => runIpod(p, dir, phone),
};
if (!sessions[session]) throw new Error(`unknown session ${session}: ${Object.keys(sessions).join(", ")}`);
await sessions[session](page);
await page.screenshot({ path: `${dir}-last.png`, timeout: 5000 }).catch(() => {});
await browser.close();
