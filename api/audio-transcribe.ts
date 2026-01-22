import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import {
  setCorsHeaders,
  isOriginAllowed,
  getClientIpFromRequest,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";

interface OpenAIError {
  status: number;
  message: string;
  error?: {
    message: string;
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  runtime: "nodejs",
};

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit imposed by OpenAI

// Helper to convert VercelRequest to a Web Request for formData parsing
async function getFormDataFromRequest(req: VercelRequest): Promise<FormData> {
  // In Node.js 18+, we need to construct a proper Request from the incoming message
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = `${protocol}://${host}${req.url}`;
  
  // Collect body chunks
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  
  // Create a Web Request object
  const webRequest = new Request(url, {
    method: req.method || "POST",
    headers: req.headers as HeadersInit,
    body: body,
  });
  
  return webRequest.formData();
}

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

  if (!isOriginAllowed(origin)) {
    res.status(403).end("Unauthorized");
    return;
  }

  try {
    // Rate limiting (burst + daily) before reading form data
    try {
      const ip = getClientIpFromRequest(req);
      const BURST_WINDOW = 60; // 1 minute
      const BURST_LIMIT = 10;
      const DAILY_WINDOW = 60 * 60 * 24; // 1 day
      const DAILY_LIMIT = 50;

      const burstKey = RateLimit.makeKey(["rl", "transcribe", "burst", "ip", ip]);
      const dailyKey = RateLimit.makeKey(["rl", "transcribe", "daily", "ip", ip]);

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
        res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "burst",
          limit: burst.limit,
          windowSeconds: burst.windowSeconds,
          resetSeconds: burst.resetSeconds,
          identifier: `ip:${ip}`,
        });
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
        res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "daily",
          limit: daily.limit,
          windowSeconds: daily.windowSeconds,
          resetSeconds: daily.resetSeconds,
          identifier: `ip:${ip}`,
        });
        return;
      }
    } catch (rlErr) {
      console.error("Rate limit check failed (transcribe)", rlErr);
      // Fail open: let it continue
    }

    // Parse form data using Web API
    const formData = await getFormDataFromRequest(req);
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    // Verify file type
    if (!audioFile.type.startsWith("audio/")) {
      res.status(400).json({ error: "Invalid file type. Must be an audio file." });
      return;
    }

    // Verify file size
    if (audioFile.size > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({
        error: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      });
      return;
    }

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.status(200).json({ text: transcription.text });
  } catch (error: unknown) {
    console.error("Error processing audio:", error);
    const openAIError = error as OpenAIError;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.status(openAIError.status || 500).json({
      error: openAIError.message || "Error processing audio",
      details: openAIError.error?.message,
    });
  }
}
