import { streamText, smoothStream } from "ai";
import { SupportedModel, DEFAULT_MODEL, getModelInstance } from "./utils/aiModels";
import {
  RYO_PERSONA_INSTRUCTIONS,
  ANSWER_STYLE_INSTRUCTIONS,
  CODE_GENERATION_INSTRUCTIONS,
  CHAT_INSTRUCTIONS,
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
const ALLOWED_ORIGINS = new Set([
  'https://os.ryo.lu',
  'http://localhost:3000'
]);

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

const generateSystemPrompt = (
  systemState?: SystemState
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

  // Start with static parts
  const prompt = `
  ${RYO_PERSONA_INSTRUCTIONS}
  ${ANSWER_STYLE_INSTRUCTIONS}
  ${CODE_GENERATION_INSTRUCTIONS}
  ${CHAT_INSTRUCTIONS}

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
  systemState.runningApps?.background && systemState.runningApps.background.length > 0
    ? `\n- Background Apps: ${systemState.runningApps.background.join(", ")}`
    : ""
}
${
  systemState.apps['videos']?.isOpen && systemState.video.currentVideo && systemState.video.isPlaying
    ? `\n- Videos Now Playing: ${systemState.video.currentVideo.title}${systemState.video.currentVideo.artist ? ` by ${systemState.video.currentVideo.artist}` : ''}`
    : ""
}
${
  systemState.apps['ipod']?.isOpen && systemState.ipod?.currentTrack && systemState.ipod.isPlaying
    ? `\n- iPod Now Playing: ${systemState.ipod.currentTrack.title}${systemState.ipod.currentTrack.artist ? ` by ${systemState.ipod.currentTrack.artist}` : ''}`
    : ''
}
${
  systemState.apps['internet-explorer']?.isOpen && systemState.internetExplorer.url
    ? `\n- Browser URL: ${systemState.internetExplorer.url}\n- Time Travel Year: ${systemState.internetExplorer.year}${
        systemState.internetExplorer.currentPageTitle
          ? `\n- Page Title: ${systemState.internetExplorer.currentPageTitle}`
          : ''
      }${
        systemState.internetExplorer.aiGeneratedHtml
          ? `\n- HTML Content:\n${systemState.internetExplorer.aiGeneratedHtml}`
          : ''
      }`
    : ''
}
</system_state>`
    : ''
}

${
  systemState?.chatRoomContext
    ? `<chat_room_reply_instructions>
CHAT ROOM REPLIES:
- You are responding to @ryo mention in chat room ID: ${systemState.chatRoomContext.roomId}
- Recent conversation:
${systemState.chatRoomContext.recentMessages}
- You were mentioned with message: "${systemState.chatRoomContext.mentionedMessage}"
- Respond as 'ryo' in this IRC-style chat room context. Use concise responses carrying on the ongoing conversation
</chat_room_reply_instructions>`
    : ''
}`;

  // Removed TextEdit content and instructions sections
  return prompt;
};

export default async function handler(req: Request) {
  // Check origin before processing request
  const origin = req.headers.get('origin');
  if (!isValidOrigin(origin)) {
    return new Response('Unauthorized', { status: 403 });
  }

  // At this point origin is guaranteed to be a valid string from ALLOWED_ORIGINS
  const validOrigin = origin as string;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': validOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
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
      `Using model: ${model || DEFAULT_MODEL} (${queryModel ? "from query" : model ? "from body" : "using default"})`    );

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
          description: "Launch an application by its id in the ryOS interface. For 'internet-explorer', you can optionally provide a 'url' and 'year' (e.g., 1999, 2023, current).",
          parameters: z.object({
            id: z.enum(appIds).describe("The app id to launch"),
            url: z.string().optional().describe("Optional: The URL to load in Internet Explorer."),
            year: z.string().optional()
              .describe("Optional: The year for the Wayback Machine or AI generation (e.g., '1000 BC', '1995', 'current', '2030', '3000'). Used only with Internet Explorer.")
              .refine(year => {
                if (year === undefined) return true; // Optional field is valid if not provided
                // Check if it's 'current' or matches the specific allowed year formats
                const allowedYearsRegex = /^(current|1000 BC|1 CE|500|800|1000|1200|1400|1600|1700|1800|19[0-8][0-9]|199[0-5]|199[1-9]|20[0-2][0-9]|2030|2040|2050|2060|2070|2080|2090|2100|2150|2200|2250|2300|2400|2500|2750|3000)$/;
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
              }, {
                message: "Invalid year format or value. Use 'current', a valid past year (e.g., '1995', '1000 BC'), or a valid future year (e.g., '2030', '3000'). Check allowed years."
              }),
          }).refine(data => {
            // If id is 'internet-explorer', either both url and year must be provided, or neither should be.
            if (data.id === 'internet-explorer') {
              const urlProvided = data.url !== undefined && data.url !== null && data.url !== '';
              const yearProvided = data.year !== undefined && data.year !== null && data.year !== '';
              // Return true if (both provided) or (neither provided). Return false otherwise.
              return (urlProvided && yearProvided) || (!urlProvided && !yearProvided);
            }
            // If id is not 'internet-explorer', url/year should not be provided.
            if (data.url !== undefined || data.year !== undefined) {
              return false;
            }
            return true; // Valid otherwise
          }, {
            message: "For 'internet-explorer', provide both 'url' and 'year', or neither. For other apps, do not provide 'url' or 'year'.",
          }),
        },
        closeApp: {
          description: "Close an application by its id in the ryOS interface",
          parameters: z.object({ id: z.enum(appIds).describe("The app id to close") }),
        },
      },
      temperature: 0.7,
      maxTokens: 6000,
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
    });

    const response = result.toDataStreamResponse();

    // Add CORS headers to the response
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', validOrigin);

    return new Response(response.body, {
      status: response.status,
      headers
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

