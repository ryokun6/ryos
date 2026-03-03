import { useState, useCallback, useRef, useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type TranslationWidgetConfig } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";
import { ArrowsLeftRight, ArrowsDownUp } from "@phosphor-icons/react";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh-CN", label: "Chinese" },
  { code: "ru", label: "Russian" },
] as const;

interface TranslationWidgetProps {
  widgetId?: string;
}

export function TranslationWidget({ widgetId }: TranslationWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const widget = useDashboardStore((s) =>
    widgetId ? s.widgets.find((w) => w.id === widgetId) : undefined
  );
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as TranslationWidgetConfig | undefined;

  const [fromLang, setFromLang] = useState(config?.fromLang ?? "en");
  const [toLang, setToLang] = useState(config?.toLang ?? "fr");
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (config?.fromLang && config.fromLang !== fromLang) setFromLang(config.fromLang);
    if (config?.toLang && config.toLang !== toLang) setToLang(config.toLang);
    // only sync on mount / external config change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.fromLang, config?.toLang]);

  const persistLangs = useCallback(
    (from: string, to: string) => {
      if (!widgetId) return;
      updateWidgetConfig(widgetId, { fromLang: from, toLang: to } as TranslationWidgetConfig);
    },
    [widgetId, updateWidgetConfig]
  );

  const doTranslate = useCallback(
    async (text: string, from: string, to: string) => {
      if (!text.trim()) {
        setTranslatedText("");
        setError(null);
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Translation failed");
        const data = await res.json();
        if (!controller.signal.aborted) {
          setTranslatedText(data.responseData?.translatedText ?? "");
          setLoading(false);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setError(t("apps.dashboard.translation.error", "Translation unavailable"));
          setLoading(false);
        }
      }
    },
    [t]
  );

  const scheduleTranslation = useCallback(
    (text: string, from: string, to: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!text.trim()) {
        setTranslatedText("");
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(() => doTranslate(text, from, to), 800);
    },
    [doTranslate]
  );

  const handleSourceChange = useCallback(
    (text: string) => {
      setSourceText(text);
      scheduleTranslation(text, fromLang, toLang);
    },
    [fromLang, toLang, scheduleTranslation]
  );

  const handleFromLangChange = useCallback(
    (code: string) => {
      setFromLang(code);
      persistLangs(code, toLang);
      if (sourceText.trim()) scheduleTranslation(sourceText, code, toLang);
    },
    [toLang, sourceText, persistLangs, scheduleTranslation]
  );

  const handleToLangChange = useCallback(
    (code: string) => {
      setToLang(code);
      persistLangs(fromLang, code);
      if (sourceText.trim()) scheduleTranslation(sourceText, fromLang, code);
    },
    [fromLang, sourceText, persistLangs, scheduleTranslation]
  );

  const handleSwap = useCallback(() => {
    const newFrom = toLang;
    const newTo = fromLang;
    setFromLang(newFrom);
    setToLang(newTo);
    persistLangs(newFrom, newTo);
    if (sourceText.trim()) {
      scheduleTranslation(sourceText, newFrom, newTo);
    }
  }, [fromLang, toLang, sourceText, persistLangs, scheduleTranslation]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  if (isXpTheme) {
    return (
      <div
      className="flex flex-col"
      style={{ fontFamily: font, padding: 8, gap: 6, minHeight: "inherit" }}
    >
        {/* Language selectors */}
        <div className="flex items-center justify-end gap-1" style={{ fontSize: 11, flexShrink: 0 }}>
          <select
            value={fromLang}
            onChange={(e) => handleFromLangChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: 117,
              fontSize: 11,
              padding: "2px 4px",
              border: "1px solid #ACA899",
              borderRadius: 2,
              background: "#FFF",
              color: "#000",
              cursor: "pointer",
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSwap}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              padding: "2px 6px",
              border: "1px solid #ACA899",
              borderRadius: 2,
              background: "#ECE9D8",
              cursor: "pointer",
              fontSize: 11,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
            }}
            title={t("apps.dashboard.translation.swap", "Swap languages")}
          >
            <ArrowsLeftRight size={12} weight="bold" />
          </button>
          <select
            value={toLang}
            onChange={(e) => handleToLangChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: 117,
              fontSize: 11,
              padding: "2px 4px",
              border: "1px solid #ACA899",
              borderRadius: 2,
              background: "#FFF",
              color: "#000",
              cursor: "pointer",
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Source input */}
        <textarea
          value={sourceText}
          onChange={(e) => handleSourceChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("apps.dashboard.translation.inputPlaceholder", "Enter text...")}
          style={{
            flex: 1,
            fontSize: 11,
            padding: 4,
            border: "1px solid #ACA899",
            borderRadius: 2,
            background: "#FFF",
            color: "#000",
            resize: "none",
            minHeight: 40,
            fontFamily: font,
            outline: "none",
          }}
        />

        {/* Output */}
        <div
          style={{
            flex: 1,
            fontSize: 11,
            padding: 4,
            border: "1px solid #ACA899",
            borderRadius: 2,
            background: "#F5F5F0",
            color: loading ? "#888" : "#000",
            minHeight: 40,
            fontFamily: font,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "auto",
          }}
        >
          {loading
            ? t("apps.dashboard.translation.translating", "Translating...")
            : error
              ? error
              : translatedText || (
                  <span style={{ color: "#999" }}>
                    {t("apps.dashboard.translation.outputPlaceholder", "Translation")}
                  </span>
                )}
        </div>
      </div>
    );
  }

  // macOS Aqua theme — Apple Dashboard-style translator widget
  const aquaSelectStyle = {
    fontSize: 12,
    fontWeight: 600 as const,
    padding: "3px 8px",
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.25)",
    background: "linear-gradient(180deg, #6AB0F3 0%, #3B82D0 50%, #2E6DB8 100%)",
    color: "#FFF",
    cursor: "pointer" as const,
    boxShadow: "0 1px 3px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)",
    fontFamily: font,
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    outline: "none" as const,
    textShadow: "0 -1px 1px rgba(0,0,0,0.25)",
    minWidth: 0,
  };

  return (
    <div
      className="flex flex-col flex-1"
      style={{
        borderRadius: "inherit",
        overflow: "hidden",
        minHeight: "inherit",
        fontFamily: font,
        position: "relative",
        background: "linear-gradient(180deg, rgba(80,130,190,0.85) 0%, rgba(55,100,165,0.9) 50%, rgba(40,80,140,0.92) 100%)",
      }}
    >
      {/* Globe watermark — large, right-center positioned */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          right: -10,
          transform: "translateY(-50%)",
          width: 180,
          height: 180,
          zIndex: 0,
          opacity: 0.22,
        }}
      >
        <svg viewBox="0 0 180 180" width="180" height="180" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Outer circle */}
          <circle cx="90" cy="90" r="85" stroke="rgba(120,160,220,1)" strokeWidth="1.8" />
          {/* Major meridian ellipses */}
          <ellipse cx="90" cy="90" rx="55" ry="85" stroke="rgba(120,160,220,1)" strokeWidth="1.4" />
          <ellipse cx="90" cy="90" rx="28" ry="85" stroke="rgba(120,160,220,1)" strokeWidth="1.2" />
          {/* Central vertical */}
          <line x1="90" y1="5" x2="90" y2="175" stroke="rgba(120,160,220,1)" strokeWidth="1.4" />
          {/* Equator */}
          <line x1="5" y1="90" x2="175" y2="90" stroke="rgba(120,160,220,1)" strokeWidth="1.4" />
          {/* Latitude lines */}
          <ellipse cx="90" cy="90" rx="85" ry="28" stroke="rgba(120,160,220,1)" strokeWidth="1" />
          <ellipse cx="90" cy="50" rx="72" ry="1" stroke="rgba(120,160,220,1)" strokeWidth="0.8" />
          <ellipse cx="90" cy="130" rx="72" ry="1" stroke="rgba(120,160,220,1)" strokeWidth="0.8" />
        </svg>
      </div>

      {/* "Translate from" header bar */}
      <div
        className="relative"
        style={{
          padding: "7px 10px 5px",
          zIndex: 1,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.85)",
              fontWeight: 500,
              textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t("apps.dashboard.translation.from", "Translate from")}
          </span>
          <div style={{ position: "relative", width: 156, marginLeft: "auto", flexShrink: 0 }}>
            <select
              value={fromLang}
              onChange={(e) => handleFromLangChange(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ ...aquaSelectStyle, width: "100%", paddingRight: 20 }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} style={{ color: "#000", background: "#FFF" }}>
                  {l.label}
                </option>
              ))}
            </select>
            <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(255,255,255,0.8)", fontSize: 8, lineHeight: 1 }}>▼</div>
          </div>
        </div>
      </div>

      {/* Source text area */}
      <div
        className="relative"
        style={{ padding: "6px 10px 4px", zIndex: 1 }}
      >
        <textarea
          value={sourceText}
          onChange={(e) => handleSourceChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("apps.dashboard.translation.inputPlaceholder", "Enter text...")}
          style={{
            width: "100%",
            fontSize: 13,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(255,255,255,0.92)",
            color: "#1A1A1A",
            resize: "none",
            height: 40,
            fontFamily: font,
            outline: "none",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.05)",
            lineHeight: 1.4,
            display: "block",
          }}
        />
      </div>

      {/* "To" middle bar with swap button */}
      <div
        className="relative"
        style={{
          padding: "5px 10px",
          zIndex: 1,
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSwap}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              padding: "2px 4px",
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              lineHeight: 1,
              color: "rgba(255,255,255,0.85)",
              flexShrink: 0,
            }}
            title={t("apps.dashboard.translation.swap", "Swap languages")}
          >
            <ArrowsDownUp size={16} weight="bold" />
          </button>
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.85)",
              fontWeight: 500,
              textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t("apps.dashboard.translation.to", "To")}
          </span>
          <div style={{ position: "relative", width: 156, marginLeft: "auto", flexShrink: 0 }}>
            <select
              value={toLang}
              onChange={(e) => handleToLangChange(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ ...aquaSelectStyle, width: "100%", paddingRight: 20 }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} style={{ color: "#000", background: "#FFF" }}>
                  {l.label}
                </option>
              ))}
            </select>
            <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(255,255,255,0.8)", fontSize: 8, lineHeight: 1 }}>▼</div>
          </div>
        </div>
      </div>

      {/* Output text area */}
      <div
        className="relative"
        style={{ padding: "4px 10px 8px", zIndex: 1 }}
      >
        <div
          style={{
            width: "100%",
            fontSize: 13,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.85)",
            color: loading ? "rgba(0,0,0,0.4)" : "#1A1A1A",
            height: 40,
            fontFamily: font,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "auto",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04), 0 1px 0 rgba(255,255,255,0.05)",
            lineHeight: 1.4,
          }}
        >
          {loading ? (
            <span style={{ fontStyle: "italic", color: "rgba(0,0,0,0.35)" }}>
              {t("apps.dashboard.translation.translating", "Translating...")}
            </span>
          ) : error ? (
            <span style={{ color: "#C44" }}>{error}</span>
          ) : translatedText ? (
            translatedText
          ) : (
            <span style={{ color: "rgba(0,0,0,0.25)" }}>
              {t("apps.dashboard.translation.outputPlaceholder", "Translation")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TranslationBackPanel({
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
  const config = widget?.config as TranslationWidgetConfig | undefined;

  const [fromLang, setFromLang] = useState(config?.fromLang ?? "en");
  const [toLang, setToLang] = useState(config?.toLang ?? "fr");

  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";
  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const handleSave = useCallback(() => {
    updateWidgetConfig(widgetId, { fromLang, toLang } as TranslationWidgetConfig);
    onDone?.();
  }, [widgetId, fromLang, toLang, updateWidgetConfig, onDone]);

  return (
    <div
      className="p-3 flex flex-col gap-3"
      style={{ fontFamily: font }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.4)" }}
      >
        {t("apps.dashboard.translation.defaultLanguages", "Default Languages")}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: textColor, width: 40 }}>
            {t("apps.dashboard.translation.from", "From")}
          </span>
          <select
            value={fromLang}
            onChange={(e) => setFromLang(e.target.value)}
            className="flex-1 text-[11px] rounded px-1.5 py-0.5 outline-none"
            style={{
              background: isXpTheme ? "#FFF" : "rgba(255,255,255,0.1)",
              border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.15)",
              color: textColor,
              cursor: "pointer",
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} style={{ color: "#000" }}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: textColor, width: 40 }}>
            {t("apps.dashboard.translation.to", "To")}
          </span>
          <select
            value={toLang}
            onChange={(e) => setToLang(e.target.value)}
            className="flex-1 text-[11px] rounded px-1.5 py-0.5 outline-none"
            style={{
              background: isXpTheme ? "#FFF" : "rgba(255,255,255,0.1)",
              border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.15)",
              color: textColor,
              cursor: "pointer",
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} style={{ color: "#000" }}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="text-[11px] font-medium hover:opacity-80 transition-opacity self-end"
        style={{
          color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
          cursor: "pointer",
          border: "none",
          background: "none",
          padding: "2px 0",
        }}
      >
        {t("apps.dashboard.translation.save", "Save")}
      </button>
    </div>
  );
}
