export {
  AI_MODELS,
  SUPPORTED_AI_MODELS,
  DEFAULT_AI_MODEL,
  AI_MODEL_METADATA,
  type AIModel,
  type AIModelInfo,
  type SupportedModel,
} from "../../src/shared/aiModels.js";

export {
  DEFAULT_MODEL,
  TELEGRAM_DEFAULT_MODEL,
  getModelInstance,
  getOpenAIProviderOptions,
  getTelegramModel,
} from "./ai-model-resolver.js";
