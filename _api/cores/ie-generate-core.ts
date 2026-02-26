import {
  streamText,
  smoothStream,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { Redis } from "@upstash/redis";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  SupportedModel,
  DEFAULT_MODEL,
  getModelInstance,
} from "../_utils/_aiModels.js";
import { normalizeUrlForCacheKey } from "../_utils/_url.js";
import {
  CORE_PRIORITY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
  IE_HTML_GENERATION_INSTRUCTIONS,
} from "../_utils/_aiPrompts.js";
import { SUPPORTED_AI_MODELS } from "../_utils/_aiModels.js";
import type { CoreResponse } from "../_runtime/core-types.js";

const IE_CACHE_PREFIX = "ie:cache:";

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

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

export type IeGenerateCoreResult =
  | {
      kind: "stream";
      stream: ReturnType<typeof streamText>;
      status: number;
      headers?: Record<string, string>;
    }
  | {
      kind: "response";
      response: CoreResponse;
      bodyType: "json" | "text";
    };

const textResponse = (status: number, text: string): IeGenerateCoreResult => ({
  kind: "response",
  response: { status, body: text },
  bodyType: "text",
});

const jsonResponse = (status: number, body: unknown): IeGenerateCoreResult => ({
  kind: "response",
  response: { status, body },
  bodyType: "json",
});

interface IeGenerateCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  query: {
    model?: string;
    url?: string;
    year?: string;
  };
  body: unknown;
  clientIp: string;
}

export async function executeIeGenerateCore(
  input: IeGenerateCoreInput
): Promise<IeGenerateCoreResult> {
  if (!input.originAllowed) {
    return textResponse(403, "Unauthorized");
  }
  if (input.method !== "POST") {
    return textResponse(405, "Method not allowed");
  }

  try {
    const BURST_WINDOW = 60;
    const BURST_LIMIT = 3;
    const BUDGET_WINDOW = 5 * 60 * 60;
    const BUDGET_LIMIT = 10;

    const burstKey = RateLimit.makeKey(["rl", "ie", "burst", "ip", input.clientIp]);
    const budgetKey = RateLimit.makeKey(["rl", "ie", "budget", "ip", input.clientIp]);

    const burst = await RateLimit.checkCounterLimit({
      key: burstKey,
      windowSeconds: BURST_WINDOW,
      limit: BURST_LIMIT,
    });
    if (!burst.allowed) {
      return {
        kind: "response",
        response: {
          status: 429,
          headers: { "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW) },
          body: {
            error: "rate_limit_exceeded",
            scope: "burst",
            limit: burst.limit,
            windowSeconds: burst.windowSeconds,
            resetSeconds: burst.resetSeconds,
            identifier: `ip:${input.clientIp}`,
          },
        },
        bodyType: "json",
      };
    }

    const budget = await RateLimit.checkCounterLimit({
      key: budgetKey,
      windowSeconds: BUDGET_WINDOW,
      limit: BUDGET_LIMIT,
    });
    if (!budget.allowed) {
      return {
        kind: "response",
        response: {
          status: 429,
          headers: { "Retry-After": String(budget.resetSeconds ?? BUDGET_WINDOW) },
          body: {
            error: "rate_limit_exceeded",
            scope: "budget",
            limit: budget.limit,
            windowSeconds: budget.windowSeconds,
            resetSeconds: budget.resetSeconds,
            identifier: `ip:${input.clientIp}`,
          },
        },
        bodyType: "json",
      };
    }
  } catch {
    // Fail open on rate-limit errors.
  }

  const queryModel = input.query.model as SupportedModel | undefined;
  const targetUrl = input.query.url as string | undefined;
  const targetYear = input.query.year as string | undefined;
  const bodyData = (input.body || {}) as IEGenerateRequestBody;
  const bodyUrl = bodyData.url;
  const bodyYear = bodyData.year;

  const rawUrl = targetUrl || bodyUrl;
  const effectiveYearStr = targetYear || bodyYear;
  const effectiveYear = effectiveYearStr ? parseInt(effectiveYearStr, 10) : null;
  const normalizedUrlForKey = normalizeUrlForCacheKey(rawUrl);

  const { messages: incomingMessages = [], model: bodyModel = DEFAULT_MODEL } = bodyData;

  const cacheKey =
    normalizedUrlForKey && effectiveYearStr
      ? `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:${effectiveYearStr}`
      : null;

  const model = queryModel || bodyModel || DEFAULT_MODEL;
  if (!Array.isArray(incomingMessages)) {
    return textResponse(400, "Invalid messages format");
  }
  if (model !== null && !SUPPORTED_AI_MODELS.includes(model)) {
    return textResponse(400, `Unsupported model: ${model}`);
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

  try {
    const startTime = Date.now();
    const redis = createRedis();
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
          return;
        }
        try {
          let cleaned = text.trim();
          const blockMatch = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/);
          if (blockMatch) {
            cleaned = blockMatch[1].trim();
          } else {
            cleaned = cleaned.replace(/```(?:html)?\s*/g, "").replace(/```/g, "").trim();
          }
          const titleCommentMatch = cleaned.match(/<!--\s*TITLE:[\s\S]*?-->/);
          if (titleCommentMatch) {
            const titleComment = titleCommentMatch[0];
            cleaned = titleComment + cleaned.replace(new RegExp(titleComment, "g"), "");
          }
          await redis.lpush(cacheKey, cleaned);
          await redis.ltrim(cacheKey, 0, 4);
          void (Date.now() - startTime);
        } catch {
          // Fail open if cache write fails.
        }
      },
    });

    return {
      kind: "stream",
      stream: result,
      status: 200,
      headers: {},
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return textResponse(400, `Bad Request: Invalid JSON - ${error.message}`);
    }
    return textResponse(500, "Internal Server Error");
  }
}
