import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { uploadFile, type ProviderReference } from "ai";
import { AI_MODELS, type SupportedModel } from "./_aiModels.js";

/** Cap Google Files API PROCESSING polls so we fall back to inline data quickly. */
export const GOOGLE_FILES_POLL_TIMEOUT_MS = 30_000;

function getFilesApiForModel(modelId: SupportedModel) {
  switch (AI_MODELS[modelId].provider) {
    case "OpenAI":
      return openai.files();
    case "Anthropic":
      return anthropic.files();
    case "Google":
      return google.files();
    default:
      return null;
  }
}

export type UploadedProviderFile = {
  providerReference: ProviderReference;
  mediaType: string;
};

/**
 * Upload raw bytes to the active model provider and return a ProviderReference
 * suitable for `{ type: "file", data: providerReference }` message parts.
 *
 * Returns null when the provider has no files API or the upload fails, so
 * callers can fall back to inline data.
 *
 * Callers must use the returned `mediaType` (full MIME, e.g. `image/jpeg`) on
 * the file part — top-level types like `"image"` throw in provider converters
 * when the data is a provider reference rather than inline bytes.
 */
export async function uploadProviderFileForModel({
  modelId,
  data,
  mediaType,
  filename,
  log,
}: {
  modelId: SupportedModel;
  data: Uint8Array;
  mediaType: string;
  filename?: string;
  log?: (...args: unknown[]) => void;
}): Promise<UploadedProviderFile | null> {
  const api = getFilesApiForModel(modelId);
  if (!api) {
    log?.(
      `[uploadProviderFile] No files API for model ${modelId}; using inline data`
    );
    return null;
  }

  try {
    const result = await uploadFile({
      api,
      data,
      mediaType,
      ...(filename ? { filename } : {}),
      // Google polls PROCESSING up to 5m by default; keep chat/telegram snappy.
      providerOptions: {
        google: { pollTimeoutMs: GOOGLE_FILES_POLL_TIMEOUT_MS },
      },
    });
    return {
      providerReference: result.providerReference,
      // Prefer the provider's resolved MIME; fall back to the request type.
      mediaType: result.mediaType || mediaType,
    };
  } catch (error) {
    log?.(
      `[uploadProviderFile] Upload failed for ${modelId}; falling back to inline data`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
