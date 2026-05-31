/**
 * Replace the `{size}` placeholder in a Kugou image URL with an actual size.
 * Kugou image URLs contain `{size}` that needs to be replaced with: 100, 150,
 * 240, 400, etc. Also upgrades `http://` to `https://` to avoid mixed-content
 * issues. Returns null when no URL is provided.
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
