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
/** 群青 — Kugou matches this official MV (晴天's official upload does not). */
export const IPOD_ADD_URL = "https://www.youtube.com/watch?v=Y4nEEZwckuU";

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

/**
 * One click-wheel detent. Positive is clockwise (next row / next cover).
 * A trackpad wheel event does not reach the ring under device-pixel emulation, so this
 * drags the ring the way a finger would. One step is 15°; 22° clears the reversal gate once.
 */
async function spin(page: Page, steps: number) {
  const { cx, cy, r } = await wheelGeom(page);
  const radius = r * 0.68;
  const dir = Math.sign(steps) || 1;
  const sweep = dir * ((22 * Math.PI) / 180);
  for (let i = 0; i < Math.abs(steps); i++) {
    const start = -0.35;
    await page.mouse.move(cx + Math.cos(start) * radius, cy + Math.sin(start) * radius);
    await page.mouse.down();
    for (let s = 1; s <= 6; s++) {
      const a = start + (sweep * s) / 6;
      await page.mouse.move(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      await sleep(18);
    }
    await page.mouse.up();
    await sleep(200);
  }
}

async function clickCenter(page: Page, rec?: X11Recorder) {
  if (rec) await rec.pauseCaptures();
  await page.locator(".ipod-wheel-center").click({ delay: 40 });
  rec?.resumeCaptures();
}

async function clickMenu(page: Page, rec?: X11Recorder) {
  if (rec) await rec.pauseCaptures();
  await page.locator(".ipod-device-surface").getByText("MENU", { exact: true }).click({ delay: 40 });
  rec?.resumeCaptures();
}

async function clickNext(page: Page) {
  const { cx, cy, r } = await wheelGeom(page);
  await page.mouse.click(cx + r * 0.72, cy);
}

/** The LCD is the top of the scaled body. A click there toggles the YouTube picture while a track is playing. */
async function clickLcd(page: Page, rec?: X11Recorder) {
  const b = await page.locator(".ipod-device-surface > div").first().boundingBox();
  if (!b) throw new Error("iPod body not on screen");
  if (rec) await rec.pauseCaptures();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.22);
  rec?.resumeCaptures();
}

/** The YouTube iframe takes focus. Click the title bar so the iPod menus are the ones on screen. */
async function focusIpod(page: Page) {
  const b = await page.locator("[data-window-instance-id]").last().boundingBox();
  if (!b) return;
  await page.mouse.click(b.x + Math.min(160, b.width * 0.35), b.y + 12);
  await sleep(150);
}

async function openAppMenu(page: Page, name: string, rec?: X11Recorder) {
  if (rec) await rec.pauseCaptures();
  await focusIpod(page);
  await page.getByRole("menuitem", { name, exact: true }).first().click({ delay: 30 });
  rec?.resumeCaptures();
  await sleep(220);
}

/** View ▸ Lyrics ▸ Show Lyrics. The checkbox lives in the Lyrics submenu. */
async function showLyrics(page: Page, rec?: X11Recorder) {
  await openAppMenu(page, "View", rec);
  const lyrics = page.getByRole("menuitem", { name: "Lyrics", exact: true });
  await lyrics.hover();
  await sleep(180);
  if (rec) await rec.pauseCaptures();
  await page.getByRole("menuitemcheckbox", { name: "Show Lyrics" }).click({ delay: 30, timeout: 5000 });
  rec?.resumeCaptures();
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
  const text = await page.locator(".ipod-device-surface").innerText().catch(() => "");
  throw new Error(`iPod root menu never showed Music. Screen: ${text.slice(0, 240).replace(/\s+/g, " ")}`);
}

