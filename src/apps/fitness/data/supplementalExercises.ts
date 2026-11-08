import type { FitnessExercise } from "@/shared/fitness";

/**
 * Movements from the training program that are not in free-exercise-db.
 * These are the actual exercises, not stand-ins for a nearby catalog entry.
 * Instructions describe the movement only.
 */
export const SUPPLEMENTAL_EXERCISES: readonly FitnessExercise[] = [
  {
    id: "Supine_Adductor_Ball_Squeeze",
    name: "Supine Adductor Ball Squeeze",
    category: "strength",
    equipment: "other",
    level: "beginner",
    force: "static",
    mechanic: "isolation",
    primaryMuscles: ["adductors"],
    secondaryMuscles: [],
    instructions: [
      "Lie on your back with your knees bent and your feet flat on the floor.",
      "Place a ball or pillow between your knees.",
      "Squeeze your knees into the ball to activate the adductors, without lifting your hips.",
      "Hold the squeeze, then relax slightly and repeat. Keep your lower back quiet.",
    ],
    images: [],
  },
  {
    id: "Bodyweight_Glute_Bridge",
    name: "Bodyweight Glute Bridge",
    category: "strength",
    equipment: "body only",
    level: "beginner",
    force: "push",
    mechanic: "isolation",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    instructions: [
      "Lie on your back with your knees bent and your feet flat, about hip-width apart.",
      "Brace your torso and drive through your heels to lift your hips.",
      "Stop when your body forms a straight line from your shoulders to your knees. Don't overarch your lower back.",
      "Pause and squeeze your glutes, then lower your hips with control.",
    ],
    images: ["Bodyweight_Glute_Bridge/0.jpg"],
  },
  {
    id: "Machine_Hip_Thrust",
    name: "Machine Hip Thrust",
    category: "strength",
    equipment: "machine",
    level: "beginner",
    force: "push",
    mechanic: "isolation",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    instructions: [
      "Sit in the hip thrust machine with your upper back against the pad and your feet flat, about hip-width apart.",
      "Set the belt or pad across your hips.",
      "Drive through your heels and extend your hips until your torso and thighs are in line, without overarching your lower back.",
      "Pause and squeeze your glutes, then lower with control.",
    ],
    images: [],
  },
  {
    id: "Wall_Slide",
    name: "Wall Slide",
    category: "stretching",
    equipment: "body only",
    level: "beginner",
    force: "static",
    mechanic: "isolation",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["traps"],
    instructions: [
      "Stand with your back, hips, and the back of your head against a wall, with your feet slightly forward.",
      "Place the backs of your hands and elbows on the wall, elbows bent about 90 degrees.",
      "Slide your arms up the wall as far as you can without your lower back, ribs, or elbows leaving the wall.",
      "Slide back down to the start and repeat.",
    ],
    images: [],
  },
  {
    id: "Quadruped_Thoracic_Rotation",
    name: "Quadruped Thoracic Rotation",
    category: "stretching",
    equipment: "body only",
    level: "beginner",
    force: "static",
    mechanic: "isolation",
    primaryMuscles: ["middle back"],
    secondaryMuscles: ["shoulders"],
    instructions: [
      "Start on your hands and knees, with your wrists under your shoulders and your knees under your hips.",
      "Place one hand behind your head.",
      "Rotate that elbow down toward the opposite arm, then open your chest and rotate the elbow toward the ceiling.",
      "Move from your upper back and keep your hips quiet. Repeat, then switch sides.",
    ],
    images: ["Quadruped_Thoracic_Rotation/0.jpg"],
  },
  {
    id: "Dumbbell_Romanian_Deadlift",
    name: "Dumbbell Romanian Deadlift",
    category: "strength",
    equipment: "dumbbell",
    level: "intermediate",
    force: "pull",
    mechanic: "compound",
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower back"],
    instructions: [
      "Stand and hold a dumbbell in each hand in front of your thighs, palms facing you.",
      "Soften your knees a little and keep them from traveling forward.",
      "Hinge at your hips, sending them back, and lower the dumbbells close to your legs until you feel a hamstring stretch. Keep your spine neutral.",
      "Drive your hips forward to stand tall and squeeze your glutes.",
    ],
    images: [],
  },
];

const supplementalById = new Map(SUPPLEMENTAL_EXERCISES.map((exercise) => [exercise.id, exercise]));

export function supplementalExerciseById(id: string): FitnessExercise | null {
  return supplementalById.get(id) ?? null;
}

/**
 * Add supplemental movements the upstream library does not have.
 * An upstream record with the same id is kept.
 */
export function mergeSupplementalExercises(
  exercises: readonly FitnessExercise[]
): FitnessExercise[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  let changed = false;
  for (const extra of SUPPLEMENTAL_EXERCISES) {
    if (byId.has(extra.id)) continue;
    byId.set(extra.id, extra);
    changed = true;
  }
  if (!changed) return [...exercises];
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
