import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  CSSProperties,
  ReactNode,
} from "react";
import { InternetExplorerInitialData } from "../../base/types";
import {
  useInternetExplorerStore,
  DEFAULT_FAVORITES,
  ErrorResponse,
  LanguageOption,
  LocationOption,
  Favorite,
  isDirectPassthrough,
} from "@/stores/useInternetExplorerStore";
import { useAiGeneration } from "./useAiGeneration";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import { track } from "@vercel/analytics";
import { useAppStore } from "@/stores/useAppStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { IE_ANALYTICS } from "@/utils/analytics";
import { useOffline } from "@/hooks/useOffline";
import { checkOfflineAndShowError } from "@/utils/offline";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { toast } from "sonner";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useInternetExplorerStoreShallow } from "@/stores/helpers";
import { abortableFetch } from "@/utils/abortableFetch";

// Helper function to get language display name
const getLanguageDisplayName = (lang: LanguageOption): string => {
  const { t } = i18n;
  const languageMap: Record<LanguageOption, string> = {
    auto: t("apps.internet-explorer.autodetected"),
    english: t("apps.internet-explorer.english"),
    chinese: t("apps.internet-explorer.chineseTraditional"),
    japanese: t("apps.internet-explorer.japanese"),
    korean: t("apps.internet-explorer.korean"),
    french: t("apps.internet-explorer.french"),
    spanish: t("apps.internet-explorer.spanish"),
    portuguese: t("apps.internet-explorer.portuguese"),
    german: t("apps.internet-explorer.german"),
    welsh: t("apps.internet-explorer.welsh"),
    sanskrit: t("apps.internet-explorer.sanskrit"),
    latin: t("apps.internet-explorer.latin"),
    alien: t("apps.internet-explorer.alienLanguage"),
    ai_language: t("apps.internet-explorer.aiLanguage"),
    digital_being: t("apps.internet-explorer.digitalBeingLanguage"),
  };
  return languageMap[lang] || t("apps.internet-explorer.autodetected");
};

// Helper function to get location display name
const getLocationDisplayName = (loc: LocationOption): string => {
  const { t } = i18n;
  const locationMap: Record<LocationOption, string> = {
    auto: t("apps.internet-explorer.autodetected"),
    united_states: t("apps.internet-explorer.unitedStates"),
    china: t("apps.internet-explorer.china"),
    japan: t("apps.internet-explorer.japan"),
    korea: t("apps.internet-explorer.southKorea"),
    france: t("apps.internet-explorer.france"),
    spain: t("apps.internet-explorer.spain"),
    portugal: t("apps.internet-explorer.portugal"),
    germany: t("apps.internet-explorer.germany"),
    canada: t("apps.internet-explorer.canada"),
    uk: t("apps.internet-explorer.unitedKingdom"),
    india: t("apps.internet-explorer.india"),
    brazil: t("apps.internet-explorer.brazil"),
    australia: t("apps.internet-explorer.australia"),
    russia: t("apps.internet-explorer.russia"),
  };
  return locationMap[loc] || t("apps.internet-explorer.autodetected");
};

// Add this constant for title truncation
const MAX_TITLE_LENGTH = 50;

// Debug helper to identify direct passthrough URLs
const logDirectPassthrough = (url: string) => {
  console.log(`[IE] Direct passthrough mode for: ${url}`);
};

const getHostnameFromUrl = (url: string): string => {
  try {
    const urlToUse = url.startsWith("http") ? url : `https://${url}`;
    return new URL(urlToUse).hostname;
  } catch {
    return url; // Return original if parsing fails
  }
};

const formatTitle = (title: string): string => {
  if (!title) return "Internet Explorer";
  return title.length > MAX_TITLE_LENGTH
    ? title.substring(0, MAX_TITLE_LENGTH) + "..."
    : title;
};

// Helper function to decode Base64 data (client-side)
function decodeData(code: string): { url: string; year: string } | null {
  try {
    // Replace URL-safe characters back to standard Base64
    const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(paddedBase64);

    // Try compact format first (url|year)
    const [url, year] = decoded.split("|");
    if (typeof url === "string" && typeof year === "string") {
      return { url, year };
    }

    // If compact format fails, try JSON format
    try {
      const data = JSON.parse(decoded);
      if (typeof data.url === "string" && typeof data.year === "string") {
        return { url: data.url, year: data.year };
      }
    } catch {
      console.debug(
        "[IE] Failed to parse as JSON, not a valid share code format"
      );
    }

    console.error("[IE] Decoded data structure invalid:", { url, year });
    return null;
  } catch (error) {
    console.error("[IE] Error decoding share code:", error);
    return null;
  }
}

// Helper function to normalize URLs for history/caching
const normalizeUrlForHistory = (url: string): string => {
  let normalized = url.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/\/$/, ""); // Remove trailing slash
  return normalized;
};

// Define suggestion type to reuse
type SuggestionItem = {
  title: string;
  url: string;
  type: "favorite" | "history" | "search";
  year?: string;
  favicon?: string;
  normalizedUrl?: string; // Optional prop for internal use
};

interface UseInternetExplorerLogicProps {
  isWindowOpen: boolean;
  isForeground?: boolean;
  initialData?: InternetExplorerInitialData;
  instanceId: string;
  helpItems?: Array<{ icon: string; title: string; description: string }>;
}

