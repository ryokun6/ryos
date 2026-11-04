import { google } from "@ai-sdk/google";

/**
 * Stable Gemini 3.5 Flash-Lite. It ignores temperature/topP/topK and uses
 * thinkingLevel ("minimal" | "low" | "medium" | "high"), defaulting to minimal.
 */
export const GEMINI_FLASH_LITE_MODEL_ID = "gemini-3.5-flash-lite";

export type GeminiFlashLiteThinkingLevel = "minimal" | "low" | "medium" | "high";

export function geminiFlashLiteSettings(thinkingLevel: GeminiFlashLiteThinkingLevel) {
  return {
    model: google(GEMINI_FLASH_LITE_MODEL_ID),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel,
          includeThoughts: false,
        },
      },
    },
  };
}
