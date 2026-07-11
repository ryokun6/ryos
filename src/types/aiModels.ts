// Re-export the runtime-neutral AI model registry from the shared module.
// Kept as a stable import path (`@/types/aiModels`) for existing frontend code.
export {
  AI_MODELS,
  SUPPORTED_AI_MODELS,
  AI_MODEL_METADATA,
  DEFAULT_AI_MODEL,
  AI_CHAT_RESERVED_OUTPUT_TOKENS,
  AI_CHAT_COMPACTION_SAFETY_TOKENS,
  AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX,
  getAIModelContextWindow,
  getModelConversationTokenBudget,
} from "@/shared/aiModels";
export type {
  AIModel,
  SupportedModel,
  AIModelInfo,
} from "@/shared/aiModels";
