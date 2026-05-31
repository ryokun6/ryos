import { RANGE_TO_API, type TimeRange } from "./constants";
import type { ApiChartPoint, ApiQuote, StockQuote } from "./types";

const quotesCache = new Map<string, { quotes: StockQuote[]; ts: number }>();
const chartCache = new Map<string, { history: number[]; timestamps: number[]; ts: number }>();
const CACHE_TTL_QUOTES = 60_000;
const CACHE_TTL_CHART = 120_000;

export async function fetchQuotes(symbols: string[]): Promise<StockQuote[]> {
  const key = symbols.join(",");
  const cached = quotesCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_QUOTES) return cached.quotes;

  const res = await fetch(`/api/stocks?symbols=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const quotes: StockQuote[] = (data.quotes as ApiQuote[]).map((q) => ({
    symbol: q.symbol,
    price: q.price,
    change: q.change,
  }));
  quotesCache.set(key, { quotes, ts: Date.now() });
  return quotes;
}

export async function fetchChart(
  symbol: string,
  range: TimeRange
): Promise<{ history: number[]; timestamps: number[] }> {
  const key = `${symbol}:${range}`;
  const cached = chartCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_CHART) return cached;

  const apiRange = RANGE_TO_API[range];
  const res = await fetch(
    `/api/stocks?symbols=${encodeURIComponent(symbol)}&chart=${encodeURIComponent(symbol)}&range=${apiRange}`
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const points = (data.chart ?? []) as ApiChartPoint[];
  const result = {
    history: points.map((p) => p.close),
    timestamps: points.map((p) => p.timestamp),
  };
  chartCache.set(key, { ...result, ts: Date.now() });
  return result;
}
