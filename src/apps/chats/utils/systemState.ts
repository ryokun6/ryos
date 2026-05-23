import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { getIpodChatContextTrack, useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useTvStore } from "@/stores/useTvStore";
import { buildTvChannelLineup, DEFAULT_CHANNELS } from "@/apps/tv/data/channels";
import { htmlToMarkdown } from "@/utils/markdown";
import { generateHtmlFromJsonSync } from "@/utils/tiptapHtml";

export const detectUserOS = (): string => {
  if (typeof navigator === "undefined") return "Unknown";

  const userAgent = navigator.userAgent;
  const platform = navigator.platform || "";

  if (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "iOS";
  }

  if (/Android/.test(userAgent)) return "Android";
  if (/Win/.test(platform)) return "Windows";
  if (/Mac/.test(platform)) return "macOS";
  if (/Linux/.test(platform)) return "Linux";
  return "Unknown";
};

export const getSystemState = () => {
  const appStore = useAppStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const karaokeStore = useKaraokeStore.getState();
  const textEditStore = useTextEditStore.getState();
  const chatsStore = useChatsStore.getState();
  const languageStore = useLanguageStore.getState();
  const tvStore = useTvStore.getState();

  const currentVideo = videoStore.getCurrentVideo();
  const currentTrack = getIpodChatContextTrack(ipodStore);
  const karaokeCurrentTrack = karaokeStore.currentSongId
    ? ipodStore.tracks.find((track) => track.id === karaokeStore.currentSongId)
    : ipodStore.tracks[0] ?? null;

  const tvChannelLineup = buildTvChannelLineup(
    tvStore.customChannels,
    tvStore.hiddenDefaultChannelIds
  ).map((ch) => ({
    ch,
    isCustom: !DEFAULT_CHANNELS.some((defaultChannel) => defaultChannel.id === ch.id),
  }));
  const tvCurrentEntry =
    tvChannelLineup.find(({ ch }) => ch.id === tvStore.currentChannelId) ??
    tvChannelLineup[0] ??
    null;
  const tvCurrentChannel = tvCurrentEntry
    ? {
        id: tvCurrentEntry.ch.id,
        number: tvCurrentEntry.ch.number,
        name: tvCurrentEntry.ch.name,
        description: tvCurrentEntry.ch.description,
        isCustom: tvCurrentEntry.isCustom,
        videoCount:
          tvCurrentEntry.ch.id === "mtv"
            ? ipodStore.tracks.length
            : tvCurrentEntry.ch.id === "ryos-picks"
              ? videoStore.videos.length
              : tvCurrentEntry.ch.videos.length,
      }
    : null;
  const tvCustomChannels = buildTvChannelLineup(
    tvStore.customChannels,
    tvStore.hiddenDefaultChannelIds
  ).reduce<
    {
      id: string;
      number: number;
      name: string;
      description: string;
      videoCount: number;
    }[]
  >((acc, channel) => {
    if (DEFAULT_CHANNELS.some((defaultChannel) => defaultChannel.id === channel.id)) {
      return acc;
    }
    acc.push({
      id: channel.id,
      number: channel.number,
      name: channel.name,
      description: channel.description ?? "",
      videoCount: channel.videos.length,
    });
    return acc;
  }, []);

  const runningInstances = Object.entries(appStore.instances).reduce<
    {
      instanceId: string;
      appId: string;
      isForeground: boolean;
      title?: string;
      appletPath?: string;
      appletId?: string;
    }[]
  >((acc, [instanceId, instance]) => {
    if (!instance.isOpen) return acc;

    const base = {
      instanceId,
      appId: instance.appId,
      isForeground: instance.isForeground || false,
      title: instance.title,
    };

    if (instance.appId === "applet-viewer" && instance.initialData) {
      const appletData = instance.initialData as { path?: string; shareCode?: string };
      acc.push({
        ...base,
        appletPath: appletData.path || undefined,
        appletId: appletData.shareCode || undefined,
      });
      return acc;
    }

    acc.push(base);
    return acc;
  }, []);

  const foregroundInstance =
    runningInstances.find((instance) => instance.isForeground) || null;
  const backgroundInstances = runningInstances.filter(
    (instance) => !instance.isForeground
  );

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

  const textEditInstancesData = Object.values(textEditStore.instances).map((instance) => {
    let contentMarkdown: string | null = null;
    if (instance.contentJson) {
      try {
        const htmlStr = generateHtmlFromJsonSync(instance.contentJson);
        if (htmlStr) contentMarkdown = htmlToMarkdown(htmlStr);
      } catch (err) {
        console.error("Failed to convert TextEdit content to markdown:", err);
      }
    }

    let title = "Untitled";
    if (instance.filePath) {
      const filename = instance.filePath.split("/").pop() || "Untitled";
      title = filename.replace(/\.md$/, "");
    } else {
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
    userOS: detectUserOS(),
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
            source: currentTrack.source,
          }
        : null,
      librarySource: ipodStore.librarySource,
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
    tv: {
      currentChannel: tvCurrentChannel,
      isPlaying: tvStore.isPlaying,
      customChannels: tvCustomChannels,
    },
    textEdit: {
      instances: textEditInstancesData,
    },
  };
};
