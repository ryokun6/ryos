import { cn } from "@/lib/utils";
import { ActivityIndicator } from "./activity-indicator";
import { getActivityLabel, type ActivityInfo } from "@/hooks/useActivityLabel";
import { useTranslation } from "react-i18next";

export type { ActivityInfo } from "@/hooks/useActivityLabel";

interface ActivityIndicatorWithLabelProps {
  /** Activity state object containing all loading states */
  state: ActivityInfo;
  /** Size of the indicator */
  size?: "xs" | "sm" | "md" | "lg" | number;
  /** Additional CSS classes for the container */
  className?: string;
  /** Additional CSS classes for the label */
  labelClassName?: string;
  /** Whether to show the label text (default: true) */
  showLabel?: boolean;
}

/**
 * Activity indicator with an optional label showing what's being processed
 * Shows the type of processing (Furigana, English, Soramimi, etc.) with progress percentage
 */
export function ActivityIndicatorWithLabel({
  state,
  size = "md",
  className,
  labelClassName,
  showLabel = true,
}: ActivityIndicatorWithLabelProps) {
  const { t } = useTranslation();
  const { isActive, label } = getActivityLabel(state, t);

  if (!isActive) {
    return null;
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      {showLabel && label && (
        <span
          className={cn(
            "font-geneva-12 text-white whitespace-nowrap",
            "drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]",
            "[text-shadow:_0_1px_0_rgba(0,0,0,0.8),_0_-1px_0_rgba(0,0,0,0.8),_1px_0_0_rgba(0,0,0,0.8),_-1px_0_0_rgba(0,0,0,0.8)]",
            labelClassName
          )}
        >
          {label}
        </span>
      )}
      <ActivityIndicator
        size={size}
        className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex-shrink-0"
      />
    </div>
  );
}

export default ActivityIndicatorWithLabel;
