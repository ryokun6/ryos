import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useSpotlightStore } from "@/stores/useSpotlightStore";
import { useSpotlightSearch } from "@/hooks/useSpotlightSearch";
import { prefetchAppChunk } from "@/config/lazyAppComponent";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isDesktop, isDesktopWindows } from "@/utils/platform";
import { onExposeToggle } from "@/utils/appEventBus";
import {
  buildGroupedResults,
  getSpotlightPrefetchAppId,
} from "./spotlightSearchUtils";

export function useSpotlightSearchController() {
  const { t } = useTranslation();
  // Narrow subscription: actions are stable; only open/query/index need to
  // trigger controller re-renders (Spotlight stays mounted while closed).
  const { isOpen, query, selectedIndex } = useSpotlightStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      query: s.query,
      selectedIndex: s.selectedIndex,
    }))
  );
  const setQuery = useCallback(
    (q: string) => useSpotlightStore.getState().setQuery(q),
    []
  );
  const setSelectedIndex = useCallback(
    (i: number) => useSpotlightStore.getState().setSelectedIndex(i),
    []
  );
  const reset = useCallback(() => useSpotlightStore.getState().reset(), []);
  const { results, isSearching } = useSpotlightSearch(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const {
    isWindowsTheme,
    isMacTheme: isMac,
    isMacOSTheme,
    isSystem7Theme: isSystem7,
    isWinXp,
  } = useThemeFlags();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isOpen) return;
    const focusInput = () => inputRef.current?.focus();
    if (isMobile) {
      requestAnimationFrame(focusInput);
      return;
    }
    const delay = isWindowsTheme ? 150 : 0;
    const id = setTimeout(() => {
      requestAnimationFrame(focusInput);
      if (isWindowsTheme) {
        reclaimId = setTimeout(() => requestAnimationFrame(focusInput), 100);
      }
    }, delay);
    let reclaimId: ReturnType<typeof setTimeout> | undefined;
    return () => {
      clearTimeout(id);
      if (reclaimId) clearTimeout(reclaimId);
    };
  }, [isOpen, isWindowsTheme, isMobile]);

  // The global spotlight-toggle listener (and the mobile proxy input it
  // focuses) lives in SpotlightSearchHost, which is always mounted.

  useEffect(() => {
    const handler = () => {
      if (useSpotlightStore.getState().isOpen) {
        useSpotlightStore.getState().reset();
      }
    };
    return onExposeToggle(handler);
  }, []);

  const groupedResults = useMemo(
    () => buildGroupedResults(results),
    [results]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(Math.min(selectedIndex + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(Math.max(selectedIndex - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          selected.action();
          reset();
        }
      }
    },
    [results, selectedIndex, setSelectedIndex, reset]
  );

  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(
      `[data-spotlight-index="${selectedIndex}"]`
    );
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen || results.length === 0) return;
    const appId = getSpotlightPrefetchAppId(results[selectedIndex]);
    if (appId) prefetchAppChunk(appId);
  }, [isOpen, results, selectedIndex]);

  const containerStyles = useMemo((): CSSProperties => {
    if (isMacOSTheme) {
      return {
        background: "var(--os-pinstripe-window)",
        borderRadius: isMobile ? "var(--os-metrics-radius, 0.45rem)" : "0px",
        border: "none",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
      };
    }
    if (isSystem7) {
      return {
        background: "#FFFFFF",
        border: "1px solid #000000",
        borderRadius: "0px",
        boxShadow: "2px 2px 0px 0px rgba(0, 0, 0, 0.5)",
      };
    }
    if (isWinXp) {
      return {
        background: "#FFFFFF",
        border: "1px solid #ACA899",
        borderRadius: "2px",
        boxShadow: "2px 2px 6px rgba(0, 0, 0, 0.2)",
      };
    }
    return {
      background: "#FFFFFF",
      border: "1px solid #808080",
      borderRadius: "0px",
      boxShadow: "1px 1px 0 #000000",
    };
  }, [isMacOSTheme, isSystem7, isWinXp, isMobile]);

  const fontFamily = isWindowsTheme
    ? "var(--font-ms-sans)"
    : isSystem7
      ? "'Geneva-12', 'ArkPixel', system-ui, sans-serif"
      : "LucidaGrande, 'Lucida Grande', ui-sans-serif, system-ui, sans-serif";

  const fontSize = isSystem7 ? "11px" : isMac ? "13px" : "11px";
  const subtitleColor = "rgba(0,0,0,0.4)";
  const inputFontSize = isSystem7 ? "12px" : isMac ? "13px" : "11px";
  const sectionFontSize = isSystem7 ? "10px" : isMac ? "11px" : "10px";
  const rowPy = isMac ? "3px" : "3px";
  const iconPx = isMac ? 20 : 18;

  const needsCenter = isMobile || !isMac;
  const useTwoColumn =
    isMacOSTheme && !isMobile && groupedResults.length > 0;
  const panelPositionClass = isMobile
    ? "fixed z-[10004] w-[calc(100vw-24px)] max-w-[480px]"
    : isMac
      ? `fixed z-[10004] right-2 ${useTwoColumn ? "w-[380px]" : "w-[260px]"}`
      : "fixed z-[10004] w-[320px]";

  const isDesktopApp = isDesktop();
  const isDesktopMacMenubar = isDesktopApp && !isDesktopWindows() && isMac;
  const menubarTop = isDesktopMacMenubar
    ? "32px"
    : "var(--os-metrics-menubar-height, 25px)";

  const panelTopStyle: CSSProperties = isMobile
    ? {
        top: isSystem7
          ? `calc(${menubarTop} + 32px - 1px)`
          : `calc(${menubarTop} + 32px)`,
        left: "50%",
      }
    : isMac
      ? { top: isSystem7 ? `calc(${menubarTop} - 1px)` : menubarTop }
      : { top: "28%", left: "50%" };

  const mobileInputPadding = "6px 10px";
  const mobileInputFontSize = "16px";

  const getSelectedBg = () => "var(--os-color-selection-bg)";
  const getSelectedTextColor = () => "var(--os-color-selection-text)";

  const activateResult = useCallback(
    (action: () => void) => {
      action();
      reset();
    },
    [reset]
  );

  return {
    t,
    isOpen,
    query,
    selectedIndex,
    setQuery,
    setSelectedIndex,
    reset,
    results,
    isSearching,
    inputRef,
    listRef,
    isWindowsTheme,
    isMac,
    isMacOSTheme,
    isSystem7,
    isMobile,
    groupedResults,
    handleKeyDown,
    containerStyles,
    fontFamily,
    fontSize,
    subtitleColor,
    inputFontSize,
    sectionFontSize,
    rowPy,
    iconPx,
    needsCenter,
    useTwoColumn,
    panelPositionClass,
    panelTopStyle,
    mobileInputPadding,
    mobileInputFontSize,
    getSelectedBg,
    getSelectedTextColor,
    activateResult,
  };
}

export type SpotlightSearchController = ReturnType<
  typeof useSpotlightSearchController
>;
