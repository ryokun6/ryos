import type { VercelRequest, VercelResponse } from "@vercel/node";
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import * as RateLimit from "./_utils/_rate-limit.js";
import { initLogger } from "./_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 30;

// Helper functions for Node.js runtime
function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return (req.headers["x-real-ip"] as string) || "unknown";
}

function getEffectiveOrigin(req: VercelRequest): string | null {
  return (req.headers.origin as string) || null;
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const allowedOrigins = [
    "https://os.ryo.lu",
    "https://ryos.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ];
  return allowedOrigins.some((allowed) => origin.startsWith(allowed)) || origin.includes("vercel.app");
}

function setCorsHeaders(res: VercelResponse, origin: string | null): void {
  res.setHeader("Content-Type", "application/json");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

interface ParseTitleRequest {
  title: string;
  author_name?: string;
}

// Define a Zod schema for the expected output structure
const ParsedTitleSchema = z.object({
  title: z.string().nullable(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/parse-title", "parse-title");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, effectiveOrigin);
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  setCorsHeaders(res, effectiveOrigin);

  try {
    if (!isAllowedOrigin(effectiveOrigin)) {
      logger.warn("Unauthorized origin", { origin: effectiveOrigin });
      logger.response(403, Date.now() - startTime);
      res.status(403).send("Unauthorized");
      return;
    }

    // Rate limits: burst 15/min/IP + daily 500/IP
    try {
      const ip = getClientIp(req);
      const BURST_WINDOW = 60;
      const BURST_LIMIT = 15;
      const DAILY_WINDOW = 60 * 60 * 24;
      const DAILY_LIMIT = 500;

      const burstKey = RateLimit.makeKey(["rl", "parse-title", "burst", "ip", ip]);
      const dailyKey = RateLimit.makeKey(["rl", "parse-title", "daily", "ip", ip]);

      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: BURST_WINDOW,
        limit: BURST_LIMIT,
      });
      if (!burst.allowed) {
        logger.warn("Rate limit exceeded (burst)", { ip });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
        res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
        return;
      }

      const daily = await RateLimit.checkCounterLimit({
        key: dailyKey,
        windowSeconds: DAILY_WINDOW,
        limit: DAILY_LIMIT,
      });
      if (!daily.allowed) {
        logger.warn("Rate limit exceeded (daily)", { ip });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(daily.resetSeconds ?? DAILY_WINDOW));
        res.status(429).json({ error: "rate_limit_exceeded", scope: "daily" });
        return;
      }
    } catch (e) {
      logger.error("Rate limit check failed", e);
    }

    const body = req.body as ParseTitleRequest;
    const { title: rawTitle, author_name } = body;

    if (!rawTitle || typeof rawTitle !== "string") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "No title provided" });
      return;
    }

    logger.info("Parsing title", { rawTitle, author_name });

    // Use generateText with structured output (AI SDK v6)
    const { output: parsedData } = await generateText({
      model: openai("gpt-4.1-mini"),
      output: Output.object({
        schema: ParsedTitleSchema,
        name: "parsed_title",
      }),
      messages: [
        {
          role: "system",
          content: `You are an expert music metadata parser. Given a raw YouTube video title and optionally the channel name, extract the song title and artist. If possible, also extract the album name. Use the channel name as additional context for identifying the artist, especially when the artist name is not clear from the title alone. Respond ONLY with a valid JSON object matching the provided schema. If you cannot determine a field, omit it or set it to null. Always prefer the original language names over translated/romanized versions. For example, prefer "晴天" over "Sunny Day", "周杰倫" over "Jay Chou", "뉴진스" over "NewJeans". When both original and translated names are present, use the original language version. If the song originates from a non-English speaking region, use the native script (Chinese characters, Korean hangul, Japanese kanji/hiragana/katakana, etc.). Example input: title="Jay Chou - Sunny Day (周杰倫 - 晴天)", author_name="Jay Chou". Example output: {"title": "晴天", "artist": "周杰倫"}. Example input: title="NewJeans (뉴진스) 'How Sweet' Official MV", author_name="HYBE LABELS". Example output: {"title": "How Sweet", "artist": "뉴진스"}. Example input: title="Lofi Hip Hop Radio - Beats to Relax/Study to", author_name="ChillHop Music". Example output: {"title": "Lofi Hip Hop Radio - Beats to Relax/Study to", "artist": null}.`,
        },
        {
          role: "user",
          content: `Title: ${rawTitle}${author_name ? `\nChannel: ${author_name}` : ""}`,
        },
      ],
      temperature: 0.2,
    });

    const result = {
      title: parsedData.title ?? rawTitle,
      artist: parsedData.artist ?? undefined,
      album: parsedData.album ?? undefined,
    };

    logger.info("Title parsed successfully", result);
    logger.response(200, Date.now() - startTime);
    res.status(200).json(result);

  } catch (error: unknown) {
    logger.error("Error parsing title", error);

    let status = 500;
    let errorMessage = "Error parsing title";

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
    ) {
      status = error.status;
    }

    logger.response(status, Date.now() - startTime);
    res.status(status).json({ error: errorMessage });
  }
}
