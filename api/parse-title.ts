import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod/v3";
import * as RateLimit from "./utils/rate-limit";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "./utils/cors.js";

export const config = {
  runtime: "edge",
};

interface ParseTitleRequest {
  title: string;
  author_name?: string;
}

// Define a Zod schema for the expected output structure
const ParsedTitleSchema = z.object({
  title: z.string().optional().nullable(),
  artist: z.string().optional().nullable(),
  album: z.string().optional().nullable(),
});

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const effectiveOrigin = getEffectiveOrigin(req);
    if (!isAllowedOrigin(effectiveOrigin)) {
      return new Response("Unauthorized", { status: 403 });
    }

    // Rate limits: burst 15/min/IP + daily 500/IP
    try {
      const ip = RateLimit.getClientIp(req);
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
        return new Response(
          JSON.stringify({ error: "rate_limit_exceeded", scope: "burst" }),
          {
            status: 429,
            headers: {
              "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW),
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }

      const daily = await RateLimit.checkCounterLimit({
        key: dailyKey,
        windowSeconds: DAILY_WINDOW,
        limit: DAILY_LIMIT,
      });
      if (!daily.allowed) {
        return new Response(
          JSON.stringify({ error: "rate_limit_exceeded", scope: "daily" }),
          {
            status: 429,
            headers: {
              "Retry-After": String(daily.resetSeconds ?? DAILY_WINDOW),
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
            },
          }
        );
      }
    } catch (e) {
      // Fail open but log
      console.error("Rate limit check failed (parse-title)", e);
    }

    const { title: rawTitle, author_name } =
      (await req.json()) as ParseTitleRequest;

    if (!rawTitle || typeof rawTitle !== "string") {
      return new Response(JSON.stringify({ error: "No title provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use generateObject from the AI SDK
    const { object: parsedData } = await generateObject({
      model: openai("gpt-4.1-mini"),
      schema: ParsedTitleSchema, // Provide the Zod schema
      system: `You are an expert music metadata parser. Given a raw YouTube video title and optionally the channel name, extract the song title and artist. If possible, also extract the album name. Use the channel name as additional context for identifying the artist, especially when the artist name is not clear from the title alone. Respond ONLY with a valid JSON object matching the provided schema. If you cannot determine a field, omit it or set it to null. Prefer Chinese, then English, then Korean, then Japanese, then other languages name. Only include preferred language names and omit names for other languages. Example input: title="NewJeans (뉴진스) 'How Sweet' Official MV", author_name="HYBE LABELS". Example output: {"title": "How Sweet", "artist": "NewJeans"}. Example input: title="Lofi Hip Hop Radio - Beats to Relax/Study to", author_name="ChillHop Music". Example output: {"title": "Lofi Hip Hop Radio - Beats to Relax/Study to", "artist": null}.`,
      prompt: `Title: ${rawTitle}${
        author_name ? `\nChannel: ${author_name}` : ""
      }`,
      temperature: 0.2,
    });

    // The AI SDK's generateObject handles parsing and validation against the schema
    // If it reaches here, parsedData conforms to ParsedTitleSchema

    // Return the parsed data, filling missing fields with the original title if needed
    const result = {
      title: parsedData.title || rawTitle, // Default to raw title if parsing fails for title
      artist: parsedData.artist || undefined, // Default to undefined if no artist found
      album: parsedData.album || undefined, // Default to undefined if no album found
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": effectiveOrigin!,
      },
    });
  } catch (error: unknown) {
    console.error("Error parsing title:", error);

    // Simplified error handling for now, can be enhanced based on AI SDK specifics if needed
    let status = 500;
    let errorMessage = "Error parsing title";
    let errorDetails: string | undefined;

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

    return new Response(
      JSON.stringify({ error: errorMessage, details: errorDetails }),
      {
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
