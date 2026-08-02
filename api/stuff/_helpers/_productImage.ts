import {
  safeFetchWithRedirects,
  validatePublicUrl,
} from "../../_utils/_ssrf.js";

const USER_AGENT = "ryOS-Stuff/1.0 (https://os.ryo.lu)";
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

/** Server-side fetch for product cover URLs (avoids browser CORS). */
export async function fetchProductImageAsDataUrl(
  url: string
): Promise<string | undefined> {
  try {
    await validatePublicUrl(url);
    const { response } = await safeFetchWithRedirects(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
      { maxRedirects: 5 }
    );

    if (!response.ok) return undefined;

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) return undefined;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      return undefined;
    }

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}
