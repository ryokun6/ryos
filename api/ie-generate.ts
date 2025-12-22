import {
  streamText,
  smoothStream,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import * as RateLimit from "./_utils/rate-limit.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "./_utils/cors.js";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
  } from "./_utils/aiModels.js";
import { Redis } from "@upstash/redis";
import { normalizeUrlForCacheKey } from "./_utils/url.js";
import {
  CORE_PRIORITY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  DELIVERABLE_REQUIREMENTS,
  } from "./_utils/aiPrompts.js";
import { SUPPORTED_AI_MODELS } from "../src/types/aiModels.js";

// CORS handled via shared utils

// After ALLOWED_ORIGINS const block, add Redis setup and cache prefix

const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL as string,
  token: process.env.REDIS_KV_REST_API_TOKEN as string,
});

const IE_CACHE_PREFIX = "ie:cache:"; // Key prefix for stored generated pages

// --- Logging Utilities ---------------------------------------------------

const logRequest = (
  method: string,
  url: string,
  action: string | null,
  id: string
) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

const logInfo = (id: string, message: string, data?: unknown) => {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
};

const logError = (id: string, message: string, error: unknown) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = (): string =>
  Math.random().toString(36).substring(2, 10);

type IncomingUIMessage = Omit<UIMessage, "id">;

interface IEGenerateRequestBody {
  url?: string;
  year?: string;
  messages?: IncomingUIMessage[];
  model?: SupportedModel;
}

// --- Utility Functions ----------------------------------------------------

const isValidOrigin = (origin: string | null): boolean =>
  isAllowedOrigin(origin);

// --- Edge Runtime Config --------------------------------------------------

export const maxDuration = 80;
export const runtime = "edge";
export const edge = true;
export const stream = true;
export const config = { runtime: "edge" };

// --- Handler --------------------------------------------------------------

// Static portion of the system prompt shared across requests. This string is
// passed via the `system` option to enable prompt caching by the model
// provider.
const STATIC_SYSTEM_PROMPT = `${CORE_PRIORITY_INSTRUCTIONS}\n\nThe user is in ryOS Internet Explorer asking to time travel with website context and a specific year. You are Ryo, a visionary designer specialized in turning present websites into past and futuristic coherent versions in story and design.\n\nGenerate content for the URL path and year provided, original site content, and use provided HTML as template if available.\n\n${DELIVERABLE_REQUIREMENTS}`;

// Function to generate the dynamic portion of the system prompt. This portion
// depends on the requested year and URL and will be sent as a regular system
// message so it is not cached by the model provider.
const getDynamicSystemPrompt = (
  year: number | null,
  rawUrl: string | null // Add rawUrl parameter
): string => {
  const currentYear = new Date().getFullYear();

  // --- Prompt Sections ---

  const INTRO_LINE = `Generate content for the URL path, the year provided (${
    year ?? "current"
  }), original site content, and use provided HTML as template if provided.`;

  const FUTURE_YEAR_INSTRUCTIONS = `For the future year ${year}:
- Redesign the website so it feels perfectly at home in the future context provided in design, typography, colors, layout, storytelling, and technology
- Think boldly and creatively about future outcomes
- Embrace the original brand, language, cultural context, aesthetics
- Consider design trends and breakthroughs that could happen by then
- Use simple colors, avoid gradients, use backdrop-blur, use simple animations
- Use emojis or simple SVGs for icons`;

  const PAST_YEAR_INSTRUCTIONS = `For the past year ${year}:
- Redesign the website to match the historical era in design, typography, colors, layout, storytelling, and technology
- Consider how it would have been designed if it existed then
- Consider what technology, design tools, medium would have been available (can be print, telegram, newspaper, typerwriter, letter, etc.)
- Consider cultural and artistic movements that could have influenced design and major events
- Use simple colors, great typesetting, and simulate past materials and textures`;

  const CURRENT_YEAR_INSTRUCTIONS = `For the current year ${year}:
- Reflect the current state of the website's design and branding accurately.
- Ensure the content is up-to-date and relevant for today.`;

  const YEAR_NOT_SPECIFIED_INSTRUCTIONS = `Year not specified. Assume current year ${currentYear}.`;

  const PERSONA_INSTRUCTIONS_BLOCK = `ABOUT THE DESIGNER (RYO LU):
${RYO_PERSONA_INSTRUCTIONS}`;

  // --- Determine Year Specific Instructions ---

  let yearSpecificInstructions = "";
  if (year === null) {
    yearSpecificInstructions = YEAR_NOT_SPECIFIED_INSTRUCTIONS;
  } else if (year > currentYear) {
    yearSpecificInstructions = FUTURE_YEAR_INSTRUCTIONS;
  } else if (year < currentYear) {
    yearSpecificInstructions = PAST_YEAR_INSTRUCTIONS;
  } else {
    // year === currentYear
    yearSpecificInstructions = CURRENT_YEAR_INSTRUCTIONS;
  }

  // --- Assemble the Final Prompt ---

  let finalPrompt = `${INTRO_LINE}\n\n${yearSpecificInstructions}`;

  // Conditionally add Ryo's persona instructions
  if (
    rawUrl &&
    (rawUrl.includes("ryo.lu") ||
      rawUrl.includes("x.com") ||
      rawUrl.includes("notion") ||
      rawUrl.includes("cursor"))
  ) {
    finalPrompt += `\n\n${PERSONA_INSTRUCTIONS_BLOCK}`;
  }

  return finalPrompt;
};

