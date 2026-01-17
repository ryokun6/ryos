import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  getClientIp,
} from "./_utils/middleware.js";
import { validateAuthToken } from "./_utils/auth/index.js";
import * as RateLimit from "./_utils/_rate-limit.js";

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

// --- Logging Utilities ---------------------------------------------------

const logRequest = (
  method: string,
  url: string,
  action: string | null,
  id: string
) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

const logInfo = (id: string, message: string, data?: unknown) => {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
};

const logError = (id: string, message: string, error: unknown) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = (): string =>
  Math.random().toString(36).substring(2, 10);

// Redis client setup
const redis = createRedis();

export const config = {
  runtime: "edge",
};
export const maxDuration = 60;

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

export default async function handler(req: Request) {
  // Generate a request ID and log the incoming request
  const requestId = generateRequestId();
  const startTime =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  logRequest(req.method, req.url, "speech", requestId);

  const effectiveOrigin = getEffectiveOrigin(req);

  // Handle CORS pre-flight request
  if (req.method === "OPTIONS") {
    const resp = preflightIfNeeded(req, ["POST", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!isAllowedOrigin(effectiveOrigin)) {
    logError(requestId, "Unauthorized origin", effectiveOrigin);
    return new Response("Unauthorized", { status: 403 });
  }

  // ---------------------------
  // Authentication extraction
  // ---------------------------
  const authHeaderInitial = req.headers.get("authorization");
  const headerAuthToken =
    authHeaderInitial && authHeaderInitial.startsWith("Bearer ")
      ? authHeaderInitial.substring(7)
      : null;
  const headerUsername = req.headers.get("x-username");

  const username = headerUsername || null;
  const authToken: string | undefined = headerAuthToken || undefined;

  // Validate authentication
  const validationResult = await validateAuthToken(redis, username, authToken);
  const isAuthenticated = validationResult.valid;
  const identifier = username ? username.toLowerCase() : null;

  // Check if this is ryo with valid authentication
  const isAuthenticatedRyo = isAuthenticated && identifier === "ryo";

  // ---------------------------
  // Rate limiting (burst + daily)
  // ---------------------------
  try {
    // Skip rate limiting for authenticated ryo user
    if (!isAuthenticatedRyo) {
      const ip = getClientIp(req);
      // Use identifier (username or anon:ip) like chat.ts does
      const rateLimitIdentifier = isAuthenticated && identifier ? identifier : `anon:${ip}`;
      
      const BURST_WINDOW = 60; // 1 minute
      const BURST_LIMIT = 10;
      const DAILY_WINDOW = 60 * 60 * 24; // 1 day
      const DAILY_LIMIT = 50;

      const burstKey = RateLimit.makeKey(["rl", "tts", "burst", rateLimitIdentifier]);
      const dailyKey = RateLimit.makeKey(["rl", "tts", "daily", rateLimitIdentifier]);

      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: BURST_WINDOW,
        limit: BURST_LIMIT,
      });

      if (!burst.allowed) {
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            scope: "burst",
            limit: burst.limit,
            windowSeconds: burst.windowSeconds,
            resetSeconds: burst.resetSeconds,
            identifier: rateLimitIdentifier,
          }),
          {
            status: 429,
            headers: {
              "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW),
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
              "X-RateLimit-Limit": String(burst.limit),
              "X-RateLimit-Remaining": String(Math.max(0, burst.limit - burst.count)),
              "X-RateLimit-Reset": String(burst.resetSeconds ?? BURST_WINDOW),
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
          JSON.stringify({
            error: "rate_limit_exceeded",
            scope: "daily",
            limit: daily.limit,
            windowSeconds: daily.windowSeconds,
            resetSeconds: daily.resetSeconds,
            identifier: rateLimitIdentifier,
          }),
          {
            status: 429,
            headers: {
              "Retry-After": String(daily.resetSeconds ?? DAILY_WINDOW),
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": effectiveOrigin!,
              "X-RateLimit-Limit": String(daily.limit),
              "X-RateLimit-Remaining": String(Math.max(0, daily.limit - daily.count)),
              "X-RateLimit-Reset": String(daily.resetSeconds ?? DAILY_WINDOW),
            },
          }
        );
      }
    } else {
      logInfo(requestId, "Rate limit bypassed for authenticated ryo user");
    }
  } catch (e) {
    // Fail open but log; do not block TTS if limiter errors
    logError(requestId, "Rate limit check failed (tts)", e);
  }

  try {
    const {
      text,
      voice,
      speed,
      model, // Can be null, undefined, "openai", or "elevenlabs"
      voice_id,
      model_id,
      output_format,
      voice_settings,
    } = (await req.json()) as SpeechRequest;

    logInfo(requestId, "Parsed request body", {
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
      logError(requestId, "'text' is required", null);
      return new Response("'text' is required", { status: 400 });
    }

    let audioData: ArrayBuffer;
    let mimeType = "audio/mpeg";

    // Use default model if null/undefined
    const selectedModel = model || DEFAULT_MODEL;

    if (selectedModel === "elevenlabs") {
      // Use ElevenLabs - apply defaults for voice_id if not provided
      const elevenlabsVoiceId = voice_id || DEFAULT_ELEVENLABS_VOICE_ID;
      audioData = await generateElevenLabsSpeech(
        text.trim(),
        elevenlabsVoiceId,
        model_id || DEFAULT_ELEVENLABS_MODEL_ID,
        output_format,
        voice_settings
      );
      logInfo(requestId, "ElevenLabs speech generated", {
        bytes: audioData.byteLength,
        voice_id: elevenlabsVoiceId,
      });
    } else {
      // Use OpenAI (default behavior) - apply defaults for voice if not provided
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
      logInfo(requestId, "OpenAI speech generated", {
        bytes: audioData.byteLength,
        voice: openaiVoice,
      });
    }

    // Convert ArrayBuffer to Uint8Array for streaming
    const uint8Array = new Uint8Array(audioData);

    // Create a ReadableStream for streaming back to the client
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(uint8Array);
        controller.close();
      },
    });

    const response = new Response(stream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": audioData.byteLength.toString(),
        "Access-Control-Allow-Origin": effectiveOrigin!,
        "Cache-Control": "no-store",
      },
    });

    const duration =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);

    return response;
  } catch (error: unknown) {
    logError(requestId, "Speech API error", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate speech";
    return new Response(message, { status: 500 });
  }
}
