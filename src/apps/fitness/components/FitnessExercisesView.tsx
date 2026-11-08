import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { cn } from "@/lib/utils";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISE_MUSCLES,
  exerciseImageUrl,
  FREE_EXERCISE_DB_URL,
  type FitnessExercise,
} from "@/shared/fitness";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import {
  DEFAULT_EXERCISE_FILTERS,
  filterExercises,
  type ExerciseFilters,
} from "../utils/exerciseLibrary";
import { loadExerciseDetail } from "../utils/foodApi";
import { enumKey, formatShortDate } from "../utils/format";
import { exerciseProgress, bestSet } from "../utils/progression";
import {
  EmptyNote,
  ExerciseNameLines,
  FITNESS_CHIP_CLASS,
  FITNESS_MUTED_CLASS,
  LineChart,
  Section,
  Sidebar,
  SidebarSection,
  SmallSelect,
} from "./FitnessUi";

const LIST_LIMIT = 200;

function ExerciseImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className={cn("bg-black/5 dark:bg-white/10", className)} aria-hidden />;
  }
  return (
    <img
      src={exerciseImageUrl(path)}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("bg-black/5 object-cover dark:bg-white/10", className)}
    />
  );
}

function useExerciseDetail(exercise: FitnessExercise | null) {
  const [detail, setDetail] = useState<FitnessExercise | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => {
    if (!exercise) return;
    if (exercise.instructions.length) {
      setDetail(exercise);
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setStatus("loading");
    loadExerciseDetail(exercise.id, controller.signal)
      .then((full) => {
        setDetail(full);
        setStatus("idle");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [exercise]);
  return { detail: detail?.id === exercise?.id ? detail : null, status };
}

function ExerciseProgressSheet({ l, exercise }: { l: FitnessLogic; exercise: FitnessExercise | null }) {
  const { t, locale, workouts, formatWeight } = l;
  const progress = useMemo(
    () => (exercise ? exerciseProgress(workouts, exercise.id) : []),
    [workouts, exercise]
  );
  const recent = useMemo(() => {
    if (!exercise) return [];
    const rows: { date: string; sets: string }[] = [];
    for (const workout of [...workouts].sort((a, b) => b.date.localeCompare(a.date))) {
      const entry = workout.entries.find((e) => e.exerciseId === exercise.id && e.sets.length);
      if (!entry) continue;
      rows.push({
        date: workout.date,
        sets: entry.sets
          .map((s) => (s.weightKg > 0 ? `${s.reps}×${formatWeight(s.weightKg)}` : `${s.reps}`))
          .join(", "),
      });
      if (rows.length >= 5) break;
    }
    return rows;
  }, [workouts, exercise, formatWeight]);
  const best = useMemo(() => {
    if (!exercise) return null;
    return bestSet(
      workouts.flatMap((w) => w.entries.filter((e) => e.exerciseId === exercise.id).flatMap((e) => e.sets))
    );
  }, [workouts, exercise]);

  return (
    <Sidebar>
      <SidebarSection
        title={
          exercise ? (
            <span className="flex items-baseline justify-between gap-2">
              <span>{t("apps.fitness.exercises.progress")}</span>
              {best ? (
                <span className={cn("text-[11px] font-normal", FITNESS_MUTED_CLASS)}>
                  {t("apps.fitness.exercises.bestSet", {
                    reps: best.reps,
                    weight: formatWeight(best.weightKg),
                  })}
                </span>
              ) : null}
            </span>
          ) : (
            t("apps.fitness.exercises.progress")
          )
        }
      >
        {!exercise ? (
          <EmptyNote>{t("apps.fitness.exercises.select")}</EmptyNote>
        ) : progress.length ? (
          <>
            <LineChart
              label={t("apps.fitness.exercises.e1rmChart")}
              points={progress.map((p) => ({ date: p.date, value: p.e1rmKg || p.totalReps }))}
              formatValue={(v) =>
                progress.some((p) => p.e1rmKg > 0) ? formatWeight(v, 0) : String(Math.round(v))
              }
              formatDate={(d) => formatShortDate(d, locale)}
            />
            <p className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
              {progress.some((p) => p.e1rmKg > 0)
                ? t("apps.fitness.exercises.e1rmHint")
                : t("apps.fitness.exercises.repsHint")}
            </p>
            <table className="w-full text-[11px]">
              <tbody>
                {recent.map((row) => (
                  <tr key={row.date} className="border-t border-black/5 dark:border-white/10">
                    <td className={cn("py-0.5 pr-2 whitespace-nowrap", FITNESS_MUTED_CLASS)}>
                      {formatShortDate(row.date, locale)}
                    </td>
                    <td className="py-0.5">{row.sets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <EmptyNote>{t("apps.fitness.exercises.noProgress")}</EmptyNote>
        )}
      </SidebarSection>
    </Sidebar>
  );
}

function ExerciseDetail({ l, exercise }: { l: FitnessLogic; exercise: FitnessExercise }) {
  const { t, displayName, instructionsFor } = l;
  const names = displayName(exercise.id, exercise.name);
  const { detail, status } = useExerciseDetail(exercise);

  const chips = [
    t(`apps.fitness.categories.${enumKey(exercise.category)}`),
    t(`apps.fitness.levels.${exercise.level}`),
    t(`apps.fitness.equipment.${enumKey(exercise.equipment)}`),
    exercise.mechanic ? t(`apps.fitness.mechanic.${exercise.mechanic}`) : null,
    exercise.force ? t(`apps.fitness.force.${exercise.force}`) : null,
  ].filter(Boolean) as string[];

  const handleAdd = () => {
    const entryId = l.addExerciseToDay(l.todayKey, exercise);
    if (entryId) {
      toast.success(t("apps.fitness.toasts.addedToWorkout", { name: names.primary }), {
        action: {
          label: t("apps.fitness.views.workouts"),
          onClick: () => {
            l.setWorkoutDate(l.todayKey);
            l.setView("workouts");
          },
        },
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0">
            <ExerciseNameLines
              primary={names.primary}
              secondary={names.secondary}
              truncate={false}
              primaryClassName="text-[16px] font-bold leading-tight"
              secondaryClassName="text-[12px]"
            />
          </h2>
          <Button size="sm" variant="default" onClick={handleAdd} className="h-7 shrink-0 gap-1 text-[12px]">
            <Plus size={12} weight="bold" />
            {t("apps.fitness.exercises.addToToday")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span key={chip} className={FITNESS_CHIP_CLASS}>
              {chip}
            </span>
          ))}
        </div>
      </div>

      {exercise.images.length ? (
        <div className="grid grid-cols-2 gap-2">
          {exercise.images.slice(0, 2).map((path, i) => (
            <ExerciseImage
              key={path}
              path={path}
              alt={t("apps.fitness.exercises.imageAlt", { name: names.primary, step: i + 1 })}
              className="aspect-[4/3] w-full !rounded-[0.5rem]"
            />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
        <div>
          <div className={FITNESS_MUTED_CLASS}>{t("apps.fitness.exercises.primaryMuscles")}</div>
          <div>
            {exercise.primaryMuscles.map((m) => t(`apps.fitness.muscles.${enumKey(m)}`)).join(", ") ||
              "—"}
          </div>
        </div>
        <div>
          <div className={FITNESS_MUTED_CLASS}>{t("apps.fitness.exercises.secondaryMuscles")}</div>
          <div>
            {exercise.secondaryMuscles.map((m) => t(`apps.fitness.muscles.${enumKey(m)}`)).join(", ") ||
              "—"}
          </div>
        </div>
      </div>

      <Section title={t("apps.fitness.exercises.instructions")}>
        {detail ? (
          <ol className="list-decimal space-y-1.5 pl-5 text-[12px] leading-snug">
            {instructionsFor(exercise.id, detail.instructions).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        ) : status === "error" ? (
          <EmptyNote>{t("apps.fitness.exercises.instructionsError")}</EmptyNote>
        ) : (
          <div className="flex justify-center py-2">
            <ActivityIndicator size="sm" />
          </div>
        )}
      </Section>

      <p className={cn("text-[10px]", FITNESS_MUTED_CLASS)}>
        {t("apps.fitness.attribution.prefix")}{" "}
        <a href={FREE_EXERCISE_DB_URL} target="_blank" rel="noreferrer" className="text-os-link underline">
          free-exercise-db
        </a>{" "}
        {t("apps.fitness.attribution.license")}
      </p>
    </div>
  );
}

export function FitnessExercisesView({ l, isMobileLayout }: { l: FitnessLogic; isMobileLayout: boolean }) {
  const { t } = l;
  const [filters, setFilters] = useState<ExerciseFilters>(DEFAULT_EXERCISE_FILTERS);
  const results = useMemo(
    () =>
      filterExercises(l.exercises, filters, {
        names: (exercise) => l.searchLabels(exercise.id, exercise.name),
      }),
    [l.exercises, filters, l.searchLabels]
  );
  const selected =
    (l.selectedExerciseId ? l.exerciseById.get(l.selectedExerciseId) : null) ??
    (isMobileLayout ? null : results[0] ?? null);
  const showList = !isMobileLayout || !l.selectedExerciseId;
  const showDetail = !isMobileLayout || Boolean(l.selectedExerciseId);

  const setFilter = <K extends keyof ExerciseFilters>(key: K, value: ExerciseFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const all = { value: "all" as const, label: t("apps.fitness.filters.all") };

  if (l.libraryStatus !== "ready" && !l.exercises.length) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-[12px]">
        {l.libraryStatus === "error" ? (
          <>
            <p>{t("apps.fitness.exercises.loadError")}</p>
            <Button size="sm" variant="default" onClick={l.reloadLibrary} className="h-7 text-[12px]">
              {t("apps.fitness.exercises.retry")}
            </Button>
          </>
        ) : (
          <>
            <ActivityIndicator size="md" />
            <p className={FITNESS_MUTED_CLASS}>{t("apps.fitness.exercises.loading")}</p>
          </>
        )}
        <ExerciseProgressSheet l={l} exercise={null} />
      </div>
    );
  }

  return (
    <div className={cn("flex size-full min-h-0", isMobileLayout ? "flex-col" : "flex-row")}>
      {showList ? (
        <div
          className={cn(
            "flex min-h-0 flex-col",
            isMobileLayout ? "flex-1" : "w-[240px] shrink-0 border-r border-black/10 dark:border-white/10"
          )}
        >
          <div className="flex flex-col gap-1.5 border-b border-black/10 p-2 dark:border-white/10">
            <SearchInput
              value={filters.query}
              onChange={(value) => setFilter("query", value)}
              placeholder={t("apps.fitness.exercises.search")}
              ariaLabel={t("apps.fitness.exercises.search")}
              clearAriaLabel={t("spotlight.ariaLabels.clearSearch")}
              className="w-full max-w-none"
              inputClassName="h-[24px]"
            />
            <div className="grid grid-cols-2 gap-1">
              <SmallSelect
                label={t("apps.fitness.filters.muscle")}
                value={filters.muscle}
                onChange={(v) => setFilter("muscle", v)}
                options={[
                  { ...all, label: t("apps.fitness.filters.allMuscles") },
                  ...EXERCISE_MUSCLES.map((m) => ({ value: m, label: t(`apps.fitness.muscles.${enumKey(m)}`) })),
                ]}
              />
              <SmallSelect
                label={t("apps.fitness.filters.equipment")}
                value={filters.equipment}
                onChange={(v) => setFilter("equipment", v)}
                options={[
                  { ...all, label: t("apps.fitness.filters.allEquipment") },
                  ...EXERCISE_EQUIPMENT.map((e) => ({
                    value: e,
                    label: t(`apps.fitness.equipment.${enumKey(e)}`),
                  })),
                ]}
              />
              <SmallSelect
                label={t("apps.fitness.filters.category")}
                value={filters.category}
                onChange={(v) => setFilter("category", v)}
                className="col-span-2"
                options={[
                  { ...all, label: t("apps.fitness.filters.allTypes") },
                  ...EXERCISE_CATEGORIES.map((c) => ({
                    value: c,
                    label: t(`apps.fitness.categories.${enumKey(c)}`),
                  })),
                ]}
              />
            </div>
            <div className={cn("text-[10px]", FITNESS_MUTED_CLASS)}>
              {t("apps.fitness.exercises.count", { count: results.length })}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label={t("apps.fitness.views.exercises")}>
            {results.slice(0, LIST_LIMIT).map((exercise) => {
              const names = l.displayName(exercise.id, exercise.name);
              const muscles = exercise.primaryMuscles
                .map((m) => t(`apps.fitness.muscles.${enumKey(m)}`))
                .join(", ");
              const meta = [names.secondary, muscles].filter(Boolean).join(" · ");
              return (
              <li key={exercise.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === exercise.id}
                  data-selected={selected?.id === exercise.id ? "true" : undefined}
                  onClick={() => l.setSelectedExerciseId(exercise.id)}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px]"
                >
                  {exercise.images[0] ? (
                    <ExerciseImage path={exercise.images[0]} alt="" className="size-8 shrink-0 rounded" />
                  ) : (
                    <div className="size-8 shrink-0 rounded bg-black/5 dark:bg-white/10" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{names.primary}</span>
                    <span className="block truncate text-[10px] opacity-60">{meta}</span>
                  </span>
                </button>
              </li>
              );
            })}
            {results.length > LIST_LIMIT ? (
              <li className={cn("px-2 py-2 text-center text-[10px]", FITNESS_MUTED_CLASS)}>
                {t("apps.fitness.exercises.refine", { count: results.length - LIST_LIMIT })}
              </li>
            ) : null}
            {results.length === 0 ? (
              <li>
                <EmptyNote>{t("apps.fitness.exercises.noResults")}</EmptyNote>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {showDetail ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {isMobileLayout ? (
            <button
              type="button"
              onClick={() => l.setSelectedExerciseId(null)}
              className="flex items-center gap-1 px-3 pt-2 text-[12px] text-os-link"
            >
              <ArrowLeft size={12} />
              {t("apps.fitness.exercises.back")}
            </button>
          ) : null}
          {selected ? (
            <ExerciseDetail key={selected.id} l={l} exercise={selected} />
          ) : (
            <EmptyNote>{t("apps.fitness.exercises.select")}</EmptyNote>
          )}
        </div>
      ) : null}
      <ExerciseProgressSheet l={l} exercise={selected ?? null} />
    </div>
  );
}
