import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { normalizeSplitPeople } from "../utils/foodSplit";
import { parseNumberInput } from "../utils/units";
import { FITNESS_INPUT_CLASS, FITNESS_MUTED_CLASS } from "./FitnessUi";

const PRESETS = [1, 2, 3, 4] as const;

/**
 * Compact 1 / 2 / 3 / 4 / custom people control.
 * 1 keeps the whole meal; 2+ logs your share.
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
  const custom = people > 4;
  const label = t("apps.fitness.food.split");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        data-food-split={people}
        className="inline-flex h-6 overflow-hidden rounded-md border border-black/15 dark:border-white/20"
      >
        {PRESETS.map((count) => {
          const selected = people === count;
          return (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={selected}
              data-state={selected ? "on" : "off"}
              onClick={() => onChange(count)}
              className={cn(
                "h-full min-w-6 border-l border-black/10 px-1.5 text-[11px] first:border-l-0 dark:border-white/15",
                selected
                  ? "bg-black/15 font-bold dark:bg-white/20"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              )}
            >
              {count}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          aria-label={t("apps.fitness.food.splitCustom")}
          data-state={custom ? "on" : "off"}
          onClick={() => onChange(people > 4 ? people : 5)}
          className={cn(
            "h-full border-l border-black/10 px-1.5 text-[11px] dark:border-white/15",
            custom
              ? "bg-black/15 font-bold dark:bg-white/20"
              : "hover:bg-black/5 dark:hover:bg-white/10"
          )}
        >
          {t("apps.fitness.food.splitCustom")}
        </button>
      </div>
      {custom ? (
        <SplitPeopleField
          people={people}
          label={t("apps.fitness.food.splitPeople")}
          onChange={onChange}
        />
      ) : null}
      {people > 1 ? (
        <span className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>
          {t("apps.fitness.food.splitWays", { count: people })}
        </span>
      ) : null}
    </div>
  );
}

function SplitPeopleField({
  people,
  label,
  onChange,
}: {
  people: number;
  label: string;
  onChange: (people: number) => void;
}) {
  const [text, setText] = useState(String(people));
  useEffect(() => setText(String(people)), [people]);
  const commit = () => {
    const parsed = parseNumberInput(text);
    const next = parsed == null ? people : normalizeSplitPeople(parsed);
    onChange(next);
    setText(String(next));
  };
  return (
    <Input
      inputMode="numeric"
      value={text}
      aria-label={label}
      title={label}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      className={cn(FITNESS_INPUT_CLASS, "w-12")}
    />
  );
}
