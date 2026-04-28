/**
 * AI-driven TV channel creation.
 *
 * Flow:
 *   1. Take a one-line user description ("skateboarding tricks", "lofi study").
 *   2. Ask the model for a short channel name + 2-3 diverse YouTube search
 *      queries that would surface fitting videos.
 *   3. Run each query against the YouTube Data API (rotating across the keys
 *      already configured for /api/youtube-search).
 *   4. De-dup by video id, return a ready-to-use Channel payload.
 */

import { google } from "@ai-sdk/google";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 45;

const RequestSchema = z.object({
  description: z
    .string()
    .min(2, "Description is required")
    .max(280, "Description too long"),
});

type CreateChannelRequest = z.infer<typeof RequestSchema>;

const ChannelPlanSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(24)
    .describe(
      "A short channel name (1-3 words). Avoid generic words like 'TV' or 'Channel'."
    ),
  description: z
    .string()
    .min(1)
    .max(120)
    .describe("A one-line tagline describing what the channel plays."),
  queries: z
    .array(z.string().min(2).max(80))
    .min(1)
    .max(4)
    .describe(
      "2-4 diverse YouTube search queries that, taken together, will surface a varied lineup of videos for the channel."
    ),
});

interface YouTubeSearchItem {
  id: { videoId?: string };
  snippet: { title: string; channelTitle: string };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  error?: { code: number; message: string };
}

interface ChannelVideo {
  id: string;
  url: string;
  title: string;
  artist: string;
}

const SYSTEM_PROMPT = `You design themed YouTube "TV channels" for a retro desktop OS.
Given a short description, return a punchy channel name, a one-line tagline, and 2-4 diverse YouTube search queries that will surface a varied lineup of videos for the channel.
Rules:
- Channel name: 1-3 words, evocative, NOT generic. Avoid the words "TV", "Channel", or "Network" alone unless paired distinctively (e.g. "MTV", "アニメTV").
- Tagline: one short sentence, present-tense, no period at the end.
- Queries: each query is its own YouTube search; vary angles (themes, decades, sub-topics) so we don't get duplicates. Use plain search terms — do NOT include site: filters or quotes.
- All output strings should be in the same language as the user's description; keep proper nouns / titles in their original language.
Respond with ONLY the structured object. No prose.`;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function searchOneQuery(
  query: string,
  apiKeys: string[],
  perQuery: number
): Promise<ChannelVideo[]> {
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("safeSearch", "moderate");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(perQuery));
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    const data = (await res.json()) as YouTubeSearchResponse;

    if (!res.ok || data.error) {
      const message = data.error?.message?.toLowerCase() ?? "";
      const isQuota =
        res.status === 403 &&
        (message.includes("quota") ||
          message.includes("exceeded") ||
          message.includes("limit"));
      if (isQuota && i < apiKeys.length - 1) continue;
      throw new Error(
        data.error?.message || `YouTube API error (${res.status})`
      );
    }

    return (data.items ?? [])
      .filter((item): item is Required<YouTubeSearchItem> & {
        id: { videoId: string };
      } => Boolean(item.id?.videoId))
      .map((item) => ({
        id: item.id.videoId!,
        url: `https://youtu.be/${item.id.videoId}`,
        title: decodeHtml(item.snippet.title),
        artist: decodeHtml(item.snippet.channelTitle),
      }));
  }
  return [];
}

export default apiHandler<CreateChannelRequest>(
  {
    methods: ["POST"],
    auth: "optional",
    parseJsonBody: true,
  },
  async ({ req, res, logger, startTime, body, user }) => {
    // Rate limit: small daily/burst budget per IP since each call burns
    // ~3 YouTube quota points × 100 = ~300 quota.
    try {
      const ip = getClientIp(req);
      const burstKey = RateLimit.makeKey([
        "rl",
        "tv-create-channel",
        "burst",
        "ip",
        ip,
      ]);
      const dailyKey = RateLimit.makeKey([
        "rl",
        "tv-create-channel",
        "daily",
        "ip",
        ip,
      ]);
      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: 60,
        limit: 5,
      });
      if (!burst.allowed) {
        res.setHeader(
          "Retry-After",
          String(burst.resetSeconds ?? 60)
        );
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
        return;
      }
      const daily = await RateLimit.checkCounterLimit({
        key: dailyKey,
        windowSeconds: 60 * 60 * 24,
        limit: user ? 30 : 8,
      });
      if (!daily.allowed) {
        res.setHeader(
          "Retry-After",
          String(daily.resetSeconds ?? 60 * 60 * 24)
        );
        logger.response(429, Date.now() - startTime);
        res.status(429).json({ error: "rate_limit_exceeded", scope: "daily" });
        return;
      }
    } catch (err) {
      logger.error("Rate limit check failed", err);
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: "Invalid request body", details: parsed.error.format() });
      return;
    }

    const apiKeys = [
      process.env.YOUTUBE_API_KEY,
      process.env.YOUTUBE_API_KEY_2,
    ].filter((k): k is string => Boolean(k));

    if (apiKeys.length === 0) {
      logger.error("No YOUTUBE_API_KEY configured");
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "YouTube API is not configured" });
      return;
    }

    const { description } = parsed.data;
    logger.info("Creating channel", { description });

    // Step 1: AI plans the channel.
    let plan: z.infer<typeof ChannelPlanSchema>;
    try {
      const { output } = await generateText({
        model: google("gemini-3-flash-preview"),
        output: Output.object({
          schema: ChannelPlanSchema,
          name: "channel_plan",
        }),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Description: ${description}`,
          },
        ],
        temperature: 0.5,
      });
      if (!output) throw new Error("AI returned no plan");
      plan = output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        logger.warn("AI failed to generate channel plan", {
          text: error.text,
          cause: error.cause,
        });
      } else {
        logger.error("AI plan failed", error);
      }
      logger.response(502, Date.now() - startTime);
      res.status(502).json({ error: "Failed to plan channel" });
      return;
    }

    logger.info("Plan", {
      name: plan.name,
      description: plan.description,
      queries: plan.queries,
    });

    // Step 2: Fan out YouTube searches.
    const TARGET_TOTAL = 24;
    const perQuery = Math.max(
      6,
      Math.ceil(TARGET_TOTAL / plan.queries.length)
    );

    const settled = await Promise.allSettled(
      plan.queries.map((q) => searchOneQuery(q, apiKeys, perQuery))
    );

    const seen = new Set<string>();
    const videos: ChannelVideo[] = [];
    for (const result of settled) {
      if (result.status !== "fulfilled") {
        logger.warn("Search query failed", {
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
        continue;
      }
      for (const v of result.value) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        videos.push(v);
        if (videos.length >= TARGET_TOTAL) break;
      }
      if (videos.length >= TARGET_TOTAL) break;
    }

    if (videos.length === 0) {
      logger.error("No videos found for any query", { queries: plan.queries });
      logger.response(404, Date.now() - startTime);
      res
        .status(404)
        .json({ error: "No videos found for this channel idea" });
      return;
    }

    logger.info("Channel created", {
      name: plan.name,
      videoCount: videos.length,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      name: plan.name,
      description: plan.description,
      queries: plan.queries,
      videos,
    });
  }
);
