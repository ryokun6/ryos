import { generateHTML } from "@tiptap/core";
import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { detectUserOS } from "@/utils/userOS";
import { htmlToMarkdown } from "@/utils/markdown";
import { TEXTEDIT_TIPTAP_EXTENSIONS } from "./textEditSerialization";

export const getSystemState = () => {
  const appStore = useAppStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const karaokeStore = useKaraokeStore.getState();
  const textEditStore = useTextEditStore.getState();
  const chatsStore = useChatsStore.getState();
  const languageStore = useLanguageStore.getState();

  const currentVideo = videoStore.getCurrentVideo();
  const currentTrack = ipodStore.currentSongId
    ? ipodStore.tracks.find((t) => t.id === ipodStore.currentSongId)
    : ipodStore.tracks[0] ?? null;

  // Karaoke uses the shared track library from iPod store
  const karaokeCurrentTrack = karaokeStore.currentSongId
    ? ipodStore.tracks.find((t) => t.id === karaokeStore.currentSongId)
    : ipodStore.tracks[0] ?? null;

  // Detect user's operating system
  const userOS = detectUserOS();

  // Use new instance-based model instead of legacy apps
  const runningInstances = Object.entries(appStore.instances)
    .filter(([, instance]) => instance.isOpen)
    .map(([instanceId, instance]) => {
      const base = {
        instanceId,
        appId: instance.appId,
        isForeground: instance.isForeground || false,
        title: instance.title,
      };
      // For applet-viewer instances, include the applet path
      if (instance.appId === "applet-viewer" && instance.initialData) {
        const appletData = instance.initialData as {
          path?: string;
          shareCode?: string;
        };
        return {
          ...base,
          appletPath: appletData.path || undefined,
          appletId: appletData.shareCode || undefined,
        };
      }
      return base;
    });

  const foregroundInstance =
    runningInstances.find((inst) => inst.isForeground) || null;
  const backgroundInstances = runningInstances.filter(
    (inst) => !inst.isForeground,
  );

  // --- Local browser time information (client side) ---
  const nowClient = new Date();
  const userTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  const userTimeString = nowClient.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const userDateString = nowClient.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Convert TextEdit instances to compact markdown for prompt inclusion
  const textEditInstances = Object.values(textEditStore.instances);
  const textEditInstancesData = textEditInstances.map((instance) => {
    let contentMarkdown: string | null = null;
    if (instance.contentJson) {
      try {
        const htmlStr = generateHTML(
          instance.contentJson,
          TEXTEDIT_TIPTAP_EXTENSIONS
        );
        contentMarkdown = htmlToMarkdown(htmlStr);
      } catch (err) {
        console.error("Failed to convert TextEdit content to markdown:", err);
      }
    }

    // Get title from file path if available, otherwise from app store instance
    let title = "Untitled";
    if (instance.filePath) {
      // Extract filename from path (e.g., "/Documents/example.md" -> "example.md")
      const filename = instance.filePath.split("/").pop() || "Untitled";
      // Remove .md extension for cleaner display
      title = filename.replace(/\.md$/, "");
    } else {
      // Fall back to app store instance title
      const appInstance = appStore.instances[instance.instanceId];
      title = appInstance?.title || "Untitled";
    }

    return {
      instanceId: instance.instanceId,
      filePath: instance.filePath,
      title,
      contentMarkdown,
      hasUnsavedChanges: instance.hasUnsavedChanges,
    };
  });

  // Convert IE HTML content to markdown for compact prompts
  let ieHtmlMarkdown: string | null = null;
  if (ieStore.aiGeneratedHtml) {
    try {
      ieHtmlMarkdown = htmlToMarkdown(ieStore.aiGeneratedHtml);
    } catch (err) {
      console.error("Failed to convert IE HTML to markdown:", err);
    }
  }

  return {
    username: chatsStore.username,
    userOS,
    locale: languageStore.current,
    userLocalTime: {
      timeString: userTimeString,
      dateString: userDateString,
      timeZone: userTimeZone,
    },
    runningApps: {
      foreground: foregroundInstance,
      background: backgroundInstances,
    },
    internetExplorer: {
      url: ieStore.url,
      year: ieStore.year,
      currentPageTitle: ieStore.currentPageTitle,
      aiGeneratedMarkdown: ieHtmlMarkdown,
    },
    video: {
      currentVideo: currentVideo
        ? {
            id: currentVideo.id,
            title: currentVideo.title,
            artist: currentVideo.artist,
          }
        : null,
      isPlaying: videoStore.isPlaying,
    },
    ipod: {
      currentTrack: currentTrack
        ? {
            id: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artist,
          }
        : null,
      isPlaying: ipodStore.isPlaying,
      currentLyrics: ipodStore.currentLyrics,
    },
    karaoke: {
      currentTrack: karaokeCurrentTrack
        ? {
            id: karaokeCurrentTrack.id,
            title: karaokeCurrentTrack.title,
            artist: karaokeCurrentTrack.artist,
          }
        : null,
      isPlaying: karaokeStore.isPlaying,
    },
    textEdit: {
      instances: textEditInstancesData,
    },
  };
};
