import OpenAI, { APIError } from "openai";
import { toFile } from "openai/uploads";
import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const AUTH_LIMIT_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

const REMOVE_BG_PROMPT =
  "Edit this product or cover image into a shelf-ready cutout. " +
  "Remove the background completely — output only the main subject on a fully transparent alpha background. " +
  "Do not add any new background, fill, matte, border, floor plane, reflection, or drop shadow. " +
  "Compose the subject so it can stand on a shelf: grounded and stable, with a natural resting pose when applicable " +
  "(upright bottles/cans, boxes sitting flat, soft goods settled). " +
  "The object should read as sitting on a surface near the bottom of the frame — not floating awkwardly mid-frame. " +
  "Keep modest transparent padding above and at the sides; avoid large empty transparent margins beneath the subject. " +
  "Preserve product likeness, proportions, colors, and labels with clean natural edges. " +
  "Do not invent large new geometry, logos, or details.";

/** OpenAI gpt-image edits accept png / jpeg / webp only. */
const bodySchema = z.object({
  imageBase64: z.string().min(1).max(8_000_000),
  mediaType: z
    .string()
    .regex(/^image\/(png|jpeg|jpg|webp)$/i, "Unsupported image media type"),
});

function normalizeMediaType(mediaType: string): "image/png" | "image/jpeg" | "image/webp" {
  const normalized = mediaType.toLowerCase().replace("image/jpg", "image/jpeg");
  if (normalized === "image/png" || normalized === "image/webp") {
    return normalized;
  }
  return "image/jpeg";
}

function extensionForMediaType(mediaType: "image/png" | "image/jpeg" | "image/webp"): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  return "jpg";
}

function decodeBase64Image(input: string): Uint8Array {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Image data is empty.");
  }
  const commaIndex = trimmed.indexOf(",");
  const base64 = commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
  const sanitized = base64.replace(/\s+/g, "");
  if (!sanitized) {
    throw new Error("Image data is empty.");
  }

  const buffer = Buffer.from(sanitized, "base64");
  if (buffer.byteLength === 0) {
    throw new Error("Image data is empty.");
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the 4 MB size limit.");
  }
  return new Uint8Array(buffer);
}

function mapOpenAiError(error: unknown): {
  status: number;
  error: string;
  message: string;
} {
  if (error instanceof APIError) {
    const status = error.status ?? 502;
    if (status === 401 || status === 403) {
      return {
        status: 503,
        error: "upstream_unavailable",
        message: "Background removal is temporarily unavailable.",
      };
    }
    if (status === 429) {
      return {
        status: 429,
        error: "upstream_rate_limit",
        message: "Image service is busy. Please try again shortly.",
      };
    }
    if (status >= 400 && status < 500) {
      return {
        status: 400,
        error: "invalid_image",
        message: error.message || "The image could not be processed.",
      };
    }
    return {
      status: 502,
      error: "background_removal_failed",
      message: error.message || "Could not remove the background.",
    };
  }

  return {
    status: 502,
    error: "background_removal_failed",
    message:
      error instanceof Error
        ? error.message
        : "Could not remove the background.",
  };
}

/**
 * Remove the background from a Stuff cover image via OpenAI gpt-image-1 edits
 * (transparent PNG). Auth required; rate-limited per user.
 *
 * Uses the official OpenAI SDK + `toFile` so the multipart upload includes a
 * filename — required by `/v1/images/edits`. AI SDK `generateImage` currently
 * appends Blobs without filenames and OpenAI rejects them with 400.
 */
export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    bodySchema,
    // Binary PNG response — disable default JSON content-type.
    contentType: null,
  },
  async ({ res, logger, startTime, user, body }) => {
    const username = user!.username;
    const rateLimitBypass = username === "ryo";

    if (!process.env.OPENAI_API_KEY) {
      logger.error("OPENAI_API_KEY is not configured");
      logger.response(503, Date.now() - startTime);
      res.status(503).json({
        error: "upstream_unavailable",
        message: "Background removal is temporarily unavailable.",
      });
      return;
    }

    if (!rateLimitBypass) {
      try {
        const key = RateLimit.makeKey([
          "rl",
          "stuff",
          "remove-background",
          "hour",
          "user",
          username,
        ]);
        const rl = await RateLimit.checkCounterLimit({
          key,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          limit: AUTH_LIMIT_PER_HOUR,
        });
        if (!rl.allowed) {
          logger.info("[rate-limit] stuff remove-background blocked", {
            username,
            limit: rl.limit,
            resetSeconds: rl.resetSeconds,
          });
          logger.response(429, Date.now() - startTime);
          res.setHeader("Retry-After", String(rl.resetSeconds));
          res.status(429).json({
            error: "rate_limit_exceeded",
            limit: rl.limit,
            retryAfter: rl.resetSeconds,
          });
          return;
        }
      } catch (error) {
        logger.error("Rate limit check failed:", error);
        logger.response(503, Date.now() - startTime);
        res.status(503).json({
          error: "rate_limit_unavailable",
          message:
            "Rate limiting is temporarily unavailable. Please try again shortly.",
        });
        return;
      }
    } else {
      logger.info("[rate-limit] Bypass enabled for trusted user", { username });
    }

    let imageBytes: Uint8Array;
    try {
      imageBytes = decodeBase64Image(body.imageBase64);
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: "invalid_image",
        message: error instanceof Error ? error.message : "Invalid image data.",
      });
      return;
    }

    const mediaType = normalizeMediaType(body.mediaType);
    const filename = `cover.${extensionForMediaType(mediaType)}`;

    try {
      logger.info("Starting Stuff cover background removal (gpt-image-1)", {
        username,
        mediaType,
        bytes: imageBytes.byteLength,
      });

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const imageFile = await toFile(imageBytes, filename, { type: mediaType });

      const result = await openai.images.edit({
        model: "gpt-image-1",
        image: imageFile,
        prompt: REMOVE_BG_PROMPT,
        n: 1,
        background: "transparent",
        output_format: "png",
        quality: "medium",
        input_fidelity: "high",
      });

      const b64 = result.data?.[0]?.b64_json;
      if (!b64) {
        logger.error("Background removal returned no image");
        logger.response(502, Date.now() - startTime);
        res.status(502).json({
          error: "background_removal_failed",
          message: "The model did not return an image.",
        });
        return;
      }

      const outBytes = Buffer.from(b64, "base64");
      logger.info("Stuff cover background removal succeeded", {
        username,
        mediaType: "image/png",
        bytes: outBytes.byteLength,
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      logger.response(200, Date.now() - startTime);
      res.status(200).send(outBytes);
    } catch (error) {
      const mapped = mapOpenAiError(error);
      logger.error("Stuff cover background removal failed:", error);
      logger.response(mapped.status, Date.now() - startTime);
      res.status(mapped.status).json({
        error: mapped.error,
        message: mapped.message,
      });
    }
  }
);
