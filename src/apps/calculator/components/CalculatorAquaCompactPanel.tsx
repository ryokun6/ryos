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
  onPercent: _onPercent,
  onMemoryClear,
  onMemoryRecall,
  onMemoryAdd,
  onMemorySubtract,
}: CalculatorAquaCompactPanelProps) {
  const theme: CalculatorTheme = "aqua";

  return (
    <div className="calc-aqua-compact flex flex-col gap-1">
      <CalculatorDisplay value={display} theme={theme} />
      <div className="calc-aqua-compact-grid">
        <CalculatorKey label="MC" onClick={onMemoryClear} theme={theme} variant="function" style={{ gridColumn: 1, gridRow: 1 }} />
        <CalculatorKey label="M+" onClick={onMemoryAdd} theme={theme} variant="function" style={{ gridColumn: 2, gridRow: 1 }} />
        <CalculatorKey label="M−" onClick={onMemorySubtract} theme={theme} variant="function" style={{ gridColumn: 3, gridRow: 1 }} />
        <CalculatorKey label="MR" onClick={onMemoryRecall} theme={theme} variant="function" style={{ gridColumn: 4, gridRow: 1 }} />

        <CalculatorKey label="C" onClick={onClear} theme={theme} variant="function" style={{ gridColumn: 1, gridRow: 2 }} />
        <CalculatorKey label="±" onClick={onNegate} theme={theme} variant="function" style={{ gridColumn: 2, gridRow: 2 }} />
        <CalculatorKey label="÷" onClick={() => onOperator("/")} theme={theme} variant="operator" style={{ gridColumn: 3, gridRow: 2 }} />
        <CalculatorKey label="×" onClick={() => onOperator("*")} theme={theme} variant="operator" style={{ gridColumn: 4, gridRow: 2 }} />

        <CalculatorKey label="7" onClick={() => onDigit("7")} theme={theme} style={{ gridColumn: 1, gridRow: 3 }} />
        <CalculatorKey label="8" onClick={() => onDigit("8")} theme={theme} style={{ gridColumn: 2, gridRow: 3 }} />
        <CalculatorKey label="9" onClick={() => onDigit("9")} theme={theme} style={{ gridColumn: 3, gridRow: 3 }} />
        <CalculatorKey label="−" onClick={() => onOperator("-")} theme={theme} variant="operator" style={{ gridColumn: 4, gridRow: 3 }} />

        <CalculatorKey label="4" onClick={() => onDigit("4")} theme={theme} style={{ gridColumn: 1, gridRow: 4 }} />
        <CalculatorKey label="5" onClick={() => onDigit("5")} theme={theme} style={{ gridColumn: 2, gridRow: 4 }} />
        <CalculatorKey label="6" onClick={() => onDigit("6")} theme={theme} style={{ gridColumn: 3, gridRow: 4 }} />
        <CalculatorKey label="+" onClick={() => onOperator("+")} theme={theme} variant="operator" style={{ gridColumn: 4, gridRow: 4 }} />

        <CalculatorKey label="1" onClick={() => onDigit("1")} theme={theme} style={{ gridColumn: 1, gridRow: 5 }} />
        <CalculatorKey label="2" onClick={() => onDigit("2")} theme={theme} style={{ gridColumn: 2, gridRow: 5 }} />
        <CalculatorKey label="3" onClick={() => onDigit("3")} theme={theme} style={{ gridColumn: 3, gridRow: 5 }} />
        <CalculatorKey
          label="="
          onClick={onEquals}
          theme={theme}
          variant="equals"
          style={{ gridColumn: 4, gridRow: "5 / span 2" }}
        />

        <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} variant="wide" style={{ gridColumn: "1 / span 2", gridRow: 6 }} />
        <CalculatorKey label="." onClick={onDecimal} theme={theme} style={{ gridColumn: 3, gridRow: 6 }} />
      </div>
    </div>
  );
}
