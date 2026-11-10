# iPod UX notes from Apple Music's 404 page

Status: **investigation only**. No app code in this change. Apple's implementation is copyrighted; this note describes observed behavior and techniques in our own words. Do not copy their script, click sample, noise texture, or embedded font into the repo.

Studied 2026-10-23 against `https://music.apple.com/us/MichiModsStuff` (a missing path that renders the 404 page). The page shell loads `NotFoundPage`, which defines a `web-music-ipod` custom element from `/includes/ipod/web-music-ipod.esm.js` and fills it from `/includes/ipod/data/{storefront}/{language}.json`. The US English catalog observed that day was schema 3: about 1,000 preview songs, about 700 artists, and 15 playlists. Playback is short HTML5 previews, not full tracks.

ryOS comparison is against `src/apps/ipod/` on `main`, especially `IpodWheel.tsx`, `useIpodLogic.ts`, `IpodScreen.tsx`, `IpodScreenMenuChrome.tsx`, `useIpodStatusBacklight.ts`, and `utils/wheelSound.ts`.

## What the page actually is

Wide viewports (container query around 1000px) place the device beside the 404 message. Narrow viewports stack the message above the device. The message is set in Adobe Garamond and is page chrome, not the LCD. The device itself is a fixed ~415px-wide body whose screen is 273×223, with a ~276px click ring and a ~100px center button (those diameters are percentages of a 350px reference).

The host sets `container-type: inline-size`. Inside that container the body scales with CSS `scale`: 1, then 0.9 / 0.8 / 0.75 as the container drops below 440 / 400 / 360px, with a 250ms ease-in-out. ryOS already scales the 250×400 device art up to fill the window (`useIpodScale.ts`, floor 1×, cap 2×). That is the right model for a desktop window. The Apple step-down scale only matters if the ryOS window can get narrower than the device art; today the window minimum is 300×480, so this is not a gap.

## How the click wheel decides a "click"

Pointer input is one path for mouse, pen, and touch (`pointerdown` / `move` / `up` / `cancel` / lost capture), with `touch-action: none` and pointer capture on the ring. There is no wheel, gesture, or trackpad listener. A two-finger trackpad scroll does nothing on their wheel. ryOS should keep its trackpad path.

Geometry, restated:

- Angle is `atan2` of the pointer relative to the ring center, in degrees.
- The signed delta is wrapped into (−180°, 180°] so a crossing of the ±180° seam does not jump a full turn.
- A drag only starts when the pointer is on the ring: inside the outer radius and outside the center button (center diameter / ring diameter ≈ 100/276).
- A sample is dropped when the segment from the previous point to the current point passes within 10% of the radius of the hub. That kills the ~180° spike you get by sliding across the center button.
- Direction changes are debounced. Opposite motion accumulates until it reaches 8° before the sign flips, so a shaky hand does not tick backward.
- Speed is degrees per second: `abs(delta) / dt * 1000`.
- Menu and scrub steps quantize at **15° per step** (the same constant ryOS uses). The leftover degrees carry to the next sample, and a direction change clears the leftover so a reversal does not spend a stale partial step.

ryOS (`IpodWheel.tsx`) also uses 15° and a wrapped angle delta, for both touch and mouse. It does not drop hub-crossing samples, and it does not require 8° before reversing. Touch-start ignores the center (hard-coded 32px), but a mouse drag that starts on the ring and crosses the button still accumulates the full angle jump. Mouse and touch both emit only `"clockwise" | "counterclockwise"`, so later code cannot see degrees or speed.

### Acceleration

Once a step is produced, a second stage decides how many rows that step is worth.

- Latest speed is clamped to 400°/s, then smoothed: `smoothed += 0.15 * (clamped - smoothed)`.
- At or below 180°/s, each 15° step moves **one** row.
- Above 180°/s, a timer starts. Every 500ms spent continuously above that speed advances a tier. The row counts are the Fibonacci-ish list **1, 2, 3, 5, 8, 13, 21, 34**.
- A direction change, or a gap longer than 250ms, resets the smoother and the tier.
- The click sound still fires **once per 15° quantum**, not once per row jumped. A fast spin sounds like a steady mechanical click while the highlight leaps ahead.

Scrubbing uses the same smoother with a shorter tier list, **1, 2, 3, 5 seconds** per step, and the same 180°/s and 500ms knobs.

