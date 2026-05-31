import { DISPLAY_NAMES, type TimeRange } from "./constants";

export function displaySymbol(sym: string): string {
  return DISPLAY_NAMES[sym] ?? sym;
}

export function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(2);
  return price.toFixed(price % 1 === 0 ? 2 : price < 1 ? 4 : 2);
}

export function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return sign + change.toFixed(2);
}

export function generateXLabels(timestamps: number[], range: TimeRange): string[] {
  if (timestamps.length < 2) return [];
  const count = 6;
  const step = Math.max(1, Math.floor(timestamps.length / count));
  const labels: string[] = [];

  for (let i = 0; i < timestamps.length; i += step) {
    const d = new Date(timestamps[i]);
    if (range === "1d") {
      labels.push(d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } else if (range === "2y") {
      labels.push(d.toLocaleDateString([], { year: "2-digit", month: "short" }));
    } else {
      labels.push(d.toLocaleDateString([], { month: "short" }));
    }
    if (labels.length >= count) break;
  }
  return labels;
}
