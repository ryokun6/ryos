import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useDashboardStore, type StocksWidgetConfig } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { DEFAULT_SYMBOLS, POPULAR_SYMBOLS } from "./constants";
import { displaySymbol } from "./utils";
import type { StocksBackPanelProps } from "./types";

export function StocksBackPanel({ widgetId, onDone }: StocksBackPanelProps) {
  const { t } = useTranslation();
  const { isWindowsTheme: isXpTheme } = useThemeFlags();
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);

  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const config = widget?.config as StocksWidgetConfig | undefined;
  const currentSymbols = config?.symbols ?? DEFAULT_SYMBOLS;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availablePopular = useMemo(
    () => POPULAR_SYMBOLS.filter((s) => !currentSymbols.includes(s)),
    [currentSymbols]
  );

  const searchSymbols = useCallback(
    (query: string) => {
      if (query.length < 1) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const upper = query.toUpperCase();
      const matches = POPULAR_SYMBOLS.filter(
        (s) => s.includes(upper) && !currentSymbols.includes(s)
      );
      if (matches.length > 0) {
        setSearchResults(matches);
      } else {
        setSearchResults([upper]);
      }
      setSearching(false);
    },
    [currentSymbols]
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!value) {
        setSearchResults([]);
        return;
      }
      searchTimerRef.current = setTimeout(() => searchSymbols(value), 400);
    },
    [searchSymbols]
  );

  const addSymbol = useCallback(
    (symbol: string) => {
      if (currentSymbols.includes(symbol)) return;
      const updated = [...currentSymbols, symbol];
      updateWidgetConfig(widgetId, { symbols: updated } as StocksWidgetConfig);
    },
    [currentSymbols, widgetId, updateWidgetConfig]
  );

  const removeSymbol = useCallback(
    (symbol: string) => {
      const updated = currentSymbols.filter((s) => s !== symbol);
      if (updated.length === 0) return;
      updateWidgetConfig(widgetId, { symbols: updated } as StocksWidgetConfig);
    },
    [currentSymbols, widgetId, updateWidgetConfig]
  );

  const resetToDefault = useCallback(() => {
    updateWidgetConfig(widgetId, { symbols: DEFAULT_SYMBOLS } as StocksWidgetConfig);
    onDone?.();
  }, [widgetId, updateWidgetConfig, onDone]);

  const symbolsToShow = searchQuery ? searchResults.filter((s) => !currentSymbols.includes(s)) : availablePopular;
  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{
          borderBottom: isXpTheme ? "1px solid #D5D2CA" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <MagnifyingGlass
          size={12}
          weight="bold"
          style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.35)", flexShrink: 0 }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder={t("apps.dashboard.stocks.searchSymbol")}
          className="flex-1 bg-transparent outline-none text-[11px]"
          style={{ color: textColor, caretColor: isXpTheme ? "#000" : "rgba(255,255,255,0.7)" }}
        />
      </div>

      <div
        className="px-3 py-1.5"
        style={{
          borderBottom: isXpTheme ? "1px solid #D5D2CA" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="text-[9px] font-bold uppercase tracking-wider mb-1"
          style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.35)" }}
        >
          {t("apps.dashboard.stocks.currentSymbols")}
        </div>
        <div className="flex flex-wrap gap-1">
          {currentSymbols.map((sym) => (
            <span
              key={sym}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                background: isXpTheme ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)",
                color: textColor,
              }}
            >
              {displaySymbol(sym)}
              {currentSymbols.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSymbol(sym)}
                  className="hover:opacity-80"
                  style={{ cursor: "pointer", lineHeight: 1 }}
                >
                  <X
                    size={8}
                    weight="bold"
                    style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.4)" }}
                  />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 140 }}>
        {searching ? (
          <div
            className="px-3 py-3 text-center text-[10px]"
            style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.3)" }}
          >
            {t("apps.dashboard.stocks.searching")}
          </div>
        ) : (
          symbolsToShow.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => addSymbol(sym)}
              className="w-full flex items-center gap-1.5 px-3 py-1 text-left transition-colors"
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = isXpTheme
                  ? "rgba(0,102,204,0.08)"
                  : "rgba(255,255,255,0.06)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Plus
                size={10}
                weight="bold"
                style={{ color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.7)", flexShrink: 0 }}
              />
              <span className="text-[11px]" style={{ color: textColor }}>
                {displaySymbol(sym)}
              </span>
              <span
                className="text-[9px] ml-auto"
                style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.3)" }}
              >
                {sym}
              </span>
            </button>
          ))
        )}
        {!searching && symbolsToShow.length === 0 && (
          <div
            className="px-3 py-2 text-center text-[10px]"
            style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.3)" }}
          >
            {searchQuery ? t("apps.dashboard.stocks.noResults") : t("apps.dashboard.stocks.allAdded")}
          </div>
        )}
      </div>

      <div
        className="px-3 py-1.5"
        style={{
          borderTop: isXpTheme ? "1px solid #D5D2CA" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <button
          type="button"
          onClick={resetToDefault}
          className="text-[10px] font-medium hover:opacity-80 transition-opacity"
          style={{
            color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
            cursor: "pointer",
            border: "none",
            background: "none",
            padding: 0,
          }}
        >
          {t("apps.dashboard.stocks.resetDefaults")}
        </button>
      </div>
    </div>
  );
}
