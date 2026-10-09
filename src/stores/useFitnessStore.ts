import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FOOD_BASE_ITEM_LIMITS, sanitizeFoodItem, type FoodItem } from "@/shared/fitness";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { createDebouncedPersistStorage } from "@/utils/debouncedPersistStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import {
  ACTIVITY_LEVELS,
  BODY_MEASUREMENTS,
  FITNESS_VIEWS,
  MEALS,
  type BodyStatEntry,
  type FitnessGoals,
  type FitnessProfile,
  type FitnessView,
  type FocusArea,
  type FoodEntry,
  type Meal,
  type ScheduleDay,
  type UnitSystem,
  type WeeklySchedule,
  type Workout,
  type WorkoutEntry,
  type WorkoutSet,
} from "@/apps/fitness/types";
import { isDateKey } from "@/apps/fitness/utils/dates";
import { divideFoodItems, normalizeSplitPeople, shareToBaseItem } from "@/apps/fitness/utils/foodSplit";
import {
  DEFAULT_SCHEDULE,
  isFocusArea,
  sanitizeSchedule,
  scheduleFromTemplate,
  type ScheduleTemplateId,
} from "@/apps/fitness/utils/schedule";

const STORE_VERSION = 1;
const MAX_SETS_PER_ENTRY = 50;
const MAX_ENTRIES_PER_WORKOUT = 40;
const MAX_THUMBNAIL_LENGTH = 24_000;

export const DEFAULT_FITNESS_PROFILE: FitnessProfile = {
  sex: "male",
  birthYear: null,
  heightCm: null,
  activityLevel: "moderate",
};

export const DEFAULT_FITNESS_GOALS: FitnessGoals = {
  targetWeightKg: null,
  startWeightKg: null,
  weeklyWorkoutTarget: 3,
  nutrition: { calories: null, proteinG: null, carbsG: null, fatG: null },
};

/** Synced as one document: schedule, goals and profile change together rarely. */
export interface FitnessPlan {
  schedule: WeeklySchedule;
  goals: FitnessGoals;
  profile: FitnessProfile;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Sanitizers (persisted state, sync payloads)
// ---------------------------------------------------------------------------

function num(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function timestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function sanitizeWorkoutSet(value: unknown): WorkoutSet | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<WorkoutSet>;
  const reps = num(raw.reps, 0, 1000);
  const weightKg = num(raw.weightKg, 0, 1000);
  if (reps == null || weightKg == null) return null;
  return { reps: Math.round(reps), weightKg };
}

export function sanitizeWorkout(value: unknown, id: string, now = Date.now()): Workout | null {
  if (!value || typeof value !== "object" || !id) return null;
  const raw = value as Partial<Workout>;
  if (!isDateKey(raw.date)) return null;
  const entries: WorkoutEntry[] = Array.isArray(raw.entries)
    ? raw.entries.slice(0, MAX_ENTRIES_PER_WORKOUT).flatMap((e) => {
        const entry = (e ?? {}) as Partial<WorkoutEntry>;
        const exerciseId = str(entry.exerciseId, 120);
        if (!exerciseId) return [];
        return [
          {
            id: str(entry.id, 64) || crypto.randomUUID(),
            exerciseId,
            name: str(entry.name, 120) || exerciseId,
            sets: Array.isArray(entry.sets)
              ? entry.sets.slice(0, MAX_SETS_PER_ENTRY).flatMap((s) => {
                  const set = sanitizeWorkoutSet(s);
                  return set ? [set] : [];
                })
              : [],
          },
        ];
      })
    : [];
  return {
    id,
    date: raw.date,
    focus: isFocusArea(raw.focus) ? raw.focus : null,
    entries,
    notes: str(raw.notes, 2000),
    createdAt: timestamp(raw.createdAt, now),
    updatedAt: timestamp(raw.updatedAt, now),
  };
}

export function sanitizeBodyStat(value: unknown, id: string, now = Date.now()): BodyStatEntry | null {
  if (!value || typeof value !== "object" || !id) return null;
  const raw = value as Partial<BodyStatEntry>;
  if (!isDateKey(raw.date)) return null;
  const entry: BodyStatEntry = {
    id,
    date: raw.date,
    weightKg: num(raw.weightKg, 20, 400),
    bodyFatPct: num(raw.bodyFatPct, 1, 75),
    waistCm: null,
    chestCm: null,
    hipsCm: null,
    armCm: null,
    thighCm: null,
    createdAt: timestamp(raw.createdAt, now),
    updatedAt: timestamp(raw.updatedAt, now),
  };
  for (const field of BODY_MEASUREMENTS) entry[field] = num(raw[field], 5, 300);
  const hasValue =
    entry.weightKg != null ||
    entry.bodyFatPct != null ||
    BODY_MEASUREMENTS.some((field) => entry[field] != null);
  return hasValue ? entry : null;
}

function sanitizeFoodList(
  value: unknown,
  limits?: { calories: number; grams: number }
): FoodItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((item) => {
    const clean = sanitizeFoodItem(item, limits);
    return clean ? [clean] : [];
  });
}

