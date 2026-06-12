import { useState, useEffect, useCallback, useMemo } from "react";
import { useDashboardStore, type StocksWidgetConfig } from "@/stores/useDashboardStore";
import { createVisibilityGatedInterval } from "@/utils/backgroundTask";
import { DEFAULT_SYMBOLS } from "./constants";
import type { TimeRange } from "./constants";
import { fetchChart, fetchQuotes } from "./api";
import { generateXLabels } from "./utils";
import type { StockQuote } from "./types";

export function useStocksWidgetData(widgetId: string) {
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
    // Refresh quotes every 60s, paused while the tab is hidden.
    return createVisibilityGatedInterval(() => {
      void loadQuotes();
    }, 60_000);
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

  return {
    stocks,
    chartHistory,
    selectedSymbol,
    setSelectedSymbol,
    selectedRange,
    setSelectedRange,
    loading,
    loadQuotes,
    xLabels,
  };
}
