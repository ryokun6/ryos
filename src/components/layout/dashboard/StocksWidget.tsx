import { useState, useCallback, useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type StocksWidgetConfig } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
}

interface ChartPoint {
  x: number;
  y: number;
}

const DEMO_STOCKS: Record<string, { price: number; change: number; history: number[] }> = {
  INDU: {
    price: 10784.41,
    change: -11.6,
    history: [9680, 9750, 9900, 10100, 10050, 10200, 10350, 10457, 10600, 10450, 10700, 10923, 10784],
  },
  COMPX: {
    price: 2080.53,
    change: 3.87,
    history: [1850, 1900, 1920, 1980, 1950, 2010, 2040, 2000, 2050, 2070, 2060, 2090, 2080],
  },
  AAPL: {
    price: 83.11,
    change: 1.9,
    history: [55, 58, 60, 62, 65, 68, 70, 72, 75, 78, 80, 82, 83],
  },
  MSFT: {
    price: 26.0,
    change: 0.03,
    history: [24, 24.5, 25, 24.8, 25.2, 25.5, 25.3, 25.8, 26, 25.7, 26.1, 25.9, 26],
  },
  GOOG: {
    price: 186.0,
    change: -1.4,
    history: [200, 198, 195, 190, 188, 185, 182, 184, 187, 190, 188, 185, 186],
  },
  AMZN: {
    price: 36.1582,
    change: 0.37,
    history: [30, 31, 32, 33, 32.5, 33.5, 34, 34.5, 35, 35.5, 35.8, 36, 36.16],
  },
  TSLA: {
    price: 248.42,
    change: 5.73,
    history: [180, 190, 200, 210, 205, 215, 220, 230, 235, 240, 245, 250, 248],
  },
  META: {
    price: 512.3,
    change: -3.21,
    history: [480, 490, 500, 510, 505, 515, 520, 518, 515, 510, 512, 514, 512],
  },
  NFLX: {
    price: 628.15,
    change: 8.42,
    history: [550, 560, 570, 580, 590, 595, 600, 610, 615, 620, 625, 630, 628],
  },
  NVDA: {
    price: 875.28,
    change: 12.45,
    history: [700, 720, 740, 760, 780, 800, 820, 840, 850, 860, 870, 880, 875],
  },
};

const DEFAULT_SYMBOLS = ["INDU", "COMPX", "AAPL", "MSFT", "GOOG", "AMZN"];
const ALL_SYMBOLS = Object.keys(DEMO_STOCKS);

const TIME_RANGES = ["1d", "3m", "6m", "1y", "2y"] as const;
const MONTH_LABELS_MAP: Record<string, string[]> = {
  "1d": ["9AM", "10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM"],
  "3m": ["Jan", "Feb", "Mar"],
  "6m": ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"],
  "1y": ["Mar", "May", "Jul", "Sep", "Nov", "Jan"],
  "2y": ["2024", "Q2", "Q3", "Q4", "2025", "Q2"],
};

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(2);
  return price.toFixed(price % 1 === 0 ? 2 : price < 1 ? 4 : 2);
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return sign + change.toFixed(2);
}

function generateChartPoints(
  history: number[],
  width: number,
  height: number,
  padding: number
): { line: ChartPoint[]; area: string; yLabels: { value: number; y: number }[] } {
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const line: ChartPoint[] = history.map((val, i) => ({
    x: padding + (i / (history.length - 1)) * chartW,
    y: padding + chartH - ((val - min) / range) * chartH,
  }));

  const areaPath =
    `M ${line[0].x} ${line[0].y} ` +
    line
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ") +
    ` L ${line[line.length - 1].x} ${padding + chartH} L ${line[0].x} ${padding + chartH} Z`;

  const labelCount = 4;
  const yLabels = Array.from({ length: labelCount }, (_, i) => {
    const val = min + (range * (labelCount - 1 - i)) / (labelCount - 1);
    return {
      value: Math.round(val),
      y: padding + (i / (labelCount - 1)) * chartH,
    };
  });

  return { line, area: areaPath, yLabels };
}

