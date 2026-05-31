import {
  IPOD_MODERN_MEDIA_ROW_HEIGHT_PX,
  IPOD_MODERN_MENU_BODY_SLACK_PX,
  IPOD_MODERN_MENU_ROW_HEIGHT_PX,
  IPOD_MODERN_MEDIA_BODY_SLACK_PX,
  IPOD_MODERN_TITLEBAR_HEIGHT_PX,
} from "../../constants";

// Cross-fades for layered cover `<img>`s (now playing / fullscreen overlay paths).
export const NP_CROSSFADE_MS = 320;
export const COVER_FADE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)" as const;
export const COVER_FADE_TRANSITION =
  `opacity ${NP_CROSSFADE_MS}ms ${COVER_FADE_EASING}` as const;

// Fixed row height for the iPod menu list. Each `MenuListItem` is a
// single-line row; the classic skin's Chicago glyphs need 24px row height at
// 16px type, while the modern (color) skin uses **22px** rows with **15px**
// Myriad / system UI. Integer layout inside `border-2` + `border-box`:
// **16px** status + **132px** menu body (152px outer): 6×22 or 4×33, no slack.
//
// We virtualize EVERY menu — not just huge ones — so item geometry
// stays identical across the main menu, the artist list, and the
// thousands-long All Songs list. Without this, the All Songs view
// (virtualized at a fixed height) would render at a different row size
// than the surrounding menus (whose rows used the font's natural
// height) and the menu would visibly "shrink" when entering it.
//
// Both heights are constants — the variant is global state, not a
// per-menu choice, so a single value applies cleanly to all menus and
// the scroll-position math.
export const MENU_ITEM_HEIGHT_CLASSIC = 24;
export const MENU_ITEM_HEIGHT_MODERN = IPOD_MODERN_MENU_ROW_HEIGHT_PX;
// Modern **media** rows (playlist / artist album / in-playlist tracks):
// titlebar + four two-line rows fill the LCD (see `constants.ts`).
export const MENU_ITEM_HEIGHT_MODERN_MEDIA = IPOD_MODERN_MEDIA_ROW_HEIGHT_PX;
// 16px status bar; 22px / 33px rows (see constants.ts).
export const MODERN_TITLEBAR_HEIGHT = IPOD_MODERN_TITLEBAR_HEIGHT_PX;
export const MODERN_MENU_BODY_SLACK_PX = IPOD_MODERN_MENU_BODY_SLACK_PX;
export const MODERN_MEDIA_BODY_SLACK_PX = IPOD_MODERN_MEDIA_BODY_SLACK_PX;
// The Ken Burns album-art strip rendered alongside the menu in the
// modern UI takes exactly **half** of the screen width and the FULL
// screen height — the art panel covers the right half from the very
// top of the screen down (including the area where the titlebar
// would otherwise extend), exactly like the iPod classic 6G/7G
// "Music + Now Playing" split shown in the reference photo. The
// titlebar + menu list are clamped to the left half in split mode.
export const MODERN_SPLIT_HALF = "50%";
// Shared timing for every property that animates during the modern UI
// split↔full transition: menu panel width + box-shadow, split-art
// column width, and the cover-art image's opacity. Keeping all four
// on the same 300ms `ease-in-out` curve is what makes the move read
// as one continuous motion instead of overlapping easings.
export const SPLIT_LAYOUT_TRANSITION_TIMING =
  "duration-300 ease-in-out motion-reduce:transition-none";
// Selection-driven split art should not churn on every wheel tick. Wait for
// a short rest, then preload the next cover before swapping away from the
// currently displayed image.
export const SPLIT_ART_SELECTION_DEBOUNCE_MS = 160;
export const SPLIT_ART_CROSSFADE_SECONDS = 0.35;
// Render this many extra items above and below the visible window so
// scrolling doesn't reveal blank rows before React reconciles.
export const OVERSCAN_ITEMS = 6;

/** `rotateY` + perspective for left↔right foreshortening; Karaoke-style reflection stacking.
 *
 * Cover sized at 60px — comfortably bigger than the original 54px
 * without crowding the title / artist / album text column to its
 * right or pushing the reflection down into the progress bar.
 * Reflection ratio kept at 0.3 (subtler than the prior 0.5) so the
 * stack stays inside the now-playing row. */
export const MODERN_NOW_PLAYING_ART_PX = 60;
export const MODERN_NOW_PLAYING_REFLECT_RATIO = 0.3;
/** Shared clip radius for modern now-playing sleeve + reflection (modern skin only). */
export const MODERN_NOW_PLAYING_COVER_BORDER_RADIUS_PX = 0;

// Animation variants for menu transitions
export const menuVariants = {
  enter: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "100%" : "-100%",
  }),
  center: {
    x: 0,
  },
  exit: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "-100%" : "100%",
  }),
};
