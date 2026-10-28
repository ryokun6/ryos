/**
 * iPod promo capture. Real click-wheel input, real YouTube playback.
 *   bun scripts/promo/shoot.ts ipod
 *   PROMO_DEVICE=phone bun scripts/promo/shoot.ts ipod
 *
 * One take feeds both cuts. 30 s uses browse, Cover Flow, Now Playing, and the
 * lyrics hold. 60 s uses every mark, in order: those four, then volume, seek,
 * video, and the same lyrics hold (translation plus pronunciation).
 */
import type { Page } from "playwright";
import { centerWindow, fillPhoneWindow, launchApp, sleep, store, union, X11Recorder, type Box } from "./lib";
import { seedIpod } from "./seed";

/** Cover Flow covers. The hero is NewJeans「Supernatural」; Part.2 is the fallback if Part.1 has no readable script. */
export const IPOD_LIBRARY = [
  "ZncbtRo7RXs", // NewJeans Supernatural Official MV (Part.1)
  "A4S8zl50AdM", // NewJeans Supernatural Official MV (Part.2)
  "Q3K0TOvTOno", // NewJeans How Sweet
  "ArmDp-zijuc", // NewJeans Super Shy
];
export const IPOD_HERO = "ZncbtRo7RXs";
const IPOD_HERO_ALT = "A4S8zl50AdM";

type LyricPlan = {
  hero: string;
  title: string;
  artist: string;
  /** Translation language that is not the lyric script, so a second line is visible. */
  translation: "en" | "ja";
  /** Player seconds where a line with a pronunciation guide is the current line. */
  seekSeconds: number;
  sample: string;
};

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

async function openRoot(page: Page) {
  await store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    const s = useIpodStore.getState();
    // An empty breadcrumb leaves a signed-in library on Now Playing.
    // One root entry plus menu mode opens the English Music list.
    s.setIpodMenuBreadcrumb([{ kind: "root", id: "ipod", title: "iPod", selectedIndex: 0 }]);
    s.setIpodMenuMode(true);
    s.setShowVideo(false);
    s.setIsPlaying(false);
    if (s.isFullScreen) s.toggleFullScreen();
    if (s.showLyrics) s.toggleLyrics();
  `);
}

/** Play a candidate off camera until lyrics arrive, and score lines for a pronunciation guide. */
async function inspectLyrics(page: Page, id: string): Promise<LyricPlan | null> {
  const started = await store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    const { useAudioSettingsStore } = await import("/src/stores/useAudioSettingsStore.ts");
    const s = useIpodStore.getState();
    if (!s.tracks.some((t) => t.id === arg)) return { ok: false, reason: "missing" };
    useIpodStore.setState({ currentLyrics: null });
    s.setCurrentSongId(arg);
    s.setShowVideo(false);
    s.setIsPlaying(true);
    useAudioSettingsStore.getState().setIpodVolume(0.28);
    const t = s.tracks.find((x) => x.id === arg);
    return { ok: true, title: t && t.title, artist: t && t.artist };
  `, id) as { ok: boolean; reason?: string; title?: string; artist?: string };
  if (!started.ok) return null;
  let plan: LyricPlan | null = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    plan = await store(page, `
      const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
      const s = useIpodStore.getState();
      const lines = (s.currentLyrics && s.currentLyrics.lines) || [];
      if (s.currentSongId !== arg || lines.length < 4) return null;
      const score = (words) => {
        const hangul = (words.match(/[\\uac00-\\ud7af]/g) || []).length;
        const kana = (words.match(/[\\u3040-\\u30ff]/g) || []).length;
        const hanzi = (words.match(/[\\u4e00-\\u9fff]/g) || []).length;
        const latin = (words.match(/[A-Za-z]/g) || []).length;
        return { hangul, kana, hanzi, latin, cjk: hangul + kana + hanzi };
      };
      let best = null;
      for (const line of lines) {
        const words = String(line.words || "").trim();
        if (words.length < 2) continue;
        const start = Number(line.startTimeMs);
        if (!Number.isFinite(start) || start < 6000) continue;
        const sc = score(words);
        if (sc.cjk < 2) continue;
        if (!best || sc.cjk > best.cjk) best = { ...sc, words, start };
      }
      const track = s.tracks.find((t) => t.id === arg);
      const offset = (track && track.lyricOffset) || 0;
      const all = lines.map((line) => score(String(line.words || ""))).reduce((a, s) => ({
        cjk: a.cjk + s.cjk, latin: a.latin + s.latin,
      }), { cjk: 0, latin: 0 });
      if (!best) return { hero: arg, title: track && track.title, artist: track && track.artist, lines: lines.length, all, sample: "" };
      const translation = best.cjk > best.latin ? "en" : "ja";
      return {
        hero: arg,
        title: (track && track.title) || "",
        artist: (track && track.artist) || "",
        translation,
        seekSeconds: Math.max(0, (best.start - offset) / 1000 + 0.6),
        sample: best.words.slice(0, 80),
        lines: lines.length,
      };
    `, id) as (LyricPlan & { lines?: number; all?: { cjk: number; latin: number } }) | null;
    if (plan && plan.sample) break;
  }
  console.log(`[ipod] lyrics ${id} "${started.title}"`, JSON.stringify(plan));
  if (!plan?.sample || !plan.translation) return null;
  return plan;
}

