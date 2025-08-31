// Lightweight shim for local dev. Mirrors the shape used by api modules.
export const DEFAULT_MODEL = "gpt-4.1";

export const getModelInstance = (model) => {
  // Return a minimal stub object matching LanguageModelV1 interface used in codepaths.
  return {
    async generate(input) {
      return { output: `stub response for model ${model || DEFAULT_MODEL}` };
    },
    async chat() {
      return { output: `stub chat for model ${model || DEFAULT_MODEL}` };
    },
  };
};
