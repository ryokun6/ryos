---
name: promo-video
description: Capture real ryOS footage with Playwright and compose Apple Support–style promo videos (30 s / 60 s, desktop 16:9 and vertical 9:16) with scripts/promo. Covers the capture sessions, the compositor, the style spec, the bgm2 beat grid and the self-review checks. Use when making or editing an ryOS promo / feature video, re-shooting footage, or changing promo style.
---

# ryOS Promo Videos

Everything lives in `scripts/promo/`. Footage is always **real ryOS** (Playwright-driven Chrome recorded with ffmpeg). Nothing is mocked up; the compositor only frames, times and captions it.

| File | Role |
|------|------|
| `shoot.ts` | Capture sessions → `capture.mkv` + `marks.json` (named moments, tap boxes) |
| `lib.ts` / `seed.ts` | Boot, sign-in, window placement, Xvfb recorder; seed stores (desktop shortcuts, Fitness data) |
| `build.py` | Compositor: bezels, camera, captions, panels, end card, music, loudness |
| `style.py` + `styles/*.json` | Every size, duration, curve, zoom and beat; JSON overrides with `"extends"` |
| `bezels.py` | Downloads + caches the official Apple bezels (never committed) |
| `music.py` | Finds beat-aligned sections of a track (only needed for a new track) |
| `check_welcome.py` / `welcome-ref.ts` | Guard: the Dictionary welcome chips (學習) must never appear |
| `peek.py` | Dumps one frame per mark of a take, for checking captures |

**Never commit** renders, captures, bezels or music. Everything goes to `$PROMO_WORK_DIR` (default `tmp/promo/`, gitignored): `rec/`, `out/`, `bezels/`.

## Requirements

- Bun, system Chrome (`CHROME_PATH`), `Xvfb`, `ffmpeg`, `7z` (`p7zip-full`, for bezels).
- Python 3 with `numpy Pillow opencv-python-headless` (`librosa` for `music.py`).
- The full stack running: `bun run dev` (Vite :5173 + API :3000). Takes sign in, and AI features need the API.

## Workflow

```bash
# 1. Capture (each session boots ryOS, signs in, seeds the Dictionary + Fitness desktop shortcuts)
for dev in desktop phone; do
  for s in desktop dictionary fitness dict-extra fitness-extra exercises; do
    PROMO_DEVICE=$dev bun scripts/promo/shoot.ts $s
  done
done
PROMO_DEVICE=desktop bun scripts/promo/welcome-ref.ts; PROMO_DEVICE=phone bun scripts/promo/welcome-ref.ts

# 2. Compose (bgm2 is the default track/grid/style)
python3 scripts/promo/build.py --music /path/to/bgm2.mp3 --length 30            # 16:9
python3 scripts/promo/build.py --music /path/to/bgm2.mp3 --length 30 --vertical # 9:16
python3 scripts/promo/build.py --music /path/to/bgm2.mp3 --length 60 [--vertical]
# → tmp/promo/out/ryos-dictionary-fitness-{30s,60s}[-vertical].mp4
```

