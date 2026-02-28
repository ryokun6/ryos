import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { appRegistry, getAppIconPath, getNonFinderApps } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistry";
import { useFilesStore } from "@/stores/useFilesStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { getTranslatedAppName } from "@/utils/i18n";
import type {
  SpotlightSearchSnapshot,
  SpotlightWorkerResponse,
  SpotlightWorkerResultPayload,
} from "@/workers/spotlightSearch.shared";

export interface SpotlightResult {
  id: string;
  type:
    | "app"
    | "document"
    | "applet"
    | "music"
    | "site"
    | "video"
    | "setting"
    | "command"
    | "ai";
  title: string;
  subtitle?: string;
  icon: string;
  isEmoji?: boolean;
  /** Optional thumbnail URL (cover art, favicon, image preview) */
  thumbnail?: string;
  /** Override section header label (e.g. "Top Hits" for empty state) */
  sectionLabel?: string;
  action: () => void;
  keywords?: string[];
}

export interface SpotlightSearchState {
  results: SpotlightResult[];
  isSearching: boolean;
}

// Hardcoded settings that can be searched
const SEARCHABLE_SETTINGS: Array<{
  id: string;
  titleKey: string;
  keywords: string[];
  tab: string;
  icon: string;
}> = [
  {
    id: "setting-theme",
    titleKey: "spotlight.settings.theme",
    keywords: [
      "theme",
      "appearance",
      "system 7",
      "mac os x",
      "aqua",
      "windows xp",
      "windows 98",
      "dark",
      "light",
    ],
    tab: "appearance",
    icon: "🎨",
  },
  {
    id: "setting-wallpaper",
    titleKey: "spotlight.settings.wallpaper",
    keywords: ["wallpaper", "background", "desktop", "picture"],
    tab: "appearance",
    icon: "🖼️",
  },
  {
    id: "setting-sounds",
    titleKey: "spotlight.settings.sounds",
    keywords: ["sound", "volume", "audio", "mute", "music", "speech"],
    tab: "sound",
    icon: "🔊",
  },
  {
    id: "setting-language",
    titleKey: "spotlight.settings.language",
    keywords: [
      "language",
      "locale",
      "translate",
      "english",
      "chinese",
      "japanese",
      "korean",
      "french",
      "german",
      "spanish",
    ],
    tab: "system",
    icon: "🌐",
  },
  {
    id: "setting-screensaver",
    titleKey: "spotlight.settings.screenSaver",
    keywords: ["screen saver", "screensaver", "idle", "sleep"],
    tab: "appearance",
    icon: "💫",
  },
];

// Terminal commands
const SEARCHABLE_COMMANDS = [
  { name: "ls", description: "List files", keywords: ["list", "directory"] },
  { name: "cd", description: "Change directory", keywords: ["navigate", "folder"] },
  { name: "pwd", description: "Print working directory", keywords: ["path", "current"] },
  { name: "touch", description: "Create file", keywords: ["new", "create"] },
  { name: "rm", description: "Remove file", keywords: ["delete", "remove"] },
  { name: "mkdir", description: "Create directory", keywords: ["folder", "new"] },
  { name: "echo", description: "Print text", keywords: ["print", "output"] },
  { name: "grep", description: "Search text", keywords: ["find", "search", "pattern"] },
  { name: "whoami", description: "Current user", keywords: ["user", "name"] },
  { name: "cowsay", description: "ASCII cow", keywords: ["fun", "cow", "ascii"] },
  { name: "ryo", description: "Ask Ryo AI", keywords: ["ai", "chat", "assistant"] },
];

const MAX_RESULTS_PER_TYPE = 4;
const MAX_TOTAL_RESULTS = 12;

function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.toLowerCase();
  return fields.some(
    (field) => field && field.toLowerCase().includes(q)
  );
}

const buildSpotlightSearchSnapshot = (): SpotlightSearchSnapshot => {
  const { items } = useFilesStore.getState();
  const { tracks } = useIpodStore.getState();
  const { favorites } = useInternetExplorerStore.getState();
  const { videos } = useVideoStore.getState();

  return {
    items,
    tracks,
    favorites,
    videos,
  };
};

