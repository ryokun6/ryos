import { useMemo } from "react";
import type { TFunction } from "i18next";
import { ArrowsDownUp } from "@phosphor-icons/react";
import {
  Combobox,
  type ComboboxFilter,
  type ComboboxOption,
} from "@/components/ui/combobox";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  CONVERSION_CATEGORIES,
  type ConversionCategory,
  type ConversionCategoryId,
  type ConversionUnit,
} from "../utils/conversionData";
import { formatCalculatorDisplay } from "../utils/formatCalculatorDisplay";
import { CalculatorKey } from "./CalculatorKey";
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
  onSwap: () => void;
  onDigit: (digit: string) => void;
  onOperator: (operator: "+" | "-" | "*" | "/") => void;
  onEquals: () => void;
  onClear: () => void;
  onBackspace: () => void;
  onDecimal: () => void;
  onNegate: () => void;
  onPercent: () => void;
  t: TFunction;
}

function translatedUnitLabel(
  unit: ConversionUnit,
  categoryId: ConversionCategoryId,
  locale: string,
  t: TFunction
): string {
  if (categoryId === "currency") {
    try {
      return (
        new Intl.DisplayNames([locale], { type: "currency" }).of(unit.id) ??
        unit.id
      );
    } catch {
      return unit.id;
    }
  }
  return unit.labelKey.startsWith("apps.") ? t(unit.labelKey) : unit.labelKey;
}

function ConversionUnitCombobox({
  value,
  category,
  onChange,
  t,
}: {
  value: string;
  category: ConversionCategory;
  onChange: (categoryId: ConversionCategoryId, unitId: string) => void;
  t: TFunction;
}) {
  const locale = useLanguageStore((state) => state.current);
  const options = useMemo<ComboboxOption[]>(
    () =>
      CONVERSION_CATEGORIES.flatMap((conversionCategory) =>
        conversionCategory.units.map((unit) => {
          const label = translatedUnitLabel(
            unit,
            conversionCategory.id,
            locale,
            t
          );
          return {
            value: `${conversionCategory.id}:${unit.id}`,
            label,
            description: unit.id.toUpperCase(),
            category: conversionCategory.id,
            searchText: `${label} ${unit.id} ${t(conversionCategory.labelKey)}`.toLowerCase(),
          };
        })
      ),
    [locale, t]
  );
  const filters = useMemo<ComboboxFilter[]>(
    () =>
      CONVERSION_CATEGORIES.map((conversionCategory) => ({
        value: conversionCategory.id,
        label: t(conversionCategory.labelKey),
      })),
    [t]
  );
  const selected = category.units.find((unit) => unit.id === value);
  const displayValue = selected
    ? `${translatedUnitLabel(selected, category.id, locale, t)} · ${selected.id.toUpperCase()}`
    : value;

  return (
    <Combobox
      value={`${category.id}:${value}`}
      onChange={(nextValue) => {
        const separator = nextValue.indexOf(":");
        if (separator === -1) return;
        onChange(
          nextValue.slice(0, separator) as ConversionCategoryId,
          nextValue.slice(separator + 1)
        );
      }}
      options={options}
      displayValue={displayValue}
      searchPlaceholder={t("apps.calculator.conversion.selectUnit")}
      searchAriaLabel={t("apps.calculator.conversion.selectUnit")}
      filters={filters}
      filterValue={category.id}
      onFilterChange={(categoryId) =>
        onChange(categoryId as ConversionCategoryId, "")
      }
      minPanelWidth={260}
      maxListHeight={300}
      className="calc-conversion-unit-trigger"
    />
  );
}

