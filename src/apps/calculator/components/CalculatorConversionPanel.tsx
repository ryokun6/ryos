import type { TFunction } from "i18next";
import { cn } from "@/lib/utils";
import type { ConversionCategory } from "../utils/conversionData";
import type { CalculatorTheme } from "./types";

interface CalculatorConversionPanelProps {
  theme: CalculatorTheme;
  category: ConversionCategory;
  fromUnit: string;
  toUnit: string;
  amount: string;
  result: string;
  loading: boolean;
  error: string | null;
  onCategoryChange: (categoryId: string) => void;
  onFromUnitChange: (unitId: string) => void;
  onToUnitChange: (unitId: string) => void;
  onAmountChange: (value: string) => void;
  onSwap: () => void;
  t: TFunction;
}

export function CalculatorConversionPanel({
  theme,
  category,
  fromUnit,
  toUnit,
  amount,
  result,
  loading,
  error,
  onCategoryChange,
  onFromUnitChange,
  onToUnitChange,
  onAmountChange,
  onSwap,
  t,
}: CalculatorConversionPanelProps) {
  const selectClass = cn(
    "w-full border px-1 py-0.5 bg-os-input-bg text-os-text-primary",
    theme === "system7" && "rounded-none border-black",
    theme === "aqua" && "rounded-md border-black/30",
    (theme === "win98" || theme === "xp") && "rounded-none border-neutral-500"
  );

  const inputClass = cn(
    "w-full border px-2 py-1 text-right bg-os-input-bg text-os-text-primary font-mono",
    theme === "system7" && "rounded-none border-black",
    theme === "aqua" && "rounded-md border-black/30 text-lg",
    (theme === "win98" || theme === "xp") && "rounded-none border-neutral-500"
  );

  return (
    <div className="calc-conversion-panel flex flex-col gap-2 flex-1">
      <label className="flex flex-col gap-0.5 text-xs">
        <span>{t("apps.calculator.conversion.category", "Category")}</span>
        <select
          className={selectClass}
          value={category.id}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          {[
            "length",
            "area",
            "volume",
            "mass",
            "temperature",
            "speed",
            "time",
            "pressure",
            "energy",
            "currency",
          ].map((id) => (
            <option key={id} value={id}>
              {t(`apps.calculator.conversion.categories.${id}`, id)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-0.5 text-xs">
        <span>{t("apps.calculator.conversion.from", "From")}</span>
        <div className="flex gap-1 items-center">
          <input
            className={inputClass}
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            inputMode="decimal"
          />
          <select
            className={cn(selectClass, "w-auto min-w-[88px]")}
            value={fromUnit}
            onChange={(e) => onFromUnitChange(e.target.value)}
          >
            {category.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.labelKey.startsWith("apps.")
                  ? t(unit.labelKey, unit.id)
                  : unit.labelKey}
              </option>
            ))}
          </select>
        </div>
      </label>

      <div className="flex justify-center">
        <button
          type="button"
          className={cn(
            "calc-key px-3 py-0.5 text-xs",
            theme === "aqua" && "rounded-md",
            theme === "system7" && "border border-black bg-white",
            (theme === "win98" || theme === "xp") && "border border-neutral-500 bg-[#c0c0c0]"
          )}
          onClick={onSwap}
        >
          ⇅ {t("apps.calculator.conversion.swap", "Swap")}
        </button>
      </div>

      <label className="flex flex-col gap-0.5 text-xs">
        <span>{t("apps.calculator.conversion.to", "To")}</span>
        <div className="flex gap-1 items-center">
          <div
            className={cn(
              inputClass,
              "flex-1 min-h-[32px] flex items-center justify-end opacity-90",
              loading && "opacity-50"
            )}
          >
            {loading ? "…" : result}
          </div>
          <select
            className={cn(selectClass, "w-auto min-w-[88px]")}
            value={toUnit}
            onChange={(e) => onToUnitChange(e.target.value)}
          >
            {category.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.labelKey.startsWith("apps.")
                  ? t(unit.labelKey, unit.id)
                  : unit.labelKey}
              </option>
            ))}
          </select>
        </div>
      </label>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