Keyboard repeat is modeled as a fake 15° step per keydown so it shares the speed math, but the assumed speed is capped at 180°/s, so arrow-key scrolling stays at one row until a separate hold-time path takes over (below).

ryOS moves exactly one row per 15° step. The exception is letter-jump on alphabetic menus: after 30 rotations inside a 600ms streak, further rotation jumps to the next letter and shows a letter chip, then idles out after 900ms (`useIpodLogic.ts`, `FAST_SCROLL_*`). That is a real classic-iPod behavior their 404 toy does not have, and it is worth keeping for Artists / Albums. It is a poor fit for Songs, playlists, and settings, where a fast finger still crawls one row at a time.

### Volume vs scrub on Now Playing

On a list, the wheel scrolls. On Now Playing, the wheel adjusts **volume**, not the playhead.

- Full scale is 1.25 turns: `1.25 * 360 / 100 = 4.5°` per volume unit (0–100).
- Clicks during a volume sweep are coarser, about 22 clicks per those 1.25 turns (`1.25 * 360 / 22`). A click is played only when the rounded volume actually changes.
- The time row and the volume row are two cells of one strip, twice as wide as the screen plus a gap. Entering volume or scrub slides that strip by half its width in **300ms ease-out** (instant when `prefers-reduced-motion: reduce`). The elapsed/remaining labels leave, and a speaker icon plus a bar slide in. RTL mirrors the slide.
- The volume overlay stays up for **5 seconds** after the last wheel event, then slides back. Center, while the overlay is up, dismisses it instead of toggling play.
- Scrub is a separate mode, entered from the on-screen progress control (a labeled slider), not from a casual wheel flick. Steps start at 1 second and accelerate through 1 / 2 / 3 / 5 seconds. The preview is committed about **1 second** after the wheel stops. The scrub overlay also idles out after 5 seconds. Clicks are suppressed while scrubbing. Skip buttons are disabled for the duration so a tap does not change tracks mid-seek.

ryOS sends Now Playing wheel rotation straight to the playhead in **5 second** jumps and flashes a status string (`SEEK_AMOUNT_SECONDS` in `constants.ts`, `handleWheelRotation` in `useIpodLogic.ts`). Volume lives in the audio settings store and the menubar, not on the wheel. There is no sliding time/volume strip.

### Prev / next are tap vs hold

A tap on the right or left sector skips to the next or previous track. Holding the sector (long-press fires after the hold threshold, then repeats) **seeks** instead. The seek distance grows with the number of repeats in the gesture: 5s, 5s, 5s, 10s, 10s, 10s, then 20s. While a scrub session is open, those buttons are inert.

ryOS maps left/right to previous/next immediately (`handleWheelClick` in `useIpodLogic.ts`). There is no hold-to-seek on those sectors. Center long-press is already taken, and usefully: it opens the Now Playing song menu or leaves Cover Flow.

### Buttons, keys, and focus

Sector hit areas are clipped wedges, not four invisible boxes around a label. Icons scale to about 0.97 while pressed; the center button scales to about 0.98. The ring itself has a 100ms ease-out on transform. MENU is drawn as text on a curve; the other three marks are icons, with a soft gloss arc behind MENU.

Keyboard, when the wheel is focused:

| Key | List | Now Playing |
| --- | --- | --- |
| Arrow Down / Up | Next / previous row | Inverted: Up raises volume or seeks forward, Down lowers or seeks back |
| Arrow Left / Right | Left is Menu (back), Right is Select. Swapped under RTL | While seeking, they scrub. While volume is showing, they act as prev/next hold |
| Enter | Select. In the brick game, Enter can be a hold | Select |
| Space | Play / pause | Play / pause |
| Escape | Hold starts immediately; releasing before the hold completes goes back one menu | Same, and it does not get stolen by the progress control |

Arrow scrolling fires one step immediately, then repeats after a **300ms** delay every **80ms**. Hold-to-repeat on the wheel buttons uses a 1s arming delay; volume-mode key repeat for prev/next is 500ms. Scroll-key repeat acceleration for lists uses the same Fibonacci tiers, indexed by how long the key has been held, so a held arrow does eventually leap even though each keydown is only "15°".

Focus: a fine pointer (mouse) moving over the wheel focuses it, with `preventScroll`. Touch does not steal focus. Modifier chords are ignored. The screen underneath is `pointer-events: none` except the progress control and the song-title link, so the page behind the LCD cannot be dragged.

