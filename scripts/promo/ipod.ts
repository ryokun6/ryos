/**
 * iPod promo captures. Real click-wheel input, real YouTube playback.
 *   bun scripts/promo/shoot.ts ipod
 *   bun scripts/promo/shoot.ts ipod-extra
 *   PROMO_DEVICE=phone bun scripts/promo/shoot.ts ipod
 */
import type { Page } from "playwright";
import { centerWindow, fillPhoneWindow, launchApp, sleep, store, union, X11Recorder, type Box } from "./lib";
import { seedIpod } from "./seed";

/** Library covers for Cover Flow. The hero is the track we play (Japanese, synced lyrics, furigana). */
export const IPOD_LIBRARY = [
  "ZRtdQ81jPUQ", // YOASOBI「アイドル」
  "SX_ViT4Ra7k", // 米津玄師 Lemon
  "TQ8WlA2GXbk", // Official髭男dism Pretender
  "ArmDp-zijuc", // NewJeans Super Shy
  "a2GujJZfXpg", // RADWIMPS スパークル
];
export const IPOD_HERO = "ZRtdQ81jPUQ";
/** Pasted on camera in the 60 s cut. */
export const IPOD_ADD_URL = "https://www.youtube.com/watch?v=DYptgVvkVLQ";

const boxOf = async (page: Page, sel: string): Promise<Box | null> => {
  const l = page.locator(sel).first();
  return (await l.count()) ? l.boundingBox() : null;
};

async function placeIpod(page: Page, phone: boolean) {
  if (phone) await fillPhoneWindow(page);
  else await centerWindow(page, 680, 720);
}

async function wheelGeom(page: Page) {
  const wheel = page.locator(".ipod-wheel-center").locator("xpath=..");
  const b = await wheel.boundingBox();
  if (!b) throw new Error("iPod click wheel not on screen");
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, r: b.width / 2 };
}

/** One click-wheel detent. Positive is clockwise (next row / next cover). */
async function spin(page: Page, steps: number) {
  const { cx, cy, r } = await wheelGeom(page);
  // Park on the ring, outside the center button. One wheel event fires one detent
  // (the handler trips at |deltaY| ≥ 50 and then resets), so 200 survives a DSF scale.
  await page.mouse.move(cx + r * 0.72, cy);
  const dir = Math.sign(steps) || 1;
  for (let i = 0; i < Math.abs(steps); i++) {
    await page.mouse.wheel(0, 200 * dir);
    await sleep(320);
  }
}

async function clickCenter(page: Page) {
  await page.locator(".ipod-wheel-center").click();
}

async function clickMenu(page: Page) {
  await page.locator(".ipod-device-surface").getByText("MENU", { exact: true }).click();
}

async function clickNext(page: Page) {
  const { cx, cy, r } = await wheelGeom(page);
  await page.mouse.click(cx + r * 0.72, cy);
}

async function menuTrigger(page: Page, name: string) {
  const item = page.getByRole("menuitem", { name, exact: true }).first();
  if (await item.count()) {
    await item.click();
    return;
  }
  await page.getByText(name, { exact: true }).first().click();
}

async function ensureRootMenu(page: Page) {
  for (let i = 0; i < 5; i++) {
    const music = page.locator(".ipod-device-surface").getByText("Music", { exact: true });
    if (await music.count()) return;
    await clickMenu(page);
    await sleep(450);
  }
  throw new Error("iPod root menu never showed Music");
}

async function prepare(page: Page, phone: boolean) {
  await launchApp(page, "ipod");
  await sleep(1200);
  await placeIpod(page, phone);
  const seeded = await seedIpod(page, IPOD_LIBRARY, IPOD_HERO);
  const tracks = (seeded as { tracks: { id: string; title: string; artist: string; cover: boolean; lyrics: boolean }[] }).tracks;
  console.log(`[ipod] ${tracks.length} tracks`);
  for (const t of tracks.slice(0, 16)) console.log(`  ${t.id} | ${t.title} | ${t.artist} | cover=${t.cover} lyrics=${t.lyrics}`);
  const hero = tracks.find((t) => t.id === IPOD_HERO);
  if (!hero) throw new Error(`hero ${IPOD_HERO} missing from the library`);
  console.log(`[ipod] hero lyrics=${hero.lyrics} cover=${hero.cover} "${hero.title}" / ${hero.artist}`);
  await sleep(800);
  await ensureRootMenu(page);
  await sleep(400);
  return tracks;
}

