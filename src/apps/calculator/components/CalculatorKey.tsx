import { cn } from "@/lib/utils";

import type { CalculatorTheme } from "./types";

export interface CalculatorKeyProps {
  label: string;
  onClick: () => void;
  theme: CalculatorTheme;
  variant?: "default" | "operator" | "function" | "equals" | "wide";
  className?: string;
  ariaLabel?: string;
}

export function CalculatorKey({
  label,
  onClick,
  theme: _theme,
  variant = "default",
  className,
  ariaLabel,
}: CalculatorKeyProps) {
  return (
    <button
      type="button"
      className={cn(
        "calc-key",
        variant === "operator" && "calc-key-operator",
        variant === "function" && "calc-key-function",
        variant === "equals" && "calc-key-equals",
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
  return (
    <div className="flex flex-col gap-0.5">
      {secondary ? (
        <div
          className={cn(
            "text-right text-xs opacity-70 px-1 truncate",
            theme === "system7" && "text-black",
            theme === "aqua" && "text-neutral-600",
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
