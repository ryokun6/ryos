export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ApiQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

export interface ApiChartPoint {
  timestamp: number;
  close: number;
}

export interface StocksWidgetProps {
  widgetId: string;
}

export interface StocksBackPanelProps {
  widgetId: string;
  onDone?: () => void;
}
