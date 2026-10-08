import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Barbell,
  Check,
  Footprints,
  Moon,
  PersonArmsSpread,
  PersonSimpleRun,
  PersonSimpleTaiChi,
  PersonSimpleWalk,
  Plus,
  Trophy,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exerciseImageUrl } from "@/shared/fitness";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { FOCUS_AREAS, type FocusArea } from "../types";
import { enumKey, formatCompactDate, formatShortDate, formatWeekdayShort } from "../utils/format";
import { weeklyWorkoutProgress } from "../utils/goals";
import {
  FOCUS_MUSCLES,
  plannedTrainingDays,
  recommendExercises,
  SCHEDULE_TEMPLATE_IDS,
  weekPlan,
  weeklyStreak,
  type ScheduleTemplateId,
} from "../utils/schedule";
import {
  EmptyNote,
  FITNESS_CARD_CLASS,
  FITNESS_MUTED_CLASS,
  ProgressBar,
  SmallSelect,
} from "./FitnessUi";

const SCROLL_FADE_PX = 24;

/** Fade the edges of a horizontal scroller only while content is clipped there. */
function horizontalScrollFade(el: HTMLElement): string {
  const hidden = el.scrollWidth - el.clientWidth;
  if (hidden <= 2) return "";
  const atStart = el.scrollLeft <= 2;
  const atEnd = hidden - el.scrollLeft <= 2;
  if (atStart && !atEnd) {
    return `linear-gradient(to right, #000 0, #000 calc(100% - ${SCROLL_FADE_PX}px), transparent 100%)`;
  }
  if (!atStart && atEnd) {
    return `linear-gradient(to right, transparent 0, #000 ${SCROLL_FADE_PX}px, #000 100%)`;
  }
  if (!atStart && !atEnd) {
    return `linear-gradient(to right, transparent 0, #000 ${SCROLL_FADE_PX}px, #000 calc(100% - ${SCROLL_FADE_PX}px), transparent 100%)`;
  }
  return "";
}

function useHorizontalScrollFade(listKey: string) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !listKey) return;
    const apply = () => {
      const mask = horizontalScrollFade(el);
      el.style.maskImage = mask;
      el.style.setProperty("-webkit-mask-image", mask);
    };
    apply();
    el.addEventListener("scroll", apply, { passive: true });
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", apply);
      observer.disconnect();
      el.style.maskImage = "";
      el.style.setProperty("-webkit-mask-image", "");
    };
  }, [listKey]);
  return ref;
}

