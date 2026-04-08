import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { Redis } from "./redis.js";
import {
  convertToModelMessages,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import {
  ANSWER_STYLE_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  CORE_PRIORITY_INSTRUCTIONS,
  MEMORY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  TELEGRAM_CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
} from "./_aiPrompts.js";
import {
  DEFAULT_MODEL,
  getModelInstance,
  type SupportedModel,
} from "./_aiModels.js";
import {
  getDailyNotesForPrompt,
  getMemoryIndex,
  type MemoryIndex,
} from "./_memory.js";
import {
  createChatTools,
  type ChatToolProfile,
  type ChatToolsContext,
} from "../chat/tools/index.js";
import { createCachedSystemMessage } from "./prompt-caching.js";

export interface RyoConversationSystemState {
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

export type RyoConversationChannel = "chat" | "telegram";

export interface SimpleConversationMessage {
  id?: string;
  role: string;
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}

export interface LoadedRyoMemoryContext {
  userMemories: MemoryIndex | null;
  dailyNotesText: string | null;
  userTimeZone?: string;
}

export interface PrepareRyoConversationOptions {
  channel: RyoConversationChannel;
  messages: SimpleConversationMessage[];
  systemState?: RyoConversationSystemState;
  username?: string | null;
  model?: SupportedModel;
  redis?: Redis;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
  timeZone?: string;
  toolProfile?: ChatToolProfile;
  toolContextOverrides?: Partial<ChatToolsContext>;
  preloadedMemoryContext?: LoadedRyoMemoryContext;
}

export interface PreparedRyoConversation {
  selectedModel: LanguageModel;
  tools: ToolSet;
  enrichedMessages: ModelMessage[];
  loadedSections: string[];
  staticSystemPrompt: string;
  dynamicSystemPrompt: string;
  userMemories: MemoryIndex | null;
  dailyNotesText: string | null;
  userTimeZone?: string;
}

const CHANNEL_PROMPT_SECTIONS = {
  chat: [
    CORE_PRIORITY_INSTRUCTIONS,
    ANSWER_STYLE_INSTRUCTIONS,
    RYO_PERSONA_INSTRUCTIONS,
    CHAT_INSTRUCTIONS,
    TOOL_USAGE_INSTRUCTIONS,
    MEMORY_INSTRUCTIONS,
    CODE_GENERATION_INSTRUCTIONS,
  ],
  telegram: [
    CORE_PRIORITY_INSTRUCTIONS,
    ANSWER_STYLE_INSTRUCTIONS,
    RYO_PERSONA_INSTRUCTIONS,
    TELEGRAM_CHAT_INSTRUCTIONS,
    MEMORY_INSTRUCTIONS,
  ],
} as const;

const CHANNEL_TOOL_PROFILES: Record<RyoConversationChannel, ChatToolProfile> = {
  chat: "all",
  telegram: "telegram",
};

const CHANNEL_STATE_PROFILES = {
  chat: {
    allowWithoutSystemState: false,
    includeRunningApps: true,
    includeMedia: true,
    includeBrowser: true,
    includeTextEdit: true,
    includeChatRoomContext: true,
  },
  telegram: {
    allowWithoutSystemState: true,
    includeRunningApps: false,
    includeMedia: false,
    includeBrowser: false,
    includeTextEdit: false,
    includeChatRoomContext: false,
  },
} as const;

function defaultLog(): void {}

function shouldEnableOpenAIWebSearch({
  model,
  username,
}: {
  model: SupportedModel;
  username?: string | null;
}): boolean {
  return model === "gpt-5.4" && !!username;
}

function shouldEnableGoogleSearch({
  model,
  username,
}: {
  model: SupportedModel;
  username?: string | null;
}): boolean {
  return model === "gemini-3-flash" && !!username;
}

function createOpenAIWebSearchTool(
  systemState?: RyoConversationSystemState
): ReturnType<typeof openai.tools.webSearch> {
  const requestGeo = systemState?.requestGeo;
  const userTimeZone = systemState?.userLocalTime?.timeZone;
  const hasLocationContext =
    !!requestGeo?.country ||
    !!requestGeo?.city ||
    !!requestGeo?.region ||
    !!userTimeZone;

  return openai.tools.webSearch(
    hasLocationContext
      ? {
          userLocation: {
            type: "approximate",
            ...(requestGeo?.country ? { country: requestGeo.country } : {}),
            ...(requestGeo?.city ? { city: requestGeo.city } : {}),
            ...(requestGeo?.region ? { region: requestGeo.region } : {}),
            ...(userTimeZone ? { timezone: userTimeZone } : {}),
          },
        }
      : {}
  );
}

function createGoogleSearchTool(): ReturnType<typeof google.tools.googleSearch> {
  return google.tools.googleSearch({});
}

export function ensureUIMessageFormat(
  messages: SimpleConversationMessage[]
): UIMessage[] {
  return messages.map((msg, index) => {
    if (msg.parts && Array.isArray(msg.parts)) {
      const sanitizedParts = msg.parts.map((part) => {
        if (part.type === "text" && typeof part.text !== "string") {
          return { ...part, text: "" };
        }
        return part;
      });

      return {
        id: msg.id || `msg-${index}`,
        role: msg.role as UIMessage["role"],
        parts: sanitizedParts,
      } as UIMessage;
    }

    return {
      id: msg.id || `msg-${index}`,
      role: msg.role as UIMessage["role"],
      parts: [{ type: "text", text: msg.content || "" }],
    } as UIMessage;
  });
}

export function buildStaticSystemPrompt(
  channel: RyoConversationChannel
): string {
  return CHANNEL_PROMPT_SECTIONS[channel].join("\n");
}

export function buildContextAwarePrompts(channel: RyoConversationChannel): {
  prompts: string[];
  loadedSections: string[];
} {
  return {
    prompts: [buildStaticSystemPrompt(channel)],
    loadedSections: [
      channel === "telegram"
        ? "TELEGRAM_STATIC_SYSTEM_PROMPT"
        : "STATIC_SYSTEM_PROMPT",
    ],
  };
}

export async function loadRyoMemoryContext({
  redis,
  username,
  timeZone,
  log = defaultLog,
  logError = defaultLog,
}: {
  redis?: Redis;
  username?: string | null;
  timeZone?: string;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
}): Promise<LoadedRyoMemoryContext> {
  if (!redis || !username) {
    return {
      userMemories: null,
      dailyNotesText: null,
      userTimeZone: timeZone,
    };
  }

  try {
    const [userMemories, dailyNotesText] = await Promise.all([
      getMemoryIndex(redis, username),
      getDailyNotesForPrompt(redis, username, timeZone),
    ]);

    if (userMemories) {
      log(
        `Loaded ${userMemories.memories.length} long-term memories for user ${username}`
      );
    }
    if (dailyNotesText) {
      log(`Loaded daily notes for user ${username}`);
    }

    return {
      userMemories,
      dailyNotesText,
      userTimeZone: timeZone,
    };
  } catch (error) {
    logError("Error fetching user memories/notes:", error);
    return {
      userMemories: null,
      dailyNotesText: null,
      userTimeZone: timeZone,
    };
  }
}

export function buildDynamicSystemPrompt({
  channel,
  systemState,
  username,
  userMemories,
  dailyNotesText,
}: {
  channel: RyoConversationChannel;
  systemState?: RyoConversationSystemState;
  username?: string | null;
  userMemories?: MemoryIndex | null;
  dailyNotesText?: string | null;
}): string {
  const channelProfile = CHANNEL_STATE_PROFILES[channel];
  const effectiveState =
    systemState ||
    (channelProfile.allowWithoutSystemState
      ? ({ username } as RyoConversationSystemState)
      : undefined);

  if (!effectiveState) {
    return "";
  }

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
  const currentUser = effectiveState.username || username || "you";

  let prompt = `<system_state>
## USER CONTEXT
Current User: ${currentUser}

## TIME & LOCATION
Ryo Time: ${timeString} on ${dateString} (${ryoTimeZone})`;

  if (effectiveState.userLocalTime) {
    prompt += `
User Time: ${effectiveState.userLocalTime.timeString} on ${effectiveState.userLocalTime.dateString} (${effectiveState.userLocalTime.timeZone})`;
  }

  if (effectiveState.userOS) {
    prompt += `
User OS: ${effectiveState.userOS}`;
  }

  if (effectiveState.locale) {
    prompt += `
User Locale: ${effectiveState.locale}`;
  }

  if (effectiveState.requestGeo) {
    const location = [
      effectiveState.requestGeo.city,
      effectiveState.requestGeo.country,
    ]
      .filter(Boolean)
      .join(", ");
    if (location) {
      prompt += `
User Location: ${location} (inferred from IP, may be inaccurate)`;
    }
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

  if (channelProfile.includeRunningApps) {
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

    if (effectiveState.runningApps?.foreground) {
      prompt += `
Foreground: ${formatAppInstance(effectiveState.runningApps.foreground)}`;
    } else {
      prompt += `
Foreground: None`;
    }

    if (
      effectiveState.runningApps?.background &&
      effectiveState.runningApps.background.length > 0
    ) {
      const backgroundApps = effectiveState.runningApps.background
        .map((inst) => formatAppInstance(inst))
        .join(", ");
      prompt += `
Background: ${backgroundApps}`;
    } else {
      prompt += `
Background: None`;
    }
  }

  if (channelProfile.includeMedia) {
    let hasMedia = false;

    if (effectiveState.video?.currentVideo && effectiveState.video.isPlaying) {
      if (!hasMedia) {
        prompt += `\n\n## MEDIA PLAYBACK`;
        hasMedia = true;
      }
      const videoArtist = effectiveState.video.currentVideo.artist
        ? ` by ${effectiveState.video.currentVideo.artist}`
        : "";
      prompt += `
Video: ${effectiveState.video.currentVideo.title}${videoArtist} (Playing)`;
    }

    const hasOpenIpod =
      effectiveState.runningApps?.foreground?.appId === "ipod" ||
      effectiveState.runningApps?.background?.some(
        (app) => app.appId === "ipod"
      );

    if (hasOpenIpod && effectiveState.ipod?.currentTrack) {
      if (!hasMedia) {
        prompt += `\n\n## MEDIA PLAYBACK`;
        hasMedia = true;
      }
      const playingStatus = effectiveState.ipod.isPlaying ? "Playing" : "Paused";
      const trackArtist = effectiveState.ipod.currentTrack.artist
        ? ` by ${effectiveState.ipod.currentTrack.artist}`
        : "";
      prompt += `
iPod: ${effectiveState.ipod.currentTrack.title}${trackArtist} (${playingStatus})`;

      if (effectiveState.ipod.currentLyrics?.lines) {
        const lyricsText = effectiveState.ipod.currentLyrics.lines
          .map((line) => line.words)
          .join("\n");
        prompt += `
Lyrics:
${lyricsText}`;
      }
    }

    const hasOpenKaraoke =
      effectiveState.runningApps?.foreground?.appId === "karaoke" ||
      effectiveState.runningApps?.background?.some(
        (app) => app.appId === "karaoke"
      );

    if (hasOpenKaraoke && effectiveState.karaoke?.currentTrack) {
      if (!hasMedia) {
        prompt += `\n\n## MEDIA PLAYBACK`;
        hasMedia = true;
      }
      const karaokePlayingStatus = effectiveState.karaoke.isPlaying
        ? "Playing"
        : "Paused";
      const karaokeTrackArtist = effectiveState.karaoke.currentTrack.artist
        ? ` by ${effectiveState.karaoke.currentTrack.artist}`
        : "";
      prompt += `
Karaoke: ${effectiveState.karaoke.currentTrack.title}${karaokeTrackArtist} (${karaokePlayingStatus})`;

      if (!hasOpenIpod && effectiveState.ipod?.currentLyrics?.lines) {
        const lyricsText = effectiveState.ipod.currentLyrics.lines
          .map((line) => line.words)
          .join("\n");
        prompt += `
Lyrics:
${lyricsText}`;
      }
    }
  }

  if (
    channelProfile.includeBrowser &&
    ((effectiveState.runningApps?.foreground?.appId === "internet-explorer") ||
      effectiveState.runningApps?.background?.some(
        (app) => app.appId === "internet-explorer"
      )) &&
    effectiveState.internetExplorer?.url
  ) {
    prompt += `\n\n## INTERNET EXPLORER
URL: ${effectiveState.internetExplorer.url}
Time Travel Year: ${effectiveState.internetExplorer.year}`;

    if (effectiveState.internetExplorer.currentPageTitle) {
      prompt += `
Page Title: ${effectiveState.internetExplorer.currentPageTitle}`;
    }

    const htmlMd = effectiveState.internetExplorer.aiGeneratedMarkdown;
    if (htmlMd) {
      prompt += `
Page Content (Markdown):
${htmlMd}`;
    }
  }

  if (
    channelProfile.includeTextEdit &&
    effectiveState.textEdit?.instances &&
    effectiveState.textEdit.instances.length > 0
  ) {
    prompt += `\n\n## TEXTEDIT DOCUMENTS (${effectiveState.textEdit.instances.length} open)`;

    effectiveState.textEdit.instances.forEach((instance, index) => {
      const unsavedMark = instance.hasUnsavedChanges ? " *" : "";
      const pathInfo = instance.filePath ? ` [${instance.filePath}]` : "";
      prompt += `
${index + 1}. ${instance.title}${unsavedMark}${pathInfo} (instanceId: ${instance.instanceId})`;

      if (instance.contentMarkdown) {
        const preview =
          instance.contentMarkdown.length > 500
            ? `${instance.contentMarkdown.substring(0, 500)}...`
            : instance.contentMarkdown;
        prompt += `
   Content:
   ${preview}`;
      }
    });
  }

  prompt += `\n</system_state>`;

  if (
    channelProfile.includeChatRoomContext &&
    effectiveState.chatRoomContext
  ) {
    prompt += `\n\n<chat_room_reply_instructions>
## CHAT ROOM CONTEXT
Room ID: ${effectiveState.chatRoomContext.roomId}
Your Role: Respond as 'ryo' in this IRC-style chat room
Response Style: Use extremely concise responses

Recent Conversation:
${effectiveState.chatRoomContext.recentMessages}

Mentioned Message: "${effectiveState.chatRoomContext.mentionedMessage}"
</chat_room_reply_instructions>`;
  }

  return prompt;
}

export async function prepareRyoConversationModelInput(
  options: PrepareRyoConversationOptions
): Promise<PreparedRyoConversation> {
  const {
    channel,
    messages,
    systemState,
    username,
    model = DEFAULT_MODEL,
    redis,
    log = defaultLog,
    logError = defaultLog,
    timeZone,
    toolProfile = CHANNEL_TOOL_PROFILES[channel],
    toolContextOverrides,
    preloadedMemoryContext,
  } = options;

  const userTimeZone = systemState?.userLocalTime?.timeZone || timeZone;
  const memoryContext =
    preloadedMemoryContext ||
    (await loadRyoMemoryContext({
      redis,
      username,
      timeZone: userTimeZone,
      log,
      logError,
    }));

  const { prompts: staticPrompts, loadedSections } =
    buildContextAwarePrompts(channel);
  const staticSystemPrompt = staticPrompts.join("\n");
  const dynamicSystemPrompt = buildDynamicSystemPrompt({
    channel,
    systemState,
    username,
    userMemories: memoryContext.userMemories,
    dailyNotesText: memoryContext.dailyNotesText,
  });

  const baseTools: ToolSet = createChatTools(
    {
      log,
      logError,
      env: {
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
        YOUTUBE_API_KEY_2: process.env.YOUTUBE_API_KEY_2,
      },
      username: username ?? null,
      redis,
      timeZone: userTimeZone,
      ...toolContextOverrides,
    },
    { profile: toolProfile }
  );
  const tools: ToolSet = {
    ...baseTools,
    ...(shouldEnableOpenAIWebSearch({ model, username })
      ? {
          web_search: createOpenAIWebSearchTool(systemState),
        }
      : {}),
    ...(shouldEnableGoogleSearch({ model, username })
      ? {
          google_search: createGoogleSearchTool(),
        }
      : {}),
  };

  const uiMessages = ensureUIMessageFormat(messages);
  const modelMessages = await convertToModelMessages(uiMessages, {
    tools,
  });

  const enrichedMessages = [
    createCachedSystemMessage(staticSystemPrompt),
    ...(dynamicSystemPrompt
      ? [{ role: "system" as const, content: dynamicSystemPrompt }]
      : []),
    ...modelMessages,
  ];

  return {
    selectedModel: getModelInstance(model),
    tools,
    enrichedMessages,
    loadedSections,
    staticSystemPrompt,
    dynamicSystemPrompt,
    userMemories: memoryContext.userMemories,
    dailyNotesText: memoryContext.dailyNotesText,
    userTimeZone,
  };
}