export async function runIpod(page: Page, dir: string, phone: boolean) {
  await prepare(page, phone);
  const win = page.locator("[data-window-instance-id]").last();
  const rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(600);
  rec.mark("win", await win.boundingBox());
  rec.mark("menu");
  await sleep(1100);

  await clickCenter(page); // Music
  await sleep(700);
  await spin(page, 3); // Songs
  await sleep(250);
  await clickCenter(page);
  await sleep(1400);
  rec.mark("songs", await boxOf(page, ".ipod-device-surface"));

  await clickMenu(page);
  await sleep(500);
  await spin(page, -3); // back to Cover Flow
  await sleep(250);
  await clickCenter(page);
  await sleep(900);
  rec.mark("cover", await boxOf(page, ".ipod-device-surface"));
  // Cover Flow opens on the hero. Browse away, then back, so the play press is that track.
  for (let i = 0; i < 4; i++) {
    await spin(page, 1);
    await sleep(520);
  }
  await sleep(300);
  for (let i = 0; i < 4; i++) {
    await spin(page, -1);
    await sleep(420);
  }
  await sleep(350);
  await clickCenter(page); // play the hero
  await sleep(1600);
  rec.mark("playing", union([await win.boundingBox(), await boxOf(page, ".ipod-device-surface")]));
  await sleep(1400);

  // Reveal the YouTube picture on the LCD (a click on Now Playing toggles the video).
  const screen = page.locator(".ipod-device-surface").locator("img, canvas, iframe").first();
  const screenBox = (await screen.count()) ? await screen.boundingBox() : await boxOf(page, ".ipod-device-surface");
  if (screenBox) await page.mouse.click(screenBox.x + screenBox.width / 2, screenBox.y + Math.min(40, screenBox.height / 3));
  await sleep(1800);
  rec.mark("video", await win.boundingBox());
  await sleep(1200);

  await menuTrigger(page, "View");
  await sleep(250);
  await menuTrigger(page, "Show Lyrics");
  await sleep(500);
  rec.mark("lyrics", union([await win.boundingBox(), await boxOf(page, "[data-lyric-line]")]));
  await sleep(6500);
  await rec.stop();
}

export async function runIpodExtra(page: Page, dir: string, phone: boolean) {
  await prepare(page, phone);
  const win = page.locator("[data-window-instance-id]").last();
  const rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(700);

  await menuTrigger(page, "File");
  await sleep(200);
  await page.getByRole("menuitem", { name: /Add Song/ }).first().click();
  await sleep(400);
  rec.mark("add", await boxOf(page, "[role=dialog]"));
  const input = page.getByPlaceholder(/Search or paste URL/);
  await input.click();
  await input.pressSequentially(IPOD_ADD_URL, { delay: 28 });
  await sleep(350);
  rec.mark("typed");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await input.waitFor({ state: "hidden", timeout: 45000 }).catch(() => {});
  await sleep(1800);
  rec.mark("added", await win.boundingBox());
  await sleep(1200);

  await menuTrigger(page, "Controls");
  await sleep(200);
  const shuffle = page.getByRole("menuitemcheckbox", { name: "Shuffle" });
  if (await shuffle.count()) await shuffle.click();
  else await page.getByRole("menuitem", { name: "Shuffle", exact: true }).click();
  await sleep(600);
  rec.mark("shuffle", await boxOf(page, ".ipod-device-surface"));
  await clickNext(page);
  await sleep(1400);
  rec.mark("skipped", await win.boundingBox());
  await sleep(900);

  // Back to the hero so fullscreen lyrics are the Japanese track with furigana.
  await store(
    page,
    `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
     const s = useIpodStore.getState();
     s.setCurrentSongId(arg);
     s.setIsPlaying(true);
     s.setShowVideo(true);
     if (!s.showLyrics) s.toggleLyrics();
     s.setLyricsFont("gold-glow");`,
    IPOD_HERO
  );
  await sleep(900);

  await menuTrigger(page, "View");
  await sleep(200);
  await page.getByRole("menuitem", { name: "Full Screen", exact: true }).click();
  await sleep(1200);
  const lines = page.locator("[data-lyric-line]");
  await lines.first().waitFor({ timeout: 20000 }).catch(() => console.warn("[ipod] lyrics lines did not appear"));
  const ruby = page.locator(".lyrics-furigana, ruby");
  const furigana = (await ruby.count()) > 0;
  console.log(`[ipod] fullscreen furigana=${furigana} lines=${await lines.count()}`);
  const vp = page.viewportSize()!;
  rec.mark("fullscreen", await win.boundingBox());
  rec.mark("fs", { x: vp.width * 0.12, y: vp.height * 0.16, width: vp.width * 0.76, height: vp.height * 0.62 });
  await sleep(4000);
  rec.mark("furigana", union([await boxOf(page, "[data-lyric-line]"), await (furigana ? ruby.first().boundingBox() : null)]));
  // Full-screen scenes play this hold at 1x (about 16 s of lyrics after the fullscreen mark).
  await sleep(14000);
  await rec.stop();
}
