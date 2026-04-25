/**
 * Replace Kugou's {size} placeholder and force HTTPS for browser-safe covers.
 */
export function formatKugouImageUrl(
  imgUrl: string | null | undefined,
  size: number = 400
): string | null {
  if (!imgUrl) return null;
  return imgUrl.replace("{size}", String(size)).replace(/^http:\/\//, "https://");
}
