import type { Page } from "playwright";
import { store } from "./lib";

/** Seed ~8 weeks of plausible history through the real Fitness store actions. */
export async function seedFitness(page: Page) {
  await store(
    page,
    `
    const { useFitnessStore } = await import("/src/stores/useFitnessStore.ts");
    const s = useFitnessStore.getState();
    s.clearAllData();
    const key = (d) => d.toISOString().slice(0, 10);
    const day = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
    let rnd = 7; const r = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);

    s.setProfile({ sex: "male", birthYear: 1990, heightCm: 178, activityLevel: "moderate" });
    s.setGoals({ targetWeightKg: 73, startWeightKg: 78.4, weeklyWorkoutTarget: 4 });

    for (let n = 56; n >= 0; n -= 2) {
      const w = 78.4 - (56 - n) * 0.066 + (r() - 0.5) * 0.5;
      s.addBodyStat({ date: key(day(n)), weightKg: Math.round(w * 10) / 10, bodyFatPct: Math.round((19 - (56 - n) * 0.04) * 10) / 10,
        waistCm: null, chestCm: null, hipsCm: null, armCm: null, thighCm: null });
    }

    const meals = [
      ["breakfast", "Greek yogurt, berries & granola", [["Greek yogurt", "200 g", 190, 20, 8, 9], ["Mixed berries", "1 cup", 70, 1, 17, 0], ["Granola", "40 g", 180, 4, 26, 7]]],
      ["lunch", "Chicken grain bowl", [["Grilled chicken", "150 g", 250, 46, 0, 6], ["Brown rice", "1 cup", 215, 5, 45, 2], ["Avocado", "1/2", 120, 1, 6, 11]]],
      ["dinner", "Salmon, potatoes & greens", [["Salmon fillet", "180 g", 370, 38, 0, 23], ["Roast potatoes", "200 g", 220, 4, 38, 6], ["Green salad", "1 bowl", 60, 2, 8, 3]]],
      ["snack", "Protein shake", [["Whey protein", "1 scoop", 120, 24, 3, 2], ["Banana", "1 medium", 105, 1, 27, 0]]],
    ];
    for (let n = 13; n >= 0; n--) {
      for (const [meal, name, items] of meals) {
        if (n === 0 && meal !== "breakfast" && meal !== "lunch") continue;
        if (meal === "snack" && r() < 0.4) continue;
        const k = 0.85 + r() * 0.35;
        s.addFoodEntry({ date: key(day(n)), meal, name, source: "manual", thumbnail: null,
          items: items.map(([nm, portion, c, p, cb, f]) => ({ name: nm, portion,
            calories: Math.round(c * k), proteinG: Math.round(p * k), carbsG: Math.round(cb * k), fatG: Math.round(f * k) })) });
      }
    }

    const lifts = [
      ["Barbell_Bench_Press_-_Medium_Grip", "Barbell Bench Press - Medium Grip", 70],
      ["Bent_Over_Barbell_Row", "Bent Over Barbell Row", 60],
      ["Barbell_Squat", "Barbell Squat", 90],
    ];
    for (let n = 49, i = 0; n >= 1; n -= 3.5, i++) {
      const date = key(day(Math.round(n)));
      const id = s.ensureWorkout(date, i % 2 ? "lower" : "upper");
      for (const [ex, nm, base] of lifts) {
        const entry = useFitnessStore.getState().addWorkoutEntry(id, ex, nm);
        if (!entry) continue;
        const kg = base + i * 1.25;
        for (let k = 0; k < 3; k++) useFitnessStore.getState().addSet(id, entry, { reps: 8 - k, weightKg: kg });
      }
    }
    s.setView("schedule");
    `
  );
  await page.waitForTimeout(500);
}

/**
 * Real desktop shortcuts, the same way "Add to Desktop" does it (useDesktop / Finder): a default shortcut that the
 * theme hides is unhidden in place, otherwise `createAlias` makes one. Icons resolve per theme via getAppIconPath.
 */
export async function seedDesktopShortcuts(page: Page, apps: [appId: string, name: string][] = [["dictionary", "Dictionary"], ["fitness", "Fitness"]]) {
  await store(
    page,
    `const { useFilesStore } = await import("/src/stores/useFilesStore.ts");
     // Default shortcuts are created asynchronously after boot; seeding before that would be overwritten.
     for (let t = 0; t < 100 && !useFilesStore.getState().items["/Desktop/Dictionary"]; t++) await new Promise((r) => setTimeout(r, 200));
     for (const [appId, name] of arg) {
       const fs = useFilesStore.getState();
       const existing = Object.values(fs.items).find(
         (i) => i.status === "active" && i.path.startsWith("/Desktop/") && i.aliasType === "app" && i.aliasTarget === appId);
       if (!existing) fs.createAlias("", name, "app", appId);
       else if (existing.hiddenOnThemes?.length) fs.updateItemMetadata(existing.path, { hiddenOnThemes: [] });
     }`,
    apps
  );
  await page.waitForTimeout(800);
}

export async function setLanguage(page: Page, lang: string) {
  await store(page, `const m = await import("/src/stores/useLanguageStore.ts"); await m.useLanguageStore.getState().setLanguage(arg);`, lang);
  await page.waitForTimeout(800);
}

/**
 * Make sure these YouTube tracks are in the library (real metadata + lyrics via addTrackFromVideoId)
 * and leave the hero paused on the root-menu path: modern skin, backlight held on, lyrics hidden.
 */
export async function seedIpod(page: Page, ids: string[], hero: string) {
  return store(
    page,
    `const { useIpodStore } = await import("/src/stores/useIpodStore.ts");
     const wait = (ms) => new Promise((r) => setTimeout(r, ms));
     for (let i = 0; i < 40 && useIpodStore.getState().libraryState === "uninitialized"; i++) await wait(250);
     const s = useIpodStore.getState();
     s.setUiVariant("modern");
     s.setTheme("classic");
     s.setLibrarySource("youtube");
     s.setBacklightTimeout("always-on");
     if (!s.backlightOn) s.toggleBacklight();
     if (s.showLyrics) s.toggleLyrics();
     s.setShowVideo(false);
     if (s.isShuffled) s.toggleShuffle();
     for (const id of arg.ids) {
       if (!useIpodStore.getState().tracks.some((t) => t.id === id)) {
         await useIpodStore.getState().addTrackFromVideoId(id, false, { keepPlayback: true });
       }
     }
     const st = useIpodStore.getState();
     if (st.tracks.some((t) => t.id === arg.hero)) st.setCurrentSongId(arg.hero);
     st.setIsPlaying(false);
     st.setShowVideo(false);
     return {
       state: st.libraryState,
       tracks: st.tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist || "", album: t.album || "", cover: Boolean(t.cover), lyrics: Boolean(t.lyricsSource) })),
     };`,
    { ids, hero }
  );
}

export async function fitnessView(page: Page, view: string) {
  await store(page, `const m = await import("/src/stores/useFitnessStore.ts"); m.useFitnessStore.getState().setView(arg);`, view);
}
