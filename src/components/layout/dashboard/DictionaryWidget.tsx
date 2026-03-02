import { useState, useCallback, useRef, useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type DictionaryWidgetConfig } from "@/stores/useDashboardStore";
import { MagnifyingGlass } from "@phosphor-icons/react";

interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
}

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings: DictionaryMeaning[];
}

type Tab = "dictionary" | "thesaurus";

interface DictionaryWidgetProps {
  widgetId?: string;
}

export function DictionaryWidget({ widgetId }: DictionaryWidgetProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const widget = useDashboardStore((s) =>
    s.widgets.find((w) => w.id === widgetId)
  );
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as DictionaryWidgetConfig | undefined;

  const [activeTab, setActiveTab] = useState<Tab>("dictionary");
  const [query, setQuery] = useState(config?.lastWord ?? "");
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const lookup = useCallback(
    async (word: string) => {
      const trimmed = word.trim();
      if (!trimmed) {
        setEntry(null);
        setError(null);
        setHasSearched(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const res = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          if (res.status === 404) {
            setEntry(null);
            setError("No definition found.");
          } else {
            setError("Lookup failed.");
          }
          setLoading(false);
          return;
        }
        const data: DictionaryEntry[] = await res.json();
        if (data.length > 0) {
          setEntry(data[0]);
          setError(null);
          if (widgetId) {
            updateWidgetConfig(widgetId, { lastWord: trimmed } as DictionaryWidgetConfig);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Lookup failed.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [widgetId, updateWidgetConfig]
  );

  useEffect(() => {
    if (config?.lastWord && !hasSearched) {
      lookup(config.lastWord);
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => lookup(value), 500);
    },
    [lookup]
  );

  const phonetic = entry?.phonetic || entry?.phonetics?.find((p) => p.text)?.text;

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const serifFont = "Georgia, 'Times New Roman', Times, serif";

  if (isXpTheme) {
    return (
      <div style={{ fontFamily: font, display: "flex", flexDirection: "column", minHeight: "inherit" }}>
        {/* XP header */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5"
          style={{ borderBottom: "1px solid #D5D2CA", flexShrink: 0 }}
        >
          <MagnifyingGlass size={12} weight="bold" style={{ color: "#888", flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Search…"
            className="flex-1 bg-transparent outline-none text-[11px]"
            style={{ color: "#000", caretColor: "#000" }}
          />
        </div>

        {/* XP content */}
        <div className="flex-1 overflow-y-auto px-3 py-2" style={{ fontSize: 11, minHeight: 0 }}>
          {loading && (
            <div className="text-center text-gray-400 py-4" style={{ fontSize: 10 }}>
              Looking up…
            </div>
          )}
          {!loading && error && (
            <div className="text-center text-gray-400 py-4" style={{ fontSize: 10 }}>
              {error}
            </div>
          )}
          {!loading && !error && !entry && (
            <div className="text-center text-gray-400 py-6" style={{ fontSize: 10 }}>
              {hasSearched ? "No results." : "Type a word to look it up."}
            </div>
          )}
          {!loading && entry && (
            <div>
              <div style={{ marginBottom: 4 }}>
                <span className="font-bold" style={{ fontSize: 14, color: "#000" }}>
                  {entry.word}
                </span>
                {phonetic && (
                  <span style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>{phonetic}</span>
                )}
              </div>
              {entry.meanings.map((m, mi) => (
                <div key={mi} style={{ marginBottom: 6 }}>
                  <div style={{ fontStyle: "italic", color: "#555", fontSize: 10, marginBottom: 2 }}>
                    {m.partOfSpeech}
                  </div>
                  {m.definitions.slice(0, 3).map((d, di) => (
                    <div key={di} style={{ marginBottom: 2, color: "#333", fontSize: 11, paddingLeft: 8 }}>
                      <span style={{ color: "#999", marginRight: 4 }}>{di + 1}.</span>
                      {d.definition}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // macOS Dashboard theme
  return (
    <div
      style={{
        fontFamily: font,
        display: "flex",
        flexDirection: "column",
        minHeight: "inherit",
        borderRadius: "inherit",
        overflow: "hidden",
      }}
    >
      {/* Leather-brown header */}
      <div
        style={{
          background: "linear-gradient(180deg, #7D5E3F 0%, #6B4C30 40%, #5A3E25 100%)",
          borderBottom: "1px solid #3E2A14",
          padding: "6px 10px 8px",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Subtle leather texture via inset shadow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.2)",
            pointerEvents: "none",
          }}
        />

        {/* Tab row */}
        <div
          className="flex items-center justify-center gap-0"
          style={{ position: "relative", marginBottom: 6 }}
        >
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setActiveTab("dictionary")}
            style={{
              fontSize: 11,
              fontWeight: activeTab === "dictionary" ? 700 : 400,
              color: activeTab === "dictionary" ? "#FFF" : "rgba(255,255,255,0.55)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "1px 4px",
              textShadow: "0 1px 2px rgba(0,0,0,0.4)",
              letterSpacing: "0.02em",
            }}
          >
            Dictionary
          </button>
          <span
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: 11,
              margin: "0 4px",
              userSelect: "none",
            }}
          >
            ·
          </span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setActiveTab("thesaurus")}
            style={{
              fontSize: 11,
              fontWeight: activeTab === "thesaurus" ? 700 : 400,
              color: activeTab === "thesaurus" ? "#FFF" : "rgba(255,255,255,0.55)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "1px 4px",
              textShadow: "0 1px 2px rgba(0,0,0,0.4)",
              letterSpacing: "0.02em",
            }}
          >
            Thesaurus
          </button>
        </div>

        {/* Search bar */}
        <div
          className="flex items-center gap-1.5"
          style={{
            background: "rgba(0,0,0,0.25)",
            borderRadius: 10,
            padding: "3px 8px",
            border: "1px solid rgba(0,0,0,0.2)",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <MagnifyingGlass
            size={11}
            weight="bold"
            style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Search…"
            className="flex-1 bg-transparent outline-none text-[11px]"
            style={{
              color: "#FFF",
              caretColor: "rgba(255,255,255,0.7)",
              fontFamily: font,
              fontSize: 11,
            }}
          />
        </div>
      </div>

      {/* Definition area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          background: "linear-gradient(180deg, #F5F0E8 0%, #EDE7DA 100%)",
          padding: "8px 12px",
          minHeight: 0,
        }}
      >
        {loading && (
          <div
            className="flex items-center justify-center py-6"
            style={{ color: "#9E9585", fontSize: 11, fontFamily: serifFont }}
          >
            Looking up…
          </div>
        )}

        {!loading && error && (
          <div
            className="flex items-center justify-center py-6"
            style={{ color: "#9E9585", fontSize: 11, fontFamily: serifFont, fontStyle: "italic" }}
          >
            {error}
          </div>
        )}

        {!loading && !error && !entry && (
          <div
            className="flex items-center justify-center py-8"
            style={{ color: "#B5AA98", fontSize: 12, fontFamily: serifFont, fontStyle: "italic" }}
          >
            {hasSearched ? "No results." : "Type a word to look it up."}
          </div>
        )}

        {!loading && entry && (
          <div style={{ fontFamily: serifFont }}>
            {/* Word & phonetic */}
            <div style={{ marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#2C2418",
                  letterSpacing: "-0.01em",
                }}
              >
                {entry.word}
              </span>
              {phonetic && (
                <span
                  style={{
                    fontSize: 12,
                    color: "#8C7E6A",
                    marginLeft: 8,
                    fontWeight: 400,
                  }}
                >
                  {phonetic}
                </span>
              )}
            </div>

            {/* Meanings */}
            {entry.meanings.map((m, mi) => (
              <div key={mi} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontStyle: "italic",
                    color: "#6B5D4D",
                    fontSize: 11,
                    marginBottom: 3,
                    fontWeight: 600,
                  }}
                >
                  {m.partOfSpeech}
                </div>
                {m.definitions.slice(0, activeTab === "dictionary" ? 3 : 2).map((d, di) => (
                  <div
                    key={di}
                    style={{
                      marginBottom: 3,
                      color: "#3D3226",
                      fontSize: 12,
                      lineHeight: 1.45,
                      paddingLeft: 10,
                    }}
                  >
                    <span style={{ color: "#9E9585", marginRight: 4, fontSize: 11 }}>
                      {di + 1}.
                    </span>
                    {d.definition}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DictionaryBackPanel({
  widgetId: _widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";
  const mutedColor = isXpTheme ? "#888" : "rgba(255,255,255,0.4)";

  return (
    <div className="px-4 py-3" onPointerDown={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 11, color: textColor, lineHeight: 1.5 }}>
        <p style={{ marginBottom: 8 }}>
          Definitions provided by the{" "}
          <span style={{ fontWeight: 600 }}>Free Dictionary API</span>, an
          open-source project.
        </p>
        <p style={{ fontSize: 10, color: mutedColor }}>
          Data sourced from Wiktionary and other open dictionaries. Results may
          vary for uncommon words.
        </p>
      </div>
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="mt-3 text-[10px] font-medium hover:opacity-80 transition-opacity"
          style={{
            color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
            cursor: "pointer",
            border: "none",
            background: "none",
            padding: 0,
          }}
        >
          Done
        </button>
      )}
    </div>
  );
}