function ConversionKeypad({
  theme,
  onDigit,
  onOperator,
  onEquals,
  onClear,
  onBackspace,
  onDecimal,
  onNegate,
  onPercent,
}: Pick<
  CalculatorConversionPanelProps,
  | "theme"
  | "onDigit"
  | "onOperator"
  | "onEquals"
  | "onClear"
  | "onBackspace"
  | "onDecimal"
  | "onNegate"
  | "onPercent"
>) {
  return (
    <div className="calc-conversion-keypad">
      <CalculatorKey label="⌫" onClick={onBackspace} theme={theme} variant="function" />
      <CalculatorKey label="AC" onClick={onClear} theme={theme} variant="function" />
      <CalculatorKey label="%" onClick={onPercent} theme={theme} variant="function" />
      <CalculatorKey label="÷" onClick={() => onOperator("/")} theme={theme} variant="operator" />
      <CalculatorKey label="7" onClick={() => onDigit("7")} theme={theme} />
      <CalculatorKey label="8" onClick={() => onDigit("8")} theme={theme} />
      <CalculatorKey label="9" onClick={() => onDigit("9")} theme={theme} />
      <CalculatorKey label="×" onClick={() => onOperator("*")} theme={theme} variant="operator" />
      <CalculatorKey label="4" onClick={() => onDigit("4")} theme={theme} />
      <CalculatorKey label="5" onClick={() => onDigit("5")} theme={theme} />
      <CalculatorKey label="6" onClick={() => onDigit("6")} theme={theme} />
      <CalculatorKey label="−" onClick={() => onOperator("-")} theme={theme} variant="operator" />
      <CalculatorKey label="1" onClick={() => onDigit("1")} theme={theme} />
      <CalculatorKey label="2" onClick={() => onDigit("2")} theme={theme} />
      <CalculatorKey label="3" onClick={() => onDigit("3")} theme={theme} />
      <CalculatorKey label="+" onClick={() => onOperator("+")} theme={theme} variant="operator" />
      <CalculatorKey label="±" onClick={onNegate} theme={theme} variant="function" />
      <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} />
      <CalculatorKey label="." onClick={onDecimal} theme={theme} />
      <CalculatorKey label="=" onClick={onEquals} theme={theme} variant="equals" />
    </div>
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
  onSwap,
  onDigit,
  onOperator,
  onEquals,
  onClear,
  onBackspace,
  onDecimal,
  onNegate,
  onPercent,
  t,
}: CalculatorConversionPanelProps) {
  const locale = useLanguageStore((state) => state.current);
  const selectUnit = (
    side: "from" | "to",
    categoryId: ConversionCategoryId,
    unitId: string
  ) => {
    if (categoryId !== category.id) {
      onCategoryChange(categoryId);
      const nextCategory =
        CONVERSION_CATEGORIES.find((candidate) => candidate.id === categoryId) ??
        category;
      const selectedUnit =
        unitId ||
        nextCategory.units[side === "from" ? 0 : 1]?.id ||
        nextCategory.units[0]?.id ||
        "";
      if (side === "from") onFromUnitChange(selectedUnit);
      else onToUnitChange(selectedUnit);
      return;
    }
    if (!unitId) return;
    if (side === "from") onFromUnitChange(unitId);
    else onToUnitChange(unitId);
  };

  return (
    <div className="calc-conversion-panel flex min-h-0 flex-1 flex-col">
      <div className="calc-display calc-conversion-lcd">
        <div className="calc-conversion-value-row">
          <div className="calc-display-value truncate">
            {formatCalculatorDisplay(amount, locale)}
          </div>
          <ConversionUnitCombobox
            value={fromUnit}
            category={category}
            onChange={(categoryId, unitId) =>
              selectUnit("from", categoryId, unitId)
            }
            t={t}
          />
        </div>

        <div className="calc-conversion-divider">
          <div className="calc-conversion-swap">
            <button
              type="button"
              className="calc-conversion-swap-button"
              onClick={onSwap}
              aria-label={t("apps.calculator.conversion.swap")}
            >
              <ArrowsDownUp size={16} weight="bold" aria-hidden />
            </button>
          </div>
        </div>

        <div className="calc-conversion-value-row">
          <div className="calc-display-value truncate">
            {loading ? "–" : result}
          </div>
          <ConversionUnitCombobox
            value={toUnit}
            category={category}
            onChange={(categoryId, unitId) =>
              selectUnit("to", categoryId, unitId)
            }
            t={t}
          />
        </div>
      </div>

      {error ? <p className="px-1 text-xs text-red-600">{error}</p> : null}

      <ConversionKeypad
        theme={theme}
        onDigit={onDigit}
        onOperator={onOperator}
        onEquals={onEquals}
        onClear={onClear}
        onBackspace={onBackspace}
        onDecimal={onDecimal}
        onNegate={onNegate}
        onPercent={onPercent}
      />
    </div>
  );
}
