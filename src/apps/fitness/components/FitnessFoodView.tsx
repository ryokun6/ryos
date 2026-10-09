import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CaretLeft, CaretRight, PencilSimple, Sparkle, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OsTextarea } from "@/components/ui/os-textarea";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { cn } from "@/lib/utils";
import { useFitnessStore } from "@/stores/useFitnessStore";
import { FOOD_MAX_ITEMS, FOOD_TEXT_MAX_LENGTH, sumFoodNutrients, type FoodItem } from "@/shared/fitness";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { MEALS, type FoodEntry, type Meal } from "../types";
import { addDays } from "../utils/dates";
import { analyzeFood, FitnessApiError } from "../utils/foodApi";
import { formatLongDate, formatNumber, formatShortDate } from "../utils/format";
import { prepareFoodPhoto, type PreparedFoodPhoto } from "../utils/image";
import {
  addFoodSplitItem,
  changeFoodSplit,
  foodSplitForPersist,
  foodSplitFromEntry,
  foodSplitFromItems,
  patchFoodSplitItem,
  removeFoodSplitItem,
} from "../utils/foodSplit";
import {
  dailyTotals,
  entriesByMeal,
  entryTotals,
  mealForHour,
  nutritionHistory,
  targetProgress,
} from "../utils/nutrition";
import { FoodSplitControl } from "./FoodSplitControl";
import {
  EmptyNote,
  FITNESS_CHIP_CLASS,
  FITNESS_INPUT_CLASS,
  FITNESS_MUTED_CLASS,
  NumberField,
  ProgressBar,
  Section,
  Sidebar,
  SidebarSection,
  SmallSelect,
} from "./FitnessUi";

const ICON_BUTTON_CLASS =
  "inline-flex size-6 items-center justify-center rounded hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/15";

const MACROS = [
  { key: "calories", unit: "kcal" },
  { key: "proteinG", unit: "g" },
  { key: "carbsG", unit: "g" },
  { key: "fatG", unit: "g" },
] as const;

interface FoodDraft {
  editingId: string | null;
  name: string;
  meal: Meal;
  /** Your share, shown in the editor and saved as the logged amount. */
  items: FoodItem[];
  /** Full meal. Split changes divide this instead of the current share. */
  baseItems: FoodItem[];
  splitPeople: number;
  source: "ai" | "manual";
  confidence: number | null;
  notes: string | null;
}

