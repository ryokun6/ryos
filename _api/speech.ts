import type { VercelRequest, VercelResponse } from "@vercel/node";
import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";
import { validateAuth } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { Redis } from "@upstash/redis";
import { initLogger } from "./_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// --- Default Configuration -----------------------------------------------

// Default model selection ("openai" or "elevenlabs")
const DEFAULT_MODEL = "elevenlabs";

// OpenAI defaults
const DEFAULT_OPENAI_VOICE = "alloy";
const DEFAULT_OPENAI_SPEED = 1.1;

// ElevenLabs defaults
const DEFAULT_ELEVENLABS_VOICE_ID = "kAyjEabBEu68HYYYRAHR"; // Ryo v3
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5"; // 2.5 turbo
const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.3,
  similarity_boost: 0.8,
  use_speaker_boost: true,
  speed: 1.1,
};

// Helper functions for Node.js runtime
function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

interface SpeechRequest {
  text: string;
  voice?: string | null;
  speed?: number;
  // New ElevenLabs-specific options
  model?: "openai" | "elevenlabs" | null;
  voice_id?: string | null;
  model_id?: string;
  output_format?:
    | "mp3_44100_128"
    | "mp3_22050_32"
    | "pcm_16000"
    | "pcm_22050"
    | "pcm_24000"
    | "pcm_44100"
    | "ulaw_8000";
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    use_speaker_boost?: boolean;
    speed?: number;
  };
}

