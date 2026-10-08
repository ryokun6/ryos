import { describe, expect, test } from "bun:test";
import type { FitnessExercise } from "../../../src/shared/fitness";
import { auditFitnessExerciseCatalogs, readExerciseCatalog } from "../../../src/apps/fitness/utils/exerciseCatalogAudit";
import {
  exerciseNameDisplay,
  exerciseSearchLabels,
  localizedInstructions,
} from "../../../src/apps/fitness/utils/exerciseI18n";
import {
  DEFAULT_EXERCISE_FILTERS,
  exerciseQueryMatches,
  filterExercises,
} from "../../../src/apps/fitness/utils/exerciseLibrary";

const BENCH_ID = "Barbell_Bench_Press_-_Medium_Grip";
const SQUAT_ID = "Barbell_Squat";
const DEADLIFT_ID = "Barbell_Deadlift";
const SITUP_ID = "3_4_Sit-Up";

function exercise(partial: Pick<FitnessExercise, "id" | "name"> & Partial<FitnessExercise>): FitnessExercise {
  return {
    category: "strength",
    equipment: "barbell",
    level: "beginner",
    force: "push",
    mechanic: "compound",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    instructions: ["Lower the bar.", "Press it up."],
    images: [],
    ...partial,
  };
}

describe("fitness exercise names", () => {
  test("English UI shows only the English name", () => {
    expect(exerciseNameDisplay("Barbell Bench Press", "槓鈴臥推", "en")).toEqual({
      primary: "Barbell Bench Press",
      secondary: null,
    });
  });

  test("non-English UI shows the localized name and the English name", () => {
    expect(exerciseNameDisplay("Barbell Bench Press", "ベンチプレス", "ja")).toEqual({
      primary: "ベンチプレス",
      secondary: "Barbell Bench Press",
    });
  });

  test("does not repeat the English name when there is no distinct translation", () => {
    expect(exerciseNameDisplay("Plank", "Plank", "fr")).toEqual({
      primary: "Plank",
      secondary: null,
    });
    expect(exerciseNameDisplay("Plank", undefined, "ja")).toEqual({
      primary: "Plank",
      secondary: null,
    });
  });

  test("uses localized instructions outside English and falls back when they are missing", () => {
    expect(localizedInstructions(["Lower."], ["下ろす。"], "ja")).toEqual(["下ろす。"]);
    expect(localizedInstructions(["Lower."], ["下ろす。"], "en")).toEqual(["Lower."]);
    expect(localizedInstructions(["Lower."], [], "ja")).toEqual(["Lower."]);
  });

  test("search labels include English and a distinct localized name", () => {
    expect(exerciseSearchLabels("Bench Press", "臥推")).toEqual(["Bench Press", "臥推"]);
    expect(exerciseSearchLabels("Plank", "Plank")).toEqual(["Plank"]);
  });
});

describe("fitness exercise search", () => {
  const bench = exercise({ id: "bench", name: "Barbell Bench Press" });

  test("matches the English name while a localized name is also indexed", () => {
    const matches = filterExercises([bench], { ...DEFAULT_EXERCISE_FILTERS, query: "bench press" }, {
      names: () => ["バーベルベンチプレス"],
    });
    expect(matches.map((item) => item.id)).toEqual(["bench"]);
  });

  test("matches the localized name", () => {
    const matches = filterExercises([bench], { ...DEFAULT_EXERCISE_FILTERS, query: "ベンチ" }, {
      names: () => ["バーベルベンチプレス"],
    });
    expect(matches.map((item) => item.id)).toEqual(["bench"]);
  });

  test("still matches muscles and folds Latin diacritics", () => {
    expect(
      filterExercises([bench], { ...DEFAULT_EXERCISE_FILTERS, query: "chest" }).map((item) => item.id)
    ).toEqual(["bench"]);
    expect(exerciseQueryMatches("developpe", ["Développé couché"])).toBe(true);
    expect(exerciseQueryMatches("臥推", ["槓鈴臥推"])).toBe(true);
  });
});

describe("fitness exercise catalogs", () => {
  test("every locale covers the English catalog", () => {
    const issues = auditFitnessExerciseCatalogs();
    expect(issues.slice(0, 12)).toEqual([]);
    expect(issues).toEqual([]);
  });

  test("uses standard lift names and Traditional Chinese for zh-TW", () => {
    const zhTW = readExerciseCatalog("zh-TW");
    const zhCN = readExerciseCatalog("zh-CN");
    const ja = readExerciseCatalog("ja");
    const ko = readExerciseCatalog("ko");
    const fr = readExerciseCatalog("fr");
    const de = readExerciseCatalog("de");
    const es = readExerciseCatalog("es");
    const pt = readExerciseCatalog("pt");
    const it = readExerciseCatalog("it");
    const ru = readExerciseCatalog("ru");

    expect(zhTW[BENCH_ID].name).toContain("臥推");
    expect(zhTW[BENCH_ID].name).not.toContain("卧");
    expect(zhCN[BENCH_ID].name).toContain("卧推");
    expect(zhTW[SITUP_ID].name).not.toBe(zhCN[SITUP_ID].name);
    expect(ja[BENCH_ID].name).toContain("ベンチ");
    expect(ko[BENCH_ID].name).toContain("벤치");
    expect(fr[BENCH_ID].name.toLowerCase()).toContain("développé");
    expect(de[BENCH_ID].name).toContain("Bankdrücken");
    expect(es[BENCH_ID].name.toLowerCase()).toContain("banca");
    expect(pt[BENCH_ID].name.toLowerCase()).toContain("supino");
    expect(it[BENCH_ID].name.toLowerCase()).toContain("panca");
    expect(ru[BENCH_ID].name.toLocaleLowerCase("ru")).toContain("жим");

    expect(zhTW[SQUAT_ID].name).toContain("深蹲");
    expect(ja[DEADLIFT_ID].name).toContain("デッドリフト");
    expect(zhTW[BENCH_ID].instructions[0]).not.toBe(
      readExerciseCatalog("en")[BENCH_ID].instructions[0]
    );
    expect(ja[SQUAT_ID].instructions).toHaveLength(readExerciseCatalog("en")[SQUAT_ID].instructions.length);
  });
});
