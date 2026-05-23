import EmojiTerrarium, {
  TerrariumFireflyOverflowLayer,
} from "@/components/shared/EmojiTerrarium";
import { useDashboardStore } from "@/stores/useDashboardStore";

interface TerrariumWidgetProps {
  widgetId: string;
}

export function TerrariumWidget({ widgetId }: TerrariumWidgetProps) {
  return (
    <div className="flex h-full min-h-[inherit] items-stretch rounded-[inherit] shadow-[inset_0_1px_10px_rgba(255,255,255,0.32)]">
      <EmojiTerrarium
        seed={widgetId}
        className="h-full min-h-[inherit] rounded-[inherit] shadow-[inset_0_-8px_16px_rgba(45,40,34,0.12)]"
      />
    </div>
  );
}

export function TerrariumFireflyOverflow({ widgetId }: TerrariumWidgetProps) {
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  if (!widget) return null;

  return (
    <TerrariumFireflyOverflowLayer
      seed={`${widgetId}:dashboard-firefly-overflow`}
      width={widget.size.width}
      height={widget.size.height}
      count={9}
      className="z-50"
    />
  );
}
