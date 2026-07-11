import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { uploadFile, type ProviderReference } from "ai";
import { AI_MODELS, type SupportedModel } from "./_aiModels.js";

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

/**
 * Upload raw bytes to the active model provider and return a ProviderReference
 * suitable for `{ type: "file", data: providerReference }` message parts.
 *
 * Returns null when the provider has no files API or the upload fails, so
 * callers can fall back to inline data.
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
}): Promise<ProviderReference | null> {
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
    });
    return result.providerReference;
  } catch (error) {
    log?.(
      `[uploadProviderFile] Upload failed for ${modelId}; falling back to inline data`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