function MiniChart({
  history,
  selectedRange,
  isXpTheme,
}: {
  history: number[];
  selectedRange: string;
  isXpTheme: boolean;
}) {
  const width = 220;
  const height = 80;
  const padding = 4;
  const rightPad = 40;

  const { line, area, yLabels } = useMemo(
    () => generateChartPoints(history, width - rightPad, height, padding),
    [history]
  );

  const monthLabels = MONTH_LABELS_MAP[selectedRange] || MONTH_LABELS_MAP["6m"];
  const linePath =
    `M ${line[0].x} ${line[0].y} ` +
    line
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
    >
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={isXpTheme ? "#4A90D9" : "#4A90D9"}
            stopOpacity={0.5}
          />
          <stop
            offset="100%"
            stopColor={isXpTheme ? "#4A90D9" : "#4A90D9"}
            stopOpacity={0.05}
          />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#chartFill)" />
      <path
        d={linePath}
        fill="none"
        stroke={isXpTheme ? "#2060A0" : "#6AB4FF"}
        strokeWidth={1.5}
      />
      {yLabels.map((label) => (
        <text
          key={label.value}
          x={width - rightPad + 4}
          y={label.y + 3}
          fill={isXpTheme ? "#666" : "rgba(255,255,255,0.4)"}
          fontSize={8}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
        >
          {label.value}
        </text>
      ))}
      {monthLabels.map((label, i) => {
        const xPos =
          padding + (i / (monthLabels.length - 1)) * (width - rightPad - padding * 2);
        return (
          <text
            key={`${label}-${i}`}
            x={xPos}
            y={height - 1}
            fill={isXpTheme ? "#666" : "rgba(255,255,255,0.4)"}
            fontSize={7}
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

interface StocksWidgetProps {
  widgetId: string;
}

export function StocksWidget({ widgetId }: StocksWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const widget = useDashboardStore((s) =>
    s.widgets.find((w) => w.id === widgetId)
  );
  const config = widget?.config as StocksWidgetConfig | undefined;
  const symbols = config?.symbols ?? DEFAULT_SYMBOLS;

  const [selectedSymbol, setSelectedSymbol] = useState<string>(symbols[0]);
  const [selectedRange, setSelectedRange] = useState<string>("6m");

  const stocks: StockQuote[] = symbols
    .filter((sym) => DEMO_STOCKS[sym])
    .map((sym) => ({
      symbol: sym,
      price: DEMO_STOCKS[sym].price,
      change: DEMO_STOCKS[sym].change,
    }));

  const selectedStock = DEMO_STOCKS[selectedSymbol] || DEMO_STOCKS[symbols[0]];

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

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
                borderRadius: 2,
              }}
              onClick={() => setSelectedSymbol(stock.symbol)}
            >
              <span
                className="font-bold"
                style={{ fontSize: 11, color: "#333", width: 48 }}
              >
                {stock.symbol}
              </span>
              <span style={{ fontSize: 11, color: "#333", flex: 1, textAlign: "right" }}>
                {formatPrice(stock.price)}
              </span>
              <span
                className="font-medium text-right"
                style={{
                  fontSize: 10,
                  width: 48,
                  marginLeft: 6,
                  color: stock.change >= 0 ? "#2E8B2E" : "#CC0000",
                }}
              >
                {formatChange(stock.change)}
              </span>
            </div>
          ))}
        </div>
        <div
          className="mt-1 pt-1"
          style={{ borderTop: "1px solid #D5D2CA" }}
        >
          <div className="flex items-center gap-1 mb-1 justify-center">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRange(r)}
                className="transition-colors"
                style={{
                  fontSize: 9,
                  fontWeight: selectedRange === r ? 700 : 400,
                  color: selectedRange === r ? "#0066CC" : "#888",
                  background: selectedRange === r ? "rgba(0,102,204,0.08)" : "transparent",
                  borderRadius: 3,
                  padding: "1px 4px",
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
              history={selectedStock.history}
              selectedRange={selectedRange}
              isXpTheme={isXpTheme}
            />
          </div>
          <div
            className="text-center mt-0.5"
            style={{ fontSize: 8, color: "#999" }}
          >
            {t("apps.dashboard.stocks.delayed")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{
        fontFamily: font,
        borderRadius: "inherit",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(180deg, #1B3A5C 0%, #0F2844 40%, #0A1E36 100%)",
          borderRadius: "inherit",
        }}
      >
        {/* Stock rows */}
        <div className="px-1 pt-1.5">
          {stocks.map((stock, i) => {
            const isFirst = i === 0;
            const isSelected = selectedSymbol === stock.symbol;
            return (
              <div
                key={stock.symbol}
                className="flex items-center px-2 cursor-pointer transition-colors"
                style={{
                  height: isFirst ? 28 : 24,
                  background: isSelected
                    ? "rgba(255,255,255,0.08)"
                    : "transparent",
                  borderBottom:
                    i < stocks.length - 1
                      ? "1px solid rgba(255,255,255,0.06)"
                      : "none",
                }}
                onClick={() => setSelectedSymbol(stock.symbol)}
              >
                <span
                  className="font-bold"
                  style={{
                    fontSize: isFirst ? 13 : 12,
                    color: "rgba(255,255,255,0.9)",
                    width: 52,
                    letterSpacing: "0.02em",
                  }}
                >
                  {stock.symbol}
                </span>
                <span
                  className="flex-1 text-right font-medium"
                  style={{
                    fontSize: isFirst ? 13 : 12,
                    color: "rgba(255,255,255,0.85)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {formatPrice(stock.price)}
                </span>
                <span
                  className="font-bold text-right"
                  style={{
                    fontSize: isFirst ? 11 : 10,
                    width: 50,
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

        {/* Chart section */}
        <div className="px-2 pt-1.5 pb-1">
          <div className="flex items-center gap-1 mb-1 justify-center">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRange(r)}
                style={{
                  fontSize: 9,
                  fontWeight: selectedRange === r ? 700 : 400,
                  color:
                    selectedRange === r
                      ? "#FFF"
                      : "rgba(255,255,255,0.45)",
                  background:
                    selectedRange === r
                      ? "rgba(255,255,255,0.15)"
                      : "transparent",
                  borderRadius: 3,
                  padding: "1px 5px",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <MiniChart
              history={selectedStock.history}
              selectedRange={selectedRange}
              isXpTheme={false}
            />
          </div>
          <div
            className="text-center mt-0.5"
            style={{
              fontSize: 8,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.02em",
            }}
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

  const widget = useDashboardStore((s) =>
    s.widgets.find((w) => w.id === widgetId)
  );
  const config = widget?.config as StocksWidgetConfig | undefined;
  const currentSymbols = config?.symbols ?? DEFAULT_SYMBOLS;

  const [searchQuery, setSearchQuery] = useState("");

  const availableSymbols = useMemo(() => {
    const filtered = ALL_SYMBOLS.filter(
      (s) => !currentSymbols.includes(s)
    );
    if (!searchQuery) return filtered;
    return filtered.filter((s) =>
      s.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentSymbols, searchQuery]);

  const addSymbol = useCallback(
    (symbol: string) => {
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

  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{
          borderBottom: isXpTheme
            ? "1px solid #D5D2CA"
            : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <MagnifyingGlass
          size={12}
          weight="bold"
          style={{
            color: isXpTheme ? "#888" : "rgba(255,255,255,0.35)",
            flexShrink: 0,
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("apps.dashboard.stocks.searchSymbol")}
          className="flex-1 bg-transparent outline-none text-[11px]"
          style={{
            color: textColor,
            caretColor: isXpTheme ? "#000" : "rgba(255,255,255,0.7)",
          }}
        />
      </div>

      {/* Current symbols */}
      <div
        className="px-3 py-1.5"
        style={{
          borderBottom: isXpTheme
            ? "1px solid #D5D2CA"
            : "1px solid rgba(255,255,255,0.08)",
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
                background: isXpTheme
                  ? "rgba(0,0,0,0.06)"
                  : "rgba(255,255,255,0.1)",
                color: textColor,
              }}
            >
              {sym}
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
                    style={{
                      color: isXpTheme
                        ? "#CC0000"
                        : "rgba(255,100,100,0.8)",
                    }}
                  />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Available symbols to add */}
      <div className="overflow-y-auto" style={{ maxHeight: 140 }}>
        {availableSymbols.map((sym) => (
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
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <Plus
              size={10}
              weight="bold"
              style={{
                color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.7)",
                flexShrink: 0,
              }}
            />
            <span className="text-[11px]" style={{ color: textColor }}>
              {sym}
            </span>
            <span
              className="text-[9px] ml-auto"
              style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.3)" }}
            >
              {formatPrice(DEMO_STOCKS[sym].price)}
            </span>
          </button>
        ))}
        {availableSymbols.length === 0 && (
          <div
            className="px-3 py-2 text-center text-[10px]"
            style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.3)" }}
          >
            {searchQuery
              ? t("apps.dashboard.stocks.noResults")
              : t("apps.dashboard.stocks.allAdded")}
          </div>
        )}
      </div>

      {/* Reset button */}
      <div
        className="px-3 py-1.5"
        style={{
          borderTop: isXpTheme
            ? "1px solid #D5D2CA"
            : "1px solid rgba(255,255,255,0.08)",
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