export default async function handler(req: Request) {
  // CORS / Origin validation
  const effectiveOrigin = getEffectiveOrigin(req);
  if (req.method === "OPTIONS") {
    const resp = preflightIfNeeded(req, ["POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }
  if (!isValidOrigin(effectiveOrigin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // ---------------------------
    // Rate limiting (burst + budget per IP)
    // ---------------------------
    try {
      const ip = RateLimit.getClientIp(req);
      const BURST_WINDOW = 60; // 1 minute
      const BURST_LIMIT = 3;
      const BUDGET_WINDOW = 5 * 60 * 60; // 5 hours
      const BUDGET_LIMIT = 10;

      const burstKey = RateLimit.makeKey(["rl", "ie", "burst", "ip", ip]);
      const budgetKey = RateLimit.makeKey(["rl", "ie", "budget", "ip", ip]);

      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: BURST_WINDOW,
        limit: BURST_LIMIT,
      });
      if (!burst.allowed) {
        const headers = new Headers({
          "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW),
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": effectiveOrigin,
        });
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            scope: "burst",
            limit: burst.limit,
            windowSeconds: burst.windowSeconds,
            resetSeconds: burst.resetSeconds,
            identifier: `ip:${ip}`,
          }),
          { status: 429, headers }
        );
      }

      const budget = await RateLimit.checkCounterLimit({
        key: budgetKey,
        windowSeconds: BUDGET_WINDOW,
        limit: BUDGET_LIMIT,
      });
      if (!budget.allowed) {
        const headers = new Headers({
          "Retry-After": String(budget.resetSeconds ?? BUDGET_WINDOW),
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": effectiveOrigin,
        });
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            scope: "budget",
            limit: budget.limit,
            windowSeconds: budget.windowSeconds,
            resetSeconds: budget.resetSeconds,
            identifier: `ip:${ip}`,
          }),
          { status: 429, headers }
        );
      }
    } catch (e) {
      // Fail open on limiter error to avoid blocking
      console.error("IE generate rate-limit error", e);
    }

    const requestId = generateRequestId();
    const startTime =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const urlObj = new URL(req.url);

    const queryModel = urlObj.searchParams.get(
      "model"
    ) as SupportedModel | null;
    // Extract caching parameters from query string
    const targetUrl = urlObj.searchParams.get("url");
    const targetYear = urlObj.searchParams.get("year");

    // Parse JSON body once
    const bodyData = (await req
      .json()
      .catch(() => ({}))) as IEGenerateRequestBody;

    const bodyUrl = bodyData.url;
    const bodyYear = bodyData.year;

    // Build a safe cache key using url/year present in query string or body
    const rawUrl = targetUrl || bodyUrl; // Get the url before normalization
    const effectiveYearStr = targetYear || bodyYear;
    const effectiveYear = effectiveYearStr
      ? parseInt(effectiveYearStr, 10)
      : null; // Parse year to number

    // Normalize the URL for the cache key
    const normalizedUrlForKey = normalizeUrlForCacheKey(rawUrl);

    logRequest(
      req.method,
      req.url,
      `${rawUrl} (${effectiveYearStr || "N/A"})`,
      requestId
    ); // Log original requested URL

    const {
      messages: incomingMessages = [],
      model: bodyModel = DEFAULT_MODEL,
    } = bodyData;

    // Use normalized URL for the cache key
    const cacheKey =
      normalizedUrlForKey && effectiveYearStr
        ? `${IE_CACHE_PREFIX}${encodeURIComponent(
            normalizedUrlForKey
          )}:${effectiveYearStr}`
        : null;

    // Removed cache read to avoid duplicate generation; cache handled through iframe-check AI mode

    // Use query parameter if available, otherwise use body parameter, otherwise use default
    const model = queryModel || bodyModel || DEFAULT_MODEL;

    if (!Array.isArray(incomingMessages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    if (model !== null && !SUPPORTED_AI_MODELS.includes(model)) {
      return new Response(`Unsupported model: ${model}`, { status: 400 });
    }

    const selectedModel = getModelInstance(model as SupportedModel);

    // Generate dynamic portion of the system prompt, passing the rawUrl
    const systemPrompt = getDynamicSystemPrompt(effectiveYear, rawUrl ?? null);

    // Build system messages similar to chat.ts approach
    const staticSystemMessage = {
      role: "system" as const,
      content: STATIC_SYSTEM_PROMPT,
    };

    const dynamicSystemMessage = {
      role: "system" as const,
      content: systemPrompt,
    };

    // Convert UIMessages to ModelMessages for the AI model (AI SDK v5)
    const modelMessages = convertToModelMessages(incomingMessages);

    const enrichedMessages: ModelMessage[] = [
      staticSystemMessage,
      dynamicSystemMessage,
      ...modelMessages,
    ];

    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      // We assume prompt/messages already include necessary system/user details
      temperature: 0.7,
      maxOutputTokens: 4000,
      experimental_transform: smoothStream(),
      providerOptions: {
        openai: {
          reasoningEffort: "none", // Turn off reasoning for GPT-5 and other reasoning models
        },
      },
      onFinish: async ({ text }) => {
        if (!cacheKey) {
          logInfo(requestId, "No cacheKey available, skipping cache save");
          return;
        }
        try {
          // Attempt to extract HTML inside fenced block
          let cleaned = text.trim();
          const blockMatch = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/);
          if (blockMatch) {
            cleaned = blockMatch[1].trim();
          } else {
            // Remove any stray fences if present
            cleaned = cleaned
              .replace(/```(?:html)?\s*/g, "")
              .replace(/```/g, "")
              .trim();
          }
          // Remove duplicate TITLE comments beyond first
          const titleCommentMatch = cleaned.match(/<!--\s*TITLE:[\s\S]*?-->/);
          if (titleCommentMatch) {
            const titleComment = titleCommentMatch[0];
            // Remove any additional copies of title comment
            cleaned =
              titleComment + cleaned.replace(new RegExp(titleComment, "g"), "");
          }
          await redis.lpush(cacheKey, cleaned);
          await redis.ltrim(cacheKey, 0, 4);
          logInfo(
            requestId,
            `Cached result for ${cacheKey} (length=${cleaned.length})`
          );
          const duration =
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) - startTime;
          logInfo(
            requestId,
            `Request completed in ${duration.toFixed(2)}ms (generated)`
          );
        } catch (cacheErr) {
          logError(requestId, "Cache write error", cacheErr);
          logInfo(requestId, "Failed to cache HTML, length", text?.length);
        }
      },
    });

    const response = result.toUIMessageStreamResponse();

    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", effectiveOrigin!);

    const resp = new Response(response.body, {
      status: response.status,
      headers,
    });

    return resp;
  } catch (error) {
    const requestId = generateRequestId(); // fallback id
    logError(requestId, "IE Generate API error", error);

    if (error instanceof SyntaxError) {
      return new Response(`Bad Request: Invalid JSON - ${error.message}`, {
        status: 400,
      });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
