import { useTranslation } from "react-i18next";
import { ArrowClockwise } from "@phosphor-icons/react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { STOCKS_FONT } from "./constants";
import type { StocksWidgetProps } from "./types";
import { useStocksWidgetData } from "./useStocksWidgetData";
import { StocksWidgetMacView } from "./StocksWidgetMacView";
import { StocksWidgetXpView } from "./StocksWidgetXpView";

export function StocksWidget({ widgetId }: StocksWidgetProps) {
  const { t } = useTranslation();
  const { isWindowsTheme } = useThemeFlags();

  const {
    stocks,
    chartHistory,
    selectedSymbol,
    setSelectedSymbol,
    selectedRange,
    setSelectedRange,
    loading,
    loadQuotes,
    xLabels,
  } = useStocksWidgetData(widgetId);

  if (loading && stocks.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          minHeight: 200,
          color: isWindowsTheme ? "#888" : "rgba(255,255,255,0.4)",
          fontSize: 13,
          fontFamily: STOCKS_FONT,
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
          color: isWindowsTheme ? "#888" : "rgba(255,255,255,0.4)",
          fontSize: 13,
          fontFamily: STOCKS_FONT,
        }}
      >
        <span>{t("apps.dashboard.stocks.unavailable")}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={loadQuotes}
          className="flex items-center gap-1 hover:opacity-80"
          style={{
            color: isWindowsTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
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

  const viewProps = {
    widgetId,
    stocks,
    chartHistory,
    xLabels,
    selectedSymbol,
    onSelectSymbol: setSelectedSymbol,
    selectedRange,
    onSelectRange: setSelectedRange,
  };

  if (isWindowsTheme) {
    return <StocksWidgetXpView {...viewProps} />;
  }

  return <StocksWidgetMacView {...viewProps} />;
}