- Always pass `PROMO_DEVICE` explicitly. A stale export silently records the wrong device.
- `dict-extra`, `fitness-extra` and `exercises` only feed the 60 s cut. `exercises` is shot with ryOS in Japanese.
- Desktop = 1280×832 CSS at 2× (MacBook Air 13" screen). Phone = 402×874 at 3× (iPhone 18 Pro), with emulated safe areas (62 top / 34 bottom) and `data-ios-shell`, so the menubar sits under the status bar and the dock sits above the home indicator.
- Desktop shortcuts are real: `seedDesktopShortcuts` unhides or creates `/Desktop` aliases through `useFilesStore`, exactly like "Add to Desktop". Don't composite icons.
- `store()` resolves `import("/src/…")` to the URL the app loaded (Vite HMR `?t=`). A bare import would hit a second, disconnected store.
- The Listen pronunciation is real playback. When dictionaryapi.dev's media host is down, `shoot.ts` 302-redirects to the same Wikimedia Commons file (fetched with a User-Agent) and saves the clip, which `build.py` mixes in with the music ducked (`style.sfx`).

## Music: bgm2 only

`bgm2.mp3` is the promo track (never committed; pass `--music` or `PROMO_MUSIC`). `build.py` defaults to its grid (`BGM2_GRID`) and `styles/apple-support-bgm2.json`:

| Cut | `--music-start` (downbeat, s) | `--bpm` | Section |
|-----|------------------------------|---------|---------|
| 30 s | 182.640 | 129.82 | The climax after the breakdown; energy falls away right after the end card |
| 60 s | 112.501 | 128.499 | Lighter break, then build; the end card sits in the climax, and the cut ends at 172.5 s as it drops |

Every cut, caption hit, title word and zoom is in **beats**, so it lands on the grid. Audio: excerpt → short fade only over the end card → in-app sounds with ducking → two-pass loudnorm to **-14 LUFS**, TP -1 → **AAC 192k**. The tempo isn't constant across the track, so use these local fits. Only re-derive them (`music.py`, then a linear fit over beat-tracker beats) if you change the section.

## Style spec (Apple Support): `styles/apple-support.json`

- **Canvas:** background `#FAFAFC`, ink `#1C1C1F`, **no shadows**, 1920×1080 and 1080×1920, 30 fps.
- **One curve for everything** (moves, pushes, wipes, caption slides and rolls): `cubic-bezier(0.3, 0.05, 0.3, 0.95)`. Moves take ~**1.37 s**.
- **No fades and no clipped text, ever.** Text only slides or rolls inside its own mask box. `build.py` checks every settled caption frame pixel-for-pixel against an unmasked reference.
- **Devices:** the official Apple bezels (MacBook Air 13", iPhone 18 Pro) via `bezels.py`. Footage maps 1:1 into the screen cut-out. The camera moves the whole device and never crops inside the screen. The phone is centred in the frame (220 px above and below).
- **Type:** Myriad Pro Semibold from `public/fonts` for all captions.
- **Opening:**
  - 16:9: Apple's left title card, "New apps / on ryOS" (100 px, two lines), with the MacBook fitted beside it so the whole desktop and the new app shortcuts stay in frame.
  - 9:16: the hero title (300 px, left-aligned at 7 %, one word per line) comes in **word by word every half beat**, then the phone pushes up on beat 3 (beat 4 in the 60 s cut).
- **App intros:** a grey `#2C2C2E` panel wipes in, shows the centred macOS X theme icon and white app name, then slides off into the app.
- **Captions:** centred under the device. Within an app, the first caption **enters once**; each later step **rolls over in place** (`caption.change: "roll"`, 0.6 s). It never re-enters per cut.
- **Camera:** steady. **At most one gentle zoom** per cut (×1.12 on the last Dictionary step, AI notes), so it never zooms back out.
- **Taps:** macOS cursor on desktop; iOS hover disc + blue ring on the phone.
- **End card:** the last shot shrinks through an icon-shaped mask onto the **ryOS icon** (`public/icons/mac-512.png`), with `os.ryo.lu` below.
- **Content rules:** the Chinese demo word is **豆腐**. The welcome screen (學習 chip) must never show. Captions have no trailing period.

## Lengths

- **30 s:** Title → Dictionary (lookups in en/ja/ko, 豆腐 stroke cards, AI notes) → Fitness (AI meal log, ÷2 split, progress) → end card.
- **60 s:** adds Listen (speech, ducked), Readings › Chinese › Zhuyin, week plan, set logging and the Japanese exercise library. See `plan60()` in `build.py` for the beat timeline.

## Self-review before sharing

- [ ] The render log says `[done] … = 30.00s` / `60.00s`, and `[captions] … 0 off-frame … 0 partly behind … 0 with cut/hidden glyphs`.
- [ ] `ffmpeg -i out.mp4 -af ebur128=peak=true -f null -` reports I ≈ -14 LUFS.
- [ ] `python3 scripts/promo/check_welcome.py <capture.mkv> 1.0` gives a low best_match (a real hit is ~0.9) for every take.
- [ ] Contact sheets of each cut show: title words in sequence, the device centred with the dock clear, desktop shortcuts visible, captions rolling, and the end card with the ryOS icon.
- [ ] 60 s cut: the `[sfx]` time lines up with the Listen button's active state.

## Changing the look

Override any subset in a JSON file that `"extends": "apple-support.json"` (deep-merged over `style.py` defaults) and pass `--style`. Prefer beats (`*_beats`) over seconds, so timing stays on the grid.
