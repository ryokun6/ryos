import { CalculatorDisplay, CalculatorKey } from "./CalculatorKey";
import type { CalculatorTheme } from "./types";

interface CalculatorAquaCompactPanelProps {
  display: string;
  onDigit: (digit: string) => void;
  onOperator: (op: "+" | "-" | "*" | "/") => void;
  onEquals: () => void;
  onClear: () => void;
  onDecimal: () => void;
  onNegate: () => void;
  onPercent: () => void;
  onMemoryClear: () => void;
  onMemoryRecall: () => void;
  onMemoryAdd: () => void;
  onMemorySubtract: () => void;
}

/** Mac OS X Tiger Calculator — compact brushed-metal layout. */
export function CalculatorAquaCompactPanel({
  display,
  onDigit,
  onOperator,
  onEquals,
  onClear,
  onDecimal,
  onNegate,
  onPercent,
  onMemoryClear,
  onMemoryRecall,
  onMemoryAdd,
  onMemorySubtract,
}: CalculatorAquaCompactPanelProps) {
  const theme: CalculatorTheme = "aqua";

  return (
    <div className="calc-aqua-compact flex flex-col gap-[3px]">
      <CalculatorDisplay value={display} theme={theme} />
      <div className="calc-aqua-compact-grid">
        <CalculatorKey label="MC" onClick={onMemoryClear} theme={theme} variant="function" />
        <CalculatorKey label="M+" onClick={onMemoryAdd} theme={theme} variant="function" />
        <CalculatorKey label="M−" onClick={onMemorySubtract} theme={theme} variant="function" />
        <CalculatorKey label="MR" onClick={onMemoryRecall} theme={theme} variant="function" />

        <CalculatorKey label="C" onClick={onClear} theme={theme} variant="function" />
        <CalculatorKey label="±" onClick={onNegate} theme={theme} variant="function" />
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

        <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} variant="wide" />
        <CalculatorKey label="." onClick={onDecimal} theme={theme} />
        <CalculatorKey label="=" onClick={onEquals} theme={theme} variant="equals" />
      </div>
    </div>
  );
}
