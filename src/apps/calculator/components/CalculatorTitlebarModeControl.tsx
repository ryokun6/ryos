import { CaretDown } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { CalculatorMode } from "../hooks/useCalculatorLogic";

const CALCULATOR_MODES: CalculatorMode[] = ["basic", "scientific", "conversion"];

const MODE_LABEL_KEYS: Record<CalculatorMode, string> = {
  basic: "apps.calculator.menu.basic",
  scientific: "apps.calculator.menu.scientific",
  conversion: "apps.calculator.menu.conversion",
};

interface CalculatorTitlebarModeControlProps {
  mode: CalculatorMode;
  onSetMode: (mode: CalculatorMode) => void;
  isForeground: boolean;
  isBrushedMetal?: boolean;
}

export function CalculatorTitlebarModeControl({
  mode,
  onSetMode,
  isForeground,
  isBrushedMetal = false,
}: CalculatorTitlebarModeControlProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme } = useThemeFlags();

  const modeLabel = t(MODE_LABEL_KEYS[mode]);

  const textClass = cn(
    "text-[13px] font-medium leading-none",
    isMacOSTheme
      ? isForeground
        ? "text-os-titlebar-active-text"
        : "text-os-titlebar-inactive-text"
      : isWindowsTheme
        ? isForeground
          ? "text-white"
          : "text-[var(--os-color-titlebar-text-inactive)]"
        : isForeground
          ? "text-os-titlebar-active-text"
          : "text-os-titlebar-inactive-text"
  );

  const textStyle =
    isMacOSTheme && isForeground
      ? isBrushedMetal
        ? { textShadow: "0 1px 0 rgba(255, 255, 255, 0.5)" }
        : { textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)" }
      : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("common.menu.view")}
          title={modeLabel}
          data-titlebar-controls
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className={cn(
            "calc-titlebar-mode-trigger flex items-center gap-1 px-1 h-full shrink-0 cursor-pointer",
            isMacOSTheme ? "min-w-5" : "mr-1",
            !isForeground && "opacity-80"
          )}
        >
          <span className={textClass} style={textStyle}>{modeLabel}</span>
          {isMacOSTheme ? (
            <span
              aria-hidden
              className="calc-titlebar-mode-chevron macos-select-trigger relative inline-block shrink-0"
            />
          ) : (
            <CaretDown size={11} weight="bold" className="opacity-50 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="min-w-[8rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => onSetMode(value as CalculatorMode)}
        >
          {CALCULATOR_MODES.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              className="text-md h-6 pr-3"
            >
              {t(MODE_LABEL_KEYS[option])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