const mapWorkerResultToSpotlightResult = (
  result: SpotlightWorkerResultPayload,
  launchApp: ReturnType<typeof useLaunchApp>
): SpotlightResult => {
  switch (result.type) {
    case "document":
      return {
        id: result.id,
        type: "document",
        title: result.title,
        subtitle: "Documents",
        icon: "file-text.png",
        action: () =>
          launchApp("textedit", { initialData: { path: result.path } }),
      };
    case "applet":
      return {
        id: result.id,
        type: "applet",
        title: result.title,
        subtitle: "Applets",
        icon: result.icon && !result.icon.startsWith("/") && !result.icon.startsWith("http")
          ? result.icon
          : "applets.png",
        isEmoji: result.isEmoji,
        action: () =>
          launchApp("applet-viewer", {
            initialData: { path: result.path, content: "" },
          }),
      };
    case "music":
      return {
        id: result.id,
        type: "music",
        title: result.title,
        subtitle: result.subtitle,
        icon: getAppIconPath("ipod"),
        thumbnail: result.thumbnail,
        action: () =>
          launchApp("ipod", { initialData: { videoId: result.videoId } }),
      };
    case "site":
      return {
        id: result.id,
        type: "site",
        title: result.title,
        subtitle: result.subtitle,
        icon: getAppIconPath("internet-explorer"),
        thumbnail: result.thumbnail,
        action: () =>
          launchApp("internet-explorer", {
            initialData: { url: result.url, year: result.year || "current" },
          }),
      };
    case "video":
      return {
        id: result.id,
        type: "video",
        title: result.title,
        subtitle: result.subtitle,
        icon: getAppIconPath("videos"),
        thumbnail: result.thumbnail,
        action: () =>
          launchApp("videos", { initialData: { videoId: result.videoId } }),
      };
  }
};

