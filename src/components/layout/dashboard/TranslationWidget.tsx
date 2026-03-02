import { useState, useCallback, useRef } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type TranslationWidgetConfig } from "@/stores/useDashboardStore";
import { Translate, ArrowsLeftRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
  { code: "hi", label: "Hindi" },
] as const;

async function translateText(
  text: string,
  from: string,
  to: string
): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    if (!res.ok) return "";
    const data = await res.json();
    return data.responseData?.translatedText || "";
  } catch {
    return "";
  }
}

interface TranslationWidgetProps {
  widgetId: string;
}

export function TranslationWidget({ widgetId }: TranslationWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as TranslationWidgetConfig | undefined;

  const [fromLang, setFromLang] = useState(config?.fromLang || "en");
  const [toLang, setToLang] = useState(config?.toLang || "fr");
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [loading, setLoading] = useState(false);
  const translateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doTranslate = useCallback(
    async (text: string, from: string, to: string) => {
      if (!text.trim()) {
        setOutputText("");
        return;
      }
      setLoading(true);
      const result = await translateText(text.trim(), from, to);
      setOutputText(result);
      setLoading(false);
    },
    []
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInputText(value);
      if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
      if (value.trim()) {
        translateTimerRef.current = setTimeout(() => doTranslate(value, fromLang, toLang), 800);
      } else {
        setOutputText("");
      }
    },
    [fromLang, toLang, doTranslate]
  );

  const handleFromChange = useCallback(
    (lang: string) => {
      setFromLang(lang);
      updateWidgetConfig(widgetId, { fromLang: lang, toLang } as TranslationWidgetConfig);
      if (inputText.trim()) {
        if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
        translateTimerRef.current = setTimeout(() => doTranslate(inputText, lang, toLang), 400);
      }
    },
    [widgetId, toLang, inputText, updateWidgetConfig, doTranslate]
  );

  const handleToChange = useCallback(
    (lang: string) => {
      setToLang(lang);
      updateWidgetConfig(widgetId, { fromLang, toLang: lang } as TranslationWidgetConfig);
      if (inputText.trim()) {
        if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
        translateTimerRef.current = setTimeout(() => doTranslate(inputText, fromLang, lang), 400);
      }
    },
    [widgetId, fromLang, inputText, updateWidgetConfig, doTranslate]
  );

  const swapLanguages = useCallback(() => {
    const newFrom = toLang;
    const newTo = fromLang;
    setFromLang(newFrom);
    setToLang(newTo);
    updateWidgetConfig(widgetId, { fromLang: newFrom, toLang: newTo } as TranslationWidgetConfig);
    if (outputText) {
      setInputText(outputText);
      setOutputText(inputText);
    }
  }, [fromLang, toLang, inputText, outputText, widgetId, updateWidgetConfig]);

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const selectStyle = (isXp: boolean): React.CSSProperties => ({
    fontSize: 10,
    fontWeight: 600,
    border: "none",
    outline: "none",
    cursor: "pointer",
    background: isXp ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.1)",
    color: isXp ? "#333" : "rgba(255,255,255,0.85)",
    borderRadius: 4,
    padding: "2px 4px",
    fontFamily: font,
  });

  if (isXpTheme) {
    return (
      <div className="flex flex-col" style={{ fontFamily: font, minHeight: "inherit" }}>
        {/* Language selectors */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5"
          style={{ borderBottom: "1px solid #D5D2CA" }}
        >
          <Translate size={13} weight="fill" style={{ color: "#4488BB", flexShrink: 0 }} />
          <select
            value={fromLang}
            onChange={(e) => handleFromChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            style={selectStyle(true)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={swapLanguages}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#888", padding: 2 }}
          >
            <ArrowsLeftRight size={12} weight="bold" />
          </button>
          <select
            value={toLang}
            onChange={(e) => handleToChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            style={selectStyle(true)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Input */}
        <div className="px-2 py-1.5" style={{ borderBottom: "1px solid #EAE8E1" }}>
          <textarea
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder={t("apps.dashboard.translation.inputPlaceholder", "Enter text...")}
            className="w-full bg-transparent outline-none resize-none text-[11px]"
            style={{ color: "#333", minHeight: 40, lineHeight: "1.4" }}
            rows={2}
          />
        </div>

        {/* Output */}
        <div className="px-2 py-1.5 flex-1">
          {loading ? (
            <div className="text-[10px]" style={{ color: "#888" }}>
              {t("apps.dashboard.translation.translating", "Translating...")}
            </div>
          ) : (
            <div className="text-[11px]" style={{ color: "#333", lineHeight: "1.4", minHeight: 40 }}>
              {outputText || (
                <span style={{ color: "#BBB" }}>
                  {t("apps.dashboard.translation.outputPlaceholder", "Translation")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{
        fontFamily: font,
        minHeight: "inherit",
        borderRadius: "inherit",
        overflow: "hidden",
        background: "linear-gradient(180deg, #2A4A7A 0%, #1A3060 100%)",
      }}
    >
      {/* Language bar */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <select
          value={fromLang}
          onChange={(e) => handleFromChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          style={selectStyle(false)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} style={{ color: "#333", background: "#fff" }}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={swapLanguages}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.5)",
            padding: 2,
          }}
        >
          <ArrowsLeftRight size={12} weight="bold" />
        </button>
        <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
          {t("apps.dashboard.translation.to", "To")}
        </span>
        <select
          value={toLang}
          onChange={(e) => handleToChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          style={selectStyle(false)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} style={{ color: "#333", background: "#fff" }}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Input area */}
      <div
        className="px-3 py-2"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <textarea
          value={inputText}
          onChange={(e) => handleInputChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("apps.dashboard.translation.inputPlaceholder", "Enter text...")}
          className="w-full bg-transparent outline-none resize-none text-[12px]"
          style={{
            color: "rgba(255,255,255,0.9)",
            minHeight: 44,
            lineHeight: "1.4",
            caretColor: "rgba(255,255,255,0.7)",
          }}
          rows={2}
        />
      </div>

      {/* Output area */}
      <div className="px-3 py-2 flex-1">
        {loading ? (
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("apps.dashboard.translation.translating", "Translating...")}
          </div>
        ) : (
          <div
            className="text-[12px]"
            style={{
              color: "rgba(255,255,255,0.85)",
              lineHeight: "1.4",
              minHeight: 44,
            }}
          >
            {outputText || (
              <span style={{ color: "rgba(255,255,255,0.25)" }}>
                {t("apps.dashboard.translation.outputPlaceholder", "Translation")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
