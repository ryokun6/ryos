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
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import { exerciseImageUrl } from "@/shared/fitness";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { FOCUS_AREAS, type FocusArea } from "../types";
import { addDays, daysBetween, fromDateKey, mondayMonthGrid, startOfWeek, weekDates } from "../utils/dates";
import {
  enumKey,
  formatCompactDate,
  formatLongDate,
  formatShortDate,
  formatWeekdayShort,
  formatWeekRange,
} from "../utils/format";
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
  FITNESS_CHIP_CLASS,
  FITNESS_MUTED_CLASS,
  Sidebar,
  SidebarSection,
  SmallSelect,
} from "./FitnessUi";

const SCROLL_FADE_PX = 24;
const MONTH_STEP = 3;
const MONTH_LIMIT = 12;
const TODAY_RED = "#E25B4F";
const TODAY_RED_XP = "#B53325";

function accentMix(percent: number): string {
  return `color-mix(in srgb, var(--os-accent-color, #3a73d6) ${percent}%, transparent)`;
}

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

function useHorizontalScrollFade<T extends HTMLElement = HTMLElement>(
  listKey: string,
  centerSelector?: string
) {
  const ref = useRef<T>(null);
  const centeredKey = useRef("");
  useEffect(() => {
    const el = ref.current;
    if (!el || !listKey) return;
    const apply = () => {
      const mask = horizontalScrollFade(el);
      el.style.maskImage = mask;
      el.style.setProperty("-webkit-mask-image", mask);
    };
    const centerOnce = () => {
      if (!centerSelector) return;
      const token = `${listKey}|${centerSelector}`;
      if (centeredKey.current === token) return;
      const child = el.querySelector<HTMLElement>(centerSelector);
      if (!child || el.clientWidth <= 0) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) {
        centeredKey.current = token;
        return;
      }
      const target = child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, Math.min(target, max));
      centeredKey.current = token;
    };
    centerOnce();
    apply();
    el.addEventListener("scroll", apply, { passive: true });
    const observer = new ResizeObserver(() => {
      centerOnce();
      apply();
    });
    observer.observe(el);
    return () => {
      centeredKey.current = "";
      el.removeEventListener("scroll", apply);
      observer.disconnect();
      el.style.maskImage = "";
      el.style.setProperty("-webkit-mask-image", "");
    };
  }, [listKey, centerSelector]);
  return ref;
}

function WeeklyGoalMarks({ current, target, label }: { current: number; target: number; label: string }) {
  const total = Math.max(current, target);
  if (total <= 0) return null;
  const { from, to } = DAY_BADGE.done;
  return (
    <div role="img" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => {
        const filled = index < current;
        return (
          <span
            key={index}
            aria-hidden
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
              filled ? "text-white" : "border border-black/25 bg-transparent dark:border-white/40"
            )}
            style={filled ? { backgroundImage: badgeGradient(from, to) } : undefined}
          >
            {filled ? <Check size={12} weight="bold" /> : null}
          </span>
        );
      })}
    </div>
  );
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
  done: { from: "#6dce3a", to: "#2f9a28" },
} as const;

function FocusMark({ focus, done, missed }: { focus: FocusArea; done: boolean; missed: boolean }) {
  if (done) {
    const { from, to } = DAY_BADGE.done;
    return (
      <div
        className="aqua-icon-badge flex size-6 shrink-0 items-center justify-center text-white"
        style={{ backgroundImage: badgeGradient(from, to) }}
        aria-hidden
      >
        <Check size={15} weight="bold" />
      </div>
    );
  }
  const Icon = FOCUS_ICON[focus];
  const { from, to } = DAY_BADGE[focus === "rest" ? "rest" : "workout"];
  return (
    <div
      className={cn(
        "aqua-icon-badge flex size-6 shrink-0 items-center justify-center text-white",
        missed && "opacity-40"
      )}
      style={{ backgroundImage: badgeGradient(from, to) }}
      aria-hidden
    >
      <Icon size={14} weight="fill" />
    </div>
  );
}

