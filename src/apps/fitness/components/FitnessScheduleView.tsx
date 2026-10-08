import { useMemo, useState } from "react";
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
  Section,
  SmallSelect,
} from "./FitnessUi";

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
  const [template, setTemplate] = useState<ScheduleTemplateId | "">("");

  const addToDay = (exercise: { id: string; name: string }) => {
    if (l.addExerciseToDay(selected.date, exercise)) {
      const names = l.displayName(exercise.id, exercise.name);
      toast.success(t("apps.fitness.toasts.addedToDay", { name: names.primary, date: formatShortDate(selected.date, locale) }));
    }
  };

  return (
    <div className="flex size-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
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

      <div className={cn("grid gap-3", isMobileLayout ? "grid-cols-1" : "grid-cols-[1fr_220px]")}>
        <Section
          title={t("apps.fitness.schedule.recommendedFor", {
            focus: t(`apps.fitness.focus.${selected.focus}`),
            day: formatWeekdayShort(selected.date, locale),
          })}
          actions={
            selected.focus !== "rest" ? (
              <Button
                size="sm"
                variant="default"
                className="h-6 text-[11px]"
                onClick={() => {
                  l.setWorkoutDate(selected.date);
                  l.setView("workouts");
                }}
              >
                {t("apps.fitness.schedule.startWorkout")}
              </Button>
            ) : null
          }
        >
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
              <ul className="grid grid-cols-2 gap-1">
                {recommendations.map((rec) => {
                  const exercise = l.exerciseById.get(rec.id);
                  const names = l.displayName(rec.id, rec.name);
                  const equipment = exercise
                    ? t(`apps.fitness.equipment.${enumKey(exercise.equipment)}`)
                    : "";
                  const meta = [names.secondary, equipment].filter(Boolean).join(" · ");
                  return (
                    <li
                      key={rec.id}
                      className="flex items-center gap-1 rounded-md border border-black/10 bg-white/60 p-1 dark:border-white/10 dark:bg-white/5"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded px-0.5 py-0.5 text-left hover:bg-black/10 dark:hover:bg-white/15"
                        onClick={() => l.openExercise(rec.id)}
                      >
                        <div
                          className={cn("text-[12px] leading-snug", isMobileLayout ? "line-clamp-2 break-words" : "truncate")}
                          title={names.secondary ? `${names.primary} — ${names.secondary}` : names.primary}
                        >
                          {names.primary}
                        </div>
                        {meta ? <div className="truncate text-[10px] opacity-60">{meta}</div> : null}
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/15"
                        onClick={() => addToDay(rec)}
                        aria-label={t("apps.fitness.schedule.addToDay")}
                        title={t("apps.fitness.schedule.addToDay")}
                      >
                        <Plus size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Section>

        <div className="flex flex-col gap-3">
          <Section title={t("apps.fitness.schedule.weeklyGoal")}>
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
            <SmallSelect
              label={t("apps.fitness.goals.weeklyTarget")}
              value={String(l.goals.weeklyWorkoutTarget)}
              onChange={(value) => store.setGoals({ weeklyWorkoutTarget: Number(value) })}
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                value: String(n),
                label: t("apps.fitness.goals.perWeek", { count: n }),
              }))}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
