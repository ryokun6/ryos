import { streamText, smoothStream } from "ai";
import { geolocation } from "@vercel/functions";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
} from "./utils/aiModels";
import {
  RYO_PERSONA_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
  TOOL_USAGE_INSTRUCTIONS,
} from "./utils/aiPrompts";
import { z } from "zod";
import { SUPPORTED_AI_MODELS } from "../src/types/aiModels";
import { appIds } from "../src/config/appIds";

// Update SystemState type to match new store structure
interface SystemState {
  apps: {
    [appId: string]: {
      isOpen: boolean;
      isForeground?: boolean;
    };
  };
  username?: string | null;
  internetExplorer: {
    url: string;
    year: string;
    status: string;
    currentPageTitle: string | null;
    aiGeneratedHtml: string | null;
    /** Optional markdown form of the AI generated HTML to keep context compact */
    aiGeneratedMarkdown?: string | null;
  };
  video: {
    currentVideo: {
      id: string;
      url: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    loopAll: boolean;
    loopCurrent: boolean;
    isShuffled: boolean;
  };
  ipod?: {
    currentTrack: {
      id: string;
      url: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    loopAll: boolean;
    loopCurrent: boolean;
    isShuffled: boolean;
    currentLyrics?: {
      lines: Array<{
        startTimeMs: string;
        words: string;
      }>;
    } | null;
    /** Full library of tracks available in the iPod app */
    library?: Array<{
      id: string;
      title: string;
      artist?: string;
    }>;
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
    } | null;
    background: Array<{
      instanceId: string;
      appId: string;
      title?: string;
    }>;
    instanceWindowOrder: string[];
  };
  chatRoomContext?: {
    roomId: string;
    recentMessages: string;
    mentionedMessage: string;
  };
}

// Allowed origins for API requests
const ALLOWED_ORIGINS = new Set(["https://os.ryo.lu", "http://localhost:3000"]);

// Function to validate request origin
// Only allow explicit origins defined in ALLOWED_ORIGINS – no wildcard ports or IP fallbacks
const isValidOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
};

// Allow streaming responses up to 60 seconds
export const maxDuration = 80;
export const runtime = "edge";
export const edge = true;
export const stream = true;
export const config = {
  runtime: "edge",
};

