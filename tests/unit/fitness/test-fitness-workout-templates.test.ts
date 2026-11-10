import "../../helpers/local-storage-stub";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  mergeSupplementalExercises,
  SUPPLEMENTAL_EXERCISES,
} from "../../../src/apps/fitness/data/supplementalExercises";
import { readExerciseCatalog } from "../../../src/apps/fitness/utils/exerciseCatalogAudit";
import { isLoggedSet } from "../../../src/apps/fitness/utils/progression";
import { workoutDatesInWeek } from "../../../src/apps/fitness/utils/schedule";
import {
  entriesForTemplate,
  formatReps,
  mergeTemplateEntries,
  parseRepsInput,
  WORKOUT_TEMPLATE_IDS,
  WORKOUT_TEMPLATES,
} from "../../../src/apps/fitness/utils/workoutTemplates";
import type { WorkoutEntry } from "../../../src/apps/fitness/types";
import { sanitizeWorkout, useFitnessStore } from "../../../src/stores/useFitnessStore";
import { settleAllPersistWrites } from "../../../src/utils/persistWriteQueue";
import en from "../../../src/lib/locales/en/translation.json";
import zhTW from "../../../src/lib/locales/zh-TW/translation.json";

const originalFitness = useFitnessStore.getState();

afterAll(async () => {
  useFitnessStore.setState(originalFitness, true);
  await settleAllPersistWrites();
});

beforeEach(() => {
  useFitnessStore.setState({ workouts: [], schedule: originalFitness.schedule });
});

const APPROXIMATIONS = [
  "Barbell_Hip_Thrust",
  "Barbell_Glute_Bridge",
  "Romanian_Deadlift",
  "Stiff-Legged_Dumbbell_Deadlift",
  "Wide-Grip_Lat_Pulldown",
  "Close-Grip_Front_Lat_Pulldown",
  "Lying_Leg_Curls",
  "Adductor",
  "Torso_Rotation",
  "Incline_Dumbbell_Press",
  "Cable_Chest_Press",
];

function entry(exerciseId: string, sets: WorkoutEntry["sets"]): WorkoutEntry {
  return { id: exerciseId, exerciseId, name: exerciseId, sets };
}

