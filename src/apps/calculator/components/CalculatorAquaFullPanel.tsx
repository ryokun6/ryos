import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalculatorDisplay, CalculatorKey } from "./CalculatorKey";
import type { CalculatorTheme } from "./types";

interface CalculatorAquaFullPanelProps {
  display: string;
  status?: string | null;
  memoryActive: boolean;
  angleMode: "deg" | "rad";
  onDigit: (digit: string) => void;
  onOperator: (op: "+" | "-" | "*" | "/") => void;
  onEquals: () => void;
  onClear: () => void;
  onClearEntry: () => void;
  onDecimal: () => void;
  onNegate: () => void;
  onPercent: () => void;
  onUnary: (
    name:
      | "sin"
      | "cos"
      | "tan"
      | "asin"
      | "acos"
      | "atan"
      | "ln"
      | "log"
      | "sqrt"
      | "square"
      | "cube"
      | "reciprocal"
      | "exp"
      | "exp2"
      | "exp10"
      | "sinh"
      | "cosh"
      | "tanh"
  ) => void;
  onPi: () => void;
  onFactorial: () => void;
  onToggleAngle: () => void;
  onOpenParenthesis: () => void;
  onCloseParenthesis: () => void;
  onRandom: () => void;
  onPower: () => void;
  onRoot: () => void;
  onMemoryClear: () => void;
  onMemoryRecall: () => void;
  onMemoryAdd: () => void;
  onMemorySubtract: () => void;
}