const blankItem = (): FoodItem => ({ name: "", portion: "", calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

function macroLabel(t: FitnessLogic["t"], key: (typeof MACROS)[number]["key"]) {
  return t(
    key === "calories"
      ? "apps.fitness.nutrition.calories"
      : key === "proteinG"
        ? "apps.fitness.nutrition.protein"
        : key === "carbsG"
          ? "apps.fitness.nutrition.carbs"
          : "apps.fitness.nutrition.fat"
  );
}

function DraftEditor({
  l,
  draft,
  setDraft,
  photo,
  onSave,
  onCancel,
}: {
  l: FitnessLogic;
  draft: FoodDraft;
  setDraft: (updater: (prev: FoodDraft) => FoodDraft) => void;
  photo: PreparedFoodPhoto | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = l;
  const totals = sumFoodNutrients(draft.items);
  const shared = draft.splitPeople > 1;
  const updateItem = (index: number, patch: Partial<FoodItem>) =>
    setDraft((prev) => ({ ...prev, ...patchFoodSplitItem(prev, index, patch) }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        {photo ? (
          <img src={photo.previewUrl} alt="" className="size-16 shrink-0 rounded-md object-cover" />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Input
            value={draft.name}
            placeholder={t("apps.fitness.food.entryName")}
            aria-label={t("apps.fitness.food.entryName")}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            className={cn(FITNESS_INPUT_CLASS, "w-full font-bold")}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <SmallSelect
              label={t("apps.fitness.food.meal")}
              value={draft.meal}
              className="w-[110px]"
              onChange={(meal) => setDraft((prev) => ({ ...prev, meal }))}
              options={MEALS.map((m) => ({ value: m, label: t(`apps.fitness.meals.${m}`) }))}
            />
            <FoodSplitControl
              people={draft.splitPeople}
              t={t}
              onChange={(people) => setDraft((prev) => ({ ...prev, ...changeFoodSplit(prev, people) }))}
            />
            {draft.source === "ai" && draft.confidence != null ? (
              <span className={cn(FITNESS_CHIP_CLASS, "inline-flex items-center gap-1")}>
                <Sparkle size={10} weight="fill" />
                {t("apps.fitness.food.confidence", { value: Math.round(draft.confidence * 100) })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {draft.notes ? <p className={cn("text-[11px] italic", FITNESS_MUTED_CLASS)}>{draft.notes}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-[12px]">
          <thead>
            <tr className={cn("text-left text-[10px]", FITNESS_MUTED_CLASS)}>
              <th className="font-normal">{t("apps.fitness.food.item")}</th>
              <th className="font-normal">{t("apps.fitness.food.portion")}</th>
              {MACROS.map((m) => (
                <th key={m.key} className="font-normal">
                  {macroLabel(t, m.key)}
                </th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, index) => (
              <tr key={index}>
                <td className="py-0.5 pr-1">
                  <Input
                    value={item.name}
                    aria-label={t("apps.fitness.food.item")}
                    onChange={(e) => updateItem(index, { name: e.target.value })}
                    className={cn(FITNESS_INPUT_CLASS, "w-full min-w-[90px]")}
                  />
                </td>
                <td className="py-0.5 pr-1">
                  <Input
                    value={item.portion}
                    aria-label={t("apps.fitness.food.portion")}
                    onChange={(e) => updateItem(index, { portion: e.target.value })}
                    className={cn(FITNESS_INPUT_CLASS, "w-full min-w-[70px]")}
                  />
                </td>
                {MACROS.map((m) => (
                  <td key={m.key} className="py-0.5 pr-1">
                    <NumberField
                      label={macroLabel(t, m.key)}
                      value={item[m.key]}
                      onCommit={(v) => updateItem(index, { [m.key]: v ?? 0 })}
                      className="[&_input]:w-14"
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className={ICON_BUTTON_CLASS}
                    onClick={() => setDraft((prev) => ({ ...prev, ...removeFoodSplitItem(prev, index) }))}
                    aria-label={t("apps.fitness.food.removeItem")}
                    title={t("apps.fitness.food.removeItem")}
                  >
                    <X size={12} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-black/10 font-bold dark:border-white/10">
              <td className="py-1" colSpan={2}>
                {shared ? t("apps.fitness.food.splitShare") : t("apps.fitness.food.total")}
              </td>
              {MACROS.map((m) => (
                <td key={m.key} className="py-1">
                  {formatNumber(totals[m.key], locale, 1)}
                  <span className="ml-0.5 text-[10px] font-normal opacity-60">{m.unit}</span>
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-6 text-[11px]"
          disabled={draft.items.length >= FOOD_MAX_ITEMS * 2}
          onClick={() => setDraft((prev) => ({ ...prev, ...addFoodSplitItem(prev, blankItem()) }))}
        >
          {t("apps.fitness.food.addItem")}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" className="h-6 text-[11px]" onClick={onCancel}>
          {t("apps.fitness.common.cancel")}
        </Button>
        <Button
          size="sm"
          variant="default"
          className="h-6 text-[11px]"
          disabled={!draft.items.some((item) => item.name.trim())}
          onClick={onSave}
        >
          {draft.editingId ? t("apps.fitness.food.update") : t("apps.fitness.food.saveToLog")}
        </Button>
      </div>
      {draft.source === "ai" ? (
        <p className={cn("text-[10px]", FITNESS_MUTED_CLASS)}>{t("apps.fitness.food.aiDisclaimer")}</p>
      ) : null}
    </div>
  );
}

function describeAiError(t: FitnessLogic["t"], error: unknown): string {
  if (error instanceof FitnessApiError) {
    if (error.status === 429) return t("apps.fitness.food.errors.rateLimited");
    if (error.status === 413) return t("apps.fitness.food.errors.tooLarge");
    if (error.status === 400) return t("apps.fitness.food.errors.invalid");
  }
  return t("apps.fitness.food.errors.generic");
}

export function FitnessFoodView({ l, isMobileLayout }: { l: FitnessLogic; isMobileLayout: boolean }) {
  const { t, locale, foodDate, setFoodDate, nutritionTargets: targets } = l;
  const store = useFitnessStore.getState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<PreparedFoodPhoto | null>(null);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "preparing" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraftState] = useState<FoodDraft | null>(null);
  const setDraft = (updater: (prev: FoodDraft) => FoodDraft) =>
    setDraftState((prev) => (prev ? updater(prev) : prev));

  useEffect(() => () => abortRef.current?.abort(), []);

  const totals = useMemo(() => dailyTotals(l.foodEntries, foodDate), [l.foodEntries, foodDate]);
  const byMeal = useMemo(() => entriesByMeal(l.foodEntries, foodDate), [l.foodEntries, foodDate]);
  const history = useMemo(() => nutritionHistory(l.foodEntries).slice(0, 14), [l.foodEntries]);

  const reset = () => {
    abortRef.current?.abort();
    setPhoto(null);
    setDescription("");
    setDraftState(null);
    setError(null);
    setStatus("idle");
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStatus("preparing");
    try {
      setPhoto(await prepareFoodPhoto(file));
    } catch {
      setError(t("apps.fitness.food.errors.photo"));
    } finally {
      setStatus("idle");
    }
  };

  const analyze = async () => {
    if (!photo && !description.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStatus("analyzing");
    try {
      const result = await analyzeFood(
        {
          image: photo ? { mediaType: "image/jpeg", data: photo.base64 } : undefined,
          text: description.trim() || undefined,
          locale,
        },
        controller.signal
      );
      if (!result.isFood || result.items.length === 0) {
        setError(t("apps.fitness.food.errors.notFood"));
        return;
      }
      setDraftState({
        editingId: null,
        name: result.title,
        meal: mealForHour(new Date().getHours()),
        ...foodSplitFromItems(result.items),
        source: "ai",
        confidence: result.confidence,
        notes: result.notes,
      });
    } catch (err) {
      if (!controller.signal.aborted) setError(describeAiError(t, err));
    } finally {
      if (abortRef.current === controller) setStatus("idle");
    }
  };

  const startManual = () => {
    setError(null);
    setDraftState({
      editingId: null,
      name: description.trim().slice(0, 120),
      meal: mealForHour(new Date().getHours()),
      ...foodSplitFromItems([{ ...blankItem(), name: description.trim().slice(0, 80) }]),
      source: "manual",
      confidence: null,
      notes: null,
    });
  };

  const editEntry = (entry: FoodEntry) => {
    setPhoto(null);
    setError(null);
    setDraftState({
      editingId: entry.id,
      name: entry.name,
      meal: entry.meal,
      ...foodSplitFromEntry(entry),
      source: entry.source,
      confidence: null,
      notes: null,
    });
  };

  const save = () => {
    if (!draft) return;
    const persisted = foodSplitForPersist(draft);
    const name = draft.name.trim() || persisted.items[0]?.name || "";
    if (!persisted.items.length) return;
    if (draft.editingId) {
      store.updateFoodEntry(draft.editingId, {
        name,
        meal: draft.meal,
        items: persisted.items,
        baseItems: persisted.baseItems,
        splitPeople: persisted.splitPeople,
      });
    } else {
      const id = store.addFoodEntry({
        date: foodDate,
        meal: draft.meal,
        name,
        items: persisted.items,
        baseItems: persisted.baseItems,
        splitPeople: persisted.splitPeople,
        source: draft.source,
        thumbnail: photo?.thumbnailUrl ?? null,
      });
      if (!id) {
        toast.error(t("apps.fitness.food.errors.invalid"));
        return;
      }
    }
    toast.success(t("apps.fitness.toasts.foodSaved", { name }));
    reset();
  };

  const busy = status !== "idle";

  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={() => setFoodDate(addDays(foodDate, -1))}
            aria-label={t("apps.fitness.common.previousDay")}
            title={t("apps.fitness.common.previousDay")}
          >
            <CaretLeft size={14} />
          </button>
          <h2 className="text-[14px] font-bold">{formatLongDate(foodDate, locale)}</h2>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={() => setFoodDate(addDays(foodDate, 1))}
            aria-label={t("apps.fitness.common.nextDay")}
            title={t("apps.fitness.common.nextDay")}
          >
            <CaretRight size={14} />
          </button>
          {foodDate !== l.todayKey ? (
            <button type="button" className={FITNESS_CHIP_CLASS} onClick={() => setFoodDate(l.todayKey)}>
              {t("apps.fitness.common.today")}
            </button>
          ) : null}
        </div>

        <Section>
          <div
            className={cn(
              "grid gap-x-4 gap-y-2",
              isMobileLayout ? "grid-cols-2" : "grid-cols-4"
            )}
          >
            {MACROS.map((m) => {
              const consumed = totals[m.key];
              const target = targets[m.key];
              const progress = targetProgress(consumed, target);
              return (
                <div key={m.key} className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-col items-start gap-0.5 text-[11px]">
                    <span className={FITNESS_MUTED_CLASS}>{macroLabel(t, m.key)}</span>
                    <span className="whitespace-nowrap">
                      <span className="text-[13px] font-bold">{formatNumber(consumed, locale)}</span>
                      <span className="opacity-60">
                        {" "}
                        / {formatNumber(target, locale)} {m.unit}
                      </span>
                    </span>
                  </div>
                  <ProgressBar fraction={progress} over={progress > 1.05} label={macroLabel(t, m.key)} />
                </div>
              );
            })}
          </div>
          <p className={cn("text-[10px]", FITNESS_MUTED_CLASS)}>
            {totals.calories <= targets.calories
              ? t("apps.fitness.food.remaining", { value: formatNumber(targets.calories - totals.calories, locale) })
              : t("apps.fitness.food.over", { value: formatNumber(totals.calories - targets.calories, locale) })}
          </p>
        </Section>

        <Section title={draft ? t("apps.fitness.food.review") : t("apps.fitness.food.addFood")}>
          {draft ? (
            <DraftEditor l={l} draft={draft} setDraft={setDraft} photo={photo} onSave={save} onCancel={reset} />
          ) : (
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="flex items-start gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="!size-20 shrink-0 flex-col gap-1 !p-0 text-[10px]"
                  aria-label={t("apps.fitness.food.addPhoto")}
                  title={t("apps.fitness.food.addPhoto")}
                >
                  {photo ? (
                    <img src={photo.previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : status === "preparing" ? (
                    <ActivityIndicator size="sm" />
                  ) : (
                    <>
                      <Camera size={20} />
                      {t("apps.fitness.food.photo")}
                    </>
                  )}
                </Button>
                <OsTextarea
                  value={description}
                  maxLength={FOOD_TEXT_MAX_LENGTH}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("apps.fitness.food.describePlaceholder")}
                  aria-label={t("apps.fitness.food.describePlaceholder")}
                  className="h-20 min-w-0 flex-1 resize-none text-[12px]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {photo ? (
                  <Button size="sm" variant="secondary" className="h-6 text-[11px]" onClick={() => setPhoto(null)} disabled={busy}>
                    {t("apps.fitness.food.removePhoto")}
                  </Button>
                ) : null}
                <div className="flex-1" />
                {status === "analyzing" ? (
                  <span className={cn("flex items-center gap-1 text-[11px]", FITNESS_MUTED_CLASS)}>
                    <ActivityIndicator size="xs" />
                    {t("apps.fitness.food.analyzing")}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 text-[11px]"
                  onClick={startManual}
                  disabled={busy}
                >
                  {t("apps.fitness.food.manual")}
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-[11px]"
                  disabled={busy || (!photo && !description.trim())}
                  onClick={() => void analyze()}
                >
                  {t("apps.fitness.food.analyze")}
                </Button>
              </div>
              {error ? <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
            </div>
          )}
        </Section>

        {MEALS.map((meal) =>
          byMeal[meal].length ? (
            <Section
              key={meal}
              title={t(`apps.fitness.meals.${meal}`)}
              actions={
                <span className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
                  {formatNumber(sumFoodNutrients(byMeal[meal].flatMap((e) => e.items)).calories, locale)} kcal
                </span>
              }
            >
              <ul className="flex flex-col gap-1">
                {byMeal[meal].map((entry) => {
                  const entryTotal = entryTotals(entry);
                  return (
                    <li key={entry.id} className="flex items-center gap-2 text-[12px]">
                      {entry.thumbnail ? (
                        <img src={entry.thumbnail} alt="" className="size-9 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="flex size-9 shrink-0 items-center justify-center rounded bg-black/5 text-[16px] dark:bg-white/10" aria-hidden>
                          🍽️
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="truncate">{entry.name}</span>
                          {entry.splitPeople && entry.splitPeople > 1 ? (
                            <span
                              className={cn(
                                FITNESS_CHIP_CLASS,
                                "shrink-0 px-1.5 py-0 text-[10px] hover:bg-transparent dark:hover:bg-transparent"
                              )}
                              title={t("apps.fitness.food.splitWays", { count: entry.splitPeople })}
                              aria-label={t("apps.fitness.food.splitWays", { count: entry.splitPeople })}
                              data-food-split={entry.splitPeople}
                            >
                              {entry.splitPeople === 2
                                ? t("apps.fitness.food.splitBadge", { count: entry.splitPeople })
                                : t("apps.fitness.food.splitWays", { count: entry.splitPeople })}
                            </span>
                          ) : null}
                          {entry.source === "ai" ? <Sparkle size={10} weight="fill" className="shrink-0 opacity-50" /> : null}
                        </div>
                        <div className="truncate text-[10px] opacity-60">
                          {t("apps.fitness.food.macroSummary", {
                            calories: formatNumber(entryTotal.calories, locale),
                            protein: formatNumber(entryTotal.proteinG, locale),
                            carbs: formatNumber(entryTotal.carbsG, locale),
                            fat: formatNumber(entryTotal.fatG, locale),
                          })}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={ICON_BUTTON_CLASS}
                        onClick={() => editEntry(entry)}
                        aria-label={t("apps.fitness.common.edit")}
                        title={t("apps.fitness.common.edit")}
                      >
                        <PencilSimple size={12} />
                      </button>
                      <button
                        type="button"
                        className={ICON_BUTTON_CLASS}
                        onClick={() => store.deleteFoodEntry(entry.id)}
                        aria-label={t("apps.fitness.common.delete")}
                        title={t("apps.fitness.common.delete")}
                      >
                        <Trash size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null
        )}
        {MEALS.every((meal) => byMeal[meal].length === 0) ? <EmptyNote>{t("apps.fitness.food.empty")}</EmptyNote> : null}
      </div>
      </div>

      <Sidebar>
        <SidebarSection title={t("apps.fitness.food.history")}>
          {history.length ? (
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {history.map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    data-selected={day.date === foodDate ? "true" : undefined}
                    onClick={() => setFoodDate(day.date)}
                    className="flex w-full flex-col gap-0.5 rounded px-1 py-0.5 text-left"
                  >
                    <span className="flex justify-between gap-2">
                      <span>{formatShortDate(day.date, locale)}</span>
                      <span className="text-[11px] opacity-70">
                        {formatNumber(day.totals.calories, locale)} / {formatNumber(targets.calories, locale)}
                      </span>
                    </span>
                    <ProgressBar
                      fraction={targetProgress(day.totals.calories, targets.calories)}
                      over={day.totals.calories > targets.calories * 1.05}
                      className="h-1.5"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>{t("apps.fitness.food.noHistory")}</EmptyNote>
          )}
          <p className={cn("text-[10px]", FITNESS_MUTED_CLASS)}>
            {targets.isPersonalized ? t("apps.fitness.food.targetsFromProfile") : t("apps.fitness.food.targetsDefault")}{" "}
            <button type="button" className="text-os-link underline" onClick={() => l.setView("body")}>
              {t("apps.fitness.food.editTargets")}
            </button>
          </p>
        </SidebarSection>
      </Sidebar>
    </div>
  );
}
