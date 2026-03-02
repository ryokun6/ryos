import { useState, useCallback, useRef } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type DictionaryWidgetConfig } from "@/stores/useDashboardStore";
import { MagnifyingGlass, Book } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  partOfSpeech: string;
  definition: string;
  example?: string;
}

async function lookupWord(word: string): Promise<DictionaryEntry[]> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return [];

  const entries: DictionaryEntry[] = [];
  const entry = data[0];
  const phonetic = entry.phonetic || entry.phonetics?.find((p: { text?: string }) => p.text)?.text;

  for (const meaning of entry.meanings ?? []) {
    for (const def of (meaning.definitions ?? []).slice(0, 2)) {
      entries.push({
        word: entry.word,
        phonetic,
        partOfSpeech: meaning.partOfSpeech,
        definition: def.definition,
        example: def.example,
      });
    }
  }
  return entries.slice(0, 4);
}

interface DictionaryWidgetProps {
  widgetId: string;
}

export function DictionaryWidget({ widgetId }: DictionaryWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as DictionaryWidgetConfig | undefined;

  const [query, setQuery] = useState(config?.lastWord || "");
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (word: string) => {
      if (!word.trim()) return;
      setLoading(true);
      setSearched(true);
      try {
        const results = await lookupWord(word.trim());
        setEntries(results);
        updateWidgetConfig(widgetId, { lastWord: word.trim() } as DictionaryWidgetConfig);
      } catch {
        setEntries([]);
      }
      setLoading(false);
    },
    [widgetId, updateWidgetConfig]
  );

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (value.trim().length >= 2) {
        searchTimerRef.current = setTimeout(() => doSearch(value), 600);
      }
    },
    [doSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        doSearch(query);
      }
    },
    [query, doSearch]
  );

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  if (isXpTheme) {
    return (
      <div className="flex flex-col" style={{ fontFamily: font, minHeight: "inherit" }}>
        {/* Search bar */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5"
          style={{ borderBottom: "1px solid #D5D2CA" }}
        >
          <Book size={14} weight="fill" style={{ color: "#8B6914", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder={t("apps.dashboard.dictionary.searchWord", "Search word...")}
            className="flex-1 bg-transparent outline-none text-[11px]"
            style={{ color: "#000", caretColor: "#000" }}
          />
          <MagnifyingGlass size={12} weight="bold" style={{ color: "#888", flexShrink: 0 }} />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-1.5" style={{ maxHeight: 200 }}>
          {loading ? (
            <div className="text-center text-[10px] py-4" style={{ color: "#888" }}>
              {t("apps.dashboard.dictionary.searching", "Searching...")}
            </div>
          ) : entries.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-[13px]" style={{ color: "#333" }}>
                  {entries[0].word}
                </span>
                {entries[0].phonetic && (
                  <span className="text-[10px]" style={{ color: "#888" }}>
                    {entries[0].phonetic}
                  </span>
                )}
              </div>
              {entries.map((entry, i) => (
                <div key={i}>
                  <span
                    className="text-[9px] font-bold italic"
                    style={{ color: "#666" }}
                  >
                    {entry.partOfSpeech}
                  </span>
                  <div className="text-[11px] mt-0.5" style={{ color: "#333", lineHeight: "1.4" }}>
                    {entry.definition}
                  </div>
                  {entry.example && (
                    <div
                      className="text-[10px] mt-0.5 italic"
                      style={{ color: "#777" }}
                    >
                      &ldquo;{entry.example}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : searched ? (
            <div className="text-center text-[10px] py-4" style={{ color: "#888" }}>
              {t("apps.dashboard.dictionary.noResults", "No definition found")}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 gap-1">
              <Book size={20} weight="duotone" style={{ color: "#BBB" }} />
              <span className="text-[10px]" style={{ color: "#999" }}>
                {t("apps.dashboard.dictionary.placeholder", "Look up any word")}
              </span>
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
        background: "linear-gradient(180deg, #5C3D1E 0%, #3A2510 100%)",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Book size={13} weight="fill" style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0 }} />
        <span className="text-[10px] font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
          {t("apps.dashboard.dictionary.title", "Dictionary")}
        </span>
      </div>

      {/* Search bar */}
      <div
        className="flex items-center gap-1.5 mx-2 mt-1.5 px-2 py-1"
        style={{
          background: "rgba(255,255,255,0.85)",
          borderRadius: 6,
          border: "1px solid rgba(0,0,0,0.1)",
        }}
      >
        <MagnifyingGlass size={11} weight="bold" style={{ color: "#888", flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("apps.dashboard.dictionary.searchWord", "Search word...")}
          className="flex-1 bg-transparent outline-none text-[11px]"
          style={{ color: "#333", caretColor: "#333" }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-3 py-1.5" style={{ maxHeight: 200 }}>
        {loading ? (
          <div className="text-center text-[10px] py-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("apps.dashboard.dictionary.searching", "Searching...")}
          </div>
        ) : entries.length > 0 ? (
          <div
            className="space-y-2 p-2 mt-1 rounded-lg"
            style={{ background: "rgba(255,255,240,0.92)" }}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-[13px]" style={{ color: "#2A1A08" }}>
                {entries[0].word}
              </span>
              {entries[0].phonetic && (
                <span className="text-[10px]" style={{ color: "#8A7A5A" }}>
                  {entries[0].phonetic}
                </span>
              )}
            </div>
            {entries.map((entry, i) => (
              <div key={i}>
                <span
                  className="text-[9px] font-bold italic"
                  style={{ color: "#7A6A4A" }}
                >
                  {entry.partOfSpeech}
                </span>
                <div className="text-[11px] mt-0.5" style={{ color: "#2A1A08", lineHeight: "1.4" }}>
                  {entry.definition}
                </div>
                {entry.example && (
                  <div
                    className="text-[10px] mt-0.5 italic"
                    style={{ color: "#8A7A5A" }}
                  >
                    &ldquo;{entry.example}&rdquo;
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : searched ? (
          <div className="text-center text-[10px] py-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("apps.dashboard.dictionary.noResults", "No definition found")}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 gap-1">
            <Book size={20} weight="duotone" style={{ color: "rgba(255,255,255,0.25)" }} />
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              {t("apps.dashboard.dictionary.placeholder", "Look up any word")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
