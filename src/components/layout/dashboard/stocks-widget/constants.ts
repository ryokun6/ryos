export const DEFAULT_SYMBOLS = ["^DJI", "^IXIC", "AAPL", "MSFT", "GOOG", "AMZN"];

export const DISPLAY_NAMES: Record<string, string> = {
  "^DJI": "INDU",
  "^IXIC": "COMPX",
  "^GSPC": "S&P 500",
};

export const POPULAR_SYMBOLS = [
  "AAPL", "MSFT", "GOOG", "AMZN", "TSLA", "META", "NFLX", "NVDA",
  "^DJI", "^IXIC", "^GSPC",
  "JPM", "V", "WMT", "DIS", "PYPL", "INTC", "AMD", "CRM", "ADBE",
];

export const TIME_RANGES = ["1d", "3m", "6m", "1y", "2y"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const RANGE_TO_API: Record<TimeRange, string> = {
  "1d": "1d",
  "3m": "3mo",
  "6m": "6mo",
  "1y": "1y",
  "2y": "2y",
};

export const STOCKS_FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
