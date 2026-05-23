/**
 * Snapshot helpers for the AI chat system-state payload.
 *
 * `getSystemState()` is called every time a chat request is sent (via the
 * transport's `body` factory) to give the model an up-to-date picture of
 * the running OS — open apps, foreground instance, locale, time, and
 * per-app state (TV channels, iPod track, karaoke, TextEdit instances,
 * IE page). The returned object is also reused by `useRyoChat` for the
 * server-side `/api/ai/ryo-reply` endpoint.
 *
 * Module-private helpers (visible-text extraction, foreground check,
 * background notification) live alongside it because they all operate on
 * the same `UIMessage` shape from the Vercel AI SDK and share state via
 * the global Zustand stores.
 */

import type { UIMessage } from "@ai-sdk/react";

import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import {
  getIpodChatContextTrack,
  useIpodStore,
} from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useTvStore } from "@/stores/useTvStore";
import { useVideoStore } from "@/stores/useVideoStore";
import {
  buildTvChannelLineup,
  DEFAULT_CHANNELS,
} from "@/apps/tv/data/channels";
import { showAiMessageNotification } from "@/utils/chatNotificationDisplay";
import { htmlToMarkdown } from "@/utils/markdown";
import { generateHtmlFromJsonSync } from "@/utils/tiptapHtml";
import { detectUserOS } from "../tools/helpers";

/**
 * Build the system-state payload sent to the AI chat backend.
 *
 * Synchronously snapshots the relevant Zustand stores; no async work, no
 * side effects. Safe to call from a transport `body` factory.
 */
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

  // Karaoke uses the shared track library from iPod store
  const karaokeCurrentTrack = karaokeStore.currentSongId
    ? ipodStore.tracks.find((t) => t.id === karaokeStore.currentSongId)
    : ipodStore.tracks[0] ?? null;

  // --- TV: current channel + lineup ---
  // The TV app shuffles channel videos at render time, so a persisted
  // index doesn't map to a stable "current video". Surface the current
  // channel + lineup metadata so the AI can reason about the lineup,
  // tune in, and edit channels via tvControl.
  const tvChannelLineup = buildTvChannelLineup(
    tvStore.customChannels,
    tvStore.hiddenDefaultChannelIds
  ).map((ch) => ({
    ch,
    isCustom: !DEFAULT_CHANNELS.some((d) => d.id === ch.id),
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
    if (
      DEFAULT_CHANNELS.some((defaultChannel) => defaultChannel.id === channel.id)
    ) {
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

  // Detect user's operating system
  const userOS = detectUserOS();

  // Use new instance-based model instead of legacy apps
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
    if (!instance.isOpen) {
      return acc;
    }

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
    runningInstances.find((inst) => inst.isForeground) || null;
  const backgroundInstances = runningInstances.filter(
    (inst) => !inst.isForeground
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
        const htmlStr = generateHtmlFromJsonSync(instance.contentJson);
        if (htmlStr) contentMarkdown = htmlToMarkdown(htmlStr);
      } catch (err) {
        console.error("Failed to convert TextEdit content to markdown:", err);
      }
    }

    // Get title from file path if available, otherwise from app store instance
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
      // Custom channels can be edited; default channels can be deleted from
      // the visible lineup and restored via TV's reset action.
      customChannels: tvCustomChannels,
    },
    textEdit: {
      instances: textEditInstancesData,
    },
  };
};

/**
 * Extract the plain visible text from an assistant `UIMessage`.
 *
 * Concatenates the `text` of every `text` part, stripping the `!!!!`
 * prefix used for urgent messages. Tool-call parts and other non-text
 * parts are ignored. Returns "" for messages with no text parts.
 */
export const getAssistantVisibleText = (message: UIMessage): string => {
  type MessagePart = {
    type: string;
    text?: string;
  };

  if (message.parts && message.parts.length > 0) {
    return message.parts
      .reduce<string[]>((acc, part: MessagePart) => {
        if (part.type !== "text") {
          return acc;
        }
        const text = part.text || "";
        acc.push(text.startsWith("!!!!") ? text.slice(4).trimStart() : text);
        return acc;
      }, [])
      .join("");
  }

  return "";
};

/** True iff the Chats app's window is the foreground app instance. */
export const isChatsInForeground = (): boolean => {
  const appStore = useAppStore.getState();
  const foregroundId = appStore.foregroundInstanceId;
  if (!foregroundId) return false;
  const foregroundInstance = appStore.instances[foregroundId];
  return foregroundInstance?.appId === "chats";
};

/**
 * Show a notification with an assistant message's visible text when the
 * Chats app is not in the foreground. Used by `useAiChat` on every
 * `onFinish`.
 */
export const showBackgroundedMessageNotification = (
  message: UIMessage
): void => {
  const textContent = getAssistantVisibleText(message);
  if (!textContent.trim()) return;

  showAiMessageNotification({
    content: textContent,
    messageId: message.id,
  });
};
