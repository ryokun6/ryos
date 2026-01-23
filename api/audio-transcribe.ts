/**
 * POST /api/audio-transcribe
 * 
 * Transcribe audio using OpenAI Whisper
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { IncomingForm, File as FormidableFile } from "formidable";
import fs from "fs";
import {
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
  getClientIpNode,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Disable body parsing to handle multipart/form-data
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

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit imposed by OpenAI

// Parse form data using formidable
async function parseForm(req: VercelRequest): Promise<{ fields: Record<string, unknown>; files: Record<string, FormidableFile | FormidableFile[]> }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: MAX_FILE_SIZE_BYTES,
    });
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files: files as Record<string, FormidableFile | FormidableFile[]> });
      }
    });
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const effectiveOrigin = getEffectiveOriginNode(req);

  // Handle CORS preflight
  if (handlePreflightNode(req, res, ["POST", "OPTIONS"])) {
    return;
  }

  setCorsHeadersNode(res, effectiveOrigin, ["POST", "OPTIONS"]);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAllowedOrigin(effectiveOrigin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Rate limiting (burst + daily) before reading form data
    try {
      const ip = getClientIpNode(req);
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

    const { files } = await parseForm(req);
    const audioFileData = files.audio;
    
    if (!audioFileData) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    // Handle both single file and array
    const audioFile = Array.isArray(audioFileData) ? audioFileData[0] : audioFileData;

    // Verify file type
    if (!audioFile.mimetype?.startsWith("audio/")) {
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

    // Read the file and create a File object for OpenAI
    const fileBuffer = fs.readFileSync(audioFile.filepath);
    const file = new File([fileBuffer], audioFile.originalFilename || "audio.webm", {
      type: audioFile.mimetype || "audio/webm",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
    });

    // Clean up temp file
    fs.unlinkSync(audioFile.filepath);

    res.status(200).json({ text: transcription.text });
  } catch (error: unknown) {
    console.error("Error processing audio:", error);
    const openAIError = error as OpenAIError;
    res.status(openAIError.status || 500).json({
      error: openAIError.message || "Error processing audio",
      details: openAIError.error?.message,
    });
  }
}
