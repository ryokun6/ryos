import { useTranslation } from "react-i18next";
import { CalculatorDisplay, CalculatorKey } from "./CalculatorKey";
import type { CalculatorTheme } from "./types";

interface CalculatorAquaFullPanelProps {
  display: string;
  angleMode: "deg" | "rad";
  onDigit: (digit: string) => void;
  onOperator: (op: "+" | "-" | "*" | "/") => void;
  onEquals: () => void;
  onClear: () => void;
  onClearEntry: () => void;
  onDecimal: () => void;
  onNegate: () => void;
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
  ) => void;
  onPi: () => void;
  onE: () => void;
  onFactorial: () => void;
  onToggleAngle: () => void;
  onPower: () => void;
  onDoubleZero: () => void;
}

/** Mac OS X Tiger Calculator — expanded brushed-metal (scientific) layout. */
export function CalculatorAquaFullPanel({
  display,
  angleMode,
  onDigit,
  onOperator,
  onEquals,
  onClear,
  onClearEntry,
  onDecimal,
  onNegate,
  onUnary,
  onPi,
  onE,
  onFactorial,
  onToggleAngle,
  onPower,
  onDoubleZero,
}: CalculatorAquaFullPanelProps) {
  const { t } = useTranslation();
  const theme: CalculatorTheme = "aqua";
  const fn = "text-[10px] leading-tight";
  const angleLabel =
    angleMode === "deg"
      ? t("apps.calculator.angle.degShort")
      : t("apps.calculator.angle.radShort");

  return (
    <div className="calc-aqua-full flex flex-col gap-1">
      <CalculatorDisplay value={display} theme={theme} />
      <div className="calc-aqua-full-grid">
        {/* Row 1 */}
        <CalculatorKey label={angleLabel} onClick={onToggleAngle} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 1 }} />
        <CalculatorKey label="sin" onClick={() => onUnary("sin")} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 1 }} />
        <CalculatorKey label="7" onClick={() => onDigit("7")} theme={theme} style={{ gridColumn: 3, gridRow: 1 }} />
        <CalculatorKey label="8" onClick={() => onDigit("8")} theme={theme} style={{ gridColumn: 4, gridRow: 1 }} />
        <CalculatorKey label="9" onClick={() => onDigit("9")} theme={theme} style={{ gridColumn: 5, gridRow: 1 }} />
        <CalculatorKey label="AC" onClick={onClear} theme={theme} variant="function" className={fn} style={{ gridColumn: 6, gridRow: 1 }} />
        <CalculatorKey label="C" onClick={onClearEntry} theme={theme} variant="function" className={fn} style={{ gridColumn: 7, gridRow: 1 }} />

        {/* Row 2 */}
        <CalculatorKey label="cos" onClick={() => onUnary("cos")} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 2 }} />
        <CalculatorKey label="tan" onClick={() => onUnary("tan")} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 2 }} />
        <CalculatorKey label="4" onClick={() => onDigit("4")} theme={theme} style={{ gridColumn: 3, gridRow: 2 }} />
        <CalculatorKey label="5" onClick={() => onDigit("5")} theme={theme} style={{ gridColumn: 4, gridRow: 2 }} />
        <CalculatorKey label="6" onClick={() => onDigit("6")} theme={theme} style={{ gridColumn: 5, gridRow: 2 }} />
        <CalculatorKey label="±" onClick={onNegate} theme={theme} variant="function" style={{ gridColumn: 6, gridRow: 2 }} />
        <CalculatorKey label="−" onClick={() => onOperator("-")} theme={theme} variant="operator" style={{ gridColumn: 7, gridRow: 2 }} />

        {/* Row 3 */}
        <CalculatorKey label="asin" onClick={() => onUnary("asin")} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 3 }} />
        <CalculatorKey label="acos" onClick={() => onUnary("acos")} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 3 }} />
        <CalculatorKey label="1" onClick={() => onDigit("1")} theme={theme} style={{ gridColumn: 3, gridRow: 3 }} />
        <CalculatorKey label="2" onClick={() => onDigit("2")} theme={theme} style={{ gridColumn: 4, gridRow: 3 }} />
        <CalculatorKey label="3" onClick={() => onDigit("3")} theme={theme} style={{ gridColumn: 5, gridRow: 3 }} />
        <CalculatorKey label="×" onClick={() => onOperator("*")} theme={theme} variant="operator" style={{ gridColumn: 6, gridRow: 3 }} />
        <CalculatorKey label="+" onClick={() => onOperator("+")} theme={theme} variant="operator" style={{ gridColumn: 7, gridRow: 3 }} />

        {/* Row 4 */}
        <CalculatorKey label="ln" onClick={() => onUnary("ln")} theme={theme} variant="function" className={fn} style={{ gridColumn: 1, gridRow: 4 }} />
        <CalculatorKey label="log" onClick={() => onUnary("log")} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 4 }} />
        <CalculatorKey label="." onClick={onDecimal} theme={theme} style={{ gridColumn: 3, gridRow: 4 }} />
        <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} style={{ gridColumn: 4, gridRow: 4 }} />
        <CalculatorKey label="00" onClick={onDoubleZero} theme={theme} variant="function" style={{ gridColumn: 5, gridRow: 4 }} />
        <CalculatorKey label="eˣ" onClick={() => onUnary("exp")} theme={theme} variant="function" className={fn} style={{ gridColumn: 6, gridRow: 4 }} />
        <CalculatorKey label="÷" onClick={() => onOperator("/")} theme={theme} variant="operator" style={{ gridColumn: 7, gridRow: 4 }} />

        {/* Row 5 */}
        <CalculatorKey label="√" onClick={() => onUnary("sqrt")} theme={theme} variant="function" style={{ gridColumn: 1, gridRow: 5 }} />
        <CalculatorKey label="x²" onClick={() => onUnary("square")} theme={theme} variant="function" className={fn} style={{ gridColumn: 2, gridRow: 5 }} />
        <CalculatorKey label="π" onClick={onPi} theme={theme} variant="function" style={{ gridColumn: 3, gridRow: 5 }} />
        <CalculatorKey label="e" onClick={onE} theme={theme} variant="function" style={{ gridColumn: 4, gridRow: 5 }} />
        <CalculatorKey label="n!" onClick={onFactorial} theme={theme} variant="function" className={fn} style={{ gridColumn: 5, gridRow: 5 }} />
        <CalculatorKey label="xʸ" onClick={onPower} theme={theme} variant="function" className={fn} style={{ gridColumn: 6, gridRow: 5 }} />
        <CalculatorKey label="1/x" onClick={() => onUnary("reciprocal")} theme={theme} variant="function" className={fn} style={{ gridColumn: 7, gridRow: 5 }} />

        {/* Row 6 — wide equals */}
        <CalculatorKey
          label="="
          onClick={onEquals}
          theme={theme}
          variant="equals-wide"
          style={{ gridColumn: "6 / span 2", gridRow: 6 }}
        />
      </div>
    </div>
  );
}