async function armLyrics(page: Page, plan: LyricPlan) {
  await store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    const s = useIpodStore.getState();
    s.setRomanization({
      enabled: true,
      japaneseFurigana: true,
      japaneseRomaji: false,
      korean: true,
      chinese: true,
      chineseZhuyin: false,
      pronunciationOnly: false,
    });
    s.setLyricsTranslationLanguage(arg.translation);
    s.setLyricsFont("gold-glow");
    if (s.showLyrics) s.toggleLyrics();
    const lock = () => {
      const cur = useIpodStore.getState();
      const r = cur.romanization;
      if (!r.enabled || !r.korean || !r.japaneseFurigana || !r.chinese || r.pronunciationOnly) {
        cur.setRomanization({
          enabled: true,
          japaneseFurigana: true,
          korean: true,
          chinese: true,
          pronunciationOnly: false,
        });
      }
      if (cur.lyricsTranslationLanguage !== arg.translation) cur.setLyricsTranslationLanguage(arg.translation);
      if (cur.lyricsFont !== "gold-glow") cur.setLyricsFont("gold-glow");
    };
    lock();
    useIpodStore.subscribe(lock);
  `, plan);
}

async function prepare(page: Page, phone: boolean): Promise<LyricPlan> {
  await openRoot(page);
  await launchApp(page, "ipod");
  await sleep(1200);
  await placeIpod(page, phone);
  const seeded = await seedIpod(page, IPOD_LIBRARY, IPOD_HERO);
  const tracks = (seeded as { tracks: { id: string; title: string; artist: string; cover: boolean; lyrics: boolean }[] }).tracks;
  console.log(`[ipod] ${tracks.length} tracks`);
  for (const t of tracks.slice(0, 16)) console.log(`  ${t.id} | ${t.title} | ${t.artist} | cover=${t.cover} lyrics=${t.lyrics}`);
  let plan = await inspectLyrics(page, IPOD_HERO);
  if (!plan) {
    console.warn(`[ipod] ${IPOD_HERO} has no pronunciation line, trying Part.2`);
    plan = await inspectLyrics(page, IPOD_HERO_ALT);
  }
  if (!plan) throw new Error("Supernatural lyrics never showed a line with a pronunciation guide");
  await armLyrics(page, plan);
  // Let the translation request start while the song is loaded, then return to the menu for the take.
  await sleep(1500);
  await openRoot(page);
  await sleep(400);
  await ensureRootMenu(page);
  await sleep(400);
  console.log(`[ipod] hero ${plan.hero} translation=${plan.translation} seek=${plan.seekSeconds.toFixed(1)}s "${plan.sample}"`);
  return plan;
}

async function screen(page: Page) {
  return store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    const s = useIpodStore.getState();
    const t = s.tracks.find((x) => x.id === s.currentSongId);
    const slide = [...document.querySelectorAll(".ipod-device-surface div")].find((n) => (n.getAttribute("style") || "").includes("translateX"));
    const style = (slide && slide.getAttribute("style")) || "";
    return {
      id: s.currentSongId,
      title: t && t.title,
      playing: s.isPlaying,
      video: s.showVideo,
      lyrics: s.showLyrics,
      fullscreen: s.isFullScreen,
      volumeOverlay: /translateX\\(-50%\\)|translateX\\(50%\\)/.test(style),
      scrub: Boolean(document.querySelector("[data-scrub-diamond]")),
      text: (document.querySelector(".ipod-device-surface")?.innerText || "").replace(/\\s+/g, " ").slice(0, 180),
    };
  `) as {
    id: string | null;
    title?: string;
    playing: boolean;
    video: boolean;
    lyrics: boolean;
    fullscreen: boolean;
    volumeOverlay: boolean;
    scrub: boolean;
    text: string;
  };
}

