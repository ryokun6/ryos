import { useState, useEffect, useCallback, useReducer, useRef } from "react";
import { ShaderType } from "@/components/shared/GalaxyBackground";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { useEventListener } from "@/hooks/useEventListener";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  MAX_VISIBLE_PREVIEWS,
  PREVIEW_SCALE_FACTOR,
  PREVIEW_Y_SPACING,
  PREVIEW_Z_SPACING,
} from "./constants";
import { exitVariants, loadingBarVariants, pulsingAnimationVariants } from "./animation-variants";
import { getMaskStyle, getHostname, timeMachineGenerateShareUrl } from "./utils";
import { initialState, timeMachineUiReducer } from "./time-machine-ui-reducer";
import type { PreviewSource, TimeMachineViewProps } from "./types";
import { timeMachineLog as log } from "../../logging";

export function useTimeMachineView({
  isOpen,
  onClose,
  cachedYears,
  currentUrl,
  onSelectYear,
  currentSelectedYear,
}: TimeMachineViewProps) {
  const { t } = useTranslation();
  const { isMacOSTheme: isMacTheme } = useThemeFlags();
  const [state, dispatch] = useReducer(timeMachineUiReducer, initialState);
  const {
    activeYearIndex,
    navigationDirection,
    previewYear,
    previewContent,
    previewSourceType,
    previewStatus,
    previewError,
    isIframeLoaded,
  } = state;
  const setActiveYearIndex = useCallback(
    (value: number | ((prev: number) => number)) => {
      dispatch({ type: "setActiveYearIndex", value });
    },
    []
  );
  const setNavigationDirection = useCallback(
    (value: "forward" | "backward" | "none") => {
      dispatch({ type: "setNavigationDirection", value });
    },
    []
  );
  const setPreviewYear = useCallback((value: string | null) => {
    dispatch({ type: "setPreviewYear", value });
  }, []);
  const setPreviewContent = useCallback((value: string | null) => {
    dispatch({ type: "setPreviewContent", value });
  }, []);
  const setPreviewSourceType = useCallback((value: PreviewSource | null) => {
    dispatch({ type: "setPreviewSourceType", value });
  }, []);
  const setPreviewStatus = useCallback(
    (value: "idle" | "loading" | "success" | "error") => {
      dispatch({ type: "setPreviewStatus", value });
    },
    []
  );
  const setPreviewError = useCallback((value: string | null) => {
    dispatch({ type: "setPreviewError", value });
  }, []);
  const setIsIframeLoaded = useCallback((value: boolean) => {
    dispatch({ type: "setIsIframeLoaded", value });
  }, []);
  const [scrollState, setScrollState] = useState({
    isTop: true,
    isBottom: false,
    canScroll: false,
  });

  const timelineRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  // Get main app state for comparison
  const storeUrl = useInternetExplorerStore((state) => state.url);
  const storeYear = useInternetExplorerStore((state) => state.year);
  // Get shader support status from display settings store
  const shaderEffectEnabled = useDisplaySettingsStore((state) => state.shaderEffectEnabled);
  const setShaderEffectEnabled = useDisplaySettingsStore(
    (state) => state.setShaderEffectEnabled
  );

  // Determine the currently focused year in the timeline
  const activeYear = cachedYears[activeYearIndex] ?? null;

  // --- Sound Effects ---
  const { play: playOpen } = useSound(Sounds.WINDOW_OPEN, 0.5);
  const { play: playClose } = useSound(Sounds.WINDOW_CLOSE, 0.5);
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.4);
  // --- End Sound Effects ---

  // --- Add state for Share Dialog ---
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  // --- End Share Dialog State ---

  // Determine if the Go button should be disabled
  const isGoButtonDisabled =
    !activeYear || (storeUrl === currentUrl && storeYear === activeYear);

  // Shader selection state from display settings store
  const selectedShaderType = useDisplaySettingsStore((state) => state.selectedShaderType);
  const setSelectedShaderType = useDisplaySettingsStore(
    (state) => state.setSelectedShaderType
  );

  // Define shader names including Off option
  const shaderNames: Record<ShaderType | "off", string> = {
    [ShaderType.GALAXY]: t("apps.internet-explorer.galaxy"),
    [ShaderType.AURORA]: t("apps.internet-explorer.aurora"),
    [ShaderType.NEBULA]: t("apps.internet-explorer.nebula"),
    off: t("apps.internet-explorer.off"),
  };

  // Define type for shader menu options
  const handleScroll = useCallback(() => {
    const element = timelineRef.current;
    if (!element) return;

    const isMobile = window.innerWidth < 640;
    let canScroll = false;

    if (isMobile) {
      // Check horizontal scroll on mobile
      const scrollWidth = element.scrollWidth;
      const clientWidth = element.clientWidth;
      const threshold = 1; // Minimal tolerance needed for horizontal
      canScroll = scrollWidth > clientWidth + threshold;
    } else {
      // Check vertical scroll on desktop
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;
      const threshold = 5;
      canScroll = scrollHeight > clientHeight + threshold;
    }

    // Update scroll state only if scrollability changed
    setScrollState((prevState) => {
      if (prevState.canScroll !== canScroll) {
        // Reset isTop/isBottom as they are not used in simplified mask
        return { isTop: false, isBottom: false, canScroll };
      }
      return prevState;
    });
  }, []); // Empty dependency array, relies on timelineRef.current

  const [scrollListenersActive, setScrollListenersActive] = useState(false);

  // Delay setup to ensure layout is stable after opening animation/resize
  useEffect(() => {
    if (!isOpen) {
      setScrollListenersActive(false);
      return;
    }

    const element = timelineRef.current;
    if (!element) {
      return;
    }

    setScrollListenersActive(false);
    const timer = window.setTimeout(() => {
      handleScroll(); // Initial check
      setScrollListenersActive(true);
    }, 100); // Increased delay slightly

    return () => {
      clearTimeout(timer);
      setScrollListenersActive(false);
    };
  }, [isOpen, handleScroll, cachedYears]); // Re-run if cachedYears changes height or component opens/closes

  useEventListener(
    "scroll",
    handleScroll,
    scrollListenersActive ? timelineRef : null,
    { passive: true }
  );
  useEventListener(
    "resize",
    handleScroll,
    scrollListenersActive ? window : null
  );
  // --- End Scroll Mask Logic ---

  // Initialize index and preview year when opening
  useEffect(() => {
    if (isOpen) {
      playOpen(); // Play open sound
      const initialIndex = cachedYears.findIndex(
        (y) => y === currentSelectedYear
      );
      const validIndex = initialIndex !== -1 ? initialIndex : 0;
      setActiveYearIndex(validIndex);
      // Initialize previewYear based on the starting index
      if (cachedYears[validIndex]) {
        setPreviewYear(cachedYears[validIndex]);
      } else {
        setPreviewYear(null);
      }
      setPreviewStatus("idle"); // Reset status on open
      setPreviewContent(null);
      setPreviewSourceType(null);
      setPreviewError(null);
      setIsIframeLoaded(false); // Reset iframe state on open
    } else {
      // Reset preview state when closed
      setPreviewYear(null);
      setPreviewContent(null);
      setPreviewSourceType(null);
      setPreviewStatus("idle");
      setPreviewError(null);
      setIsIframeLoaded(false); // Reset iframe state on close
    }
  }, [cachedYears, isOpen, currentSelectedYear, playOpen]);

  // Update previewYear when activeYearIndex changes (due to user interaction)
  useEffect(() => {
    // Ensure this runs only after initial setup and when index actually changes while open
    if (isOpen && previewStatus !== "idle") {
      const newYear = cachedYears[activeYearIndex];
      if (newYear && newYear !== previewYear) {
        setPreviewYear(newYear);
      }
    }
    // We only want this effect to react to index changes triggered by user interaction,
    // not the initial setting from the isOpen effect.
  }, [activeYearIndex, isOpen, cachedYears, previewStatus, previewYear]);

  // Scroll timeline to active item
  useEffect(() => {
    if (isOpen && timelineRef.current && cachedYears.length > 0) {
      // Use activeYearIndex directly since timeline is no longer reversed

      // Ensure index is valid
      if (
        activeYearIndex >= 0 &&
        activeYearIndex < timelineRef.current.children.length
      ) {
        const activeElement = timelineRef.current.children[
          activeYearIndex
        ] as HTMLElement;

        if (activeElement) {
          // Check screen width to apply correct scroll behavior
          const isMobile = window.innerWidth < 640; // Tailwind 'sm' breakpoint

          if (isMobile) {
            // Mobile: Center horizontally
            activeElement.scrollIntoView({
              behavior: "smooth",
              block: "nearest", // Avoid unnecessary vertical scroll if possible
              inline: "center", // Center horizontally
            });
          } else {
            // Desktop: Center vertically
            activeElement.scrollIntoView({
              behavior: "smooth",
              block: "center", // Center vertically
              inline: "nearest", // Avoid unnecessary horizontal scroll
            });
          }
        }
      }
    }
  }, [activeYearIndex, isOpen, cachedYears.length]);

  const handleClose = useCallback(() => {
    playClose(); // Play close sound
    onClose();
  }, [onClose, playClose]);

  // --- Helper to set Active Index and Direction ---
  const changeActiveYearIndex = useCallback(
    (newIndexOrCallback: number | ((prevIndex: number) => number)) => {
      setActiveYearIndex((prevIndex) => {
        let newIndex: number;
        if (typeof newIndexOrCallback === "function") {
          newIndex = newIndexOrCallback(prevIndex);
        } else {
          newIndex = newIndexOrCallback;
        }

        // Clamp index to valid range
        newIndex = Math.max(0, Math.min(cachedYears.length - 1, newIndex));

        // Determine direction
        if (newIndex > prevIndex) {
          setNavigationDirection("forward"); // Moving to older year (past)
        } else if (newIndex < prevIndex) {
          setNavigationDirection("backward"); // Moving to newer year (future)
        } else {
          setNavigationDirection("none"); // No change
        }
        return newIndex;
      });
    },
    [cachedYears.length]
  ); // Dependency on cachedYears.length to ensure clamping is correct
  // --- End Helper ---

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        // Use helper function to set direction
        changeActiveYearIndex((prevIndex) => prevIndex + 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        // Use helper function to set direction
        changeActiveYearIndex((prevIndex) => prevIndex - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (cachedYears[activeYearIndex]) {
          onSelectYear(cachedYears[activeYearIndex]);
          // Keep view open after selection
          // onClose();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    },
    [
      isOpen,
      cachedYears,
      activeYearIndex,
      onSelectYear,
      handleClose,
      changeActiveYearIndex,
    ]
  ); // Add changeActiveYearIndex to dependencies

  useEventListener("keydown", handleKeyDown, isOpen ? window : null);

  // --- Concurrency handling for preview fetches ---
  // Each time we start resolving a preview source we increment this counter.
  // Only the most-recent async chain is allowed to commit state updates.
  const previewRequestIdRef = useRef(0);
  // Keep an AbortController so that previous network requests are cancelled
  const previewAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen || !previewYear || !currentUrl) {
      setPreviewContent(null);
      setPreviewSourceType(null);
      setPreviewStatus("idle");
      setPreviewError(null);
      setIsIframeLoaded(false); // Reset iframe state
      return;
    }

    // Abort any previous in-flight request
    if (previewAbortControllerRef.current) {
      previewAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    previewAbortControllerRef.current = abortController;

    // Generate an id so that we can ignore stale async completions
    const myRequestId = ++previewRequestIdRef.current;

    log.debug("Determining content source", { year: previewYear });
    setPreviewStatus("loading");
    setPreviewContent(null);
    setPreviewSourceType(null);
    setPreviewError(null);
    setIsIframeLoaded(false); // Reset iframe state on new preview

    const determineSource = async () => {
      try {
        // Local caching removed to save localStorage space
        log.debug("Determining API source", {
          year: previewYear,
          hasUrl: Boolean(currentUrl),
        });

        // Determine API source based on year
        if (previewYear === "current") {
          // 2a. 'current' uses direct proxy URL
          log.debug("Using current URL source", { year: previewYear });
          const proxyUrl = `/api/iframe-check?url=${encodeURIComponent(
            currentUrl
          )}&theme=${encodeURIComponent(document.documentElement.dataset.osTheme || "")}`;
          if (
            abortController.signal.aborted ||
            previewRequestIdRef.current !== myRequestId
          )
            return;
          setPreviewContent(proxyUrl);
          setPreviewSourceType("url");
          setPreviewStatus("success"); // Status is success, iframe handles actual load
          // isIframeLoaded remains false until iframe onLoad fires
        } else {
          const yearString = previewYear.replace(" BC", "");
          const yearInt = parseInt(yearString);
          const currentYear = new Date().getFullYear();
          const isBC = previewYear.includes(" BC");

          if (!isBC && yearInt >= 1996 && yearInt <= currentYear) {
            // 2b. Year >= 1996 uses Wayback proxy URL
            log.debug("Using Wayback proxy URL source", { year: previewYear });
            const currentMonth = (new Date().getMonth() + 1)
              .toString()
              .padStart(2, "0");
            const proxyUrl = `/api/iframe-check?mode=proxy&url=${encodeURIComponent(
              currentUrl
            )}&year=${yearString}&month=${currentMonth}&theme=${encodeURIComponent(document.documentElement.dataset.osTheme || "")}`;
            if (
              abortController.signal.aborted ||
              previewRequestIdRef.current !== myRequestId
            )
              return;
            setPreviewContent(proxyUrl);
            setPreviewSourceType("url");
            setPreviewStatus("success"); // Status is success, iframe handles actual load
            // isIframeLoaded remains false until iframe onLoad fires
          } else {
            // 2c. Year < 1996 or BC uses AI cache (fetches HTML)
            log.debug("Using AI HTML source", { year: previewYear });
            const aiResponse = await abortableFetch(
              `/api/iframe-check?mode=ai&url=${encodeURIComponent(
                currentUrl
              )}&year=${previewYear}&theme=${encodeURIComponent(document.documentElement.dataset.osTheme || "")}`,
              {
                signal: abortController.signal,
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
              }
            );

            if (
              abortController.signal.aborted ||
              previewRequestIdRef.current !== myRequestId
            )
              return;

            if (aiResponse.ok) {
              log.debug("AI fetch succeeded", { year: previewYear });
              const html = await aiResponse.text();
              const cleanHtml = html.replace(/^<!--\s*TITLE:.*?-->\s*\n?/, "");

              if (
                abortController.signal.aborted ||
                previewRequestIdRef.current !== myRequestId
              )
                return;
              setPreviewContent(cleanHtml);
              setPreviewSourceType("html");
              setPreviewStatus("success");
              // No iframe involved
              setIsIframeLoaded(true);
              // Local caching removed to save localStorage space
            } else if (aiResponse.status === 404) {
              log.debug("AI fetch missed", {
                year: previewYear,
                status: aiResponse.status,
              });
              throw new Error(
                `No AI-generated version available for ${previewYear}.`
              );
            } else {
              // Handle non-404 errors from AI fetch
              console.error(
                `[TimeMachine] AI Fetch FAILED for ${currentUrl} (${previewYear}). Status: ${aiResponse.status}`
              );
              const errorText = await aiResponse.text();
              let errorMessage = `API Error (${aiResponse.status})`;
              try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message) errorMessage = errorJson.message;
              } catch {
                /* Ignore */
              }
              throw new Error(errorMessage);
            }
          }
        }
      } catch (error) {
        if (
          abortController.signal.aborted ||
          previewRequestIdRef.current !== myRequestId
        )
          return;
        console.error(
          "[TimeMachine] Error determining preview content:",
          error
        );
        setPreviewError(
          error instanceof Error ? error.message : "Failed to load preview."
        );
        setPreviewStatus("error");
        setPreviewContent(null);
        setPreviewSourceType(null);
        setIsIframeLoaded(false);
      }
    };

    determineSource();

    // Cleanup – abort fetches when previewYear changes or component unmounts
    return () => {
      abortController.abort();
    };
  }, [previewYear, isOpen, currentUrl]); // Dependencies


  const maskStyle = getMaskStyle(scrollState.canScroll);


  // Calculate tooltip labels
  const olderYearLabel =
    activeYearIndex < cachedYears.length - 1
      ? cachedYears[activeYearIndex + 1]
      : t("apps.internet-explorer.oldest");
  const newerYearLabel =
    activeYearIndex > 0 ? cachedYears[activeYearIndex - 1] : t("apps.internet-explorer.newest");

  // --- Calculate the slice of years to actually render ---
  const startIndex = Math.max(0, activeYearIndex); // The active card is the first one we want
  // +1 because slice end is exclusive, +1 again because MAX_VISIBLE_PREVIEWS is *behind* active
  const endIndexExclusive = Math.min(
    cachedYears.length,
    activeYearIndex + MAX_VISIBLE_PREVIEWS + 1
  );
  const visibleYears = cachedYears.slice(startIndex, endIndexExclusive);
  // --- End Slice Calculation ---

  // --- Add handler for Share button ---
  const handleSharePage = useCallback(() => {
    if (activeYear) {
      setIsShareDialogOpen(true);
      // No toast needed here, dialog handles its own flow
    }
  }, [activeYear]);
  // --- End Share handler ---

  return {
    t, isMacTheme, activeYearIndex, navigationDirection, previewYear, previewContent,
    previewSourceType, previewStatus, previewError, isIframeLoaded, setIsIframeLoaded,
    setPreviewError, setPreviewStatus, timelineRef, previewContainerRef, shaderEffectEnabled,
    selectedShaderType, setShaderEffectEnabled, setSelectedShaderType, activeYear, handleClose,
    cachedYears, changeActiveYearIndex, playClick, olderYearLabel, newerYearLabel, visibleYears,
    startIndex, exitVariants, loadingBarVariants, pulsingAnimationVariants, maskStyle,
    isGoButtonDisabled, handleSharePage, isShareDialogOpen, setIsShareDialogOpen,
    timeMachineGenerateShareUrl, currentUrl, currentSelectedYear, onSelectYear, shaderNames,
    setNavigationDirection, setActiveYearIndex, getHostname, PREVIEW_Z_SPACING,
    PREVIEW_SCALE_FACTOR, PREVIEW_Y_SPACING, ShaderType,
  };
}