The windowed ryOS iPod has no device-level keyboard map. The center control handles Enter and Space as select. Fullscreen (`FullScreenPortal.tsx`) uses a different map: Escape closes, Space toggles play, Left/Right seek ±5s, Up/Down change tracks. Cover Flow has its own arrows. Those fullscreen shortcuts are worth keeping; the gap is the windowed device.

### Click sound

Clicks are one short PCM buffer played through Web Audio, gain about 0.3. Starts are scheduled on the audio clock at least **50ms** apart. If the next start would land more than **150ms** in the future, it is dropped, so a burst cannot queue a tail of clicks after the finger has stopped. When the context has to resume from suspended, a request older than 200ms is discarded and a fresh one is delayed about 80ms. The context is resumed on activity (wheel, key, button).

A Settings row, **Clicker On/Off**, gates the sound. It is stored with the other device settings. Scrubbing never clicks. Button presses do.

ryOS plays `Sounds.IPOD_CLICK_WHEEL` through `useSound`, gated by `shouldPlayIpodWheelSound` at **30ms** (`utils/wheelSound.ts`). That prevents the mobile sound pool from filling up, which is the right constraint, but it is a wall-clock gate rather than a scheduled clock, so a fast flick can sound lumpy or get cut off. There is no Clicker row inside the device settings. Button clicks also call `vibrate()`; their 404 iPod does not use the vibration API. Keep the haptics.

### Menus

Pushing a screen slides the old and new pages as one horizontal piece. A full-width travel takes **240ms**. From rest the ease is a sine in-out (`-0.5 * (cos(πt) - 1)`). If you go back while a slide is still moving, the new slide picks up the current translate, switches to a sine ease-out, and sets its duration from the remaining distance over the same speed, so a reversal does not restart from zero and crawl. `prefers-reduced-motion: reduce` sets the duration to 0. RTL flips the sign.

The list is a `listbox` labeled by the screen title. Rows are `option`s. The list exposes `aria-activedescendant`, and the selected row sets `aria-selected`. Focus-visible draws a 2px outline on the selected row. `prefers-contrast: more` turns the highlight into black on a cream ground.

Scroll-into-view uses `block: "nearest"`, so the highlight stays put until it hits an edge. On the way into a screen, the scroll offset that was saved when that screen was pushed is restored when the same row is still the selection. If playback moved the Now Playing row, they recompute the index instead of restoring a stale offset. Per-screen selection is remembered on the stack.

The selected row's label marquees. The distance is the overflow plus a 30px gap, the duration is proportional to that distance (about 0.05s per pixel), and it waits 2s before looping. Reduced motion drops the duplicate copy and ellipsizes. Unselected rows ellipsize.

Empty libraries show one centered, non-selectable "no music" row (the highlight style is suppressed for `info` rows).

ryOS slides menus with Framer Motion, 200ms ease-in-out, `x` of ±100% (`menuVariants` in `ipod-screen/constants.ts`, `IpodScreenMenuChrome.tsx`). Reversing mid-transition restarts the ease. Reduced motion is honored for the marquee and the split-art Ken Burns (`src/index.css`), not for the menu slide. Rows are not a listbox; selection is a class. Scroll-into-view on wheel moves is edge-based and matches "nearest" well (`IpodScreen.tsx` layout effect). On a menu change, scroll is recomputed from the selected index (top, or bottom-aligned once the row is below the fold) rather than the exact offset the user left behind. Menu history already stores `selectedIndex`, which is the important half. Virtualization (`OVERSCAN_ITEMS`) is something their 404 page does not do: it mounts every row, including a 1,000-song list. Keep virtualization.

### Backlight

Settings offer Off, 1s, 2s, 3s, 5s, and Always On. Until the user picks one, the default follows the color scheme: dark → always on, light → off. The choice is persisted (local storage on their page; ryOS already persists `backlightTimeout` in the iPod store).

Any activity turns the lamp on and arms the timer. Holding Menu toggles the lamp without changing the saved timeout. The unlit LCD is a gray-green gradient (`#a5a59b` → `#d6d5d0`) with a soft luminosity scrim. The lit LCD swaps in a blue scrim (`#0f69ff`), raises a warm bulb color (`rgb(254, 249, 220)`) as several edge radials with `mix-blend-mode: plus-lighter`, and shifts the inverse ink so the black selection bar still reads. Dark mode also drops the unlit screen's opacity slightly.

