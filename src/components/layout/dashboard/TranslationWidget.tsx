import { useState, useCallback, useRef, useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type TranslationWidgetConfig } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";
import { ArrowsLeftRight } from "@phosphor-icons/react";

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

function getLangLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

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
        style={{ fontFamily: font, padding: 8, gap: 6 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Language selectors */}
        <div className="flex items-center gap-1" style={{ fontSize: 11 }}>
          <select
            value={fromLang}
            onChange={(e) => handleFromLangChange(e.target.value)}
            style={{
              flex: 1,
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
            title="Swap languages"
          >
            <ArrowsLeftRight size={12} weight="bold" />
          </button>
          <select
            value={toLang}
            onChange={(e) => handleToLangChange(e.target.value)}
            style={{
              flex: 1,
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
          placeholder={t("apps.dashboard.translation.inputPlaceholder", "Enter text...")}
          style={{
            fontSize: 11,
            padding: 4,
            border: "1px solid #ACA899",
            borderRadius: 2,
            background: "#FFF",
            color: "#000",
            resize: "none",
            height: 60,
            fontFamily: font,
            outline: "none",
          }}
        />

        {/* Output */}
        <div
          style={{
            fontSize: 11,
            padding: 4,
            border: "1px solid #ACA899",
            borderRadius: 2,
            background: "#F5F5F0",
            color: loading ? "#888" : "#000",
            minHeight: 60,
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

  // macOS Aqua theme
  return (
    <div
      className="flex flex-col flex-1"
      style={{ borderRadius: "inherit", overflow: "hidden", minHeight: "inherit", fontFamily: font }}
    >
      {/* Blue gradient header with globe watermark */}
      <div
        className="relative px-3 py-2.5"
        style={{
          background: "linear-gradient(180deg, #5BA3E6 0%, #4A90D9 30%, #3B7CC8 70%, #3570B0 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.15)",
        }}
      >
        {/* Globe watermark */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: "50%",
            right: 12,
            transform: "translateY(-50%)",
            width: 60,
            height: 60,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,0.15)",
            background: "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.1) 0%, transparent 60%)",
          }}
        >
          {/* Globe lines */}
          <div
            className="absolute"
            style={{
              top: "50%",
              left: 0,
              right: 0,
              height: 0,
              borderTop: "1px solid rgba(255,255,255,0.12)",
            }}
          />
          <div
            className="absolute"
            style={{
              left: "50%",
              top: 0,
              bottom: 0,
              width: 0,
              borderLeft: "1px solid rgba(255,255,255,0.12)",
            }}
          />
          <div
            className="absolute"
            style={{
              top: 6,
              bottom: 6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 30,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          />
        </div>

        {/* Language selectors row */}
        <div
          className="relative flex items-center gap-1.5"
          style={{ zIndex: 1 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <select
            value={fromLang}
            onChange={(e) => handleFromLangChange(e.target.value)}
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 6px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(230,235,240,0.9) 100%)",
              color: "#2A2A2A",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)",
              fontFamily: font,
              appearance: "auto",
              outline: "none",
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
              padding: "3px 6px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(220,225,230,0.85) 100%)",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)",
              display: "flex",
              alignItems: "center",
              lineHeight: 1,
              color: "#3570B0",
              flexShrink: 0,
            }}
            title="Swap languages"
          >
            <ArrowsLeftRight size={12} weight="bold" />
          </button>

          <select
            value={toLang}
            onChange={(e) => handleToLangChange(e.target.value)}
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 6px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(230,235,240,0.9) 100%)",
              color: "#2A2A2A",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)",
              fontFamily: font,
              appearance: "auto",
              outline: "none",
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Label row */}
        <div
          className="flex items-center mt-1"
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.7)",
            fontWeight: 500,
            letterSpacing: "0.02em",
            textShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ flex: 1 }}>{getLangLabel(fromLang)}</span>
          <span style={{ flex: 1, textAlign: "right" }}>{getLangLabel(toLang)}</span>
        </div>
      </div>

      {/* Text areas */}
      <div
        className="flex flex-col flex-1"
        style={{
          background: "linear-gradient(180deg, #E8EDF2 0%, #D8DDE5 100%)",
          padding: 8,
          gap: 6,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Source input */}
        <textarea
          value={sourceText}
          onChange={(e) => handleSourceChange(e.target.value)}
          placeholder={t("apps.dashboard.translation.inputPlaceholder", "Enter text...")}
          style={{
            flex: 1,
            fontSize: 12,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(255,255,255,0.85)",
            color: "#1A1A1A",
            resize: "none",
            minHeight: 52,
            fontFamily: font,
            outline: "none",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
            lineHeight: 1.35,
          }}
        />

        {/* Output area */}
        <div
          style={{
            flex: 1,
            fontSize: 12,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.6)",
            color: loading ? "rgba(0,0,0,0.4)" : "#1A1A1A",
            minHeight: 52,
            fontFamily: font,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "auto",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
            lineHeight: 1.35,
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
