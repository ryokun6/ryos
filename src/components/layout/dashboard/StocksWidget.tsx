import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getStocks } from "@/api/misc";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type StocksWidgetConfig } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, Plus, X, ArrowClockwise } from "@phosphor-icons/react";

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
}

interface ChartPoint {
  x: number;
  y: number;
}

interface ApiQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

interface ApiChartPoint {
  timestamp: number;
  close: number;
}

const DEFAULT_SYMBOLS = ["^DJI", "^IXIC", "AAPL", "MSFT", "GOOG", "AMZN"];

const DISPLAY_NAMES: Record<string, string> = {
  "^DJI": "INDU",
  "^IXIC": "COMPX",
  "^GSPC": "S&P 500",
};

const POPULAR_SYMBOLS = [
  "AAPL", "MSFT", "GOOG", "AMZN", "TSLA", "META", "NFLX", "NVDA",
  "^DJI", "^IXIC", "^GSPC",
  "JPM", "V", "WMT", "DIS", "PYPL", "INTC", "AMD", "CRM", "ADBE",
];

const TIME_RANGES = ["1d", "3m", "6m", "1y", "2y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const RANGE_TO_API: Record<TimeRange, string> = {
  "1d": "1d",
  "3m": "3mo",
  "6m": "6mo",
  "1y": "1y",
  "2y": "2y",
};

function displaySymbol(sym: string): string {
  return DISPLAY_NAMES[sym] ?? sym;
}

function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(2);
  return price.toFixed(price % 1 === 0 ? 2 : price < 1 ? 4 : 2);
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return sign + change.toFixed(2);
}

