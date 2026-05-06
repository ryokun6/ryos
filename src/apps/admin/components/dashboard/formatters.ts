/**
 * Pure formatting helpers shared by the Admin dashboard / analytics panels.
 * Kept in their own module so the component file stays react-refresh friendly
 * (Fast Refresh complains when a file mixes components and non-component
 * exports).
 */

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
