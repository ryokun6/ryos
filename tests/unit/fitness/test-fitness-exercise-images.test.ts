import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SUPPLEMENTAL_EXERCISES } from "../../../src/apps/fitness/data/supplementalExercises";
import { exerciseImageUrl } from "../../../src/shared/fitness";

const PUBLIC_EXERCISES = join(import.meta.dir, "../../../public/fitness/exercises");

describe("supplemental exercise photos", () => {
  test("catalog photos stay on the library CDN", () => {
    const catalog = exerciseImageUrl("Box_Squat/0.jpg");
    expect(catalog).toContain("cdn.jsdelivr.net");
    expect(catalog).toContain("Box_Squat/0.jpg");
  });

  test("the six added movements have no photo until a clear licensed one exists", () => {
    for (const exercise of SUPPLEMENTAL_EXERCISES) {
      expect(exercise.images).toEqual([]);
    }
    expect(existsSync(PUBLIC_EXERCISES)).toBe(false);
  });
});
