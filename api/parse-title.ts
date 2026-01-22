import type { VercelRequest, VercelResponse } from "@vercel/node";
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  setCorsHeaders,
  isOriginAllowed,
  getClientIpFromRequest,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";

export const config = {
  runtime: "nodejs",
};

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
  const origin = req.headers.origin as string | undefined;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, ["POST", "OPTIONS"]);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, ["POST", "OPTIONS"]);

  if (req.method !== "POST") {
    res.status(405).end("Method not allowed");
    return;
  }

  try {
    if (!isOriginAllowed(origin)) {
      res.status(403).end("Unauthorized");
      return;
    }

    // Rate limits: burst 15/min/IP + daily 500/IP
    try {
      const ip = getClientIpFromRequest(req);
      const BURST_WINDOW = 60;
      const BURST_LIMIT = 15;
      const DAILY_WINDOW = 60 * 60 * 24;
      const DAILY_LIMIT = 500;

      const burstKey = RateLimit.makeKey([
        "rl",
        "parse-title",
        "burst",
        "ip",
        ip,
      ]);
      const dailyKey = RateLimit.makeKey([
        "rl",
        "parse-title",
        "daily",
        "ip",
        ip,
      ]);

      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: BURST_WINDOW,
        limit: BURST_LIMIT,
      });
      if (!burst.allowed) {
        res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
        res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
        return;
      }

      const daily = await RateLimit.checkCounterLimit({
        key: dailyKey,
        windowSeconds: DAILY_WINDOW,
        limit: DAILY_LIMIT,
      });
      if (!daily.allowed) {
        res.setHeader("Retry-After", String(daily.resetSeconds ?? DAILY_WINDOW));
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
        res.status(429).json({ error: "rate_limit_exceeded", scope: "daily" });
        return;
      }
    } catch (e) {
      // Fail open but log
      console.error("Rate limit check failed (parse-title)", e);
    }

    const { title: rawTitle, author_name } = req.body as ParseTitleRequest;

    if (!rawTitle || typeof rawTitle !== "string") {
      res.status(400).json({ error: "No title provided" });
      return;
    }

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
          content: `Title: ${rawTitle}${
            author_name ? `\nChannel: ${author_name}` : ""
          }`,
        },
      ],
      temperature: 0.2,
    });

    // The AI SDK's structured output parsing validates against the schema
    // If it reaches here, parsedData conforms to ParsedTitleSchema

    // Return the parsed data, filling missing fields with the original title if needed
    const result = {
      title: parsedData.title ?? rawTitle, // Default to raw title if parsing fails for title
      artist: parsedData.artist ?? undefined, // Default to undefined if no artist found
      album: parsedData.album ?? undefined, // Default to undefined if no album found
    };

    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.status(200).json(result);
  } catch (error: unknown) {
    console.error("Error parsing title:", error);

    // Simplified error handling for now, can be enhanced based on AI SDK specifics if needed
    let status = 500;
    let errorMessage = "Error parsing title";

    if (error instanceof Error) {
      errorMessage = error.message;
      // Potentially check for specific AI SDK error types here
      // For example, if the SDK throws structured errors
    }

    // Attempt to get status code if available (might differ with AI SDK)
    // This part might need adjustment depending on how AI SDK surfaces errors
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
    ) {
      status = error.status;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(status).json({ error: errorMessage });
  }
}
