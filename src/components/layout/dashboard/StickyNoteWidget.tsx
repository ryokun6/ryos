import { useState, useCallback, useRef, useEffect, useId } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";

interface StickyNoteWidgetConfig {
  text?: string;
  color?: string;
}

interface StickyNoteWidgetProps {
  widgetId?: string;
}

const NOTE_COLORS = [
  { id: "yellow", value: "#FFFFA5" },
  { id: "pink", value: "#FFB8D1" },
  { id: "blue", value: "#B8D4FF" },
  { id: "green", value: "#B8FFB8" },
  { id: "purple", value: "#D4B8FF" },
];

const FONT_STACK = `"Marker Felt", "Comic Sans MS", "Bradley Hand", cursive`;

function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function textColorForBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 160 ? "#3d3200" : "#1a1a1a";
}

export function StickyNoteWidget({ widgetId }: StickyNoteWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const widget = useDashboardStore((s) =>
    widgetId ? s.widgets.find((w) => w.id === widgetId) : undefined
  );
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as StickyNoteWidgetConfig | undefined;

  const noteColor = config?.color || "#FFFFA5";
  const gradientEnd = darkenColor(noteColor, 8);
  const textColor = textColorForBg(noteColor);

  const [text, setText] = useState(config?.text ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const configTextRef = useRef(config?.text);

  useEffect(() => {
    if (config?.text !== undefined && config.text !== configTextRef.current) {
      configTextRef.current = config.text;
      setText(config.text);
    }
  }, [config?.text]);

  const handleChange = useCallback(
    (value: string) => {
      setText(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!widgetId) return;
        configTextRef.current = value;
        updateWidgetConfig(widgetId, { ...config, text: value } as StickyNoteWidgetConfig);
      }, 500);
    },
    [widgetId, updateWidgetConfig, config]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const uid = useId();
  const cs = 36;
  const pad = 8;
  const total = cs + pad;

  return (
    <div
      style={{
        background: isXpTheme
          ? noteColor
          : `linear-gradient(135deg, ${noteColor} 0%, ${gradientEnd} 100%)`,
        borderRadius: "inherit",
        minHeight: "inherit",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Ruled lines (subtle, Mac theme only) */}
      {!isXpTheme && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              transparent,
              transparent 23px,
              ${darkenColor(noteColor, 25)}33 23px,
              ${darkenColor(noteColor, 25)}33 24px
            )`,
            backgroundPosition: "0 8px",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Paper texture grain (Mac only) */}
      {!isXpTheme && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      )}

      {/* Bezier curve page curl (Mac only) */}
      {!isXpTheme && (
        <svg
          width={total}
          height={total}
          viewBox={`0 0 ${total} ${total}`}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            zIndex: 6,
            pointerEvents: "none",
          }}
        >
          <defs>
            <linearGradient id={`curl-fold-${uid}`} x1="0.15" y1="0.15" x2="1" y2="1">
              <stop offset="0%" stopColor={darkenColor(noteColor, 45)} />
              <stop offset="50%" stopColor={darkenColor(noteColor, 25)} />
              <stop offset="100%" stopColor={darkenColor(noteColor, 8)} />
            </linearGradient>
            <filter id={`curl-blur-${uid}`}>
              <feGaussianBlur stdDeviation="2" />
            </filter>
          </defs>

          {/* Shadow cast by the curl */}
          <path
            d={`M ${total} 4 C ${cs * 0.55 + pad} ${cs * 0.25 + pad * 0.3}, ${cs * 0.25 + pad * 0.3} ${cs * 0.55 + pad}, 4 ${total}`}
            stroke="rgba(0,0,0,0.22)"
            strokeWidth="8"
            fill="none"
            filter={`url(#curl-blur-${uid})`}
          />

          {/* Gap area — dark background visible through the curl */}
          <path
            d={`M ${total} 0 C ${cs * 0.65 + pad} ${cs * 0.1}, ${cs * 0.1 + pad} ${cs * 0.65}, 0 ${total} L ${total} ${total} Z`}
            fill="rgba(0,0,0,0.6)"
          />

          {/* Paper curl fold — the curled underside of the page */}
          <path
            d={[
              `M ${total} 0`,
              `C ${cs * 0.65 + pad} ${cs * 0.1}, ${cs * 0.1 + pad} ${cs * 0.65}, 0 ${total}`,
              `L ${cs * 0.2} ${total}`,
              `C ${cs * 0.25 + pad * 0.5} ${cs * 0.7}, ${cs * 0.7} ${cs * 0.25 + pad * 0.5}, ${total} ${cs * 0.2}`,
              `Z`,
            ].join(" ")}
            fill={`url(#curl-fold-${uid})`}
          />

          {/* Highlight along fold edge */}
          <path
            d={`M ${total} 0 C ${cs * 0.65 + pad} ${cs * 0.1}, ${cs * 0.1 + pad} ${cs * 0.65}, 0 ${total}`}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.75"
            fill="none"
          />
        </svg>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder={t("apps.dashboard.stickyNote.placeholder", "Type a note...")}
        spellCheck={false}
        style={{
          flex: 1,
          width: "100%",
          minHeight: "inherit",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          fontFamily: isXpTheme ? "Tahoma, sans-serif" : FONT_STACK,
          fontSize: isXpTheme ? 12 : 14,
          lineHeight: isXpTheme ? "1.5" : "24px",
          color: textColor,
          caretColor: textColor,
          position: "relative",
          zIndex: 3,
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

  const widget = useDashboardStore((s) =>
    s.widgets.find((w) => w.id === widgetId)
  );
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as StickyNoteWidgetConfig | undefined;
  const currentColor = config?.color || "#FFFFA5";

  const selectColor = useCallback(
    (color: string) => {
      updateWidgetConfig(widgetId, {
        ...config,
        color,
      } as StickyNoteWidgetConfig);
      onDone?.();
    },
    [widgetId, updateWidgetConfig, config, onDone]
  );

  const labelColor = isXpTheme ? "#444" : "rgba(255,255,255,0.5)";

  return (
    <div
      className="flex flex-col items-center gap-3 px-4 py-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: labelColor }}
      >
        {t("apps.dashboard.stickyNote.noteColor", "Note Color")}
      </span>

      <div className="flex gap-2">
        {NOTE_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={t(`apps.dashboard.stickyNote.colors.${c.id}`, c.id)}
            onClick={() => selectColor(c.value)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: c.value,
              border:
                currentColor === c.value
                  ? isXpTheme
                    ? "2px solid #333"
                    : "2px solid rgba(255,255,255,0.9)"
                  : isXpTheme
                    ? "2px solid #CCC"
                    : "2px solid rgba(255,255,255,0.2)",
              boxShadow:
                currentColor === c.value
                  ? "0 0 0 1px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.5)"
                  : "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.3)",
              cursor: "pointer",
              transition: "border-color 0.15s, transform 0.15s",
              transform: currentColor === c.value ? "scale(1.15)" : "scale(1)",
            }}
          />
        ))}
      </div>

      <span className="text-[10px]" style={{ color: labelColor }}>
        {t(`apps.dashboard.stickyNote.colors.${NOTE_COLORS.find((c) => c.value === currentColor)?.id ?? "yellow"}`, "Yellow")}
      </span>
    </div>
  );
}
