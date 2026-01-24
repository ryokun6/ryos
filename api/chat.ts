import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  streamText,
  smoothStream,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { geolocation } from "@vercel/functions";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
} from "./_utils/_aiModels.js";
import {
  CORE_PRIORITY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
} from "./_utils/_aiPrompts.js";
import { z } from "zod";
import { SUPPORTED_AI_MODELS } from "../src/types/aiModels.js";
import { appIds } from "../src/config/appIds.js";
import { checkAndIncrementAIMessageCount } from "./_utils/_rate-limit.js";
import { validateAuth } from "./_utils/auth/index.js";
import { Redis } from "@upstash/redis";
import { initLogger } from "./_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";

// Central list of supported theme IDs for tool validation
const themeIds = ["system7", "macosx", "xp", "win98"] as const;

// Helper to ensure messages are in UIMessage format for AI SDK v6
// Handles both simple { role, content } format and UIMessage format with parts
type SimpleMessage = { id?: string; role: string; content?: string; parts?: Array<{ type: string; text?: string }> };
const ensureUIMessageFormat = (messages: SimpleMessage[]): UIMessage[] => {
  return messages.map((msg, index) => {
    // If message already has parts, it's in UIMessage format
    if (msg.parts && Array.isArray(msg.parts)) {
      return {
        id: msg.id || `msg-${index}`,
        role: msg.role as UIMessage['role'],
        parts: msg.parts,
      } as UIMessage;
    }
    // Convert simple { role, content } format to UIMessage format
    return {
      id: msg.id || `msg-${index}`,
      role: msg.role as UIMessage['role'],
      parts: [{ type: 'text', text: msg.content || '' }],
    } as UIMessage;
  });
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return value;
};

// Shared media control schema validation refinement
const mediaControlRefinement = (data: { action: string; id?: string; title?: string; artist?: string }, ctx: z.RefinementCtx) => {
  const { action, id, title, artist } = data;

  if (action === "addAndPlay") {
    if (!id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'addAndPlay' action requires the 'id' parameter (YouTube ID or URL).",
        path: ["id"],
      });
    }
    if (title !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Do not provide 'title' when using 'addAndPlay' (information is fetched automatically).",
        path: ["title"],
      });
    }
    if (artist !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Do not provide 'artist' when using 'addAndPlay' (information is fetched automatically).",
        path: ["artist"],
      });
    }
    return;
  }

  if (action === "playKnown") {
    if (!id && !title && !artist) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'playKnown' action requires at least one of 'id', 'title', or 'artist'.",
        path: ["id"],
      });
    }
    return;
  }

  if (
    (action === "toggle" || action === "play" || action === "pause") &&
    (id !== undefined || title !== undefined || artist !== undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Do not provide 'id', 'title', or 'artist' when using playback state actions ('toggle', 'play', 'pause').",
      path: ["action"],
    });
  }

  if (
    (action === "next" || action === "previous") &&
    (id !== undefined || title !== undefined || artist !== undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Do not provide 'id', 'title', or 'artist' when using track navigation actions ('next', 'previous').",
      path: ["action"],
    });
  }
};

// Factory for creating media control schemas (iPod, Karaoke)
const createMediaControlSchema = (options: { hasEnableVideo?: boolean } = {}) => {
  const baseSchema = z.object({
    action: z
      .enum(["toggle", "play", "pause", "playKnown", "addAndPlay", "next", "previous"])
      .default("toggle")
      .describe("Playback operation to perform. Defaults to 'toggle' when omitted."),
    id: z
      .string()
      .optional()
      .describe("For 'playKnown' (optional) or 'addAndPlay' (required): YouTube video ID or supported URL."),
    title: z
      .string()
      .optional()
      .describe("For 'playKnown': The title (or part of it) of the song to play."),
    artist: z
      .string()
      .optional()
      .describe("For 'playKnown': The artist name (or part of it) of the song to play."),
    enableTranslation: z
      .string()
      .optional()
      .describe(
        "ONLY use when user explicitly requests translated lyrics. Set to language code (e.g., 'en', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'it', 'ru') to translate, or 'off'/'original' to show original lyrics. By default, do NOT set this - lyrics should remain in original language."
      ),
    enableFullscreen: z
      .boolean()
      .optional()
      .describe("Enable fullscreen mode. Can be combined with any action."),
  });

  if (options.hasEnableVideo) {
    return baseSchema.extend({
      enableVideo: z
        .boolean()
        .optional()
        .describe("Enable video playback. Can be combined with any action."),
    }).superRefine(mediaControlRefinement);
  }

  return baseSchema.superRefine(mediaControlRefinement);
};

