import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXERCISE_IMAGE_CREDITS } from "../../../src/apps/fitness/data/exerciseImageCredits";
import { SUPPLEMENTAL_EXERCISES } from "../../../src/apps/fitness/data/supplementalExercises";
import { exerciseImageUrl, LOCAL_EXERCISE_IMAGE_IDS } from "../../../src/shared/fitness";

const PUBLIC = join(import.meta.dir, "../../../public/fitness/exercises");

function jpeg(path: string): Buffer {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(bytes.byteLength).toBeGreaterThan(20_000);
  // Camera metadata would still contain an Exif marker.
  expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
  return bytes;
}

describe("supplemental exercise photos", () => {
  test("local photos resolve inside the repo and catalog photos stay on the library CDN", () => {
    expect(exerciseImageUrl("Bodyweight_Glute_Bridge/0.jpg")).toBe(
      "/fitness/exercises/Bodyweight_Glute_Bridge/0.jpg"
    );
    expect(exerciseImageUrl("Quadruped_Thoracic_Rotation/0.jpg")).toBe(
      "/fitness/exercises/Quadruped_Thoracic_Rotation/0.jpg"
    );
    const catalog = exerciseImageUrl("Box_Squat/0.jpg");
    expect(catalog).toContain("cdn.jsdelivr.net");
    expect(catalog).toContain("Box_Squat/0.jpg");
    expect(LOCAL_EXERCISE_IMAGE_IDS).toEqual([
      "Bodyweight_Glute_Bridge",
      "Quadruped_Thoracic_Rotation",
    ]);
  });

  test("the two verified photos are JPEGs with recorded licenses", () => {
    jpeg(join(PUBLIC, "Bodyweight_Glute_Bridge/0.jpg"));
    jpeg(join(PUBLIC, "Quadruped_Thoracic_Rotation/0.jpg"));
    expect(EXERCISE_IMAGE_CREDITS.Bodyweight_Glute_Bridge).toMatchObject({
      author: "Marianne Gilbak",
      license: "CC BY-SA 4.0",
      sourcePage: "https://commons.wikimedia.org/wiki/File:Glute-bridge.png",
    });
    expect(EXERCISE_IMAGE_CREDITS.Quadruped_Thoracic_Rotation).toMatchObject({
      author: "Eric Astrauskas",
      license: "CC BY 2.0",
      sourcePage: "https://www.flickr.com/photos/personaltrainertoronto/44067004171",
    });
    const byId = new Map(SUPPLEMENTAL_EXERCISES.map((exercise) => [exercise.id, exercise]));
    expect(byId.get("Bodyweight_Glute_Bridge")?.images).toEqual(["Bodyweight_Glute_Bridge/0.jpg"]);
    expect(byId.get("Quadruped_Thoracic_Rotation")?.images).toEqual([
      "Quadruped_Thoracic_Rotation/0.jpg",
    ]);
  });

  test("movements without a verified photo are not given a stand-in image", () => {
    const unillustrated = [
      "Supine_Adductor_Ball_Squeeze",
      "Machine_Hip_Thrust",
      "Wall_Slide",
      "Dumbbell_Romanian_Deadlift",
    ];
    const byId = new Map(SUPPLEMENTAL_EXERCISES.map((exercise) => [exercise.id, exercise]));
    for (const id of unillustrated) {
      expect(byId.get(id)?.images).toEqual([]);
      expect(EXERCISE_IMAGE_CREDITS[id]).toBeUndefined();
    }
  });
});
