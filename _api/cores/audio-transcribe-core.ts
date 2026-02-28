import OpenAI from "openai";
import { toFile } from "openai/uploads";
import * as RateLimit from "../_utils/_rate-limit.js";
import type { CoreResponse } from "../_runtime/core-types.js";
import fs from "fs";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

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

interface AudioFileInput {
  originalFilename?: string | null;
  mimetype?: string | null;
  size: number;
  filepath: string;
}

interface AudioTranscribeCoreInput {
  clientIp: string;
  audioFile: AudioFileInput | undefined;
}

export async function executeAudioTranscribeCore(
  input: AudioTranscribeCoreInput
): Promise<CoreResponse> {
  try {
    const BURST_WINDOW = 60;
    const BURST_LIMIT = 10;
    const DAILY_WINDOW = 60 * 60 * 24;
    const DAILY_LIMIT = 50;

    const burstKey = RateLimit.makeKey(["rl", "transcribe", "burst", "ip", input.clientIp]);
    const dailyKey = RateLimit.makeKey(["rl", "transcribe", "daily", "ip", input.clientIp]);

    const burst = await RateLimit.checkCounterLimit({
      key: burstKey,
      windowSeconds: BURST_WINDOW,
      limit: BURST_LIMIT,
    });
    if (!burst.allowed) {
      return {
        status: 429,
        headers: { "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW) },
        body: {
          error: "rate_limit_exceeded",
          scope: "burst",
          limit: burst.limit,
          windowSeconds: burst.windowSeconds,
          resetSeconds: burst.resetSeconds,
          identifier: `ip:${input.clientIp}`,
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
        headers: { "Retry-After": String(daily.resetSeconds ?? DAILY_WINDOW) },
        body: {
          error: "rate_limit_exceeded",
          scope: "daily",
          limit: daily.limit,
          windowSeconds: daily.windowSeconds,
          resetSeconds: daily.resetSeconds,
          identifier: `ip:${input.clientIp}`,
        },
      };
    }

    if (!input.audioFile) {
      return { status: 400, body: { error: "No audio file provided" } };
    }

    if (!input.audioFile.mimetype?.startsWith("audio/")) {
      return {
        status: 400,
        body: { error: "Invalid file type. Must be an audio file." },
      };
    }

    if (input.audioFile.size > MAX_FILE_SIZE_BYTES) {
      return {
        status: 400,
        body: {
          error: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        },
      };
    }

    const buffer = await fs.promises.readFile(input.audioFile.filepath);
    fs.unlink(input.audioFile.filepath, () => {});

    const file = await toFile(
      buffer,
      input.audioFile.originalFilename || "recording.webm",
      { type: input.audioFile.mimetype || "audio/webm" }
    );

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });

    return { status: 200, body: { text: transcription.text } };
  } catch (error: unknown) {
    const openAIError = error as OpenAIError;
    return {
      status: openAIError.status || 500,
      body: {
        error: openAIError.message || "Error processing audio",
        details: openAIError.error?.message,
      },
    };
  }
}