// Update SystemState type to match new store structure (optimized for token efficiency)
interface SystemState {
  username?: string | null;
  /** User's operating system (e.g., "iOS", "Android", "macOS", "Windows", "Linux") */
  userOS?: string;
  /** User's system locale (e.g., "en", "zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru") */
  locale?: string;
  internetExplorer?: {
    url: string;
    year: string;
    currentPageTitle: string | null;
    /** Markdown form of the AI generated HTML (more token-efficient than raw HTML) */
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
  /** Local time information reported by the user's browser */
  userLocalTime?: {
    timeString: string;
    dateString: string;
    timeZone: string;
  };
  /** Geolocation info inferred from the incoming request (provided by Vercel). */
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


// Node.js runtime configuration
export const runtime = "nodejs";
export const maxDuration = 80;

// Helper functions for Node.js runtime
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}

// Unified static prompt with all instructions
const STATIC_SYSTEM_PROMPT = [
  CORE_PRIORITY_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
].join("\n");

const CACHE_CONTROL_OPTIONS = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" } },
  },
} as const;

const generateDynamicSystemPrompt = (systemState?: SystemState) => {
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
    const location = [
      systemState.requestGeo.city,
      systemState.requestGeo.country,
    ]
      .filter(Boolean)
      .join(", ");
    prompt += `
User Location: ${location} (inferred from IP, may be inaccurate)`;
  }

  // Applications Section
  prompt += `\n\n## RUNNING APPLICATIONS`;

  // Helper to format app instance info
  const formatAppInstance = (inst: { appId: string; title?: string; appletPath?: string; appletId?: string }) => {
    let info = inst.appId;
    if (inst.title) info += ` (${inst.title})`;
    // For applet-viewer, include applet path and/or ID
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

  if (
    systemState.runningApps?.background &&
    systemState.runningApps.background.length > 0
  ) {
    const backgroundApps = systemState.runningApps.background
      .map((inst) => formatAppInstance(inst))
      .join(", ");
    prompt += `
Background: ${backgroundApps}`;
  } else {
    prompt += `
Background: None`;
  }

  // Media Section
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

  // Check if iPod app is open
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
      // Truncate lyrics to ~10 lines to save tokens (full lyrics can be 100+ lines)
      const allLines = systemState.ipod.currentLyrics.lines;
      const maxLines = 10;
      const truncatedLines = allLines.length > maxLines 
        ? allLines.slice(0, maxLines)
        : allLines;
      const lyricsText = truncatedLines.map((line) => line.words).join("\n");
      const truncationNote = allLines.length > maxLines ? `\n(${allLines.length - maxLines} more lines...)` : "";
      prompt += `
Lyrics Preview:
${lyricsText}${truncationNote}`;
    }
  }

  // Check if Karaoke app is open
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
  }

  // Browser Section
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

  // TextEdit Section
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
        // Limit content preview to avoid overly long prompts
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