export function sanitizeFoodEntry(value: unknown, id: string, now = Date.now()): FoodEntry | null {
  if (!value || typeof value !== "object" || !id) return null;
  const raw = value as Partial<FoodEntry>;
  if (!isDateKey(raw.date)) return null;
  const loggedItems = sanitizeFoodList(raw.items);
  const splitPeople = normalizeSplitPeople(raw.splitPeople);
  let items = loggedItems;
  let baseItems: FoodItem[] | undefined;
  // Entries saved before splitting have no split fields: keep their items as-is.
  // A split stores the full meal on `baseItems` and the share on `items`.
  if (splitPeople > 1) {
    const storedBase = sanitizeFoodList(raw.baseItems, FOOD_BASE_ITEM_LIMITS);
    const base =
      storedBase.length > 0 ? storedBase : loggedItems.map((item) => shareToBaseItem(item, splitPeople));
    if (base.length === 0) return null;
    baseItems = base;
    items = divideFoodItems(base, splitPeople);
  }
  if (items.length === 0) return null;
  const thumbnail =
    typeof raw.thumbnail === "string" &&
    raw.thumbnail.startsWith("data:image/") &&
    raw.thumbnail.length <= MAX_THUMBNAIL_LENGTH
      ? raw.thumbnail
      : null;
  return {
    id,
    date: raw.date,
    meal: (MEALS as readonly string[]).includes(raw.meal as string) ? (raw.meal as Meal) : "snack",
    name: str(raw.name, 120) || items[0].name,
    items,
    ...(splitPeople > 1 ? { splitPeople, baseItems } : {}),
    source: raw.source === "ai" ? "ai" : "manual",
    thumbnail,
    createdAt: timestamp(raw.createdAt, now),
    updatedAt: timestamp(raw.updatedAt, now),
  };
}

export function sanitizeProfile(value: unknown): FitnessProfile {
  const raw = (value ?? {}) as Partial<FitnessProfile>;
  const birthYear = num(raw.birthYear, 1900, 2100);
  return {
    sex: raw.sex === "female" ? "female" : "male",
    birthYear: birthYear == null ? null : Math.round(birthYear),
    heightCm: num(raw.heightCm, 50, 260),
    activityLevel: (ACTIVITY_LEVELS as readonly string[]).includes(raw.activityLevel as string)
      ? (raw.activityLevel as FitnessProfile["activityLevel"])
      : DEFAULT_FITNESS_PROFILE.activityLevel,
  };
}

export function sanitizeGoals(value: unknown): FitnessGoals {
  const raw = (value ?? {}) as Partial<FitnessGoals>;
  const nutrition = (raw.nutrition ?? {}) as Partial<FitnessGoals["nutrition"]>;
  const weekly = num(raw.weeklyWorkoutTarget, 0, 14);
  return {
    targetWeightKg: num(raw.targetWeightKg, 20, 400),
    startWeightKg: num(raw.startWeightKg, 20, 400),
    weeklyWorkoutTarget: weekly == null ? DEFAULT_FITNESS_GOALS.weeklyWorkoutTarget : Math.round(weekly),
    nutrition: {
      calories: num(nutrition.calories, 500, 10000),
      proteinG: num(nutrition.proteinG, 0, 1000),
      carbsG: num(nutrition.carbsG, 0, 2000),
      fatG: num(nutrition.fatG, 0, 1000),
    },
  };
}

