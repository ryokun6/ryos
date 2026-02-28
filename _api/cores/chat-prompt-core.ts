import type { UIMessage } from "ai";
import type { MemoryIndex } from "../_utils/_memory.js";
import {
  CORE_PRIORITY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
  MEMORY_INSTRUCTIONS,
} from "../_utils/_aiPrompts.js";

// Helper to ensure messages are in UIMessage format for AI SDK v6
// Handles both simple { role, content } format and UIMessage format with parts
export type SimpleMessage = {
  id?: string;
  role: string;
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
};

export const ensureUIMessageFormat = (messages: SimpleMessage[]): UIMessage[] => {
  return messages.map((msg, index) => {
    if (msg.parts && Array.isArray(msg.parts)) {
      return {
        id: msg.id || `msg-${index}`,
        role: msg.role as UIMessage["role"],
        parts: msg.parts,
      } as UIMessage;
    }
    return {
      id: msg.id || `msg-${index}`,
      role: msg.role as UIMessage["role"],
      parts: [{ type: "text", text: msg.content || "" }],
    } as UIMessage;
  });
};

export interface SystemState {
  username?: string | null;
  userOS?: string;
  locale?: string;
  internetExplorer?: {
    url: string;
    year: string;
    currentPageTitle: string | null;
    aiGeneratedMarkdown?: string | null;
  };
  video?: {
    currentVideo: {
      id: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
  };
  ipod?: {
    currentTrack: {
      id: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    currentLyrics?: {
      lines: Array<{
        startTimeMs: string;
        words: string;
      }>;
    } | null;
  };
  karaoke?: {
    currentTrack: {
      id: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
  };
  textEdit?: {
    instances: Array<{
      instanceId: string;
      filePath: string | null;
      title: string;
      contentMarkdown?: string | null;
      hasUnsavedChanges: boolean;
    }>;
  };
  userLocalTime?: {
    timeString: string;
    dateString: string;
    timeZone: string;
  };
  requestGeo?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: string;
    longitude?: string;
  };
  runningApps?: {
    foreground: {
      instanceId: string;
      appId: string;
      title?: string;
      appletPath?: string;
      appletId?: string;
    } | null;
    background: Array<{
      instanceId: string;
      appId: string;
      title?: string;
      appletPath?: string;
      appletId?: string;
    }>;
  };
  chatRoomContext?: {
    roomId: string;
    recentMessages: string;
    mentionedMessage: string;
  };
}

const STATIC_SYSTEM_PROMPT = [
  CORE_PRIORITY_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
  MEMORY_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
].join("\n");

export const CACHE_CONTROL_OPTIONS = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" } },
  },
} as const;

