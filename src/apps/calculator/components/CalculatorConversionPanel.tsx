import type { TFunction } from "i18next";
import { ArrowsDownUp } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToolbarButton, ToolbarButtonGroup } from "@/components/ui/toolbar-button";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import {
  CONVERSION_CATEGORIES,
  type ConversionCategory,
  type ConversionUnit,
} from "../utils/conversionData";
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

function unitLabel(unit: ConversionUnit, t: TFunction): string {
  return unit.labelKey.startsWith("apps.")
    ? t(unit.labelKey, unit.id)
    : unit.labelKey;
}

function UnitSelect({
  value,
  units,
  onChange,
  t,
  className,
}: {
  value: string;
  units: ConversionUnit[];
  onChange: (unitId: string) => void;
  t: TFunction;
  className?: string;
}) {
  const selected = units.find((u) => u.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 shrink-0 text-xs", className)}>
        <SelectValue placeholder={t("apps.calculator.conversion.selectUnit", "Unit")}>
          {selected ? unitLabel(selected, t) : value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {units.map((unit) => (
          <SelectItem key={unit.id} value={unit.id}>
            {unitLabel(unit, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategorySelect({
  categoryId,
  onCategoryChange,
  t,
}: {
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
  t: TFunction;
}) {
  const selected = CONVERSION_CATEGORIES.find((c) => c.id === categoryId);

  return (
    <Select value={categoryId} onValueChange={onCategoryChange}>
      <SelectTrigger className="h-8 w-full text-xs">
        <SelectValue placeholder={t("apps.calculator.conversion.category", "Category")}>
          {selected ? t(selected.labelKey, selected.id) : categoryId}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CONVERSION_CATEGORIES.map((cat) => (
          <SelectItem key={cat.id} value={cat.id}>
            {t(cat.labelKey, cat.id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
  const { isMacOSTheme, isSystem7Theme } = useThemeFlags();

  const fieldLabelClass = cn(
    "text-xs text-os-text-secondary",
    isSystem7Theme && "font-bold text-black"
  );

  return (
    <div className="calc-conversion-panel flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex flex-col gap-1">
        <span className={fieldLabelClass}>
          {t("apps.calculator.conversion.category", "Category")}
        </span>
        <CategorySelect
          categoryId={category.id}
          onCategoryChange={onCategoryChange}
          t={t}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className={fieldLabelClass}>
          {t("apps.calculator.conversion.from", "From")}
        </span>
        <div className="flex gap-1 items-center">
          <Input
            className="h-8 flex-1 text-right font-mono text-sm"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            inputMode="decimal"
            aria-label={t("apps.calculator.conversion.amount", "Amount")}
          />
          <UnitSelect
            value={fromUnit}
            units={category.units}
            onChange={onFromUnitChange}
            t={t}
            className="w-[96px]"
          />
        </div>
      </div>

      <div className="flex justify-center py-0.5">
        {isMacOSTheme && theme === "aqua" ? (
          <ToolbarButtonGroup>
            <ToolbarButton className="calc-swap-btn gap-1 px-3" onClick={onSwap}>
              <ArrowsDownUp size={14} aria-hidden />
              {t("apps.calculator.conversion.swap", "Swap")}
            </ToolbarButton>
          </ToolbarButtonGroup>
        ) : (
          <Button
            type="button"
            variant={isMacOSTheme ? "secondary" : isSystem7Theme ? "player" : "default"}
            className={cn(
              "calc-swap-btn h-[24px] px-3 text-xs gap-1",
              theme === "win98" && "text-black"
            )}
            onClick={onSwap}
          >
            <ArrowsDownUp size={14} aria-hidden />
            {t("apps.calculator.conversion.swap", "Swap")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className={fieldLabelClass}>
          {t("apps.calculator.conversion.to", "To")}
        </span>
        <div className="flex gap-1 items-center">
          <Input
            readOnly
            tabIndex={-1}
            className={cn(
              "h-8 flex-1 text-right font-mono text-sm opacity-90",
              loading && "opacity-50"
            )}
            value={loading ? "…" : result}
            aria-label={t("apps.calculator.conversion.result", "Result")}
          />
          <UnitSelect
            value={toUnit}
            units={category.units}
            onChange={onToUnitChange}
            t={t}
            className="w-[96px]"
          />
        </div>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