export function sanitizePlan(value: unknown, now = Date.now()): FitnessPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<FitnessPlan>;
  return {
    schedule: sanitizeSchedule(raw.schedule),
    goals: sanitizeGoals(raw.goals),
    profile: sanitizeProfile(raw.profile),
    updatedAt: timestamp(raw.updatedAt, now),
  };
}

function sanitizeList<T>(
  value: unknown,
  sanitize: (item: unknown, id: string) => T | null
): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const id = (item as { id?: unknown })?.id;
    const clean = typeof id === "string" ? sanitize(item, id) : null;
    return clean ? [clean] : [];
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type NewBodyStat = Omit<BodyStatEntry, "id" | "createdAt" | "updatedAt">;
export type NewFoodEntry = Omit<FoodEntry, "id" | "createdAt" | "updatedAt">;

interface FitnessStoreState {
  view: FitnessView;
  units: UnitSystem;
  workouts: Workout[];
  schedule: WeeklySchedule;
  bodyStats: BodyStatEntry[];
  profile: FitnessProfile;
  goals: FitnessGoals;
  foodEntries: FoodEntry[];
  planUpdatedAt: number;

  setView: (view: FitnessView) => void;
  setUnits: (units: UnitSystem) => void;

  ensureWorkout: (date: string, focus?: FocusArea | null) => string;
  updateWorkout: (id: string, patch: Partial<Pick<Workout, "date" | "focus" | "notes">>) => void;
  deleteWorkout: (id: string) => void;
  addWorkoutEntry: (workoutId: string, exerciseId: string, name: string) => string | null;
  removeWorkoutEntry: (workoutId: string, entryId: string) => void;
  addSet: (workoutId: string, entryId: string, set: WorkoutSet) => void;
  updateSet: (workoutId: string, entryId: string, index: number, set: WorkoutSet) => void;
  removeSet: (workoutId: string, entryId: string, index: number) => void;

  setScheduleDay: (index: number, patch: Partial<ScheduleDay>) => void;
  applyScheduleTemplate: (id: ScheduleTemplateId) => void;

  addBodyStat: (entry: NewBodyStat) => string | null;
  deleteBodyStat: (id: string) => void;

  setProfile: (patch: Partial<FitnessProfile>) => void;
  setGoals: (patch: Partial<FitnessGoals>) => void;

  addFoodEntry: (entry: NewFoodEntry) => string | null;
  updateFoodEntry: (
    id: string,
    patch: Partial<Pick<FoodEntry, "meal" | "name" | "items" | "date" | "splitPeople" | "baseItems">>
  ) => void;
  deleteFoodEntry: (id: string) => void;

  replaceWorkoutsFromSync: (workouts: Workout[]) => void;
  replaceBodyStatsFromSync: (entries: BodyStatEntry[]) => void;
  replaceFoodEntriesFromSync: (entries: FoodEntry[]) => void;
  applyPlanFromSync: (plan: FitnessPlan) => void;
  getPlan: () => FitnessPlan;
  clearAllData: () => void;
}

function mapWorkout(
  workouts: Workout[],
  id: string,
  update: (workout: Workout) => Workout
): Workout[] {
  return workouts.map((w) => (w.id === id ? { ...update(w), updatedAt: Date.now() } : w));
}

function mapEntry(
  workouts: Workout[],
  workoutId: string,
  entryId: string,
  update: (entry: WorkoutEntry) => WorkoutEntry
): Workout[] {
  return mapWorkout(workouts, workoutId, (w) => ({
    ...w,
    entries: w.entries.map((e) => (e.id === entryId ? update(e) : e)),
  }));
}

const initialData = () => ({
  workouts: [] as Workout[],
  schedule: DEFAULT_SCHEDULE.map((day) => ({ ...day, exerciseIds: [] })),
  bodyStats: [] as BodyStatEntry[],
  profile: { ...DEFAULT_FITNESS_PROFILE },
  goals: { ...DEFAULT_FITNESS_GOALS, nutrition: { ...DEFAULT_FITNESS_GOALS.nutrition } },
  foodEntries: [] as FoodEntry[],
  planUpdatedAt: 0,
});

