/**
 * Capture real ryOS footage for the Dictionary + Fitness promo.
 *   bun scripts/promo/shoot.ts dictionary|fitness
 * Writes capture.mkv + marks.json to $PROMO_WORK_DIR/rec/<session>/ (default tmp/promo).
 */
import type { Locator, Page } from "playwright";
import { boot, launch, WORK_DIR, launchApp, placeWindow, signIn, sleep, union, X11Recorder } from "./lib";
import { fitnessView, seedFitness, setLanguage } from "./seed";

const session = process.argv[2] ?? "dictionary";
const dir = `${WORK_DIR}/rec/${session}`;

const box = async (l: Locator) => (await l.count()) ? l.first().boundingBox() : null;

async function retype(page: Page, input: Locator, text: string, delay = 95) {
  // Type over the selected query; an empty query shows the welcome screen (its sample chips must stay off camera).
  await input.click();
  await page.keyboard.press("Control+A");
  await sleep(150);
  await input.pressSequentially(text, { delay });
  await sleep(220);
  await input.press("Enter");
}

/** Smooth pen stroke through points (CSS px relative to the canvas). */
async function stroke(page: Page, origin: { x: number; y: number }, pts: [number, number][], steps = 9) {
  await page.mouse.move(origin.x + pts[0][0], origin.y + pts[0][1]);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      await page.mouse.move(origin.x + ax + (bx - ax) * t, origin.y + ay + (by - ay) * t);
    }
  }
  await page.mouse.up();
  await sleep(260);
}

async function dictionary(page: Page) {
  await launchApp(page, "dictionary");
  await sleep(1000);
  await placeWindow(page, { x: 150, y: 36, w: 1140, h: 690 });
  const input = page.getByPlaceholder("Look up a word");
  const win = page.locator("[data-window-instance-id]").last();
  await retype(page, input, "hello", 20);
  await sleep(1500);
  const rec = new X11Recorder(dir);
  await rec.start();
  await sleep(1200);

  rec.mark("en-start", await box(win));
  await retype(page, input, "serendipity");
  await sleep(2600);
  rec.mark("en-end", await box(page.getByRole("heading", { name: "serendipity" })));

  rec.mark("zh-start");
  await retype(page, input, "豆腐", 260);
  await sleep(1600);
  const cards = page.locator("[data-hanzi-key]");
  rec.mark("zh-result");
  await sleep(600);
  await cards.first().evaluate((el) => el.scrollIntoView({ block: "end", behavior: "smooth" }));
  await sleep(900);
  const g1 = (await box(cards.first()))!;
  const g2 = (await box(cards.last()))!;
  // Real browser pinch-zoom so strokes re-rasterize crisply instead of upscaling in post.
  // The anchor stays fixed on screen, so solve for the anchor that lands the target at screen center.
  const cdp = await page.context().newCDPSession(page);
  const zoom = 2.0;
  const cx = (g1.x + g2.x + 150) / 2;
  const cy = g1.y + g1.height / 2;
  const anchor = { x: (720 - cx * zoom) / (1 - zoom), y: (560 - cy * zoom) / (1 - zoom) };
  rec.mark("pinch-in", union([g1, g2]));
  await cdp.send("Input.synthesizePinchGesture", { ...anchor, scaleFactor: zoom, relativeSpeed: 420 });
  await sleep(200);
  await cards.first().evaluate((el) => (el as HTMLElement).click());
  await cards.last().evaluate((el) => (el as HTMLElement).click());
  rec.mark("hanzi-start");
  await sleep(6500);
  rec.mark("pinch-out");
  // While zoomed, gesture coordinates are in visual-viewport CSS px.
  await cdp.send("Input.synthesizePinchGesture", {
    x: anchor.x / zoom,
    y: anchor.y / zoom,
    scaleFactor: 1 / zoom,
    relativeSpeed: 600,
  });
  await sleep(300);
  rec.mark("hanzi-end");

  rec.mark("ja-start");
  await retype(page, input, "食べる", 220);
  await sleep(2400);
  rec.mark("ja-end");

  rec.mark("ko-start");
  await retype(page, input, "사랑", 240);
  await sleep(2400);
  rec.mark("ko-end");

  rec.mark("ai-start");
  await retype(page, input, process.env.PROMO_AI_WORD || "mellifluous");
  await sleep(1400);
  const explain = page.getByRole("button", { name: /explain usage/i });
  rec.mark("ai-click", await box(explain));
  await explain.first().click();
  const t0 = Date.now();
  const aiSection = page.getByText("AI Notes", { exact: true }).first().locator("xpath=ancestor::div[2]");
  await aiSection.evaluate((el) => el.scrollIntoView({ block: "nearest", behavior: "smooth" })).catch(() => {});
  // Done once the streamed text stops changing for 1.5 s.
  let last = "";
  let stableSince = Date.now();
  while (Date.now() - t0 < 45000) {
    const text = (await aiSection.innerText().catch(() => "")) || "";
    if (text !== last) {
      last = text;
      stableSince = Date.now();
      await aiSection.evaluate((el) => el.scrollIntoView({ block: "nearest" })).catch(() => {});
    } else if (text.length > 300 && Date.now() - stableSince > 1500) break;
    await sleep(150);
  }
  console.log(`[ai] notes done in ${Date.now() - t0}ms (${last.length} chars)`);
  await sleep(800);
  rec.mark("ai-end", await box(aiSection));

  rec.mark("hw-open");
  await retype(page, input, "大", 120);
  await sleep(1400);
  await page.getByRole("button", { name: /handwriting/i }).first().click();
  await sleep(1200);
  const canvas = page.getByLabel("Handwriting canvas");
  const c = (await canvas.boundingBox())!;
  rec.mark("hw-start", c);
  const o = { x: c.x, y: c.y };
  const s = c.width / 100;
  await stroke(page, o, [[54 * s, 14 * s], [52 * s, 40 * s], [42 * s, 62 * s], [20 * s, 86 * s]], 8);
  await stroke(page, o, [[52 * s, 44 * s], [66 * s, 66 * s], [86 * s, 86 * s]], 8);
  await sleep(900);
  const pad = page.locator(".dictionary-handwriting-candidates");
  rec.mark("hw-drawn", await box(pad));
  const pick = pad.getByRole("button", { name: "人", exact: true });
  console.log("[hw] candidates", (await pad.innerText()).replace(/\s+/g, " "));
  if (await pick.count()) await pick.first().click();
  else await pad.getByRole("button").first().click();
  await sleep(700);
  await input.press("Enter").catch(() => {});
  await sleep(2600);
  rec.mark("hw-end");
  await rec.stop();
}

