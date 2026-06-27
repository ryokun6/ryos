import { useTranslation } from "react-i18next";
import { CalculatorKey } from "./CalculatorKey";
import type { CalculatorTheme } from "./types";

interface CalculatorScientificPanelProps {
  theme: CalculatorTheme;
  angleMode: "deg" | "rad";
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
}

export function CalculatorScientificPanel({
  theme,
  angleMode,
  onUnary,
  onPi,
  onE,
  onFactorial,
  onToggleAngle,
  onPower,
}: CalculatorScientificPanelProps) {
  const { t } = useTranslation();
  const fnSize = theme === "aqua" ? "text-[11px]" : "text-[10px]";

  return (
    <div className="grid grid-cols-5 gap-1 mb-1">
      <CalculatorKey
        label={
          angleMode === "deg"
            ? t("apps.calculator.angle.degShort")
            : t("apps.calculator.angle.radShort")
        }
        onClick={onToggleAngle}
        theme={theme}
        variant="function"
        className={fnSize}
      />
      <CalculatorKey label="sin" onClick={() => onUnary("sin")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="cos" onClick={() => onUnary("cos")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="tan" onClick={() => onUnary("tan")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="n!" onClick={onFactorial} theme={theme} variant="function" className={fnSize} />

      <CalculatorKey label="ln" onClick={() => onUnary("ln")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="log" onClick={() => onUnary("log")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="√" onClick={() => onUnary("sqrt")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="x²" onClick={() => onUnary("square")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="x³" onClick={() => onUnary("cube")} theme={theme} variant="function" className={fnSize} />

      <CalculatorKey label="π" onClick={onPi} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="e" onClick={onE} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="1/x" onClick={() => onUnary("reciprocal")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="eˣ" onClick={() => onUnary("exp")} theme={theme} variant="function" className={fnSize} />
      <CalculatorKey label="xʸ" onClick={onPower} theme={theme} variant="function" className={fnSize} />
    </div>
  );
}
