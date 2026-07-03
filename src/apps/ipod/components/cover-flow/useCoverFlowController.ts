import {
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useReducer,
} from "react";
import type { PanInfo } from "motion/react";
import type { Track } from "@/shared/media/library";
import { useIpodStore } from "@/stores/useIpodStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useEventListener } from "@/hooks/useEventListener";
import { isModernIpodUiVariant } from "../../constants";
import { LONG_PRESS_DELAY } from "./constants";
import { coverFlowUiReducer } from "./coverFlowUiReducer";
import type { CoverFlowComponentProps } from "./types";
import { getCoverSizeCqmin, getVisibleCoverEntries, resolveCoverUrl } from "./utils";
import { useCoverFlowItems } from "./useCoverFlowItems";

export function useCoverFlowController({
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
}: CoverFlowComponentProps) {
  const { coverItems, currentCoverIndex } = useCoverFlowItems(
    tracks,
    currentIndex,
    groupAppleMusicAlbums
  );

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
  const setIsFlipped = useCallback((value: boolean) => {
    dispatch({ type: "setIsFlipped", value });
  }, []);
  const setIsFlipAnimating = useCallback((value: boolean) => {
    dispatch({ type: "setIsFlipAnimating", value });
  }, []);
  const flipAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const prevFlippedRef = useRef(isFlipped);
  const setSelectedTrackInAlbum = useCallback(
    (value: number | ((prev: number) => number)) => {
      dispatch({ type: "setSelectedTrackInAlbum", value });
    },
    []
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const { isMacOSTheme: isMacTheme } = useThemeFlags();
  const uiVariant = useIpodStore((s) => s.uiVariant);
  const isModernIpodCoverFlow = ipodMode && isModernIpodUiVariant(uiVariant);

  const swipeStartX = useRef<number | null>(null);
  const lastMoveX = useRef<number | null>(null);
  const isPanningRef = useRef(false);

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

  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  useEffect(() => {
    if (isVisible) {
      setSelectedIndex(currentCoverIndex);
    }
  }, [isVisible, currentCoverIndex]);

  useEffect(() => {
    if (!isVisible) {
      setIsFlipped(false);
    }
  }, [isVisible]);

  useEffect(() => {
    setIsFlipped(false);
  }, [selectedIndex]);

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
    setShowCD(false);
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
    setShowCD(false);
    onRotation();
  }, [isFlipped, onRotation]);

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

  const handleMenuButton = useCallback(() => {
    if (isFlipped) {
      setIsFlipped(false);
      return true;
    }
    return false;
  }, [isFlipped]);

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

  const handlePanStart = useCallback(
    (_: unknown, info: PanInfo) => {
      swipeStartX.current = info.point.x;
      lastMoveX.current = info.point.x;
      isPanningRef.current = true;
      clearLongPress();
    },
    [clearLongPress]
  );

  const handlePan = useCallback(
    (_: unknown, info: PanInfo) => {
      if (lastMoveX.current === null) return;

      clearLongPress();

      const deltaX = info.point.x - lastMoveX.current;
      const threshold = 20;

      if (Math.abs(deltaX) > threshold) {
        if (deltaX < 0) {
          navigateNext();
        } else {
          navigatePrevious();
        }
        lastMoveX.current = info.point.x;
      }
    },
    [navigateNext, navigatePrevious, clearLongPress]
  );

  const handlePanEnd = useCallback(() => {
    swipeStartX.current = null;
    lastMoveX.current = null;
    setTimeout(() => {
      isPanningRef.current = false;
    }, 50);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaX > 20 || e.deltaY > 20) {
        navigateNext();
      } else if (e.deltaX < -20 || e.deltaY < -20) {
        navigatePrevious();
      }
    },
    [navigateNext, navigatePrevious]
  );

  const visibleCovers = getVisibleCoverEntries(coverItems, selectedIndex);

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

  const handleSelectAlbumTrack = useCallback(
    (indexInAlbum: number) => {
      if (!currentItem) return;
      const trackIndex =
        currentItem.trackIndices[indexInAlbum] ?? currentItem.trackIndex;
      onSelectTrack(trackIndex);
    },
    [currentItem, onSelectTrack]
  );

  const playingPositionInAlbum = useMemo(() => {
    if (!currentItem) return -1;
    return currentItem.trackIndices.findIndex((idx) => idx === currentIndex);
  }, [currentItem, currentIndex]);

  const handleCarouselClick = useCallback(() => {
    if (isPanningRef.current || longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (showCD) {
      setShowCD(false);
      return;
    }
    if (isFlipped) return;
    selectCurrent();
  }, [showCD, isFlipped, selectCurrent]);

  const gesturesDisabled = showCD || isFlipped;

  return {
    ipodMode,
    isPlaying,
    onTogglePlay,
    isMacTheme,
    isModernIpodCoverFlow,
    containerRef,
    currentCoverIndex,
    currentItem,
    coverItems,
    selectedIndex,
    showCD,
    setShowCD,
    isFlipped,
    setIsFlipped,
    isFlipAnimating,
    selectedTrackInAlbum,
    albumTracks,
    visibleCovers,
    flipCoverSizeCqmin,
    flipCoverUrl,
    playingPositionInAlbum,
    playItemInPlace,
    handleSelectAlbumTrack,
    gesturesDisabled,
    handlePanStart,
    handlePan,
    handlePanEnd,
    handleWheel,
    handleCarouselClick,
    startLongPress,
    endLongPress,
  };
}

export type CoverFlowController = ReturnType<typeof useCoverFlowController>;
