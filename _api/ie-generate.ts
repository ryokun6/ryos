import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  streamText,
  smoothStream,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { Redis } from "@upstash/redis";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
} from "./_utils/_aiModels.js";
import { normalizeUrlForCacheKey } from "./_utils/_url.js";
import {
  CORE_PRIORITY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  IE_HTML_GENERATION_INSTRUCTIONS,
  } from "./_utils/_aiPrompts.js";
import { SUPPORTED_AI_MODELS } from "./_utils/_aiModels.js";
import { initLogger } from "./_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 80;

// ============================================================================
// Local Helper Functions
// ============================================================================

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

// ============================================================================
// Constants and Types
// ============================================================================

const IE_CACHE_PREFIX = "ie:cache:"; // Key prefix for stored generated pages

type IncomingUIMessage = Omit<UIMessage, "id">;
type SimpleMessage = {
  id?: string;
  role: string;
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
};

interface IEGenerateRequestBody {
  url?: string;
  year?: string;
  messages?: IncomingUIMessage[];
  model?: SupportedModel;
}

// --- Utility Functions ----------------------------------------------------

const ensureUIMessageFormat = (messages: SimpleMessage[]): UIMessage[] => {
  return messages.map((msg, index) => {
    const id = msg.id || `ie-msg-${index}`;
    if (msg.parts && Array.isArray(msg.parts)) {
      return {
        id,
        role: msg.role as UIMessage["role"],
        parts: msg.parts,
      } as UIMessage;
    }
    return {
      id,
      role: msg.role as UIMessage["role"],
      parts: [{ type: "text", text: msg.content ?? "" }],
    } as UIMessage;
  });
};

// --- Static System Prompt ---
// Static portion of the system prompt shared across requests. This string is
// passed via the `system` option to enable prompt caching by the model
// provider.
const STATIC_SYSTEM_PROMPT = `${CORE_PRIORITY_INSTRUCTIONS}\n\nThe user is in ryOS Internet Explorer asking to time travel with website context and a specific year. You are Ryo, a visionary designer specialized in turning present websites into past and futuristic coherent versions in story and design.\n\nGenerate content for the URL path and year provided, original site content, and use provided HTML as template if available.\n\n${IE_HTML_GENERATION_INSTRUCTIONS}`;

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

// ============================================================================
// Route Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const effectiveOrigin = getEffectiveOrigin(req);
  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"] });
  
  logger.request(req.method || "POST", req.url || "/api/ie-generate");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }
  
  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).send("Unauthorized");
  }

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    logger.response(405, Date.now() - startTime);
    return res.status(405).send("Method not allowed");
  }

  const redis = createRedis();

  try {
    // ---------------------------
    // Rate limiting (burst + budget per IP)
    // ---------------------------
    try {
      const ip = getClientIp(req);
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
        logger.warn("Rate limit exceeded (burst)", { ip });
        res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
        res.setHeader("Content-Type", "application/json");
        logger.response(429, Date.now() - startTime);
        return res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "burst",
          limit: burst.limit,
          windowSeconds: burst.windowSeconds,
          resetSeconds: burst.resetSeconds,
          identifier: `ip:${ip}`,
        });
      }

      const budget = await RateLimit.checkCounterLimit({
        key: budgetKey,
        windowSeconds: BUDGET_WINDOW,
        limit: BUDGET_LIMIT,
      });
      if (!budget.allowed) {
        logger.warn("Rate limit exceeded (budget)", { ip });
        res.setHeader("Retry-After", String(budget.resetSeconds ?? BUDGET_WINDOW));
        res.setHeader("Content-Type", "application/json");
        logger.response(429, Date.now() - startTime);
        return res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "budget",
          limit: budget.limit,
          windowSeconds: budget.windowSeconds,
          resetSeconds: budget.resetSeconds,
          identifier: `ip:${ip}`,
        });
      }
    } catch (e) {
      // Fail open on limiter error to avoid blocking
      logger.error("IE generate rate-limit error", e);
    }

    // Extract query parameters
    const queryModel = req.query.model as SupportedModel | undefined;
    const targetUrl = req.query.url as string | undefined;
    const targetYear = req.query.year as string | undefined;

    // Parse JSON body
    const bodyData = (req.body || {}) as IEGenerateRequestBody;

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

    logger.info("Request details", {
      rawUrl,
      effectiveYear: effectiveYearStr || "N/A",
      normalizedUrlForKey,
    });

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
      logger.warn("Invalid messages format");
      logger.response(400, Date.now() - startTime);
      return res.status(400).send("Invalid messages format");
    }

    if (model !== null && !SUPPORTED_AI_MODELS.includes(model)) {
      logger.warn("Unsupported model", { model });
      logger.response(400, Date.now() - startTime);
      return res.status(400).send(`Unsupported model: ${model}`);
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

    // Convert UIMessages to ModelMessages for the AI model (AI SDK v6)
    const uiMessages = ensureUIMessageFormat(incomingMessages);
    const modelMessages = await convertToModelMessages(uiMessages);

    const enrichedMessages: ModelMessage[] = [
      staticSystemMessage,
      dynamicSystemMessage,
      ...modelMessages,
    ];

    logger.info("Starting generation", {
      model,
      messageCount: enrichedMessages.length,
      cacheKey,
    });

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
          logger.info("No cacheKey available, skipping cache save");
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
          const duration = Date.now() - startTime;
          logger.info(`Cached result for ${cacheKey} (length=${cleaned.length}, duration=${duration.toFixed(2)}ms)`);
        } catch (cacheErr) {
          logger.error("Cache write error", cacheErr);
          logger.info("Failed to cache HTML", { length: text?.length });
        }
      },
    });

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);

    logger.info("Streaming response started");
    
    // Use pipeUIMessageStreamToResponse for Node.js streaming
    result.pipeUIMessageStreamToResponse(res, {
      status: 200,
    });
  } catch (error) {
    logger.error("IE Generate API error", error);

    if (error instanceof SyntaxError) {
      logger.response(400, Date.now() - startTime);
      return res.status(400).send(`Bad Request: Invalid JSON - ${error.message}`);
    }

    logger.response(500, Date.now() - startTime);
    return res.status(500).send("Internal Server Error");
  }
}
