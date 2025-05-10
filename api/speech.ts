import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";

// Allowed origins for CORS
const ALLOWED_ORIGINS = new Set(["https://os.ryo.lu", "http://localhost:3000"]);

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

export const runtime = "edge";
export const maxDuration = 60;
export const config = {
  runtime: "edge",
};

interface SpeechRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export default async function handler(req: Request) {
  // Generate a request ID and log the incoming request
  const requestId = generateRequestId();
  const startTime =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  logRequest(req.method, req.url, "speech", requestId);

  const origin = req.headers.get("origin");

  // Handle CORS pre-flight request
  if (req.method === "OPTIONS") {
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    return new Response("Unauthorized", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    logError(requestId, "Unauthorized origin", origin);
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    const { text, voice, speed } = (await req.json()) as SpeechRequest;

    logInfo(requestId, "Parsed request body", {
      textLength: text?.length,
      voice,
      speed,
    });

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      logError(requestId, "'text' is required", null);
      return new Response("'text' is required", { status: 400 });
    }

    // Generate speech audio (mp3) using OpenAI TTS model via AI SDK
    const { audio } = await generateSpeech({
      model: openai.speech("gpt-4o-mini-tts"),
      text: text.trim(),
      voice: voice ?? "alloy",
      outputFormat: "mp3",
      speed: speed ?? 4,
    });

    logInfo(requestId, "Speech generated", { bytes: audio.uint8Array.length });

    // Convert the Uint8Array to a ReadableStream for streaming back to the client
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(audio.uint8Array);
        controller.close();
      },
    });

    const response = new Response(stream, {
      headers: {
        "Content-Type": audio.mimeType ?? "audio/mpeg",
        "Content-Length": audio.uint8Array.length.toString(),
        "Access-Control-Allow-Origin": origin,
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