ryOS timeouts are Off, 2s, 10s, and Always On, edited from the menubar (`IpodMenuBarViewMenu.tsx`), cycled in `memoizedCycleBacklightTimeout`. Activity wakes the lamp (`useIpodStatusBacklight.ts`). The modern skin dims with `brightness(0.5) contrast(0.9)` (`.ipod-modern-backlight-off` in `src/index.css`). The classic skin swaps `#c5e0f5` for a gray `#8a9da9` and keeps the scan-line filter. There is no Menu-hold toggle. The classic skin is the later blue color LCD even when "on"; their 404 device is the monochrome original that only turns blue when the backlight is on. That is a skin-accuracy difference, not a bug in the modern UI, which should stay the default.

### Now Playing chrome, type, and the rest

Observed on the live page, unlit: gray-green LCD, black selection bar, light text, a play/pause mark at the left of the title strip, a chunky battery outline at the right. Now Playing shows the queue index, a linked song title (the link is the one part of the LCD that receives clicks), artist, album, a thin progress rule, and tabular elapsed/remaining times. Shuffle and repeat show as small marks beside the index. The title link goes to the Apple Music URL for that song.

The LCD font is a Chicago-metric face they ship inside the module, with a system fallback (Krungthep on macOS) whose `size-adjust` / ascent / descent are overridden so Thai glyphs sit on the same line. ryOS classic already uses the Chicago font stack and a 1px text shadow; modern uses Myriad Pro. Do not import their font file. No change needed for modern type.

The ring has a faint noise image under a radial highlight, a 2px gray stroke, and inset plus drop shadows. ryOS is a flat translucent disc with emoji glyphs (`⏭ ⏯ ⏮`) and a flat MENU label (`IpodWheel.tsx`).

Brick is on the device too: a pixelated canvas, wheel angle steers the paddle continuously (degrees, not menu steps), arrows steer, center launches the ball. ryOS already has Brick (`brick-game/`, `WHEEL_TICK_PIXELS = 11`). Not a priority. Their player also equal-power crossfades preview clips over about 2 seconds. ryOS plays full YouTube and Apple Music streams with its own gapless path; do not port the preview crossfade.

Loading the custom element shows a spinner only after 500ms, and gives up after 5 seconds. Offline is a single status string. Both are polish around a catalog fetch ryOS does not share.

## What to leave alone

- Trackpad and mouse-wheel scrolling (`handleMouseWheel`, 50px of `deltaY` per step). Their page has no equivalent. Feed it into the same degree accumulator instead of removing it.
- Letter-jump on alphabetic menus, Cover Flow, lyrics, the modern split-art menu, virtualization, and center long-press on Now Playing.
- Button haptics.
- Fullscreen keyboard shortcuts that seek and change tracks. Those match a video surface more than a click wheel.
- The modern skin as the default. Backlight and wheel work below should land on both skins; the monochrome-green LCD is a classic-skin option at most.

## Recommendations

Ranked by how much the wheel would feel more like a click wheel, against how wide the edit is. "Effort" means which files move, not calendar time.

### 1. Report degrees and speed from the wheel, then accelerate

**Impact: high. Effort: medium.** One behavior change in the wheel, one consumer in the logic hook. This is the difference between a long Songs list feeling mechanical and feeling like a slider.

**Apple.** 15° quanta, speed-smoothed, Fibonacci row tiers after ~180°/s held in 500ms steps, tier reset on reversal or a 250ms gap. Clicks stay locked to the 15° quantum.

**ryOS today.** `onWheelRotation` is only a direction. `handleWheelRotation` always steps one row, except letter-jump.

**Approach.** Extend the wheel callback with `{ direction, degrees, speedDegPerSec }` (and keep emitting one event per 15° so existing callers can ignore the extra fields). Implement the smoother and tier table next to `handleWheelRotation` in `useIpodLogic.ts`, and pass `steps` into the index update. Play the click once per quantum inside the wheel handler, not once per row. Leave letter-jump in place for `alphabetic` menus, and let it replace the tier multiplier once the letter chip is up so the two modes do not stack. Reset the tier when the menu stack changes.

### 2. On Now Playing, the wheel is volume; scrub is a mode

**Impact: high. Effort: medium-high.** Touches the wheel consumer, the Now Playing layout in `IpodScreenMenuChrome.tsx` / `IpodScreen.tsx`, and the audio volume store.

