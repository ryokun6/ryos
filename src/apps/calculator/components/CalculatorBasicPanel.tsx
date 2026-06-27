import { cn } from "@/lib/utils";
import { CalculatorKey } from "./CalculatorKey";
import type { CalculatorTheme } from "./types";

interface CalculatorBasicPanelProps {
  theme: CalculatorTheme;
  onDigit: (digit: string) => void;
  onOperator: (op: "+" | "-" | "*" | "/") => void;
  onEquals: () => void;
  onClear: () => void;
  onClearEntry: () => void;
  onBackspace: () => void;
  onDecimal: () => void;
  onNegate: () => void;
  onPercent: () => void;
  onMemoryClear: () => void;
  onMemoryRecall: () => void;
  onMemoryAdd: () => void;
  onMemorySubtract: () => void;
  memoryActive: boolean;
}

export function CalculatorBasicPanel({
  theme,
  onDigit,
  onOperator,
  onEquals,
  onClear,
  onClearEntry,
  onBackspace,
  onDecimal,
  onNegate,
  onPercent,
  onMemoryClear,
  onMemoryRecall,
  onMemoryAdd,
  onMemorySubtract,
  memoryActive,
}: CalculatorBasicPanelProps) {
  const showMemoryRow = theme !== "system7";

  return (
    <div className="flex flex-col gap-1">
      {showMemoryRow ? (
        <div
          className={cn(
            "grid grid-cols-4 gap-1",
            theme === "xp" && "calc-memory-strip"
          )}
        >
          <CalculatorKey label="MC" onClick={onMemoryClear} theme={theme} variant="function" />
          <CalculatorKey label="MR" onClick={onMemoryRecall} theme={theme} variant="function" />
          <CalculatorKey label="M+" onClick={onMemoryAdd} theme={theme} variant="function" />
          <CalculatorKey label="M−" onClick={onMemorySubtract} theme={theme} variant="function" />
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-1">
        {theme === "system7" ? (
          <>
            <CalculatorKey label="C" onClick={onClear} theme={theme} variant="function" />
            <CalculatorKey label="CE" onClick={onClearEntry} theme={theme} variant="function" />
            <CalculatorKey label="±" onClick={onNegate} theme={theme} variant="function" />
            <CalculatorKey label="÷" onClick={() => onOperator("/")} theme={theme} variant="operator" />
          </>
        ) : (
          <>
            <CalculatorKey
              label={theme === "xp" ? "Backspace" : "⌫"}
              onClick={onBackspace}
              theme={theme}
              variant="function"
              className={theme === "xp" ? "text-[10px]" : undefined}
            />
            <CalculatorKey label="CE" onClick={onClearEntry} theme={theme} variant="function" />
            <CalculatorKey label="C" onClick={onClear} theme={theme} variant="function" />
            <CalculatorKey label="÷" onClick={() => onOperator("/")} theme={theme} variant="operator" />
          </>
        )}

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

        {theme === "system7" ? (
          <>
            <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} variant="wide" />
            <CalculatorKey label="." onClick={onDecimal} theme={theme} />
            <CalculatorKey label="=" onClick={onEquals} theme={theme} variant="equals" />
          </>
        ) : (
          <>
            <CalculatorKey label="±" onClick={onNegate} theme={theme} variant="function" />
            <CalculatorKey label="0" onClick={() => onDigit("0")} theme={theme} />
            <CalculatorKey label="." onClick={onDecimal} theme={theme} />
            <CalculatorKey label="=" onClick={onEquals} theme={theme} variant="equals" />
          </>
        )}
      </div>

      {(theme === "aqua" || theme === "xp") && (
        <div className="grid grid-cols-2 gap-1 mt-0.5">
          <CalculatorKey label="%" onClick={onPercent} theme={theme} variant="function" />
          {memoryActive ? (
            <span className="text-[10px] text-right self-center opacity-70">M</span>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}