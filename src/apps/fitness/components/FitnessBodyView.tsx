import { useMemo, useState } from "react";
import { CaretRight, Plus, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import {
  ACTIVITY_LEVELS,
  BODY_MEASUREMENTS,
  type BodyMeasurement,
  type BodyStatEntry,
} from "../types";
import { DEFAULT_EXERCISE_FILTERS, filterExercises } from "../utils/exerciseLibrary";
import { formatShortDate } from "../utils/format";
import {
  bodyChange,
  bodySeries,
  sortedBodyStats,
  strengthGoalProgress,
  weightGoalProgress,
} from "../utils/goals";
import { loggedExerciseIds } from "../utils/progression";
import {
  cmToDisplay,
  displayToCm,
  displayToKg,
  kgToDisplay,
  lengthUnitLabel,
  parseNumberInput,
  tidy,
} from "../utils/units";
import {
  EmptyNote,
  FITNESS_INPUT_CLASS,
  FITNESS_MUTED_CLASS,
  LabeledField,
  LineChart,
  NumberField,
  ProgressBar,
  Section,
  SmallSelect,
} from "./FitnessUi";

type DraftField = "weight" | "bodyFat" | BodyMeasurement;
const EMPTY_DRAFT: Record<DraftField, string> = {
  weight: "",
  bodyFat: "",
  waistCm: "",
  chestCm: "",
  hipsCm: "",
  armCm: "",
  thighCm: "",
};

function MeasurementForm({ l, isMobileLayout }: { l: FitnessLogic; isMobileLayout: boolean }) {
  const { t, units } = l;
  const [date, setDate] = useState(l.todayKey);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const lengthUnit = lengthUnitLabel(units);

  const submit = () => {
    const weight = parseNumberInput(draft.weight);
    const bodyFat = parseNumberInput(draft.bodyFat);
    const entry: Omit<BodyStatEntry, "id" | "createdAt" | "updatedAt"> = {
      date,
      weightKg: weight == null ? null : displayToKg(weight, units),
      bodyFatPct: bodyFat,
      waistCm: null,
      chestCm: null,
      hipsCm: null,
      armCm: null,
      thighCm: null,
    };
    for (const field of BODY_MEASUREMENTS) {
      const value = parseNumberInput(draft[field]);
      entry[field] = value == null ? null : displayToCm(value, units);
    }
    const id = useFitnessStore.getState().addBodyStat(entry);
    if (id) {
      setDraft(EMPTY_DRAFT);
      setShowMeasurements(false);
      toast.success(t("apps.fitness.toasts.statsSaved"));
    } else {
      toast.error(t("apps.fitness.body.invalid"));
    }
  };

  const field = (key: DraftField, label: string) => (
    <LabeledField key={key} label={label}>
      <Input
        inputMode="decimal"
        value={draft[key]}
        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        className={cn(FITNESS_INPUT_CLASS, "w-full")}
      />
    </LabeledField>
  );

  return (
    <Section title={t("apps.fitness.body.logStats")}>
      <div className={cn("grid gap-2", isMobileLayout ? "grid-cols-2" : "grid-cols-3")}>
        <div className={cn(isMobileLayout && "col-span-2")}>
          <LabeledField label={t("apps.fitness.common.date")}>
            <Input
              type="date"
              value={date}
              max={l.todayKey}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className={cn(FITNESS_INPUT_CLASS, "w-full min-w-0")}
            />
          </LabeledField>
        </div>
        {field("weight", t("apps.fitness.body.weightWithUnit", { unit: l.weightUnit }))}
        {field("bodyFat", t("apps.fitness.body.bodyFatPct"))}
      </div>
      <div>
        <button
          type="button"
          className={cn("inline-flex items-center gap-1 text-[11px]", FITNESS_MUTED_CLASS)}
          aria-expanded={showMeasurements}
          onClick={() => setShowMeasurements((open) => !open)}
        >
          <CaretRight size={10} className={cn(showMeasurements && "rotate-90")} />
          {t("apps.fitness.body.moreDetails")}
        </button>
        {showMeasurements ? (
          <div className={cn("mt-2 grid gap-2", isMobileLayout ? "grid-cols-2" : "grid-cols-3")}>
            {BODY_MEASUREMENTS.map((m) =>
              field(m, t(`apps.fitness.body.measurements.${m}`, { unit: lengthUnit }))
            )}
          </div>
        ) : null}
      </div>
      <div>
        <Button size="sm" variant="default" onClick={submit} className="h-6 gap-1 text-[11px]">
          <Plus size={11} weight="bold" />
          {t("apps.fitness.body.save")}
        </Button>
      </div>
    </Section>
  );
}

function StrengthGoals({ l }: { l: FitnessLogic }) {
  const { t, units } = l;
  const store = useFitnessStore.getState();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const options = useMemo(() => {
    const logged = loggedExerciseIds(l.workouts);
    if (!query.trim()) return logged.slice(0, 6);
    const fromLibrary = filterExercises(l.exercises, { ...DEFAULT_EXERCISE_FILTERS, query })
      .slice(0, 6)
      .map((e) => ({ id: e.id, name: e.name }));
    return fromLibrary.length
      ? fromLibrary
      : logged.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  }, [query, l.exercises, l.workouts]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  const add = () => {
    const value = parseNumberInput(target);
    if (!picked || value == null || value <= 0) return;
    store.addStrengthGoal({ exerciseId: picked.id, name: picked.name, targetKg: displayToKg(value, units) });
    setPicked(null);
    setQuery("");
    setTarget("");
  };

  return (
    <div className="flex flex-col gap-2">
      {l.goals.strengthGoals.length ? (
        <ul className="flex flex-col gap-2">
          {l.goals.strengthGoals.map((goal) => {
            const progress = strengthGoalProgress(goal, l.workouts);
            return (
              <li key={goal.id} className="flex flex-col gap-1 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" className="truncate text-left hover:underline" onClick={() => l.openExercise(goal.exerciseId)}>
                    {goal.name}
                  </button>
                  <span className="flex shrink-0 items-center gap-1 text-[11px]">
                    {progress.current > 0 ? l.formatWeight(progress.current, 0) : "—"} /{" "}
                    {l.formatWeight(goal.targetKg, 0)}
                    {progress.achieved ? " 🏆" : ""}
                    <button
                      type="button"
                      className="inline-flex size-5 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/15"
                      onClick={() => store.removeStrengthGoal(goal.id)}
                      aria-label={t("apps.fitness.goals.removeGoal")}
                      title={t("apps.fitness.goals.removeGoal")}
                    >
                      <X size={10} />
                    </button>
                  </span>
                </div>
                <ProgressBar fraction={progress.fraction} label={goal.name} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>{t("apps.fitness.goals.noStrengthGoals")}</p>
      )}
      <div className="flex flex-col gap-1">
        {picked ? (
          <div className="flex items-center gap-1 text-[12px]">
            <span className="min-w-0 flex-1 truncate font-bold">{picked.name}</span>
            <Input
              inputMode="decimal"
              value={target}
              placeholder={t("apps.fitness.goals.targetOneRepMax", { unit: l.weightUnit })}
              aria-label={t("apps.fitness.goals.targetOneRepMax", { unit: l.weightUnit })}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              className={cn(FITNESS_INPUT_CLASS, "w-24")}
            />
            <Button size="sm" variant="default" className="h-6 text-[11px]" onClick={add}>
              {t("apps.fitness.goals.add")}
            </Button>
            <button type="button" className="text-[11px] opacity-60" onClick={() => setPicked(null)}>
              <X size={10} />
            </button>
          </div>
        ) : (
          <>
            <Input
              value={query}
              placeholder={t("apps.fitness.goals.findExercise")}
              aria-label={t("apps.fitness.goals.findExercise")}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(FITNESS_INPUT_CLASS, "w-full")}
            />
            {options.length ? (
              <div className="flex flex-wrap gap-1">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="rounded-full border border-black/15 px-2 py-0.5 text-[11px] hover:bg-black/10 dark:border-white/20 dark:hover:bg-white/15"
                    onClick={() => setPicked(option)}
                  >
                    + {option.name}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function FitnessBodyView({ l, isMobileLayout }: { l: FitnessLogic; isMobileLayout: boolean }) {
  const { t, locale, units, goals, profile, nutritionTargets: targets } = l;
  const store = useFitnessStore.getState();
  const weightSeries = useMemo(() => bodySeries(l.bodyStats, "weightKg"), [l.bodyStats]);
  const fatSeries = useMemo(() => bodySeries(l.bodyStats, "bodyFatPct"), [l.bodyStats]);
  const history = useMemo(() => sortedBodyStats(l.bodyStats).reverse(), [l.bodyStats]);
  const weightChange = bodyChange(l.bodyStats, "weightKg");
  const weightProgress = weightGoalProgress(goals, l.currentWeightKg);
  const lengthUnit = lengthUnitLabel(units);
  const kgValue = (kg: number | null) => (kg == null ? null : tidy(kgToDisplay(kg, units), 1));

  const formatEntry = (entry: BodyStatEntry) =>
    [
      entry.weightKg != null ? l.formatWeight(entry.weightKg) : null,
      entry.bodyFatPct != null ? `${tidy(entry.bodyFatPct, 1)}%` : null,
      ...BODY_MEASUREMENTS.map((m) =>
        entry[m] != null
          ? `${t(`apps.fitness.body.short.${m}`)} ${tidy(cmToDisplay(entry[m]!, units), 1)} ${lengthUnit}`
          : null
      ),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className={cn("grid size-full min-h-0 gap-3 overflow-y-auto p-3", isMobileLayout ? "grid-cols-1" : "grid-cols-[1fr_260px]")}>
      <div className="flex min-w-0 flex-col gap-3">
        <MeasurementForm l={l} isMobileLayout={isMobileLayout} />
        <Section
          title={t("apps.fitness.body.weightTrend")}
          actions={
            weightChange != null ? (
              <span className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
                {t("apps.fitness.body.change", {
                  value: `${weightChange > 0 ? "+" : ""}${l.formatWeight(weightChange)}`,
                })}
              </span>
            ) : null
          }
        >
          {weightSeries.length ? (
            <LineChart
              label={t("apps.fitness.body.weightTrend")}
              points={weightSeries}
              target={goals.targetWeightKg}
              formatValue={(v) => l.formatWeight(v)}
              formatDate={(d) => formatShortDate(d, locale)}
            />
          ) : (
            <EmptyNote>{t("apps.fitness.body.noWeight")}</EmptyNote>
          )}
          {fatSeries.length > 1 ? (
            <LineChart
              label={t("apps.fitness.body.bodyFatTrend")}
              points={fatSeries}
              height={80}
              formatValue={(v) => `${tidy(v, 1)}%`}
              formatDate={(d) => formatShortDate(d, locale)}
            />
          ) : null}
        </Section>
        <Section title={t("apps.fitness.body.history")}>
          {history.length ? (
            <ul className="flex flex-col text-[12px]">
              {history.slice(0, 30).map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 border-t border-black/5 py-1 first:border-t-0 dark:border-white/10">
                  <span className={cn("w-14 shrink-0", FITNESS_MUTED_CLASS)}>{formatShortDate(entry.date, locale)}</span>
                  <span className="min-w-0 flex-1 truncate">{formatEntry(entry)}</span>
                  <button
                    type="button"
                    className="inline-flex size-6 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/15"
                    onClick={() => store.deleteBodyStat(entry.id)}
                    aria-label={t("apps.fitness.common.delete")}
                    title={t("apps.fitness.common.delete")}
                  >
                    <Trash size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>{t("apps.fitness.body.noHistory")}</EmptyNote>
          )}
        </Section>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <Section title={t("apps.fitness.goals.title")}>
          <LabeledField label={t("apps.fitness.goals.targetWeight")}>
            <NumberField
              label={t("apps.fitness.goals.targetWeight")}
              value={kgValue(goals.targetWeightKg)}
              suffix={l.weightUnit}
              onCommit={(v) => store.setGoals({ targetWeightKg: v == null ? null : displayToKg(v, units) })}
            />
          </LabeledField>
          {weightProgress ? (
            <div className="flex flex-col gap-1 text-[11px]">
              <ProgressBar fraction={weightProgress.fraction} label={t("apps.fitness.goals.targetWeight")} />
              <span className={FITNESS_MUTED_CLASS}>
                {weightProgress.achieved
                  ? t("apps.fitness.goals.reached")
                  : t("apps.fitness.goals.toGo", {
                      value: l.formatWeight(Math.abs(weightProgress.target - weightProgress.current)),
                    })}
              </span>
            </div>
          ) : goals.targetWeightKg != null ? (
            <p className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>{t("apps.fitness.goals.logWeightFirst")}</p>
          ) : null}
          <LabeledField label={t("apps.fitness.goals.weeklyTarget")}>
            <SmallSelect
              label={t("apps.fitness.goals.weeklyTarget")}
              value={String(goals.weeklyWorkoutTarget)}
              onChange={(value) => store.setGoals({ weeklyWorkoutTarget: Number(value) })}
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                value: String(n),
                label: t("apps.fitness.goals.perWeek", { count: n }),
              }))}
            />
          </LabeledField>
          <div className="text-[11px] font-bold">{t("apps.fitness.goals.strength")}</div>
          <StrengthGoals l={l} />
        </Section>

        <Section title={t("apps.fitness.profile.title")}>
          <div className="grid grid-cols-2 gap-2">
            <LabeledField label={t("apps.fitness.profile.sex")}>
              <SmallSelect
                label={t("apps.fitness.profile.sex")}
                value={profile.sex}
                onChange={(sex) => store.setProfile({ sex })}
                options={[
                  { value: "male", label: t("apps.fitness.profile.male") },
                  { value: "female", label: t("apps.fitness.profile.female") },
                ]}
              />
            </LabeledField>
            <LabeledField label={t("apps.fitness.profile.birthYear")}>
              <NumberField
                label={t("apps.fitness.profile.birthYear")}
                value={profile.birthYear}
                onCommit={(v) => store.setProfile({ birthYear: v == null ? null : Math.round(v) })}
              />
            </LabeledField>
            <LabeledField label={t("apps.fitness.profile.height")}>
              <NumberField
                label={t("apps.fitness.profile.height")}
                value={profile.heightCm == null ? null : tidy(cmToDisplay(profile.heightCm, units), 1)}
                suffix={lengthUnit}
                onCommit={(v) => store.setProfile({ heightCm: v == null ? null : displayToCm(v, units) })}
              />
            </LabeledField>
            <LabeledField label={t("apps.fitness.profile.activity")}>
              <SmallSelect
                label={t("apps.fitness.profile.activity")}
                value={profile.activityLevel}
                onChange={(activityLevel) => store.setProfile({ activityLevel })}
                options={ACTIVITY_LEVELS.map((a) => ({ value: a, label: t(`apps.fitness.profile.activityLevels.${a}`) }))}
              />
            </LabeledField>
          </div>
        </Section>

        <Section title={t("apps.fitness.nutrition.targets")}>
          <p className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
            {targets.isPersonalized
              ? t("apps.fitness.nutrition.personalized", {
                  tdee: targets.tdee ?? 0,
                  direction: t(`apps.fitness.nutrition.direction.${targets.direction}`),
                })
              : t("apps.fitness.nutrition.defaults")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["calories", t("apps.fitness.nutrition.calories"), "kcal"],
                ["proteinG", t("apps.fitness.nutrition.protein"), "g"],
                ["carbsG", t("apps.fitness.nutrition.carbs"), "g"],
                ["fatG", t("apps.fitness.nutrition.fat"), "g"],
              ] as const
            ).map(([key, label, unit]) => (
              <LabeledField key={key} label={label}>
                <NumberField
                  label={label}
                  value={goals.nutrition[key]}
                  placeholder={String(targets[key])}
                  suffix={unit}
                  onCommit={(v) => store.setGoals({ nutrition: { ...goals.nutrition, [key]: v } })}
                />
              </LabeledField>
            ))}
          </div>
          <p className={cn("text-[10px]", FITNESS_MUTED_CLASS)}>{t("apps.fitness.nutrition.overrideHint")}</p>
        </Section>
      </div>
    </div>
  );
}
