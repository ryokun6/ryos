import { apiRequest } from "@/api/core";

export interface StockApiQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

export interface StockApiChartPoint {
  timestamp: number;
  close: number;
}

export interface StocksApiResponse {
  quotes: StockApiQuote[];
  chart?: StockApiChartPoint[];
}

export async function getStocks(params: {
  symbols: string[];
  chart?: string;
  range?: string;
}): Promise<StocksApiResponse> {
  return apiRequest<StocksApiResponse>({
    path: "/api/stocks",
    method: "GET",
    query: {
      symbols: params.symbols.join(","),
      chart: params.chart,
      range: params.range,
    },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
