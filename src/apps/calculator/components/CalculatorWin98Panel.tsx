import { cn } from "@/lib/utils";
import { CalculatorKey } from "./CalculatorKey";
import type { CalculatorTheme } from "./types";

interface CalculatorWin98PanelProps {
  theme: Extract<CalculatorTheme, "win98" | "xp">;
  memoryActive: boolean;
  onDigit: (digit: string) => void;
  onOperator: (op: "+" | "-" | "*" | "/") => void;
  onEquals: () => void;
  onClear: () => void;
  onClearEntry: () => void;
  onBackspace: () => void;
  onDecimal: () => void;
  onNegate: () => void;
  onPercent: () => void;
  onUnary: (name: "sqrt" | "reciprocal") => void;
  onMemoryClear: () => void;
  onMemoryRecall: () => void;
  onMemoryStore: () => void;
  onMemoryAdd: () => void;
}

/** Classic Windows 98 Calculator — 6-column standard layout. */
export function CalculatorWin98Panel({
  theme,
  memoryActive,
  onDigit,
  onOperator,
  onEquals,
  onClear,
  onClearEntry,
  onBackspace,
  onDecimal,
  onNegate,
  onPercent,
  onUnary,
  onMemoryClear,
  onMemoryRecall,
  onMemoryStore,
  onMemoryAdd,
}: CalculatorWin98PanelProps) {
  return (
    <div className="calc-win98-panel flex flex-col gap-1">
      <div className="calc-win98-grid">
        <div
          className={cn("calc-win98-status", memoryActive && "calc-win98-status-active")}
          aria-hidden={!memoryActive}
        >
          {memoryActive ? "M" : null}
        </div>
        <CalculatorKey
          label="Backspace"
          onClick={onBackspace}
          theme={theme}
          variant="function"
          className="calc-key-clear text-[10px]"
          style={{ gridColumn: "2 / span 2", gridRow: 1 }}
        />
        <CalculatorKey
          label="CE"
          onClick={onClearEntry}
          theme={theme}
          variant="function"
          className="calc-key-clear"
          style={{ gridColumn: "4 / span 2", gridRow: 1 }}
        />
        <CalculatorKey
          label="C"
          onClick={onClear}
          theme={theme}
          variant="function"
          className="calc-key-clear"
          style={{ gridColumn: 6, gridRow: 1 }}
        />

        <CalculatorKey
          label="MC"
          onClick={onMemoryClear}
          theme={theme}
          variant="function"
          className="calc-key-memory"
          style={{ gridColumn: 1, gridRow: 2 }}
        />
        <CalculatorKey label="7" onClick={() => onDigit("7")} theme={theme} style={{ gridColumn: 2, gridRow: 2 }} />
        <CalculatorKey label="8" onClick={() => onDigit("8")} theme={theme} style={{ gridColumn: 3, gridRow: 2 }} />
        <CalculatorKey label="9" onClick={() => onDigit("9")} theme={theme} style={{ gridColumn: 4, gridRow: 2 }} />
        <CalculatorKey
          label="÷"
          onClick={() => onOperator("/")}
          theme={theme}
          variant="operator"
          className="calc-key-operator-red"
          style={{ gridColumn: 5, gridRow: 2 }}
        />
        <CalculatorKey
          label="sqrt"
          onClick={() => onUnary("sqrt")}
          theme={theme}
          variant="function"
          className="text-[10px]"
          style={{ gridColumn: 6, gridRow: 2 }}
        />

        <CalculatorKey
          label="MR"
          onClick={onMemoryRecall}
          theme={theme}
          variant="function"
          className="calc-key-memory"
          style={{ gridColumn: 1, gridRow: 3 }}
        />
        <CalculatorKey label="4" onClick={() => onDigit("4")} theme={theme} style={{ gridColumn: 2, gridRow: 3 }} />
        <CalculatorKey label="5" onClick={() => onDigit("5")} theme={theme} style={{ gridColumn: 3, gridRow: 3 }} />
        <CalculatorKey label="6" onClick={() => onDigit("6")} theme={theme} style={{ gridColumn: 4, gridRow: 3 }} />
        <CalculatorKey
          label="×"
          onClick={() => onOperator("*")}
          theme={theme}
          variant="operator"
          className="calc-key-operator-red"
          style={{ gridColumn: 5, gridRow: 3 }}
        />
        <CalculatorKey
          label="%"
          onClick={onPercent}
          theme={theme}
          variant="function"
          style={{ gridColumn: 6, gridRow: 3 }}
        />

        <CalculatorKey
          label="MS"
          onClick={onMemoryStore}
          theme={theme}
          variant="function"
          className="calc-key-memory"
          style={{ gridColumn: 1, gridRow: 4 }}
        />
        <CalculatorKey label="1" onClick={() => onDigit("1")} theme={theme} style={{ gridColumn: 2, gridRow: 4 }} />
        <CalculatorKey label="2" onClick={() => onDigit("2")} theme={theme} style={{ gridColumn: 3, gridRow: 4 }} />
        <CalculatorKey label="3" onClick={() => onDigit("3")} theme={theme} style={{ gridColumn: 4, gridRow: 4 }} />
        <CalculatorKey
          label="−"
          onClick={() => onOperator("-")}
          theme={theme}
          variant="operator"
          className="calc-key-operator-red"
          style={{ gridColumn: 5, gridRow: 4 }}
        />
        <CalculatorKey
          label="1/x"
          onClick={() => onUnary("reciprocal")}
          theme={theme}
          variant="function"
          className="text-[10px]"
          style={{ gridColumn: 6, gridRow: 4 }}
        />

        <CalculatorKey
          label="M+"
          onClick={onMemoryAdd}
          theme={theme}
          variant="function"
          className="calc-key-memory"
          style={{ gridColumn: 1, gridRow: 5 }}
        />
        <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} style={{ gridColumn: 2, gridRow: 5 }} />
        <CalculatorKey
          label="±"
          onClick={onNegate}
          theme={theme}
          variant="function"
          style={{ gridColumn: 3, gridRow: 5 }}
        />
        <CalculatorKey label="." onClick={onDecimal} theme={theme} style={{ gridColumn: 4, gridRow: 5 }} />
        <CalculatorKey
          label="+"
          onClick={() => onOperator("+")}
          theme={theme}
          variant="operator"
          className="calc-key-operator-red"
          style={{ gridColumn: 5, gridRow: 5 }}
        />
        <CalculatorKey
          label="="
          onClick={onEquals}
          theme={theme}
          variant="equals"
          className="calc-key-operator-red"
          style={{ gridColumn: 6, gridRow: 5 }}
        />
      </div>
    </div>
  );
}
