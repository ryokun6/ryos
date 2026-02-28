import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import formidable from "formidable";
import { executeAudioTranscribeCore } from "./cores/audio-transcribe-core.js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Disable body parsing for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

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
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/audio-transcribe", "audio-transcribe");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
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

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });

  try {
    // Parse form data
    const { files } = await parseForm(req);
    const audioFileArray = files.audio;
    const audioFile = Array.isArray(audioFileArray) ? audioFileArray[0] : audioFileArray;
    if (audioFile) {
      logger.info("Processing audio file", {
        originalFilename: audioFile.originalFilename,
        mimetype: audioFile.mimetype,
        size: audioFile.size,
      });
    }

    const result = await executeAudioTranscribeCore({
      clientIp: getClientIp(req),
      audioFile: audioFile
        ? {
            originalFilename: audioFile.originalFilename,
            mimetype: audioFile.mimetype,
            size: audioFile.size,
            filepath: audioFile.filepath,
          }
        : undefined,
    });

    if (result.status === 200) {
      const text = (result.body as { text?: string })?.text || "";
      logger.info("Transcription completed", { textLength: text.length });
    } else if (result.status >= 500) {
      logger.error("Error processing audio");
    }

    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    logger.response(result.status, Date.now() - startTime);
    res.status(result.status).json(result.body);
  } catch (error: unknown) {
    logger.error("Error processing audio", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({
      error: "Error processing audio",
    });
  }
}