/** Mac OS X Tiger Calculator — expanded brushed-metal (scientific) layout. */
export function CalculatorAquaFullPanel({
  display,
  status,
  memoryActive,
  angleMode,
  onDigit,
  onOperator,
  onEquals,
  onClear,
  onClearEntry,
  onDecimal,
  onNegate,
  onPercent,
  onUnary,
  onPi,
  onFactorial,
  onToggleAngle,
  onOpenParenthesis,
  onCloseParenthesis,
  onRandom,
  onPower,
  onRoot,
  onMemoryClear,
  onMemoryRecall,
  onMemoryAdd,
  onMemorySubtract,
}: CalculatorAquaFullPanelProps) {
  const { t } = useTranslation();
  const theme: CalculatorTheme = "aqua";
  const fn = "text-[10px] leading-tight";
  const angleLabel =
    angleMode === "deg"
      ? t("apps.calculator.angle.degShort")
      : t("apps.calculator.angle.radShort");
  const [secondMode, setSecondMode] = useState(false);
  const trigFunctions = secondMode
    ? (["asin", "acos", "atan"] as const)
    : (["sin", "cos", "tan"] as const);

  return (
    <div className="calc-aqua-full flex flex-col gap-1">
      <CalculatorDisplay
        value={display}
        secondary={secondMode ? "2nd" : status}
        memoryActive={memoryActive}
        theme={theme}
      />
      <div className="calc-aqua-full-grid">
        {/* Row 1 */}
        <CalculatorKey label="2nd" onClick={() => setSecondMode((active) => !active)} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 1 }} />
        <CalculatorKey label="(" onClick={onOpenParenthesis} theme={theme} variant="function" style={{ gridColumn: 2, gridRow: 1 }} />
        <CalculatorKey label=")" onClick={onCloseParenthesis} theme={theme} variant="function" style={{ gridColumn: 3, gridRow: 1 }} />
        <CalculatorKey label="%" onClick={onPercent} theme={theme} variant="function" style={{ gridColumn: 4, gridRow: 1 }} />
        <CalculatorKey label="MC" onClick={onMemoryClear} theme={theme} variant="function" className={fn} style={{ gridColumn: 6, gridRow: 1 }} />
        <CalculatorKey label="M+" onClick={onMemoryAdd} theme={theme} variant="function" className={fn} style={{ gridColumn: 7, gridRow: 1 }} />
        <CalculatorKey label="M−" onClick={onMemorySubtract} theme={theme} variant="function" className={fn} style={{ gridColumn: 8, gridRow: 1 }} />
        <CalculatorKey label="MR" onClick={onMemoryRecall} theme={theme} variant="function" className={fn} style={{ gridColumn: 9, gridRow: 1 }} />

        {/* Row 2 */}
        <CalculatorKey label="1/x" onClick={() => onUnary("reciprocal")} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 2 }} />
        <CalculatorKey label="x²" onClick={() => onUnary("square")} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 2 }} />
        <CalculatorKey label="x³" onClick={() => onUnary("cube")} theme={theme} variant="function" className={fn} style={{ gridColumn: 3, gridRow: 2 }} />
        <CalculatorKey label="xʸ" onClick={onPower} theme={theme} variant="function" className={fn} style={{ gridColumn: 4, gridRow: 2 }} />
        <CalculatorKey label="AC" onClick={onClear} theme={theme} variant="function" className={fn} style={{ gridColumn: 6, gridRow: 2 }} />
        <CalculatorKey label="C" onClick={onClearEntry} theme={theme} variant="function" className={fn} style={{ gridColumn: 7, gridRow: 2 }} />
        <CalculatorKey label="÷" onClick={() => onOperator("/")} theme={theme} variant="operator" style={{ gridColumn: 8, gridRow: 2 }} />
        <CalculatorKey label="×" onClick={() => onOperator("*")} theme={theme} variant="operator" style={{ gridColumn: 9, gridRow: 2 }} />

        {/* Row 3 */}
        <CalculatorKey label="n!" onClick={onFactorial} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 3 }} />
        <CalculatorKey label="√" onClick={() => onUnary("sqrt")} theme={theme} variant="function" style={{ gridColumn: 2, gridRow: 3 }} />
        <CalculatorKey label="ʸ√x" onClick={onRoot} theme={theme} variant="function" className={fn} style={{ gridColumn: 3, gridRow: 3 }} />
        <CalculatorKey label="ln" onClick={() => onUnary("ln")} theme={theme} variant="function" className={fn} style={{ gridColumn: 4, gridRow: 3 }} />
        <CalculatorKey label="7" onClick={() => onDigit("7")} theme={theme} style={{ gridColumn: 6, gridRow: 3 }} />
        <CalculatorKey label="8" onClick={() => onDigit("8")} theme={theme} style={{ gridColumn: 7, gridRow: 3 }} />
        <CalculatorKey label="9" onClick={() => onDigit("9")} theme={theme} style={{ gridColumn: 8, gridRow: 3 }} />
        <CalculatorKey label="−" onClick={() => onOperator("-")} theme={theme} variant="operator" style={{ gridColumn: 9, gridRow: 3 }} />

        {/* Row 4 */}
        <CalculatorKey label={secondMode ? "asin" : "sin"} onClick={() => onUnary(trigFunctions[0])} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 4 }} />
        <CalculatorKey label={secondMode ? "acos" : "cos"} onClick={() => onUnary(trigFunctions[1])} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 4 }} />
        <CalculatorKey label={secondMode ? "atan" : "tan"} onClick={() => onUnary(trigFunctions[2])} theme={theme} variant="function" className={fn} style={{ gridColumn: 3, gridRow: 4 }} />
        <CalculatorKey label="log" onClick={() => onUnary("log")} theme={theme} variant="function" className={fn} style={{ gridColumn: 4, gridRow: 4 }} />
        <CalculatorKey label="4" onClick={() => onDigit("4")} theme={theme} style={{ gridColumn: 6, gridRow: 4 }} />
        <CalculatorKey label="5" onClick={() => onDigit("5")} theme={theme} style={{ gridColumn: 7, gridRow: 4 }} />
        <CalculatorKey label="6" onClick={() => onDigit("6")} theme={theme} style={{ gridColumn: 8, gridRow: 4 }} />
        <CalculatorKey label="+" onClick={() => onOperator("+")} theme={theme} variant="operator" style={{ gridColumn: 9, gridRow: 4 }} />

        {/* Row 5 */}
        <CalculatorKey label="sinh" onClick={() => onUnary("sinh")} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 5 }} />
        <CalculatorKey label="cosh" onClick={() => onUnary("cosh")} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 5 }} />
        <CalculatorKey label="tanh" onClick={() => onUnary("tanh")} theme={theme} variant="function" className={fn} style={{ gridColumn: 3, gridRow: 5 }} />
        <CalculatorKey label="eˣ" onClick={() => onUnary("exp")} theme={theme} variant="function" className={fn} style={{ gridColumn: 4, gridRow: 5 }} />
        <CalculatorKey label="1" onClick={() => onDigit("1")} theme={theme} style={{ gridColumn: 6, gridRow: 5 }} />
        <CalculatorKey label="2" onClick={() => onDigit("2")} theme={theme} style={{ gridColumn: 7, gridRow: 5 }} />
        <CalculatorKey label="3" onClick={() => onDigit("3")} theme={theme} style={{ gridColumn: 8, gridRow: 5 }} />
        <CalculatorKey
          label="="
          onClick={onEquals}
          theme={theme}
          variant="equals"
          style={{ gridColumn: 9, gridRow: "5 / span 2" }}
        />

        {/* Row 6 */}
        <CalculatorKey label={angleLabel} onClick={onToggleAngle} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 6 }} />
        <CalculatorKey label="π" onClick={onPi} theme={theme} variant="function" style={{ gridColumn: 2, gridRow: 6 }} />
        <CalculatorKey label="RN" onClick={onRandom} theme={theme} variant="function" className={fn} style={{ gridColumn: 3, gridRow: 6 }} />
        <CalculatorKey label="10ˣ" onClick={() => onUnary("exp10")} theme={theme} variant="function" className={fn} style={{ gridColumn: 4, gridRow: 6 }} />
        <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} variant="wide" style={{ gridColumn: "6 / span 2", gridRow: 6 }} />
        <CalculatorKey label="." onClick={onDecimal} theme={theme} style={{ gridColumn: 8, gridRow: 6 }} />
      </div>
    </div>
  );
}
