import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { appRegistry, getAppIconPath, getNonFinderApps } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistry";
import { useFilesStore } from "@/stores/useFilesStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { getTranslatedAppName } from "@/utils/i18n";

export interface SpotlightResult {
  id: string;
  type:
    | "app"
    | "document"
    | "applet"
    | "music"
    | "setting"
    | "command"
    | "ai";
  title: string;
  subtitle?: string;
  icon: string;
  isEmoji?: boolean;
  action: () => void;
  keywords?: string[];
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
const MAX_TOTAL_RESULTS = 10;

function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.toLowerCase();
  return fields.some(
    (field) => field && field.toLowerCase().includes(q)
  );
}

export function useSpotlightSearch(query: string): SpotlightResult[] {
  const { t } = useTranslation();
  const launchApp = useLaunchApp();
  const fileItems = useFilesStore((state) => state.items);
  const tracks = useIpodStore((state) => state.tracks);

  return useMemo(() => {
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
        subtitle: appRegistry[appId]?.description,
        icon: getAppIconPath(appId),
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
        subtitle: appRegistry[app.id]?.description,
        icon: getAppIconPath(app.id),
        action: () => launchApp(app.id),
      }));
    results.push(...appResults);

    // 2. Documents
    const docResults = Object.values(fileItems)
      .filter(
        (item) =>
          item.status === "active" &&
          !item.isDirectory &&
          item.path.startsWith("/Documents/") &&
          matchesQuery(trimmed, item.name, item.path)
      )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((item) => ({
        id: `doc-${item.path}`,
        type: "document" as const,
        title: item.name,
        subtitle: item.path,
        icon: "📄",
        isEmoji: true,
        action: () => launchApp("textedit", { initialData: { path: item.path } }),
      }));
    results.push(...docResults);

    // 3. Applets
    const appletResults = Object.values(fileItems)
      .filter(
        (item) =>
          item.status === "active" &&
          !item.isDirectory &&
          item.path.startsWith("/Applets/") &&
          matchesQuery(trimmed, item.name, item.path)
      )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((item) => ({
        id: `applet-${item.path}`,
        type: "applet" as const,
        title: item.name.replace(/\.(html|app)$/i, ""),
        subtitle: item.path,
        icon: item.icon && !item.icon.startsWith("/") ? item.icon : "📦",
        isEmoji: true,
        action: () =>
          launchApp("applet-viewer", { initialData: { path: item.path, content: "" } }),
      }));
    results.push(...appletResults);

    // 4. Music
    const musicResults = tracks
      .filter((track) =>
        matchesQuery(trimmed, track.title, track.artist, track.album)
      )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((track) => ({
        id: `music-${track.id}`,
        type: "music" as const,
        title: track.title,
        subtitle: track.artist || undefined,
        icon: "🎵",
        isEmoji: true,
        action: () => launchApp("ipod", { initialData: { videoId: track.id } }),
      }));
    results.push(...musicResults);

    // 5. Settings
    const settingResults = SEARCHABLE_SETTINGS.filter((setting) =>
      matchesQuery(trimmed, t(setting.titleKey), ...setting.keywords)
    )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((setting) => ({
        id: setting.id,
        type: "setting" as const,
        title: t(setting.titleKey),
        subtitle: t("spotlight.sections.settings"),
        icon: setting.icon,
        isEmoji: true,
        action: () =>
          launchApp("control-panels", { initialData: { defaultTab: setting.tab } }),
      }));
    results.push(...settingResults);

    // 6. Terminal Commands
    const cmdResults = SEARCHABLE_COMMANDS.filter((cmd) =>
      matchesQuery(trimmed, cmd.name, cmd.description, ...cmd.keywords)
    )
      .slice(0, MAX_RESULTS_PER_TYPE)
      .map((cmd) => ({
        id: `cmd-${cmd.name}`,
        type: "command" as const,
        title: cmd.name,
        subtitle: cmd.description,
        icon: "⌨️",
        isEmoji: true,
        action: () => launchApp("terminal"),
      }));
    results.push(...cmdResults);

    // 7. AI Fallback — always present when there's a query
    results.push({
      id: "ai-ask-ryo",
      type: "ai" as const,
      title: `${t("spotlight.askRyo")}: ${trimmed}`,
      icon: getAppIconPath("chats"),
      action: () => launchApp("chats"),
    });

    // Cap total
    return results.slice(0, MAX_TOTAL_RESULTS);
  }, [query, t, launchApp, fileItems, tracks]);
}
