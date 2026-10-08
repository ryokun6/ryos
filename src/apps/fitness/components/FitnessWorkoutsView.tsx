import { useMemo, useState } from "react";
import { CaretLeft, CaretRight, Plus, Trash, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { FOCUS_AREAS, type FocusArea, type Workout, type WorkoutEntry } from "../types";
import { addDays } from "../utils/dates";
import { DEFAULT_EXERCISE_FILTERS, filterExercises } from "../utils/exerciseLibrary";
import { formatLongDate, formatShortDate } from "../utils/format";
import {
  estimateOneRepMax,
  lastSetsFor,
  loggedExerciseIds,
  personalRecords,
  workoutVolume,
} from "../utils/progression";
import { focusForDate, recommendExercises } from "../utils/schedule";
import { displayToKg, kgToDisplay, tidy } from "../utils/units";
import {
  EmptyNote,
  FITNESS_CHIP_CLASS,
  FITNESS_MUTED_CLASS,
  NumberField,
  Section,
  SmallSelect,
} from "./FitnessUi";

const ICON_BUTTON_CLASS =
  "inline-flex size-6 items-center justify-center rounded hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/15";

function EntryCard({ l, workout, entry }: { l: FitnessLogic; workout: Workout; entry: WorkoutEntry }) {
  const { t, units } = l;
  const store = useFitnessStore.getState();
  const previous = useMemo(
    () => lastSetsFor(l.workouts, entry.exerciseId, workout.date),
    [l.workouts, entry.exerciseId, workout.date]
  );

  const addSet = () => {
    const template = entry.sets[entry.sets.length - 1] ?? previous?.[entry.sets.length] ?? previous?.[0];
    store.addSet(workout.id, entry.id, template ?? { reps: 10, weightKg: 0 });
  };

  return (
    <Section
      title={
        <button type="button" className="text-left hover:underline" onClick={() => l.openExercise(entry.exerciseId)}>
          {entry.name}
        </button>
      }
      actions={
        <button
          type="button"
          className={ICON_BUTTON_CLASS}
          onClick={() => store.removeWorkoutEntry(workout.id, entry.id)}
          aria-label={t("apps.fitness.workouts.removeExercise")}
          title={t("apps.fitness.workouts.removeExercise")}
        >
          <X size={12} />
        </button>
      }
    >
      {previous ? (
        <p className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
          {t("apps.fitness.workouts.lastTime", {
            sets: previous
              .map((s) => (s.weightKg > 0 ? `${s.reps}×${l.formatWeight(s.weightKg)}` : `${s.reps}`))
              .join(", "),
          })}
        </p>
      ) : null}
      {entry.sets.length ? (
        <table className="w-full text-[12px]">
          <thead>
            <tr className={cn("text-left text-[10px]", FITNESS_MUTED_CLASS)}>
              <th className="w-8 font-normal">{t("apps.fitness.workouts.set")}</th>
              <th className="font-normal">{t("apps.fitness.workouts.reps")}</th>
              <th className="font-normal">{t("apps.fitness.workouts.weight", { unit: l.weightUnit })}</th>
              <th className="font-normal">{t("apps.fitness.workouts.e1rm")}</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {entry.sets.map((set, index) => (
              <tr key={index}>
                <td className={FITNESS_MUTED_CLASS}>{index + 1}</td>
                <td className="py-0.5">
                  <NumberField
                    label={t("apps.fitness.workouts.reps")}
                    value={set.reps}
                    onCommit={(reps) =>
                      store.updateSet(workout.id, entry.id, index, { ...set, reps: Math.round(reps ?? 0) })
                    }
                  />
                </td>
                <td className="py-0.5">
                  <NumberField
                    label={t("apps.fitness.workouts.weight", { unit: l.weightUnit })}
                    value={tidy(kgToDisplay(set.weightKg, units), 2)}
                    onCommit={(value) =>
                      store.updateSet(workout.id, entry.id, index, {
                        ...set,
                        weightKg: value == null ? 0 : displayToKg(value, units),
                      })
                    }
                  />
                </td>
                <td className={FITNESS_MUTED_CLASS}>
                  {set.weightKg > 0 ? l.formatWeight(estimateOneRepMax(set.weightKg, set.reps), 0) : "—"}
                </td>
                <td>
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    onClick={() => store.removeSet(workout.id, entry.id, index)}
                    aria-label={t("apps.fitness.workouts.removeSet")}
                    title={t("apps.fitness.workouts.removeSet")}
                  >
                    <Trash size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div>
        <Button size="sm" variant="default" onClick={addSet} className="h-6 gap-1 text-[11px]">
          <Plus size={11} weight="bold" />
          {t("apps.fitness.workouts.addSet")}
        </Button>
      </div>
    </Section>
  );
}

function AddExercise({ l, onAdd }: { l: FitnessLogic; onAdd: (exercise: { id: string; name: string }) => void }) {
  const { t } = l;
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const fromLibrary = filterExercises(l.exercises, { ...DEFAULT_EXERCISE_FILTERS, query }).slice(0, 8);
    if (fromLibrary.length) return fromLibrary.map((e) => ({ id: e.id, name: e.name }));
    const q = query.toLowerCase();
    return loggedExerciseIds(l.workouts).filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, l.exercises, l.workouts]);

  return (
    <div className="relative">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t("apps.fitness.workouts.addExercisePlaceholder")}
        ariaLabel={t("apps.fitness.workouts.addExercisePlaceholder")}
        clearAriaLabel={t("spotlight.ariaLabels.clearSearch")}
        className="w-full max-w-none"
        inputClassName="h-[26px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            onAdd(matches[0]);
            setQuery("");
          }
        }}
      />
      {matches.length ? (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-black/15 bg-white py-1 shadow-lg dark:border-white/15 dark:bg-neutral-800">
          {matches.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                className="w-full px-2 py-1 text-left text-[12px] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  onAdd(match);
                  setQuery("");
                }}
              >
                {match.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FitnessWorkoutsView({ l, isMobileLayout }: { l: FitnessLogic; isMobileLayout: boolean }) {
  const { t, locale, workoutDate, setWorkoutDate } = l;
  const store = useFitnessStore.getState();
  const workout = useMemo(
    () =>
      l.workouts
        .filter((w) => w.date === workoutDate)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
    [l.workouts, workoutDate]
  );
  const plannedFocus = focusForDate(l.schedule, workoutDate);
  const focus: FocusArea = workout?.focus ?? plannedFocus;
  const recommendations = useMemo(
    () =>
      recommendExercises(focus, {
        library: l.exercises,
        limit: 6,
        exclude: workout?.entries.map((e) => e.exerciseId),
      }),
    [focus, l.exercises, workout?.entries]
  );
  const history = useMemo(
    () =>
      [...l.workouts]
        .filter((w) => w.entries.some((e) => e.sets.length))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12),
    [l.workouts]
  );
  const records = useMemo(() => personalRecords(l.workouts).slice(0, 6), [l.workouts]);

  const add = (exercise: { id: string; name: string }) => l.addExerciseToDay(workoutDate, exercise);

  return (
    <div className={cn("flex size-full min-h-0 overflow-y-auto", isMobileLayout ? "flex-col" : "flex-row")}>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={() => setWorkoutDate(addDays(workoutDate, -1))}
            aria-label={t("apps.fitness.common.previousDay")}
            title={t("apps.fitness.common.previousDay")}
          >
            <CaretLeft size={14} />
          </button>
          <h2 className="min-w-0 text-[14px] font-bold">{formatLongDate(workoutDate, locale)}</h2>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={() => setWorkoutDate(addDays(workoutDate, 1))}
            aria-label={t("apps.fitness.common.nextDay")}
            title={t("apps.fitness.common.nextDay")}
          >
            <CaretRight size={14} />
          </button>
          {workoutDate !== l.todayKey ? (
            <button type="button" className={FITNESS_CHIP_CLASS} onClick={() => setWorkoutDate(l.todayKey)}>
              {t("apps.fitness.common.today")}
            </button>
          ) : null}
          <div className="flex-1" />
          <SmallSelect
            label={t("apps.fitness.workouts.focus")}
            value={focus}
            className="w-[120px]"
            onChange={(value) => {
              const id = store.ensureWorkout(workoutDate);
              store.updateWorkout(id, { focus: value });
            }}
            options={FOCUS_AREAS.map((f) => ({ value: f, label: t(`apps.fitness.focus.${f}`) }))}
          />
          {workout ? (
            <button
              type="button"
              className={ICON_BUTTON_CLASS}
              onClick={() => store.deleteWorkout(workout.id)}
              aria-label={t("apps.fitness.workouts.deleteWorkout")}
              title={t("apps.fitness.workouts.deleteWorkout")}
            >
              <Trash size={14} />
            </button>
          ) : null}
        </div>

        <AddExercise l={l} onAdd={add} />

        {recommendations.length ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className={cn("mr-1 text-[11px]", FITNESS_MUTED_CLASS)}>
              {t("apps.fitness.workouts.suggested", { focus: t(`apps.fitness.focus.${focus}`) })}
            </span>
            {recommendations.map((rec) => (
              <button key={rec.id} type="button" className={FITNESS_CHIP_CLASS} onClick={() => add(rec)}>
                + {rec.name}
              </button>
            ))}
          </div>
        ) : null}

        {workout?.entries.length ? (
          workout.entries.map((entry) => <EntryCard key={entry.id} l={l} workout={workout} entry={entry} />)
        ) : (
          <EmptyNote>{t("apps.fitness.workouts.empty")}</EmptyNote>
        )}
      </div>

      <div
        className={cn(
          "flex shrink-0 flex-col gap-3 p-3",
          isMobileLayout ? "w-full" : "w-[230px] border-l border-black/10 dark:border-white/10"
        )}
      >
        <Section title={t("apps.fitness.workouts.history")}>
          {history.length ? (
            <ul className="flex flex-col text-[12px]">
              {history.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    data-selected={w.date === workoutDate ? "true" : undefined}
                    onClick={() => setWorkoutDate(w.date)}
                    className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left"
                  >
                    <span className="truncate">
                      {formatShortDate(w.date, locale)}
                      {w.focus ? ` · ${t(`apps.fitness.focus.${w.focus}`)}` : ""}
                    </span>
                    <span className="shrink-0 text-[10px] opacity-60">
                      {workoutVolume(w) > 0
                        ? l.formatWeight(workoutVolume(w), 0)
                        : t("apps.fitness.workouts.exerciseCount", { count: w.entries.length })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>{t("apps.fitness.workouts.noHistory")}</EmptyNote>
          )}
        </Section>
        <Section title={t("apps.fitness.workouts.records")}>
          {records.length ? (
            <ul className="flex flex-col gap-0.5 text-[12px]">
              {records.map((r) => (
                <li key={r.exerciseId} className="flex justify-between gap-2">
                  <button type="button" className="truncate text-left hover:underline" onClick={() => l.openExercise(r.exerciseId)}>
                    {r.name}
                  </button>
                  <span className="shrink-0 text-[11px]" title={t("apps.fitness.workouts.e1rm")}>
                    {r.reps}×{l.formatWeight(r.weightKg)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>{t("apps.fitness.workouts.noRecords")}</EmptyNote>
          )}
        </Section>
      </div>
    </div>
  );
}
