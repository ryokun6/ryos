import type { Redis } from "@upstash/redis";
import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import type { CoreResponse } from "../_runtime/core-types.js";

// Default model selection ("openai" or "elevenlabs")
const DEFAULT_MODEL = "elevenlabs";
const DEFAULT_OPENAI_VOICE = "alloy";
const DEFAULT_OPENAI_SPEED = 1.1;
const DEFAULT_ELEVENLABS_VOICE_ID = "kAyjEabBEu68HYYYRAHR";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5";
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

async function generateElevenLabsSpeech(
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
): Promise<ArrayBuffer> {
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

  return response.arrayBuffer();
}

interface SpeechCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  body: unknown;
  redis: Redis;
  username: string | null;
  authToken: string | undefined;
  ip: string;
}

export async function executeSpeechCore(input: SpeechCoreInput): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: "Unauthorized" };
  }
  if (input.method !== "POST") {
    return { status: 405, body: "Method not allowed" };
  }

  const validationResult = await validateAuth(input.redis, input.username, input.authToken);
  const isAuthenticated = validationResult.valid;
  const identifier = input.username ? input.username.toLowerCase() : null;
  const isAuthenticatedRyo = isAuthenticated && identifier === "ryo";

  try {
    if (!isAuthenticatedRyo) {
      const rateLimitIdentifier =
        isAuthenticated && identifier ? identifier : `anon:${input.ip}`;

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
        return {
          status: 429,
          headers: {
            "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW),
            "X-RateLimit-Limit": String(burst.limit),
            "X-RateLimit-Remaining": String(Math.max(0, burst.limit - burst.count)),
            "X-RateLimit-Reset": String(burst.resetSeconds ?? BURST_WINDOW),
          },
          body: {
            error: "rate_limit_exceeded",
            scope: "burst",
            limit: burst.limit,
            windowSeconds: burst.windowSeconds,
            resetSeconds: burst.resetSeconds,
            identifier: rateLimitIdentifier,
          },
        };
      }

      const daily = await RateLimit.checkCounterLimit({
        key: dailyKey,
        windowSeconds: DAILY_WINDOW,
        limit: DAILY_LIMIT,
      });
      if (!daily.allowed) {
        return {
          status: 429,
          headers: {
            "Retry-After": String(daily.resetSeconds ?? DAILY_WINDOW),
            "X-RateLimit-Limit": String(daily.limit),
            "X-RateLimit-Remaining": String(Math.max(0, daily.limit - daily.count)),
            "X-RateLimit-Reset": String(daily.resetSeconds ?? DAILY_WINDOW),
          },
          body: {
            error: "rate_limit_exceeded",
            scope: "daily",
            limit: daily.limit,
            windowSeconds: daily.windowSeconds,
            resetSeconds: daily.resetSeconds,
            identifier: rateLimitIdentifier,
          },
        };
      }
    }
  } catch {
    // best-effort rate limiting
  }

  try {
    const body = input.body as SpeechRequest;
    const { text, voice, speed, model, voice_id, model_id, output_format, voice_settings } =
      body || {};

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return { status: 400, body: "'text' is required" };
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
    }

    const buffer = Buffer.from(audioData);
    return {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
      },
      body: buffer,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to generate speech";
    return { status: 500, body: message };
  }
}