async function prepare(page: Page, phone: boolean) {
  // Open on the root menu. A restored breadcrumb keeps the account's last
  // (often translated) menu, which hides the English "Music" row.
  await store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    const s = useIpodStore.getState();
    // An empty breadcrumb leaves a signed-in library on Now Playing.
    // One root entry plus menu mode opens the English Music list.
    s.setIpodMenuBreadcrumb([{ kind: "root", id: "ipod", title: "iPod", selectedIndex: 0 }]);
    s.setIpodMenuMode(true);
  `);
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

  await clickCenter(page, rec); // Music
  await sleep(700);
  await spin(page, 3); // Songs
  await sleep(250);
  await clickCenter(page, rec);
  await sleep(1400);
  rec.mark("songs", await boxOf(page, ".ipod-device-surface"));

  await clickMenu(page, rec);
  await sleep(400);
  await spin(page, -3); // back to Cover Flow
  await sleep(180);
  await clickCenter(page, rec);
  await sleep(700);
  rec.mark("cover", await boxOf(page, ".ipod-device-surface"));
  for (let i = 0; i < 4; i++) await spin(page, 1);
  await sleep(200);
  for (let i = 0; i < 4; i++) await spin(page, -1);
  // Land on the hero even if a detent was dropped, then play that cover.
  await store(
    page,
    `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
     useIpodStore.getState().setCurrentSongId(arg);`,
    IPOD_HERO
  );
  await sleep(500);
  await clickCenter(page, rec);
  let now: { id?: string; title?: string; playing?: boolean } = {};
  for (let i = 0; i < 16; i++) {
    await sleep(250);
    now = await store(
      page,
      `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
       const s = useIpodStore.getState();
       const t = s.tracks.find((x) => x.id === s.currentSongId);
       return { id: s.currentSongId, title: t && t.title, playing: s.isPlaying, requested: s.playbackRequested };`
    );
    if (now.playing && now.id === IPOD_HERO) break;
  }
  if (!now.playing || now.id !== IPOD_HERO) {
    console.warn("[ipod] center press did not start the hero, requesting playback");
    await store(
      page,
      `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
       const s = useIpodStore.getState();
       s.setCurrentSongId(arg);
       s.setIsPlaying(true);`,
      IPOD_HERO
    );
    await sleep(400);
  }
  console.log("[ipod] now", JSON.stringify(now));
  rec.mark("playing", union([await win.boundingBox(), await boxOf(page, ".ipod-device-surface")]));
  await sleep(900);

  // Reveal the YouTube picture on the LCD (a click on Now Playing toggles the video).
  await clickLcd(page, rec);
  const frame = page.locator(".ipod-device-surface iframe").first();
  await frame.waitFor({ state: "visible", timeout: 15000 }).catch(() => console.warn("[ipod] YouTube iframe did not become visible"));
  const playback = await store(
    page,
    `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
     const s = useIpodStore.getState();
     return { playing: s.isPlaying, video: s.showVideo, id: s.currentSongId, lyrics: s.showLyrics };`
  );
  console.log("[ipod] playback", JSON.stringify(playback));
  await sleep(1600);
  rec.mark("video", await win.boundingBox());
  await sleep(500);

  try {
    await showLyrics(page, rec);
  } catch (e) {
    console.warn("[ipod] lyrics menu failed, toggling from the app", e instanceof Error ? e.message : e);
    await store(
      page,
      `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
       const s = useIpodStore.getState();
       if (!s.showLyrics) s.toggleLyrics();`
    );
  }
  await sleep(600);
  rec.mark("lyrics", union([await win.boundingBox(), await boxOf(page, "[data-lyric-line]")]));
  await sleep(6200);
  await rec.stop();
}

export async function runIpodExtra(page: Page, dir: string, phone: boolean) {
  await prepare(page, phone);
  const win = page.locator("[data-window-instance-id]").last();
  const rec = new X11Recorder(dir, page);
  await rec.start();
  await sleep(700);

  await openAppMenu(page, "File", rec);
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

  await openAppMenu(page, "Controls", rec);
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

  await openAppMenu(page, "View", rec);
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
