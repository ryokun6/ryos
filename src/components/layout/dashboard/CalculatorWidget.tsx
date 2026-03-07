import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type CalculatorWidgetConfig } from "@/stores/useDashboardStore";

interface CalculatorWidgetProps {
  widgetId: string;
}

type Operator = "+" | "-" | "×" | "÷" | null;

interface ButtonSpec {
  label: string;
  type: "digit" | "decimal" | "action" | "operator" | "equals";
  className?: string;
  span?: number;
}

const BUTTONS: ButtonSpec[] = [
  { label: "MC", type: "action" },
  { label: "M+", type: "action" },
  { label: "+/-", type: "action" },
  { label: "C", type: "action", className: "accent" },
  { label: "7", type: "digit" },
  { label: "8", type: "digit" },
  { label: "9", type: "digit" },
  { label: "÷", type: "operator", className: "accent" },
  { label: "4", type: "digit" },
  { label: "5", type: "digit" },
  { label: "6", type: "digit" },
  { label: "×", type: "operator", className: "accent" },
  { label: "1", type: "digit" },
  { label: "2", type: "digit" },
  { label: "3", type: "digit" },
  { label: "-", type: "operator", className: "accent" },
  { label: "0", type: "digit", span: 2 },
  { label: ".", type: "decimal" },
  { label: "+", type: "operator", className: "accent" },
  { label: "=", type: "equals", span: 4, className: "equals" },
];

function formatNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) return "ERR";
  const rounded = Number(value.toFixed(precision));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function calculate(left: number, right: number, operator: Operator, precision: number): string {
  if (operator === null) return formatNumber(right, precision);
  switch (operator) {
    case "+":
      return formatNumber(left + right, precision);
    case "-":
      return formatNumber(left - right, precision);
    case "×":
      return formatNumber(left * right, precision);
    case "÷":
      return right === 0 ? "ERR" : formatNumber(left / right, precision);
    default:
      return formatNumber(right, precision);
  }
}

