import { useState, useCallback, useRef, useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type StickyNoteWidgetConfig } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";

const STICKY_COLORS: Record<string, { bg: string; lines: string; text: string; shadow: string }> = {
  yellow: { bg: "#FFFFA5", lines: "rgba(0,0,0,0.04)", text: "#444", shadow: "rgba(200,180,0,0.15)" },
  pink: { bg: "#FFB8D0", lines: "rgba(0,0,0,0.04)", text: "#5A2040", shadow: "rgba(200,100,140,0.15)" },
  blue: { bg: "#B8E0FF", lines: "rgba(0,0,0,0.04)", text: "#1A3A5A", shadow: "rgba(100,160,220,0.15)" },
  green: { bg: "#B8F0B8", lines: "rgba(0,0,0,0.04)", text: "#1A4A1A", shadow: "rgba(80,180,80,0.15)" },
  purple: { bg: "#D8B8FF", lines: "rgba(0,0,0,0.04)", text: "#3A1A5A", shadow: "rgba(140,80,200,0.15)" },
};

interface StickyNoteWidgetProps {
  widgetId: string;
}

export function StickyNoteWidget({ widgetId }: StickyNoteWidgetProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as StickyNoteWidgetConfig | undefined;

  const colorName = config?.color || "yellow";
  const colors = STICKY_COLORS[colorName] || STICKY_COLORS.yellow;
  const [text, setText] = useState(config?.text || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (config?.text !== undefined && config.text !== text) {
      setText(config.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.text]);

  const handleChange = useCallback(
    (value: string) => {
      setText(value);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateWidgetConfig(widgetId, { ...config, text: value } as StickyNoteWidgetConfig);
      }, 500);
    },
    [widgetId, config, updateWidgetConfig]
  );

  const font = isXpTheme
    ? "'Segoe UI', Tahoma, sans-serif"
    : "'Marker Felt', 'Comic Sans MS', 'Helvetica Neue', sans-serif";

  return (
    <div
      className="relative flex flex-col"
      style={{
        background: colors.bg,
        borderRadius: isXpTheme ? 2 : 3,
        minHeight: "inherit",
        boxShadow: `0 4px 12px ${colors.shadow}`,
      }}
    >
      {/* Fold effect at top */}
      {!isXpTheme && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 24,
            background: `linear-gradient(180deg, rgba(0,0,0,0.03) 0%, transparent 100%)`,
            borderRadius: "3px 3px 0 0",
            pointerEvents: "none",
          }}
        />
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Type a note..."
        className="flex-1 w-full bg-transparent outline-none resize-none"
        style={{
          fontFamily: font,
          fontSize: 14,
          lineHeight: "22px",
          color: colors.text,
          padding: "12px 14px 8px",
          minHeight: 120,
          caretColor: colors.text,
          backgroundImage: `repeating-linear-gradient(transparent, transparent 21px, ${colors.lines} 21px, ${colors.lines} 22px)`,
          backgroundPositionY: 11,
        }}
      />
    </div>
  );
}

export function StickyNoteBackPanel({
  widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const config = widget?.config as StickyNoteWidgetConfig | undefined;

  const selectColor = useCallback(
    (color: StickyNoteWidgetConfig["color"]) => {
      updateWidgetConfig(widgetId, { ...config, color } as StickyNoteWidgetConfig);
      onDone?.();
    },
    [widgetId, config, updateWidgetConfig, onDone]
  );

  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";
  const colorOptions: { key: NonNullable<StickyNoteWidgetConfig["color"]>; label: string; bg: string }[] = [
    { key: "yellow", label: t("apps.dashboard.stickyNote.yellow", "Yellow"), bg: "#FFFFA5" },
    { key: "pink", label: t("apps.dashboard.stickyNote.pink", "Pink"), bg: "#FFB8D0" },
    { key: "blue", label: t("apps.dashboard.stickyNote.blue", "Blue"), bg: "#B8E0FF" },
    { key: "green", label: t("apps.dashboard.stickyNote.green", "Green"), bg: "#B8F0B8" },
    { key: "purple", label: t("apps.dashboard.stickyNote.purple", "Purple"), bg: "#D8B8FF" },
  ];

  return (
    <div onPointerDown={(e) => e.stopPropagation()} className="px-3 py-2">
      <div
        className="text-[9px] font-bold uppercase tracking-wider mb-2"
        style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.35)" }}
      >
        {t("apps.dashboard.stickyNote.color", "Color")}
      </div>
      <div className="flex gap-2">
        {colorOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => selectColor(opt.key)}
            className="flex flex-col items-center gap-1 transition-transform hover:scale-110"
            style={{ cursor: "pointer", background: "none", border: "none" }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                background: opt.bg,
                border: config?.color === opt.key || (!config?.color && opt.key === "yellow")
                  ? `2px solid ${isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)"}`
                  : "1px solid rgba(0,0,0,0.15)",
              }}
            />
            <span className="text-[9px]" style={{ color: textColor }}>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
