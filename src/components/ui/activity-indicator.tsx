import { cn } from "@/lib/utils";

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
 * NativeWindUI-style Activity Indicator
 * A circular spinner with 8 bars that fade in sequence
 */
export function ActivityIndicator({
  size = "sm",
  color,
  className,
}: ActivityIndicatorProps) {
  const numericSize = typeof size === "number" ? size : sizeMap[size];
  const barCount = 8;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{
        width: numericSize,
        height: numericSize,
      }}
      role="status"
      aria-label="Loading"
    >
      <svg
        viewBox="0 0 24 24"
        width={numericSize}
        height={numericSize}
        className="animate-activity-indicator"
        style={{
          color: color?.startsWith("text-") ? undefined : color,
        }}
      >
        {Array.from({ length: barCount }).map((_, i) => {
          const rotation = (i * 360) / barCount;
          const delay = (i * 100) / barCount;

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
                animation: `activity-indicator-fade 0.8s ease-in-out ${delay}ms infinite`,
              }}
            />
          );
        })}
      </svg>
      <span className="sr-only">Loading...</span>

      <style>{`
        @keyframes activity-indicator-fade {
          0%, 100% {
            opacity: 0.25;
          }
          12.5% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default ActivityIndicator;
