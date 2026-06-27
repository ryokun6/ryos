import { cn } from "@/lib/utils";
import { CalculatorAquaCompactPanel } from "./CalculatorAquaCompactPanel";
import { CalculatorAquaFullPanel } from "./CalculatorAquaFullPanel";
import { CalculatorBasicPanel } from "./CalculatorBasicPanel";
import { CalculatorConversionPanel } from "./CalculatorConversionPanel";
import { CalculatorDisplay } from "./CalculatorKey";
import { CalculatorScientificPanel } from "./CalculatorScientificPanel";
import { CalculatorSystem7Panel } from "./CalculatorSystem7Panel";
import { CalculatorWin98Panel } from "./CalculatorWin98Panel";
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
    pressDoubleZero,
    pressMemoryClear,
    pressMemoryRecall,
    pressMemoryAdd,
    pressMemorySubtract,
    pressMemoryStore,
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
    mode !== "conversion" &&
    theme !== "aqua" &&
    theme !== "system7" &&
    calcState.memory !== 0
      ? t("apps.calculator.status.memory", { value: calcState.memory })
      : mode === "scientific" && theme !== "aqua" && theme !== "system7"
        ? calcState.angleMode === "deg"
          ? t("apps.calculator.angle.deg")
          : t("apps.calculator.angle.rad")
        : null;

  const calcHandlers = {
    onDigit: pressDigit,
    onOperator: pressOperator,
    onEquals: pressEquals,
    onClear: pressClear,
    onClearEntry: pressClearEntry,
    onDecimal: pressDecimal,
    onNegate: pressNegate,
    onPercent: pressPercent,
    onMemoryClear: pressMemoryClear,
    onMemoryRecall: pressMemoryRecall,
    onMemoryAdd: pressMemoryAdd,
    onMemorySubtract: pressMemorySubtract,
  };

  return (
    <div className={cn("flex flex-col h-full w-full calc-body", themeClass)}>
      {mode === "conversion" ? (
        <>
          <CalculatorDisplay
            value={conversionAmount}
            secondary={t("apps.calculator.conversion.title")}
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
      ) : theme === "aqua" && mode === "basic" ? (
        <CalculatorAquaCompactPanel display={calcState.display} {...calcHandlers} />
      ) : theme === "aqua" && mode === "scientific" ? (
        <CalculatorAquaFullPanel
          display={calcState.display}
          angleMode={calcState.angleMode}
          onDigit={pressDigit}
          onOperator={pressOperator}
          onEquals={pressEquals}
          onClear={pressClear}
          onClearEntry={pressClearEntry}
          onDecimal={pressDecimal}
          onNegate={pressNegate}
          onUnary={pressUnary}
          onPi={pressPi}
          onE={pressE}
          onFactorial={pressFactorial}
          onToggleAngle={pressToggleAngle}
          onPower={() => pressOperator("^")}
          onDoubleZero={pressDoubleZero}
        />
      ) : theme === "system7" ? (
        <CalculatorSystem7Panel
          display={calcState.display}
          onDigit={pressDigit}
          onOperator={pressOperator}
          onEquals={pressEquals}
          onClear={pressClear}
          onClearEntry={pressClearEntry}
          onDecimal={pressDecimal}
        />
      ) : theme === "win98" || theme === "xp" ? (
        <>
          <CalculatorDisplay
            value={calcState.display}
            secondary={
              mode === "scientific"
                ? calcState.angleMode === "deg"
                  ? t("apps.calculator.angle.deg")
                  : t("apps.calculator.angle.rad")
                : null
            }
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
          <CalculatorWin98Panel
            theme={theme}
            memoryActive={calcState.memory !== 0}
            onDigit={pressDigit}
            onOperator={pressOperator}
            onEquals={pressEquals}
            onClear={pressClear}
            onClearEntry={pressClearEntry}
            onBackspace={pressBackspace}
            onDecimal={pressDecimal}
            onNegate={pressNegate}
            onPercent={pressPercent}
            onUnary={pressUnary}
            onMemoryClear={pressMemoryClear}
            onMemoryRecall={pressMemoryRecall}
            onMemoryStore={pressMemoryStore}
            onMemoryAdd={pressMemoryAdd}
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
