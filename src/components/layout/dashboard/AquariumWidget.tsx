import EmojiAquarium, { AquariumBubbleOverflowLayer } from "@/components/shared/EmojiAquarium";
import { useDashboardStore } from "@/stores/useDashboardStore";

interface AquariumWidgetProps {
  widgetId: string;
}

export function AquariumWidget({ widgetId }: AquariumWidgetProps) {
  return (
    <div
      className="flex h-full min-h-[inherit] items-stretch rounded-[inherit]"
      style={{
        background: "linear-gradient(180deg, #7dd3fc 0%, #38bdf8 45%, #0ea5e9 100%)",
      }}
    >
      <EmojiAquarium
        seed={widgetId}
        variant="widget"
        className="h-full min-h-[inherit] rounded-[inherit] shadow-[inset_0_1px_8px_rgba(255,255,255,0.35),inset_0_-10px_18px_rgba(3,105,161,0.2)]"
      />
    </div>
  );
}

export function AquariumBubbleOverflow({ widgetId }: AquariumWidgetProps) {
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  if (!widget) return null;

  return (
    <AquariumBubbleOverflowLayer
      seed={`${widgetId}:dashboard-bubble-overflow`}
      width={widget.size.width}
      height={widget.size.height}
      count={8}
      className="z-50"
    />
  );
}