export const generateDynamicSystemPrompt = (
  systemState?: SystemState,
  userMemories?: MemoryIndex | null,
  dailyNotesText?: string | null
) => {
  const now = new Date();
  const timeString = now.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateString = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const ryoTimeZone = "America/Los_Angeles";

  if (!systemState) return "";

  let prompt = `<system_state>
## USER CONTEXT
Current User: ${systemState.username || "you"}

## TIME & LOCATION
Ryo Time: ${timeString} on ${dateString} (${ryoTimeZone})`;

  if (systemState.userLocalTime) {
    prompt += `
User Time: ${systemState.userLocalTime.timeString} on ${systemState.userLocalTime.dateString} (${systemState.userLocalTime.timeZone})`;
  }
  if (systemState.userOS) {
    prompt += `
User OS: ${systemState.userOS}`;
  }
  if (systemState.locale) {
    prompt += `
User Locale: ${systemState.locale}`;
  }
  if (systemState.requestGeo) {
    const location = [systemState.requestGeo.city, systemState.requestGeo.country]
      .filter(Boolean)
      .join(", ");
    prompt += `
User Location: ${location} (inferred from IP, may be inaccurate)`;
  }

  if (dailyNotesText) {
    prompt += `\n\n## DAILY NOTES (recent journal)`;
    prompt += `\n${dailyNotesText}`;
  }
  if (userMemories && userMemories.memories.length > 0) {
    prompt += `\n\n## LONG-TERM MEMORIES`;
    prompt += `\nYou have ${userMemories.memories.length} long-term memories about this user:`;
    for (const mem of userMemories.memories) {
      prompt += `\n- ${mem.key}: ${mem.summary}`;
    }
    prompt += `\nUse memoryRead("key") to get full details for any memory.`;
  }

  prompt += `\n\n## RUNNING APPLICATIONS`;

  const formatAppInstance = (inst: {
    appId: string;
    title?: string;
    appletPath?: string;
    appletId?: string;
  }) => {
    let info = inst.appId;
    if (inst.title) info += ` (${inst.title})`;
    if (inst.appId === "applet-viewer") {
      if (inst.appletPath) info += ` [path: ${inst.appletPath}]`;
      if (inst.appletId) info += ` [appletId: ${inst.appletId}]`;
    }
    return info;
  };

  if (systemState.runningApps?.foreground) {
    prompt += `
Foreground: ${formatAppInstance(systemState.runningApps.foreground)}`;
  } else {
    prompt += `
Foreground: None`;
  }

  if (systemState.runningApps?.background && systemState.runningApps.background.length > 0) {
    const backgroundApps = systemState.runningApps.background
      .map((inst) => formatAppInstance(inst))
      .join(", ");
    prompt += `
Background: ${backgroundApps}`;
  } else {
    prompt += `
Background: None`;
  }

  let hasMedia = false;

  if (systemState.video?.currentVideo && systemState.video.isPlaying) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const videoArtist = systemState.video.currentVideo.artist
      ? ` by ${systemState.video.currentVideo.artist}`
      : "";
    prompt += `
Video: ${systemState.video.currentVideo.title}${videoArtist} (Playing)`;
  }

  const hasOpenIpod =
    systemState.runningApps?.foreground?.appId === "ipod" ||
    systemState.runningApps?.background?.some((app) => app.appId === "ipod");

  if (hasOpenIpod && systemState.ipod?.currentTrack) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const playingStatus = systemState.ipod.isPlaying ? "Playing" : "Paused";
    const trackArtist = systemState.ipod.currentTrack.artist
      ? ` by ${systemState.ipod.currentTrack.artist}`
      : "";
    prompt += `
iPod: ${systemState.ipod.currentTrack.title}${trackArtist} (${playingStatus})`;

    if (systemState.ipod.currentLyrics?.lines) {
      const lyricsText = systemState.ipod.currentLyrics.lines.map((line) => line.words).join("\n");
      prompt += `
Lyrics:
${lyricsText}`;
    }
  }

  const hasOpenKaraoke =
    systemState.runningApps?.foreground?.appId === "karaoke" ||
    systemState.runningApps?.background?.some((app) => app.appId === "karaoke");

  if (hasOpenKaraoke && systemState.karaoke?.currentTrack) {
    if (!hasMedia) {
      prompt += `\n\n## MEDIA PLAYBACK`;
      hasMedia = true;
    }
    const karaokePlayingStatus = systemState.karaoke.isPlaying ? "Playing" : "Paused";
    const karaokeTrackArtist = systemState.karaoke.currentTrack.artist
      ? ` by ${systemState.karaoke.currentTrack.artist}`
      : "";
    prompt += `
Karaoke: ${systemState.karaoke.currentTrack.title}${karaokeTrackArtist} (${karaokePlayingStatus})`;

    if (!hasOpenIpod && systemState.ipod?.currentLyrics?.lines) {
      const lyricsText = systemState.ipod.currentLyrics.lines.map((line) => line.words).join("\n");
      prompt += `
Lyrics:
${lyricsText}`;
    }
  }

  const hasOpenInternetExplorer =
    systemState.runningApps?.foreground?.appId === "internet-explorer" ||
    systemState.runningApps?.background?.some(
      (app) => app.appId === "internet-explorer"
    );

  if (hasOpenInternetExplorer && systemState.internetExplorer?.url) {
    prompt += `\n\n## INTERNET EXPLORER
URL: ${systemState.internetExplorer.url}
Time Travel Year: ${systemState.internetExplorer.year}`;

    if (systemState.internetExplorer.currentPageTitle) {
      prompt += `
Page Title: ${systemState.internetExplorer.currentPageTitle}`;
    }

    const htmlMd = systemState.internetExplorer.aiGeneratedMarkdown;
    if (htmlMd) {
      prompt += `
Page Content (Markdown):
${htmlMd}`;
    }
  }

  if (
    systemState.textEdit?.instances &&
    systemState.textEdit.instances.length > 0
  ) {
    prompt += `\n\n## TEXTEDIT DOCUMENTS (${systemState.textEdit.instances.length} open)`;

    systemState.textEdit.instances.forEach((instance, index) => {
      const unsavedMark = instance.hasUnsavedChanges ? " *" : "";
      const pathInfo = instance.filePath ? ` [${instance.filePath}]` : "";
      prompt += `
${index + 1}. ${instance.title}${unsavedMark}${pathInfo} (instanceId: ${instance.instanceId})`;

      if (instance.contentMarkdown) {
        const preview =
          instance.contentMarkdown.length > 500
            ? instance.contentMarkdown.substring(0, 500) + "..."
            : instance.contentMarkdown;
        prompt += `
   Content:
   ${preview}`;
      }
    });
  }

  prompt += `\n</system_state>`;

  if (systemState.chatRoomContext) {
    prompt += `\n\n<chat_room_reply_instructions>
## CHAT ROOM CONTEXT
Room ID: ${systemState.chatRoomContext.roomId}
Your Role: Respond as 'ryo' in this IRC-style chat room
Response Style: Use extremely concise responses

Recent Conversation:
${systemState.chatRoomContext.recentMessages}

Mentioned Message: "${systemState.chatRoomContext.mentionedMessage}"
</chat_room_reply_instructions>`;
  }

  return prompt;
};

export const buildContextAwarePrompts = () => {
  const prompts = [STATIC_SYSTEM_PROMPT];
  const loadedSections = ["STATIC_SYSTEM_PROMPT"];
  return { prompts, loadedSections };
};
