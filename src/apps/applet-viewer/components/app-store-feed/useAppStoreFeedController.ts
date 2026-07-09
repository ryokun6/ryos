import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  useCallback,
} from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useAppletActions, type Applet } from "../../utils/appletActions";
import { fetchAppletCatalog } from "../../utils/appletCatalog";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { useChatsStoreShallow } from "@/stores/useChatsStore";
import { abortableFetch } from "@/utils/abortableFetch";
import type { AppStoreFeedProps, AppStoreFeedRef } from "./types";
import { MAX_VISIBLE_PREVIEWS } from "./constants";
import { sortAppletsForFeed } from "./sortAppletsForFeed";
import { useAppStoreFeedAuth } from "./useAppStoreFeedAuth";

export type UseAppStoreFeedControllerArgs = AppStoreFeedProps & {
  ref?: React.Ref<AppStoreFeedRef>;
};

export function useAppStoreFeedController({
  ref,
  theme,
  focusWindow,
  onAppletSelect,
}: UseAppStoreFeedControllerArgs) {
  const { t } = useTranslation();
  const [applets, setApplets] = useState<Applet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigationDirection, setNavigationDirection] = useState<
    "forward" | "backward" | "none"
  >("none");
  const [appletContents, setAppletContents] = useState<Map<string, string>>(
    new Map()
  );
  const [loadingContents, setLoadingContents] = useState<Set<string>>(
    new Set()
  );
  const feedRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Set<string>>(new Set());
  const currentIndexRef = useLatestRef(currentIndex);
  const appletsLengthRef = useLatestRef(applets.length);
  const hasFetchedRef = useRef(false);
  const sessionSeedRef = useRef(Math.floor(Math.random() * 1000000));
  const {
    isMacOSTheme: osIsMac,
    isSystem7Theme: osIsSystem7,
    isWindowsTheme: osIsXp,
  } = useThemeFlags();
  const { username, isAuthenticated } = useChatsStoreShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
  }));

  const isMacTheme = theme === "macosx" || osIsMac;
  const isSystem7Theme = theme === "system7" || osIsSystem7;
  const isWindowsTheme = osIsXp;

  const actions = useAppletActions();

  useAppStoreFeedAuth(feedRef, username, isAuthenticated, appletContents);

  const fetchApplets = useCallback(async () => {
    if (
      typeof navigator !== "undefined" &&
      "onLine" in navigator &&
      !navigator.onLine
    ) {
      setIsLoading(false);
      return;
    }
    try {
      const allApplets = await fetchAppletCatalog();
      const sortedApplets = sortAppletsForFeed(
        allApplets,
        actions,
        sessionSeedRef.current
      );
      setApplets(sortedApplets);
    } catch (error) {
      console.error("Error fetching applets:", error);
    } finally {
      setIsLoading(false);
    }
  }, [actions]);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchApplets();
    }
  }, [fetchApplets]);

  useEffect(() => {
    const abortController = new AbortController();
    let isActive = true;

    const fetchAppletContent = async (appletId: string) => {
      if (loadedRef.current.has(appletId) || loadingRef.current.has(appletId)) {
        return;
      }

      loadingRef.current.add(appletId);
      setLoadingContents((prev) => new Set(prev).add(appletId));

      try {
        const response = await abortableFetch(
          getApiUrl(`/api/share-applet?id=${encodeURIComponent(appletId)}`),
          {
            signal: abortController.signal,
            timeout: 15000,
            retry: { maxAttempts: 2, initialDelayMs: 500 },
          }
        );
        if (!isActive || abortController.signal.aborted) return;

        const data = await response.json();
        if (!isActive || abortController.signal.aborted) return;

        loadedRef.current.add(appletId);
        setAppletContents((prev) => {
          const next = new Map(prev);
          next.set(appletId, data.content || "");
          return next;
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error(`Error fetching applet content for ${appletId}:`, error);
      } finally {
        loadingRef.current.delete(appletId);
        setLoadingContents((prev) => {
          const next = new Set(prev);
          next.delete(appletId);
          return next;
        });
      }
    };

    if (applets.length > 0 && applets[currentIndex]) {
      void fetchAppletContent(applets[currentIndex].id);
    }
    return () => {
      isActive = false;
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, applets.length]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < appletsLengthRef.current) {
        const prevIndex = currentIndexRef.current;
        setCurrentIndex(index);

        if (index > prevIndex) {
          setNavigationDirection("forward");
        } else if (index < prevIndex) {
          setNavigationDirection("backward");
        } else {
          setNavigationDirection("none");
        }
      }
    },
    [appletsLengthRef, currentIndexRef]
  );

  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const containerRect = container.getBoundingClientRect();
      const isInToolbar = e.clientY - containerRect.top < 60;

      if (isInToolbar && Math.abs(e.deltaY) > 30) {
        e.preventDefault();
        if (e.deltaY > 0 && currentIndex < applets.length - 1) {
          scrollToIndex(currentIndex + 1);
        } else if (e.deltaY < 0 && currentIndex > 0) {
          scrollToIndex(currentIndex - 1);
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [currentIndex, applets.length, scrollToIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        if (currentIndex < applets.length - 1) {
          scrollToIndex(currentIndex + 1);
        }
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        if (currentIndex > 0) {
          scrollToIndex(currentIndex - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, applets.length, scrollToIndex]);

  useImperativeHandle(
    ref,
    () => ({
      goToNext: () => {
        if (currentIndexRef.current < appletsLengthRef.current - 1) {
          scrollToIndex(currentIndexRef.current + 1);
        }
      },
      goToPrevious: () => {
        if (currentIndexRef.current > 0) {
          scrollToIndex(currentIndexRef.current - 1);
        }
      },
    }),
    [appletsLengthRef, currentIndexRef, scrollToIndex]
  );

  const handleInstall = async (applet: Applet) => {
    focusWindow?.();
    await actions.handleInstall(applet, () => {
      hasFetchedRef.current = false;
      fetchApplets();
    });
  };

  const handleAppletClick = async (applet: Applet) => {
    focusWindow?.();
    const result = await actions.handleAppletClick(applet);
    if (result && onAppletSelect) {
      onAppletSelect(result);
    }
  };

  const handlePreviewClick = async (applet: Applet) => {
    focusWindow?.();
    const installed = actions.isAppletInstalled(applet.id);
    if (installed) {
      await handleAppletClick(applet);
    }
  };

  const startIndex = Math.max(0, currentIndex);
  const endIndexExclusive = Math.min(
    applets.length,
    currentIndex + MAX_VISIBLE_PREVIEWS + 1
  );
  const visibleApplets = applets.slice(startIndex, endIndexExclusive);

  return {
    t,
    feedRef,
    isLoading,
    applets,
    currentIndex,
    navigationDirection,
    appletContents,
    loadingContents,
    isMacTheme,
    isSystem7Theme,
    isWindowsTheme,
    actions,
    scrollToIndex,
    handleInstall,
    handleAppletClick,
    handlePreviewClick,
    visibleApplets,
    startIndex,
  };
}