async function seekPlayer(page: Page, seconds: number) {
  await page.evaluate((target) => {
    for (const frame of document.querySelectorAll("iframe")) {
      frame.contentWindow?.postMessage(JSON.stringify({
        event: "command",
        func: "seekTo",
        args: [target, true],
      }), "*");
    }
  }, seconds);
  await store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    useIpodStore.getState().setElapsedTime(arg);
    if (!useIpodStore.getState().isPlaying) useIpodStore.getState().setIsPlaying(true);
  `, seconds);
}

async function lyricProof(page: Page) {
  return page.evaluate(() => {
    const text = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const translations = [...document.querySelectorAll(".lyrics-translation-fullscreen, .lyrics-translation-ipod")]
      .map(text).filter((s) => s.length > 1);
    const readings = [...document.querySelectorAll(".lyrics-furigana-rt")].map(text).filter((s) => s.length > 0);
    return { translations: translations.slice(0, 4), readings: readings.slice(0, 8) };
  });
}

export async function runIpod(page: Page, dir: string, phone: boolean) {
  const plan = await prepare(page, phone);
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
  await sleep(250);
  rec.mark("cover-end");
  // Land on the hero even if a detent was dropped, then play that cover.
  // Selecting a cover turns the video on; Now Playing, volume, and seek stay on the artwork.
  await store(
    page,
    `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
     const s = useIpodStore.getState();
     s.setCurrentSongId(arg);
     s.setShowVideo(false);
     if (s.showLyrics) s.toggleLyrics();`,
    plan.hero
  );
  await sleep(500);
  await clickCenter(page, rec);
  await store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    const s = useIpodStore.getState();
    s.setShowVideo(false);
    if (s.showLyrics) s.toggleLyrics();
  `);
  let now = await screen(page);
  for (let i = 0; i < 16 && (!now.playing || now.id !== plan.hero || now.video); i++) {
    await sleep(250);
    if (now.video) {
      await store(page, `
        const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
        useIpodStore.getState().setShowVideo(false);
      `);
    }
    now = await screen(page);
  }
  if (!now.playing || now.id !== plan.hero) {
    console.warn("[ipod] center press did not start the hero, requesting playback");
    await store(
      page,
      `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
       const s = useIpodStore.getState();
       s.setCurrentSongId(arg);
       s.setShowVideo(false);
       s.setIsPlaying(true);`,
      plan.hero
    );
    await sleep(400);
    now = await screen(page);
  }
  console.log("[ipod] now", JSON.stringify(now));
  if (now.video || now.lyrics || !now.playing) throw new Error(`Now Playing is not the cover (${JSON.stringify(now)})`);
  rec.mark("playing", union([await win.boundingBox(), await boxOf(page, ".ipod-device-surface")]));
  await sleep(5600);
  rec.mark("play-end");

  // Now Playing wheel turns the volume. Start low (set off camera) and spin clockwise so the bar grows.
  let vol = await screen(page);
  for (let i = 0; i < 10 && !vol.volumeOverlay; i++) {
    await spin(page, 1);
    vol = await screen(page);
  }
  console.log("[ipod] volume", JSON.stringify(vol));
  if (!vol.volumeOverlay) throw new Error(`volume overlay did not show (${vol.text})`);
  rec.mark("volume", await boxOf(page, ".ipod-device-surface"));
  await spin(page, 4);
  await sleep(1800);
  rec.mark("volume-end");

  await clickCenter(page, rec); // normal → seek
  let seek = await screen(page);
  for (let i = 0; i < 8 && !seek.scrub; i++) {
    await sleep(150);
    seek = await screen(page);
  }
  console.log("[ipod] seek", JSON.stringify(seek));
  if (!seek.scrub) throw new Error(`seek diamond did not show (${seek.text})`);
  rec.mark("seek", await boxOf(page, ".ipod-device-surface"));
  await spin(page, 5);
  await sleep(1200);
  rec.mark("seek-end");

  await clickCenter(page, rec); // seek → video
  await sleep(500);
  let video = await screen(page);
  if (!video.video) {
    await clickCenter(page, rec);
    await sleep(400);
    video = await screen(page);
  }
  if (!video.video || !video.playing) {
    console.warn("[ipod] center press did not open video");
    await store(page, `
      const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
      const s = useIpodStore.getState();
      s.setShowVideo(true);
      if (!s.isPlaying) s.setIsPlaying(true);
    `);
    video = await screen(page);
  }
  const frame = page.locator(".ipod-device-surface iframe").first();
  await frame.waitFor({ state: "attached", timeout: 15000 }).catch(() => console.warn("[ipod] YouTube iframe did not attach"));
  console.log("[ipod] video", JSON.stringify(video));
  if (!video.video || !video.playing || video.id !== plan.hero) {
    throw new Error(`video mode is not showing (${JSON.stringify(video)})`);
  }
  rec.mark("video", await win.boundingBox());
  await sleep(6200);
  rec.mark("video-end");

  // Gap the edit does not use: land on the line that has a pronunciation guide, then open full-screen lyrics.
  await seekPlayer(page, plan.seekSeconds);
  await sleep(700);
  await store(page, `
    const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
    const s = useIpodStore.getState();
    s.setShowVideo(true);
    s.setIsPlaying(true);
    if (!s.showLyrics) s.toggleLyrics();
    s.setLyricsFont("gold-glow");
    s.setLyricsTranslationLanguage(arg);
  `, plan.translation);
  await sleep(400);
  try {
    await openAppMenu(page, "View", rec);
    await page.getByRole("menuitem", { name: "Full Screen", exact: true }).click();
  } catch (e) {
    console.warn("[ipod] full screen menu failed", e instanceof Error ? e.message : e);
    await store(page, `
      const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
      const s = useIpodStore.getState();
      if (!s.isFullScreen) s.toggleFullScreen();
    `);
  }
  let proof = await lyricProof(page);
  for (let i = 0; i < 30 && (proof.translations.length === 0 || proof.readings.length === 0); i++) {
    await sleep(500);
    proof = await lyricProof(page);
  }
  console.log("[ipod] lyrics proof", JSON.stringify(proof));
  if (proof.translations.length === 0 || proof.readings.length === 0) {
    throw new Error(`lyrics are missing translation or pronunciation (${JSON.stringify(proof)})`);
  }
  const vp = page.viewportSize()!;
  rec.mark("lyrics", union([await win.boundingBox(), await boxOf(page, "[data-lyric-line]")]));
  rec.mark("fullscreen", await win.boundingBox());
  rec.mark("fs", { x: vp.width * 0.08, y: vp.height * 0.12, width: vp.width * 0.84, height: vp.height * 0.7 });
  // 60 s plays 32 beats (~15 s) of this hold at 1x. Leave slack past the last frame.
  await sleep(18500);
  await rec.stop();
}
