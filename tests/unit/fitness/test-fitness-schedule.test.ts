import { describe, expect, test } from "bun:test";
import type { FitnessExercise } from "../../../src/shared/fitness";
import type { Workout } from "../../../src/apps/fitness/types";
import {
  addDays,
  startOfWeek,
  weekDates,
  weekdayOf,
} from "../../../src/apps/fitness/utils/dates";
import {
  CURATED_FOCUS_EXERCISES,
  DEFAULT_SCHEDULE,
  focusForDate,
  plannedTrainingDays,
  recommendExercises,
  sanitizeSchedule,
  scheduleFromTemplate,
  SCHEDULE_TEMPLATE_IDS,
  weekPlan,
  weeklyStreak,
  workoutDatesInWeek,
} from "../../../src/apps/fitness/utils/schedule";

const workoutOn = (date: string, sets = 1): Workout => ({
  id: date,
  date,
  focus: null,
  notes: "",
  createdAt: 0,
  updatedAt: 0,
  entries: [
    {
      id: `${date}-e`,
      exerciseId: "Barbell_Squat",
      name: "Barbell Squat",
      sets: Array.from({ length: sets }, () => ({ reps: 5, weightKg: 100 })),
    },
  ],
});

function exercise(partial: Partial<FitnessExercise> & { id: string }): FitnessExercise {
  return {
    name: partial.id.replace(/_/g, " "),
    category: "strength",
    equipment: "dumbbell",
    level: "beginner",
    force: "push",
    mechanic: "compound",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    instructions: [],
    images: [],
    ...partial,
  };
}

describe("dates", () => {
  test("Monday-start weeks", () => {
    // 2026-10-08 is a Thursday.
    expect(weekdayOf("2026-10-08")).toBe(3);
    expect(weekdayOf("2026-10-11")).toBe(6);
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05");
    expect(weekDates("2026-10-08")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("schedule templates", () => {
  test("every template has 7 days and at least one rest day", () => {
    for (const id of SCHEDULE_TEMPLATE_IDS) {
      const schedule = scheduleFromTemplate(id);
      expect(schedule).toHaveLength(7);
      expect(schedule.some((d) => d.focus === "rest")).toBe(true);
    }
    expect(plannedTrainingDays(scheduleFromTemplate("ppl"))).toBe(6);
    expect(focusForDate(scheduleFromTemplate("ppl"), "2026-10-07")).toBe("legs");
  });

  test("sanitize repairs malformed schedules", () => {
    expect(sanitizeSchedule(null)).toEqual(DEFAULT_SCHEDULE);
    const repaired = sanitizeSchedule([
      { focus: "push", exerciseIds: ["a", 1] },
      { focus: "nope" },
      {},
      {},
      {},
      {},
      {},
    ]);
    expect(repaired[0]).toEqual({ focus: "push", exerciseIds: ["a"] });
    expect(repaired[1].focus).toBe(DEFAULT_SCHEDULE[1].focus);
  });
});

describe("recommendations", () => {
  test("curated picks come first and respect limit/exclude", () => {
    const recs = recommendExercises("push", { limit: 3 });
    expect(recs.map((r) => r.id)).toEqual(
      CURATED_FOCUS_EXERCISES.push.slice(0, 3).map((r) => r.id)
    );
    const excluded = recommendExercises("push", {
      limit: 2,
      exclude: [CURATED_FOCUS_EXERCISES.push[0].id],
    });
    expect(excluded[0].id).toBe(CURATED_FOCUS_EXERCISES.push[1].id);
    expect(recommendExercises("rest")).toEqual([]);
  });

  test("library fills remaining slots with matching exercises only", () => {
    const library = [
      exercise({ id: "Cable_Fly", mechanic: "isolation", equipment: "cable" }),
      exercise({ id: "Floor_Press", force: "push" }),
      exercise({ id: "Barbell_Row_X", force: "pull", primaryMuscles: ["middle back"] }),
      exercise({ id: "Chest_Stretch", category: "stretching" }),
      exercise({ id: "Treadmill_X", category: "cardio", primaryMuscles: ["quadriceps"] }),
    ];
    const curatedCount = CURATED_FOCUS_EXERCISES.push.length;
    const recs = recommendExercises("push", { library, limit: curatedCount + 3 });
    const extra = recs.slice(curatedCount).map((r) => r.id);
    expect(extra).toEqual(["Floor_Press", "Cable_Fly"]);
    const cardio = recommendExercises("cardio", { library, limit: 10 });
    expect(cardio.map((r) => r.id)).toContain("Treadmill_X");
    expect(cardio.map((r) => r.id)).not.toContain("Floor_Press");
  });
});

describe("weekly progress", () => {
  const workouts = [
    workoutOn("2026-10-05"),
    workoutOn("2026-10-05"),
    workoutOn("2026-10-07"),
    workoutOn("2026-10-08", 0),
    workoutOn("2026-09-29"),
    workoutOn("2026-09-30"),
    workoutOn("2026-09-22"),
  ];

  test("counts distinct dates with logged sets", () => {
    expect(workoutDatesInWeek(workouts, "2026-10-08")).toEqual(["2026-10-05", "2026-10-07"]);
  });

  test("week plan marks today, past and completed days", () => {
    const plan = weekPlan(scheduleFromTemplate("upperLower"), workouts, "2026-10-08");
    expect(plan).toHaveLength(7);
    expect(plan[0]).toMatchObject({ date: "2026-10-05", focus: "upper", completed: true, isPast: true });
    expect(plan[3]).toMatchObject({ isToday: true, completed: false, isPast: false });
  });

  test("weekly streak counts consecutive weeks meeting the target", () => {
    expect(weeklyStreak(workouts, 2, "2026-10-08")).toBe(2);
    expect(weeklyStreak(workouts, 1, "2026-10-08")).toBe(3);
    expect(weeklyStreak(workouts, 3, "2026-10-08")).toBe(0);
    expect(weeklyStreak(workouts, 0, "2026-10-08")).toBe(0);
  });
});