async function fitness(page: Page) {
  await seedFitness(page);
  await launchApp(page, "fitness");
  await sleep(1000);
  await placeWindow(page, { x: 390, y: 34, w: 660, h: 700 });
  await fitnessView(page, "exercises");
  await sleep(1500);
  const win = page.locator("[data-window-instance-id]").last();
  const rec = new X11Recorder(dir);
  await rec.start();
  await sleep(1200);

  rec.mark("ex-start", await box(win));
  const search = page.getByPlaceholder("Search exercises");
  await search.click();
  await search.pressSequentially("bench press", { delay: 110 });
  await sleep(900);
  await page.getByText("Barbell Bench Press - Medium Grip", { exact: true }).first().click().catch((e) => console.log("[ex]", e.message.slice(0, 80)));
  await sleep(2400);
  rec.mark("ex-end");

  rec.mark("lang-start");
  await setLanguage(page, "ja");
  await sleep(2600);
  rec.mark("lang-zh");
  await setLanguage(page, "zh-TW");
  await sleep(2400);
  rec.mark("lang-end");
  await setLanguage(page, "en");
  await fitnessView(page, "food");
  await sleep(1800);

  rec.mark("food-start", await box(win));
  const desc = page.getByPlaceholder(/Describe what you ate/);
  await desc.click();
  await desc.pressSequentially("tonkotsu ramen with chashu and a soft egg, 6 gyoza", { delay: 45 });
  await sleep(500);
  rec.mark("food-analyze", await box(page.getByRole("button", { name: "Estimate with AI" })));
  await page.getByRole("button", { name: "Estimate with AI" }).click();
  const t0 = Date.now();
  await page.getByRole("button", { name: "Save to Log" }).waitFor({ timeout: 60000 });
  console.log(`[food] estimate in ${Date.now() - t0}ms`);
  rec.mark("food-review");
  await sleep(1400);
  const meal = page.getByRole("combobox", { name: /^meal$/i });
  if (await meal.count()) {
    await meal.first().click();
    await sleep(500);
    await page.getByRole("option", { name: "Dinner" }).click().catch(() => {});
    await sleep(600);
  }
  const split = page.getByRole("combobox", { name: "split" });
  rec.mark("split-open", union([await box(split), await box(page.getByText(/^total$|^your share$/i))]));
  await split.click();
  await sleep(900);
  await page.getByRole("option", { name: "÷2" }).click();
  await sleep(300);
  rec.mark("split-done", union([await box(split), await box(page.getByText(/^your share$/i))]));
  await sleep(2200);
  await page.getByRole("button", { name: "Save to Log" }).click();
  await sleep(2200);
  rec.mark("food-end");

  await fitnessView(page, "body");
  await sleep(300);
  rec.mark("body-start", await box(page.getByText("Weight", { exact: true }).first().locator("xpath=ancestor::div[2]")));
  await sleep(3500);
  rec.mark("body-end");
  await rec.stop();
}

const { browser, page } = await launch();
await boot(page);
await signIn(page);
if (session === "dictionary") await dictionary(page);
else await fitness(page);
await page.screenshot({ path: `${dir}-last.png`, timeout: 5000 }).catch(() => {});
await browser.close();
