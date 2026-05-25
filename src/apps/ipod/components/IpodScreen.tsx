import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import ReactPlayer from "react-player";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, Shuffle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { LyricsDisplay } from "./LyricsDisplay";
import {
  AppleMusicPlayerBridge,
} from "./AppleMusicPlayerBridge";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useTranslation } from "react-i18next";
import {
  BatteryIndicator,
  Scrollbar,
  MenuListItem,
  ScrollingText,
  StatusDisplay,
  IpodModernPlayPauseIcon,
  IpodArtworkPlaceholder,
} from "./screen";
import { useImageLoaded } from "../hooks/useImageLoaded";

// Cross-fades for layered cover `<img>`s (now playing / fullscreen overlay paths).
const NP_CROSSFADE_MS = 320;
const COVER_FADE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)" as const;
const COVER_FADE_TRANSITION =
  `opacity ${NP_CROSSFADE_MS}ms ${COVER_FADE_EASING}` as const;

type NowPlayingPingState = {
  slots: [string | null, string | null];
  front: 0 | 1;
  crossfading: boolean;
};

function nowPlayingArtReducer(
  state: NowPlayingPingState,
  action:
    | { type: "reset" }
    | { type: "cover"; payload: string }
    | { type: "abort-back" }
    | { type: "begin-fade" }
    | { type: "commit" }
): NowPlayingPingState {
  switch (action.type) {
    case "reset":
      return { slots: [null, null], front: 0, crossfading: false };
    case "cover": {
      const url = action.payload;
      const [s0, s1] = state.slots;
      const fu = state.front === 0 ? s0 : s1;
      if (fu === url) {
        return { ...state, crossfading: false };
      }
      if (fu === null) {
        return state.front === 0
          ? { ...state, slots: [url, s1], crossfading: false }
          : { ...state, slots: [s0, url], crossfading: false };
      }
      const back = 1 - state.front;
      return back === 0
        ? { ...state, slots: [url, s1], crossfading: false }
        : { ...state, slots: [s0, url], crossfading: false };
    }
    case "abort-back": {
      const back = 1 - state.front;
      return back === 0
        ? { ...state, slots: [null, state.slots[1]], crossfading: false }
        : { ...state, slots: [state.slots[0], null], crossfading: false };
    }
    case "begin-fade":
      return { ...state, crossfading: true };
    case "commit": {
      const back = 1 - state.front;
      const won = state.slots[back];
      if (won === null) {
        return { ...state, crossfading: false };
      }
      return {
        slots: back === 0 ? [won, null] : [null, won],
        front: back as 0 | 1,
        crossfading: false,
      };
    }
    default:
      return state;
  }
}

import {
  PLAYER_PROGRESS_INTERVAL_MS,
  getYouTubeVideoId,
  formatKugouImageUrl,
  IPOD_MODERN_MEDIA_BODY_SLACK_PX,
  IPOD_MODERN_MEDIA_ROW_HEIGHT_PX,
  IPOD_MODERN_MENU_BODY_HEIGHT_PX,
  IPOD_MODERN_MENU_BODY_SLACK_PX,
  IPOD_MODERN_MENU_ROW_HEIGHT_PX,
  IPOD_MODERN_SCREEN_HEIGHT_PX,
  IPOD_MODERN_TITLEBAR_HEIGHT_PX,
  IPOD_NOW_PLAYING_SONG_MENU_KEY,
} from "../constants";
import { DisplayMode } from "@/types/lyrics";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import { AmbientBackground } from "@/components/shared/AmbientBackground";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { WaterBackground } from "@/components/shared/WaterBackground";
import type { IpodScreenProps } from "../types";
import { useIpodStore, isAppleMusicCollectionTrack } from "@/stores/useIpodStore";

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
const MENU_ITEM_HEIGHT_CLASSIC = 24;
const MENU_ITEM_HEIGHT_MODERN = IPOD_MODERN_MENU_ROW_HEIGHT_PX;
// Modern **media** rows (playlist / artist album / in-playlist tracks):
// titlebar + four two-line rows fill the LCD (see `constants.ts`).
const MENU_ITEM_HEIGHT_MODERN_MEDIA = IPOD_MODERN_MEDIA_ROW_HEIGHT_PX;
// 16px status bar; 22px / 33px rows (see constants.ts).
const MODERN_TITLEBAR_HEIGHT = IPOD_MODERN_TITLEBAR_HEIGHT_PX;
const MODERN_MENU_BODY_SLACK_PX = IPOD_MODERN_MENU_BODY_SLACK_PX;
const MODERN_MEDIA_BODY_SLACK_PX = IPOD_MODERN_MEDIA_BODY_SLACK_PX;
// The Ken Burns album-art strip rendered alongside the menu in the
// modern UI takes exactly **half** of the screen width and the FULL
// screen height — the art panel covers the right half from the very
// top of the screen down (including the area where the titlebar
// would otherwise extend), exactly like the iPod classic 6G/7G
// "Music + Now Playing" split shown in the reference photo. The
// titlebar + menu list are clamped to the left half in split mode.
const MODERN_SPLIT_HALF = "50%";
// Shared timing for every property that animates during the modern UI
// split↔full transition: menu panel width + box-shadow, split-art
// column width, and the cover-art image's opacity. Keeping all four
// on the same 300ms `ease-in-out` curve is what makes the move read
// as one continuous motion instead of overlapping easings.
const SPLIT_LAYOUT_TRANSITION_TIMING =
  "duration-300 ease-in-out motion-reduce:transition-none";
// Selection-driven split art should not churn on every wheel tick. Wait for
// a short rest, then preload the next cover before swapping away from the
// currently displayed image.
const SPLIT_ART_SELECTION_DEBOUNCE_MS = 160;
const SPLIT_ART_CROSSFADE_SECONDS = 0.35;
// Render this many extra items above and below the visible window so
// scrolling doesn't reveal blank rows before React reconciles.
const OVERSCAN_ITEMS = 6;

interface MenuScrollState {
  scrollTop: number;
  containerHeight: number;
}

const menuScrollInitialState: MenuScrollState = {
  scrollTop: 0,
  containerHeight: 0,
};

type MenuScrollAction =
  | { type: "setScrollTop"; value: number }
  | { type: "setContainerHeight"; value: number };

function menuScrollReducer(
  state: MenuScrollState,
  action: MenuScrollAction
): MenuScrollState {
  switch (action.type) {
    case "setScrollTop":
      if (state.scrollTop === action.value) return state;
      return { ...state, scrollTop: action.value };
    case "setContainerHeight":
      if (state.containerHeight === action.value) return state;
      return { ...state, containerHeight: action.value };
    default:
      return state;
  }
}

function formatPlaybackTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(
    2,
    "0"
  )}`;
}

/** `rotateY` + perspective for left↔right foreshortening; Karaoke-style reflection stacking.
 *
 * Cover sized at 60px — comfortably bigger than the original 54px
 * without crowding the title / artist / album text column to its
 * right or pushing the reflection down into the progress bar.
 * Reflection ratio kept at 0.3 (subtler than the prior 0.5) so the
 * stack stays inside the now-playing row. */
const MODERN_NOW_PLAYING_ART_PX = 60;
const MODERN_NOW_PLAYING_REFLECT_RATIO = 0.3;
/** Shared clip radius for modern now-playing sleeve + reflection (modern skin only). */
const MODERN_NOW_PLAYING_COVER_BORDER_RADIUS_PX = 0;
const MODERN_NOW_PLAYING_SLEEVE: CSSProperties = {
  borderRadius: `${MODERN_NOW_PLAYING_COVER_BORDER_RADIUS_PX}px`,
};
const MODERN_NOW_PLAYING_REFLECT_IMG: CSSProperties = {
  transform: "scaleY(-1)",
  opacity: 0.36,
  maskImage:
    "linear-gradient(to top, rgba(0, 0, 0, 1) 0%, transparent 50%)",
  WebkitMaskImage:
    "linear-gradient(to top, rgba(0, 0, 0, 1) 0%, transparent 50%)",
  borderRadius: `${MODERN_NOW_PLAYING_COVER_BORDER_RADIUS_PX}px`,
};
const MODERN_NOW_PLAYING_3D_PERSPECTIVE_PX = 180;
/** Left→right perspective (rotate around vertical axis). Negate angle to mirror. */
const MODERN_NOW_PLAYING_ROTATE_Y = "15deg";

const MODERN_NOW_PLAYING_ART_3D: CSSProperties = {
  transformStyle: "preserve-3d",
  transform: `rotateY(${MODERN_NOW_PLAYING_ROTATE_Y})`,
  transformOrigin: "center center",
  width: MODERN_NOW_PLAYING_ART_PX,
};

/** Sleeve + reflection: URLs ping-pong between two fixed `<img>` slots so committing a cross-fade
 * never re-points the displayed bitmap at the same `<img>` with a freshly reset decode hook (avoids gray flicker). */
function ModernNowPlayingArtwork({ coverUrl }: { coverUrl: string | null }) {
  const reflectH = MODERN_NOW_PLAYING_ART_PX * MODERN_NOW_PLAYING_REFLECT_RATIO;
  const reflectTargetOpacity =
    MODERN_NOW_PLAYING_REFLECT_IMG.opacity as number;

  const [{ slots, front, crossfading }, dispatch] = useReducer(
    nowPlayingArtReducer,
    { slots: [null, null], front: 0, crossfading: false }
  );

  const fadeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const back = 1 - front;
  const backUrl = slots[back];
  const frontUrl = slots[front];

  useLayoutEffect(() => {
    if (fadeCommitTimerRef.current !== null) {
      clearTimeout(fadeCommitTimerRef.current);
      fadeCommitTimerRef.current = null;
    }
    if (!coverUrl) {
      dispatch({ type: "reset" });
      return;
    }
    dispatch({ type: "cover", payload: coverUrl });
  }, [coverUrl]);

  const load0 = useImageLoaded(slots[0]);
  const load1 = useImageLoaded(slots[1]);
  const refl0 = useImageLoaded(slots[0]);
  const refl1 = useImageLoaded(slots[1]);

  const backLoaded = back === 0 ? load0.loaded : load1.loaded;
  const frontHook = front === 0 ? load0 : load1;

  useEffect(() => {
    if (!backUrl || !coverUrl || backUrl !== coverUrl || !backLoaded) {
      return;
    }

    dispatch({ type: "begin-fade" });
    fadeCommitTimerRef.current = setTimeout(() => {
      fadeCommitTimerRef.current = null;
      dispatch({ type: "commit" });
    }, NP_CROSSFADE_MS);

    return () => {
      if (fadeCommitTimerRef.current !== null) {
        clearTimeout(fadeCommitTimerRef.current);
        fadeCommitTimerRef.current = null;
      }
    };
  }, [backUrl, coverUrl, backLoaded]);

  function sleeveOpacity(slot: 0 | 1): number {
    const u = slots[slot];
    if (!u) return 0;
    const L = slot === 0 ? load0 : load1;
    if (!L.loaded) return 0;
    if (!crossfading) return slot === front ? 1 : 0;
    return slot === back ? 1 : 0;
  }

  function sleeveZ(slot: 0 | 1): number {
    if (!crossfading) return slot === front ? 1 : 0;
    return slot === back ? 2 : 1;
  }

  function reflOpacity(slot: 0 | 1): number {
    return sleeveOpacity(slot) > 0 ? reflectTargetOpacity : 0;
  }

  function reflectionImgStyle(slot: 0 | 1): CSSProperties {
    return {
      ...MODERN_NOW_PLAYING_REFLECT_IMG,
      opacity: reflOpacity(slot),
      transition: COVER_FADE_TRANSITION,
    };
  }

  const showFallbackArt =
    !coverUrl ||
    (Boolean(frontUrl) &&
      frontUrl === coverUrl &&
      frontHook.failed &&
      !crossfading);

  const showPrimeLoadingBackdrop =
    Boolean(frontUrl) &&
    frontUrl === coverUrl &&
    !frontHook.failed &&
    !frontHook.loaded &&
    !crossfading;

  const showReflectStack = slots[0] !== null || slots[1] !== null;

  return (
    <div
      className="relative shrink-0 self-start overflow-visible"
      style={{
        width: MODERN_NOW_PLAYING_ART_PX,
        height: MODERN_NOW_PLAYING_ART_PX,
        perspective: `${MODERN_NOW_PLAYING_3D_PERSPECTIVE_PX}px`,
        perspectiveOrigin: "50% 70%",
      }}
    >
      <div style={MODERN_NOW_PLAYING_ART_3D}>
        <div
          className="relative overflow-hidden"
          style={{
            ...MODERN_NOW_PLAYING_SLEEVE,
            height: MODERN_NOW_PLAYING_ART_PX,
            width: MODERN_NOW_PLAYING_ART_PX,
          }}
        >
          {showFallbackArt ? (
            <IpodArtworkPlaceholder
              kind="album"
              className="absolute inset-0 size-full"
            />
          ) : null}
          {showPrimeLoadingBackdrop ? (
            <div
              className="ipod-empty-artwork absolute inset-0 size-full"
              aria-hidden
            />
          ) : null}
          {slots[0] ? (
            <img
              ref={load0.ref}
              src={slots[0]!}
              alt=""
              draggable={false}
              onLoad={load0.onLoad}
              onError={() => {
                if (front !== 0) {
                  dispatch({ type: "abort-back" });
                } else {
                  load0.onError();
                }
              }}
              className="absolute inset-0 size-full object-cover"
              style={{
                opacity: sleeveOpacity(0),
                zIndex: sleeveZ(0),
                transition: COVER_FADE_TRANSITION,
              }}
            />
          ) : null}
          {slots[1] ? (
            <img
              ref={load1.ref}
              src={slots[1]!}
              alt=""
              draggable={false}
              onLoad={load1.onLoad}
              onError={() => {
                if (front !== 1) {
                  dispatch({ type: "abort-back" });
                } else {
                  load1.onError();
                }
              }}
              className="absolute inset-0 size-full object-cover"
              style={{
                opacity: sleeveOpacity(1),
                zIndex: sleeveZ(1),
                transition: COVER_FADE_TRANSITION,
              }}
            />
          ) : null}
        </div>
        {showReflectStack ? (
          <div
            aria-hidden
            className="relative pointer-events-none mt-0 w-full overflow-hidden"
            style={{ height: reflectH }}
          >
            {slots[0] ? (
              <img
                ref={refl0.ref}
                src={slots[0]!}
                alt=""
                draggable={false}
                onLoad={refl0.onLoad}
                onError={() => {
                  if (front !== 0) {
                    dispatch({ type: "abort-back" });
                  } else {
                    refl0.onError();
                  }
                }}
                className="pointer-events-none absolute left-0 top-0 block w-full h-auto max-w-none"
                style={{
                  ...reflectionImgStyle(0),
                  zIndex: sleeveZ(0),
                }}
              />
            ) : null}
            {slots[1] ? (
              <img
                ref={refl1.ref}
                src={slots[1]!}
                alt=""
                draggable={false}
                onLoad={refl1.onLoad}
                onError={() => {
                  if (front !== 1) {
                    dispatch({ type: "abort-back" });
                  } else {
                    refl1.onError();
                  }
                }}
                className="pointer-events-none absolute left-0 top-0 block w-full h-auto max-w-none"
                style={{
                  ...reflectionImgStyle(1),
                  zIndex: sleeveZ(1),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Animation variants for menu transitions
const menuVariants = {
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

export function IpodScreen({
  currentTrack,
  isPlaying,
  elapsedTime,
  totalTime,
  menuMode,
  menuHistory,
  selectedMenuItem,
  onSelectMenuItem,
  currentIndex,
  tracksLength,
  backlightOn,
  menuDirection,
  onMenuItemAction,
  showVideo,
  displayMode,
  playerRef,
  handleTrackEnd,
  handleProgress,
  handleDuration,
  handlePlay,
  handlePause,
  handleReady,
  loopCurrent,
  loopAll,
  isShuffled,
  statusMessage,
  onToggleVideo,
  lcdFilterOn,
  ipodVolume,
  showStatusCallback,
  showLyrics,
  lyricsAlignment,
  koreanDisplay,
  japaneseFurigana,
  lyricOffset,
  adjustLyricOffset,
  registerActivity,
  isFullScreen,
  lyricsControls,
  onNextTrack,
  onPreviousTrack,
  furiganaMap,
  soramimiMap,
  activityState,
  appleMusicMenuTitlebarLoading = false,
  isCoverFlowOpen = false,
  coverFlowSlot,
  fastScrollLetter = null,
}: IpodScreenProps) {
  const { t } = useTranslation();
  
  const isAnyActivityActive = activityState.isLoadingLyrics || 
    activityState.isTranslating || 
    activityState.isFetchingFurigana || 
    activityState.isFetchingSoramimi || 
    activityState.isAddingSong;

  // Current menu title — Cover Flow takes priority because it covers
  // the entire menu panel, regardless of the underlying menu/now-
  // playing state behind it.
  const currentMenuTitle = isCoverFlowOpen
    ? t("apps.ipod.menu.coverFlow")
    : menuMode
      ? menuHistory.length > 0
        ? menuHistory[menuHistory.length - 1].displayTitle ??
          menuHistory[menuHistory.length - 1].title
        : t("apps.ipod.menuItems.ipod")
      : t("apps.ipod.menuItems.nowPlaying");

  // Refs
  //
  // The menu motion.div uses a `key` that changes on every navigation,
  // so AnimatePresence remounts it each time the user enters a new
  // menu. With `mode="sync"` the OLD menu sticks around for ~200ms
  // while its exit animation plays, and the NEW menu mounts on top.
  // Both inner scroll containers point at the same `menuScrollRef`:
  //   1. New menu mounts → React sets ref.current = newDiv ✓
  //   2. ~200ms later, old menu finishes exiting → React calls the
  //      ref cleanup for the OLD div → ref.current = null ✗
  // After step 2, every wheel-scroll attempt early-exits because the
  // ref is null. Use a callback ref that stores the latest mounted
  // node and ignores null clears from the unmounting old menu — the
  // ref then always points at the current menu's container.
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const setMenuScrollRef = useCallback((el: HTMLDivElement | null) => {
    if (el) menuScrollRef.current = el;
  }, []);

  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);
  const finalIpodVolume = ipodVolume * masterVolume;
  const isAppleMusicTrack = currentTrack?.source === "appleMusic";
  const isAppleMusicCollectionShell =
    isAppleMusicCollectionTrack(currentTrack);
  const collectionShellKey =
    currentTrack?.appleMusicPlayParams?.stationId ??
    currentTrack?.appleMusicPlayParams?.playlistId ??
    null;
  const appleMusicKitNowPlaying = useIpodStore((s) => s.appleMusicKitNowPlaying);
  const setAppleMusicKitNowPlaying = useIpodStore(
    (s) => s.setAppleMusicKitNowPlaying
  );
  // iOS-6 inspired modern skin (color screen + Helvetica Neue + glossy
  // blue gradients) vs. classic monochrome iPod LCD. Read directly from
  // the store so the parent doesn't have to thread one more prop, and so
  // toggling from the menubar updates the screen instantly.
  const uiVariant = useIpodStore((s) => s.uiVariant);
  const isModernUi = uiVariant === "modern";
  const currentMenuModernMediaList = useMemo(() => {
    if (!menuMode || menuHistory.length === 0) return false;
    return Boolean(menuHistory[menuHistory.length - 1].modernMediaList);
  }, [menuMode, menuHistory]);
  // Modern UI renders Cover Flow inline as a third state in the menu
  // panel's AnimatePresence (alongside menu list + now-playing) so the
  // menu↔nowplaying chrome width transition (50%↔100%) seamlessly
  // carries the user into and out of Cover Flow. Classic / karaoke
  // skins keep Cover Flow as a full-bleed overlay rendered outside
  // `IpodScreen` and never receive a `coverFlowSlot`.
  const showInlineCoverFlow = Boolean(
    isModernUi && isCoverFlowOpen && coverFlowSlot
  );
  const menuItemHeight = !isModernUi
    ? MENU_ITEM_HEIGHT_CLASSIC
    : currentMenuModernMediaList
      ? MENU_ITEM_HEIGHT_MODERN_MEDIA
      : MENU_ITEM_HEIGHT_MODERN;
  const [showShellTitleInTitlebar, setShowShellTitleInTitlebar] =
    useState(false);
  const effectiveDisplayMode =
    isAppleMusicTrack && displayMode === DisplayMode.Video
      ? DisplayMode.Cover
      : displayMode;
  const shouldAnimateVisuals = showVideo && isPlaying;

  useEffect(() => {
    setShowShellTitleInTitlebar(false);
  }, [collectionShellKey]);

  useEffect(() => {
    if (!collectionShellKey || menuMode || !isPlaying) {
      setShowShellTitleInTitlebar(false);
      return;
    }
    const intervalId = window.setInterval(() => {
      setShowShellTitleInTitlebar((show) => !show);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [isPlaying, menuMode, collectionShellKey]);

  const nowPlayingDisplayTrack = useMemo(() => {
    if (!currentTrack || !isAppleMusicCollectionShell || !appleMusicKitNowPlaying) {
      return currentTrack;
    }
    return {
      ...currentTrack,
      title: appleMusicKitNowPlaying.title,
      artist: appleMusicKitNowPlaying.artist ?? currentTrack.artist,
      album: appleMusicKitNowPlaying.album,
      cover: appleMusicKitNowPlaying.cover ?? currentTrack.cover,
    };
  }, [appleMusicKitNowPlaying, currentTrack, isAppleMusicCollectionShell]);

  const titlebarTitle =
    // When Cover Flow is open inline, always show the "Cover Flow"
    // label in the titlebar — the now-playing-shell title alternation
    // below is for actual now-playing screens, not Cover Flow.
    !isCoverFlowOpen &&
    !menuMode &&
    isAppleMusicCollectionShell &&
    isPlaying &&
    showShellTitleInTitlebar &&
    currentTrack?.title
      ? currentTrack.title
      : currentMenuTitle;
  const displayDurationSeconds = Math.max(0, Math.floor(totalTime));
  const displayElapsedSeconds = Math.max(
    0,
    Math.min(displayDurationSeconds, Math.floor(elapsedTime))
  );
  const displayRemainingSeconds = Math.max(
    0,
    displayDurationSeconds - displayElapsedSeconds
  );

  // Cover URL for paused state overlay
  const coverUrl = useMemo(() => {
    if (!nowPlayingDisplayTrack) return null;
    if (isAppleMusicTrack) {
      // Apple Music supplies an https URL directly; no Kugou template here.
      return nowPlayingDisplayTrack.cover ?? null;
    }
    const videoId = getYouTubeVideoId(nowPlayingDisplayTrack.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return (
      formatKugouImageUrl(nowPlayingDisplayTrack.cover, 400) ?? youtubeThumbnail
    );
  }, [isAppleMusicTrack, nowPlayingDisplayTrack]);

  // Current menu items (the deepest menu in the history stack).
  const currentMenuItems = useMemo(
    () =>
      menuMode && menuHistory.length > 0
        ? menuHistory[menuHistory.length - 1].items
        : [],
    [menuMode, menuHistory]
  );

  // Track scroll position + container height so we can compute the
  // visible window for virtualization.
  const [menuScrollState, dispatchMenuScroll] = useReducer(
    menuScrollReducer,
    menuScrollInitialState
  );
  const { scrollTop, containerHeight } = menuScrollState;
  const setScrollTop = useCallback((value: number) => {
    dispatchMenuScroll({ type: "setScrollTop", value });
  }, []);
  const setContainerHeight = useCallback((value: number) => {
    dispatchMenuScroll({ type: "setContainerHeight", value });
  }, []);

  useEffect(() => {
    const el = menuScrollRef.current;
    if (!el) return;
    const handleScroll = () => setScrollTop(el.scrollTop);
    const handleResize = () => setContainerHeight(el.clientHeight);
    handleScroll();
    handleResize();
    el.addEventListener("scroll", handleScroll, { passive: true });
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      ro.disconnect();
    };
  }, [menuMode, currentMenuItems]);

  const visibleRange = useMemo(() => {
    const start = Math.max(
      0,
      Math.floor(scrollTop / menuItemHeight) - OVERSCAN_ITEMS
    );
    const visibleCount =
      Math.ceil(
        (containerHeight || IPOD_MODERN_MENU_BODY_HEIGHT_PX) / menuItemHeight
      ) +
      OVERSCAN_ITEMS * 2;
    const end = Math.min(currentMenuItems.length, start + visibleCount);
    return { start, end };
  }, [scrollTop, containerHeight, currentMenuItems.length, menuItemHeight]);

  // Keep the selected item in view. We key on `menuHistory` (the array
  // reference, not just its length) so EVERY menu transition triggers a
  // scroll re-evaluation, even when:
  //   - The previous and next menus happen to have the same length, OR
  //   - The previous and next menus happen to use the same
  //     `selectedMenuItem` value (e.g. both default to 0).
  // Without this, navigating between, say, two equally-deep artist
  // submenus left the menu scrolled to the previous menu's offset.
  // Using useLayoutEffect prevents a flicker where the user briefly
  // sees the wrong scroll position before the correction lands.
  const lastMenuDepthRef = useRef(menuHistory.length);
  useLayoutEffect(() => {
    const el = menuScrollRef.current;
    if (!el) return;
    if (!menuMode || currentMenuItems.length === 0) {
      lastMenuDepthRef.current = menuHistory.length;
      return;
    }

    const isMenuTransition = lastMenuDepthRef.current !== menuHistory.length;
    lastMenuDepthRef.current = menuHistory.length;

    const containerH = el.clientHeight || IPOD_MODERN_MENU_BODY_HEIGHT_PX;

    // On a menu transition, snap scrollTop based purely on the target
    // index — we don't want to inherit the previous menu's offset.
    //
    // Match classic iPod list behavior: restore the selected row at the
    // nearest viewport edge (top for early rows, bottom for deeper rows),
    // not centered with extra context around it.
    if (isMenuTransition) {
      const safeIndex = Math.max(
        0,
        Math.min(selectedMenuItem, currentMenuItems.length - 1)
      );
      const itemTop = safeIndex * menuItemHeight;
      const itemBottom = itemTop + menuItemHeight;
      const target = itemBottom > containerH ? itemBottom - containerH : 0;
      el.scrollTop = target;
      setScrollTop(target);
      return;
    }

    // Within the same menu (e.g. wheel scrolling), only nudge the
    // scroll when the selection has gone off-screen.
    if (selectedMenuItem < 0 || selectedMenuItem >= currentMenuItems.length) {
      return;
    }
    const itemTop = selectedMenuItem * menuItemHeight;
    const itemBottom = itemTop + menuItemHeight;
    const visibleTop = el.scrollTop;
    const visibleBottom = visibleTop + containerH;
    if (fastScrollLetter) {
      // Scroll-by-letter mode: every jump lands on the first row of a
      // new letter group, so anchor that row to the top of the
      // viewport (clamped to the list bottom) instead of pulling it up
      // from the bottom edge — feels much more like a "page" jump.
      const maxScrollTop = Math.max(
        0,
        currentMenuItems.length * menuItemHeight - containerH
      );
      el.scrollTop = Math.min(itemTop, maxScrollTop);
    } else if (itemBottom > visibleBottom) {
      el.scrollTop = itemBottom - containerH;
    } else if (itemTop < visibleTop) {
      el.scrollTop = itemTop;
    }
  }, [menuMode, selectedMenuItem, menuHistory, currentMenuItems, menuItemHeight, fastScrollLetter]);

  const shouldShowLyrics = showLyrics;

  // ----- Split-menu Ken Burns artwork (selection-driven) -----------
  //
  // After the highlight rests briefly, cross-fade the right-hand panel
  // to that row's `coverUrl` (albums, artists, playlists). The next
  // image is preloaded before it becomes the displayed image, so slow
  // artwork keeps showing the previous cover instead of fading down to
  // the panel's black backface.
  //
  // Heuristic: only show the split panel for **browseable** menus —
  // those whose items drill deeper (`showChevron: true`). Track-list
  // leaves like "All Songs", "Recently Added", album/artist/playlist
  // track lists, and settings menus all use `showChevron: false` and
  // should render full-width per the reference photo (the iPod nano
  // / classic 6G+ only shows the now-playing artwork strip on
  // hierarchical browse menus, not on flat song lists or Settings).
  // The root iPod / Music submenus still qualify because their rows
  // include chevron-bearing categories.
  //
  // **Modern media lists** (playlist picker, Apple Music browses) show
  // artwork in each row — hide the right split so the menu stays full
  // width. Per-artist album lists use the same split preview as Albums.
  const isBrowseableMenu = useMemo(
    () =>
      isModernUi &&
      menuMode &&
      // When Cover Flow is open inline, the menu panel grows to 100%
      // and the split-art column collapses to 0% — same shape as
      // menu→now-playing — so we suppress the split-art carousel
      // entirely while Cover Flow is on screen.
      !showInlineCoverFlow &&
      !currentMenuModernMediaList &&
      currentMenuItems.some((item) => item.showChevron === true),
    [
      isModernUi,
      menuMode,
      showInlineCoverFlow,
      currentMenuModernMediaList,
      currentMenuItems,
    ]
  );

  const isNowPlayingSongMenu =
    menuHistory[menuHistory.length - 1]?.kind === "nowPlayingSong" ||
    menuHistory[menuHistory.length - 1]?.title === IPOD_NOW_PLAYING_SONG_MENU_KEY;

  const selectedRowSplitArtTarget = useMemo(() => {
    if (!isBrowseableMenu || currentMenuItems.length === 0) return null;
    const safeIndex = Math.min(
      Math.max(0, selectedMenuItem),
      currentMenuItems.length - 1
    );
    const rowUrl = currentMenuItems[safeIndex]?.coverUrl;
    if (typeof rowUrl === "string" && rowUrl.length > 0) return rowUrl;
    if (coverUrl) return coverUrl;
    for (const item of currentMenuItems) {
      const url = item.coverUrl;
      if (typeof url === "string" && url.length > 0) return url;
    }
    return null;
  }, [
    isBrowseableMenu,
    currentMenuItems,
    selectedMenuItem,
    coverUrl,
  ]);

  // Cover target for the right-hand split panel. Now Playing song menu
  // always uses the current track cover so the menu is already at 50%
  // width when labels are measured.
  const splitMenuArtUrl = useMemo(() => {
    if (!isModernUi || !menuMode || showInlineCoverFlow) return null;
    if (isNowPlayingSongMenu) return coverUrl ?? null;
    if (!isBrowseableMenu) return null;
    return selectedRowSplitArtTarget;
  }, [
    isModernUi,
    menuMode,
    showInlineCoverFlow,
    isNowPlayingSongMenu,
    coverUrl,
    isBrowseableMenu,
    selectedRowSplitArtTarget,
  ]);

  const showSplitMenuArt = Boolean(splitMenuArtUrl);

  // Track the latest *requested* split-art URL separately from the image
  // currently committed to the DOM. Debouncing avoids flicker while the
  // wheel is moving, and preloading means the old cover stays visible until
  // the next bitmap can cross-fade over it.
  const latestSplitArtUrlRef = useRef<string | null>(splitMenuArtUrl);
  const [debouncedSplitArtUrl, setDebouncedSplitArtUrl] = useState<
    string | null
  >(splitMenuArtUrl);
  const [displayedSplitArtUrl, setDisplayedSplitArtUrl] = useState<
    string | null
  >(splitMenuArtUrl);

  useEffect(() => {
    latestSplitArtUrlRef.current = splitMenuArtUrl;
  }, [splitMenuArtUrl]);

  useEffect(() => {
    if (!splitMenuArtUrl || splitMenuArtUrl === debouncedSplitArtUrl) {
      return;
    }
    const id = window.setTimeout(() => {
      setDebouncedSplitArtUrl(splitMenuArtUrl);
    }, SPLIT_ART_SELECTION_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [debouncedSplitArtUrl, splitMenuArtUrl]);

  useEffect(() => {
    if (
      !debouncedSplitArtUrl ||
      debouncedSplitArtUrl === displayedSplitArtUrl
    ) {
      return;
    }

    let cancelled = false;
    const img = new Image();
    const commitIfCurrent = () => {
      if (
        !cancelled &&
        latestSplitArtUrlRef.current === debouncedSplitArtUrl
      ) {
        setDisplayedSplitArtUrl(debouncedSplitArtUrl);
      }
    };

    img.onload = commitIfCurrent;
    img.onerror = () => {
      // Keep the previous art on failed loads; the next valid target can
      // still replace it.
    };
    img.src = debouncedSplitArtUrl;
    if (img.complete && img.naturalWidth > 0) {
      commitIfCurrent();
    }

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [debouncedSplitArtUrl, displayedSplitArtUrl]);

  // Defer width/opacity transitions until after the first paint so
  // mounting in split or full layout does not animate from a default.
  const [splitLayoutTransitionReady, setSplitLayoutTransitionReady] =
    useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSplitLayoutTransitionReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Defer marquee until the first layout frame so split/full width is real
  // (not a 0-width flash). Width changes are handled by ScrollingText's
  // ResizeObserver — no timed marquee cooldowns.
  const modernScrollingMarqueeAllowed =
    !isModernUi || splitLayoutTransitionReady;

  const menuLabelLayoutKey = showSplitMenuArt ? "split" : "full";

  const menuChrome = (
    <>
      {/* Title bar
       *
       * Modern (nano 6G/7G + iPod classic 6G silver header):
       *   - Slim 16px silver strip, 12px semibold black text.
       *   - Title left-aligned with 6px padding to match the menu
       *     row text indent (`MenuListItem` uses `pl-1.5 pr-2`).
       *   - Status icons (play/pause + battery) clustered on the right.
       *   - Clamped to the LEFT HALF of the screen in split menu mode
       *     so the album art column extends to the very top edge.
       *
       * Classic (1st-gen LCD): unchanged — Chicago glyphs centered with
       *   play indicator on the left and battery on the right. */}
      <div
        className={cn(
          // Above menu / now-playing content (z-10) so the blue selection
          // highlight cannot paint over the titlebar hairline. The parent
          // panel stays z-10, so full-bleed video (sibling z-20) still
          // stacks over this chrome when playing.
          "shrink-0 py-0 flex items-center sticky top-0 z-20",
          isModernUi
            ? "ipod-modern-titlebar text-black font-ipod-modern-ui font-semibold pl-1.5 pr-1.5 gap-1.5"
            : "h-6 min-h-6 px-2 border-b border-[#0a3667] font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]",
        )}
        style={
          isModernUi
            ? {
                height: MODERN_TITLEBAR_HEIGHT,
                minHeight: MODERN_TITLEBAR_HEIGHT,
              }
            : undefined
        }
      >
        {!isModernUi && (
          <div
            className={cn(
              "flex items-center justify-start",
              `w-6 font-chicago ${isPlaying ? "text-xs" : "text-[18px]"}`
            )}
          >
            <div className="flex items-center justify-center size-4 mt-0.5">
              {isPlaying ? "▶" : "⏸︎"}
            </div>
          </div>
        )}
        <ScrollingText
          text={titlebarTitle}
          isPlaying
          scrollStartDelaySec={1}
          fadeEdges={isModernUi}
          allowMarquee={modernScrollingMarqueeAllowed}
          // ScrollingText defaults align to "center", which forces
          // `justify-center` and overrides any `text-left` class. The
          // modern titlebar wants the title hard-aligned to the left
          // (matching the iPod nano 6G/7G "iPod" / "Now Playing"
          // header in the reference photo); the classic skin keeps
          // its centered Chicago glyphs.
          align={isModernUi ? "left" : "center"}
          className={cn(
            "flex-1 min-w-0 leading-none",
            isModernUi
              ? cn(
                  // Slimmer 12px header type matches the iPod 6G/7G photo
                  // we were referenced to — one full pixel above the
                  // 11px Helvetica Neue used by iOS 6 status bars but
                  // still well under the 15px MyriadPro list rows so the
                  // header reads as secondary chrome.
                  "text-[12px] font-semibold",
                  "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]"
                )
              : "px-1"
          )}
        />
        {isModernUi && menuMode && appleMusicMenuTitlebarLoading ? (
          <ActivityIndicator
            size={12}
            className="shrink-0 text-[#636567] [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]"
          />
        ) : null}
        <div
          className={cn(
            "flex items-center justify-end",
            isModernUi ? "shrink-0 gap-1" : "w-6"
          )}
        >
          {isModernUi && (
            // Play/pause status glyph painted with the same top-to-
            // bottom blue gradient as the row-selection highlight,
            // matching the iOS 6 / iPod nano 6G "tinted" status-bar
            // look. Inline SVG with an embedded gradient so it stays
            // a single sharp shape on any DPI. Sized at 14px to
            // dominate the titlebar (visually matches the title
            // type x-height + ascender).
            //
            // `translateY(-0.5px)` nudges the glyph up half a pixel
            // to compensate for the titlebar's 1px inset bottom
            // hairline + the icon's own downward
            // `drop-shadow(0 1px 0 …)`, which together pulled the
            // shape's optical center half a pixel below the titlebar's
            // visible (above-the-hairline) midline. A full pixel
            // overshoots and reads slightly high.
            <div
              className={cn(
                "flex items-center justify-center size-[14px] [transform:translateY(-0.5px)]",
                // Same light top highlight as the title line — title uses
                // [text-shadow:0_1px_0_rgba(255,255,255,0.9)]; SVG paths
                // use filter drop-shadow so the blue gradient reads with
                // identical gloss on the status bar chrome.
                "[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]"
              )}
            >
              <IpodModernPlayPauseIcon playing={isPlaying} size={14} />
            </div>
          )}
          <BatteryIndicator backlightOn={backlightOn} variant={uiVariant} />
        </div>
      </div>

      {/* Content area - z-10 (below the titlebar z-20) when video is not
          showing so list/now-playing paint under the silver header.
          The screen wrapper stays above the z-0 video layer in menu mode
          via the parent panel. Content height subtracts the titlebar
          height so the menu/now-playing area is the same in both skins.
          Width clamps to the LEFT HALF of the screen when the split
          menu Ken Burns art column is showing so the menu list doesn't
          bleed under the album art. */}
      <div
        className={cn(
          "relative",
          !showVideo && "z-10",
          isModernUi && showSplitMenuArt && "bg-white",
          isModernUi && "flex-1 min-h-0"
        )}
        style={
          isModernUi
            ? { height: IPOD_MODERN_MENU_BODY_HEIGHT_PX }
            : {
                height: "calc(100% - 24px)",
              }
        }
      >
        <AnimatePresence initial={false} custom={menuDirection} mode="sync">
          {showInlineCoverFlow ? (
            // Cover Flow inline state — rendered as the third option
            // in the menu panel's AnimatePresence so the existing
            // chrome width transition (the wrapping `ipod-modern-menu-
            // panel` div animates 50%↔100% via `transition-[width]
            // duration-300 ease-in-out` while the split-art column
            // collapses to 0%) carries the user smoothly into and out
            // of Cover Flow — exactly the same motion as menu→now
            // playing. The slot itself is a `<CoverFlow inline />`
            // node supplied by the parent.
            <motion.div
              key="coverflow"
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              custom={menuDirection}
            >
              {coverFlowSlot}
            </motion.div>
          ) : menuMode ? (
            <motion.div
              key={`menu-${menuHistory.length}-${currentMenuTitle}`}
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              custom={menuDirection}
            >
              <div className="flex-1 relative">
                <div
                  ref={setMenuScrollRef}
                  className="absolute inset-0 overflow-y-auto overflow-x-hidden ipod-menu-container"
                  style={
                    isModernUi
                      ? {
                          paddingBottom:
                            menuItemHeight === MENU_ITEM_HEIGHT_MODERN_MEDIA
                              ? MODERN_MEDIA_BODY_SLACK_PX
                              : MODERN_MENU_BODY_SLACK_PX,
                        }
                      : undefined
                  }
                >
                  <div
                    style={{
                      position: "relative",
                      height: currentMenuItems.length * menuItemHeight,
                    }}
                  >
                    {currentMenuItems
                      .slice(visibleRange.start, visibleRange.end)
                      .map((item, i) => {
                        const index = visibleRange.start + i;
                        return (
                          <div
                            key={`${index}:${item.label}:${item.value ?? ""}`}
                            className={cn(
                              "ipod-menu-item",
                              index === selectedMenuItem && "selected"
                            )}
                            style={{
                              position: "absolute",
                              top: index * menuItemHeight,
                              left: 0,
                              right: 0,
                              height: menuItemHeight,
                            }}
                          >
                            <MenuListItem
                              text={item.label}
                              isSelected={index === selectedMenuItem}
                              backlightOn={backlightOn}
                              variant={uiVariant}
                              allowScrollingMarquee={modernScrollingMarqueeAllowed}
                              labelLayoutKey={menuLabelLayoutKey}
                              onClick={() => {
                                onSelectMenuItem(index);
                                onMenuItemAction(item.action);
                              }}
                              showChevron={item.showChevron !== false}
                              value={item.value}
                              isLoading={item.isLoading}
                              mediaRow={isModernUi && currentMenuModernMediaList}
                              subtitle={item.subtitle}
                              thumbnailUrl={item.coverUrl}
                              emptyArtworkKind={item.emptyArtworkKind}
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
                <Scrollbar
                  containerRef={menuScrollRef}
                  backlightOn={backlightOn}
                  menuMode={menuMode}
                  variant={uiVariant}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="nowplaying"
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              custom={menuDirection}
              onClick={() => {
                if (!menuMode && currentTrack) {
                  registerActivity();
                  if (!isPlaying) {
                    if (!showVideo) {
                      onToggleVideo();
                      setTimeout(() => {
                        handlePlay();
                      }, 100);
                    } else {
                      handlePlay();
                    }
                  } else {
                    onToggleVideo();
                  }
                }
              }}
            >
              <div
                className={cn(
                  "flex-1 flex flex-col px-2",
                  isModernUi
                    ? "overflow-x-hidden overflow-y-visible pt-1.5 pb-0.5"
                    : "overflow-visible py-1"
                )}
              >
                {currentTrack && nowPlayingDisplayTrack ? (
                  <>
                    <div
                      className={cn(
                        "flex items-center justify-between gap-2",
                        isModernUi
                          ? "font-ipod-modern-ui text-[12px] font-normal leading-[1.06] text-[rgb(99,101,103)]"
                          : "font-chicago text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]",
                        nowPlayingDisplayTrack.album ? "mb-1" : "mb-1.5"
                      )}
                    >
                      <span>
                        {currentTrack?.appleMusicPlayParams?.stationId
                          ? t("apps.ipod.nowPlaying.live")
                          : isAppleMusicCollectionShell
                            ? t("apps.ipod.nowPlaying.mix")
                            : t("apps.ipod.nowPlaying.trackPosition", {
                                current: currentIndex + 1,
                                total: tracksLength,
                                defaultValue: `${currentIndex + 1} of ${tracksLength}`,
                              })}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {loopCurrent ? (
                          <Shuffle
                            className="shrink-0"
                            size={isModernUi ? 12 : 13}
                            weight="bold"
                            aria-label={t("apps.ipod.menu.repeatOne")}
                          />
                        ) : loopAll ? (
                          <Shuffle
                            className="shrink-0"
                            size={isModernUi ? 12 : 13}
                            weight="bold"
                            aria-label={t("apps.ipod.menu.repeatAll")}
                          />
                        ) : null}
                        {isShuffled && (
                          <Repeat
                            className="shrink-0"
                            size={isModernUi ? 12 : 13}
                            weight="bold"
                            aria-label={t("apps.ipod.ariaLabels.shuffleOn")}
                          />
                        )}
                      </span>
                    </div>
                    {isModernUi ? (
                      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-visible pt-1 pb-0">
                        <ModernNowPlayingArtwork coverUrl={coverUrl} />
                        <div
                          className={cn(
                            "flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-0 overflow-visible text-left [&>*:not(:first-child)]:-mt-px",
                            // Small downward nudge so the first line
                            // doesn't hug the cover's top edge — matches
                            // the iPod nano 6G/7G "Now Playing" baseline.
                            "pt-1",
                            "font-ipod-modern-ui"
                          )}
                        >
                          <ScrollingText
                            text={nowPlayingDisplayTrack.title}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            allowMarquee={modernScrollingMarqueeAllowed}
                            className="leading-[1.06] text-[15px] font-semibold text-black"
                          />
                          <ScrollingText
                            text={nowPlayingDisplayTrack.artist || ""}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            allowMarquee={modernScrollingMarqueeAllowed}
                            className="leading-[1.06] text-[12px] font-normal text-[rgb(99,101,103)]"
                          />
                          {nowPlayingDisplayTrack.album && (
                            <ScrollingText
                              text={nowPlayingDisplayTrack.album}
                              isPlaying={isPlaying}
                              scrollStartDelaySec={1}
                              align="left"
                              fadeEdges
                              allowMarquee={modernScrollingMarqueeAllowed}
                              className="leading-[1.06] text-[12px] font-normal text-[rgb(99,101,103)]"
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex min-h-0 flex-col gap-0 overflow-visible text-center leading-[1.05]",
                          "font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                        )}
                      >
                        <ScrollingText
                          text={nowPlayingDisplayTrack.title}
                          isPlaying={isPlaying}
                          scrollStartDelaySec={1}
                          className="leading-[1.05] py-px"
                        />
                        <ScrollingText
                          text={nowPlayingDisplayTrack.artist || ""}
                          isPlaying={isPlaying}
                          scrollStartDelaySec={1}
                          className="leading-[1.05] py-px"
                        />
                        {nowPlayingDisplayTrack.album && (
                          <ScrollingText
                            text={nowPlayingDisplayTrack.album}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            className="leading-[1.05] py-px"
                          />
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        "mt-auto flex-shrink-0 w-full",
                        nowPlayingDisplayTrack.album ? "pt-1.5" : "pt-3"
                      )}
                    >
                      {isModernUi ? (
                        // Same aqua bar as About This Finder memory rows.
                        <div className="aqua-progress h-[9px] w-full rounded-none">
                          <div
                            className="aqua-progress-fill h-full rounded-none transition-all duration-200 ease-out"
                            style={{
                              width: `${
                                totalTime > 0
                                  ? (elapsedTime / totalTime) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-full h-[8px] rounded-full border border-[#0a3667] overflow-hidden">
                          <div
                            className="h-full bg-[#0a3667]"
                            style={{
                              width: `${
                                totalTime > 0
                                  ? (elapsedTime / totalTime) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      )}
                      <div
                        className={cn(
                          "w-full flex justify-between",
                          isModernUi
                            ? "font-ipod-modern-ui text-[12px] min-h-[14px] leading-[1.06] mt-1 text-[rgb(99,101,103)] font-normal tabular-nums"
                            : "font-chicago text-[16px] h-[22px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                        )}
                      >
                        <span>
                          {formatPlaybackTime(displayElapsedSeconds)}
                        </span>
                        <span>-{formatPlaybackTime(displayRemainingSeconds)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    className={cn(
                      "text-center h-full flex flex-col justify-center items-center",
                      isModernUi
                        ? "font-ipod-modern-ui text-[15px] text-[rgb(99,101,103)]"
                        : "font-geneva-12 text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                    )}
                  >
                    <p>Don&apos;t steal music</p>
                    <p>Ne volez pas la musique</p>
                    <p>Bitte keine Musik stehlen</p>
                    <p>音楽を盗用しないでください</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Letter chip overlay — painted on top of the menu rows when
         *  the user is fast-scrolling through an alphabetic menu
         *  (Artists / Albums). Mirrors classic iPod behavior: every
         *  rotation jumps to the next letter group and the letter
         *  the user just landed on appears in a small rounded chip
         *  centered on the menu. Cleared by `useIpodLogic` after a
         *  brief idle. */}
        <AnimatePresence>
          {menuMode && fastScrollLetter ? (
            <motion.div
              key="fast-scroll-letter"
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              aria-hidden
            >
              <div
                className={cn(
                  "grid place-items-center leading-none select-none",
                  isModernUi
                    ? "text-white font-ipod-modern-ui font-semibold"
                    : "text-[#e6f1fa] font-chicago"
                )}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background:
                    "linear-gradient(to bottom, rgba(42,42,42,0.95), rgba(0,0,0,0.9))",
                  fontSize: 20,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  textShadow: isModernUi
                    ? "0 1px 2px rgba(0,0,0,0.45)"
                    : "1px 1px 0 rgba(0,0,0,0.25)",
                  boxShadow: isModernUi
                    ? "0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.04)"
                    : "0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <span style={{ transform: "translateY(0.75px)" }}>
                  {fastScrollLetter}
                </span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );


  return (
    <div
      className={cn(
        "relative w-full border border-black border-2 rounded-[2px] overflow-hidden transition-all duration-500 select-none no-select-all",
        // The classic LCD filter scan-lines/flicker overlay only makes
        // sense for the monochrome 1st-gen LCD look. The modern iOS 6
        // skin is rendered on a Retina-style high-DPI display, so we
        // skip the CRT-style filter even when the underlying setting
        // is enabled.
        lcdFilterOn && !isModernUi ? "lcd-screen" : "",
        isModernUi
          ? // White table surface; avoid neutral chassis fills—they read as
            // gray stripes under the virtualized list and in empty space.
            cn(
              "ipod-modern-screen bg-white",
              !backlightOn && "ipod-modern-backlight-off"
            )
          : backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn &&
          backlightOn &&
          !isModernUi &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
      style={{
        minWidth: "100%",
        height: IPOD_MODERN_SCREEN_HEIGHT_PX,
        minHeight: IPOD_MODERN_SCREEN_HEIGHT_PX,
        maxWidth: "100%",
        maxHeight: IPOD_MODERN_SCREEN_HEIGHT_PX,
        position: "relative",
        contain: "layout style paint",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* LCD screen overlay with scan lines (classic skin only) */}
      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-scan-lines"></div>
      )}

      {/* Glass reflection effect (classic skin only) */}
      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-reflection"></div>
      )}

      {/* Video & Lyrics Overlay
       *
       * When Cover Flow is open inline (modern UI), demote this overlay
       * out of the way so the inline carousel inside the menu panel
       * (z-10) is no longer occluded. We drop z-index back to z-0 and
       * fade opacity to 0 — same shape as menu mode — so audio keeps
       * playing while the user browses Cover Flow. As soon as Cover
       * Flow is dismissed, the overlay fades back over the carousel
       * and video resumes its painted frame. */}
      {currentTrack && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 overflow-hidden",
            menuMode || isCoverFlowOpen ? "z-0" : "z-20",
            menuMode || !showVideo || isCoverFlowOpen
              ? "opacity-0 pointer-events-none"
              : "opacity-100"
          )}
        >
          <div
            className="w-full h-[calc(100%+300px)]"
            style={{ marginTop: -IPOD_MODERN_SCREEN_HEIGHT_PX }}
            onClick={(e) => {
              e.stopPropagation();
              registerActivity();
              if (!isPlaying) {
                if (!showVideo) {
                  onToggleVideo();
                  setTimeout(() => {
                    handlePlay();
                  }, 100);
                } else {
                  handlePlay();
                }
              } else {
                onToggleVideo();
              }
            }}
          >
            {/* Player — swaps between YouTube (ReactPlayer) and Apple Music
                (MusicKit bridge) based on the active track's source. The
                YouTube embed is hidden when display mode is not Video, but
                still provides audio. */}
            {isAppleMusicTrack ? (
              <AppleMusicPlayerBridge
                ref={playerRef as unknown as React.RefObject<never>}
                currentTrack={currentTrack}
                playing={isPlaying && !isFullScreen}
                resumeAtSeconds={elapsedTime}
                volume={finalIpodVolume}
                onProgress={!isFullScreen ? handleProgress : undefined}
                onDuration={!isFullScreen ? handleDuration : undefined}
                onPlay={!isFullScreen ? handlePlay : undefined}
                onPause={!isFullScreen ? handlePause : undefined}
                onEnded={!isFullScreen ? handleTrackEnd : undefined}
                onReady={!isFullScreen ? handleReady : undefined}
                onNowPlayingItemChange={setAppleMusicKitNowPlaying}
              />
            ) : (
              <div
                className="size-full"
                style={
                  effectiveDisplayMode !== DisplayMode.Video
                    ? { visibility: "hidden", pointerEvents: "none" }
                    : undefined
                }
              >
                <ReactPlayer
                  ref={playerRef}
                  url={currentTrack.url}
                  playing={isPlaying}
                  controls={
                    showVideo && effectiveDisplayMode === DisplayMode.Video
                  }
                  width="100%"
                  height="100%"
                  onEnded={!isFullScreen ? handleTrackEnd : undefined}
                  onProgress={!isFullScreen ? handleProgress : undefined}
                  onDuration={!isFullScreen ? handleDuration : undefined}
                  onPlay={!isFullScreen ? handlePlay : undefined}
                  onPause={!isFullScreen ? handlePause : undefined}
                  onReady={!isFullScreen ? handleReady : undefined}
                  loop={loopCurrent}
                  volume={finalIpodVolume}
                  playsinline={true}
                  progressInterval={PLAYER_PROGRESS_INTERVAL_MS}
                  config={{
                    youtube: {
                      playerVars: {
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0,
                        iv_load_policy: 3,
                        fs: 0,
                        disablekb: 1,
                        playsinline: 1,
                        enablejsapi: 1,
                        origin: window.location.origin,
                      },
                      embedOptions: {
                        referrerPolicy: "strict-origin-when-cross-origin",
                      },
                    },
                  }}
                />
              </div>
            )}

            {/* Landscape video background */}
            {effectiveDisplayMode === DisplayMode.Landscapes && shouldAnimateVisuals && (
              <LandscapeVideoBackground
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Warp shader background */}
            {effectiveDisplayMode === DisplayMode.Shader && shouldAnimateVisuals && (
              <AmbientBackground
                coverUrl={coverUrl}
                variant="warp"
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Mesh gradient background */}
            {effectiveDisplayMode === DisplayMode.Mesh && shouldAnimateVisuals && (
              <MeshGradientBackground
                coverUrl={coverUrl}
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Water shader background */}
            {effectiveDisplayMode === DisplayMode.Water && shouldAnimateVisuals && (
              <WaterBackground
                coverUrl={coverUrl}
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Dark overlay when lyrics are shown */}
            {showVideo && shouldShowLyrics && (
              <div className="absolute inset-0 bg-black/30 z-25" />
            )}
            {/* Cover overlay: shows when paused (any mode) or in Cover mode.
                Apple Music still gets animated visualizers in non-cover modes. */}
            <AnimatePresence>
              {showVideo &&
                coverUrl &&
                (effectiveDisplayMode === DisplayMode.Cover || !isPlaying) && (
                <motion.div
                  className="absolute inset-0 z-15"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlay();
                  }}
                >
                  {/* Single opacity animation (wrapper only) — nesting motion.img hid the overlay twice */}
                  <img
                    src={coverUrl}
                    alt={currentTrack?.title}
                    className="size-full object-cover brightness-50 pointer-events-none"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            {/* Transparent overlay to capture clicks */}
            {showVideo && (
              <div
                className="absolute inset-0 z-30"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isPlaying) {
                    handlePlay();
                  } else {
                    onToggleVideo();
                  }
                }}
              />
            )}
            {/* Status Display */}
            <AnimatePresence>
              {statusMessage && (
                <motion.div
                  className="absolute inset-0 z-40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <StatusDisplay message={statusMessage} variant={uiVariant} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Activity Indicator */}
            <AnimatePresence>
              {isAnyActivityActive && (
                <motion.div
                  className="absolute top-4 right-4 z-40 pointer-events-none"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <ActivityIndicatorWithLabel
                    size="md"
                    state={activityState}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lyrics Overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 35 }}>
            <LyricsDisplay
              lines={lyricsControls.lines}
              originalLines={lyricsControls.originalLines}
              currentLine={lyricsControls.currentLine}
              isLoading={lyricsControls.isLoading}
              error={lyricsControls.error}
              visible={shouldShowLyrics}
              videoVisible={showVideo}
              alignment={lyricsAlignment}
              koreanDisplay={koreanDisplay}
              japaneseFurigana={japaneseFurigana}
              isTranslating={lyricsControls.isTranslating}
              onAdjustOffset={(deltaMs) => {
                adjustLyricOffset(deltaMs);
                const newOffset = lyricOffset + deltaMs;
                const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                showStatusCallback(
                  `${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`
                );
                const updatedTime = elapsedTime + newOffset / 1000;
                lyricsControls.updateCurrentTimeManually(updatedTime);
              }}
              onSwipeUp={onNextTrack}
              onSwipeDown={onPreviousTrack}
              furiganaMap={furiganaMap}
              soramimiMap={soramimiMap}
              currentTimeMs={(elapsedTime + lyricOffset / 1000) * 1000}
              coverUrl={coverUrl}
            />
            </div>
          </div>
        </div>
      )}

      {/* Full-height Ken Burns album art panel covering the right half
       *  of the screen when the modern UI is in split menu mode.
       *  Rendered as an absolutely-positioned overlay so it can extend
       *  from the very top of the screen (over where the titlebar would
       *  otherwise sit) all the way to the bottom — matching the iPod
       *  classic 6G/7G "Music + Now Playing" reference photo where the
       *  album art has no titlebar above it. The titlebar + menu below
       *  are clamped to the left half so they don't bleed underneath.
       *  AnimatePresence cross-fades after the debounced selection cover
       *  has loaded, keeping the previous cover visible during fetches. */}
      {/* Right-half artwork: width animates 0% <-> 50% in sync with the
       *  menu chrome so entering/leaving split view feels smooth.
       *  Kept mounted for EVERY modern UI frame (not gated on
       *  `menuMode`) so collapsing to full-width AND collapsing to
       *  now-playing both run the same exit transition — the image
       *  fades off while the panel's solid-black backface stays put
       *  through the 300ms window, exactly like menu → Cover Flow. */}
      {isModernUi && (
        <div
          className={cn(
            // Outer container: width animates 50% ↔ 0% in lock-step with
            // the menu panel's 50% ↔ 100% width animation. We do NOT
            // fade the container's own opacity — the panel's solid-black
            // background must remain visible as the cover image fades
            // off so it reads as a true "black backface" peeking out
            // from under the covers (instead of letting the white
            // screen leak through a half-faded panel).
            "ipod-modern-split-art absolute top-0 right-0 bottom-0 z-[5] overflow-hidden",
            splitLayoutTransitionReady &&
              `transition-[width] ${SPLIT_LAYOUT_TRANSITION_TIMING}`
          )}
          style={{
            width: showSplitMenuArt ? MODERN_SPLIT_HALF : "0%",
          }}
          aria-hidden
        >
          {/* Cover art layer: fades on its OWN opacity track, leaving
           *  the parent panel at full opacity. When `showSplitMenuArt`
           *  flips off, the image fades to 0 over the same 300ms
           *  window as the width transition — revealing the solid
           *  black backface beneath before the column clips away.
           *
           *  We render against `displayedSplitArtUrl`, which only changes
           *  after the debounced target image has loaded. That lets
           *  AnimatePresence cross-fade loaded bitmap to loaded bitmap
           *  instead of fading the old cover to black while the next one
           *  is still in flight. */}
          <div
            className={cn(
              "absolute inset-0",
              splitLayoutTransitionReady &&
                `transition-opacity ${SPLIT_LAYOUT_TRANSITION_TIMING}`
            )}
            style={{ opacity: showSplitMenuArt ? 1 : 0 }}
          >
            {displayedSplitArtUrl ? (
              <AnimatePresence initial={false} mode="sync">
                <motion.img
                  key={displayedSplitArtUrl}
                  src={displayedSplitArtUrl}
                  alt=""
                  draggable={false}
                  className="ipod-modern-split-art-img absolute inset-0 size-full object-cover select-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: SPLIT_ART_CROSSFADE_SECONDS,
                    ease: "easeInOut",
                  }}
                />
              </AnimatePresence>
            ) : null}
          </div>
        </div>
      )}
      {isModernUi ? (
        <div
          className={cn(
            // `ipod-modern-menu-panel` is kept mounted on every modern
            // UI frame (not gated on `showSplitMenuArt`) so its
            // box-shadow can transition smoothly. The `.is-split`
            // modifier fades the shadow alphas in/out as the menu
            // animates 50%↔100%, in lock-step with the width transition
            // below. The split-art column to the right meanwhile fades
            // its cover image off, revealing the panel's solid-black
            // backface (see `.ipod-modern-split-art`).
            "relative flex min-h-0 flex-col overflow-hidden z-10 h-full ipod-modern-menu-panel",
            showSplitMenuArt && "is-split",
            splitLayoutTransitionReady &&
              `transition-[width,box-shadow] ${SPLIT_LAYOUT_TRANSITION_TIMING}`
          )}
          // `showSplitMenuArt` already implies `menuMode` (see its
          // definition above), so the `menuMode ?` ternary collapses:
          // both !menuMode and (menuMode && !showSplitMenuArt) want
          // 100%, only showSplitMenuArt wants the split half.
          style={{
            width: showSplitMenuArt ? MODERN_SPLIT_HALF : "100%",
          }}
        >
          {menuChrome}
        </div>
      ) : (
        // Classic skin: keep menu/now-playing chrome in a z-10 stacking
        // context so the full-bleed video + lyrics overlay (sibling z-20)
        // paints over the titlebar during playback — same layering as the
        // modern `ipod-modern-menu-panel` wrapper above.
        <div className="relative z-10 h-full flex flex-col min-h-0">
          {menuChrome}
        </div>
      )}

    </div>
  );
}