describe("workout template prescriptions", () => {
  test("both templates list eight exercises in warm-up then main order", () => {
    expect(WORKOUT_TEMPLATE_IDS).toEqual(["lowerControl", "scapularControl"]);
    for (const id of WORKOUT_TEMPLATE_IDS) {
      const rows = WORKOUT_TEMPLATES[id];
      expect(rows).toHaveLength(8);
      expect(rows.map((row) => row.phase)).toEqual([
        "warmup",
        "warmup",
        "main",
        "main",
        "main",
        "main",
        "main",
        "main",
      ]);
      expect(new Set(rows.map((row) => row.exerciseId)).size).toBe(8);
    }
  });

  test("lower-body control matches the source prescription", () => {
    expect(WORKOUT_TEMPLATES.lowerControl.map((row) => ({
      exerciseId: row.exerciseId,
      sets: row.sets,
      reps: row.reps,
      repsMax: row.repsMax,
      cue: row.cue,
    }))).toEqual([
      { exerciseId: "Supine_Adductor_Ball_Squeeze", sets: 2, reps: 10, repsMax: undefined, cue: "holdEachRep3s" },
      { exerciseId: "Bodyweight_Glute_Bridge", sets: 2, reps: 12, repsMax: undefined, cue: "hold2s" },
      { exerciseId: "Box_Squat", sets: 3, reps: 10, repsMax: 12, cue: undefined },
      { exerciseId: "Seated_Cable_Rows", sets: 3, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Machine_Hip_Thrust", sets: 3, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Leverage_Chest_Press", sets: 2, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Seated_Leg_Curl", sets: 2, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Face_Pull", sets: 2, reps: 15, repsMax: undefined, cue: undefined },
    ]);
  });

  test("scapular control matches the source prescription", () => {
    expect(WORKOUT_TEMPLATES.scapularControl.map((row) => ({
      exerciseId: row.exerciseId,
      sets: row.sets,
      reps: row.reps,
      repsMax: row.repsMax,
      cue: row.cue,
    }))).toEqual([
      { exerciseId: "Wall_Slide", sets: 2, reps: 10, repsMax: undefined, cue: undefined },
      { exerciseId: "Quadruped_Thoracic_Rotation", sets: 2, reps: 8, repsMax: undefined, cue: "eachSide" },
      { exerciseId: "Dumbbell_Romanian_Deadlift", sets: 3, reps: 10, repsMax: 12, cue: undefined },
      { exerciseId: "V-Bar_Pulldown", sets: 3, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Leg_Press", sets: 3, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Leverage_Incline_Chest_Press", sets: 2, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Reverse_Machine_Flyes", sets: 2, reps: 12, repsMax: 15, cue: undefined },
      { exerciseId: "Dead_Bug", sets: 2, reps: 10, repsMax: undefined, cue: undefined },
    ]);
  });

  test("planned sets have no invented weight and are not completed", () => {
    let n = 0;
    for (const id of WORKOUT_TEMPLATE_IDS) {
      const entries = entriesForTemplate(id, () => `id-${n++}`);
      expect(entries).toHaveLength(8);
      for (const [index, row] of WORKOUT_TEMPLATES[id].entries()) {
        const built = entries[index];
        expect(built.exerciseId).toBe(row.exerciseId);
        expect(built.name).toBe(row.name);
        expect(built.phase).toBe(row.phase);
        expect(built.sets).toHaveLength(row.sets);
        for (const set of built.sets) {
          expect(set.weightKg).toBe(0);
          expect(set.completed).toBe(false);
          expect(set.reps).toBe(row.reps);
          expect(set.repsMax).toBe(row.repsMax);
          expect(isLoggedSet(set)).toBe(false);
        }
      }
    }
  });

  test("uses catalog exercises and does not substitute a different movement", () => {
    const english = readExerciseCatalog("en");
    const used = WORKOUT_TEMPLATE_IDS.flatMap((id) => WORKOUT_TEMPLATES[id].map((row) => row.exerciseId));
    for (const id of used) {
      expect(english[id]?.name).toBeTruthy();
      expect(APPROXIMATIONS).not.toContain(id);
    }
    expect(english.Box_Squat.name).toBe("Box Squat");
    expect(english.Seated_Cable_Rows.name).toBe("Seated Cable Rows");
    expect(english.Leverage_Chest_Press.name).toBe("Leverage Chest Press");
    expect(english.Seated_Leg_Curl.name).toBe("Seated Leg Curl");
    expect(english.Face_Pull.name).toBe("Face Pull");
    expect(english["V-Bar_Pulldown"].name).toBe("V-Bar Pulldown");
    expect(english.Leg_Press.name).toBe("Leg Press");
    expect(english.Leverage_Incline_Chest_Press.name).toBe("Leverage Incline Chest Press");
    expect(english.Reverse_Machine_Flyes.name).toBe("Reverse Machine Flyes");
    expect(english.Dead_Bug.name).toBe("Dead Bug");
    expect(english.Machine_Hip_Thrust.name).toBe("Machine Hip Thrust");
    expect(english.Dumbbell_Romanian_Deadlift.name).toBe("Dumbbell Romanian Deadlift");
    for (const exercise of SUPPLEMENTAL_EXERCISES) {
      expect(english[exercise.id]).toEqual({
        name: exercise.name,
        instructions: [...exercise.instructions],
      });
    }
    const traditional = readExerciseCatalog("zh-TW");
    expect(traditional.Supine_Adductor_Ball_Squeeze.name).toBe("仰躺夾球（內收肌啟動）");
    expect(traditional.Bodyweight_Glute_Bridge.name).toBe("徒手臀橋");
    expect(traditional.Machine_Hip_Thrust.name).toBe("機械臀推");
    expect(traditional.Wall_Slide.name).toBe("靠牆滑手");
    expect(traditional.Quadruped_Thoracic_Rotation.name).toBe("四足跪胸椎旋轉");
    expect(traditional.Dumbbell_Romanian_Deadlift.name).toBe("啞鈴羅馬尼亞硬舉");
  });

  test("supplemental movements fill gaps and do not replace an upstream record", () => {
    const merged = mergeSupplementalExercises([
      {
        id: "Wall_Slide",
        name: "Upstream Wall Slide",
        category: "stretching",
        equipment: "body only",
        level: "beginner",
        force: null,
        mechanic: null,
        primaryMuscles: ["shoulders"],
        secondaryMuscles: [],
        instructions: ["Keep the upstream text."],
        images: [],
      },
    ]);
    expect(merged.find((exercise) => exercise.id === "Wall_Slide")?.name).toBe("Upstream Wall Slide");
    expect(merged.some((exercise) => exercise.id === "Machine_Hip_Thrust")).toBe(true);
    const ids = merged.map((exercise) => exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("applying a template keeps current entries and appends the rest in order", () => {
    const existing = entry("Box_Squat", [{ reps: 5, weightKg: 40 }]);
    const incoming = entriesForTemplate("lowerControl", () => crypto.randomUUID());
    const merged = mergeTemplateEntries([existing], incoming);
    expect(merged.added).toBe(7);
    expect(merged.entries[0]).toBe(existing);
    expect(merged.entries.slice(1).map((row) => row.exerciseId)).toEqual(
      WORKOUT_TEMPLATES.lowerControl
        .map((row) => row.exerciseId)
        .filter((id) => id !== "Box_Squat")
    );
    expect(mergeTemplateEntries(merged.entries, incoming).added).toBe(0);
  });

  test("rep ranges stay editable as a range", () => {
    expect(formatReps({ reps: 10, repsMax: 12 })).toBe("10–12");
    expect(formatReps({ reps: 15 })).toBe("15");
    expect(parseRepsInput("10–12")).toEqual({ reps: 10, repsMax: 12 });
    expect(parseRepsInput("10-12")).toEqual({ reps: 10, repsMax: 12 });
    expect(parseRepsInput("8")).toEqual({ reps: 8 });
    expect(parseRepsInput("12–10")).toEqual({ reps: 12 });
    expect(parseRepsInput("a lot")).toBeNull();
  });
});

describe("applying a workout template to a day", () => {
  test("one click adds every exercise without wiping the day", () => {
    const store = useFitnessStore.getState();
    const workoutId = store.ensureWorkout("2026-11-08", "push");
    store.updateWorkout(workoutId, { notes: "keep this" });
    store.addWorkoutEntry(workoutId, "Pullups", "Pullups");
    const before = useFitnessStore.getState().schedule;

    const first = store.applyWorkoutTemplate("2026-11-08", "lowerControl");
    expect(first.added).toBe(8);
    const second = store.applyWorkoutTemplate("2026-11-08", "scapularControl");
    expect(second.added).toBe(8);
    expect(store.applyWorkoutTemplate("2026-11-08", "lowerControl").added).toBe(0);

    const workout = useFitnessStore.getState().workouts.find((item) => item.id === workoutId);
    expect(workout?.focus).toBe("push");
    expect(workout?.notes).toBe("keep this");
    expect(workout?.guidance).toBe(true);
    expect(workout?.entries[0]).toMatchObject({ exerciseId: "Pullups", sets: [] });
    expect(workout?.entries.slice(1).map((row) => row.exerciseId)).toEqual([
      ...WORKOUT_TEMPLATES.lowerControl.map((row) => row.exerciseId),
      ...WORKOUT_TEMPLATES.scapularControl.map((row) => row.exerciseId),
    ]);
    expect(useFitnessStore.getState().schedule).toEqual(before);
    expect(workoutDatesInWeek(useFitnessStore.getState().workouts, "2026-11-08")).toEqual([]);

    const box = workout?.entries.find((row) => row.exerciseId === "Box_Squat");
    expect(box?.sets.every((set) => set.completed === false && set.weightKg === 0)).toBe(true);
    store.updateSet(workoutId, box!.id, 0, { ...box!.sets[0], completed: true });
    const logged = useFitnessStore.getState().workouts.find((item) => item.id === workoutId);
    const loggedBox = logged?.entries.find((row) => row.exerciseId === "Box_Squat");
    expect(loggedBox?.sets[0].completed).toBeUndefined();
    expect(isLoggedSet(loggedBox!.sets[0])).toBe(true);
    expect(loggedBox?.sets[1].completed).toBe(false);
    expect(workoutDatesInWeek(useFitnessStore.getState().workouts, "2026-11-08")).toEqual(["2026-11-08"]);
  });

  test("sanitize keeps the prescription and still accepts older logs", () => {
    const clean = sanitizeWorkout(
      {
        date: "2026-11-08",
        notes: "note",
        guidance: true,
        entries: [
          {
            exerciseId: "Wall_Slide",
            name: "Wall Slide",
            phase: "warmup",
            cue: "eachSide",
            sets: [{ reps: 8, repsMax: 10, weightKg: 0, completed: false }, { reps: 5, weightKg: 20 }],
          },
        ],
      },
      "w",
      5
    );
    expect(clean?.guidance).toBe(true);
    expect(clean?.notes).toBe("note");
    expect(clean?.entries[0]).toMatchObject({ phase: "warmup", cue: "eachSide" });
    expect(clean?.entries[0].sets[0]).toEqual({ reps: 8, repsMax: 10, weightKg: 0, completed: false });
    expect(clean?.entries[0].sets[1]).toEqual({ reps: 5, weightKg: 20 });
    expect(isLoggedSet(clean!.entries[0].sets[1])).toBe(true);

    const legacy = sanitizeWorkout(
      { date: "2026-11-08", entries: [{ exerciseId: "Pullups", sets: [{ reps: 8, weightKg: 0 }] }] },
      "legacy"
    );
    expect(legacy?.guidance).toBeUndefined();
    expect(legacy?.entries[0].phase).toBeUndefined();
    expect(legacy?.entries[0].sets[0]).toEqual({ reps: 8, weightKg: 0 });
  });
});

describe("workout template copy", () => {
  test("English labels use title case and Traditional Chinese uses the source names", () => {
    expect(en.apps.fitness.schedule.applyTemplate).toBe("Apply Template");
    expect(zhTW.apps.fitness.schedule.applyTemplate).toBe("加入課表");
    expect(en.apps.fitness.workoutTemplates.add).toBe("Add Template");
    expect(zhTW.apps.fitness.workoutTemplates.add).toBe("加入課表");
    expect(en.apps.fitness.workoutTemplates.lowerControl).toBe("Full Body + Lower-Body Control");
    expect(en.apps.fitness.workoutTemplates.scapularControl).toBe("Full Body + Scapular Control");
    expect(en.apps.fitness.workoutTemplates.phase.warmup).toBe("Warm-Up");
    expect(en.apps.fitness.workoutTemplates.phase.main).toBe("Main");
    expect(en.apps.fitness.workouts.done).toBe("Done");
    expect(en.apps.fitness.workouts.markSetDone).toBe("Mark Set Done");
    expect(en.apps.fitness.workoutTemplates.guidance).toContain("3–4");
    expect(en.apps.fitness.workoutTemplates.guidance).toContain("60–90");
    expect(zhTW.apps.fitness.workoutTemplates.lowerControl).toBe("全身＋下肢控制");
    expect(zhTW.apps.fitness.workoutTemplates.scapularControl).toBe("全身＋肩胛控制");
    expect(zhTW.apps.fitness.workoutTemplates.guidance).toBe(
      "每次重量抓RIR3–4（剩餘次數）；組間休息60–90秒；以身體動作穩定為主，再慢慢加重量。"
    );
    expect(zhTW.apps.fitness.workoutTemplates.cues.holdEachRep3s).toBe("每下停留3秒");
    expect(zhTW.apps.fitness.workoutTemplates.cues.hold2s).toBe("停留2秒");
    expect(zhTW.apps.fitness.workoutTemplates.cues.eachSide).toBe("一邊");
  });
});
