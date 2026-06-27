import { cn } from "@/lib/utils";
import { CalculatorBasicPanel } from "./CalculatorBasicPanel";
import { CalculatorConversionPanel } from "./CalculatorConversionPanel";
import { CalculatorDisplay } from "./CalculatorKey";
import { CalculatorScientificPanel } from "./CalculatorScientificPanel";
import type { CalculatorTheme } from "./types";
import type { useCalculatorLogic } from "../hooks/useCalculatorLogic";

type CalculatorLogic = ReturnType<typeof useCalculatorLogic>;

interface CalculatorBodyProps {
  logic: CalculatorLogic;
}

export function CalculatorBody({ logic }: CalculatorBodyProps) {
  const {
    calculatorTheme,
    mode,
    calcState,
    t,
    pressDigit,
    pressOperator,
    pressEquals,
    pressClear,
    pressClearEntry,
    pressBackspace,
    pressDecimal,
    pressNegate,
    pressPercent,
    pressUnary,
    pressPi,
    pressE,
    pressFactorial,
    pressToggleAngle,
    pressMemoryClear,
    pressMemoryRecall,
    pressMemoryAdd,
    pressMemorySubtract,
    conversionCategory,
    handleCategoryChange,
    fromUnit,
    setFromUnit,
    toUnit,
    setToUnit,
    conversionAmount,
    setConversionAmount,
    conversionResult,
    category,
    swapConversionUnits,
    currencyLoading,
    currencyError,
  } = logic;

  const theme = calculatorTheme as CalculatorTheme;
  const themeClass = `calc-theme-${theme}`;

  const secondary =
    mode !== "conversion" && calcState.memory !== 0
      ? `M=${calcState.memory}`
      : mode === "scientific"
        ? calcState.angleMode === "deg"
          ? t("apps.calculator.angle.deg", "Degrees")
          : t("apps.calculator.angle.rad", "Radians")
        : null;

  return (
    <div className={cn("flex flex-col h-full w-full calc-body", themeClass)}>
      {mode === "conversion" ? (
        <>
          <CalculatorDisplay
            value={conversionAmount}
            secondary={t("apps.calculator.conversion.title", "Convert")}
            theme={theme}
          />
          <CalculatorConversionPanel
            theme={theme}
            category={category}
            fromUnit={fromUnit}
            toUnit={toUnit}
            amount={conversionAmount}
            result={conversionResult}
            loading={currencyLoading}
            error={currencyError}
            onCategoryChange={(id) =>
              handleCategoryChange(id as typeof conversionCategory)
            }
            onFromUnitChange={setFromUnit}
            onToUnitChange={setToUnit}
            onAmountChange={setConversionAmount}
            onSwap={swapConversionUnits}
            t={t}
          />
        </>
      ) : (
        <>
          <CalculatorDisplay
            value={calcState.display}
            secondary={secondary}
            theme={theme}
          />
          {mode === "scientific" ? (
            <CalculatorScientificPanel
              theme={theme}
              angleMode={calcState.angleMode}
              onUnary={pressUnary}
              onPi={pressPi}
              onE={pressE}
              onFactorial={pressFactorial}
              onToggleAngle={pressToggleAngle}
              onPower={() => pressOperator("^")}
            />
          ) : null}
          <CalculatorBasicPanel
            theme={theme}
            onDigit={pressDigit}
            onOperator={pressOperator}
            onEquals={pressEquals}
            onClear={pressClear}
            onClearEntry={pressClearEntry}
            onBackspace={pressBackspace}
            onDecimal={pressDecimal}
            onNegate={pressNegate}
            onPercent={pressPercent}
            onMemoryClear={pressMemoryClear}
            onMemoryRecall={pressMemoryRecall}
            onMemoryAdd={pressMemoryAdd}
            onMemorySubtract={pressMemorySubtract}
            memoryActive={calcState.memory !== 0}
          />
        </>
      )}
    </div>
  );
}
