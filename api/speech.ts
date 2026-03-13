import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_VOICE_ID,
  DEFAULT_ELEVENLABS_VOICE_SETTINGS,
  DEFAULT_OPENAI_TTS_SPEED,
  DEFAULT_OPENAI_TTS_VOICE,
  DEFAULT_TTS_MODEL,
  generateElevenLabsSpeech,
  type ElevenLabsOutputFormat,
  type ElevenLabsVoiceSettings,
} from "./_utils/voice.js";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SpeechRequest {
  text: string;
  voice?: string | null;
  speed?: number;
  // New ElevenLabs-specific options
  model?: "openai" | "elevenlabs" | null;
  voice_id?: string | null;
  model_id?: string;
  output_format?: ElevenLabsOutputFormat;
  voice_settings?: ElevenLabsVoiceSettings;
}

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

      const selectedModel = model || DEFAULT_TTS_MODEL;

      if (selectedModel === "elevenlabs") {
        if (!process.env.ELEVENLABS_API_KEY) {
          logger.response(503, Date.now() - startTime);
          res.status(503).json({ error: "ElevenLabs API key not configured" });
          return;
        }

        const elevenlabsVoiceId = voice_id || DEFAULT_ELEVENLABS_VOICE_ID;
        audioData = await generateElevenLabsSpeech({
          text: text.trim(),
          voiceId: elevenlabsVoiceId,
          modelId: model_id || DEFAULT_ELEVENLABS_MODEL_ID,
          outputFormat: output_format,
          voiceSettings: voice_settings,
        });
        logger.info("ElevenLabs speech generated", {
          bytes: audioData.byteLength,
          voice_id: elevenlabsVoiceId,
        });
      } else {
        const openaiVoice = voice || DEFAULT_OPENAI_TTS_VOICE;
        const { audio } = await generateSpeech({
          model: openai.speech("tts-1"),
          text: text.trim(),
          voice: openaiVoice,
          outputFormat: "mp3",
          speed: speed ?? DEFAULT_OPENAI_TTS_SPEED,
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
