import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
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
  theme: _theme,
  variant = "default",
  className,
  style,
  ariaLabel,
}: CalculatorKeyProps) {
  return (
    <button
      type="button"
      style={style}
      className={cn(
        "calc-key",
        variant === "operator" && "calc-key-operator",
        variant === "function" && "calc-key-function",
        variant === "equals" && "calc-key-equals",
        variant === "equals-wide" && "calc-key-equals-wide",
        variant === "wide" && "calc-key-wide",
        className
      )}
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
  theme: CalculatorTheme;
}

export function CalculatorDisplay({ value, secondary, theme }: CalculatorDisplayProps) {
  const hideSecondary = theme === "aqua" || theme === "system7";

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
      <div className="calc-display truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