**Apple.** Wheel on Now Playing maps 1.25 turns to 0–100 volume. A 300ms slide swaps the time row for a volume row. Five seconds of idle restores the time row. Center dismisses the overlay first. Scrub is a separate slider session: 1s steps accelerating to 5s, commit ~1s after the last step, no clicks, skip buttons frozen. Reduced motion skips the slide.

**ryOS today.** Wheel seeks ±5s and shows a toast-like status glyph. Volume is outside the device.

**Approach.** In the non-menu branch of `handleWheelRotation`, call the existing iPod volume setter (`useAudioSettingsStore`) with a degree accumulator at 4.5° per unit, clamped 0–100. Add a two-pane strip in the Now Playing footer (time | volume) and translate it by 50% while `isAdjustingVolume`. Use the same strip for an explicit scrub mode, entered by clicking the progress rule (the rule needs `pointer-events: auto`; the rest of the LCD can stay inert). Commit the seek on a 1s debounce instead of seeking on every step, so a spin previews. Gate `handleWheelClick` left/right while that session is open. Honor `prefers-reduced-motion` by swapping panes with no translate. Keep fullscreen Left/Right as immediate seeks so video scrubbing does not grow a mode.

### 3. Ignore the hub, and debounce a reversal

**Impact: high for feel. Effort: low.** Local to `IpodWheel.tsx`.

**Apple.** Drop samples whose segment comes within 10% of the radius of the center. Require 8° of opposite travel before the sign flips. Only arm a drag from the ring, not the center disc.

**ryOS today.** The accumulator trusts every angle delta. Crossing the center button produces a large backward or forward tick. Reversal is instant.

**Approach.** On each move, if the closest point on the segment to the wheel center is inside `0.1 * radius`, skip that sample (still update the last angle, so the next sample starts clean). Keep a `pendingReverseDeg` that must reach 8 before `rotationAccumulator` changes sign. Apply the same rules to the mouse window-listeners and to touch. Keep the window listeners so a drag can leave the ring. Drive the center-disc test from the rendered center size (`w-16` is 64px, radius 32, which matches the touch check) instead of a second magic number, and use it for mouse-down as well as touch-start.

### 4. Tap skips a track; hold seeks, and the seek grows

**Impact: high. Effort: medium.** `IpodWheel.tsx` for the hold gesture, `handleWheelClick` / a new hold callback in `useIpodLogic.ts`.

**Apple.** Tap prev/next changes track. After the long-press arms, repeats seek 5s three times, 10s three times, then 20s. The session shares the scrub overlay and suppresses the clicker.

**ryOS today.** Left and right always skip. Seeking is only the Now Playing wheel, in flat 5s steps.

**Approach.** Add an optional `onWheelLongPress(area)` next to the existing center long-press (500ms is already `LONG_PRESS_DELAY`; use that for the sectors too, and repeat on an ~200ms interval while the pointer is down). On repeat, seek by the 5/5/5/10/10/10/20 schedule and show the position in the progress labels rather than a status glyph. A release before the hold still calls `onWheelClick`, so today's skip stays the short-press behavior. Do not reuse center long-press; that already opens the song menu.

### 5. Schedule clicks on the audio clock, and add a Clicker setting

**Impact: medium. Effort: low.** `utils/wheelSound.ts` plus a settings row.

**Apple.** Web Audio buffer, gain ~0.3, minimum 50ms between scheduled starts, drop anything that would schedule more than 150ms ahead, drop stale resumes older than 200ms. Clicker On/Off in the device settings. No clicks while scrubbing.

**ryOS today.** `useSound` plus a 30ms wall-clock gate, which exists to protect the shared mobile pool. No in-device clicker toggle. Scrubbing (once it exists) would click unless told not to.

**Approach.** Keep the 30ms floor and the shared pool. When the gesture emits several quanta in one frame, schedule at most one extra click ~50ms out and drop the rest, matching their "don't let a tail play after the finger stops" rule. Add `clickerEnabled` to the iPod store (default on) and a Settings row, or a menubar checkbox next to backlight, and skip `playScrollSound` when it is off or when a scrub session is open. Do not copy their wav. The existing `IPOD_CLICK_WHEEL` sample stays.

### 6. Menu slides should keep their speed when reversed

**Impact: medium. Effort: medium.** `menuVariants` and `IpodScreenMenuChrome.tsx`.

