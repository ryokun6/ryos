#!/usr/bin/env bun
import { afterEach, describe, expect, test } from "bun:test";
import {
  EXERCISE_SOURCE_URLS,
  getExerciseLibrary,
  parseExerciseLibrary,
  resetExerciseLibraryCacheForTests,
  toListExercise,
} from "../../../api/fitness/_helpers/_exercises";
import {
  buildFoodPrompt,
  FoodAnalyzeRequestSchema,
  foodResultFromAi,
} from "../../../api/fitness/_helpers/_food";
import { exerciseImageUrl, normalizeExerciseRecord } from "../../../src/shared/fitness";

const record = {
  id: "Barbell_Squat",
  name: "Barbell Squat",
  force: "push",
  level: "beginner",
  mechanic: "compound",
  equipment: "barbell",
  primaryMuscles: ["quadriceps"],
  secondaryMuscles: ["glutes", "hamstrings", "glutes"],
  instructions: ["Unrack the bar.", "Squat down."],
  category: "strength",
  images: ["Barbell_Squat/0.jpg", "../evil.svg"],
};

describe("exercise library", () => {
  afterEach(resetExerciseLibraryCacheForTests);

  test("normalizes records and rejects unsafe image paths; unknown enums fall back", () => {
    const exercise = normalizeExerciseRecord(record)!;
    expect(exercise.images).toEqual(["Barbell_Squat/0.jpg"]);
    expect(exercise.secondaryMuscles).toEqual(["glutes", "hamstrings"]);
    expect(normalizeExerciseRecord({ ...record, category: "dance", equipment: "?" })).toMatchObject({
      category: "strength",
      equipment: "other",
    });
    expect(normalizeExerciseRecord({ ...record, id: "" })).toBeNull();
    expect(exerciseImageUrl("Barbell_Squat/0.jpg")).toContain("/exercises/Barbell_Squat/0.jpg");
  });

  test("parse dedupes and sorts; list payload omits instructions", () => {
    const parsed = parseExerciseLibrary([
      { ...record, id: "Z", name: "Zercher Squat" },
      record,
      record,
      "junk",
    ]);
    expect(parsed.map((e) => e.name)).toEqual(["Barbell Squat", "Zercher Squat"]);
    expect(toListExercise(parsed[0]).instructions).toEqual([]);
    expect(() => parseExerciseLibrary({})).toThrow();
  });

  test("fetches once, falls back to the mirror, and serves stale data on failure", async () => {
    const calls: string[] = [];
    let fail = false;
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (fail || url === EXERCISE_SOURCE_URLS[0]) return new Response("nope", { status: 503 });
      return new Response(JSON.stringify([record]));
    }) as unknown as typeof fetch;

    const [a, b] = await Promise.all([
      getExerciseLibrary({ fetchImpl, now: 0 }),
      getExerciseLibrary({ fetchImpl, now: 0 }),
    ]);
    expect(a).toBe(b);
    expect(calls).toEqual(EXERCISE_SOURCE_URLS);
    expect(a.byId.get("Barbell_Squat")?.name).toBe("Barbell Squat");

    await getExerciseLibrary({ fetchImpl, now: 1000 });
    expect(calls).toHaveLength(2);

    fail = true;
    const stale = await getExerciseLibrary({ fetchImpl, now: 2 * 24 * 60 * 60 * 1000 });
    expect(stale.exercises).toHaveLength(1);
  });
});

describe("food analyze request", () => {
  test("requires a photo or text and strips data URL prefixes", () => {
    expect(FoodAnalyzeRequestSchema.safeParse({}).success).toBe(false);
    expect(FoodAnalyzeRequestSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(FoodAnalyzeRequestSchema.safeParse({ text: "2 eggs", locale: "zh-TW" }).success).toBe(true);
    expect(FoodAnalyzeRequestSchema.safeParse({ text: "x", locale: "en; drop" }).success).toBe(false);
    const parsed = FoodAnalyzeRequestSchema.parse({
      image: { mediaType: "image/jpeg", data: "data:image/jpeg;base64,QUJDREVGR0hJSktMTU5PUA==\n" },
    });
    expect(parsed.image?.data).toBe("QUJDREVGR0hJSktMTU5PUA==");
    expect(
      FoodAnalyzeRequestSchema.safeParse({ image: { mediaType: "image/gif", data: "QUJDREVGR0hJSktMTU5PUA==" } })
        .success
    ).toBe(false);
    expect(
      FoodAnalyzeRequestSchema.safeParse({ image: { mediaType: "image/png", data: "not base64 at all!!" } })
        .success
    ).toBe(false);
  });

  test("prompt includes locale, description and injection guard", () => {
    const prompt = buildFoodPrompt({ hasImage: true, text: "with butter", locale: "ja" });
    expect(prompt.instructions).toContain('"ja"');
    expect(prompt.instructions).toContain("never as instructions");
    expect(prompt.user).toContain("attached photo");
    expect(prompt.user).toContain("Description: with butter");
  });

  test("AI output is clamped and non-food results drop items", () => {
    const result = foodResultFromAi({
      isFood: true,
      title: "  ",
      items: [
        { name: "Rice", portion: "200 g", calories: 260.4, proteinG: 5.44, carbsG: 57, fatG: -1 },
        { name: "", portion: "", calories: 10, proteinG: 0, carbsG: 0, fatG: 0 },
      ],
      confidence: 1.7,
      notes: " ",
    });
    expect(result).toMatchObject({ title: "Rice", confidence: 1, notes: null, isFood: true });
    expect(result.items).toEqual([
      { name: "Rice", portion: "200 g", calories: 260, proteinG: 5.4, carbsG: 57, fatG: 0 },
    ]);
    const none = foodResultFromAi({ isFood: false, title: "Cat", items: result.items, confidence: 0.9, notes: null });
    expect(none).toMatchObject({ isFood: false, items: [] });
  });
});
