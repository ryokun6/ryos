import { streamText, smoothStream } from "ai";
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
  };
  textEdit?: {
    lastFilePath: string | null;
    contentJson: unknown | null;
    hasUnsavedChanges: boolean;
  };
  runningApps?: {
    foreground: string;
    background: string[];
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

const generateSystemPrompt = (systemState?: SystemState) => {
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

  // Start with static parts
  const prompt = `
  ${RYO_PERSONA_INSTRUCTIONS}
  ${ANSWER_STYLE_INSTRUCTIONS}
  ${CODE_GENERATION_INSTRUCTIONS}
  ${CHAT_INSTRUCTIONS}
  ${TOOL_USAGE_INSTRUCTIONS}

${
  systemState
    ? `<system_state>
    ${
      systemState.username
        ? `CURRENT USER: ${systemState.username}`
        : "CURRENT USER: you"
    }

SYSTEM STATE:

- Current local time: ${timeString} on ${dateString}
${
  systemState.runningApps?.foreground
    ? `\n- Foreground App: ${systemState.runningApps.foreground}`
    : ""
}
${
  systemState.runningApps?.background &&
  systemState.runningApps.background.length > 0
    ? `\n- Background Apps: ${systemState.runningApps.background.join(", ")}`
    : ""
}
${
  systemState.apps["videos"]?.isOpen &&
  systemState.video.currentVideo &&
  systemState.video.isPlaying
    ? `\n- Videos Now Playing: ${systemState.video.currentVideo.title}${
        systemState.video.currentVideo.artist
          ? ` by ${systemState.video.currentVideo.artist}`
          : ""
      }`
    : ""
}
${
  systemState.apps["ipod"]?.isOpen &&
  systemState.ipod?.currentTrack &&
  systemState.ipod.isPlaying
    ? `\n- iPod Now Playing: ${systemState.ipod.currentTrack.title}${
        systemState.ipod.currentTrack.artist
          ? ` by ${systemState.ipod.currentTrack.artist}`
          : ""
      }`
    : ""
}
${
  systemState.apps["internet-explorer"]?.isOpen &&
  systemState.internetExplorer.url
    ? `\n- Browser URL: ${
        systemState.internetExplorer.url
      }\n- Time Travel Year: ${systemState.internetExplorer.year}${
        systemState.internetExplorer.currentPageTitle
          ? `\n- Page Title: ${systemState.internetExplorer.currentPageTitle}`
          : ""
      }${
        systemState.internetExplorer.aiGeneratedHtml
          ? `\n- HTML Content:\n${systemState.internetExplorer.aiGeneratedHtml}`
          : ""
      }`
    : ""
}
${
  systemState.apps["textedit"]?.isOpen && systemState.textEdit
    ? `\n- TextEdit File: ${systemState.textEdit.lastFilePath ?? "Untitled"}${
        systemState.textEdit.hasUnsavedChanges ? " (unsaved changes)" : ""
      }${
        systemState.textEdit.contentJson
          ? `\n- Document Content JSON:\n${JSON.stringify(
              systemState.textEdit.contentJson
            )}`
          : ""
      }`
    : ""
}
</system_state>`
    : ""
}

${
  systemState?.chatRoomContext
    ? `<chat_room_reply_instructions>
CHAT ROOM REPLIES:
- You are responding to @ryo mention in chat room ID: ${systemState.chatRoomContext.roomId}
- Recent conversation:
${systemState.chatRoomContext.recentMessages}
- You were mentioned with message: "${systemState.chatRoomContext.mentionedMessage}"
- Respond as 'ryo' in this IRC-style chat room context. Use extremely concise responses replying to the recent conversation in the chat room.
</chat_room_reply_instructions>`
    : ""
}`;

  // Removed TextEdit content and instructions sections
  return prompt;
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
      systemState, // Removed textEditContext
      model: bodyModel = DEFAULT_MODEL,
    } = await req.json();

    // Use query parameter if available, otherwise use body parameter
    const model = queryModel || bodyModel;

    console.log(
      `Using model: ${model || DEFAULT_MODEL} (${
        queryModel ? "from query" : model ? "from body" : "using default"
      })`
    );

    if (!messages || !Array.isArray(messages)) {
      console.error(
        `400 Error: Invalid messages format - ${JSON.stringify({ messages })}`
      );
      return new Response("Invalid messages format", { status: 400 });
    }

    // Additional validation for model
    if (model !== null && !SUPPORTED_AI_MODELS.includes(model)) {
      console.error(`400 Error: Unsupported model - ${model}`);
      return new Response(`Unsupported model: ${model}`, { status: 400 });
    }

    const selectedModel = getModelInstance(model as SupportedModel);

    const result = streamText({
      model: selectedModel,
      system: generateSystemPrompt(systemState), // Removed textEditContext
      messages,
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
            "Search and replace text in the currently open TextEdit document. Always supply 'search' and 'replace'. Set 'isRegex: true' ONLY if the user explicitly mentions using a regular expression.",
          parameters: z.object({
            search: z
              .string()
              .describe("The text or regular expression to search for"),
            replace: z
              .string()
              .describe("The text that will replace each match of 'search'"),
            isRegex: z
              .boolean()
              .optional()
              .describe(
                "Set to true if the 'search' field should be treated as a JavaScript regular expression (without flags). Defaults to false."
              ),
          }),
        },
        textEditInsertText: {
          description:
            "Insert plain text into the currently open TextEdit document. Appends to the end by default; use position 'start' to prepend. Use this instead of manually launching or closing TextEdit.",
          parameters: z.object({
            text: z.string().describe("The text to insert"),
            position: z
              .enum(["start", "end"])
              .optional()
              .describe(
                "Where to insert the text: 'start' to prepend, 'end' to append. Default is 'end'."
              ),
          }),
        },
        textEditNewFile: {
          description:
            "Create a new blank document in TextEdit. Use when the user explicitly requests a new or untitled file.",
          parameters: z.object({}),
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