// Legacy static prompt - replaced by context-aware loading
// const STATIC_SYSTEM_PROMPT = [
//   CHAT_INSTRUCTIONS,
//   TOOL_USAGE_INSTRUCTIONS,
//   RYO_PERSONA_INSTRUCTIONS,
//   ANSWER_STYLE_INSTRUCTIONS,
//   CODE_GENERATION_INSTRUCTIONS,
// ].join("\n");

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

  if (systemState.runningApps?.foreground) {
    const foregroundTitle = systemState.runningApps.foreground.title
      ? ` (${systemState.runningApps.foreground.title})`
      : "";
    prompt += `
Foreground: ${systemState.runningApps.foreground.appId}${foregroundTitle}`;
  } else {
    prompt += `
Foreground: None`;
  }

  if (
    systemState.runningApps?.background &&
    systemState.runningApps.background.length > 0
  ) {
    const backgroundApps = systemState.runningApps.background
      .map((inst) => inst.appId + (inst.title ? ` (${inst.title})` : ""))
      .join(", ");
    prompt += `
Background: ${backgroundApps}`;
  } else {
    prompt += `
Background: None`;
  }

  // Media Section
  let hasMedia = false;

  if (systemState.video.currentVideo && systemState.video.isPlaying) {
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
      prompt += `
Current Lyrics:
${systemState.ipod.currentLyrics.lines.map((line) => line.words).join("\n")}`;
    }
  }

  // iPod Library (only if app is open)
  if (
    hasOpenIpod &&
    systemState.ipod?.library &&
    systemState.ipod.library.length > 0
  ) {
    const songList = systemState.ipod.library
      .slice(0, 60) // limit to first 60 songs to avoid overly long prompts
      .map((t) => `${t.title}${t.artist ? ` - ${t.artist}` : ""}`)
      .join("; ");
    prompt += `\n\n## IPOD LIBRARY
Available Songs (${Math.min(systemState.ipod.library.length, 60)} of ${
      systemState.ipod.library.length
    } shown):
${songList}`;
  }

  // Browser Section
  const hasOpenInternetExplorer =
    systemState.runningApps?.foreground?.appId === "internet-explorer" ||
    systemState.runningApps?.background?.some(
      (app) => app.appId === "internet-explorer"
    );

  if (hasOpenInternetExplorer && systemState.internetExplorer.url) {
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
      prompt += `
${index + 1}. ${instance.title}${unsavedMark} (ID: ${instance.instanceId})`;

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

// New context-aware prompt builder
const buildContextAwarePrompts = (
  systemState: SystemState | undefined,
  messages: any[]
) => {
  const prompts: string[] = [];
  const loadedSections: string[] = [];

  // Always include answer style
  prompts.push(ANSWER_STYLE_INSTRUCTIONS);
  loadedSections.push("ANSWER_STYLE");

  // Check if user is asking about Ryo personally
  const lastUserMessage =
    messages
      .filter((m) => m.role === "user")
      .pop()
      ?.content?.toLowerCase() || "";

  const isAskingAboutRyo =
    /\b(ryo|ryo lu|魯赫|リョウ|who are you|about you|your story|your bio|career|life|grow up|born|study|work|about yourself|cursor|notion|notion apps|notion workflows|notion ai|stripe|stripe checkout|stripe terminal|stripe\.dev|asana|ping\+\+|macidea|schedulingdirect|pluto|china|harbin|shanghai|wuhan|canada|montreal|san francisco|mcgill|computer science|biology|ai|design|product|music|kpop|newjeans|njz|haerin|90s|apple|macintosh|nintendo|sony|steve jobs|r&b|cats|buba|systems|design|tech|nature|simulation|strategy games|typography|chinese|english|french|japanese|noodles|hot pot|coke|coffee|thinking in systems|details in typography|art of doing science|understanding media|founder|news anchor|kpop idol|twitter|ryolu_|email|me@ryo\.lu|july 1992|head of design|founding designer|payments|language learning|retail hr|community|roadmap|vibe coding)\b/i.test(
      lastUserMessage
    );
  const isNudge = lastUserMessage.includes("👋 *nudge sent*");
  const isInChatsApp = systemState?.runningApps?.foreground?.appId === "chats";

  // Include full persona if asked, nudged, or in the Chats app
  if (isAskingAboutRyo || isNudge || isInChatsApp) {
    prompts.push(RYO_PERSONA_INSTRUCTIONS);
    loadedSections.push("FULL_PERSONA");
  } else {
    // Brief persona for general interactions (e.g., Terminal)
    prompts.push(`
<ryo_persona_brief>
your name is Ryo (Ryo Lu), head of design at Cursor. you live in San Francisco.
ryOS (https://os.ryo.lu) is the operating system you are in, 100% vibe coded built in Cursor by ryo.
you're a real one who keeps it 💯. you truly believe humans deserve the best tools to free up their minds.
</ryo_persona_brief>
    `);
    loadedSections.push("BRIEF_PERSONA");
  }

  // Include chat instructions for nudges, chat room context, or when in Chats app
  if (isNudge || systemState?.chatRoomContext || isInChatsApp) {
    prompts.push(CHAT_INSTRUCTIONS);
    loadedSections.push("CHAT_INSTRUCTIONS");
  }

  // Check what apps are open to determine which tool instructions to include
  const openApps = new Set<string>();
  if (systemState?.runningApps?.foreground) {
    openApps.add(systemState.runningApps.foreground.appId);
  }
  systemState?.runningApps?.background?.forEach((app) => {
    openApps.add(app.appId);
  });

  // Check if user is asking to create code/HTML
  const isAskingForCode =
    /\b(make|create|build|code|html|website|app|svg|build|three\.?js|canvas)\b/i.test(
      lastUserMessage
    );

  // Build tool instructions based on context
  let toolInstructions = "";

  // Always include app launching instructions
  toolInstructions += `
<tool_usage_instructions>
LAUNCHING APPS: 
- Only use the 'launchApp' or 'closeApp' tools when the user explicitly asks you to launch or close a specific app. Do not infer the need to launch or close apps based on conversation context alone.
`;
  loadedSections.push("TOOL_LAUNCH_APPS");

  // Internet Explorer instructions if open or if user mentions browsing
  if (
    openApps.has("internet-explorer") ||
    /\b(browse|website|url|search|wikipedia|weather|open|launch|time travel|go to)\b/i.test(
      lastUserMessage
    )
  ) {
    toolInstructions += `
INTERNET EXPLORER AND TIME TRAVELING:
- Launch websites to help with user request around facts (wikipedia), weather (accuweather), search (bing), and more.
- When launching websites or time traveling with Internet Explorer, you must include both a real 'url' and the 'year' in the 'launchApp' tool call args.
`;
    loadedSections.push("TOOL_INTERNET_EXPLORER");
  }

  // TextEdit instructions if open or if user mentions editing
  if (
    openApps.has("text-edit") ||
    systemState?.textEdit?.instances?.length ||
    /\b(edit|write|document|text|replace|insert|doc|file|new|create|blank)\b/i.test(
      lastUserMessage
    )
  ) {
    toolInstructions += `
TEXT EDITING:
- When editing documents in TextEdit, ALWAYS provide ALL required parameters:
   • Use 'textEditNewFile' to create a blank file. Use it when user requests a new doc and the current file content is irrelevant. TextEdit will launch automatically if not open.
   • Use 'textEditSearchReplace' to find and replace content. REQUIRED: 'search' (text to find), 'replace' (replacement text), and 'instanceId' (from system state). Set 'isRegex: true' ONLY if the user explicitly mentions using a regular expression.
   • Use 'textEditInsertText' to add plain text. REQUIRED: 'text' (content to insert) and 'instanceId' (from system state). Optional: 'position' ("start" or "end", default is "end").
- IMPORTANT: Always include the 'instanceId' parameter by checking the system state for the specific TextEdit instance ID (e.g., '15', '78', etc.).
- You can call multiple textEditSearchReplace or textEditInsertText tools to edit the document.
`;
    loadedSections.push("TOOL_TEXTEDIT");
  }

  // iPod instructions if open or if user mentions music
  if (
    openApps.has("ipod") ||
    /\b(play|pause|song|music|track|ipod|lyrics|artist|next|previous|add|play song|add and play song)\b/i.test(
      lastUserMessage
    )
  ) {
    toolInstructions += `
iPOD and MUSIC PLAYBACK:
- Use 'ipodPlayPause' to control playback. The 'action' parameter can be "play", "pause", or "toggle" (default).
- Use 'ipodPlaySong' to play a specific song by providing at least one of: 'id' (YouTube video id), 'title' (song title), or 'artist' (artist name). ONLY use IDs or titles and artists provided in the iPod Library system state.
- Use 'ipodNextTrack' to skip to the next track in the playlist.
- Use 'ipodPreviousTrack' to go back to the previous track in the playlist.
- Use 'ipodAddAndPlaySong' to add a song from YouTube URL or ID and play it.
- Always launch the iPod app first if it's not already open before using these controls.
- When asked to copy or transcribe lyrics, write the lyrics with textEditNewFile and textEditInsertText tools.
`;
    loadedSections.push("TOOL_IPOD");
  }

  // HTML generation instructions only if relevant
  if (isAskingForCode || openApps.has("internet-explorer")) {
    toolInstructions += `
HTML GENERATION:
- When asked to create HTML, apps, websites, or any code output, ALWAYS use the 'generateHtml' tool.
- DO NOT stream HTML code blocks in your regular message response.
- The generateHtml tool should contain ONLY the HTML content, no explanatory text.
`;
    prompts.push(CODE_GENERATION_INSTRUCTIONS);
    loadedSections.push("TOOL_HTML_GENERATION", "CODE_GENERATION_INSTRUCTIONS");
  }

  toolInstructions += `
</tool_usage_instructions>`;

  if (
    toolInstructions.trim() !==
    "<tool_usage_instructions>\n</tool_usage_instructions>"
  ) {
    prompts.push(toolInstructions);
  }

  return { prompts, loadedSections };
};

export default async function handler(req: Request) {
  // Check origin before processing request
  const origin = req.headers.get("origin");
  if (!isValidOrigin(origin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  // At this point origin is guaranteed to be a valid string from ALLOWED_ORIGINS
  const validOrigin = origin as string;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": validOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Parse query string to get model parameter
    const url = new URL(req.url);
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState: incomingSystemState, // Renamed to allow mutation
      model: bodyModel = DEFAULT_MODEL,
    } = await req.json();

    // Use query parameter if available, otherwise use body parameter
    const model = queryModel || bodyModel;

    // Helper: prefix log lines with username (for easier tracing)
    const usernameForLogs = incomingSystemState?.username ?? "unknown";
    const log = (...args: unknown[]) =>
      console.log(`[User: ${usernameForLogs}]`, ...args);
    const logError = (...args: unknown[]) =>
      console.error(`[User: ${usernameForLogs}]`, ...args);

    log(
      `Using model: ${model || DEFAULT_MODEL} (${
        queryModel ? "from query" : model ? "from body" : "using default"
      })`
    );

    if (!messages || !Array.isArray(messages)) {
      logError(
        `400 Error: Invalid messages format - ${JSON.stringify({ messages })}`
      );
      return new Response("Invalid messages format", { status: 400 });
    }

    // Additional validation for model
    if (model !== null && !SUPPORTED_AI_MODELS.includes(model)) {
      logError(`400 Error: Unsupported model - ${model}`);
      return new Response(`Unsupported model: ${model}`, { status: 400 });
    }

    // --- Geolocation (available only on deployed environment) ---
    const geo = geolocation(req);

    // Attach geolocation info to system state that will be sent to the prompt
    const systemState: SystemState | undefined = incomingSystemState
      ? { ...incomingSystemState, requestGeo: geo }
      : ({ requestGeo: geo } as SystemState);

    const selectedModel = getModelInstance(model as SupportedModel);

    // Build context-aware prompts based on current state and conversation
    const { prompts: contextAwarePrompts, loadedSections } =
      buildContextAwarePrompts(systemState, messages);
    const staticSystemPrompt = contextAwarePrompts.join("\n");

    // Log prompt optimization metrics with loaded sections
    log(
      `Context-aware prompts (${
        loadedSections.length
      } sections): ${loadedSections.join(", ")}`
    );
    const approxTokens = staticSystemPrompt.length / 4; // rough estimate
    log(`Approximate prompt tokens: ${Math.round(approxTokens)}`);

    const staticPromptMessage = {
      role: "system",
      content: staticSystemPrompt,
      ...CACHE_CONTROL_OPTIONS,
    };

    const dynamicStateMessage = {
      role: "system",
      content: generateDynamicSystemPrompt(systemState),
      ...CACHE_CONTROL_OPTIONS,
    };

    const enrichedMessages = [
      staticPromptMessage,
      ...messages,
      dynamicStateMessage,
    ];

    // Log all messages right before model call (as per user preference)
    enrichedMessages.forEach((msg, index) => {
      log(
        `Message ${index} [${msg.role}]: ${msg.content?.substring(0, 100)}...`
      );
    });

    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      tools: {
        launchApp: {
          description:
            "Launch an application in the ryOS interface when the user explicitly requests it. If the id is 'internet-explorer', you must provide BOTH a real 'url' and a 'year' for time-travel; otherwise provide neither.",
          parameters: z
            .object({
              id: z.enum(appIds).describe("The app id to launch"),
              url: z
                .string()
                .optional()
                .describe(
                  "For internet-explorer only: The URL to load in Internet Explorer. Omit https:// and www. from the URL."
                ),
              year: z
                .string()
                .optional()
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
          parameters: z.object({
            id: z.enum(appIds).describe("The app id to close"),
          }),
        },
        textEditSearchReplace: {
          description:
            "Search and replace text in a specific TextEdit document. You MUST always provide 'search', 'replace', and 'instanceId'. Set 'isRegex: true' ONLY if the user explicitly mentions using a regular expression. Use the instanceId from the system state (e.g., '15') to target a specific window.",
          parameters: z.object({
            search: z
              .string()
              .describe(
                "REQUIRED: The text or regular expression to search for"
              ),
            replace: z
              .string()
              .describe(
                "REQUIRED: The text that will replace each match of 'search'"
              ),
            isRegex: z
              .boolean()
              .optional()
              .describe(
                "Set to true if the 'search' field should be treated as a JavaScript regular expression (without flags). Defaults to false."
              ),
            instanceId: z
              .string()
              .describe(
                "REQUIRED: The specific TextEdit instance ID to modify (e.g., '15'). Get this from the system state TextEdit Windows list."
              ),
          }),
        },
        textEditInsertText: {
          description:
            "Insert plain text into a specific TextEdit document. You MUST always provide 'text' and 'instanceId'. Appends to the end by default; use position 'start' to prepend. Use the instanceId from the system state (e.g., '15') to target a specific window.",
          parameters: z.object({
            text: z.string().describe("REQUIRED: The text to insert"),
            position: z
              .enum(["start", "end"])
              .optional()
              .describe(
                "Where to insert the text: 'start' to prepend, 'end' to append. Default is 'end'."
              ),
            instanceId: z
              .string()
              .describe(
                "REQUIRED: The specific TextEdit instance ID to modify (e.g., '15'). Get this from the system state TextEdit Windows list."
              ),
          }),
        },
        textEditNewFile: {
          description:
            "Create a new blank document in a new TextEdit instance. Use when the user explicitly requests a new or untitled file.",
          parameters: z.object({
            title: z
              .string()
              .optional()
              .describe(
                "Optional title for the new TextEdit window. If not provided, defaults to 'Untitled'."
              ),
          }),
        },
        // Add iPod control tools
        ipodPlayPause: {
          description:
            "Play, pause, or toggle playback on the iPod app. If the iPod app is not open, it will be launched automatically.",
          parameters: z.object({
            action: z
              .enum(["play", "pause", "toggle"])
              .optional()
              .describe(
                "Playback action to perform. Defaults to 'toggle' if omitted."
              ),
          }),
        },
        ipodPlaySong: {
          description:
            "Play a specific song in the iPod app by matching id, title, or artist. At least one of the parameters must be provided. If the iPod app is not open, it will be launched automatically.",
          parameters: z
            .object({
              id: z
                .string()
                .optional()
                .describe("The YouTube video id of the song to play"),
              title: z
                .string()
                .optional()
                .describe("The title (or part of it) of the song to play"),
              artist: z
                .string()
                .optional()
                .describe(
                  "The artist name (or part of it) of the song to play"
                ),
            })
            .refine((data) => data.id || data.title || data.artist, {
              message:
                "Provide at least one of 'id', 'title', or 'artist' to identify the song.",
            }),
        },
        ipodAddAndPlaySong: {
          description:
            "Adds a song to the iPod library from a YouTube video ID or URL and plays it. Supports YouTube URLs (youtube.com/watch?v=, youtu.be/), video IDs, and share URLs (os.ryo.lu/ipod/:id). The system will automatically fetch title, artist, and album information. The iPod app will be launched if it's not already open.",
          parameters: z.object({
            id: z
              .string()
              .describe(
                "The YouTube video ID or any supported URL format (YouTube URL, os.ryo.lu/ipod/:id, etc.) of the song to add and play."
              ),
          }),
        },
        ipodNextTrack: {
          description:
            "Skip to the next track in the iPod app playlist. If the iPod app is not open, it will be launched automatically.",
          parameters: z.object({}),
        },
        ipodPreviousTrack: {
          description:
            "Skip to the previous track in the iPod app playlist. If the iPod app is not open, it will be launched automatically.",
          parameters: z.object({}),
        },
        // --- HTML generation & preview ---
        generateHtml: {
          description:
            "Generate an HTML snippet following the CODE_GENERATION_INSTRUCTIONS and render it in the chat. Provide the HTML markup as a single string in the 'html' field. Do NOT wrap it in markdown fences; the client will handle formatting.",
          parameters: z.object({
            html: z
              .string()
              .describe(
                "The HTML code to render. It should follow the guidelines in CODE_GENERATION_INSTRUCTIONS—omit <head>/<body> tags and include only the body contents."
              ),
          }),
        },
      },
      temperature: 0.7,
      maxTokens: 6000,
      toolCallStreaming: true,
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
    });

    const response = result.toDataStreamResponse();

    // Add CORS headers to the response
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", validOrigin);

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    // Check if error is a SyntaxError (likely from parsing JSON)
    if (error instanceof SyntaxError) {
      console.error(`400 Error: Invalid JSON - ${error.message}`);
      return new Response(`Bad Request: Invalid JSON - ${error.message}`, {
        status: 400,
      });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
