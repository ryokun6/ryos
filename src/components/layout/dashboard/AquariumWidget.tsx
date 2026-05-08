import EmojiAquarium from "@/components/shared/EmojiAquarium";

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