function ScheduleMonth({
  year,
  month,
  locale,
  narrowDayNames,
  todayKey,
  selectedDate,
  selectedWeek,
  isWindowsTheme,
  useGeneva,
  onSelect,
}: {
  year: number;
  month: number;
  locale: string;
  narrowDayNames: string[];
  todayKey: string;
  selectedDate: string;
  selectedWeek: Set<string>;
  isWindowsTheme: boolean;
  useGeneva: boolean;
  onSelect: (date: string) => void;
}) {
  const { isDarkMode } = useThemeFlags();
  const weekBand = accentMix(isDarkMode ? 22 : 15);
  const label = new Date(year, month, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  const weeks = mondayMonthGrid(year, month);
  return (
    <div data-schedule-month={`${year}-${String(month + 1).padStart(2, "0")}`}>
      <div className={cn("px-0.5 py-1 text-center text-[10px] font-semibold", useGeneva && "font-geneva-12")}>
        {label}
      </div>
      <div className="mb-0.5 grid grid-cols-7">
        {narrowDayNames.map((name, index) => (
          <div
            key={`${name}-${index}`}
            className={cn("text-center font-medium", useGeneva && "font-geneva-12")}
            style={{ opacity: 0.5, fontSize: 9 }}
          >
            {name}
          </div>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7">
          {week.map((cell, dayIndex) => {
            if (!cell) return <span key={dayIndex} className="h-[18px]" />;
            const isToday = cell.date === todayKey;
            const isSelected = cell.date === selectedDate;
            const inWeek = selectedWeek.has(cell.date);
            return (
              <button
                key={cell.date}
                type="button"
                data-date={cell.date}
                aria-label={formatLongDate(cell.date, locale)}
                aria-pressed={isSelected}
                aria-current={isToday ? "date" : undefined}
                onClick={() => onSelect(cell.date)}
                className={cn(
                  "flex h-[18px] items-center justify-center",
                  inWeek && dayIndex === 0 && "!rounded-l-full",
                  inWeek && dayIndex === 6 && "!rounded-r-full"
                )}
                style={inWeek ? { backgroundColor: weekBand } : undefined}
              >
                <span
                  className={cn(
                    "flex items-center justify-center text-[10px] leading-none",
                    useGeneva && "font-geneva-12",
                    isToday && "font-bold text-white",
                    isSelected && !isToday && "bg-black/15 dark:bg-white/20"
                  )}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: isToday ? (isWindowsTheme ? TODAY_RED_XP : TODAY_RED) : undefined,
                  }}
                >
                  {cell.day}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WeekTitle({
  isCurrent,
  title,
  range,
}: {
  isCurrent: boolean;
  title: string;
  range: string;
}) {
  if (!isCurrent) return <span className="min-w-0 truncate">{range}</span>;
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0">{title}</span>
      <span className={cn("truncate text-[11px] font-normal", FITNESS_MUTED_CLASS)}>{range}</span>
    </span>
  );
}

export function FitnessScheduleView({ l, isMobileLayout }: { l: FitnessLogic; isMobileLayout: boolean }) {
  const { t, locale, todayKey } = l;
  const { isDarkMode } = useThemeFlags();
  const store = useFitnessStore.getState();
  const [weekOffset, setWeekOffset] = useState(0);
  const [visibleMonths, setVisibleMonths] = useState(MONTH_STEP);
  const weekStart = addDays(startOfWeek(todayKey), weekOffset * 7);
  const days = useMemo(
    () => weekPlan(l.schedule, l.workouts, todayKey, weekStart),
    [l.schedule, l.workouts, todayKey, weekStart]
  );
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
  const recommendationRowRef = useHorizontalScrollFade<HTMLUListElement>(
    selected.focus === "rest" ? "" : recommendations.map((rec) => rec.id).join("\0")
  );
  const weekKey = days.map((day) => day.date).join("\0");
  const weekStripRef = useHorizontalScrollFade<HTMLDivElement>(
    isMobileLayout ? weekKey : "",
    "[data-strip-center]"
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
  const isCurrentWeek = weekOffset === 0;
  const weekRange = formatWeekRange(days[0].date, days[6].date, locale);
  const thisWeekLabel = t("apps.fitness.schedule.thisWeek");
  const selectedWeek = useMemo(() => new Set(weekDates(weekStart)), [weekStart]);
  const narrowDayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, index) => fmt.format(new Date(2024, 0, 8 + index)));
  }, [locale]);
  const months = useMemo(() => {
    const start = fromDateKey(todayKey);
    return Array.from({ length: visibleMonths }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }, [todayKey, visibleMonths]);
  const useGeneva = l.isMacOSTheme || l.isSystem7Theme;

  const selectDate = (date: string) => {
    setWeekOffset(Math.round(daysBetween(startOfWeek(todayKey), startOfWeek(date)) / 7));
    setSelectedDate(date);
  };

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
    <div className="flex size-full min-h-0 min-w-0 flex-col overflow-y-auto">
      <div className="flex min-w-0 flex-col divide-y divide-black/10 dark:divide-white/10">
        <section className="flex min-w-0 flex-col gap-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-[14px] font-bold">
              <WeekTitle isCurrent={isCurrentWeek} title={thisWeekLabel} range={weekRange} />
            </h2>
            <div className="flex-1" />
            <SmallSelect<ScheduleTemplateId | "">
              label={t("apps.fitness.schedule.template")}
              placeholder={t("apps.fitness.schedule.applyTemplate")}
              value={template}
              className="w-auto min-w-max shrink-0"
              onChange={(value) => {
                if (!value) return;
                setTemplate("");
                store.applyScheduleTemplate(value);
                toast.success(t("apps.fitness.toasts.templateApplied", { name: t(`apps.fitness.templates.${value}`) }));
              }}
              options={SCHEDULE_TEMPLATE_IDS.map((id) => ({ value: id, label: t(`apps.fitness.templates.${id}`) }))}
            />
          </div>

          <div
            ref={isMobileLayout ? weekStripRef : undefined}
            data-week-strip={isMobileLayout ? "" : undefined}
            className={cn(
              "gap-1.5",
              isMobileLayout
                ? "flex w-full min-w-0 snap-x snap-mandatory overflow-x-auto p-1"
                : "grid grid-cols-7"
            )}
          >
            {days.map((day, index) => (
              <div
                key={day.date}
                role="button"
                tabIndex={0}
                data-strip-center={day.isToday ? "" : undefined}
                onClick={() => setSelectedDate(day.date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedDate(day.date);
                }}
                aria-pressed={day.date === selected.date}
                className={cn(
                  FITNESS_CARD_CLASS,
                  "flex cursor-default flex-col items-center gap-1 p-1.5 text-center",
                  isMobileLayout && "w-[5.5rem] shrink-0 snap-center"
                )}
                style={{
                  ...(day.isToday
                    ? { backgroundColor: accentMix(isDarkMode ? 16 : 10) }
                    : null),
                  ...(day.date === selected.date
                    ? { boxShadow: `0 0 0 2px ${accentMix(70)}` }
                    : null),
                }}
              >
                <div className="flex w-full flex-col items-center leading-tight">
                  <span className={cn("whitespace-nowrap text-[10px] font-bold uppercase", day.isToday && "text-os-link")}>
                    {formatWeekdayShort(day.date, locale)}
                  </span>
                  <span className={cn("whitespace-nowrap text-[10px]", FITNESS_MUTED_CLASS)}>
                    {formatCompactDate(day.date, locale)}
                  </span>
                </div>
                <FocusMark
                  focus={day.focus}
                  done={day.completed}
                  missed={day.isPast && !day.completed && day.focus !== "rest"}
                />
                {day.completed ? (
                  <span className="sr-only">{t("apps.fitness.schedule.done")}</span>
                ) : day.isPast && day.focus !== "rest" ? (
                  <span className="sr-only">{t("apps.fitness.schedule.missed")}</span>
                ) : null}
                <div onClick={(e) => e.stopPropagation()} className="w-full">
                  <SmallSelect
                    label={t("apps.fitness.schedule.dayFocus", { day: formatWeekdayShort(day.date, locale) })}
                    value={day.focus}
                    className="h-5 w-full px-1 text-[10px]"
                    onChange={(focus) => {
                      if (isCurrentWeek) {
                        store.setScheduleDay(index, { focus });
                        return;
                      }
                      const id = store.ensureWorkout(day.date);
                      store.updateWorkout(id, { focus });
                    }}
                    options={FOCUS_AREAS.map((f) => ({ value: f, label: t(`apps.fitness.focus.${f}`) }))}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-2 px-3 py-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="text-[12px] font-bold">
                {t("apps.fitness.schedule.recommendedFor", {
                  focus: t(`apps.fitness.focus.${selected.focus}`),
                  day: formatWeekdayShort(selected.date, locale),
                })}
              </h3>
              {selected.focus !== "rest" ? (
                <p className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
                  {selected.focus === "cardio"
                    ? t("apps.fitness.schedule.cardioHint")
                    : t("apps.fitness.schedule.targets", {
                        muscles: FOCUS_MUSCLES[selected.focus]
                          .map((m) => t(`apps.fitness.muscles.${enumKey(m)}`))
                          .join(", "),
                      })}
                </p>
              ) : null}
            </div>
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
            <div className="text-[12px]">
              {t("apps.fitness.schedule.workoutsThisWeek", {
                current: weekly.current,
                target: weekly.target,
              })}
            </div>
            <WeeklyGoalMarks
              current={weekly.current}
              target={weekly.target}
              label={t("apps.fitness.schedule.workoutsThisWeek", {
                current: weekly.current,
                target: weekly.target,
              })}
            />
            <div className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
              {streak > 0
                ? t("apps.fitness.schedule.streak", { count: streak })
                : t("apps.fitness.schedule.noStreak")}
              {" · "}
              {t("apps.fitness.schedule.plannedDays", { count: planned })}
            </div>
      </section>
      </div>
      <Sidebar>
        <SidebarSection title={t("apps.fitness.schedule.upcomingWeeks")}>
          <div className="flex select-none flex-col gap-3">
            {months.map((month) => (
              <ScheduleMonth
                key={`${month.year}-${month.month}`}
                year={month.year}
                month={month.month}
                locale={locale}
                narrowDayNames={narrowDayNames}
                todayKey={todayKey}
                selectedDate={selected.date}
                selectedWeek={selectedWeek}
                isWindowsTheme={l.isWindowsTheme}
                useGeneva={useGeneva}
                onSelect={selectDate}
              />
            ))}
          </div>
          {visibleMonths < MONTH_LIMIT ? (
            <button
              type="button"
              className={cn(FITNESS_CHIP_CLASS, "self-start")}
              onClick={() => setVisibleMonths((count) => Math.min(MONTH_LIMIT, count + MONTH_STEP))}
            >
              {t("apps.fitness.schedule.moreMonths")}
            </button>
          ) : null}
        </SidebarSection>
      </Sidebar>
    </div>
  );
}