**Apple.** 240ms for a full width. Sine in-out from rest. If a slide is interrupted, read the current translate, ease out, and scale the duration by the remaining fraction of the width. Reduced motion is instant. RTL flips direction.

**ryOS today.** A fixed 200ms ease-in-out on `x: ±100%`. A back gesture during the forward slide restarts from the far side. Menu motion does not look at `prefers-reduced-motion`. Scroll position on return is derived from the selected index, which is close, and loses the exact offset if the row was in the middle of the viewport.

**Approach.** Drive the motion `transition` from a small helper: duration 0 under reduced motion; otherwise `240 * remainingFraction` ms, ease `[0.45, 0, 0.55, 1]` from rest and an ease-out cubic if `custom` says the outgoing screen had not settled. Framer can take the current `x` as `initial` when the exiting node is still mid-way; store that on the variant custom payload. Optionally stash `scrollTop` on the menu-history frame beside `selectedIndex` and restore it in the layout effect in `IpodScreen.tsx` when the index still matches. Keep `mode="sync"` and the callback ref that ignores the exiting node's null clear; that bugfix should stay.

### 7. Backlight: shorter timers, Menu-hold, and a real lamp on the classic skin

**Impact: medium. Effort: medium.** Store type, menubar, `useIpodStatusBacklight.ts`, classic screen classes in `IpodScreen.tsx`.

**Apple.** Off / 1 / 2 / 3 / 5 / always. First run follows the color scheme until the user chooses. Activity turns the lamp on and restarts one timer. Menu-hold toggles the lamp in place. Lit look is a blue field plus warm edge bulbs, with the selection ink adjusted so it does not vanish.

**ryOS today.** Off / 2s / 10s / always, menubar only. Activity wake works. Modern off-state is a brightness filter, which is appropriate for the white modern LCD. Classic off-state is a flat gray; classic on-state is the color-LCD blue even with the timer set to "on", so the timer barely reads as a backlight.

**Approach.** Extend `IpodBacklightTimeout` with `"1s" | "3s" | "5s"` (keep 2s and 10s so stored values migrate). Surface them in `IpodMenuBarViewMenu.tsx` and, if a device Settings list already exists, a Backlight Timer row that uses the wheel. Add a long-press on the MENU label (same 500ms hold as recommendation 4) that calls `toggleBacklight` without cycling the timeout. For the classic skin only, when the lamp is on, add a blue scrim and a soft warm radial at the left edge in `IpodScreen.tsx`; when it is off, use the gray-green ground. Leave the modern skin on the brightness filter. Default for a fresh profile can follow `prefers-color-scheme` once, then stick to the stored value the first time the user changes it (`backlightChosen` flag). Do not copy their gradient stops verbatim; approximate the idea with the existing LCD tokens.

### 8. A keyboard map for the windowed device

**Impact: medium. Effort: low-medium.** A keydown listener in `useIpodAppController.tsx` or `IpodDeviceBody.tsx`, guarded so it does not fire when a dialog or the menubar has focus.

**Apple.** Arrows scroll the wheel's current target. Left is back, Right is select, mirrored in RTL. Space plays. Escape holds Menu (backlight if held, back if tapped). Repeat: immediate step, 300ms delay, 80ms period, then the same row tiers by hold time. The wheel focuses itself on mouse move for fine pointers only.

**ryOS today.** Windowed device: Enter/Space on the center button only. Fullscreen: a media-player map. No key repeat for menu scrolling.

**Approach.** When the iPod window is focused and the target is not an input, handle the table in the keyboard section above by calling the existing `handleWheelRotation`, `handleMenuButton`, `handleWheelClick("center")`, and `togglePlay`. Use `dir` from the document to swap Left/Right. Implement repeat with the 300/80 timing rather than the browser's key-repeat, so the tier table from recommendation 1 can key off hold duration. Do not change `FullScreenPortal.tsx`. Focus the wheel container on pointer move over it when `matchMedia("(any-pointer: fine)")` matches, and not on touch.

### 9. Wheel drawing: icons, a curved MENU, a small press

**Impact: medium for the classic skin, lower for modern. Effort: low.** `IpodWheel.tsx` and a few CSS classes.

**Apple.** Curved MENU, simple prev/next/play marks, gloss arc on the menu wedge, noise and an inset highlight on the ring, ~3% scale-down while a sector is pressed. `prefers-contrast: more` darkens the icon fill.

**ryOS today.** Flat MENU in Chicago, emoji glyphs, flat fill per theme (classic / U2 / default). No press feedback.

