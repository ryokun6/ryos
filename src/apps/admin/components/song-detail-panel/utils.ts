export { formatKugouImageUrl } from "@/utils/coverArt";

export function formatOffset(ms: number | undefined): string {
  if (ms === undefined) return "0ms";
  const sign = ms >= 0 ? "+" : "";
  return `${sign}${ms}ms (${(ms / 1000).toFixed(2)}s)`;
}