export function CalculatorWidget({ widgetId }: CalculatorWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as CalculatorWidgetConfig | undefined;

  const [display, setDisplay] = useState(config?.display ?? "0");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [pendingOperator, setPendingOperator] = useState<Operator>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(true);
  const [memory, setMemory] = useState(0);
  const precision = config?.precision ?? 4;

  useEffect(() => {
    if (config?.display !== undefined && config.display !== display) {
      setDisplay(config.display);
    }
  }, [config?.display, display]);

  const persist = useCallback(
    (nextDisplay: string, nextPrecision = precision) => {
      updateWidgetConfig(widgetId, {
        ...(config ?? {}),
        display: nextDisplay,
        precision: nextPrecision,
      } as CalculatorWidgetConfig);
    },
    [config, precision, updateWidgetConfig, widgetId]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      const nextDisplay = waitingForOperand ? digit : display === "0" ? digit : `${display}${digit}`;
      setDisplay(nextDisplay);
      setWaitingForOperand(false);
      persist(nextDisplay);
    },
    [display, persist, waitingForOperand]
  );

  const handleDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      persist("0.");
      return;
    }
    if (display.includes(".")) return;
    const nextDisplay = `${display}.`;
    setDisplay(nextDisplay);
    persist(nextDisplay);
  }, [display, persist, waitingForOperand]);

  const handleClear = useCallback(() => {
    setDisplay("0");
    setStoredValue(null);
    setPendingOperator(null);
    setWaitingForOperand(true);
    persist("0");
  }, [persist]);

  const handleToggleSign = useCallback(() => {
    if (display === "0" || display === "ERR") return;
    const nextDisplay = display.startsWith("-") ? display.slice(1) : `-${display}`;
    setDisplay(nextDisplay);
    persist(nextDisplay);
  }, [display, persist]);

  const handleOperator = useCallback(
    (operator: Exclude<Operator, null>) => {
      const currentValue = Number.parseFloat(display);
      if (!Number.isFinite(currentValue)) {
        handleClear();
        return;
      }
      if (storedValue === null || waitingForOperand) {
        setStoredValue(currentValue);
      } else {
        const result = calculate(storedValue, currentValue, pendingOperator, precision);
        setDisplay(result);
        setStoredValue(Number.parseFloat(result));
        persist(result);
      }
      setPendingOperator(operator);
      setWaitingForOperand(true);
    },
    [display, handleClear, pendingOperator, persist, precision, storedValue, waitingForOperand]
  );

  const handleEquals = useCallback(() => {
    if (pendingOperator === null || storedValue === null) return;
    const currentValue = Number.parseFloat(display);
    const result = calculate(storedValue, currentValue, pendingOperator, precision);
    setDisplay(result);
    setStoredValue(null);
    setPendingOperator(null);
    setWaitingForOperand(true);
    persist(result);
  }, [display, pendingOperator, persist, precision, storedValue]);

  const handleMemoryAction = useCallback(
    (action: string) => {
      const currentValue = Number.parseFloat(display);
      if (!Number.isFinite(currentValue)) return;
      if (action === "MC") {
        setMemory(0);
        return;
      }
      if (action === "M+") {
        setMemory((value) => value + currentValue);
        return;
      }
      if (action === "M-") {
        setMemory((value) => value - currentValue);
      }
    },
    [display]
  );

  const pressButton = useCallback(
    (button: ButtonSpec) => {
      if (button.type === "digit") {
        handleDigit(button.label);
        return;
      }
      if (button.type === "decimal") {
        handleDecimal();
        return;
      }
      if (button.type === "operator") {
        handleOperator(button.label as Exclude<Operator, null>);
        return;
      }
      if (button.type === "equals") {
        handleEquals();
        return;
      }
      if (button.label === "C") {
        handleClear();
        return;
      }
      handleMemoryAction(button.label);
    },
    [handleClear, handleDecimal, handleDigit, handleEquals, handleMemoryAction, handleOperator]
  );

  if (isXpTheme) {
    return (
      <div
        className="flex h-full flex-col gap-2 p-2"
        style={{ background: "#ECE9D8", borderRadius: "inherit", fontFamily: "Tahoma, sans-serif" }}
      >
        <div
          style={{
            border: "1px solid #7F9DB9",
            background: "#FFF",
            color: "#17365D",
            textAlign: "right",
            fontSize: 24,
            padding: "6px 8px",
            borderRadius: 2,
            boxShadow: "inset 1px 1px 0 rgba(0,0,0,0.08)",
          }}
        >
          {display}
        </div>
        <div className="grid flex-1 grid-cols-4 gap-1.5">
          {BUTTONS.map((button) => (
            <button
              key={button.label}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => pressButton(button)}
              style={{
                gridColumn: `span ${button.span ?? 1}`,
                border: "1px solid #ACA899",
                background: button.className ? "#FAD39A" : "#FFF",
                color: "#000",
                fontSize: button.type === "equals" ? 16 : 13,
                fontWeight: 700,
                borderRadius: 3,
                boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.8)",
              }}
              title={button.label}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "inherit",
        borderRadius: "inherit",
        background: "linear-gradient(180deg, #ffc458 0%, #ff9a18 34%, #ff7c00 70%, #d75e00 100%)",
        boxShadow:
          "inset 0 2px 0 rgba(255,255,255,0.88), inset 0 -2px 0 rgba(122,43,0,0.38), 0 10px 18px rgba(160,72,0,0.2)",
        padding: 5,
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.26) 18%, rgba(255,255,255,0.02) 42%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 2,
          left: 8,
          right: 8,
          height: 28,
          borderRadius: 999,
          background: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 100%)",
          pointerEvents: "none",
          filter: "blur(1.5px)",
        }}
      />

      <div
        style={{
          borderRadius: 11,
          height: "100%",
          padding: 10,
          background: "linear-gradient(180deg, #fbfbfb 0%, #ececec 48%, #d4d4d4 100%)",
          border: "1px solid rgba(140,77,0,0.45)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(0,0,0,0.14), 0 2px 5px rgba(140,77,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            position: "relative",
            borderRadius: 10,
            padding: "8px 10px 7px",
            background: "linear-gradient(180deg, #f3feff 0%, #c5eefc 18%, #8fd3f4 56%, #73bce7 100%)",
            border: "1px solid #6dadd2",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -2px 2px rgba(50,112,155,0.3), inset 0 0 0 1px rgba(176,224,246,0.7)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 4,
              borderRadius: 8,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 55%, rgba(120,182,214,0.08) 100%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              fontSize: 9,
              color: "#5f879e",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 2,
              textShadow: "0 1px 0 rgba(255,255,255,0.65)",
            }}
          >
            {memory !== 0 ? `M ${memory}` : t("apps.dashboard.calculator.memory", "Memory")}
          </div>
          <div
            style={{
              textAlign: "right",
              fontSize: 29,
              lineHeight: 1,
              color: "#416479",
              fontStyle: "italic",
              letterSpacing: "0.02em",
              textShadow: "0 1px 0 rgba(255,255,255,0.85)",
            }}
          >
            {display}
          </div>
        </div>

        <div
          className="grid flex-1 grid-cols-4 gap-2"
          style={{ gridAutoRows: "1fr" }}
        >
          {BUTTONS.map((button) => {
            const isAccent = button.className === "accent";
            const isEquals = button.className === "equals";
            return (
              <button
                key={button.label}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (button.label === "+/-") {
                    handleToggleSign();
                    return;
                  }
                  pressButton(button);
                }}
                title={button.label}
                style={{
                  gridColumn: `span ${button.span ?? 1}`,
                  borderRadius: isEquals ? 13 : 999,
                  border: "1px solid rgba(122,122,122,0.5)",
                  background: isEquals
                    ? "linear-gradient(180deg, #fffef7 0%, #f8daa9 40%, #efb15c 100%)"
                    : isAccent
                      ? "linear-gradient(180deg, #ffffff 0%, #f7dfba 36%, #ecad56 100%)"
                      : "linear-gradient(180deg, #ffffff 0%, #f5f5f5 24%, #e3e3e3 55%, #c9c9c9 100%)",
                  color: isAccent || isEquals ? "#7a4100" : "#666",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.99), inset 0 -1px 1px rgba(92,92,92,0.3), 0 1px 1px rgba(255,255,255,0.75)",
                  fontSize: isEquals ? 18 : button.label.length > 2 ? 10 : 18,
                  fontWeight: 700,
                  lineHeight: 1,
                  minHeight: isEquals ? 30 : 27,
                  textShadow: "0 1px 0 rgba(255,255,255,0.65)",
                }}
              >
                {button.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CalculatorBackPanel({
  widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as CalculatorWidgetConfig | undefined;
  const precision = config?.precision ?? 4;

  const selectPrecision = useCallback(
    (nextPrecision: number) => {
      updateWidgetConfig(widgetId, {
        ...(config ?? {}),
        precision: nextPrecision,
      } as CalculatorWidgetConfig);
      onDone?.();
    },
    [config, onDone, updateWidgetConfig, widgetId]
  );

  const resetDisplay = useCallback(() => {
    updateWidgetConfig(widgetId, {
      ...(config ?? {}),
      display: "0",
    } as CalculatorWidgetConfig);
    onDone?.();
  }, [config, onDone, updateWidgetConfig, widgetId]);

  return (
    <div
      className="flex h-full flex-col justify-center gap-4 px-4 py-3"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ fontFamily: isXpTheme ? "Tahoma, sans-serif" : "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      <div
        className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: isXpTheme ? "#555" : "rgba(255,255,255,0.6)" }}
      >
        {t("apps.dashboard.calculator.rounding", "Rounding")}
      </div>
      <div className="flex justify-center gap-2">
        {[0, 2, 4, 6].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => selectPrecision(value)}
            style={{
              minWidth: 34,
              borderRadius: 999,
              padding: "6px 10px",
              border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.18)",
              background:
                value === precision
                  ? isXpTheme
                    ? "#D9ECFF"
                    : "linear-gradient(180deg, #ffcf86 0%, #f4a03d 100%)"
                  : isXpTheme
                    ? "#F3F0E1"
                    : "rgba(255,255,255,0.06)",
              color: isXpTheme ? "#222" : value === precision ? "#5d3200" : "#fff",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={resetDisplay}
        style={{
          borderRadius: 999,
          padding: "7px 12px",
          border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.18)",
          background: isXpTheme ? "#ECE9D8" : "rgba(255,255,255,0.08)",
          color: isXpTheme ? "#222" : "#fff",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {t("apps.dashboard.calculator.reset", "Reset display")}
      </button>
    </div>
  );
}