function generateXLabels(timestamps: number[], range: TimeRange): string[] {
  if (timestamps.length < 2) return [];
  const count = 6;
  const step = Math.max(1, Math.floor(timestamps.length / count));
  const labels: string[] = [];

  for (let i = 0; i < timestamps.length; i += step) {
    const d = new Date(timestamps[i]);
    if (range === "1d") {
      labels.push(d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } else if (range === "2y") {
      labels.push(d.toLocaleDateString([], { year: "2-digit", month: "short" }));
    } else {
      labels.push(d.toLocaleDateString([], { month: "short" }));
    }
    if (labels.length >= count) break;
  }
  return labels;
}

function MiniChart({
  history,
  xLabels,
  isXpTheme,
  widgetId,
}: {
  history: number[];
  xLabels: string[];
  isXpTheme: boolean;
  widgetId: string;
}) {
  const width = 220;
  const height = 90;
  const topPad = 4;
  const bottomPad = 14;
  const leftPad = 4;
  const rightPad = 40;
  const gradientId = `chartFill-${widgetId}`;

  const chartW = width - rightPad - leftPad;
  const chartH = height - topPad - bottomPad;

  const { line, area, yLabels } = useMemo(() => {
    if (history.length < 2)
      return { line: [] as ChartPoint[], area: "", yLabels: [] as { value: number; y: number }[] };
    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = max - min || 1;

    const pts: ChartPoint[] = history.map((val, i) => ({
      x: leftPad + (i / (history.length - 1)) * chartW,
      y: topPad + chartH - ((val - min) / range) * chartH,
    }));

    const areaPath =
      `M ${pts[0].x} ${pts[0].y} ` +
      pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ") +
      ` L ${pts[pts.length - 1].x} ${topPad + chartH} L ${pts[0].x} ${topPad + chartH} Z`;

    const labelCount = 4;
    const yLbls = Array.from({ length: labelCount }, (_, i) => {
      const val = min + (range * (labelCount - 1 - i)) / (labelCount - 1);
      return {
        value: Math.round(val),
        y: topPad + (i / (labelCount - 1)) * chartH,
      };
    });

    return { line: pts, area: areaPath, yLabels: yLbls };
  }, [history, chartW, chartH]);

  if (line.length < 2) return null;

  const linePath =
    `M ${line[0].x} ${line[0].y} ` +
    line.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0.3} />
          <stop offset="20%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0.15} />
          <stop offset="50%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0.05} />
          <stop offset="100%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={isXpTheme ? "#2060A0" : "#FFFFFF"} strokeWidth={1.5} />
      {yLabels.map((label) => (
        <text
          key={label.value}
          x={width - rightPad + 4}
          y={label.y + 3}
          fill={isXpTheme ? "#666" : "rgba(255,255,255,0.4)"}
          fontSize={9}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
        >
          {label.value}
        </text>
      ))}
      {xLabels.map((label, i) => {
        const xPos = leftPad + (i / Math.max(xLabels.length - 1, 1)) * chartW;
        return (
          <text
            key={`${label}-${i}`}
            x={xPos}
            y={height - 2}
            fill={isXpTheme ? "#666" : "rgba(255,255,255,0.4)"}
            fontSize={9}
            fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
            textAnchor="middle"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

const quotesCache = new Map<string, { quotes: StockQuote[]; ts: number }>();
const chartCache = new Map<string, { history: number[]; timestamps: number[]; ts: number }>();
const CACHE_TTL_QUOTES = 60_000;
const CACHE_TTL_CHART = 120_000;

async function fetchQuotes(symbols: string[]): Promise<StockQuote[]> {
  const key = symbols.join(",");
  const cached = quotesCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_QUOTES) return cached.quotes;

  const data = await getStocks({ symbols });
  const quotes: StockQuote[] = (data.quotes as ApiQuote[]).map((q) => ({
    symbol: q.symbol,
    price: q.price,
    change: q.change,
  }));
  quotesCache.set(key, { quotes, ts: Date.now() });
  return quotes;
}

async function fetchChart(
  symbol: string,
  range: TimeRange
): Promise<{ history: number[]; timestamps: number[] }> {
  const key = `${symbol}:${range}`;
  const cached = chartCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_CHART) return cached;

  const apiRange = RANGE_TO_API[range];
  const data = await getStocks({ symbols: [symbol], chart: symbol, range: apiRange });
  const points = (data.chart ?? []) as ApiChartPoint[];
  const result = {
    history: points.map((p) => p.close),
    timestamps: points.map((p) => p.timestamp),
  };
  chartCache.set(key, { ...result, ts: Date.now() });
  return result;
}

interface StocksWidgetProps {
  widgetId: string;
}

export function StocksWidget({ widgetId }: StocksWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const config = widget?.config as StocksWidgetConfig | undefined;
  const symbols = config?.symbols ?? DEFAULT_SYMBOLS;

  const [stocks, setStocks] = useState<StockQuote[]>([]);
  const [chartHistory, setChartHistory] = useState<number[]>([]);
  const [chartTimestamps, setChartTimestamps] = useState<number[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(symbols[0]);
  const [selectedRange, setSelectedRange] = useState<TimeRange>("6m");
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadQuotes = useCallback(async () => {
    try {
      const quotes = await fetchQuotes(symbols);
      setStocks(quotes);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  const loadChart = useCallback(async () => {
    try {
      const { history, timestamps } = await fetchChart(selectedSymbol, selectedRange);
      setChartHistory(history);
      setChartTimestamps(timestamps);
    } catch {
      setChartHistory([]);
      setChartTimestamps([]);
    }
  }, [selectedSymbol, selectedRange]);

  useEffect(() => {
    loadQuotes();
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(loadQuotes, 60_000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [loadQuotes]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  useEffect(() => {
    if (!symbols.includes(selectedSymbol)) {
      setSelectedSymbol(symbols[0]);
    }
  }, [symbols, selectedSymbol]);

  const xLabels = useMemo(
    () => generateXLabels(chartTimestamps, selectedRange),
    [chartTimestamps, selectedRange]
  );

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  if (loading && stocks.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          minHeight: 200,
          color: isXpTheme ? "#888" : "rgba(255,255,255,0.4)",
          fontSize: 13,
          fontFamily: font,
        }}
      >
        {t("apps.dashboard.stocks.loading")}
      </div>
    );
  }

  if (!loading && stocks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 p-4"
        style={{
          minHeight: 200,
          color: isXpTheme ? "#888" : "rgba(255,255,255,0.4)",
          fontSize: 13,
          fontFamily: font,
        }}
      >
        <span>{t("apps.dashboard.stocks.unavailable")}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={loadQuotes}
          className="flex items-center gap-1 hover:opacity-80"
          style={{
            color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
            fontSize: 12,
            cursor: "pointer",
            border: "none",
            background: "none",
          }}
        >
          <ArrowClockwise size={12} weight="bold" />
          {t("apps.dashboard.stocks.retry")}
        </button>
      </div>
    );
  }

  if (isXpTheme) {
    return (
      <div className="p-2" style={{ fontFamily: font }}>
        <div className="space-y-0.5">
          {stocks.map((stock, i) => (
            <div
              key={stock.symbol}
              className="flex items-center justify-between px-1 py-0.5 cursor-pointer"
              style={{
                background:
                  selectedSymbol === stock.symbol
                    ? "rgba(0,102,204,0.1)"
                    : i % 2 === 0
                      ? "rgba(0,0,0,0.02)"
                      : "transparent",
                borderRadius: selectedSymbol === stock.symbol ? 4 : 2,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelectedSymbol(stock.symbol)}
            >
              <span className="font-bold" style={{ fontSize: 13, color: "#333", width: 58 }}>
                {displaySymbol(stock.symbol)}
              </span>
              <span style={{ fontSize: 13, color: "#333", flex: 1, textAlign: "right" }}>
                {formatPrice(stock.price)}
              </span>
              <span
                className="font-medium text-right"
                style={{
                  fontSize: 12,
                  width: 56,
                  marginLeft: 6,
                  color: stock.change >= 0 ? "#2E8B2E" : "#CC0000",
                }}
              >
                {formatChange(stock.change)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 pt-1" style={{ borderTop: "1px solid #D5D2CA" }}>
          <div className="flex items-center gap-1 mb-1 justify-center">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSelectedRange(r)}
                className="transition-colors"
                style={{
                  fontSize: 11,
                  fontWeight: selectedRange === r ? 700 : 400,
                  color: selectedRange === r ? "#0066CC" : "#888",
                  background: selectedRange === r ? "rgba(0,102,204,0.08)" : "transparent",
                  borderRadius: 3,
                  padding: "1px 5px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <MiniChart
              history={chartHistory}
              xLabels={xLabels}
              isXpTheme={isXpTheme}
              widgetId={widgetId}
            />
          </div>
          <div className="text-center mt-0.5" style={{ fontSize: 10, color: "#999" }}>
            {t("apps.dashboard.stocks.delayed")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ fontFamily: font, borderRadius: "inherit", overflow: "hidden", minHeight: "inherit" }}
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          background: "linear-gradient(180deg, #1B3A5C 0%, #0F2844 40%, #0A1E36 100%)",
          borderRadius: "inherit",
          minHeight: "inherit",
        }}
      >
        <div className="shrink-0 px-1 pt-1.5">
          {stocks.map((stock, i) => {
            const isFirst = i === 0;
            const isSelected = selectedSymbol === stock.symbol;
            return (
              <div
                key={stock.symbol}
                className="flex items-center px-2 cursor-pointer transition-colors"
                style={{
                  height: isFirst ? 32 : 28,
                  background: isSelected ? "rgba(255,255,255,0.08)" : "transparent",
                  borderRadius: isSelected ? 6 : 0,
                  borderBottom: !isSelected && i < stocks.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSelectedSymbol(stock.symbol)}
              >
                <span
                  className="font-bold"
                  style={{
                    fontSize: isFirst ? 15 : 14,
                    color: "rgba(255,255,255,0.9)",
                    width: 58,
                    letterSpacing: "0.02em",
                  }}
                >
                  {displaySymbol(stock.symbol)}
                </span>
                <span
                  className="flex-1 text-right font-medium"
                  style={{
                    fontSize: isFirst ? 15 : 14,
                    color: "rgba(255,255,255,0.85)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {formatPrice(stock.price)}
                </span>
                <span
                  className="font-bold text-right"
                  style={{
                    fontSize: isFirst ? 13 : 12,
                    width: 56,
                    marginLeft: 6,
                    padding: "1px 5px",
                    borderRadius: 3,
                    color: "#FFF",
                    background:
                      stock.change >= 0
                        ? "linear-gradient(180deg, #3DA03D 0%, #2D7E2D 100%)"
                        : "linear-gradient(180deg, #D94040 0%, #B52F2F 100%)",
                  }}
                >
                  {formatChange(stock.change)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end px-2 pt-1.5 pb-1.5">
          <div className="flex items-center gap-1 mb-1 justify-center">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSelectedRange(r)}
                style={{
                  fontSize: 11,
                  fontWeight: selectedRange === r ? 700 : 400,
                  color: selectedRange === r ? "#FFF" : "rgba(255,255,255,0.45)",
                  background: selectedRange === r ? "rgba(255,255,255,0.15)" : "transparent",
                  borderRadius: 9999,
                  padding: "2px 8px",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex flex-1 items-end justify-center">
            <MiniChart
              history={chartHistory}
              xLabels={xLabels}
              isXpTheme={false}
              widgetId={widgetId}
            />
          </div>
          <div
            className="text-center mt-1"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.02em" }}
          >
            {t("apps.dashboard.stocks.delayed")}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StocksBackPanel({
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
