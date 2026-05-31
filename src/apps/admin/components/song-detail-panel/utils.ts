/**
 * Replace {size} placeholder in Kugou image URL with actual size.
 * Also ensures HTTPS is used to avoid mixed content issues.
 */
export function formatKugouImageUrl(
  imgUrl: string | undefined,
  size: number = 400
): string | null {
  if (!imgUrl) return null;
  let url = imgUrl.replace("{size}", String(size));
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

export function formatOffset(ms: number | undefined): string {
  if (ms === undefined) return "0ms";
  const sign = ms >= 0 ? "+" : "";
  return `${sign}${ms}ms (${(ms / 1000).toFixed(2)}s)`;
}
