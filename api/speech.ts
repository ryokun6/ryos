import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";

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

export default apiHandler<SpeechRequest>(
  {
    methods: ["POST"],
    parseJsonBody: true,
    auth: "optional",
    contentType: null,
  },
  async ({ req, res, logger, startTime, body, user }) => {
    const username = user?.username ?? null;
    const isAuthenticated = !!user;
    const isAuthenticatedRyo = isAuthenticated && username === "ryo";
    const identifier = username;

    logger.info("Processing speech request", {
      username,
      isAuthenticated,
      isAuthenticatedRyo,
    });

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
          res.setHeader(
            "X-RateLimit-Remaining",
            String(Math.max(0, burst.limit - burst.count))
          );
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
          res.setHeader(
            "X-RateLimit-Remaining",
            String(Math.max(0, daily.limit - daily.count))
          );
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
      const {
        text,
        voice,
        speed,
        model,
        voice_id,
        model_id,
        output_format,
        voice_settings,
      } = body ?? {};

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
        res.status(400).json({ error: "'text' is required" });
        return;
      }

      let audioData: ArrayBuffer;
      let mimeType = "audio/mpeg";

      const selectedModel = model || DEFAULT_MODEL;

      if (selectedModel === "elevenlabs") {
        if (!ELEVENLABS_API_KEY) {
          logger.response(503, Date.now() - startTime);
          res.status(503).json({ error: "ElevenLabs API key not configured" });
          return;
        }

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

      const status =
        typeof message === "string" && message.includes("ElevenLabs API key not configured")
          ? 503
          : 500;

      logger.response(status, Date.now() - startTime);
      res.status(status).json({ error: message });
    }
  }
);
