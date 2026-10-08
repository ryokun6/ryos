import { useMemo, useState } from "react";
import { Check, Info, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { FOCUS_AREAS, type FocusArea } from "../types";
import { enumKey, formatShortDate, formatWeekdayShort } from "../utils/format";
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

const FOCUS_EMOJI: Record<FocusArea, string> = {
  upper: "💪",
  lower: "🦵",
  push: "🫸",
  pull: "🪢",
  legs: "🦿",
  core: "🧘",
  cardio: "🏃",
  full: "🏋️",
  rest: "😴",
};

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
      toast.success(t("apps.fitness.toasts.addedToDay", { name: exercise.name, date: formatShortDate(selected.date, locale) }));
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
              day.isToday && "bg-sky-500/10 dark:bg-sky-400/15",
              day.focus === "rest" && "opacity-75"
            )}
          >
            <div className="flex w-full items-center justify-between text-[10px]">
              <span className={cn("font-bold uppercase", day.isToday && "text-os-link")}>
                {formatWeekdayShort(day.date, locale)}
              </span>
              <span className={FITNESS_MUTED_CLASS}>{formatShortDate(day.date, locale)}</span>
            </div>
            <div className="text-[22px] leading-none" aria-hidden>
              {FOCUS_EMOJI[day.focus]}
            </div>
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
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {recommendations.map((rec) => {
                  const exercise = l.exerciseById.get(rec.id);
                  return (
                    <li
                      key={rec.id}
                      className="flex items-center gap-2 rounded-md border border-black/10 bg-white/60 p-1.5 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px]">{rec.name}</div>
                        {exercise ? (
                          <div className="truncate text-[10px] opacity-60">
                            {t(`apps.fitness.equipment.${enumKey(exercise.equipment)}`)}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/15"
                        onClick={() => l.openExercise(rec.id)}
                        aria-label={t("apps.fitness.schedule.viewExercise")}
                        title={t("apps.fitness.schedule.viewExercise")}
                      >
                        <Info size={14} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/15"
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
              {weekly.achieved ? <span aria-hidden>🎉</span> : null}
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
