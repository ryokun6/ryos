import { useTranslation } from "react-i18next";
import { STOCKS_FONT, TIME_RANGES, type TimeRange } from "./constants";
import { MiniChart } from "./MiniChart";
import { displaySymbol, formatChange, formatPrice } from "./utils";
import type { StockQuote } from "./types";

export function StocksWidgetXpView({
  widgetId,
  stocks,
  chartHistory,
  xLabels,
  selectedSymbol,
  onSelectSymbol,
  selectedRange,
  onSelectRange,
}: {
  widgetId: string;
  stocks: StockQuote[];
  chartHistory: number[];
  xLabels: string[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  selectedRange: TimeRange;
  onSelectRange: (range: TimeRange) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="p-2" style={{ fontFamily: STOCKS_FONT }}>
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
            onClick={() => onSelectSymbol(stock.symbol)}
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
              onClick={() => onSelectRange(r)}
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
            isWindowsTheme
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
