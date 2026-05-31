import {
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useReducer,
} from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { getAlbumGroupingKey } from "../../constants";
import type { Track } from "@/stores/useIpodStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { Play, Pause, VinylRecord } from "@phosphor-icons/react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useEventListener } from "@/hooks/useEventListener";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  BatteryIndicator,
  IpodModernPlayPauseIcon,
  ScrollingText,
} from "../screen";
import { LONG_PRESS_DELAY, MODERN_TITLEBAR_HEIGHT } from "./constants";
import { coverFlowUiReducer } from "./coverFlowUiReducer";
import type { CoverFlowComponentProps, CoverFlowItem } from "./types";
import { getCoverSizeCqmin, resolveCoverUrl } from "./utils";
import { AquaShineOverlay } from "./AquaShineOverlay";
import { AlbumFlipFaces } from "./AlbumFlipFaces";
import { CoverImage } from "./CoverImage";

export function CoverFlow({
  ref,
  tracks,
  currentIndex,
  onSelectTrack,
  onExit,
  onRotation,
  isVisible,
  ipodMode = true,
  isPlaying = false,
  onTogglePlay,
  onPlayTrackInPlace,
  groupAppleMusicAlbums = false,
  inline = false,
}: CoverFlowComponentProps) {
  const { t } = useTranslation();
  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");
  const unknownAlbumLabel = t("apps.ipod.menuItems.unknownAlbum");
  const coverItems = useMemo<CoverFlowItem[]>(() => {
    if (!groupAppleMusicAlbums) {
      return tracks.map((track, index) => ({
        key: track.id,
        track,
        trackIndex: index,
        trackIndices: [index],
        title: track.title,
        artist: track.artist,
      }));
    }

    const grouped = new Map<string, CoverFlowItem>();
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      const artist = track.albumArtist || track.artist || unknownArtistLabel;
      const album = track.album || unknownAlbumLabel;
      const key = getAlbumGroupingKey(
        track,
        unknownAlbumLabel,
        unknownArtistLabel
      );
      const existing = grouped.get(key);
      if (existing) {
        existing.trackIndices.push(index);
      } else {
        grouped.set(key, {
          key,
          track,
          trackIndex: index,
          trackIndices: [index],
          title: album,
          artist,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const artistCompare = (a.artist ?? "").localeCompare(b.artist ?? "", undefined, {
        sensitivity: "base",
      });
      if (artistCompare !== 0) return artistCompare;
      return a.title.localeCompare(b.title, undefined, {
        sensitivity: "base",
      });
    });
  }, [tracks, groupAppleMusicAlbums, unknownArtistLabel, unknownAlbumLabel]);

  const currentCoverIndex = useMemo(() => {
    const index = coverItems.findIndex((item) =>
      item.trackIndices.includes(currentIndex)
    );
    return index >= 0 ? index : Math.min(currentIndex, coverItems.length - 1);
  }, [coverItems, currentIndex]);

  const [uiState, dispatch] = useReducer(coverFlowUiReducer, {
    selectedIndex: currentCoverIndex,
    showCD: false,
    isFlipped: false,
    isFlipAnimating: false,
    selectedTrackInAlbum: 0,
  });
  const {
    selectedIndex,
    showCD,
    isFlipped,
    isFlipAnimating,
    selectedTrackInAlbum,
  } = uiState;
  const setSelectedIndex = useCallback(
    (value: number | ((prev: number) => number)) => {
      dispatch({ type: "setSelectedIndex", value });
    },
    []
  );
  const setShowCD = useCallback((value: boolean) => {
    dispatch({ type: "setShowCD", value });
  }, []);
  // When the user presses the wheel center on an album cover, the
  // cover flips over to reveal that album's tracklist. The flip is
  // album-scoped: navigating to a different cover snaps back to the
  // un-flipped state (matches the iPod nano/classic 6G behavior).
  // True while the album-flip overlay is mid-rotation (in either
  // direction). Lets us keep the underlying carousel center sleeve
  // hidden for the full back-flip duration so the reverse animation
  // actually shows the tracklist rotating away — without this the
  // sleeve pops back to visible the instant Menu is pressed and the
  // reverse rotation reads as "the tracklist just disappeared". Same
  // pattern the dashboard widget flip uses (`WidgetChrome.tsx`).
  const setIsFlipped = useCallback((value: boolean) => {
    dispatch({ type: "setIsFlipped", value });
  }, []);
  const setIsFlipAnimating = useCallback((value: boolean) => {
    dispatch({ type: "setIsFlipAnimating", value });
  }, []);
  const flipAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // Track the previous `isFlipped` value so the animation-window
  // effect below can detect *real* transitions (true↔false) rather
  // than relying on a "skip first run" ref. The ref pattern breaks
  // in React 18 StrictMode dev where effects unmount + re-mount,
  // causing the second run to fire setIsFlipAnimating(true) on the
  // initial mount — which then hid the center sleeve for 600ms even
  // though the user never flipped (read as: "center cover shows up
  // with a delay when opening Cover Flow"). Comparing against the
  // previous value is StrictMode-safe: a no-op transition (false →
  // false) returns early on every effect run.
  const prevFlippedRef = useRef(isFlipped);
  // Selected row inside the tracklist while flipped. Reset whenever
  // the active album changes so wheel rotation always starts at the
  // currently-playing track (or the first track if none of this album
  // is playing).
  const setSelectedTrackInAlbum = useCallback(
    (value: number | ((prev: number) => number)) => {
      dispatch({ type: "setSelectedTrackInAlbum", value });
    },
    []
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const { isMacOSTheme: isMacTheme } = useThemeFlags();
  const uiVariant = useIpodStore((s) => s.uiVariant);
  const isModernIpodCoverFlow = ipodMode && uiVariant === "modern";

  // Track swipe state
  const swipeStartX = useRef<number | null>(null);
  const lastMoveX = useRef<number | null>(null);
  const isPanningRef = useRef(false);
  
  // Long press handling for exit
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const startLongPress = useCallback(() => {
    clearLongPress();
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onExit();
    }, LONG_PRESS_DELAY);
  }, [onExit, clearLongPress]);

  const endLongPress = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  // Reset selected index when opening
  useEffect(() => {
    if (isVisible) {
      setSelectedIndex(currentCoverIndex);
    }
  }, [isVisible, currentCoverIndex]);

  // When Cover Flow closes, snap the flip back to the carousel side
  // so re-opening lands the user on the album row rather than
  // momentarily flashing the previous album's tracklist as the open
  // animation runs.
  useEffect(() => {
    if (!isVisible) {
      setIsFlipped(false);
    }
  }, [isVisible]);

  // Navigating to a different album cover collapses any open
  // tracklist back to the carousel face. Without this, scrolling
  // through albums while flipped would either swap tracklists under
  // the user's selection or strand the highlight on a row that no
  // longer corresponds to the visible album.
  useEffect(() => {
    setIsFlipped(false);
  }, [selectedIndex]);

  // Track flip-animation duration so the carousel sleeve stays
  // hidden for the entire forward + reverse rotation. Only fires
  // when `isFlipped` actually changes (compared against the previous
  // value via a ref) so it's a no-op on the initial mount even when
  // StrictMode dev double-invokes effects.
  useEffect(() => {
    if (prevFlippedRef.current === isFlipped) return;
    prevFlippedRef.current = isFlipped;
    setIsFlipAnimating(true);
    if (flipAnimationTimerRef.current) {
      clearTimeout(flipAnimationTimerRef.current);
    }
    flipAnimationTimerRef.current = setTimeout(() => {
      setIsFlipAnimating(false);
    }, 600);
    return () => {
      if (flipAnimationTimerRef.current) {
        clearTimeout(flipAnimationTimerRef.current);
      }
    };
  }, [isFlipped]);

  // Compute the current cover item + its tracklist (in browsableTracks
  // order). For un-grouped covers (one cover per song) this is just a
  // single-item list, which we never actually flip into — we keep the
  // existing "tap plays the song" shortcut for that case.
  const currentItem = coverItems[selectedIndex];
  const albumTracks = useMemo<Track[]>(() => {
    if (!currentItem) return [];
    return currentItem.trackIndices.reduce<Track[]>((acc, index) => {
      const track = tracks[index];
      if (track) {
        acc.push(track);
      }
      return acc;
    }, []);
  }, [currentItem, tracks]);

  // Default the tracklist highlight to the currently-playing song
  // inside this album (so flipping while a track from this album is
  // playing puts the highlight on it). Falls back to the first row.
  useEffect(() => {
    if (!currentItem) {
      setSelectedTrackInAlbum(0);
      return;
    }
    const playingPos = currentItem.trackIndices.findIndex(
      (idx) => idx === currentIndex
    );
    setSelectedTrackInAlbum(playingPos >= 0 ? playingPos : 0);
  }, [currentItem, currentIndex]);

  // Navigate to next/previous
  const navigateNext = useCallback(() => {
    if (isFlipped) {
      setSelectedTrackInAlbum((prev) =>
        Math.min(albumTracks.length - 1, prev + 1)
      );
      onRotation();
      return;
    }
    setSelectedIndex((prev) => {
      const next = Math.min(coverItems.length - 1, prev + 1);
      return next;
    });
    setShowCD(false); // Hide CD when navigating
    onRotation();
  }, [isFlipped, albumTracks.length, coverItems.length, onRotation]);

  const navigatePrevious = useCallback(() => {
    if (isFlipped) {
      setSelectedTrackInAlbum((prev) => Math.max(0, prev - 1));
      onRotation();
      return;
    }
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1);
      return next;
    });
    setShowCD(false); // Hide CD when navigating
    onRotation();
  }, [isFlipped, onRotation]);

  // Select the current item.
  //   Un-flipped + album-grouped (Apple Music) → flip to reveal the
  //     album's tracklist on the cover's back face.
  //   Un-flipped + per-track covers (e.g. ungrouped YouTube) → play
  //     the song directly. The flip-into-tracklist gesture only
  //     makes sense when the cover represents an album that contains
  //     multiple tracks; for one-cover-per-song libraries we keep
  //     the original "tap plays" shortcut.
  //   Flipped → play the highlighted row in the album.
  const selectCurrent = useCallback(() => {
    const item = coverItems[selectedIndex];
    if (!item) return;
    if (isFlipped) {
      const trackIndex =
        item.trackIndices[selectedTrackInAlbum] ?? item.trackIndex;
      onSelectTrack(trackIndex);
      return;
    }
    if (groupAppleMusicAlbums) {
      setShowCD(false);
      setIsFlipped(true);
      return;
    }
    onSelectTrack(item.trackIndex);
  }, [
    coverItems,
    isFlipped,
    onSelectTrack,
    selectedIndex,
    selectedTrackInAlbum,
    groupAppleMusicAlbums,
  ]);

  // Wheel `Menu` press: when flipped we eat the press to flip back to
  // the carousel; otherwise we let the caller exit Cover Flow.
  const handleMenuButton = useCallback(() => {
    if (isFlipped) {
      setIsFlipped(false);
      return true;
    }
    return false;
  }, [isFlipped]);

  // Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      navigateNext,
      navigatePrevious,
      selectCurrent,
      handleMenuButton,
    }),
    [navigateNext, navigatePrevious, selectCurrent, handleMenuButton]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          navigateNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          navigatePrevious();
          break;
        // While flipped, the wheel rotation maps to row navigation in
        // the tracklist — arrow up/down should follow the same
        // mapping for keyboard users so they can step through songs.
        // Up/Down do nothing on the carousel (it's a horizontal-only
        // gesture surface).
        case "ArrowDown":
          if (isFlipped) {
            e.preventDefault();
            navigateNext();
          }
          break;
        case "ArrowUp":
          if (isFlipped) {
            e.preventDefault();
            navigatePrevious();
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          selectCurrent();
          break;
        case "Escape":
          e.preventDefault();
          // Mirrors the Menu wheel button: unflip first if needed,
          // otherwise close Cover Flow entirely.
          if (handleMenuButton()) return;
          onExit();
          break;
      }
    },
    [
      navigateNext,
      navigatePrevious,
      selectCurrent,
      handleMenuButton,
      onExit,
      isFlipped,
    ]
  );

  useEventListener("keydown", handleKeyDown, isVisible ? window : null);

  // Handle swipe/pan gestures
  const handlePanStart = useCallback((_: unknown, info: PanInfo) => {
    swipeStartX.current = info.point.x;
    lastMoveX.current = info.point.x;
    isPanningRef.current = true;
    // Cancel long press when drag starts
    clearLongPress();
  }, [clearLongPress]);

  const handlePan = useCallback((_: unknown, info: PanInfo) => {
    if (lastMoveX.current === null) return;
    
    // Cancel long press on any pan movement
    clearLongPress();
    
    const deltaX = info.point.x - lastMoveX.current;
    const threshold = 20; // Pixels to move before triggering navigation
    
    if (Math.abs(deltaX) > threshold) {
      if (deltaX < 0) {
        navigateNext();
      } else {
        navigatePrevious();
      }
      lastMoveX.current = info.point.x;
    }
  }, [navigateNext, navigatePrevious, clearLongPress]);

  const handlePanEnd = useCallback(() => {
    swipeStartX.current = null;
    lastMoveX.current = null;
    // Reset panning flag after a short delay to allow click event to check it
    setTimeout(() => {
      isPanningRef.current = false;
    }, 50);
  }, []);

  // Handle wheel scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaX > 20 || e.deltaY > 20) {
      navigateNext();
    } else if (e.deltaX < -20 || e.deltaY < -20) {
      navigatePrevious();
    }
  }, [navigateNext, navigatePrevious]);

  // Get visible covers (optimize rendering)
  const getVisibleCovers = () => {
    const visibleRange = 3; // Show 3 covers on each side
    const covers: { item: CoverFlowItem; index: number; position: number }[] = [];
    
    for (let i = Math.max(0, selectedIndex - visibleRange); i <= Math.min(coverItems.length - 1, selectedIndex + visibleRange); i++) {
      covers.push({
        item: coverItems[i],
        index: i,
        position: i - selectedIndex,
      });
    }
    
    // Sort by z-index (center last so it renders on top)
    return covers.sort((a, b) => Math.abs(b.position) - Math.abs(a.position));
  };
  
  const visibleCovers = getVisibleCovers();

  // Geometry shared by the carousel + the album-flip overlay so the
  // overlay's front face perfectly matches the size of the carousel
  // center cover (the flip then reads as the cover itself rotating
  // away to reveal the tracklist on its back).
  const flipCoverSizeCqmin = getCoverSizeCqmin(
    ipodMode,
    isModernIpodCoverFlow
  );
  const flipCoverUrl = useMemo(
    () => resolveCoverUrl(currentItem?.track ?? null, ipodMode),
    [currentItem, ipodMode]
  );

  const playItemInPlace = useCallback(
    (coverIndex: number) => {
      const item = coverItems[coverIndex];
      if (item) onPlayTrackInPlace?.(item.trackIndex);
    },
    [coverItems, onPlayTrackInPlace]
  );

  // Click on a row inside the album tracklist: route through the
  // standard select handler so the song starts playing and Cover Flow
  // exits back to Now Playing — same UX as picking a song from the
  // All Songs menu list.
  const handleSelectAlbumTrack = useCallback(
    (indexInAlbum: number) => {
      if (!currentItem) return;
      const trackIndex =
        currentItem.trackIndices[indexInAlbum] ?? currentItem.trackIndex;
      onSelectTrack(trackIndex);
    },
    [currentItem, onSelectTrack]
  );

  // The currently-playing position inside the active album, or -1 if
  // none of this album's tracks are the active song. Drives the small
  // play/pause glyph in the tracklist.
  const playingPositionInAlbum = useMemo(() => {
    if (!currentItem) return -1;
    return currentItem.trackIndices.findIndex((idx) => idx === currentIndex);
  }, [currentItem, currentIndex]);

  // When `inline` is set, this CoverFlow renders inside another
  // animated container (the modern iPod menu panel that owns the
  // width transition). In that mode we skip our own border / bezel /
  // background / status bar and rely on the host panel's chrome.
  if (inline) {
    return (
      <div
        className={cn(
          "relative w-full h-full overflow-hidden",
          isModernIpodCoverFlow ? "bg-white" : "bg-black",
          ipodMode ? "ipod-force-font" : "karaoke-force-font",
        )}
        style={{ containerType: "size" }}
      >
        {/* Reflective floor — same softer modern-skin gradient. */}
        <div
          className="absolute inset-0"
          style={{
            background: isModernIpodCoverFlow
              ? "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.06) 78%, rgba(0,0,0,0.12) 100%)"
              : "linear-gradient(to bottom, transparent 40%, rgba(38,38,38,0.5) 70%, rgba(64,64,64,0.3) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Gesture-capturing carousel stage (motion.div for framer
            pan/wheel handlers). */}
        <motion.div
          ref={containerRef}
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            showCD || isFlipped
              ? "cursor-default"
              : "cursor-grab active:cursor-grabbing",
          )}
          onPanStart={showCD || isFlipped ? undefined : handlePanStart}
          onPan={showCD || isFlipped ? undefined : handlePan}
          onPanEnd={showCD || isFlipped ? undefined : handlePanEnd}
          onWheel={showCD || isFlipped ? undefined : handleWheel}
          onClick={() => {
            if (isPanningRef.current || longPressFiredRef.current) {
              longPressFiredRef.current = false;
              return;
            }
            if (showCD) {
              setShowCD(false);
              return;
            }
            // While flipped the AlbumTracklist overlay (which sits on
            // top with its own row click handlers) consumes clicks,
            // so this handler typically won't fire. Skip out anyway
            // as a safety so we don't accidentally re-flip on stray
            // bubbled clicks.
            if (isFlipped) return;
            selectCurrent();
          }}
          onMouseDown={
            showCD || isFlipped ? undefined : () => startLongPress()
          }
          onMouseUp={showCD || isFlipped ? undefined : () => endLongPress()}
          onMouseLeave={
            showCD || isFlipped ? undefined : () => endLongPress()
          }
          onTouchStart={
            showCD || isFlipped ? undefined : () => startLongPress()
          }
          onTouchEnd={showCD || isFlipped ? undefined : () => endLongPress()}
          onTouchCancel={
            showCD || isFlipped ? undefined : () => endLongPress()
          }
          style={{
            touchAction: showCD || isFlipped ? "auto" : "none",
            overflow: "visible",
          }}
        >
          <div
            className="relative flex items-center justify-center w-full"
            style={{
              height: ipodMode && isModernIpodCoverFlow ? "76%" : "75%",
              // Pull the carousel up so the covers sit closer to the
              // titlebar instead of being optically centered inside the
              // menu-panel content area. Modern iPod nano/classic 6G
              // photos show the album row riding noticeably higher than
              // mid-screen, with the title/artist row anchored to the
              // bottom — the previous 0% offset left the covers
              // floating low. -8% matches the classic iPod variant and
              // gives a consistent "covers up, label down" feel across
              // skins.
              marginTop: ipodMode ? "-8%" : "-2%",
              perspective: `${(ipodMode ? 65 : 60) * 1.5}cqmin`,
              transformStyle: "preserve-3d",
            }}
          >
            <AnimatePresence mode="popLayout">
              {visibleCovers.map(({ item, position }) => (
                <CoverImage
                  key={item.key}
                  track={item.track}
                  position={position}
                  ipodMode={ipodMode}
                  compactIpodCarousel={isModernIpodCoverFlow}
                  showCD={showCD}
                  isPlaying={isPlaying && selectedIndex === currentCoverIndex}
                  onTogglePlay={onTogglePlay}
                  selectedIndex={selectedIndex}
                  currentIndex={currentCoverIndex}
                  onPlayTrackInPlace={playItemInPlace}
                  hideSleeveAtCenter={(isFlipped || isFlipAnimating) && position === 0}
                  isAlbumViewOpen={isFlipped && position === 0}
                />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Track info — bottom row */}
        <div
          className={cn(
            "absolute left-0 right-0 flex items-center justify-center gap-2 pointer-events-none",
            isModernIpodCoverFlow ? "font-ipod-modern-ui" : "font-geneva-12",
            ipodMode ? "px-2" : "px-6",
          )}
          style={{
            bottom:
              ipodMode && isModernIpodCoverFlow
                ? "3px"
                : ipodMode
                  ? "6px"
                  : "5cqmin",
          }}
        >
          <div
            className={cn(
              "text-center min-w-0 flex-1",
              isModernIpodCoverFlow
                ? "[&>*]:leading-[1.15]"
                : "[&>*]:leading-tight",
            )}
          >
            <div
              className={cn(
                "truncate",
                isModernIpodCoverFlow
                  ? "text-black text-[12px] font-semibold tracking-tight"
                  : "text-white",
                ipodMode && !isModernIpodCoverFlow && "text-[10px]",
              )}
            >
              {currentItem?.title || t("apps.ipod.coverFlow.noTrack")}
            </div>
            {currentItem?.artist && (
              <div
                className={cn(
                  "truncate",
                  isModernIpodCoverFlow &&
                    "text-[10px] text-[rgb(99,101,103)] tracking-tight",
                  ipodMode &&
                    !isModernIpodCoverFlow &&
                    "text-white/60 text-[8px]",
                )}
              >
                {currentItem.artist}
              </div>
            )}
          </div>
        </div>

        {/* Album-flip overlay (inline branch). Flips the actual album
            cover over to reveal the tracklist on its back face. The
            host menu panel renders the "Cover Flow" titlebar above
            this CoverFlow div, so we don't need a top offset here.
            The static `perspective` wrapper keeps the viewer's POV
            put while the inner motion.div spins (matches the
            dashboard widget flip recipe). */}
        <div
          className="absolute inset-0 z-30 pointer-events-none"
          style={{ perspective: 1500, WebkitPerspective: 1500 }}
        >
          <AnimatePresence>
            {isFlipped && currentItem && (
              <motion.div
                key={`flip-${currentItem.key}`}
                className="absolute inset-0"
                style={{
                  transformStyle: "preserve-3d",
                  WebkitTransformStyle: "preserve-3d",
                  // Pivot around the carousel cover (which sits a few
                  // percent above the visual screen center because of
                  // the carousel's marginTop offset), not the screen
                  // center — so the cover stays put while the card
                  // flips around it instead of arcing in/out.
                  transformOrigin: ipodMode
                    ? "50% 35%"
                    : "50% 47%",
                  pointerEvents: "auto",
                }}
                initial={{ rotateY: 0 }}
                animate={{ rotateY: 180 }}
                exit={{ rotateY: 0 }}
                transition={{ duration: 0.6, ease: [0.42, 0, 0.58, 1] }}
                onClick={() => setIsFlipped(false)}
              >
                <AlbumFlipFaces
                  album={currentItem.title}
                  artist={currentItem.artist}
                  coverUrl={flipCoverUrl}
                  coverSizeCqmin={flipCoverSizeCqmin}
                  tracks={albumTracks}
                  selectedIndex={selectedTrackInAlbum}
                  currentlyPlayingIndex={playingPositionInAlbum}
                  isPlaying={isPlaying}
                  isModern={isModernIpodCoverFlow}
                  ipodMode={ipodMode}
                  onPlayTrack={handleSelectAlbumTrack}
                  onExitFlip={() => setIsFlipped(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={cn(
            "absolute inset-0 z-50 overflow-hidden",
            // Modern UI: white surface to match the rest of the modern
            // skin (Music + Now Playing, settings menus). Classic /
            // karaoke variants keep the original deep-black backdrop.
            isModernIpodCoverFlow ? "bg-white" : "bg-black",
            // Retain the iPod screen's black bezel + rounded corners
            // when Cover Flow is open. The overlay is rendered as a
            // sibling of `IpodScreen` (not a child), so without its
            // own border it would obscure the bezel and the carousel
            // would read as a different frame than every other view.
            // Karaoke Cover Flow opens full-bleed inside its own
            // window chrome and skips the bezel.
            ipodMode && "border border-black border-2 rounded-[2px]",
            ipodMode ? "ipod-force-font" : "karaoke-force-font",
          )}
          style={{ containerType: "size" }}
          initial={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          transition={{ duration: ipodMode ? 0.2 : 0.35, ease: "easeOut" }}
        >
          {/* Reflective floor gradient — softer on the white modern skin so
              it reads as a faint stage shadow under the album row instead
              of a heavy vignette. Classic / karaoke still get the original
              deep gradient that sells the reflective floor against black. */}
          <div
            className="absolute inset-0"
            style={{
              background: isModernIpodCoverFlow
                ? "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.06) 78%, rgba(0,0,0,0.12) 100%)"
                : "linear-gradient(to bottom, transparent 40%, rgba(38,38,38,0.5) 70%, rgba(64,64,64,0.3) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Modern UI status bar — same silver gradient + 12px MyriadPro
              header used by the main menu titlebar so Cover Flow reads as
              another screen of the same UI rather than an overlay. Shows
              the "Cover Flow" label on the left, play/pause status icon
              and battery on the right. Classic / karaoke variants keep
              their full-bleed black backdrop with no status bar. */}
          {isModernIpodCoverFlow && (
            <div
              className={cn(
                "absolute top-0 left-0 right-0 z-20",
                "ipod-modern-titlebar font-ipod-modern-ui font-semibold text-black",
                "flex items-center pl-1.5 pr-1.5 gap-1.5",
              )}
              style={{
                height: MODERN_TITLEBAR_HEIGHT,
                minHeight: MODERN_TITLEBAR_HEIGHT,
              }}
            >
              <ScrollingText
                text={t("apps.ipod.menu.coverFlow")}
                isPlaying
                scrollStartDelaySec={1}
                fadeEdges
                align="left"
                className={cn(
                  "flex-1 min-w-0 leading-none text-[12px] font-semibold",
                  "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]",
                )}
              />
              <div className="flex shrink-0 items-center gap-1">
                <div
                  className={cn(
                    // `translateY(-0.5px)` matches the main IpodScreen
                    // titlebar so the play/pause glyph reads as
                    // optically centered above the 1px bottom hairline
                    // (and isn't pulled low by its own 1px drop-shadow).
                    "flex items-center justify-center w-[14px] h-[14px] [transform:translateY(-0.5px)]",
                    "[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]",
                  )}
                >
                  <IpodModernPlayPauseIcon playing={isPlaying} size={14} />
                </div>
                <BatteryIndicator backlightOn variant="modern" />
              </div>
            </div>
          )}
          
          {/* Cover Flow container */}
          <motion.div
            ref={containerRef}
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              showCD || isFlipped
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing"
            )}
            onPanStart={showCD || isFlipped ? undefined : handlePanStart}
            onPan={showCD || isFlipped ? undefined : handlePan}
            onPanEnd={showCD || isFlipped ? undefined : handlePanEnd}
            onWheel={showCD || isFlipped ? undefined : handleWheel}
            onClick={() => {
              // Don't select if panning or long press was fired
              if (isPanningRef.current || longPressFiredRef.current) {
                longPressFiredRef.current = false;
                return;
              }
              // When CD is shown, clicking outside the disc closes it
              if (showCD) {
                setShowCD(false);
                return;
              }
              // While flipped, the AlbumTracklist overlay above
              // captures clicks. Bail out so this fallback doesn't
              // accidentally re-trigger the flip (or play the
              // currently-highlighted row).
              if (isFlipped) return;
              selectCurrent();
            }}
            onMouseDown={
              showCD || isFlipped ? undefined : () => startLongPress()
            }
            onMouseUp={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            onMouseLeave={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            onTouchStart={
              showCD || isFlipped ? undefined : () => startLongPress()
            }
            onTouchEnd={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            onTouchCancel={
              showCD || isFlipped ? undefined : () => endLongPress()
            }
            style={{
              touchAction: showCD || isFlipped ? "auto" : "none",
              overflow: "visible",
            }}
          >
            {/* Covers - centered with a slight vertical offset so the
                title/artist row at the bottom always has clearance. The
                modern skin also reserves room at the top for the
                status bar, so we shift the carousel down by half the
                status bar height (vs. classic which has no titlebar in
                Cover Flow) to keep it visually centered between the
                two pieces of chrome. */}
            <div 
              className="relative flex items-center justify-center w-full"
              style={{ 
                height: ipodMode && isModernIpodCoverFlow ? "76%" : "75%",
                // Pull the carousel up so the covers ride higher in
                // the iPod screen — matches the inline modern variant
                // and the classic skin. Karaoke (non-iPod) keeps its
                // smaller -2% offset because its viewport is wider and
                // the carousel is already lifted by other padding.
                marginTop: ipodMode ? "-8%" : "-2%",
                perspective: `${(ipodMode ? 65 : 60) * 1.5}cqmin`,
                transformStyle: "preserve-3d",
              }}
            >
              <AnimatePresence mode="popLayout">
                {visibleCovers.map(({ item, position }) => (
                  <CoverImage
                    key={item.key}
                    track={item.track}
                    position={position}
                    ipodMode={ipodMode}
                    compactIpodCarousel={isModernIpodCoverFlow}
                    showCD={showCD}
                    isPlaying={isPlaying && selectedIndex === currentCoverIndex}
                    onTogglePlay={onTogglePlay}
                    selectedIndex={selectedIndex}
                    currentIndex={currentCoverIndex}
                    onPlayTrackInPlace={playItemInPlace}
                    hideSleeveAtCenter={(isFlipped || isFlipAnimating) && position === 0}
                    isAlbumViewOpen={isFlipped && position === 0}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Track info - fixed size for iPod, responsive for Karaoke */}
          <motion.div
            className={cn(
              "absolute left-0 right-0 flex items-center justify-center gap-2",
              isModernIpodCoverFlow ? "font-ipod-modern-ui" : "font-geneva-12",
              ipodMode ? "px-2" : "px-6"
            )}
            style={{
              bottom:
                ipodMode && isModernIpodCoverFlow
                  ? "3px"
                  : ipodMode
                    ? "6px"
                    : "5cqmin",
            }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* Play/Pause Button - hidden in iPod mode */}
            {!ipodMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // If viewing a different track, play it without exiting CoverFlow
                  if (selectedIndex !== currentCoverIndex) {
                    playItemInPlace(selectedIndex);
                  } else {
                    // Same track - just toggle play/pause
                    onTogglePlay?.();
                  }
                }}
                className="relative flex-shrink-0 rounded-full transition-all text-white/80 hover:text-white hover:brightness-110 p-3"
                style={{
                  width: "clamp(40px, 8cqmin, 48px)",
                  height: "clamp(40px, 8cqmin, 48px)",
                  ...(isMacTheme ? {
                    background: "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                  } : {
                    background: "rgba(255, 255, 255, 0.08)",
                  }),
                }}
                title={isPlaying && selectedIndex === currentCoverIndex ? t("apps.ipod.menu.pause") : t("apps.ipod.menu.play")}
              >
                {isMacTheme && <AquaShineOverlay />}
                {isPlaying && selectedIndex === currentCoverIndex ? (
                  <Pause className="w-full h-full relative z-10" weight="fill" />
                ) : (
                  <Play className="w-full h-full relative z-10" weight="fill" />
                )}
              </button>
            )}
            
            {/* Track info — modern skin uses black title / gray artist
                on the white surface. `leading-[1.15]` + no extra
                margin tightens the pair compared to the previous
                `leading-tight` + `mt-[1px]` while still leaving a
                small visible gap between descenders / ascenders.
                Classic / karaoke variants keep the original
                light-on-black look. */}
            <div
              className={cn(
                "text-center min-w-0 flex-1",
                isModernIpodCoverFlow
                  ? "[&>*]:leading-[1.15]"
                  : "[&>*]:leading-tight",
              )}
            >
              <div
                className={cn(
                  "truncate",
                  isModernIpodCoverFlow
                    ? "text-black text-[12px] font-semibold tracking-tight"
                    : "text-white",
                  ipodMode && !isModernIpodCoverFlow && "text-[10px]",
                )}
                style={ipodMode ? undefined : { fontSize: "clamp(14px, 5cqmin, 24px)" }}
              >
                {currentItem?.title || t("apps.ipod.coverFlow.noTrack")}
              </div>
              {currentItem?.artist && (
                <div
                  className={cn(
                    "truncate",
                    isModernIpodCoverFlow
                      ? "text-[10px] text-[rgb(99,101,103)] tracking-tight"
                      : // Classic iPod and karaoke share the same
                        // light-on-black treatment — the parent
                        // backdrop is `bg-black` and the title above
                        // is already `text-white`, so the artist
                        // sits one rung down at 60% white. Without
                        // this, karaoke artist text inherited the
                        // default near-black colour and disappeared
                        // against the black Cover Flow stage.
                        "text-white/60",
                    ipodMode && !isModernIpodCoverFlow && "text-[8px]",
                  )}
                  style={
                    ipodMode ? undefined : { fontSize: "clamp(12px, 4cqmin, 18px)" }
                  }
                >
                  {currentItem.artist}
                </div>
              )}
            </div>
            
            {/* CD Toggle Button - hidden in iPod mode */}
            {!ipodMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCD(!showCD);
                }}
                className={`relative flex-shrink-0 rounded-full transition-all hover:brightness-110 p-3 ${
                  showCD ? "text-white" : "text-white/80 hover:text-white"
                }`}
                style={{
                  width: "clamp(40px, 8cqmin, 48px)",
                  height: "clamp(40px, 8cqmin, 48px)",
                  ...(isMacTheme ? {
                    background: showCD 
                      ? "linear-gradient(to bottom, rgba(80, 80, 80, 0.7), rgba(50, 50, 50, 0.6))"
                      : "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                  } : {
                    background: showCD ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.08)",
                  }),
                }}
                title={showCD ? t("apps.ipod.coverFlow.hideMedia") : t("apps.ipod.coverFlow.showMedia")}
              >
                {isMacTheme && <AquaShineOverlay />}
                <VinylRecord className="w-full h-full relative z-10" weight="fill" />
              </button>
            )}
          </motion.div>

          {/* Album-flip overlay (overlay branch). Sits below the
              modern titlebar (this branch renders the titlebar
              inside CoverFlow, unlike the inline branch where the
              host owns it). Static perspective wrapper keeps the
              viewer's POV put while the inner motion.div rotates. */}
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              top: isModernIpodCoverFlow ? MODERN_TITLEBAR_HEIGHT : 0,
              left: 0,
              right: 0,
              bottom: 0,
              perspective: 1500,
              WebkitPerspective: 1500,
            }}
          >
            <AnimatePresence>
              {isFlipped && currentItem && (
                <motion.div
                  key={`flip-${currentItem.key}`}
                  className="absolute inset-0"
                  style={{
                    transformStyle: "preserve-3d",
                    WebkitTransformStyle: "preserve-3d",
                    // Pivot around the carousel cover (a few percent
                    // above the visual screen center) so the cover
                    // stays put while the card flips around it.
                    transformOrigin: ipodMode
                      ? "50% 35%"
                      : "50% 47%",
                    pointerEvents: "auto",
                  }}
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: 180 }}
                  exit={{ rotateY: 0 }}
                  transition={{ duration: 0.6, ease: [0.42, 0, 0.58, 1] }}
                  onClick={() => setIsFlipped(false)}
                >
                  <AlbumFlipFaces
                    album={currentItem.title}
                    artist={currentItem.artist}
                    coverUrl={flipCoverUrl}
                    coverSizeCqmin={flipCoverSizeCqmin}
                    tracks={albumTracks}
                    selectedIndex={selectedTrackInAlbum}
                    currentlyPlayingIndex={playingPositionInAlbum}
                    isPlaying={isPlaying}
                    isModern={isModernIpodCoverFlow}
                    ipodMode={ipodMode}
                    onPlayTrack={handleSelectAlbumTrack}
                    onExitFlip={() => setIsFlipped(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
