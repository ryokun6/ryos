import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import { useFilesStore } from "@/stores/useFilesStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useAppStore } from "@/stores/useAppStore";
import { getTranslatedAppName } from "@/utils/i18n";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import type { LaunchAppOptions } from "@/hooks/useLaunchApp";
import type { ChatListOperationDependencies } from "./chatListOperation";
import type { ChatOpenToolDependencies } from "./chatFileToolHandlers";

export const createChatListToolDependencies = (): ChatListOperationDependencies => ({
  getMusicItems: () => {
    const ipodStore = useIpodStore.getState();
    return ipodStore.tracks.map((track) => ({
      path: `/Music/${track.id}`,
      id: track.id,
      title: track.title,
      artist: track.artist,
    }));
  },
  getSharedApplets: async () => {
    const response = await abortableFetch(getApiUrl("/api/share-applet?list=true"), {
      timeout: 15000,
      retry: { maxAttempts: 2, initialDelayMs: 500 },
    });
    const data = await response.json();
    return Array.isArray(data?.applets) ? data.applets : [];
  },
  getApplications: () =>
    Object.entries(appRegistry)
      .filter(([id]) => id !== "finder")
      .map(([id, app]) => ({
        path: `/Applications/${id}`,
        name: app.name,
      })),
  getFileItems: (root) => {
    const filesStore = useFilesStore.getState();
    return Object.values(filesStore.items)
      .filter(
        (item) =>
          item.status === "active" &&
          item.path.startsWith(`${root}/`) &&
          !item.isDirectory &&
          item.path !== `${root}/`,
      )
      .map((file) => ({
        path: file.path,
        name: file.name,
        type: file.type,
      }));
  },
});

export const createChatOpenToolDependencies = ({
  launchApp,
}: {
  launchApp: (appId: AppId, options?: LaunchAppOptions) => string;
}): ChatOpenToolDependencies => ({
  launchApp: (appId, options) => {
    launchApp(appId as AppId, options as LaunchAppOptions);
  },
  resolveApplicationName: (appId) => {
    const typedAppId = appId as AppId;
    return appRegistry[typedAppId] ? getTranslatedAppName(typedAppId) : null;
  },
  playMusicTrack: (songId) => {
    const ipodState = useIpodStore.getState();
    const track = ipodState.tracks.find((candidate) => candidate.id === songId);
    if (!track) {
      return { ok: false, error: `Song not found: ${songId}` };
    }

    const appState = useAppStore.getState();
    const ipodInstances = appState.getInstancesByAppId("ipod");
    if (!ipodInstances.some((inst) => inst.isOpen)) {
      launchApp("ipod");
    }

    ipodState.setCurrentSongId(songId);
    ipodState.setIsPlaying(true);
    return {
      ok: true,
      title: track.title,
      artist: track.artist,
    };
  },
});