**Approach.** Replace the three emoji with small inline SVGs we draw ourselves (triangle, double bar, skip bars). Put MENU on an SVG text path so it follows the ring; keep using the Chicago stack already in the app. Add `:active { scale: 0.98 }` on the center and the sector icons. A CSS repeating-gradient or an existing noise utility can stand in for the grain; do not embed their PNG. Skip this on the modern skin if the current wheel is intentionally flatter there; the classic and U2 themes benefit most.

### 10. Device settings, and the listbox semantics

**Impact: medium-low. Effort: medium for a settings screen, low for the roles.**

**Apple.** The main menu is Playlists, Artists, Songs, Settings, and Now Playing when a queue exists. Settings: About, Shuffle (off/songs), Repeat (off/one/all), Backlight Timer, Clicker, Reset All Settings. Shuffle and repeat show the current value on the row and toggle in place. About shows counts and a version. The list is a real listbox.

**ryOS today.** A much larger menu (music, videos, extras, games) which should stay. Shuffle, repeat, and backlight are menubar items. Rows are clickable divs. That is fine for mouse users and weak for VoiceOver.

**Approach.** Do not shrink the main menu to their five rows. Add a Settings screen reachable from the wheel whose rows call the existing shuffle, repeat, backlight, and clicker setters, with the current value on the right of the row (the menu item `value` field already supports this). Mark the scroll container `role="listbox"` and `aria-activedescendant`, and each visible row `role="option"` plus `aria-selected`, in `IpodScreenMenuChrome.tsx` / `MenuListItem.tsx`. Virtualization can keep offscreen rows out of the accessibility tree; `aria-setsize` / `aria-posinset` on the rendered options keeps the position honest.

## Smaller notes, not worth their own project

- Song titles on Now Playing are real links. ryOS already shares and can open Apple Music links from the menubar; a title hit-target on the LCD would match, and should stay `pointer-events: auto` only on that node.
- Selection highlight on their unlit screen is a solid `#484647` bar with light text. ryOS classic is a blue bar on a blue LCD. If recommendation 7 lands, retint the classic selected row with the lamp, and leave the modern white/blue row alone.
- Their marquee delay (2s, then a speed tied to overflow width) is close to `ScrollingText.tsx`. No change unless a side-by-side feels late or early.
- Empty-state rows should not take the selection color. Worth a one-line class if any current "nothing here" row still highlights.
- Container-query scale is unnecessary at the current 300px minimum. Revisit only if the window minimum drops.
- Brick paddle input on their wheel is continuous degrees. ryOS steps 11px per tick. Leave it unless the game feels notchy after the wheel starts reporting degrees; the new callback would make a continuous paddle a small follow-up in `useBrickGame.ts`.

## Suggested order

1. Wheel geometry (recommendation 3) and the richer rotation event, behind the current one-row behavior.
2. Acceleration and click scheduling (1 and 5) so long lists and the sound land together.
3. Now Playing volume and hold-to-seek (2 and 4).
4. Keyboard map (8), which wants the acceleration tiers to exist.
5. Menu motion, backlight, wheel drawing, settings/listbox (6, 7, 9, 10) in any order.

## Captures

Headless Chrome, 2026-10-23, `deviceScaleFactor: 1`. Frames are walkthrough artifacts, not repo assets.

- Main menu, unlit gray-green LCD, Playlists highlighted, curved MENU and prev/next/play marks.
- Playlists pushed in, with a real scrollbar and the highlight on the first playlist.
- Songs, first row highlighted, title strip showing the play mark and battery.
- Now Playing for a preview: index, title, artist, album, progress rule, tabular times.
- Volume mode: the time row replaced by a full volume bar (the strip's second pane).
- Settings: About, Shuffle Off, Repeat Off, Backlight Timer, Clicker On, Reset All Settings.
- Same Settings screen after a held Escape (Menu-hold), with the blue backlight and warm edge.
- Wide 404 layout with the device beside the Garamond message, and a narrow viewport with the message stacked above the device.

A headless mouse drag across the ring did not move the highlight in this environment (the host's hit target and the wedge buttons sit in front of the ring). Keyboard Enter / arrows, the volume pane, and Menu-hold backlight were exercised on the live element. The degree math itself was confirmed by dispatching pointer events on the ring node: each sample reported an 11.25° step and a clockwise sign, which is the quantizer described above.
