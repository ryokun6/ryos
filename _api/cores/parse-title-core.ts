import { openai } from "@ai-sdk/openai";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import * as RateLimit from "../_utils/_rate-limit.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ParseTitleRequest {
  title: string;
  author_name?: string;
}

const ParsedTitleSchema = z.object({
  title: z.string().nullable(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
});

interface ExecuteParseTitleCoreInput {
  originAllowed: boolean;
  body: unknown;
  ip: string;
}

interface LoggerLike {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

const noopLogger: LoggerLike = {
  info() {},
  warn() {},
  error() {},
};

export async function executeParseTitleCore(
  input: ExecuteParseTitleCoreInput,
  logger: LoggerLike = noopLogger
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    logger.warn("Unauthorized origin");
    return { status: 403, body: { error: "Unauthorized" } };
  }

  const BURST_WINDOW = 60;
  const BURST_LIMIT = 15;
  const DAILY_WINDOW = 60 * 60 * 24;
  const DAILY_LIMIT = 500;

  try {
    const burstKey = RateLimit.makeKey(["rl", "parse-title", "burst", "ip", input.ip]);
    const dailyKey = RateLimit.makeKey(["rl", "parse-title", "daily", "ip", input.ip]);

    const burst = await RateLimit.checkCounterLimit({
      key: burstKey,
      windowSeconds: BURST_WINDOW,
      limit: BURST_LIMIT,
    });
    if (!burst.allowed) {
      logger.warn("Rate limit exceeded (burst)", { ip: input.ip });
      return {
        status: 429,
        headers: { "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW) },
        body: { error: "rate_limit_exceeded", scope: "burst" },
      };
    }

    const daily = await RateLimit.checkCounterLimit({
      key: dailyKey,
      windowSeconds: DAILY_WINDOW,
      limit: DAILY_LIMIT,
    });
    if (!daily.allowed) {
      logger.warn("Rate limit exceeded (daily)", { ip: input.ip });
      return {
        status: 429,
        headers: { "Retry-After": String(daily.resetSeconds ?? DAILY_WINDOW) },
        body: { error: "rate_limit_exceeded", scope: "daily" },
      };
    }
  } catch (error) {
    logger.error("Rate limit check failed", error);
  }

  const body = input.body as ParseTitleRequest;
  const { title: rawTitle, author_name } = body || {};

  if (!rawTitle || typeof rawTitle !== "string") {
    return { status: 400, body: { error: "No title provided" } };
  }

  logger.info("Parsing title", { rawTitle, author_name });

  try {
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

    if (!parsedData) {
      logger.warn("AI returned undefined output, falling back to raw title");
      return {
        status: 200,
        body: { title: rawTitle, artist: undefined, album: undefined },
      };
    }

    const result = {
      title: parsedData.title ?? rawTitle,
      artist: parsedData.artist ?? undefined,
      album: parsedData.album ?? undefined,
    };
    logger.info("Title parsed successfully", result);
    return { status: 200, body: result };
  } catch (error: unknown) {
    if (NoObjectGeneratedError.isInstance(error)) {
      logger.warn("AI failed to generate structured output, falling back to raw title", {
        text: error.text,
        cause: error.cause,
      });
      return {
        status: 200,
        body: {
          title: rawTitle,
          artist: undefined,
          album: undefined,
        },
      };
    }

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
    return { status, body: { error: errorMessage } };
  }
}
