/**
 * Helpers for accepting Stuff cover images from file pickers, drag-drop,
 * and clipboard paste (including Chrome "Copy image" HTML/URL payloads).
 */

const COVER_EXT_MIME: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpe: "image/jpeg",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const IMG_SRC_ATTR_RE =
  /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

export function mimeTypeFromFileName(fileName: string): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  if (!match) return undefined;
  return COVER_EXT_MIME[match[1].toLowerCase()];
}

/** True when MIME or filename extension indicates a raster/vector image. */
export function looksLikeStuffCoverImage(file: {
  type?: string;
  name?: string;
}): boolean {
  const type = file.type?.trim() ?? "";
  if (type.startsWith("image/")) return true;
  return Boolean(mimeTypeFromFileName(file.name ?? ""));
}

/**
 * Accept cover files by MIME, or by common image extension when the browser
 * leaves `file.type` empty (seen with some JPG/HEIC-adjacent downloads).
 * Oversized files are allowed — `putStuffCoverBlob` compresses them.
 */
export function isAcceptableStuffCoverFile(file: {
  type?: string;
  name?: string;
  size: number;
}): boolean {
  if (!(file.size > 0)) return false;
  return looksLikeStuffCoverImage(file);
}

/** Ensure a File has an image/* MIME when we can infer it from the name. */
export function ensureStuffCoverFileType(file: File): File {
  if (file.type.startsWith("image/")) return file;
  const mime = mimeTypeFromFileName(file.name);
  if (!mime) return file;
  return new File([file], file.name, {
    type: mime,
    lastModified: file.lastModified,
  });
}

export function getImageFileFromDataTransfer(
  data: DataTransfer | null
): File | null {
  if (!data) return null;

  const fromFiles = Array.from(data.files ?? []).find((file) =>
    looksLikeStuffCoverImage(file)
  );
  if (fromFiles) return ensureStuffCoverFileType(fromFiles);

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    if (!item.type.startsWith("image/") && item.type !== "") continue;
    const file = item.getAsFile();
    if (!file) continue;
    if (!looksLikeStuffCoverImage(file)) continue;
    return ensureStuffCoverFileType(file);
  }

  return null;
}

export function isDataImageUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith("data:image/");
}

export function isHttpImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Plain-text URLs that look like images (extension or data:image). */
export function isLikelyPlainImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (isDataImageUrl(trimmed)) return true;
  if (trimmed.toLowerCase().startsWith("blob:")) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return Boolean(mimeTypeFromFileName(parsed.pathname));
  } catch {
    return false;
  }
}

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Pull the first `<img src>` from clipboard HTML (Chrome "Copy image"). */
export function extractImageUrlFromHtml(html: string): string | null {
  const match = IMG_SRC_ATTR_RE.exec(html);
  if (!match) return null;
  const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
  if (!raw) return null;
  return decodeHtmlAttr(raw);
}

/**
 * Best-effort image URL from clipboard text/html or text/plain.
 * HTML `<img src>` is trusted; plain text must look like an image URL.
 */
export function extractClipboardImageUrl(
  data: DataTransfer | null
): string | null {
  if (!data) return null;

  const html = data.getData("text/html")?.trim() ?? "";
  if (html) {
    const fromHtml = extractImageUrlFromHtml(html);
    if (fromHtml) {
      if (
        isDataImageUrl(fromHtml) ||
        isHttpImageUrl(fromHtml) ||
        fromHtml.toLowerCase().startsWith("blob:")
      ) {
        return fromHtml;
      }
    }
  }

  const plain = data.getData("text/plain")?.trim() ?? "";
  if (plain && isLikelyPlainImageUrl(plain)) {
    return plain;
  }

  return null;
}

/** True when clipboard types suggest an image we may need async Clipboard API for. */
export function clipboardMayContainImage(
  data: DataTransfer | null
): boolean {
  if (!data) return false;
  const types = Array.from(data.types ?? []);
  if (types.some((type) => type.startsWith("image/"))) return true;
  if (getImageFileFromDataTransfer(data)) return true;
  if (extractClipboardImageUrl(data)) return true;
  return false;
}
