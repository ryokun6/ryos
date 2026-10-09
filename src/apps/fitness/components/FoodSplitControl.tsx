import { useState } from "react";
import { InputDialog } from "@/components/dialogs/InputDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { FOOD_SPLIT_MAX, FOOD_SPLIT_MIN } from "../utils/foodSplit";
import { parseNumberInput } from "../utils/units";

const PRESETS = [1, 2, 3, 4] as const;

/**
 * Split dropdown beside the meal selector.
 * 1 keeps the whole meal. 2–4 divide by that many people.
 * Custom asks for a number and still divides the original meal.
 */
export function FoodSplitControl({
  people,
  onChange,
  t,
}: {
  people: number;
  onChange: (people: number) => void;
  t: FitnessLogic["t"];
}) {
  const label = t("apps.fitness.food.split");
  const custom = people > 4;
  const value = custom ? "custom" : String(people);
  const triggerLabel = custom
    ? t("apps.fitness.food.splitBadge", { count: people })
    : people === 1
      ? t("apps.fitness.food.splitNone")
      : t("apps.fitness.food.splitBadge", { count: people });

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);

  const openPrompt = () => {
    setPromptText(people > 1 ? String(people) : "");
    setPromptError(null);
    setPromptOpen(true);
  };

  const submitPrompt = (raw: string) => {
    const parsed = parseNumberInput(raw);
    const rounded = parsed == null ? NaN : Math.round(parsed);
    if (rounded < FOOD_SPLIT_MIN || rounded > FOOD_SPLIT_MAX) {
      setPromptError(t("apps.fitness.food.splitPromptInvalid"));
      return;
    }
    onChange(rounded);
    setPromptOpen(false);
  };

  return (
    <>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next === "custom") {
            openPrompt();
            return;
          }
          const count = Number(next);
          if (count >= 1 && count <= 4) onChange(count);
        }}
      >
        <SelectTrigger
          className="h-6 w-[110px] min-w-0 text-[11px]"
          aria-label={label}
          title={label}
          data-food-split={people}
        >
          <SelectValue>{triggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((count) => (
            <SelectItem key={count} value={String(count)} className="text-[12px]">
              {count === 1
                ? t("apps.fitness.food.splitNone")
                : t("apps.fitness.food.splitBadge", { count })}
            </SelectItem>
          ))}
          <SelectItem
            value="custom"
            className="text-[12px]"
            onPointerUp={(event) => {
              if (event.pointerType === "mouse") openPrompt();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openPrompt();
            }}
          >
            {t("apps.fitness.food.splitCustom")}
          </SelectItem>
        </SelectContent>
      </Select>
      <InputDialog
        isOpen={promptOpen}
        onOpenChange={setPromptOpen}
        onSubmit={submitPrompt}
        title={t("apps.fitness.food.splitPromptTitle")}
        description={t("apps.fitness.food.splitPromptHint")}
        value={promptText}
        onChange={(next) => {
          setPromptText(next);
          if (promptError) setPromptError(null);
        }}
        errorMessage={promptError}
        submitLabel={t("common.dialog.done")}
      />
    </>
  );
}
