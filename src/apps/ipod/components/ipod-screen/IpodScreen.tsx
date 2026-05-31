import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  useCallback,
} from "react";
import { cn } from "@/lib/utils";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useTranslation } from "react-i18next";
import {
  getYouTubeVideoId,
  formatKugouImageUrl,
  IPOD_MODERN_MENU_BODY_HEIGHT_PX,
  IPOD_MODERN_SCREEN_HEIGHT_PX,
  IPOD_NOW_PLAYING_SONG_MENU_KEY,
} from "../../constants";
import { youtubeThumbnailUrl } from "@/utils/youtubeUrl";
import { DisplayMode } from "@/types/lyrics";
import type { IpodScreenProps } from "../../types";
import { useIpodStore, isAppleMusicCollectionTrack } from "@/stores/useIpodStore";
import {
  MENU_ITEM_HEIGHT_CLASSIC,
  MENU_ITEM_HEIGHT_MODERN,
  MENU_ITEM_HEIGHT_MODERN_MEDIA,
  MODERN_SPLIT_HALF,
  OVERSCAN_ITEMS,
  SPLIT_ART_SELECTION_DEBOUNCE_MS,
  SPLIT_LAYOUT_TRANSITION_TIMING,
} from "./constants";
import {
  menuScrollInitialState,
  menuScrollReducer,
} from "./menuScrollReducer";
import { IpodScreenMenuChrome } from "./IpodScreenMenuChrome";
import { IpodScreenMediaOverlay } from "./IpodScreenMediaOverlay";
import { IpodScreenSplitArtPanel } from "./IpodScreenSplitArtPanel";

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
  
  const isAnyActivityActive = Boolean(
    activityState?.isLoadingLyrics ||
    activityState?.isTranslating ||
    activityState?.isFetchingFurigana ||
    activityState?.isFetchingSoramimi ||
    activityState?.isAddingSong
  );

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
    const youtubeThumbnail = videoId ? youtubeThumbnailUrl(videoId) : null;
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
  }, [menuMode, selectedMenuItem, menuHistory, currentMenuItems, menuItemHeight, fastScrollLetter, setScrollTop]);

  const shouldShowLyrics = showLyrics;

  // ----- Split-menu Ken Burns artwork (selection-driven) -----------
  const isBrowseableMenu = useMemo(
    () =>
      isModernUi &&
      menuMode &&
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

  const [splitLayoutTransitionReady, setSplitLayoutTransitionReady] =
    useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSplitLayoutTransitionReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const modernScrollingMarqueeAllowed =
    !isModernUi || splitLayoutTransitionReady;

  const menuLabelLayoutKey = showSplitMenuArt ? "split" : "full";

  const menuChrome = (
    <IpodScreenMenuChrome
      isModernUi={isModernUi}
      showSplitMenuArt={showSplitMenuArt}
      titlebarTitle={titlebarTitle}
      modernScrollingMarqueeAllowed={modernScrollingMarqueeAllowed}
      isPlaying={isPlaying}
      backlightOn={backlightOn}
      uiVariant={uiVariant}
      menuMode={menuMode}
      appleMusicMenuTitlebarLoading={appleMusicMenuTitlebarLoading}
      showVideo={showVideo}
      showInlineCoverFlow={showInlineCoverFlow}
      menuDirection={menuDirection}
      coverFlowSlot={coverFlowSlot}
      menuHistory={menuHistory}
      currentMenuTitle={currentMenuTitle}
      setMenuScrollRef={setMenuScrollRef}
      menuItemHeight={menuItemHeight}
      currentMenuItems={currentMenuItems}
      visibleRange={visibleRange}
      selectedMenuItem={selectedMenuItem}
      onSelectMenuItem={onSelectMenuItem}
      onMenuItemAction={onMenuItemAction}
      currentMenuModernMediaList={currentMenuModernMediaList}
      menuLabelLayoutKey={menuLabelLayoutKey}
      menuScrollRef={menuScrollRef}
      fastScrollLetter={fastScrollLetter}
      currentTrack={currentTrack}
      nowPlayingDisplayTrack={nowPlayingDisplayTrack}
      isAppleMusicCollectionShell={isAppleMusicCollectionShell}
      tracksLength={tracksLength}
      currentIndex={currentIndex}
      isShuffled={isShuffled}
      loopCurrent={loopCurrent}
      loopAll={loopAll}
      coverUrl={coverUrl}
      elapsedTime={elapsedTime}
      totalTime={totalTime}
      displayElapsedSeconds={displayElapsedSeconds}
      displayRemainingSeconds={displayRemainingSeconds}
      registerActivity={registerActivity}
      handlePlay={handlePlay}
      showVideoProp={showVideo}
      onToggleVideo={onToggleVideo}
      t={t}
    />
  );


  return (
    <div
      className={cn(
        "relative w-full border border-black border-2 rounded-[2px] overflow-hidden transition-all duration-500 select-none no-select-all",
        lcdFilterOn && !isModernUi ? "lcd-screen" : "",
        isModernUi
          ? cn(
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
      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-scan-lines"></div>
      )}

      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-reflection"></div>
      )}

      {currentTrack && (
        <IpodScreenMediaOverlay
          currentTrack={currentTrack}
          menuMode={menuMode}
          isCoverFlowOpen={isCoverFlowOpen}
          showVideo={showVideo}
          isPlaying={isPlaying}
          isFullScreen={isFullScreen}
          isAppleMusicTrack={Boolean(isAppleMusicTrack)}
          effectiveDisplayMode={effectiveDisplayMode}
          shouldAnimateVisuals={shouldAnimateVisuals}
          coverUrl={coverUrl}
          shouldShowLyrics={shouldShowLyrics}
          finalIpodVolume={finalIpodVolume}
          elapsedTime={elapsedTime}
          lyricOffset={lyricOffset}
          statusMessage={statusMessage}
          isAnyActivityActive={isAnyActivityActive}
          activityState={activityState}
          uiVariant={uiVariant}
          playerRef={playerRef}
          handleTrackEnd={handleTrackEnd}
          handleProgress={handleProgress}
          handleDuration={handleDuration}
          handlePlay={handlePlay}
          handlePause={handlePause}
          handleReady={handleReady}
          loopCurrent={loopCurrent}
          onToggleVideo={onToggleVideo}
          registerActivity={registerActivity}
          setAppleMusicKitNowPlaying={setAppleMusicKitNowPlaying}
          lyricsControls={lyricsControls}
          lyricsAlignment={lyricsAlignment}
          koreanDisplay={koreanDisplay}
          japaneseFurigana={japaneseFurigana}
          adjustLyricOffset={adjustLyricOffset}
          showStatusCallback={showStatusCallback}
          onNextTrack={onNextTrack}
          onPreviousTrack={onPreviousTrack}
          furiganaMap={furiganaMap}
          soramimiMap={soramimiMap}
          t={t}
        />
      )}

      {isModernUi && (
        <IpodScreenSplitArtPanel
          showSplitMenuArt={showSplitMenuArt}
          splitLayoutTransitionReady={splitLayoutTransitionReady}
          displayedSplitArtUrl={displayedSplitArtUrl}
        />
      )}
      {isModernUi ? (
        <div
          className={cn(
            "relative flex min-h-0 flex-col overflow-hidden z-10 h-full ipod-modern-menu-panel",
            showSplitMenuArt && "is-split",
            splitLayoutTransitionReady &&
              `transition-[width,box-shadow] ${SPLIT_LAYOUT_TRANSITION_TIMING}`
          )}
          style={{
            width: showSplitMenuArt ? MODERN_SPLIT_HALF : "100%",
          }}
        >
          {menuChrome}
        </div>
      ) : (
        <div className="relative z-10 h-full flex flex-col min-h-0">
          {menuChrome}
        </div>
      )}

    </div>
  );
}