// ElevenLabs API function
const generateElevenLabsSpeech = async (
  text: string,
  voice_id: string = DEFAULT_ELEVENLABS_VOICE_ID,
  model_id: string = DEFAULT_ELEVENLABS_MODEL_ID,
  output_format:
    | "mp3_44100_128"
    | "mp3_22050_32"
    | "pcm_16000"
    | "pcm_22050"
    | "pcm_24000"
    | "pcm_44100"
    | "ulaw_8000" = DEFAULT_ELEVENLABS_OUTPUT_FORMAT as "mp3_44100_128",
  voice_settings: SpeechRequest["voice_settings"] = DEFAULT_ELEVENLABS_VOICE_SETTINGS
): Promise<ArrayBuffer> => {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API key not configured");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id,
      output_format,
      voice_settings,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
  }

  return await response.arrayBuffer();
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();

  logger.request(req.method || "POST", req.url || "/api/speech", "speech");

  const effectiveOrigin = getEffectiveOrigin(req);

  // Handle CORS pre-flight request
  if (req.method === "OPTIONS") {
    setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.error("Unauthorized origin", effectiveOrigin);
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"] });

  // Create Redis client
  const redis = createRedis();

  // ---------------------------
  // Authentication extraction
  // ---------------------------
  const authHeaderInitial = req.headers.authorization;
  const headerAuthToken =
    authHeaderInitial && authHeaderInitial.startsWith("Bearer ")
      ? authHeaderInitial.substring(7)
      : null;
  const headerUsername = req.headers["x-username"] as string | undefined;

  const username = headerUsername || null;
  const authToken: string | undefined = headerAuthToken || undefined;

  // Validate authentication
  const validationResult = await validateAuth(redis, username, authToken);
  const isAuthenticated = validationResult.valid;
  const identifier = username ? username.toLowerCase() : null;

  // Check if this is ryo with valid authentication
  const isAuthenticatedRyo = isAuthenticated && identifier === "ryo";

  logger.info("Processing speech request", { username, isAuthenticated, isAuthenticatedRyo });

  // ---------------------------
  // Rate limiting (burst + daily)
  // ---------------------------
  try {
    // Skip rate limiting for authenticated ryo user
    if (!isAuthenticatedRyo) {
      const ip = getClientIp(req);
      const rateLimitIdentifier = isAuthenticated && identifier ? identifier : `anon:${ip}`;
      
      const BURST_WINDOW = 60;
      const BURST_LIMIT = 10;
      const DAILY_WINDOW = 60 * 60 * 24;
      const DAILY_LIMIT = 50;

      const burstKey = RateLimit.makeKey(["rl", "tts", "burst", rateLimitIdentifier]);
      const dailyKey = RateLimit.makeKey(["rl", "tts", "daily", rateLimitIdentifier]);

      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: BURST_WINDOW,
        limit: BURST_LIMIT,
      });

      if (!burst.allowed) {
        logger.warn("Rate limit exceeded (burst)", { rateLimitIdentifier });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
        res.setHeader("X-RateLimit-Limit", String(burst.limit));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, burst.limit - burst.count)));
        res.setHeader("X-RateLimit-Reset", String(burst.resetSeconds ?? BURST_WINDOW));
        res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "burst",
          limit: burst.limit,
          windowSeconds: burst.windowSeconds,
          resetSeconds: burst.resetSeconds,
          identifier: rateLimitIdentifier,
        });
        return;
      }

      const daily = await RateLimit.checkCounterLimit({
        key: dailyKey,
        windowSeconds: DAILY_WINDOW,
        limit: DAILY_LIMIT,
      });

      if (!daily.allowed) {
        logger.warn("Rate limit exceeded (daily)", { rateLimitIdentifier });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(daily.resetSeconds ?? DAILY_WINDOW));
        res.setHeader("X-RateLimit-Limit", String(daily.limit));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, daily.limit - daily.count)));
        res.setHeader("X-RateLimit-Reset", String(daily.resetSeconds ?? DAILY_WINDOW));
        res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "daily",
          limit: daily.limit,
          windowSeconds: daily.windowSeconds,
          resetSeconds: daily.resetSeconds,
          identifier: rateLimitIdentifier,
        });
        return;
      }
    } else {
      logger.info("Rate limit bypassed for authenticated ryo user");
    }
  } catch (e) {
    logger.error("Rate limit check failed (tts)", e);
  }

  try {
    const body = req.body as SpeechRequest;
    const {
      text,
      voice,
      speed,
      model,
      voice_id,
      model_id,
      output_format,
      voice_settings,
    } = body;

    logger.info("Parsed request body", {
      textLength: text?.length,
      model,
      voice,
      voice_id,
      model_id,
      speed,
      output_format,
      voice_settings,
    });

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      logger.error("'text' is required");
      logger.response(400, Date.now() - startTime);
      res.status(400).send("'text' is required");
      return;
    }

    let audioData: ArrayBuffer;
    let mimeType = "audio/mpeg";

    const selectedModel = model || DEFAULT_MODEL;

    if (selectedModel === "elevenlabs") {
      const elevenlabsVoiceId = voice_id || DEFAULT_ELEVENLABS_VOICE_ID;
      audioData = await generateElevenLabsSpeech(
        text.trim(),
        elevenlabsVoiceId,
        model_id || DEFAULT_ELEVENLABS_MODEL_ID,
        output_format,
        voice_settings
      );
      logger.info("ElevenLabs speech generated", {
        bytes: audioData.byteLength,
        voice_id: elevenlabsVoiceId,
      });
    } else {
      const openaiVoice = voice || DEFAULT_OPENAI_VOICE;
      const { audio } = await generateSpeech({
        model: openai.speech("tts-1"),
        text: text.trim(),
        voice: openaiVoice,
        outputFormat: "mp3",
        speed: speed ?? DEFAULT_OPENAI_SPEED,
      });

      audioData = audio.uint8Array.slice().buffer;
      mimeType = audio.mediaType ?? "audio/mpeg";
      logger.info("OpenAI speech generated", {
        bytes: audioData.byteLength,
        voice: openaiVoice,
      });
    }

    const buffer = Buffer.from(audioData);

    logger.response(200, Date.now() - startTime);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(buffer);

  } catch (error: unknown) {
    logger.error("Speech API error", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate speech";
    logger.response(500, Date.now() - startTime);
    res.status(500).send(message);
  }
}
