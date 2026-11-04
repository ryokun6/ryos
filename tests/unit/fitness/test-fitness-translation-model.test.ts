import { describe, expect, test } from "bun:test";
import {
  FITNESS_EXERCISE_TRANSLATION_MODEL,
  fitnessExerciseTranslationSettings,
} from "../../../scripts/translate-fitness-exercises";

describe("fitness exercise translation model", () => {
  test("uses gemini-3.5-flash-lite with minimal thinking and no sampling params", () => {
    expect(FITNESS_EXERCISE_TRANSLATION_MODEL).toBe("gemini-3.5-flash-lite");
    expect(fitnessExerciseTranslationSettings.model.modelId).toBe(
      "gemini-3.5-flash-lite"
    );
    expect(
      fitnessExerciseTranslationSettings.providerOptions.google.thinkingConfig
    ).toEqual({
      thinkingLevel: "minimal",
      includeThoughts: false,
    });
    expect(fitnessExerciseTranslationSettings).not.toHaveProperty("temperature");
    expect(fitnessExerciseTranslationSettings).not.toHaveProperty("topP");
    expect(fitnessExerciseTranslationSettings).not.toHaveProperty("topK");
  });
});
