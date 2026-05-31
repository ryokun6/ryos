export type RateCacheEntry = { rate: number; rateDate: string; fetchedAt: number };

export type CurrencyWidgetState = {
  fromCurrency: string;
  toCurrency: string;
  amountStr: string;
  rateData: RateCacheEntry | null;
  loading: boolean;
  error: string | null;
  usingCache: boolean;
};

export type CurrencyWidgetAction =
  | { type: "set"; payload: Partial<CurrencyWidgetState> }
  | { type: "swapCurrencies" };

export interface CurrencyWidgetProps {
  widgetId?: string;
}

export interface CurrencyBackPanelProps {
  widgetId: string;
  onDone?: () => void;
}