export function useSpotlightSearch(query: string): SpotlightSearchState {
  const { t } = useTranslation();
  const launchApp = useLaunchApp();
  const workerRef = useRef<Worker | null>(null);
  const currentQueryRef = useRef(query);
  const latestQueryRequestIdRef = useRef(0);
  const hasPostedIndexRef = useRef(false);
  const [dynamicResults, setDynamicResults] = useState<SpotlightWorkerResultPayload[]>([]);
  const [isSearchingDynamicResults, setIsSearchingDynamicResults] = useState(false);

  useEffect(() => {
    currentQueryRef.current = query;
  }, [query]);

  const postIndexUpdate = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    worker.postMessage({
      type: "index",
      snapshot: buildSpotlightSearchSnapshot(),
    });
    hasPostedIndexRef.current = true;
  }, []);

  const sendDynamicQuery = useCallback(
    (rawQuery: string) => {
      const trimmedQuery = rawQuery.trim();

      latestQueryRequestIdRef.current += 1;

      if (!trimmedQuery) {
        setDynamicResults([]);
        setIsSearchingDynamicResults(false);
        return;
      }

      const worker = workerRef.current;
      if (!worker) {
        setDynamicResults([]);
        setIsSearchingDynamicResults(false);
        return;
      }

      if (!hasPostedIndexRef.current) {
        postIndexUpdate();
      }

      const requestId = latestQueryRequestIdRef.current;
      setDynamicResults([]);
      setIsSearchingDynamicResults(true);
      worker.postMessage({
        type: "query",
        query: trimmedQuery,
        requestId,
      });
    },
    [postIndexUpdate]
  );

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    const worker = new Worker(
      new URL("../workers/spotlightSearch.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<SpotlightWorkerResponse>) => {
      const message = event.data;
      if (
        message.type !== "query-result" ||
        message.requestId !== latestQueryRequestIdRef.current
      ) {
        return;
      }

      setDynamicResults(message.results);
      setIsSearchingDynamicResults(false);
    };

    const refreshWorkerIndex = () => {
      postIndexUpdate();

      if (currentQueryRef.current.trim()) {
        sendDynamicQuery(currentQueryRef.current);
      }
    };

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(
        () => {
          idleHandle = null;
          postIndexUpdate();
        },
        { timeout: 1000 }
      );
    } else {
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        postIndexUpdate();
      }, 50);
    }

    let itemsRef = useFilesStore.getState().items;
    const unsubscribeFiles = useFilesStore.subscribe((state) => {
      if (state.items === itemsRef) {
        return;
      }

      itemsRef = state.items;
      refreshWorkerIndex();
    });

    let tracksRef = useIpodStore.getState().tracks;
    const unsubscribeTracks = useIpodStore.subscribe((state) => {
      if (state.tracks === tracksRef) {
        return;
      }

      tracksRef = state.tracks;
      refreshWorkerIndex();
    });

    let favoritesRef = useInternetExplorerStore.getState().favorites;
    const unsubscribeFavorites = useInternetExplorerStore.subscribe((state) => {
      if (state.favorites === favoritesRef) {
        return;
      }

      favoritesRef = state.favorites;
      refreshWorkerIndex();
    });

    let videosRef = useVideoStore.getState().videos;
    const unsubscribeVideos = useVideoStore.subscribe((state) => {
      if (state.videos === videosRef) {
        return;
      }

      videosRef = state.videos;
      refreshWorkerIndex();
    });

    return () => {
      unsubscribeFiles();
      unsubscribeTracks();
      unsubscribeFavorites();
      unsubscribeVideos();

      if (idleHandle !== null) {
        window.cancelIdleCallback(idleHandle);
      }

      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }

      worker.terminate();
      workerRef.current = null;
    };
  }, [postIndexUpdate, sendDynamicQuery]);

  useEffect(() => {
    sendDynamicQuery(query);
  }, [query, sendDynamicQuery]);

  const results = useMemo(() => {
    const trimmed = query.trim();

    // Empty query — show top apps
    if (!trimmed) {
      const topApps: AppId[] = [
        "chats",
        "finder",
        "textedit",
        "internet-explorer",
        "ipod",
        "terminal",
      ];
      return topApps.map((appId) => ({
        id: `app-${appId}`,
        type: "app" as const,
        title: getTranslatedAppName(appId),
        icon: getAppIconPath(appId),
        sectionLabel: "spotlight.topHits",
        action: () => launchApp(appId),
      }));
    }

    const results: SpotlightResult[] = [];

    // 1. Applications
    const apps = getNonFinderApps(false);
    // Always include Finder
    const allApps = [
      { name: "Finder", icon: getAppIconPath("finder"), id: "finder" as AppId },
      ...apps,
    ];
    const appResults = allApps
      .filter((app) =>
        matchesQuery(
          trimmed,
          getTranslatedAppName(app.id),
          app.name,
          appRegistry[app.id]?.description
        )
      )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((app) => ({
        id: `app-${app.id}`,
        type: "app" as const,
        title: getTranslatedAppName(app.id),
        icon: getAppIconPath(app.id),
        action: () => launchApp(app.id),
      }));
    results.push(...appResults);

    // 2-6. Heavy dynamic categories are resolved in a worker.
    results.push(
      ...dynamicResults.map((result) =>
        mapWorkerResultToSpotlightResult(result, launchApp)
      )
    );

    // 7. Settings
    const settingResults = SEARCHABLE_SETTINGS.filter((setting) =>
      matchesQuery(trimmed, t(setting.titleKey), ...setting.keywords)
    )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((setting) => ({
        id: setting.id,
        type: "setting" as const,
        title: t(setting.titleKey),
        subtitle: t("spotlight.sections.settings"),
        icon: getAppIconPath("control-panels"),
        action: () =>
          launchApp("control-panels", { initialData: { defaultTab: setting.tab } }),
      }));
    results.push(...settingResults);

    // 8. Terminal Commands
    const cmdResults = SEARCHABLE_COMMANDS.filter((cmd) =>
      matchesQuery(trimmed, cmd.name, cmd.description, ...cmd.keywords)
    )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((cmd) => ({
        id: `cmd-${cmd.name}`,
        type: "command" as const,
        title: cmd.name,
        subtitle: cmd.description,
        icon: getAppIconPath("terminal"),
        action: () => launchApp("terminal", { initialData: { prefillCommand: cmd.name } }),
      }));
    results.push(...cmdResults);

    // 9. AI Fallback — always present when there's a query
    results.push({
      id: "ai-ask-ryo",
      type: "ai" as const,
      title: `${t("spotlight.askRyo")} \u201C${trimmed}\u201D`,
      icon: getAppIconPath("chats"),
      action: () => launchApp("chats", { initialData: { prefillMessage: trimmed, autoSend: true } }),
    });

    // Cap total
    return results.slice(0, MAX_TOTAL_RESULTS);
  }, [query, t, launchApp, dynamicResults]);

  return {
    results,
    isSearching: query.trim().length > 0 && isSearchingDynamicResults,
  };
}
