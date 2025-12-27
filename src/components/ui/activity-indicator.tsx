import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface ActivityIndicatorProps {
  /** Size of the indicator - matches common icon sizes */
  size?: "xs" | "sm" | "md" | "lg" | number;
  /** Color of the indicator (CSS color value or Tailwind class) */
  color?: string;
  /** Additional CSS classes */
  className?: string;
}

const sizeMap = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * macOS-style Activity Indicator
 * A circular spinner with 8 bars that form a gradient tail sweeping around
 */
export function ActivityIndicator({
  size = "sm",
  color,
  className,
}: ActivityIndicatorProps) {
  const { t } = useTranslation();
  const numericSize = typeof size === "number" ? size : sizeMap[size];
  const barCount = 8;
  const animationDuration = 0.8; // seconds - total cycle time

  // Opacity values for each bar position in the gradient tail
  // Creates a smooth gradient from bright (1.0) trailing off to dim (0.15)
  const opacitySteps = [1, 0.7, 0.5, 0.35, 0.25, 0.2, 0.17, 0.15];

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{
        width: numericSize,
        height: numericSize,
      }}
      role="status"
      aria-label={t("common.loading.default")}
    >
      <svg
        viewBox="0 0 24 24"
        width={numericSize}
        height={numericSize}
        style={{
          color: color?.startsWith("text-") ? undefined : color,
        }}
      >
        {Array.from({ length: barCount }).map((_, i) => {
          const rotation = (i * 360) / barCount;
          // Use negative delay so animation starts "in progress" at the correct phase
          // Reverse order for clockwise rotation
          const delay = -((barCount - i) % barCount * animationDuration) / barCount;

          return (
            <rect
              key={i}
              x="11"
              y="2"
              width="2"
              height="6"
              rx="1"
              fill="currentColor"
              transform={`rotate(${rotation} 12 12)`}
              style={{
                opacity: opacitySteps[i],
                animation: `activity-indicator-spin ${animationDuration}s steps(${barCount}, end) ${delay}s infinite`,
              }}
            />
          );
        })}
      </svg>
      <span className="sr-only">{t("common.loading.default")}</span>

      <style>{`
        @keyframes activity-indicator-spin {
          0% { opacity: ${opacitySteps[0]}; }
          12.5% { opacity: ${opacitySteps[1]}; }
          25% { opacity: ${opacitySteps[2]}; }
          37.5% { opacity: ${opacitySteps[3]}; }
          50% { opacity: ${opacitySteps[4]}; }
          62.5% { opacity: ${opacitySteps[5]}; }
          75% { opacity: ${opacitySteps[6]}; }
          87.5% { opacity: ${opacitySteps[7]}; }
          100% { opacity: ${opacitySteps[0]}; }
        }
      `}</style>
    </div>
  );
}

export default ActivityIndicator;