function ExercisePhoto({ path }: { path: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const className = "h-20 w-full bg-black/5 object-cover dark:bg-white/10";
  if (!path || failed) {
    return <div className={className} aria-hidden />;
  }
  return (
    <img
      src={exerciseImageUrl(path)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

const FOCUS_ICON: Record<FocusArea, typeof Barbell> = {
  upper: Barbell,
  lower: PersonSimpleWalk,
  push: ArrowUp,
  pull: ArrowDown,
  legs: Footprints,
  core: PersonSimpleTaiChi,
  cardio: PersonSimpleRun,
  full: PersonArmsSpread,
  rest: Moon,
};

/** Same shallow fill as Maps POI badges (`poiVisualGradient`). */
function badgeGradient(from: string, to: string): string {
  return `linear-gradient(180deg, ${from} 0%, color-mix(in srgb, ${from} 82%, ${to}) 100%)`;
}

const DAY_BADGE = {
  workout: { from: "#ef4444", to: "#dc2626" },
  rest: { from: "#94a3b8", to: "#64748b" },
  missed: { from: "#f59e0b", to: "#b45309" },
} as const;

function FocusMark({ focus, missed }: { focus: FocusArea; missed: boolean }) {
  const Icon = FOCUS_ICON[focus];
  const tone = focus === "rest" ? "rest" : missed ? "missed" : "workout";
  const { from, to } = DAY_BADGE[tone];
  return (
    <div
      className="aqua-icon-badge flex size-6 shrink-0 items-center justify-center text-white"
      style={{ backgroundImage: badgeGradient(from, to) }}
      aria-hidden
    >
      <Icon size={14} weight="fill" />
    </div>
  );
}

export function FitnessScheduleView({ l, isMobileLayout }: { l: FitnessLogic; isMobileLayout: boolean }) {
  const { t, locale, todayKey } = l;
  const store = useFitnessStore.getState();
  const days = useMemo(() => weekPlan(l.schedule, l.workouts, todayKey), [l.schedule, l.workouts, todayKey]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const selectedIndex = Math.max(0, days.findIndex((d) => d.date === selectedDate));
  const selected = days[selectedIndex] ?? days[0];
  const weekly = weeklyWorkoutProgress(l.goals, l.workouts, todayKey);
  const streak = weeklyStreak(l.workouts, l.goals.weeklyWorkoutTarget, todayKey);
  const planned = plannedTrainingDays(l.schedule);
  const recommendations = useMemo(
    () => recommendExercises(selected.focus, { library: l.exercises, limit: 8 }),
    [selected.focus, l.exercises]
  );
  const recommendationRowRef = useHorizontalScrollFade(
    selected.focus === "rest" ? "" : recommendations.map((rec) => rec.id).join("\0")
  );
  const addedOnSelectedDay = useMemo(() => {
    const workout = l.workouts
      .filter((w) => w.date === selected.date)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const byExercise = new Map<string, { workoutId: string; entryId: string }>();
    if (!workout) return byExercise;
    for (const entry of workout.entries) {
      byExercise.set(entry.exerciseId, { workoutId: workout.id, entryId: entry.id });
    }
    return byExercise;
  }, [l.workouts, selected.date]);
  const [template, setTemplate] = useState<ScheduleTemplateId | "">("");

  const addToDay = (exercise: { id: string; name: string }) => {
    if (l.addExerciseToDay(selected.date, exercise)) {
      const names = l.displayName(exercise.id, exercise.name);
      toast.success(t("apps.fitness.toasts.addedToDay", { name: names.primary, date: formatShortDate(selected.date, locale) }));
    }
  };

  const toggleOnDay = (exercise: { id: string; name: string }) => {
    const existing = addedOnSelectedDay.get(exercise.id);
    if (existing) {
      store.removeWorkoutEntry(existing.workoutId, existing.entryId);
      return;
    }
    addToDay(exercise);
  };

  return (
    <div className="flex size-full min-h-0 flex-col overflow-y-auto">
      <div className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
        <section className="flex flex-col gap-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-bold">{t("apps.fitness.schedule.thisWeek")}</h2>
            <div className="flex-1" />
            <SmallSelect<ScheduleTemplateId | "">
              label={t("apps.fitness.schedule.template")}
              placeholder={t("apps.fitness.schedule.applyTemplate")}
              value={template}
              className="w-[170px]"
              onChange={(value) => {
                if (!value) return;
                setTemplate("");
                store.applyScheduleTemplate(value);
                toast.success(t("apps.fitness.toasts.templateApplied", { name: t(`apps.fitness.templates.${value}`) }));
              }}
              options={SCHEDULE_TEMPLATE_IDS.map((id) => ({ value: id, label: t(`apps.fitness.templates.${id}`) }))}
            />
          </div>

          <div className={cn("grid gap-1.5", isMobileLayout ? "grid-cols-4" : "grid-cols-7")}>
            {days.map((day, index) => (
              <div
                key={day.date}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDate(day.date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedDate(day.date);
                }}
                aria-pressed={day.date === selected.date}
                className={cn(
                  FITNESS_CARD_CLASS,
                  "flex cursor-default flex-col items-center gap-1 p-1.5 text-center",
                  day.date === selected.date && "ring-2 ring-sky-500/70",
                  day.isToday && "bg-sky-500/10 dark:bg-sky-400/15"
                )}
              >
                <div className="flex w-full flex-col items-center leading-tight">
                  <span className={cn("whitespace-nowrap text-[10px] font-bold uppercase", day.isToday && "text-os-link")}>
                    {formatWeekdayShort(day.date, locale)}
                  </span>
                  <span className={cn("whitespace-nowrap text-[10px]", FITNESS_MUTED_CLASS)}>
                    {formatCompactDate(day.date, locale)}
                  </span>
                </div>
                <FocusMark focus={day.focus} missed={day.isPast && !day.completed && day.focus !== "rest"} />
                <div onClick={(e) => e.stopPropagation()} className="w-full">
                  <SmallSelect
                    label={t("apps.fitness.schedule.dayFocus", { day: formatWeekdayShort(day.date, locale) })}
                    value={day.focus}
                    className="h-5 w-full px-1 text-[10px]"
                    onChange={(focus) => store.setScheduleDay(index, { focus })}
                    options={FOCUS_AREAS.map((f) => ({ value: f, label: t(`apps.fitness.focus.${f}`) }))}
                  />
                </div>
                <div className="h-3.5 text-[10px]">
                  {day.completed ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <Check size={10} weight="bold" />
                      {t("apps.fitness.schedule.done")}
                    </span>
                  ) : day.isPast && day.focus !== "rest" ? (
                    <span className={FITNESS_MUTED_CLASS}>{t("apps.fitness.schedule.missed")}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-2 px-3 py-3">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <h3 className="min-w-0 text-[12px] font-bold">
            {t("apps.fitness.schedule.recommendedFor", {
              focus: t(`apps.fitness.focus.${selected.focus}`),
              day: formatWeekdayShort(selected.date, locale),
            })}
          </h3>
          {selected.focus !== "rest" ? (
            <Button
              size="sm"
              variant="default"
              className="h-6 shrink-0 text-[11px]"
              onClick={() => {
                l.setWorkoutDate(selected.date);
                l.setView("workouts");
              }}
            >
              {t("apps.fitness.schedule.startWorkout")}
            </Button>
          ) : null}
        </div>
          {selected.focus === "rest" ? (
            <EmptyNote>{t("apps.fitness.schedule.restDay")}</EmptyNote>
          ) : (
            <>
              <p className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
                {selected.focus === "cardio"
                  ? t("apps.fitness.schedule.cardioHint")
                  : t("apps.fitness.schedule.targets", {
                      muscles: FOCUS_MUSCLES[selected.focus]
                        .map((m) => t(`apps.fitness.muscles.${enumKey(m)}`))
                        .join(", "),
                    })}
              </p>
              <ul
                ref={recommendationRowRef}
                className="flex w-full min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
              >
                {recommendations.map((rec) => {
                  const exercise = l.exerciseById.get(rec.id);
                  const added = addedOnSelectedDay.has(rec.id);
                  const toggleLabel = added
                    ? t("apps.fitness.schedule.removeFromDay")
                    : t("apps.fitness.schedule.addToDay");
                  const names = l.displayName(rec.id, rec.name);
                  const equipment = exercise
                    ? t(`apps.fitness.equipment.${enumKey(exercise.equipment)}`)
                    : "";
                  return (
                    <li
                      key={rec.id}
                      className="flex w-28 shrink-0 snap-start flex-col overflow-hidden !rounded-[0.5rem] border border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/5"
                    >
                      <button
                        type="button"
                        className="block w-full"
                        onClick={() => l.openExercise(rec.id)}
                      >
                        <ExercisePhoto path={exercise?.images[0]} />
                      </button>
                      <div className="flex items-start gap-1 p-1.5">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => l.openExercise(rec.id)}
                        >
                          <span className="line-clamp-2 break-words text-[12px] leading-snug" title={names.primary}>
                            {names.primary}
                          </span>
                          {equipment ? (
                            <span className="block truncate text-[10px] opacity-60">{equipment}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/15",
                            added && "text-emerald-600 dark:text-emerald-400"
                          )}
                          onClick={() => toggleOnDay(rec)}
                          aria-label={toggleLabel}
                          title={toggleLabel}
                        >
                          {added ? <Check size={14} weight="bold" /> : <Plus size={14} />}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
      </section>

      <section className="flex flex-col gap-2 px-3 py-3">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <h3 className="min-w-0 text-[12px] font-bold">{t("apps.fitness.schedule.weeklyGoal")}</h3>
          <SmallSelect
            label={t("apps.fitness.goals.weeklyTarget")}
            value={String(l.goals.weeklyWorkoutTarget)}
            className="w-auto min-w-max shrink-0"
            onChange={(value) => store.setGoals({ weeklyWorkoutTarget: Number(value) })}
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
              value: String(n),
              label: t("apps.fitness.goals.perWeek", { count: n }),
            }))}
          />
        </div>
            <div className="flex items-baseline justify-between text-[12px]">
              <span>
                {t("apps.fitness.schedule.workoutsThisWeek", {
                  current: weekly.current,
                  target: weekly.target,
                })}
              </span>
              {weekly.achieved ? <Trophy size={14} weight="fill" aria-hidden /> : null}
            </div>
            <ProgressBar fraction={weekly.fraction} label={t("apps.fitness.schedule.weeklyGoal")} />
            <div className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
              {streak > 0
                ? t("apps.fitness.schedule.streak", { count: streak })
                : t("apps.fitness.schedule.noStreak")}
            </div>
            <div className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
              {t("apps.fitness.schedule.plannedDays", { count: planned })}
            </div>
      </section>
      </div>
    </div>
  );
}