// Simplified prompt builder that always includes every instruction
const buildContextAwarePrompts = () => {
  const prompts = [STATIC_SYSTEM_PROMPT];
  const loadedSections = ["STATIC_SYSTEM_PROMPT"];
  return { prompts, loadedSections };
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  
  // Check origin before processing request
  const effectiveOrigin = getEffectiveOrigin(req);
  
  logger.request(req.method || "POST", req.url || "/api/chat", "chat");
  
  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { origin: effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  // At this point origin is guaranteed to be a valid string
  const validOrigin = effectiveOrigin as string;

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    setCorsHeaders(res, validOrigin, { methods: ["POST", "OPTIONS"] });
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  // Create Redis client for auth validation
  const redis = createRedis();

  try {
    // Parse query string to get model parameter
    // Handle both full URLs and relative paths (vercel dev uses relative paths)
    const url = new URL(req.url || "/", "http://localhost");
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState: incomingSystemState, // still passed for dynamic prompt generation but NOT for auth
      model: bodyModel = DEFAULT_MODEL,
    } = req.body as {
      messages: unknown[];
      systemState?: SystemState;
      model?: string;
    };

    // Use query parameter if available, otherwise use body parameter, otherwise use default
    const model = queryModel || bodyModel || DEFAULT_MODEL;

    // ---------------------------
    // Extract auth headers FIRST so we can use username for logging
    // ---------------------------

    const authHeaderInitial = getHeader(req, "authorization");
    const headerAuthTokenInitial =
      authHeaderInitial && authHeaderInitial.startsWith("Bearer ")
        ? authHeaderInitial.substring(7)
        : null;
    const headerUsernameInitial = getHeader(req, "x-username");

    // Helper: prefix log lines with username (for easier tracing)
    const usernameForLogs = headerUsernameInitial ?? "unknown";
    const log = (...args: unknown[]) =>
      logger.info(`[User: ${usernameForLogs}]`, args);
    const logError = (...args: unknown[]) =>
      logger.error(`[User: ${usernameForLogs}]`, args);

    // Get IP address for rate limiting anonymous users
    // For Vercel deployments, use x-vercel-forwarded-for (won't be overwritten by proxies)
    // For localhost/local dev, use a fixed identifier
    const isLocalDev = validOrigin?.startsWith("http://localhost") || validOrigin?.startsWith("http://127.0.0.1") || validOrigin?.includes("100.110.251.60");
    let ip: string;

    if (isLocalDev) {
      // For local development, use a fixed identifier
      ip = "localhost-dev";
    } else {
      // For Vercel deployments, prefer x-vercel-forwarded-for which is more reliable
      ip =
        getHeader(req, "x-vercel-forwarded-for") ||
        getHeader(req, "x-forwarded-for")?.split(",")[0].trim() ||
        getHeader(req, "x-real-ip") ||
        "unknown-ip";
    }

    log(`Request origin: ${validOrigin}, IP: ${ip}`);

    // ---------------------------
    // Authentication extraction
    // ---------------------------
    // Prefer credentials in the incoming system state (back-compat),
    // but fall back to HTTP headers for multi-token support (Authorization & X-Username)

    const headerAuthToken = headerAuthTokenInitial ?? undefined;
    const headerUsername = headerUsernameInitial;

    const username = headerUsername || null;
    const authToken: string | undefined = headerAuthToken;

    // ---------------------------
    // Rate-limit & auth checks
    // ---------------------------
    // Validate authentication (all users, including "ryo", must present a valid token)
    // Enable grace period for expired tokens (client is responsible for token refresh)
    const validationResult = await validateAuth(redis, username, authToken, {
      allowExpired: true,
      refreshOnGrace: false,
    });

    // If a username was provided but the token is missing/invalid, reject the request early
    if (username && !validationResult.valid) {
      console.log(
        `[User: ${username}] Authentication failed – invalid or missing token`
      );
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
      res.status(401).json({
        error: "authentication_failed",
        message: "Invalid or missing authentication token",
      });
      return;
    }

    // Use validated auth status for rate limiting
    const isAuthenticated = validationResult.valid;
    const identifier =
      isAuthenticated && username ? username.toLowerCase() : `anon:${ip}`;

    // Only check rate limits for user messages (not system messages)
    const userMessages = (messages as Array<{ role: string }>).filter(
      (m) => m.role === "user"
    );
    if (userMessages.length > 0) {
      const rateLimitResult = await checkAndIncrementAIMessageCount(
        identifier,
        isAuthenticated,
        authToken
      );

      if (!rateLimitResult.allowed) {
        log(
          `Rate limit exceeded: ${identifier} (${rateLimitResult.count}/${rateLimitResult.limit})`
        );

        const errorResponse = {
          error: "rate_limit_exceeded",
          isAuthenticated,
          count: rateLimitResult.count,
          limit: rateLimitResult.limit,
          message: `You've hit your limit of ${rateLimitResult.limit} messages in this 5-hour window. Please wait a few hours and try again.`,
        };

        res.setHeader("Access-Control-Allow-Origin", validOrigin);
        res.status(429).json(errorResponse);
        return;
      }

      log(
        `Rate limit check passed: ${identifier} (${rateLimitResult.count}/${rateLimitResult.limit})`
      );
    }

    log(
      `Using model: ${model || DEFAULT_MODEL} (${
        queryModel ? "from query" : model ? "from body" : "using default"
      })`
    );

    if (!messages || !Array.isArray(messages)) {
      logError(
        `400 Error: Invalid messages format - ${JSON.stringify({ messages })}`
      );
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
      res.status(400).send("Invalid messages format");
      return;
    }

    // Additional validation for model
    if (model !== null && !SUPPORTED_AI_MODELS.includes(model as SupportedModel)) {
      logError(`400 Error: Unsupported model - ${model}`);
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
      res.status(400).send(`Unsupported model: ${model}`);
      return;
    }

    // --- Geolocation (available only on deployed environment) ---
    // geolocation() requires Web Request headers, which aren't available in vercel dev
    let geo: ReturnType<typeof geolocation> = {};
    try {
      // Only works with Web Request in production, fails in vercel dev with VercelRequest
      geo = geolocation(req as unknown as Request);
    } catch {
      // In local dev, geolocation isn't available - use empty object
      geo = {};
    }

    // Attach geolocation info to system state that will be sent to the prompt
    const systemState: SystemState | undefined = incomingSystemState
      ? { ...incomingSystemState, requestGeo: geo }
      : ({ requestGeo: geo } as SystemState);

    const selectedModel = getModelInstance(model as SupportedModel);

    // Build unified static prompts
    const { prompts: staticPrompts, loadedSections } =
      buildContextAwarePrompts();
    const staticSystemPrompt = staticPrompts.join("\n");

    // Log prompt optimization metrics with loaded sections
    log(
      `Context-aware prompts (${
        loadedSections.length
      } sections): ${loadedSections.join(", ")}`
    );
    const approxTokens = staticSystemPrompt.length / 4; // rough estimate
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    // -------------------------------------------------------------
    // System messages – first the LARGE static prompt (cached),
    // then the smaller dynamic prompt (not cached)
    // -------------------------------------------------------------

    // 1) Static system instructions – mark as cacheable so Anthropic
    // can reuse this costly prefix across calls (min-1024-token rule)
    const staticSystemMessage = {
      role: "system" as const,
      content: staticSystemPrompt,
      ...CACHE_CONTROL_OPTIONS, // { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
    };

    // 2) Dynamic, user-specific system state (don't cache)
    const dynamicSystemMessage = {
      role: "system" as const,
      content: generateDynamicSystemPrompt(systemState),
    };

    // Convert UIMessages to ModelMessages for the AI model
    // Ensure messages are in UIMessage format (handles both simple and parts-based formats)
    const uiMessages = ensureUIMessageFormat(messages as SimpleMessage[]);
    const modelMessages = await convertToModelMessages(uiMessages);

    // Merge all messages: static sys → dynamic sys → user/assistant turns
    const enrichedMessages = [
      staticSystemMessage,
      dynamicSystemMessage,
      ...modelMessages,
    ];

    // Log all messages right before model call (as per user preference)
    enrichedMessages.forEach((msg, index) => {
      const contentStr =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      log(`Message ${index} [${msg.role}]: ${contentStr.substring(0, 100)}...`);
    });

    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      tools: {
        launchApp: {
          description:
            "Launch an application in the ryOS interface when the user explicitly requests it. If the id is 'internet-explorer', you must provide BOTH a real 'url' and a 'year' for time-travel; otherwise provide neither.",
          inputSchema: z
            .object({
              id: z.enum(appIds).describe("The app id to launch"),
              url: z
                .preprocess(normalizeOptionalString, z.string().optional())
                .describe(
                  "For internet-explorer only: The URL to load in Internet Explorer. Omit https:// and www. from the URL."
                ),
              year: z
                .preprocess(normalizeOptionalString, z.string().optional())
                .describe(
                  "For internet-explorer only: The year for the Wayback Machine or AI generation. Allowed values: 'current', '1000 BC', '1 CE', '500', '800', '1000', '1200', '1400', '1600', '1700', '1800', years from 1900-1989, 1990-1995, any year from 1991 to current year-1, '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100', '2150', '2200', '2250', '2300', '2400', '2500', '2750', '3000'. Used only with Internet Explorer."
                )
                .refine(
                  (year) => {
                    if (year === undefined) return true; // Optional field is valid if not provided
                    // Check if it's 'current' or matches the specific allowed year formats
                    const allowedYearsRegex =
                      /^(current|1000 BC|1 CE|500|800|1000|1200|1400|1600|1700|1800|19[0-8][0-9]|199[0-5]|199[1-9]|20[0-2][0-9]|2030|2040|2050|2060|2070|2080|2090|2100|2150|2200|2250|2300|2400|2500|2750|3000)$/;
                    // Adjust the regex dynamically based on current year if needed, but for simplicity, using fixed ranges that cover the logic.
                    // The regex covers: 'current', specific BC/CE/early years, 1900-1989, 1990-1995, 1991-currentYear-1 (approximated by 1991-2029), future decades, and specific future years.
                    const currentYearNum = new Date().getFullYear();
                    if (/^\d{4}$/.test(year)) {
                      const numericYear = parseInt(year, 10);
                      // Allow years from 1991 up to currentYear - 1
                      if (numericYear >= 1991 && numericYear < currentYearNum) {
                        return true;
                      }
                    }
                    const isValidFormat = allowedYearsRegex.test(year);
                    return isValidFormat;
                  },
                  {
                    message:
                      "Invalid year format or value. Use 'current', a valid past year (e.g., '1995', '1000 BC'), or a valid future year (e.g., '2030', '3000'). Check allowed years.",
                  }
                ),
            })
            .refine(
              (data) => {
                // If id is 'internet-explorer', either both url and year must be provided, or neither should be.
                if (data.id === "internet-explorer") {
                  const urlProvided =
                    data.url !== undefined &&
                    data.url !== null &&
                    data.url !== "";
                  const yearProvided =
                    data.year !== undefined &&
                    data.year !== null &&
                    data.year !== "";
                  // Return true if (both provided) or (neither provided). Return false otherwise.
                  return (
                    (urlProvided && yearProvided) ||
                    (!urlProvided && !yearProvided)
                  );
                }
                // If id is not 'internet-explorer', url/year should not be provided.
                if (data.url !== undefined || data.year !== undefined) {
                  return false;
                }
                return true; // Valid otherwise
              },
              {
                message:
                  "For 'internet-explorer', provide both 'url' and 'year', or neither. For other apps, do not provide 'url' or 'year'.",
              }
            ),
        },
        closeApp: {
          description:
            "Close an application in the ryOS interface—but only when the user explicitly asks you to close that specific app.",
          inputSchema: z.object({
            id: z.enum(appIds).describe("The app id to close"),
          }),
        },
        // iPod control tools (uses shared media control schema with video support)
        ipodControl: {
          description:
            "Control playback in the iPod app. Launches the iPod automatically if needed. Use action 'toggle' (default), 'play', or 'pause' for playback state; 'playKnown' to play an existing library track by id/title/artist; 'addAndPlay' to add a track from a YouTube ID or URL and start playback; 'next' or 'previous' to navigate the playlist. Optionally enable video or fullscreen mode with enableVideo or enableFullscreen. LYRICS TRANSLATION: By default, keep lyrics in the ORIGINAL language - only use enableTranslation when the user EXPLICITLY asks for translated lyrics. IMPORTANT: If the user's OS is iOS, do NOT automatically start playback – instead, inform the user that due to iOS browser restrictions they need to press the center button or play button on the iPod themselves to start playing.",
          inputSchema: createMediaControlSchema({ hasEnableVideo: true }),
        },
        // Karaoke control tools (uses shared media control schema without video)
        karaokeControl: {
          description:
            "Control playback in the Karaoke app. Launches the Karaoke app automatically if needed. Use action 'toggle' (default), 'play', or 'pause' for playback state; 'playKnown' to play an existing library track by id/title/artist; 'addAndPlay' to add a track from a YouTube ID or URL and start playback; 'next' or 'previous' to navigate the playlist. Optionally enable fullscreen mode with enableFullscreen. LYRICS TRANSLATION: By default, keep lyrics in the ORIGINAL language - only use enableTranslation when the user EXPLICITLY asks for translated lyrics. IMPORTANT: If the user's OS is iOS, do NOT automatically start playback – instead, inform the user that due to iOS browser restrictions they need to tap the play button themselves to start playing. NOTE: Karaoke shares the same music library as iPod but has independent playback state.",
          inputSchema: createMediaControlSchema(),
        },
        // --- HTML generation & preview ---
        generateHtml: {
          description:
            "Generate an HTML snippet for an ryOS Applet: a small windowed app (default ~320px wide) that runs inside ryOS, not the full page. Design mobile-first for ~320px width but keep layouts responsive to expand gracefully. Provide markup in 'html', a short 'title', and an 'icon' (emoji). DO NOT wrap it in markdown fences; the client will handle scaffolding.",
          inputSchema: z.object({
            html: z
              .string()
              .describe(
                "The HTML code to render. It should follow the guidelines in CODE_GENERATION_INSTRUCTIONS—omit <head>/<body> tags and include only the body contents."
              ),
            title: z
              .string()
              .optional()
              .describe(
                "A short, descriptive title for this HTML applet (e.g., 'Calculator', 'Todo List', 'Color Picker'). This will be used as the default filename when the user saves the applet. Omit file extensions."
              ),
            icon: z
              .string()
              .optional()
              .describe(
                "A single emoji character to use as the applet icon (e.g., '🧮', '📝', '🎨'). This emoji will be displayed in the Finder and as the app icon."
              ),
          }),
          execute: async ({ html, title, icon }) => {
            // Server-side execution: validate and return the HTML, title, and icon
            log(
              `[generateHtml] Received HTML (${html.length} chars), title: ${
                title || "none"
              }, icon: ${icon || "none"}`
            );

            if (!html || html.trim().length === 0) {
              throw new Error("HTML content cannot be empty");
            }

            // Return object with html, title, and icon
            return { html, title: title || "Applet", icon: icon || "📦" };
          },
        },
        // --- Emoji Aquarium ---
        aquarium: {
          description:
            "Render a playful emoji aquarium inside the chat bubble. Use when the user asks for an aquarium / fish tank / fishes / sam's aquarium.",
          inputSchema: z.object({}),
        },
        // --- Unified Virtual File System Tools ---
        list: {
          description:
            "List items from the ryOS virtual file system. Returns a JSON array with metadata for each item. CRITICAL: You MUST ONLY reference items that are explicitly returned in the tool result. DO NOT suggest, mention, or hallucinate items that are not in the returned list.",
          inputSchema: z.object({
            path: z
              .enum(["/Applets", "/Documents", "/Applications", "/Music", "/Applets Store"])
              .describe(
                "The directory path to list: '/Applets' for local applets, '/Documents' for documents, '/Applications' for apps, '/Music' for iPod songs, '/Applets Store' for shared applets"
              ),
            query: z
              .string()
              .max(200)
              .optional()
              .describe(
                "Optional search query to filter results (only used for '/Applets Store' path). Case-insensitive substring match on title, name, or creator."
              ),
            limit: z
              .number()
              .int()
              .min(1)
              .max(50)
              .optional()
              .describe(
                "Optional maximum number of results to return (default 25, only used for '/Applets Store' path)."
              ),
          }),
        },
        open: {
          description:
            "Open a file, application, or media item from the virtual file system. Routes to the appropriate app based on path:\n" +
            "- Applets → applet-viewer\n" +
            "- Documents → TextEdit\n" +
            "- Applications → launches the app\n" +
            "- Music → plays in iPod\n" +
            "- Applets Store → opens preview\n" +
            "CRITICAL: Use exact paths from 'list' results. Always call 'list' first.",
          inputSchema: z.object({
            path: z
              .string()
              .describe(
                "The EXACT path from list results. Examples:\n" +
                "- '/Applets/Calculator.app' - Open local applet\n" +
                "- '/Documents/notes.md' - Open document in TextEdit\n" +
                "- '/Applications/internet-explorer' - Launch app\n" +
                "- '/Music/{id}' - Play song by ID\n" +
                "- '/Applets Store/{id}' - Preview shared applet"
              ),
          }),
        },
        read: {
          description:
            "Read the full contents of a file from the virtual file system. Returns the complete text content for AI processing. Supports:\n" +
            "- '/Applets/*' - Read applet HTML content\n" +
            "- '/Documents/*' - Read document markdown content\n" +
            "- '/Applets Store/{id}' - Fetch shared applet content and metadata",
          inputSchema: z.object({
            path: z
              .string()
              .describe(
                "The file path to read. Must be from /Applets, /Documents, or /Applets Store. Use exact path from list results or store applet ID for shared applets."
              ),
          }),
        },
        write: {
          description:
            "Create or modify markdown documents. Saves to disk and opens in TextEdit. " +
            "IMPORTANT: For applets, use generateHtml (create/overwrite) or edit (small changes).",
          inputSchema: z.object({
            path: z
              .string()
              .describe(
                "Full file path including .md extension. Example: '/Documents/my-notes.md' or '/Documents/Meeting Notes.md'"
              ),
            content: z.string().describe("The markdown content to write."),
            mode: z
              .enum(["overwrite", "append", "prepend"])
              .optional()
              .describe(
                "Write mode: 'overwrite' replaces content (default), 'append' adds to end, 'prepend' adds to start."
              ),
          }),
        },
        edit: {
          description:
            "Edit existing files in the ryOS virtual file system. For creating new files, use the write tool (documents) or generateHtml tool (applets). For larger rewrites, use write with mode 'overwrite'.\n\n" +
            "Before using this tool:\n" +
            "1. Use the read tool to understand the file's contents and context\n" +
            "2. Verify the file exists using list\n\n" +
            "To make a file edit, provide the following:\n" +
            "1. path: The file path to modify (e.g., '/Documents/notes.md' or '/Applets/MyApp.app')\n" +
            "2. old_string: The text to replace (must be unique within the file, and must match exactly including whitespace)\n" +
            "3. new_string: The edited text to replace the old_string\n\n" +
            "The tool will replace ONE occurrence of old_string with new_string in the specified file.\n\n" +
            "CRITICAL REQUIREMENTS:\n" +
            "1. UNIQUENESS: The old_string MUST uniquely identify the specific instance you want to change. Include context lines before and after if needed.\n" +
            "2. SINGLE INSTANCE: This tool changes ONE instance at a time. Make separate calls for multiple changes.\n" +
            "3. VERIFICATION: Before using, check how many instances of the target text exist. If multiple exist, include enough context to uniquely identify each one.\n\n" +
            "WARNING: If you do not follow these requirements:\n" +
            "- The tool will fail if old_string matches multiple locations\n" +
            "- The tool will fail if old_string doesn't match exactly (including whitespace)\n\n" +
            "Supported paths:\n" +
            "- '/Documents/*' - Edit markdown documents\n" +
            "- '/Applets/*' - Edit applet HTML files",
          inputSchema: z.object({
            path: z
              .string()
              .describe(
                "The file path to edit. Must be in /Documents or /Applets."
              ),
            old_string: z
              .string()
              .describe(
                "The text to replace (must be unique within the file, and must match exactly including whitespace and indentation)."
              ),
            new_string: z
              .string()
              .describe(
                "The edited text to replace the old_string."
              ),
          }),
        },
        // --- YouTube/Song Search Tool ---
        searchSongs: {
          description:
            "Search for songs/videos on YouTube. Returns a list of results with video IDs, titles, and channel names. Use this to help users find music to add to their iPod. PREFER official music videos from verified artist channels (look for 'VEVO' or the artist's official channel). AVOID karaoke versions, instrumental versions, playlists, compilations, 'best of' collections, lyric videos, and covers unless specifically requested. After getting results, you can use ipodControl with action 'addAndPlay' to add a song using its videoId.",
          inputSchema: z.object({
            query: z
              .string()
              .min(1)
              .max(200)
              .describe(
                "The search query. Include 'music video' or 'MV' for better results. Example: 'Never Gonna Give You Up Rick Astley music video'"
              ),
            maxResults: z
              .number()
              .int()
              .min(1)
              .max(10)
              .optional()
              .default(5)
              .describe(
                "Maximum number of results to return (1-10, default 5)"
              ),
          }),
          execute: async ({ query, maxResults = 5 }) => {
            log(`[searchSongs] Searching for: "${query}" (max ${maxResults} results)`);
            
            // Collect all available API keys for rotation
            const apiKeys = [
              process.env.YOUTUBE_API_KEY,
              process.env.YOUTUBE_API_KEY_2,
            ].filter((key): key is string => !!key);

            if (apiKeys.length === 0) {
              throw new Error("No YouTube API keys configured");
            }

            log(`[searchSongs] Available API keys: ${apiKeys.length}`);

            // Helper to check if error is a quota exceeded error
            const isQuotaError = (status: number, errorText: string): boolean => {
              if (status === 403) {
                const lowerText = errorText.toLowerCase();
                return lowerText.includes("quota") || lowerText.includes("exceeded") || lowerText.includes("limit");
              }
              return false;
            };

            let lastError: string | null = null;

            // Try each API key until one works
            for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
              const apiKey = apiKeys[keyIndex];
              const keyLabel = keyIndex === 0 ? "primary" : `backup-${keyIndex}`;

              try {
                log(`[searchSongs] Trying ${keyLabel} API key (${keyIndex + 1}/${apiKeys.length})`);

                const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
                searchUrl.searchParams.set("part", "snippet");
                searchUrl.searchParams.set("type", "video");
                searchUrl.searchParams.set("videoCategoryId", "10"); // Music category
                searchUrl.searchParams.set("q", query);
                searchUrl.searchParams.set("maxResults", String(maxResults));
                searchUrl.searchParams.set("key", apiKey);

                const response = await fetch(searchUrl.toString());
                
                if (!response.ok) {
                  const errorText = await response.text();
                  log(`[searchSongs] YouTube API error with ${keyLabel} key: ${response.status} - ${errorText}`);
                  
                  // Check if quota exceeded and we have more keys to try
                  if (isQuotaError(response.status, errorText) && keyIndex < apiKeys.length - 1) {
                    log(`[searchSongs] Quota exceeded for ${keyLabel} key, rotating to next key`);
                    lastError = errorText;
                    continue; // Try next key
                  }
                  
                  throw new Error(`YouTube search failed: ${response.status}`);
                }

                const data = await response.json();
                
                if (!data.items || data.items.length === 0) {
                  return { 
                    results: [], 
                    message: `No songs found for "${query}"` 
                  };
                }

                // Transform results to a simpler format
                const results = data.items.map((item: {
                  id: { videoId: string };
                  snippet: {
                    title: string;
                    channelTitle: string;
                    publishedAt: string;
                    thumbnails?: { medium?: { url: string } };
                  };
                }) => ({
                  videoId: item.id.videoId,
                  title: item.snippet.title,
                  channelTitle: item.snippet.channelTitle,
                  publishedAt: item.snippet.publishedAt,
                }));

                log(`[searchSongs] Found ${results.length} results for "${query}" using ${keyLabel} key`);
                
                return {
                  results,
                  message: `Found ${results.length} song(s) for "${query}"`,
                  hint: "Use ipodControl with action 'addAndPlay' and the videoId to add a song to the iPod"
                };
              } catch (error) {
                logError(`[searchSongs] Error with ${keyLabel} key:`, error);
                // If we have more keys, try the next one
                if (keyIndex < apiKeys.length - 1) {
                  log(`[searchSongs] Retrying with next API key`);
                  continue;
                }
                throw new Error(`Failed to search for songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }

            // All keys exhausted
            throw new Error(`All YouTube API keys exhausted. Last error: ${lastError || 'Unknown'}`);
          },
        },
        // --- System Settings Tool ---
        settings: {
          description:
            "Change system settings in ryOS. Use this tool when the user asks to change language, theme, volume, enable/disable speech, or check for updates. Multiple settings can be changed in a single call.",
          inputSchema: z.object({
            language: z
              .enum(["en", "zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru"])
              .optional()
              .describe(
                "Change the system language. Supported: 'en' (English), 'zh-TW' (Traditional Chinese), 'ja' (Japanese), 'ko' (Korean), 'fr' (French), 'de' (German), 'es' (Spanish), 'pt' (Portuguese), 'it' (Italian), 'ru' (Russian)."
              ),
            theme: z
              .enum(themeIds)
              .optional()
              .describe(
                'Change the OS theme. One of "system7" (Mac OS 7), "macosx" (Mac OS X), "xp" (Windows XP), "win98" (Windows 98).'
              ),
            masterVolume: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe(
                "Set the master volume (0-1). Affects all system sounds including UI sounds, speech, and music. Use 0 to mute."
              ),
            speechEnabled: z
              .boolean()
              .optional()
              .describe(
                "Enable or disable text-to-speech for AI responses. When enabled, the AI's responses will be read aloud."
              ),
            checkForUpdates: z
              .boolean()
              .optional()
              .describe(
                "When true, triggers a check for ryOS updates. Will notify the user if an update is available."
              ),
          }),
        },
      },
      temperature: 0.7,
      maxOutputTokens: 48000, // Increased from 6000 to prevent code generation cutoff
      stopWhen: stepCountIs(10), // Allow up to 10 steps for multi-tool workflows
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
      headers: {
        // Enable fine-grained tool streaming for Anthropic models
        ...(model.startsWith("claude")
          ? { "anthropic-beta": "fine-grained-tool-streaming-2025-05-14" }
          : {}),
      },
      providerOptions: {
        openai: {
          reasoningEffort: "none", // Turn off reasoning for GPT-5 and other reasoning models
        },
      },
    });

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", validOrigin);
    
    // Use pipeUIMessageStreamToResponse for Node.js streaming
    result.pipeUIMessageStreamToResponse(res, {
      status: 200,
    });
  } catch (error) {
    logger.error("Chat API error", error);

    // Set CORS headers
    if (validOrigin) {
      res.setHeader("Access-Control-Allow-Origin", validOrigin);
    }
    res.setHeader("Content-Type", "application/json");

    // Check if error is a SyntaxError (likely from parsing JSON)
    if (error instanceof SyntaxError) {
      logger.error(`Invalid JSON`, error.message);
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Bad Request", message: `Invalid JSON - ${error.message}` });
      return;
    }

    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
