import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import * as RateLimit from "./_utils/_rate-limit.js";
import { initLogger } from "./_utils/_logging.js";
import formidable from "formidable";
import fs from "fs";

export const runtime = "nodejs";
export const maxDuration = 60;

// Disable body parsing for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

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

// Helper functions for Node.js runtime
function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return (req.headers["x-real-ip"] as string) || "unknown";
}

function getEffectiveOrigin(req: VercelRequest): string | null {
  return (req.headers.origin as string) || null;
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const allowedOrigins = [
    "https://os.ryo.lu",
    "https://ryos.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ];
  return allowedOrigins.some((allowed) => origin.startsWith(allowed)) || origin.includes("vercel.app");
}

function setCorsHeaders(res: VercelResponse, origin: string | null): void {
  res.setHeader("Content-Type", "application/json");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit imposed by OpenAI

// Helper to parse form data
function parseForm(req: VercelRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE_BYTES,
    });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/audio-transcribe", "audio-transcribe");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, effectiveOrigin);
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
    logger.warn("Unauthorized origin", { origin: effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    res.status(403).send("Unauthorized");
    return;
  }

  setCorsHeaders(res, effectiveOrigin);

  try {
    // Rate limiting (burst + daily) before reading form data
    try {
      const ip = getClientIp(req);
      const BURST_WINDOW = 60;
      const BURST_LIMIT = 10;
      const DAILY_WINDOW = 60 * 60 * 24;
      const DAILY_LIMIT = 50;

      const burstKey = RateLimit.makeKey(["rl", "transcribe", "burst", "ip", ip]);
      const dailyKey = RateLimit.makeKey(["rl", "transcribe", "daily", "ip", ip]);

      const burst = await RateLimit.checkCounterLimit({
        key: burstKey,
        windowSeconds: BURST_WINDOW,
        limit: BURST_LIMIT,
      });
      if (!burst.allowed) {
        logger.warn("Rate limit exceeded (burst)", { ip });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
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
        logger.warn("Rate limit exceeded (daily)", { ip });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(daily.resetSeconds ?? DAILY_WINDOW));
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
      logger.error("Rate limit check failed", rlErr);
    }

    // Parse form data
    const { files } = await parseForm(req);
    const audioFileArray = files.audio;
    const audioFile = Array.isArray(audioFileArray) ? audioFileArray[0] : audioFileArray;

    if (!audioFile) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    logger.info("Processing audio file", {
      originalFilename: audioFile.originalFilename,
      mimetype: audioFile.mimetype,
      size: audioFile.size,
    });

    // Verify file type
    if (!audioFile.mimetype?.startsWith("audio/")) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid file type. Must be an audio file." });
      return;
    }

    // Verify file size
    if (audioFile.size > MAX_FILE_SIZE_BYTES) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      });
      return;
    }

    // Create a file stream for OpenAI
    const fileStream = fs.createReadStream(audioFile.filepath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1",
    });

    // Clean up temp file
    fs.unlink(audioFile.filepath, () => {});

    logger.info("Transcription completed", { textLength: transcription.text.length });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ text: transcription.text });

  } catch (error: unknown) {
    logger.error("Error processing audio", error);
    const openAIError = error as OpenAIError;
    logger.response(openAIError.status || 500, Date.now() - startTime);
    res.status(openAIError.status || 500).json({
      error: openAIError.message || "Error processing audio",
      details: openAIError.error?.message,
    });
  }
}
