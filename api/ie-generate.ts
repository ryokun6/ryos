import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  streamText,
  smoothStream,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import {
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  handlePreflightNode,
  getClientIpNode,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";
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
import { SUPPORTED_AI_MODELS } from "../src/types/aiModels.js";

const redis = createRedis();

const IE_CACHE_PREFIX = "ie:cache:";

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

// --- Node.js Runtime Config --------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 80;

// --- Handler --------------------------------------------------------------

const STATIC_SYSTEM_PROMPT = `${CORE_PRIORITY_INSTRUCTIONS}\n\nThe user is in ryOS Internet Explorer asking to time travel with website context and a specific year. You are Ryo, a visionary designer specialized in turning present websites into past and futuristic coherent versions in story and design.\n\nGenerate content for the URL path and year provided, original site content, and use provided HTML as template if available.\n\n${IE_HTML_GENERATION_INSTRUCTIONS}`;

const getDynamicSystemPrompt = (
  year: number | null,
  rawUrl: string | null
): string => {
  const currentYear = new Date().getFullYear();

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

  let yearSpecificInstructions = "";
  if (year === null) {
    yearSpecificInstructions = YEAR_NOT_SPECIFIED_INSTRUCTIONS;
  } else if (year > currentYear) {
    yearSpecificInstructions = FUTURE_YEAR_INSTRUCTIONS;
  } else if (year < currentYear) {
    yearSpecificInstructions = PAST_YEAR_INSTRUCTIONS;
  } else {
    yearSpecificInstructions = CURRENT_YEAR_INSTRUCTIONS;
  }

  let finalPrompt = `${INTRO_LINE}\n\n${yearSpecificInstructions}`;

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const effectiveOrigin = getEffectiveOriginNode(req);

  if (req.method === "OPTIONS") {
    if (handlePreflightNode(req, res, ["POST", "OPTIONS"], effectiveOrigin)) {
      return;
    }
  }

  if (!isAllowedOrigin(effectiveOrigin)) {
    return res.status(403).send("Unauthorized");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    // ---------------------------
    // Rate limiting (burst + budget per IP)
    // ---------------------------
    try {
      const ip = getClientIpNode(req);
      const BURST_WINDOW = 60;
      const BURST_LIMIT = 3;
      const BUDGET_WINDOW = 5 * 60 * 60;
      const BUDGET_LIMIT = 10;

      const burstKey = RateLimit.makeKey(["rl", "ie", "burst", "ip", ip]);
      const budgetKey = RateLimit.makeKey(["rl", "ie", "budget", "ip", ip]);

      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: BURST_WINDOW,
        limit: BURST_LIMIT,
      });
      if (!burst.allowed) {
        res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
        res.setHeader("Content-Type", "application/json");
        if (effectiveOrigin) {
          res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
        }
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
        res.setHeader("Retry-After", String(budget.resetSeconds ?? BUDGET_WINDOW));
        res.setHeader("Content-Type", "application/json");
        if (effectiveOrigin) {
          res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
        }
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
      console.error("IE generate rate-limit error", e);
    }

    const requestId = generateRequestId();
    const startTime =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const queryModel = req.query.model as SupportedModel | null;
    const targetUrl = req.query.url as string | undefined;
    const targetYear = req.query.year as string | undefined;

    const bodyData = (req.body || {}) as IEGenerateRequestBody;

    const bodyUrl = bodyData.url;
    const bodyYear = bodyData.year;

    const rawUrl = targetUrl || bodyUrl;
    const effectiveYearStr = targetYear || bodyYear;
    const effectiveYear = effectiveYearStr
      ? parseInt(effectiveYearStr, 10)
      : null;

    const normalizedUrlForKey = normalizeUrlForCacheKey(rawUrl);

    logRequest(
      req.method || "POST",
      req.url || "",
      `${rawUrl} (${effectiveYearStr || "N/A"})`,
      requestId
    );

    const {
      messages: incomingMessages = [],
      model: bodyModel = DEFAULT_MODEL,
    } = bodyData;

    const cacheKey =
      normalizedUrlForKey && effectiveYearStr
        ? `${IE_CACHE_PREFIX}${encodeURIComponent(
            normalizedUrlForKey
          )}:${effectiveYearStr}`
        : null;

    const model = queryModel || bodyModel || DEFAULT_MODEL;

    if (!Array.isArray(incomingMessages)) {
      return res.status(400).send("Invalid messages format");
    }

    if (model !== null && !SUPPORTED_AI_MODELS.includes(model)) {
      return res.status(400).send(`Unsupported model: ${model}`);
    }

    const selectedModel = getModelInstance(model as SupportedModel);

    const systemPrompt = getDynamicSystemPrompt(effectiveYear, rawUrl ?? null);

    const staticSystemMessage = {
      role: "system" as const,
      content: STATIC_SYSTEM_PROMPT,
    };

    const dynamicSystemMessage = {
      role: "system" as const,
      content: systemPrompt,
    };

    const uiMessages = ensureUIMessageFormat(incomingMessages);
    const modelMessages = await convertToModelMessages(uiMessages);

    const enrichedMessages: ModelMessage[] = [
      staticSystemMessage,
      dynamicSystemMessage,
      ...modelMessages,
    ];

    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      temperature: 0.7,
      maxOutputTokens: 4000,
      experimental_transform: smoothStream(),
      providerOptions: {
        openai: {
          reasoningEffort: "none",
        },
      },
      onFinish: async ({ text }) => {
        if (!cacheKey) {
          logInfo(requestId, "No cacheKey available, skipping cache save");
          return;
        }
        try {
          let cleaned = text.trim();
          const blockMatch = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/);
          if (blockMatch) {
            cleaned = blockMatch[1].trim();
          } else {
            cleaned = cleaned
              .replace(/```(?:html)?\s*/g, "")
              .replace(/```/g, "")
              .trim();
          }
          const titleCommentMatch = cleaned.match(/<!--\s*TITLE:[\s\S]*?-->/);
          if (titleCommentMatch) {
            const titleComment = titleCommentMatch[0];
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

    // For streaming response, return Web Response object (supported in Node.js runtime)
    const streamResponse = result.toUIMessageStreamResponse();

    const headers = new Headers(streamResponse.headers);
    headers.set("Access-Control-Allow-Origin", effectiveOrigin!);

    return new Response(streamResponse.body, {
      status: streamResponse.status,
      headers,
    });
  } catch (error) {
    const requestId = generateRequestId();
    logError(requestId, "IE Generate API error", error);

    if (error instanceof SyntaxError) {
      return res.status(400).send(`Bad Request: Invalid JSON - ${error.message}`);
    }

    return res.status(500).send("Internal Server Error");
  }
}
