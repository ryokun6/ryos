import { Emoji } from "@/components/shared/Emoji";
import { cn } from "@/lib/utils";
import { isWidgetImageIcon } from "./dashboardWidgetConstants";

interface WidgetBarIconProps {
  icon: string;
  size: number;
  alt?: string;
  className?: string;
}

/**
 * Renders a Dashboard widget icon — Tiger Widget Bar PNG when available,
 * otherwise an emoji fallback (used for ryOS-only widgets).
 */
export function WidgetBarIcon({
  icon,
  size,
  alt = "",
  className,
}: WidgetBarIconProps) {
  if (isWidgetImageIcon(icon)) {
    return (
      <img
        src={icon}
        alt={alt}
        draggable={false}
        width={size}
        height={size}
        className={cn("inline-block select-none object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return <Emoji emoji={icon} size={size} alt={alt} className={className} />;
}
