import { cn } from "@/lib/utils";
import { ToolbarButton, ToolbarButtonGroup } from "@/components/ui/toolbar-button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import {
  calculateFittedCalculatorFontSize,
  formatCalculatorDisplay,
} from "../utils/formatCalculatorDisplay";
import type { CalculatorTheme } from "./types";

export interface CalculatorKeyProps {
  label: string;
  onClick: () => void;
  theme: CalculatorTheme;
  variant?: "default" | "operator" | "function" | "equals" | "equals-wide" | "wide";
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function CalculatorKey({
  label,
  onClick,
  theme,
  variant = "default",
  className,
  style,
  ariaLabel,
}: CalculatorKeyProps) {
  const variantClass = cn(
    variant === "operator" && "calc-key-operator",
    variant === "function" && "calc-key-function",
    variant === "equals" && "calc-key-equals",
    variant === "equals-wide" && "calc-key-equals-wide",
    variant === "wide" && "calc-key-wide",
    className
  );

  const gridSpanClass =
    variant === "wide"
      ? "calc-key-wide"
      : variant === "equals-wide"
        ? "calc-key-equals-wide"
        : undefined;

  if (theme === "aqua") {
    return (
      <ToolbarButtonGroup
        className={cn(
          "calc-aqua-key-group h-full min-h-[26px] w-full",
          gridSpanClass
        )}
        style={style}
      >
        <ToolbarButton
          className={cn("calc-key calc-aqua-key flex-1 w-full h-full min-h-[26px]", variantClass)}
          onClick={onClick}
          aria-label={ariaLabel ?? label}
        >
          {label}
        </ToolbarButton>
      </ToolbarButtonGroup>
    );
  }

  return (
    <button
      type="button"
      style={style}
      className={cn("calc-key", variantClass)}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
    >
      {label}
    </button>
  );
}

export interface CalculatorDisplayProps {
  value: string;
  secondary?: string | null;
  memoryActive?: boolean;
  theme: CalculatorTheme;
}

export function CalculatorDisplayValue({ value }: { value: string }) {
  const valueRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const valueElement = valueRef.current;
    const container = valueElement?.parentElement;
    if (!valueElement || !container) return;

    const fitValue = () => {
      valueElement.style.fontSize = "";
      const baseFontSize = Number.parseFloat(
        window.getComputedStyle(valueElement).fontSize
      );
      const fittedFontSize = calculateFittedCalculatorFontSize({
        baseFontSize,
        availableWidth: valueElement.clientWidth,
        contentWidth: valueElement.scrollWidth,
      });
      if (fittedFontSize < baseFontSize) {
        valueElement.style.fontSize = `${fittedFontSize}px`;
      }
    };

    fitValue();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(fitValue);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={valueRef} className="calc-display-value whitespace-nowrap">
      {value}
    </div>
  );
}

export function CalculatorDisplay({
  value,
  secondary,
  memoryActive = false,
  theme,
}: CalculatorDisplayProps) {
  const locale = useLanguageStore((state) => state.current);
  const hideSecondary = theme === "aqua" || theme === "system7";
  const formattedValue = formatCalculatorDisplay(value, locale);

  return (
    <div className="flex flex-col gap-0.5">
      {secondary && !hideSecondary ? (
        <div
          className={cn(
            "text-right text-xs opacity-70 px-1 truncate",
            (theme === "win98" || theme === "xp") && "text-neutral-700"
          )}
        >
          {secondary}
        </div>
      ) : null}
      <div className="calc-display" title={value}>
        <CalculatorDisplayValue value={formattedValue} />
        {theme === "aqua" ? (
          <div className="calc-display-status" aria-live="polite">
            <span>{memoryActive ? "M" : "\u00a0"}</span>
            <span>{secondary || "\u00a0"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
