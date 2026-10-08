import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { FitnessInitialData } from "@/apps/base/types";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessExercise, FitnessExerciseLibraryResponse } from "@/shared/fitness";
import { helpItems } from "../metadata";
import type { FitnessView } from "../types";
import { toDateKey } from "../utils/dates";
import {
  getCachedExerciseLibrary,
  indexExercises,
  loadExerciseLibrary,
} from "../utils/exerciseLibrary";
import {
  exerciseNameDisplay,
  exerciseSearchLabels,
  loadExerciseCatalog,
  localizedInstructions,
  peekExerciseCatalog,
  type ExerciseCatalog,
  type ExerciseNameDisplay,
} from "../utils/exerciseI18n";
import { latestBodyValue } from "../utils/goals";
import { computeNutritionTargets } from "../utils/nutrition";
import { focusForDate } from "../utils/schedule";
import { kgToDisplay, tidy, weightUnitLabel } from "../utils/units";

export type LibraryStatus = "idle" | "loading" | "ready" | "error";

const NO_EXERCISES: readonly FitnessExercise[] = [];

function useExerciseCatalog(locale: string): ExerciseCatalog | null {
  const [catalog, setCatalog] = useState<ExerciseCatalog | null>(() => peekExerciseCatalog(locale));
  useEffect(() => {
    const cached = peekExerciseCatalog(locale);
    if (cached) {
      setCatalog(cached);
      return;
    }
    if (locale === "en") {
      setCatalog(null);
      return;
    }
    let cancelled = false;
    setCatalog(null);
    void loadExerciseCatalog(locale).then((next) => {
      if (!cancelled) setCatalog(next);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  return catalog;
}

function useTodayKey(): string {
  const [today, setToday] = useState(() => toDateKey());
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = toDateKey();
      setToday((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

export function useFitnessLogic({ initialData }: { initialData?: FitnessInitialData }) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("fitness", helpItems);
  const dialogs = useAppHelpAboutDialogs();
  const themeFlags = useThemeFlags();
  const locale = useLanguageStore((s) => s.current);
  const exerciseCatalog = useExerciseCatalog(locale);
  const todayKey = useTodayKey();

  const state = useFitnessStore(
    useShallow((s) => ({
      view: s.view,
      units: s.units,
      workouts: s.workouts,
      schedule: s.schedule,
      bodyStats: s.bodyStats,
      profile: s.profile,
      goals: s.goals,
      foodEntries: s.foodEntries,
    }))
  );
  const setView = useFitnessStore((s) => s.setView);
  const setUnits = useFitnessStore((s) => s.setUnits);

  const [library, setLibrary] = useState<FitnessExerciseLibraryResponse | null>(
    getCachedExerciseLibrary
  );
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>(() =>
    getCachedExerciseLibrary() ? "ready" : "idle"
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    initialData?.exerciseId ?? null
  );
  const [workoutDate, setWorkoutDate] = useState(todayKey);
  const [foodDate, setFoodDate] = useState(todayKey);

  const fetchLibrary = useCallback(() => {
    setLibraryStatus("loading");
    loadExerciseLibrary()
      .then((data) => {
        setLibrary(data);
        setLibraryStatus("ready");
      })
      .catch(() => setLibraryStatus("error"));
  }, []);

  useEffect(() => {
    if (!getCachedExerciseLibrary()) fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    if (initialData?.view) setView(initialData.view);
    if (initialData?.exerciseId) setSelectedExerciseId(initialData.exerciseId);
  }, [initialData?.view, initialData?.exerciseId, setView]);

  const exercises: readonly FitnessExercise[] = library?.exercises ?? NO_EXERCISES;
  const exerciseById = useMemo(() => indexExercises(exercises), [exercises]);

  const currentWeightKg = useMemo(
    () => latestBodyValue(state.bodyStats, "weightKg")?.value ?? null,
    [state.bodyStats]
  );
  const nutritionTargets = useMemo(
    () =>
      computeNutritionTargets({
        profile: state.profile,
        goals: state.goals,
        currentWeightKg,
      }),
    [state.profile, state.goals, currentWeightKg]
  );

  const weightUnit = weightUnitLabel(state.units);
  const formatWeight = useCallback(
    (kg: number, decimals = 1) => `${tidy(kgToDisplay(kg, state.units), decimals)} ${weightUnit}`,
    [state.units, weightUnit]
  );

  const displayName = useCallback(
    (id: string, englishName: string): ExerciseNameDisplay =>
      exerciseNameDisplay(englishName, exerciseCatalog?.[id]?.name, locale),
    [exerciseCatalog, locale]
  );
  const instructionsFor = useCallback(
    (id: string, english: readonly string[]) =>
      localizedInstructions(english, exerciseCatalog?.[id]?.instructions, locale),
    [exerciseCatalog, locale]
  );
  const searchLabels = useCallback(
    (id: string, englishName: string) =>
      exerciseSearchLabels(englishName, exerciseCatalog?.[id]?.name),
    [exerciseCatalog]
  );

  const openExercise = useCallback(
    (id: string) => {
      setSelectedExerciseId(id);
      setView("exercises");
    },
    [setView]
  );

  /** Adds an exercise to the workout on `date` (creating it with the planned focus). */
  const addExerciseToDay = useCallback((date: string, exercise: { id: string; name: string }) => {
    const store = useFitnessStore.getState();
    const focus = focusForDate(store.schedule, date);
    const workoutId = store.ensureWorkout(date, focus === "rest" ? null : focus);
    return store.addWorkoutEntry(workoutId, exercise.id, exercise.name);
  }, []);

  const goToView = useCallback((view: FitnessView) => setView(view), [setView]);

  return {
    t,
    locale,
    translatedHelpItems,
    ...dialogs,
    ...themeFlags,
    ...state,
    todayKey,
    setView: goToView,
    setUnits,
    library,
    exercises,
    exerciseById,
    displayName,
    instructionsFor,
    searchLabels,
    libraryStatus,
    reloadLibrary: fetchLibrary,
    selectedExerciseId,
    setSelectedExerciseId,
    openExercise,
    addExerciseToDay,
    workoutDate,
    setWorkoutDate,
    foodDate,
    setFoodDate,
    currentWeightKg,
    nutritionTargets,
    weightUnit,
    formatWeight,
  };
}

export type FitnessLogic = ReturnType<typeof useFitnessLogic>;
