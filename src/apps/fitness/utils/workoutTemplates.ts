import type { WorkoutCue, WorkoutEntry, WorkoutPhase, WorkoutSet } from "../types";

export const WORKOUT_TEMPLATE_IDS = ["lowerControl", "scapularControl"] as const;
export type WorkoutTemplateId = (typeof WORKOUT_TEMPLATE_IDS)[number];

export function isWorkoutTemplateId(value: unknown): value is WorkoutTemplateId {
  return (
    typeof value === "string" &&
    (WORKOUT_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

interface TemplateExercise {
  exerciseId: string;
  name: string;
  phase: WorkoutPhase;
  sets: number;
  reps: number;
  repsMax?: number;
  cue?: WorkoutCue;
}

/**
 * 課表Ａ（全身＋下肢控制）and 課表Ｂ（全身＋肩胛控制）.
 * Order is warm-up, then main. Rep ranges stay as reps–repsMax.
 * No load is prescribed.
 */
export const WORKOUT_TEMPLATES: Record<WorkoutTemplateId, readonly TemplateExercise[]> = {
  lowerControl: [
    {
      exerciseId: "Supine_Adductor_Ball_Squeeze",
      name: "Supine Adductor Ball Squeeze",
      phase: "warmup",
      sets: 2,
      reps: 10,
      cue: "holdEachRep3s",
    },
    {
      exerciseId: "Bodyweight_Glute_Bridge",
      name: "Bodyweight Glute Bridge",
      phase: "warmup",
      sets: 2,
      reps: 12,
      cue: "hold2s",
    },
    { exerciseId: "Box_Squat", name: "Box Squat", phase: "main", sets: 3, reps: 10, repsMax: 12 },
    {
      exerciseId: "Seated_Cable_Rows",
      name: "Seated Cable Rows",
      phase: "main",
      sets: 3,
      reps: 12,
      repsMax: 15,
    },
    {
      exerciseId: "Machine_Hip_Thrust",
      name: "Machine Hip Thrust",
      phase: "main",
      sets: 3,
      reps: 12,
      repsMax: 15,
    },
    {
      exerciseId: "Leverage_Chest_Press",
      name: "Leverage Chest Press",
      phase: "main",
      sets: 2,
      reps: 12,
      repsMax: 15,
    },
    {
      exerciseId: "Seated_Leg_Curl",
      name: "Seated Leg Curl",
      phase: "main",
      sets: 2,
      reps: 12,
      repsMax: 15,
    },
    { exerciseId: "Face_Pull", name: "Face Pull", phase: "main", sets: 2, reps: 15 },
  ],
  scapularControl: [
    { exerciseId: "Wall_Slide", name: "Wall Slide", phase: "warmup", sets: 2, reps: 10 },
    {
      exerciseId: "Quadruped_Thoracic_Rotation",
      name: "Quadruped Thoracic Rotation",
      phase: "warmup",
      sets: 2,
      reps: 8,
      cue: "eachSide",
    },
    {
      exerciseId: "Dumbbell_Romanian_Deadlift",
      name: "Dumbbell Romanian Deadlift",
      phase: "main",
      sets: 3,
      reps: 10,
      repsMax: 12,
    },
    {
      exerciseId: "V-Bar_Pulldown",
      name: "V-Bar Pulldown",
      phase: "main",
      sets: 3,
      reps: 12,
      repsMax: 15,
    },
    { exerciseId: "Leg_Press", name: "Leg Press", phase: "main", sets: 3, reps: 12, repsMax: 15 },
    {
      exerciseId: "Leverage_Incline_Chest_Press",
      name: "Leverage Incline Chest Press",
      phase: "main",
      sets: 2,
      reps: 12,
      repsMax: 15,
    },
    {
      exerciseId: "Reverse_Machine_Flyes",
      name: "Reverse Machine Flyes",
      phase: "main",
      sets: 2,
      reps: 12,
      repsMax: 15,
    },
    { exerciseId: "Dead_Bug", name: "Dead Bug", phase: "main", sets: 2, reps: 10 },
  ],
};

function plannedSets(exercise: TemplateExercise): WorkoutSet[] {
  return Array.from({ length: exercise.sets }, () => {
    const set: WorkoutSet = { reps: exercise.reps, weightKg: 0, completed: false };
    if (exercise.repsMax != null && exercise.repsMax > exercise.reps) {
      set.repsMax = exercise.repsMax;
    }
    return set;
  });
}

export function entriesForTemplate(
  templateId: WorkoutTemplateId,
  createId: () => string
): WorkoutEntry[] {
  return WORKOUT_TEMPLATES[templateId].map((exercise) => {
    const entry: WorkoutEntry = {
      id: createId(),
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      phase: exercise.phase,
      sets: plannedSets(exercise),
    };
    if (exercise.cue) entry.cue = exercise.cue;
    return entry;
  });
}

/**
 * Append template exercises that are not already on the day.
 * Existing entries, including their sets, stay in place.
 */
export function mergeTemplateEntries(
  existing: readonly WorkoutEntry[],
  incoming: readonly WorkoutEntry[],
  maxEntries = 40
): { entries: WorkoutEntry[]; added: number } {
  const have = new Set(existing.map((entry) => entry.exerciseId));
  const room = Math.max(0, maxEntries - existing.length);
  const addedEntries: WorkoutEntry[] = [];
  for (const entry of incoming) {
    if (have.has(entry.exerciseId) || addedEntries.length >= room) continue;
    have.add(entry.exerciseId);
    addedEntries.push(entry);
  }
  return { entries: [...existing, ...addedEntries], added: addedEntries.length };
}

export function formatReps(set: Pick<WorkoutSet, "reps" | "repsMax">): string {
  return set.repsMax != null && set.repsMax > set.reps
    ? `${set.reps}–${set.repsMax}`
    : String(set.reps);
}

/** Parse a single rep target or a range written with -, –, or —. */
export function parseRepsInput(text: string): { reps: number; repsMax?: number } | null {
  const cleaned = text.trim().replace(/[–—]/g, "-");
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(cleaned);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (low > 1000 || high > 1000) return null;
    if (high > low) return { reps: low, repsMax: high };
    return { reps: Math.max(low, high) };
  }
  if (!/^\d+$/.test(cleaned)) return null;
  const reps = Number(cleaned);
  if (reps > 1000) return null;
  return { reps };
}