export const useFitnessStore = create<FitnessStoreState>()(
  persist(
    (set, get) => ({
      view: "schedule",
      units: "metric",
      ...initialData(),

      setView: (view) => set({ view }),
      setUnits: (units) => set({ units }),

      ensureWorkout: (date, focus = null) => {
        const existing = get()
          .workouts.filter((w) => w.date === date)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (existing) {
          if (focus && !existing.focus) get().updateWorkout(existing.id, { focus });
          return existing.id;
        }
        const now = Date.now();
        const id = crypto.randomUUID();
        set((s) => ({
          workouts: [
            ...s.workouts,
            { id, date, focus, entries: [], notes: "", createdAt: now, updatedAt: now },
          ],
        }));
        return id;
      },
      updateWorkout: (id, patch) =>
        set((s) => ({
          workouts: mapWorkout(s.workouts, id, (w) => ({
            ...w,
            ...(patch.date && isDateKey(patch.date) ? { date: patch.date } : {}),
            ...(patch.focus !== undefined ? { focus: patch.focus } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes.slice(0, 2000) } : {}),
          })),
        })),
      deleteWorkout: (id) => {
        useCloudSyncStore.getState().markDeletedKeys("fitnessWorkoutIds", [id]);
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) }));
      },
      addWorkoutEntry: (workoutId, exerciseId, name) => {
        const workout = get().workouts.find((w) => w.id === workoutId);
        if (!workout || workout.entries.length >= MAX_ENTRIES_PER_WORKOUT) return null;
        const existing = workout.entries.find((e) => e.exerciseId === exerciseId);
        if (existing) return existing.id;
        const entryId = crypto.randomUUID();
        set((s) => ({
          workouts: mapWorkout(s.workouts, workoutId, (w) => ({
            ...w,
            entries: [...w.entries, { id: entryId, exerciseId, name, sets: [] }],
          })),
        }));
        return entryId;
      },
      removeWorkoutEntry: (workoutId, entryId) =>
        set((s) => ({
          workouts: mapWorkout(s.workouts, workoutId, (w) => ({
            ...w,
            entries: w.entries.filter((e) => e.id !== entryId),
          })),
        })),
      addSet: (workoutId, entryId, value) => {
        const clean = sanitizeWorkoutSet(value);
        if (!clean) return;
        set((s) => ({
          workouts: mapEntry(s.workouts, workoutId, entryId, (e) =>
            e.sets.length >= MAX_SETS_PER_ENTRY ? e : { ...e, sets: [...e.sets, clean] }
          ),
        }));
      },
      updateSet: (workoutId, entryId, index, value) => {
        const clean = sanitizeWorkoutSet(value);
        if (!clean) return;
        set((s) => ({
          workouts: mapEntry(s.workouts, workoutId, entryId, (e) => ({
            ...e,
            sets: e.sets.map((existing, i) => (i === index ? clean : existing)),
          })),
        }));
      },
      removeSet: (workoutId, entryId, index) =>
        set((s) => ({
          workouts: mapEntry(s.workouts, workoutId, entryId, (e) => ({
            ...e,
            sets: e.sets.filter((_, i) => i !== index),
          })),
        })),

      setScheduleDay: (index, patch) => {
        if (index < 0 || index > 6) return;
        set((s) => ({
          schedule: s.schedule.map((day, i) =>
            i === index
              ? {
                  focus: patch.focus && isFocusArea(patch.focus) ? patch.focus : day.focus,
                  exerciseIds: patch.exerciseIds ? patch.exerciseIds.slice(0, 20) : day.exerciseIds,
                }
              : day
          ),
          planUpdatedAt: Date.now(),
        }));
      },
      applyScheduleTemplate: (id) =>
        set({ schedule: scheduleFromTemplate(id), planUpdatedAt: Date.now() }),

      addBodyStat: (entry) => {
        const now = Date.now();
        const id = crypto.randomUUID();
        const clean = sanitizeBodyStat({ ...entry, createdAt: now, updatedAt: now }, id, now);
        if (!clean) return null;
        set((s) => {
          const goals =
            clean.weightKg != null && s.goals.targetWeightKg != null && s.goals.startWeightKg == null
              ? { ...s.goals, startWeightKg: clean.weightKg }
              : s.goals;
          return { bodyStats: [...s.bodyStats, clean], goals };
        });
        return id;
      },
      deleteBodyStat: (id) => {
        useCloudSyncStore.getState().markDeletedKeys("fitnessBodyStatIds", [id]);
        set((s) => ({ bodyStats: s.bodyStats.filter((e) => e.id !== id) }));
      },

      setProfile: (patch) =>
        set((s) => ({
          profile: sanitizeProfile({ ...s.profile, ...patch }),
          planUpdatedAt: Date.now(),
        })),
      setGoals: (patch) =>
        set((s) => {
          const next = sanitizeGoals({
            ...s.goals,
            ...patch,
            nutrition: { ...s.goals.nutrition, ...(patch.nutrition ?? {}) },
          });
          if (
            patch.targetWeightKg !== undefined &&
            patch.targetWeightKg !== s.goals.targetWeightKg &&
            patch.startWeightKg === undefined
          ) {
            const latest = [...s.bodyStats]
              .filter((e) => e.weightKg != null)
              .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
            next.startWeightKg = next.targetWeightKg == null ? null : (latest?.weightKg ?? null);
          }
          return { goals: next, planUpdatedAt: Date.now() };
        }),

      addFoodEntry: (entry) => {
        const now = Date.now();
        const id = crypto.randomUUID();
        const clean = sanitizeFoodEntry({ ...entry, createdAt: now, updatedAt: now }, id, now);
        if (!clean) return null;
        set((s) => ({ foodEntries: [...s.foodEntries, clean] }));
        return id;
      },
      updateFoodEntry: (id, patch) =>
        set((s) => ({
          foodEntries: s.foodEntries.map((entry) => {
            if (entry.id !== id) return entry;
            const next = sanitizeFoodEntry({ ...entry, ...patch, updatedAt: Date.now() }, id);
            return next ?? entry;
          }),
        })),
      deleteFoodEntry: (id) => {
        useCloudSyncStore.getState().markDeletedKeys("fitnessFoodIds", [id]);
        set((s) => ({ foodEntries: s.foodEntries.filter((e) => e.id !== id) }));
      },

      replaceWorkoutsFromSync: (workouts) => set({ workouts }),
      replaceBodyStatsFromSync: (bodyStats) => set({ bodyStats }),
      replaceFoodEntriesFromSync: (foodEntries) => set({ foodEntries }),
      applyPlanFromSync: (plan) =>
        set({
          schedule: plan.schedule,
          goals: plan.goals,
          profile: plan.profile,
          planUpdatedAt: plan.updatedAt,
        }),
      getPlan: () => {
        const s = get();
        return {
          schedule: s.schedule,
          goals: s.goals,
          profile: s.profile,
          updatedAt: s.planUpdatedAt,
        };
      },
      clearAllData: () => {
        const s = get();
        const cloud = useCloudSyncStore.getState();
        cloud.markDeletedKeys("fitnessWorkoutIds", s.workouts.map((w) => w.id));
        cloud.markDeletedKeys("fitnessBodyStatIds", s.bodyStats.map((e) => e.id));
        cloud.markDeletedKeys("fitnessFoodIds", s.foodEntries.map((e) => e.id));
        set({ ...initialData(), planUpdatedAt: Date.now() });
      },
    }),
    {
      name: STORAGE_KEYS.fitness,
      version: STORE_VERSION,
      storage: createDebouncedPersistStorage(),
      partialize: (state) => ({
        view: state.view,
        units: state.units,
        workouts: state.workouts,
        schedule: state.schedule,
        bodyStats: state.bodyStats,
        profile: state.profile,
        goals: state.goals,
        foodEntries: state.foodEntries,
        planUpdatedAt: state.planUpdatedAt,
      }),
      migrate: (persisted) => persisted as FitnessStoreState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FitnessStoreState>;
        return {
          ...current,
          view: FITNESS_VIEWS.includes(p.view as FitnessView) ? (p.view as FitnessView) : current.view,
          units: p.units === "imperial" ? "imperial" : "metric",
          workouts: sanitizeList(p.workouts, sanitizeWorkout),
          schedule: sanitizeSchedule(p.schedule),
          bodyStats: sanitizeList(p.bodyStats, sanitizeBodyStat),
          profile: sanitizeProfile(p.profile),
          goals: sanitizeGoals(p.goals),
          foodEntries: sanitizeList(p.foodEntries, sanitizeFoodEntry),
          planUpdatedAt: typeof p.planUpdatedAt === "number" ? p.planUpdatedAt : 0,
        };
      },
    }
  )
);