export function useInternetExplorerLogic({
  isWindowOpen,
  isForeground,
  initialData,
  instanceId,
  helpItems,
}: UseInternetExplorerLogicProps) {
  const debugMode = useDisplaySettingsStore((state) => state.debugMode);
  const terminalSoundsEnabled = useAudioSettingsStore(
    (state) => state.terminalSoundsEnabled
  );
  const bringInstanceToForeground = useAppStore(
    (state) => state.bringInstanceToForeground
  );
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );

  const {
    url,
    year,
    mode,
    token,
    favorites,
    history,
    historyIndex,
    isTitleDialogOpen,
    newFavoriteTitle,
    isHelpDialogOpen,
    isAboutDialogOpen,
    isNavigatingHistory,
    isClearFavoritesDialogOpen,
    isClearHistoryDialogOpen,
    currentPageTitle,
    timelineSettings,
    status,
    finalUrl,
    aiGeneratedHtml,
    errorDetails,
    isResetFavoritesDialogOpen,
    isFutureSettingsDialogOpen,
    language,
    location,
    isTimeMachineViewOpen,
    cachedYears,
    isFetchingCachedYears,

    setUrl,
    setYear,
    navigateStart,
    setFinalUrl,
    loadSuccess,
    loadError,
    cancel,
    addFavorite,
    clearFavorites,
    setHistoryIndex,
    clearHistory,
    setTitleDialogOpen,
    setNewFavoriteTitle,
    setHelpDialogOpen,
    setAboutDialogOpen,
    setNavigatingHistory,
    setClearFavoritesDialogOpen,
    setClearHistoryDialogOpen,
    handleNavigationError,
    setPrefetchedTitle,
    clearErrorDetails,
    setResetFavoritesDialogOpen,
    setFutureSettingsDialogOpen,
    setLanguage,
    setLocation,
    setTimeMachineViewOpen,
    fetchCachedYears,
  } = useInternetExplorerStoreShallow((state) => ({
    url: state.url,
    year: state.year,
    mode: state.mode,
    token: state.token,
    favorites: state.favorites,
    history: state.history,
    historyIndex: state.historyIndex,
    isTitleDialogOpen: state.isTitleDialogOpen,
    newFavoriteTitle: state.newFavoriteTitle,
    isHelpDialogOpen: state.isHelpDialogOpen,
    isAboutDialogOpen: state.isAboutDialogOpen,
    isNavigatingHistory: state.isNavigatingHistory,
    isClearFavoritesDialogOpen: state.isClearFavoritesDialogOpen,
    isClearHistoryDialogOpen: state.isClearHistoryDialogOpen,
    currentPageTitle: state.currentPageTitle,
    timelineSettings: state.timelineSettings,
    status: state.status,
    finalUrl: state.finalUrl,
    aiGeneratedHtml: state.aiGeneratedHtml,
    errorDetails: state.errorDetails,
    isResetFavoritesDialogOpen: state.isResetFavoritesDialogOpen,
    isFutureSettingsDialogOpen: state.isFutureSettingsDialogOpen,
    language: state.language,
    location: state.location,
    isTimeMachineViewOpen: state.isTimeMachineViewOpen,
    cachedYears: state.cachedYears,
    isFetchingCachedYears: state.isFetchingCachedYears,

    setUrl: state.setUrl,
    setYear: state.setYear,
    navigateStart: state.navigateStart,
    setFinalUrl: state.setFinalUrl,
    loadSuccess: state.loadSuccess,
    loadError: state.loadError,
    cancel: state.cancel,
    addFavorite: state.addFavorite,
    clearFavorites: state.clearFavorites,
    setHistoryIndex: state.setHistoryIndex,
    clearHistory: state.clearHistory,
    setTitleDialogOpen: state.setTitleDialogOpen,
    setNewFavoriteTitle: state.setNewFavoriteTitle,
    setHelpDialogOpen: state.setHelpDialogOpen,
    setAboutDialogOpen: state.setAboutDialogOpen,
    setNavigatingHistory: state.setNavigatingHistory,
    setClearFavoritesDialogOpen: state.setClearFavoritesDialogOpen,
    setClearHistoryDialogOpen: state.setClearHistoryDialogOpen,
    handleNavigationError: state.handleNavigationError,
    setPrefetchedTitle: state.setPrefetchedTitle,
    clearErrorDetails: state.clearErrorDetails,
    setResetFavoritesDialogOpen: state.setResetFavoritesDialogOpen,
    setFutureSettingsDialogOpen: state.setFutureSettingsDialogOpen,
    setLanguage: state.setLanguage,
    setLocation: state.setLocation,
    setTimeMachineViewOpen: state.setTimeMachineViewOpen,
    fetchCachedYears: state.fetchCachedYears,
  }));

  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems(
    "internet-explorer",
    helpItems ?? []
  );

  const getLoadingTitle = useCallback(
    (baseTitle: string): string => {
      // If it looks like a URL, extract the hostname
      const titleToUse =
        baseTitle.includes("/") || baseTitle.includes(".")
          ? getHostnameFromUrl(baseTitle)
          : baseTitle;

      const formattedTitle = formatTitle(titleToUse);
      return formattedTitle === "Internet Explorer"
        ? t("apps.internet-explorer.loadingTitle")
        : t("apps.internet-explorer.loadingTitleWithSite", {
            site: formattedTitle,
          });
    },
    [t]
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const [hasMoreToScroll] = useState(false);
  const [isUrlDropdownOpen, setIsUrlDropdownOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<
    Array<SuggestionItem>
  >([]);
  const [localUrl, setLocalUrl] = useState<string>("");
  const [isSelectingText, setIsSelectingText] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const updateDropdownStyle = () => {
      if (isUrlDropdownOpen && urlInputRef.current) {
        const isMobileView = window.innerWidth < 640; // Tailwind 'sm' breakpoint (640px)

        if (isMobileView) {
          const inputRect = urlInputRef.current.getBoundingClientRect();
          const newTop = `${inputRect.bottom}px`;
          setDropdownStyle((prev) => {
            // Only update if values actually changed to prevent re-renders
            if (prev.top === newTop && prev.position === "fixed") {
              return prev;
            }
            return {
              position: "fixed",
              top: newTop,
              left: "1rem",
              right: "1rem",
              zIndex: 50,
            };
          });
        } else {
          // Not mobile, clear style if set
          setDropdownStyle((prev) => (Object.keys(prev).length > 0 ? {} : prev));
        }
      } else {
        // Dropdown not open, clear style if set
        setDropdownStyle((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      }
    };

    updateDropdownStyle();
    window.addEventListener("resize", updateDropdownStyle);

    return () => {
      window.removeEventListener("resize", updateDropdownStyle);
    };
  }, [isUrlDropdownOpen]);

  // Utility to normalize URLs for comparison
  const normalizeUrlInline = (url: string): string => {
    if (!url) return "";
    let normalized = url.trim().toLowerCase();
    normalized = normalized.replace(/^(https?:\/\/|ftp:\/\/)/i, "");
    normalized = normalized.replace(/\/$/g, "");
    normalized = normalized.replace(/^www\./i, "");
    return normalized;
  };

  // Strip protocol prefixes for display - memoized to prevent dependency issues
  const stripProtocol = useCallback((url: string): string => {
    if (!url) return "";
    return url.replace(/^(https?:\/\/|ftp:\/\/)/i, "");
  }, []);

  // Helper to validate if a URL is well-formed enough to be saved
  const isValidUrl = useCallback(
    (urlString: string): boolean => {
      // Fairly permissive validation - checks for at least a domain-like structure
      if (!urlString || !urlString.trim()) return false;

      // We shouldn't have protocols at this point, but just in case
      const trimmed = stripProtocol(urlString.trim());

      // Check for at least something that looks like a domain
      // Accept: domain.tld, domain, localhost, IP addresses
      // Make sure it doesn't start with "bing:" which is our internal marker
      if (trimmed.startsWith("bing:")) return false;

      return (
        /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?/i.test(
          trimmed
        ) ||
        /^localhost(:[0-9]+)?$/i.test(trimmed) ||
        /^(\d{1,3}\.){3}\d{1,3}(:[0-9]+)?$/i.test(trimmed)
      );
    },
    [stripProtocol]
  );

  const urlInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const favoritesContainerRef = useRef<HTMLDivElement>(null);

  const {
    generateFuturisticWebsite,
    aiGeneratedHtml: generatedHtml,
    isAiLoading,
    isFetchingWebsiteContent,
    stopGeneration,
  } = useAiGeneration({
    onLoadingChange: () => {},
    customTimeline: timelineSettings,
  });

  const { playElevatorMusic, stopElevatorMusic, playDingSound } =
    useTerminalSounds();

  const currentTheme = useThemeStore((state) => state.current);

  const currentYear = new Date().getFullYear();
  const pastYears = [
    "1000 BC",
    "1 CE",
    "500",
    "800",
    "1000",
    "1200",
    "1400",
    "1600",
    "1700",
    "1800",
    "1900",
    "1910",
    "1920",
    "1930",
    "1940",
    "1950",
    "1960",
    "1970",
    "1980",
    "1985",
    "1990",
    ...Array.from({ length: currentYear - 1991 + 1 }, (_, i) =>
      (1991 + i).toString()
    ).filter((year) => parseInt(year) !== currentYear),
  ].reverse();
  const futureYears = [
    "2150",
    "2200",
    "2250",
    "2300",
    "2400",
    "2500",
    "2750",
    "3000",
  ].sort((a, b) => parseInt(b) - parseInt(a));

  // Check if current year is in the future
  const isFutureYear = futureYears.includes(year);

  // Define loading state early to prevent hoisting issues
  const isLoading =
    status === "loading" || isAiLoading || isFetchingWebsiteContent;

  // Define animation variants for loading bar
  const loadingBarVariants = {
    hidden: { height: 0 },
    visible: { height: 4 },
  };

  // Generate share URL function (base64 encoded for clean URLs and OG tags)
  const ieGenerateShareUrl = useCallback(
    (identifier: string, secondaryIdentifier?: string) => {
      const combined = `${identifier}|${secondaryIdentifier || "current"}`;
      const code = btoa(combined)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      return `${window.location.origin}/internet-explorer/${code}`;
    },
    []
  );

  const [displayTitle, setDisplayTitle] = useState<string>("Internet Explorer");
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  useEffect(() => {
    let newTitle = "Internet Explorer";
    const baseTitle = currentPageTitle || url;
    const isTimeTravelling = status === "loading" && year !== "current";

    if (isTimeTravelling) {
      const titleToUse =
        baseTitle.includes("/") || baseTitle.includes(".")
          ? getHostnameFromUrl(baseTitle)
          : baseTitle;
      const formattedTitle = formatTitle(titleToUse);
      newTitle =
        formattedTitle === "Internet Explorer"
          ? t("apps.internet-explorer.travellingTitle")
          : t("apps.internet-explorer.travellingTitleWithSite", {
              site: formattedTitle,
            });
    } else if (status === "loading") {
      newTitle = getLoadingTitle(baseTitle);
    } else if (currentPageTitle) {
      newTitle = formatTitle(currentPageTitle);
    } else if (finalUrl) {
      try {
        const urlToParse =
          finalUrl.startsWith("http") || finalUrl.startsWith("/")
            ? finalUrl
            : `https://${finalUrl}`;
        const effectiveUrl = urlToParse.startsWith("/api/iframe-check")
          ? url
          : urlToParse;
        const hostname = new URL(
          effectiveUrl.startsWith("http")
            ? effectiveUrl
            : `https://${effectiveUrl}`
        ).hostname;
        newTitle = formatTitle(hostname);
      } catch {
        try {
          const fallbackHostname = getHostnameFromUrl(url);
          newTitle = formatTitle(fallbackHostname);
        } catch {
          console.debug(
            "[IE] Failed to parse both finalUrl and url for title:",
            finalUrl,
            url
          );
          newTitle = "Internet Explorer";
        }
      }
    }

    setDisplayTitle(newTitle);
  }, [status, currentPageTitle, finalUrl, url, year, t, getLoadingTitle]);

  const getWaybackUrl = async (targetUrl: string, year: string) => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const formattedUrl = targetUrl.startsWith("http")
      ? targetUrl
      : `https://${targetUrl}`;
    console.log(
      `[IE] Using Wayback Machine URL for ${formattedUrl} in ${year}`
    );
    const themeParam =
      typeof currentTheme === "string"
        ? `&theme=${encodeURIComponent(currentTheme)}`
        : "";
    return `/api/iframe-check?url=${encodeURIComponent(
      formattedUrl
    )}&year=${year}&month=${month}${themeParam}`;
  };

  // Ref to keep the most recent navigation token in sync without waiting for a render
  const navTokenRef = useRef<number>(0);

  const handleIframeLoad = async () => {
    if (
      iframeRef.current &&
      iframeRef.current.dataset.navToken === navTokenRef.current.toString()
    ) {
      const iframeSrc = iframeRef.current.src;
      if (
        iframeSrc.includes("/api/iframe-check") &&
        iframeRef.current.contentDocument
      ) {
        try {
          const textContent =
            iframeRef.current.contentDocument.body?.textContent?.trim();
          if (textContent) {
            // Only try to parse as JSON if it looks like JSON (starts with { or [)
            const looksLikeJson =
              textContent.startsWith("{") || textContent.startsWith("[");
            if (looksLikeJson) {
              try {
                const potentialErrorData = JSON.parse(
                  textContent
                ) as ErrorResponse;
                if (
                  potentialErrorData &&
                  potentialErrorData.error === true &&
                  potentialErrorData.type
                ) {
                  console.log(
                    "[IE] Detected JSON error response in iframe body:",
                    potentialErrorData
                  );
                  track(IE_ANALYTICS.NAVIGATION_ERROR, {
                    url: iframeSrc,
                    type: potentialErrorData.type,
                    status: potentialErrorData.status || 500,
                    message: potentialErrorData.message,
                  });
                  handleNavigationError(potentialErrorData, url);
                  return;
                }
              } catch {
                // Silently ignore - content looked like JSON but wasn't valid JSON
                // This is expected for regular HTML pages
              }
            }
          }

          const contentType = iframeRef.current.contentDocument.contentType;
          if (contentType === "application/json") {
            const text = iframeRef.current.contentDocument.body.textContent;
            if (text) {
              const errorData = JSON.parse(text) as ErrorResponse;
              if (errorData.error) {
                console.log(
                  "[IE] Detected error response (via content-type check):",
                  errorData
                );
                track(IE_ANALYTICS.NAVIGATION_ERROR, {
                  url: iframeSrc,
                  type: errorData.type,
                  status: errorData.status || 500,
                });
                handleNavigationError(errorData, url);
                return;
              }
            }
          }
        } catch (error) {
          console.warn("[IE] Error processing iframe content:", error);
        }
      }

      clearErrorDetails();

      setTimeout(() => {
        if (
          iframeRef.current &&
          iframeRef.current.dataset.navToken === navTokenRef.current.toString()
        ) {
          let loadedTitle: string | null = null;
          const currentUrlForFallback = url;
          const fallbackTitle = currentUrlForFallback
            ? new URL(
                currentUrlForFallback.startsWith("http")
                  ? currentUrlForFallback
                  : `https://${currentUrlForFallback}`
              ).hostname
            : "Internet Explorer";

          try {
            loadedTitle = iframeRef.current?.contentDocument?.title || null;
            if (loadedTitle) {
              const txt = document.createElement("textarea");
              txt.innerHTML = loadedTitle;
              loadedTitle = txt.value.trim();
            }
          } catch (error) {
            console.warn(
              "[IE] Failed to read iframe document title directly:",
              error
            );
          }

          if (!loadedTitle && finalUrl?.startsWith("/api/iframe-check")) {
            try {
              const metaTitle = iframeRef.current?.contentDocument
                ?.querySelector('meta[name="page-title"]')
                ?.getAttribute("content");
              if (metaTitle) {
                loadedTitle = decodeURIComponent(metaTitle);
              }
            } catch (error) {
              console.warn("[IE] Failed to read page-title meta tag:", error);
            }
          }

          const favicon = `https://www.google.com/s2/favicons?domain=${
            new URL(
              currentUrlForFallback.startsWith("http")
                ? currentUrlForFallback
                : `https://${currentUrlForFallback}`
            ).hostname
          }&sz=32`;

          track(IE_ANALYTICS.NAVIGATION_SUCCESS, {
            url: currentUrlForFallback,
            year: year,
            mode: mode,
            title: loadedTitle || fallbackTitle,
          });

          loadSuccess({
            title: loadedTitle || fallbackTitle,
            targetUrl: currentUrlForFallback,
            targetYear: year,
            favicon: favicon,
            addToHistory: !isNavigatingHistory,
          });
        }
      }, 50);
    }
  };

  const handleIframeError = () => {
    if (
      iframeRef.current &&
      iframeRef.current.dataset.navToken === navTokenRef.current.toString()
    ) {
      setTimeout(() => {
        if (
          iframeRef.current &&
          iframeRef.current.dataset.navToken === navTokenRef.current.toString()
        ) {
          try {
            const targetUrlForError = finalUrl || url;
            track(IE_ANALYTICS.NAVIGATION_ERROR, {
              url: targetUrlForError,
              type: "connection_error",
              status: 404,
            });
            handleNavigationError(
              {
                error: true,
                type: "connection_error",
                status: 404,
                message: `Cannot access ${targetUrlForError}. The website might be blocking access or requires authentication.`,
                details:
                  "The page could not be loaded in the iframe. This could be due to security restrictions or network issues.",
              },
              targetUrlForError
            );
          } catch (error) {
            const errorMsg = `Cannot access the requested website. ${
              error instanceof Error ? error.message : String(error)
            }`;
            track(IE_ANALYTICS.NAVIGATION_ERROR, {
              url: finalUrl || url,
              type: "generic_error",
              error: errorMsg,
            });
            loadError(errorMsg, {
              error: true,
              type: "generic_error",
              message: errorMsg,
            });
          }
        }
      }, 50);
    }
  };

  const handleNavigate = useCallback(
    async (
      targetUrlParam: string = localUrl || url,
      targetYearParam: string = year,
      forceRegenerate = false,
      currentHtmlContent: string | null = null
    ) => {
      // Check if offline and show error
      if (
        checkOfflineAndShowError(
          "Internet Explorer requires an internet connection to navigate"
        )
      ) {
        return;
      }

      clearErrorDetails();

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (isAiLoading) {
        stopGeneration();
      }
      if (iframeRef.current && status === "loading") {
        iframeRef.current.src = "about:blank";
      }

      const newMode =
        targetYearParam === "current"
          ? "now"
          : parseInt(targetYearParam) > new Date().getFullYear()
          ? "future"
          : "past";
      const newToken = Date.now();

      // --- Trim the URL from input before navigating ---
      // Use targetUrlParam directly as it's passed in, or trim the current store url if not passed
      const urlToNavigate = (
        targetUrlParam === url ? url.trim() : targetUrlParam
      ).trim();
      // Update store immediately so the input reflects the trimmed URL during loading
      setUrl(urlToNavigate);
      // --- End Trim ---

      // Store the latest token immediately so that asynchronous iframe load/error
      // handlers fired before the next React render can still validate correctly.
      navTokenRef.current = newToken;

      track(IE_ANALYTICS.NAVIGATION_START, {
        url: urlToNavigate,
        year: targetYearParam,
        mode: newMode,
      });

      navigateStart(urlToNavigate, targetYearParam, newMode, newToken);

      const normalizedTargetUrl = urlToNavigate.startsWith("http")
        ? urlToNavigate
        : `https://${urlToNavigate}`;

      try {
        if (
          newMode === "future" ||
          (newMode === "past" && parseInt(targetYearParam) <= 1995)
        ) {
          // Local caching removed to save localStorage space

          let remoteCacheHit = false;
          if (!forceRegenerate) {
            try {
              console.log(
                `[IE] Checking REMOTE cache for ${normalizedTargetUrl} in ${targetYearParam}...`
              );
              const res = await abortableFetch(
                `/api/iframe-check?mode=ai&url=${encodeURIComponent(
                  normalizedTargetUrl
                )}&year=${targetYearParam}`,
                {
                  signal: abortController.signal,
                  timeout: 15000,
                  throwOnHttpError: false,
                  retry: { maxAttempts: 1, initialDelayMs: 250 },
                }
              );
              if (abortController.signal.aborted) return;
              console.log(
                `[IE] Remote cache response status: ${res.status}, ok: ${
                  res.ok
                }, content-type: ${res.headers.get("content-type")}`
              );

              if (
                res.ok &&
                (res.headers.get("content-type") || "").includes("text/html")
              ) {
                remoteCacheHit = true;
                const html = await res.text();
                console.log(
                  `[IE] REMOTE cache HIT. Processing content (length: ${html.length})`
                );
                const titleMatch = html.match(/^<!--\s*TITLE:\s*(.*?)\s*-->/);
                const parsedTitle = titleMatch ? titleMatch[1].trim() : null;
                const cleanHtml = html.replace(
                  /^<!--\s*TITLE:.*?-->\s*\n?/,
                  ""
                );

                // Local caching removed to save localStorage space
                // Refresh cached years to update the count
                fetchCachedYears(normalizedTargetUrl);

                const favicon = `https://www.google.com/s2/favicons?domain=${
                  new URL(normalizedTargetUrl).hostname
                }&sz=32`;
                loadSuccess({
                  aiGeneratedHtml: cleanHtml,
                  title: parsedTitle || normalizedTargetUrl,
                  targetUrl: normalizedTargetUrl,
                  targetYear: targetYearParam,
                  favicon,
                  addToHistory: true,
                });
                console.log("[IE] Returning early after remote cache hit.");
                return;
              } else {
                console.log(`[IE] REMOTE cache MISS or invalid response.`);
              }
            } catch (e) {
              if (e instanceof Error && e.name === "AbortError") return;
              console.warn("[IE] AI remote cache fetch failed", e);
            }
          }

          if (remoteCacheHit) {
            console.error(
              "[IE] Logic error: Should have returned on remote cache hit, but didn't!"
            );
            return;
          }

          console.log(
            `[IE] No cache hit (Remote: ${remoteCacheHit}, Force: ${forceRegenerate}). Proceeding to generate...`
          );
          if (playElevatorMusic && terminalSoundsEnabled) {
            playElevatorMusic(newMode);
          }

          try {
            await generateFuturisticWebsite(
              normalizedTargetUrl,
              targetYearParam,
              abortController.signal,
              null,
              currentHtmlContent
            );
            if (abortController.signal.aborted) return;
          } catch (error) {
            if (abortController.signal.aborted) return;
            console.error("[IE] AI generation error:", error);
            handleNavigationError(
              {
                error: true,
                type: "ai_generation_error",
                message:
                  "Failed to generate futuristic website. AI model may not be selected.",
                details: error instanceof Error ? error.message : String(error),
              },
              normalizedTargetUrl
            );
            return;
          }
        } else {
          let urlToLoad = normalizedTargetUrl;

          if (newMode === "past") {
            try {
              const waybackUrl = await getWaybackUrl(
                normalizedTargetUrl,
                targetYearParam
              );
              if (abortController.signal.aborted) return;
              if (waybackUrl) {
                urlToLoad = waybackUrl;
              } else {
                await generateFuturisticWebsite(
                  normalizedTargetUrl,
                  targetYearParam,
                  abortController.signal,
                  null,
                  currentHtmlContent
                );
                if (abortController.signal.aborted) return;
                return;
              }
            } catch (waybackError) {
              if (abortController.signal.aborted) return;
              console.warn(
                `[IE] Wayback Machine error for ${normalizedTargetUrl}:`,
                waybackError
              );
              await generateFuturisticWebsite(
                normalizedTargetUrl,
                targetYearParam,
                abortController.signal,
                null,
                currentHtmlContent
              );
              if (abortController.signal.aborted) return;
              return;
            }
          } else if (newMode === "now") {
            // Check if domain should bypass proxy
            const isDirectBypass = isDirectPassthrough(normalizedTargetUrl);

            if (isDirectBypass) {
              logDirectPassthrough(normalizedTargetUrl);
              urlToLoad = normalizedTargetUrl;
            } else {
              // Proxy current year sites through iframe-check
              urlToLoad = `/api/iframe-check?url=${encodeURIComponent(
                normalizedTargetUrl
              )}&theme=${encodeURIComponent(currentTheme)}`;
            }

            try {
              const checkRes = await abortableFetch(
                `/api/iframe-check?mode=check&url=${encodeURIComponent(
                  normalizedTargetUrl
                )}&theme=${encodeURIComponent(currentTheme)}`,
                {
                  signal: abortController.signal,
                  timeout: 15000,
                  retry: { maxAttempts: 1, initialDelayMs: 250 },
                }
              );
              if (abortController.signal.aborted) return;

              const checkData = await checkRes.json();
              if (checkData.title) {
                setPrefetchedTitle(checkData.title);
              }
            } catch (error) {
              if (error instanceof Error && error.name === "AbortError") return;
              console.warn(`[IE] iframe-check fetch failed:`, error);
            }
          }

          if (urlToLoad === finalUrl) {
            urlToLoad = `${urlToLoad}${
              urlToLoad.includes("?") ? "&" : "?"
            }_t=${Date.now()}`;
          }

          setFinalUrl(urlToLoad);

          if (iframeRef.current) {
            iframeRef.current.dataset.navToken = newToken.toString();
            iframeRef.current.src = urlToLoad;
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(`[IE] Navigation error:`, error);
          handleNavigationError(
            {
              error: true,
              type: "navigation_error",
              message: `Failed to navigate: ${
                error instanceof Error ? error.message : String(error)
              }`,
              details: error instanceof Error ? error.stack : undefined,
            },
            normalizedTargetUrl
          );
        }
      }
    },
    [
      url,
      year,
      finalUrl,
      status,
      token,
      isAiLoading,
      isNavigatingHistory,
      currentPageTitle,
      aiGeneratedHtml,
      navigateStart,
      setFinalUrl,
      loadError,
      generateFuturisticWebsite,
      stopGeneration,
      loadSuccess,
      clearErrorDetails,
      handleNavigationError,
      setPrefetchedTitle,
      setYear,
      setUrl,
      fetchCachedYears,
      currentTheme,
    ]
  );

  const handleNavigateWithHistory = useCallback(
    async (targetUrl: string, targetYear?: string) => {
      setNavigatingHistory(false);
      setIsUrlDropdownOpen(false);
      handleNavigate(targetUrl, targetYear || year, false);
    },
    [handleNavigate, setNavigatingHistory, year]
  );

  const handleFilterSuggestions = useCallback(
    (inputValue: string) => {
      if (!inputValue.trim()) {
        // When URL bar is empty, show top 3 favorites
        const topFavorites: Array<SuggestionItem> = [];

        // First check for regular favorites (non-folders)
        favorites.forEach((fav) => {
          if (!fav.children && fav.url) {
            topFavorites.push({
              title: fav.title || "",
              url: fav.url,
              type: "favorite" as const,
              year: fav.year,
              favicon: fav.favicon,
            });
          }
        });

        // If we still have space, add favorites from folders
        if (topFavorites.length) {
          favorites.forEach((fav) => {
            if (fav.children && fav.children.length > 0) {
              fav.children.forEach((child) => {
                if (child.url) {
                  topFavorites.push({
                    title: child.title || "",
                    url: child.url,
                    type: "favorite" as const,
                    year: child.year,
                    favicon: child.favicon,
                  });
                }
              });
            }
          });
        }

        setFilteredSuggestions(topFavorites);
        setSelectedSuggestionIndex(topFavorites.length > 0 ? 0 : -1);
        return;
      }

      const normalizedInput = inputValue.toLowerCase();

      // Utility to normalize URLs inline for comparison
      const normalizeUrlInline = (url: string): string => {
        if (!url) return "";
        let normalized = url.trim().toLowerCase();
        normalized = normalized.replace(/^(https?:\/\/|ftp:\/\/)/i, "");
        normalized = normalized.replace(/\/$/g, "");
        normalized = normalized.replace(/^www\./i, "");
        return normalized;
      };

      // Function to process a single favorite
      const processFavorite = (fav: Favorite) => {
        // Match by title or URL
        if (
          fav.title?.toLowerCase().includes(normalizedInput) ||
          fav.url?.toLowerCase().includes(normalizedInput)
        ) {
          return {
            title: fav.title || "",
            url: fav.url || "",
            type: "favorite" as const,
            year: fav.year,
            favicon: fav.favicon,
            normalizedUrl: normalizeUrlInline(fav.url || ""),
          };
        }
        return null;
      };

      // Array to collect all matched favorites
      const allFavoriteSuggestions: Array<SuggestionItem> = [];

      // Process all favorites, including those in folders
      favorites.forEach((fav) => {
        if (fav.children) {
          // If it's a folder, process each child
          fav.children.forEach((child) => {
            const match = processFavorite(child);
            if (match) allFavoriteSuggestions.push(match);
          });
        } else if (fav.url) {
          // If it's a regular favorite
          const match = processFavorite(fav);
          if (match) allFavoriteSuggestions.push(match);
        }
      });

      // Process history items
      const historySuggestions = history
        .filter(
          (entry) =>
            !entry.url.startsWith("https://www.bing.com/search?q=") &&
            (entry.title?.toLowerCase().includes(normalizedInput) ||
              entry.url.toLowerCase().includes(normalizedInput))
        )
        .slice(0, 5) // Limit history suggestions
        .map((entry) => ({
          title: entry.title || entry.url,
          url: entry.url,
          type: "history" as const,
          year: entry.year,
          favicon: entry.favicon,
          normalizedUrl: normalizeUrlInline(entry.url),
        }));

      // Combine all suggestions
      const combinedSuggestions = [
        ...allFavoriteSuggestions,
        ...historySuggestions,
      ];

      // Deduplicate based on normalized URL
      const uniqueUrls = new Set<string>();
      const dedupedSuggestions = combinedSuggestions.filter((suggestion) => {
        if (
          !suggestion.normalizedUrl ||
          uniqueUrls.has(suggestion.normalizedUrl)
        ) {
          return false;
        }
        uniqueUrls.add(suggestion.normalizedUrl);
        return true;
      });

      // Create final suggestions without the normalizedUrl property
      const finalSuggestions: SuggestionItem[] = dedupedSuggestions.map(
        (item) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { normalizedUrl, ...rest } = item;
          return rest;
        }
      );

      console.log(
        "[IE Debug] Input:",
        inputValue,
        "Is Valid:",
        isValidUrl(inputValue)
      );

      if (inputValue.trim() && !isValidUrl(inputValue)) {
        finalSuggestions.push({
          title: `Search "${inputValue}"`,
          url: `bing:${inputValue}`, // Special marker for search
          type: "search" as const,
          favicon: "/icons/bing.png", // Assumes a bing icon exists
        });
      }

      setFilteredSuggestions(finalSuggestions);
      setSelectedSuggestionIndex(finalSuggestions.length > 0 ? 0 : -1);
    },
    [favorites, history, isValidUrl]
  );

  const handleGoBack = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setNavigatingHistory(true);
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, entry.year || "current", false);
    }
  }, [
    history,
    historyIndex,
    setHistoryIndex,
    handleNavigate,
    setNavigatingHistory,
  ]);

  const handleGoForward = useCallback(() => {
    if (historyIndex > 0) {
      setNavigatingHistory(true);
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      const entry = history[nextIndex];
      handleNavigate(entry.url, entry.year || "current", false);
    }
  }, [
    history,
    historyIndex,
    setHistoryIndex,
    handleNavigate,
    setNavigatingHistory,
  ]);

  const handleAddFavorite = useCallback(() => {
    const titleSource =
      currentPageTitle ||
      (() => {
        try {
          // If finalUrl exists and is an absolute http/https URL, use it directly.
          if (finalUrl && finalUrl.startsWith("http")) {
            return new URL(finalUrl).hostname;
          }
          // If finalUrl is a relative path (e.g. starts with /api/iframe-check), fall back to the main url.
          const candidate =
            finalUrl && !finalUrl.startsWith("/") ? finalUrl : url;
          if (candidate) {
            return new URL(
              candidate.startsWith("http") ? candidate : `https://${candidate}`
            ).hostname;
          }
        } catch (error) {
          console.error(
            "[IE] Error extracting hostname for favorite title:",
            error
          );
        }
        return "Page";
      })();
    setNewFavoriteTitle(titleSource);
    setTitleDialogOpen(true);
  }, [
    currentPageTitle,
    finalUrl,
    url,
    setNewFavoriteTitle,
    setTitleDialogOpen,
  ]);

  const handleTitleSubmit = useCallback(() => {
    if (!newFavoriteTitle) return;
    const favUrl = url;
    const favHostname = (() => {
      try {
        if (finalUrl && finalUrl.startsWith("http")) {
          return new URL(finalUrl).hostname;
        }
        const candidate =
          finalUrl && !finalUrl.startsWith("/") ? finalUrl : favUrl;
        if (candidate) {
          return new URL(
            candidate.startsWith("http") ? candidate : `https://${candidate}`
          ).hostname;
        }
      } catch (error) {
        console.error(
          "[IE] Error extracting hostname for favorite icon:",
          error
        );
      }
      return "unknown.com";
    })();
    const favIcon = `https://www.google.com/s2/favicons?domain=${favHostname}&sz=32`;
    addFavorite({
      title: newFavoriteTitle,
      url: favUrl,
      favicon: favIcon,
      year: year !== "current" ? year : undefined,
    });
    setTitleDialogOpen(false);
  }, [newFavoriteTitle, addFavorite, finalUrl, url, year, setTitleDialogOpen]);

  const handleResetFavorites = useCallback(() => {
    clearFavorites();
    DEFAULT_FAVORITES.forEach((fav) => addFavorite(fav));
    setResetFavoritesDialogOpen(false);
  }, [clearFavorites, addFavorite, setResetFavoritesDialogOpen]);

  const handleClearFavorites = useCallback(() => {
    clearFavorites();
    setClearFavoritesDialogOpen(false);
  }, [clearFavorites, setClearFavoritesDialogOpen]);

  const handleRefresh = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (iframeRef.current) iframeRef.current.src = "about:blank";
    handleNavigate(url, year, true);
  }, [handleNavigate, url, year]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    cancel();
    if (isAiLoading) {
      stopGeneration();
    }
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
    }
    clearErrorDetails();

    if (stopElevatorMusic) {
      stopElevatorMusic();
    }
  }, [
    cancel,
    isAiLoading,
    stopGeneration,
    clearErrorDetails,
    stopElevatorMusic,
  ]);

  const handleGoToUrl = useCallback(() => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
    setIsSelectingText(true);
  }, []);

  const handleHome = useCallback(() => {
    handleNavigate("apple.com", "2002");
  }, [handleNavigate]);

  // Use a ref to prevent duplicate initial navigations
  const initialNavigationRef = useRef(false);
  // Track the last processed initialData to avoid duplicates
  const lastProcessedInitialDataRef = useRef<unknown>(null);
  // Sync localUrl with store's url when the component loads or url changes from outside
  useEffect(() => {
    setLocalUrl(stripProtocol(url));
  }, [url, stripProtocol]);

  useEffect(() => {
    // Only run initial navigation logic once when the window opens
    if (!initialNavigationRef.current && isWindowOpen) {
      initialNavigationRef.current = true;
      console.log(
        "[IE] Running initial navigation check. Received initialData:",
        initialData
      );

      // Check if initialData contains a shareCode (passed via props on first open)
      if (initialData?.shareCode) {
        const code = initialData.shareCode;
        const decodedData = decodeData(code);

        if (decodedData) {
          console.log(
            `[IE] Decoded share link from initialData prop: ${decodedData.url} (${decodedData.year})`
          );
          toast.info(`Opening shared page`, {
            description: `${decodedData.url}${
              decodedData.year && decodedData.year !== "current"
                ? ` from ${decodedData.year}`
                : ""
            }`,
            duration: 4000,
          });
          // Navigate using decoded data
          setTimeout(() => {
            handleNavigate(
              decodedData.url,
              decodedData.year || "current",
              false
            );
            // Clear initialData after navigation is initiated
            if (instanceId) {
              clearInstanceInitialData(instanceId);
            }
          }, 0);
          // Mark this initialData as processed
          lastProcessedInitialDataRef.current = initialData;
          return; // Skip other initial navigation
        } else {
          console.warn(
            "[IE] Failed to decode share link code from initialData prop."
          );
          toast.error("Invalid Share Link", {
            description: "The share link provided is invalid or corrupted.",
            duration: 5000,
          });
          // Fall through to check for direct url/year or default navigation
        }
      }

      // --- NEW: Check for direct url and year in initialData ---
      if (initialData?.url && typeof initialData.url === "string") {
        const initialUrl = initialData.url;
        const initialYear =
          typeof initialData.year === "string"
            ? initialData.year
            : "current"; // Default to 'current' if year is missing or invalid
        console.log(
          `[IE] Navigating based on initialData url/year: ${initialUrl} (${initialYear})`
        );

        // --- FIX: Update store state BEFORE navigating and pass values directly ---
        setUrl(initialUrl);
        setYear(initialYear);
        // --- END FIX ---

        toast.info(`Opening requested page`, {
          description: `${initialUrl}${
            initialYear !== "current" ? ` from ${initialYear}` : ""
          }`,
          duration: 4000,
        });
        setTimeout(() => {
          // --- FIX: Pass initialUrl and initialYear directly ---
          handleNavigate(initialUrl, initialYear, false);
          // Clear initialData after navigation is initiated
          if (instanceId) {
            clearInstanceInitialData(instanceId);
          }
          // --- END FIX ---
        }, 0);
        // Mark this initialData as processed
        lastProcessedInitialDataRef.current = initialData;
        return; // Skip default navigation
      }
      // --- END NEW ---

      // Proceed with default navigation if not a share link or if decoding failed
      console.log("[IE] Proceeding with default navigation.");
      setTimeout(() => {
        handleNavigate(url, year, false);
      }, 0);
    }
  }, [
    initialData,
    isWindowOpen,
    handleNavigate,
    url,
    year,
    clearInstanceInitialData,
    instanceId,
    setUrl,
    setYear,
  ]);

  // --- Watch for initialData changes when app is already open ---
  useEffect(() => {
    // Only react to initialData changes if the window is already open and we have initialData
    if (!isWindowOpen || !initialData) return;

    // Skip if this initialData has already been processed
    if (lastProcessedInitialDataRef.current === initialData) return;

    // Only process if this is NOT the initial mount (initial navigation has already happened)
    if (initialNavigationRef.current === true) {
      console.log(
        "[IE] Detected initialData change for open window:",
        initialData
      );

      const typedInitialData = initialData as InternetExplorerInitialData;

      if (typedInitialData.shareCode) {
        const code = typedInitialData.shareCode;
        const decodedData = decodeData(code);

        if (decodedData) {
          console.log(
            `[IE] Navigating to shared link: ${decodedData.url} (${decodedData.year})`
          );
          toast.info(`Opening shared page`, {
            description: `${decodedData.url}${
              decodedData.year && decodedData.year !== "current"
                ? ` from ${decodedData.year}`
                : ""
            }`,
            duration: 4000,
          });
          setTimeout(() => {
            handleNavigate(
              decodedData.url,
              decodedData.year || "current",
              false
            );
            // Clear initialData after navigation
            if (instanceId) {
              clearInstanceInitialData(instanceId);
            }
          }, 50);
          // Mark this initialData as processed
          lastProcessedInitialDataRef.current = initialData;
        }
      } else if (
        typedInitialData.url &&
        typeof typedInitialData.url === "string"
      ) {
        const navUrl = typedInitialData.url;
        const navYear =
          typeof typedInitialData.year === "string"
            ? typedInitialData.year
            : "current";

        console.log(
          `[IE] Navigating to direct url/year: ${navUrl} (${navYear})`
        );
        toast.info(`Opening requested page`, {
          description: `${navUrl}${
            navYear !== "current" ? ` from ${navYear}` : ""
          }`,
          duration: 4000,
        });

        setTimeout(() => {
          handleNavigate(navUrl, navYear, false);
          // Clear initialData after navigation
          if (instanceId) {
            clearInstanceInitialData(instanceId);
          }
        }, 50);
        // Mark this initialData as processed
        lastProcessedInitialDataRef.current = initialData;
      }
    }
  }, [
    isWindowOpen,
    initialData,
    handleNavigate,
    clearInstanceInitialData,
    instanceId,
  ]);

  // --- Add listener for updateApp event (handles share links when app is already open) ---
  useEffect(() => {
    // Define a type for the initialData expected in the event detail
    interface AppUpdateInitialData {
      shareCode?: string;
      url?: string; // Add url
      year?: string; // Add year
    }

    const handleUpdateApp = (
      event: CustomEvent<{
        appId: string;
        instanceId?: string;
        initialData?: AppUpdateInitialData;
      }>
    ) => {
      if (
        event.detail.appId === "internet-explorer" &&
        (!event.detail.instanceId || event.detail.instanceId === instanceId)
      ) {
        const initialData = event.detail.initialData;

        // Skip if this initialData has already been processed
        if (lastProcessedInitialDataRef.current === initialData) return;

        if (initialData?.shareCode) {
          const code = initialData.shareCode;
          console.log("[IE] Received updateApp event with shareCode:", code);
          const decodedData = decodeData(code);

          if (decodedData) {
            console.log(
              `[IE] Decoded share link from updateApp event: ${decodedData.url} (${decodedData.year})`
            );

            // Show toast and navigate
            toast.info(`Opening shared page`, {
              description: `${decodedData.url}${
                decodedData.year && decodedData.year !== "current"
                  ? ` from ${decodedData.year}`
                  : ""
              }`,
              duration: 4000,
            });
            // Use timeout to allow potential state updates (like foreground) to settle
            setTimeout(() => {
              handleNavigate(
                decodedData.url,
                decodedData.year || "current",
                false
              );
            }, 50); // Small delay
            // Mark this initialData as processed
            lastProcessedInitialDataRef.current = initialData;
          } else {
            console.warn(
              "[IE] Failed to decode share link code from updateApp event."
            );
            toast.error("Invalid Share Link", {
              description: "The share link provided is invalid or corrupted.",
              duration: 5000,
            });
          }
        } else if (initialData?.url && typeof initialData.url === "string") {
          // --- NEW: Handle direct url/year from updateApp event ---
          const directUrl = initialData.url;
          const directYear =
            typeof initialData.year === "string" ? initialData.year : "current";
          console.log(
            `[IE] Received updateApp event with direct url/year: ${directUrl} (${directYear})`
          );

          // Show toast and navigate
          toast.info(`Opening requested page`, {
            description: `${directUrl}${
              directYear !== "current" ? ` from ${directYear}` : ""
            }`,
            duration: 4000,
          });

          // Use timeout to allow potential state updates (like foreground) to settle
          setTimeout(() => {
            handleNavigate(directUrl, directYear, false);
          }, 50); // Small delay
          // Mark this initialData as processed
          lastProcessedInitialDataRef.current = initialData;
          // --- END NEW ---
        }
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => {
      window.removeEventListener("updateApp", handleUpdateApp as EventListener);
    };
    // Add isForeground to dependencies to refresh navigation when focus changes
  }, [handleNavigate, isForeground, instanceId]);
  // --- End updateApp listener ---

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const messageData = event.data as
        | { type?: string; url?: string }
        | undefined;
      if (!messageData?.type) {
        return;
      }

      // Only accept messages from the current window origin.
      // This blocks untrusted cross-origin frames from driving navigation.
      if (event.origin !== window.location.origin) {
        return;
      }

      // For iframe-driven controls, ensure the sender is our active iframe.
      // aiHtmlNavigation is emitted by HtmlPreview's internal iframe(s), so it
      // is validated by same-origin only.
      const sourceWindow = event.source as Window | null;
      const currentIframeWindow = iframeRef.current?.contentWindow ?? null;
      const isFromActiveIframe =
        !!sourceWindow &&
        !!currentIframeWindow &&
        sourceWindow === currentIframeWindow;

      if (
        messageData.type !== "aiHtmlNavigation" &&
        !isFromActiveIframe
      ) {
        return;
      }

      if (
        messageData.type === "iframeNavigation" &&
        typeof messageData.url === "string"
      ) {
        console.log(
          `[IE] Received navigation request from iframe: ${messageData.url}`
        );
        handleNavigate(messageData.url, year);
      } else if (messageData.type === "goBack") {
        console.log(`[IE] Received back button request from iframe`);
        handleGoBack();
      } else if (
        messageData.type === "aiHtmlNavigation" &&
        typeof messageData.url === "string"
      ) {
        console.log(
          `[IE] Received navigation request from AI HTML preview: ${messageData.url}`
        );
        // Fetch the most up-to-date HTML from the store in case the closure is stale
        const contextHtml =
          useInternetExplorerStore.getState().aiGeneratedHtml;

        handleNavigate(messageData.url, year, false, contextHtml);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [year, handleNavigate, handleGoBack]);

  useEffect(() => {
    if (!isWindowOpen) {
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
    }
  }, [isWindowOpen, stopElevatorMusic]);

  useEffect(() => {
    const container = favoritesContainerRef.current;

    const handleWheel = (e: WheelEvent) => {
      if (!container) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAiLoading && !isFetchingWebsiteContent && status !== "loading") {
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
    }
  }, [isAiLoading, isFetchingWebsiteContent, status, stopElevatorMusic]);

  const getDebugStatusMessage = (): ReactNode => {
    if (!(status === "loading" || isAiLoading || isFetchingWebsiteContent))
      return null;

    const hostname = url ? getHostnameFromUrl(url) : "unknown";
    const aiModel = useAppStore.getState().aiModel;
    const modelInfo = aiModel ? `${aiModel} ` : "";

    // Get language and location display names
    const languageDisplayName =
      language !== "auto" ? getLanguageDisplayName(language) : "";
    const locationDisplayName =
      location !== "auto" ? getLocationDisplayName(location) : "";

    if (isFetchingWebsiteContent) {
      return React.createElement(
        "div",
        { className: "flex items-center gap-1" },
        debugMode &&
          React.createElement(
            "span",
            { className: "text-gray-500" },
            t("apps.internet-explorer.fetch")
          ),
        React.createElement(
          "span",
          null,
          t("apps.internet-explorer.fetchingContentForReconstruction", {
            hostname,
          })
        )
      );
    }

    switch (mode) {
      case "future":
        return React.createElement(
          "div",
          { className: "flex items-center gap-1" },
          debugMode &&
            React.createElement(
              "span",
              { className: "text-gray-500" },
              modelInfo,
              language !== "auto" && ` ${languageDisplayName}`,
              location !== "auto" && ` ${locationDisplayName}`
            ),
          React.createElement(
            "span",
            null,
            t("apps.internet-explorer.reimaginingForYear", {
              hostname,
              year,
            })
          )
        );
      case "past":
        if (parseInt(year) <= 1995) {
          return React.createElement(
            "div",
            { className: "flex items-center gap-1" },
            debugMode &&
              React.createElement(
                "span",
                { className: "text-gray-500" },
                modelInfo,
                language !== "auto" && ` ${languageDisplayName}`,
                location !== "auto" && ` ${locationDisplayName}`
              ),
            React.createElement(
              "span",
              null,
              t("apps.internet-explorer.reconstructingHistoryForYear", {
                hostname,
                year,
              })
            )
          );
        }
        return t("apps.internet-explorer.fetchingFromYear", { hostname, year });
      case "now":
        return t("apps.internet-explorer.loading", { hostname });
      default:
        return t("apps.internet-explorer.loading", { hostname });
    }
  };

  // --- Add custom sorting logic for TimeMachineView ---
  const chronologicallySortedYears = useMemo(() => {
    const parseYear = (yearStr: string): number => {
      if (yearStr === "current")
        return new Date().getFullYear() + 0.5; // Place 'current' slightly after the current year number
      if (yearStr.endsWith(" BC")) {
        return -parseInt(yearStr.replace(" BC", ""), 10);
      }
      if (yearStr.endsWith(" CE")) {
        return parseInt(yearStr.replace(" CE", ""), 10);
      }
      const yearNum = parseInt(yearStr, 10);
      return isNaN(yearNum) ? Infinity : yearNum; // Handle potential non-numeric strings
    };

    return [...cachedYears].sort((a, b) => parseYear(a) - parseYear(b));
  }, [cachedYears]);
  // --- End custom sorting logic ---

  const handleSharePage = useCallback(() => {
    setIsShareDialogOpen(true);
  }, []);

  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isOffline = useOffline();

  return {
    // Store state
    url,
    year,
    mode,
    token,
    favorites,
    history,
    historyIndex,
    isTitleDialogOpen,
    newFavoriteTitle,
    isHelpDialogOpen,
    isAboutDialogOpen,
    isNavigatingHistory,
    isClearFavoritesDialogOpen,
    isClearHistoryDialogOpen,
    currentPageTitle,
    timelineSettings,
    status,
    finalUrl,
    aiGeneratedHtml,
    errorDetails,
    isResetFavoritesDialogOpen,
    isFutureSettingsDialogOpen,
    language,
    location,
    isTimeMachineViewOpen,
    cachedYears,
    isFetchingCachedYears,

    // Store actions
    setUrl,
    setYear,
    setTitleDialogOpen,
    setNewFavoriteTitle,
    setHelpDialogOpen,
    setAboutDialogOpen,
    setNavigatingHistory,
    setClearFavoritesDialogOpen,
    setClearHistoryDialogOpen,
    clearErrorDetails,
    setResetFavoritesDialogOpen,
    setFutureSettingsDialogOpen,
    setLanguage,
    setLocation,
    setTimeMachineViewOpen,
    clearHistory,
    addFavorite,
    clearFavorites,

    // Local state
    hasMoreToScroll,
    isUrlDropdownOpen,
    setIsUrlDropdownOpen,
    filteredSuggestions,
    setFilteredSuggestions,
    localUrl,
    setLocalUrl,
    isSelectingText,
    setIsSelectingText,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    dropdownStyle,
    displayTitle,
    isShareDialogOpen,
    setIsShareDialogOpen,

    // Refs
    urlInputRef,
    iframeRef,
    favoritesContainerRef,
    abortControllerRef,
    navTokenRef,

    // AI generation
    generatedHtml,
    isAiLoading,
    isFetchingWebsiteContent,
    stopGeneration,

    // Sounds
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,

    // Theme and settings
    currentTheme,
    isXpTheme,
    debugMode,
    terminalSoundsEnabled,
    isOffline,

    // Years
    pastYears,
    futureYears,
    isFutureYear,
    chronologicallySortedYears,

    // Loading state
    isLoading,
    loadingBarVariants,

    // Handlers
    handleNavigate,
    handleNavigateWithHistory,
    handleFilterSuggestions,
    handleGoBack,
    handleGoForward,
    handleAddFavorite,
    handleTitleSubmit,
    handleResetFavorites,
    handleClearFavorites,
    handleRefresh,
    handleStop,
    handleGoToUrl,
    handleHome,
    handleSharePage,
    handleIframeLoad,
    handleIframeError,

    // Helpers
    stripProtocol,
    isValidUrl,
    normalizeUrlInline,
    normalizeUrlForHistory,
    getLoadingTitle,
    getDebugStatusMessage,
    getLanguageDisplayName,
    getLocationDisplayName,
    ieGenerateShareUrl,

    // App store actions
    bringInstanceToForeground,
    clearInstanceInitialData,

    // Translation
    t,
    translatedHelpItems,
  };
}
