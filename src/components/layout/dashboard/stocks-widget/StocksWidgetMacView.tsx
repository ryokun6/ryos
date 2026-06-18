import { useTranslation } from "react-i18next";
import { TIME_RANGES, STOCKS_FONT } from "./constants";
import type { TimeRange } from "./constants";
import { MiniChart } from "./MiniChart";
import { displaySymbol, formatChange, formatPrice } from "./utils";
import type { StockQuote } from "./types";

export function StocksWidgetMacView({
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
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ fontFamily: STOCKS_FONT, borderRadius: "inherit", overflow: "hidden", minHeight: "inherit" }}
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
                onClick={() => onSelectSymbol(stock.symbol)}
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
                onClick={() => onSelectRange(r)}
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
              isWindowsTheme={false}
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
